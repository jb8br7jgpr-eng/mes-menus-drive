import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const script=readFileSync(new URL('../scripts/carrefour-diagnostic.user.js',import.meta.url),'utf8');
function slice(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Zone de code non trouvée : '+start);
 return source.slice(a,b)
}
function speedrive(rows){
 const code=slice(app,'function driveTransferLines(){','function isIosHomeScreenApp(){');
 return runInNewContext(code+
  ';({driveTransferLines,driveTransferText,driveTransferLegacyText,driveDirectUrl})',
  {driveTransferRows:()=>rows,encodeURIComponent});
}
const validate=runInNewContext(
 slice(script,'function validateTransfer(raw){','function renderPreview(data){')+';validateTransfer',{});
function dataRows(data){return Array.from(data.rows,row=>({ean:row.ean,qty:row.qty,name:row.name}))}

test('V41.13.2 : Speedrive transfère les noms saisis, sans changer les EAN ni quantités',()=>{
 const api=speedrive([
  {ean:'3270190010000',qty:2,name:'Moutarde de Dijon',ready:true},
  {ean:'3560070012345',qty:1,name:'Blanc de poulet',ready:true},
  {ean:'3560070012345',qty:2,name:'Blanc de poulet',ready:true},
  {ean:'7777777777777',qty:1,name:'Non prêt',ready:false}
 ]);
 assert.deepEqual(Array.from(api.driveTransferLines(),x=>({...x})),[
  {ean:'3270190010000',qty:2,name:'Moutarde de Dijon'},
  {ean:'3560070012345',qty:3,name:'Blanc de poulet'}
 ]);
 const text=api.driveTransferText();
 assert.match(text,/3270190010000 2 \| Moutarde de Dijon/);
 assert.match(text,/3560070012345 3 \| Blanc de poulet/);
 assert.doesNotMatch(text,/Non prêt/);
 assert.equal(api.driveTransferLegacyText(),'3270190010000 2\n3560070012345 3');
 assert.deepEqual(dataRows(validate(text)),[
  {ean:'3270190010000',qty:2,name:'Moutarde de Dijon'},
  {ean:'3560070012345',qty:3,name:'Blanc de poulet'}
 ]);
});

test('V41.13.2 : transfert direct V2 vers Safari sans nouvelle API panier',()=>{
 const api=speedrive([{ean:'3270190010000',qty:2,name:'Crème fraîche épaisse',ready:true}]);
 const url=api.driveDirectUrl();
 assert.match(url,/^https:\/\/www\.carrefour\.fr\/#md-drive-v2=/);
 const text=decodeURIComponent(url.split('#md-drive-v2=')[1]);
 assert.deepEqual(dataRows(validate(text)),[
  {ean:'3270190010000',qty:2,name:'Crème fraîche épaisse'}
 ]);
});

test('V41.13.2 : liste longue repasse en protocole V1 pour préserver le panier',()=>{
 const rows=Array.from({length:32},(_,i)=>({
  ean:String(3000000000000+i),qty:1,ready:true,
  name:'Article '+i+' '+('A'.repeat(100))
 }));
 const api=speedrive(rows);
 assert.ok(encodeURIComponent(api.driveTransferText()).length>2900);
 const url=api.driveDirectUrl();
 assert.match(url,/#md-drive-v1=/);
 const oldText=decodeURIComponent(url.split('#md-drive-v1=')[1]);
 assert.equal(oldText,api.driveTransferLegacyText());
 assert.equal(validate(oldText).rows.length,32);
});

test('V41.13.2 : le script Userscripts lit également les anciennes listes EAN uniquement',()=>{
 assert.deepEqual(dataRows(validate('3270190010000 2\n3560070012345 1')),[
  {ean:'3270190010000',qty:2,name:''},
  {ean:'3560070012345',qty:1,name:''}
 ]);
 assert.match(script,/#md-drive-v2=/);
 assert.match(script,/#md-drive-v1=/);
});

test('V41.13.2 : refus des données malformées, des caractères de contrôle et des quantités excessives',()=>{
 for(const input of ['3270190010000 deux | Moutarde','abc 2 | Moutarde',
   '3270190010000 0 | Moutarde','3270190010000 5 | Moutarde\n3270190010000 999 | Moutarde']){
  assert.throws(()=>validate(input));
 }
 const api=speedrive([{ean:'3270190010000',qty:1,name:'Moutarde\n| forte',ready:true}]);
 assert.equal(api.driveTransferText(),'3270190010000 1 | Moutarde forte');
});

test('V41.13.2 : doublons EAN regroupés dans Userscripts en préservant le nom non vide',()=>{
 assert.deepEqual(dataRows(validate('3270190010000 2\n3270190010000 3 | Moutarde de Dijon')),[
  {ean:'3270190010000',qty:5,name:'Moutarde de Dijon'}
 ]);
});

test('V41.13.2 : le bilan affiche le nom Speedrive en priorité même si Carrefour ne reconnaît pas le code',()=>{
 const summary={hidden:true,children:[],replaceChildren(...children){this.children=children;}};
 const document={createElement(tag){return {
  tag,className:'',textContent:'',style:{},children:[],
  append(...nodes){this.children.push(...nodes);}
 }}};
 const ctx={document,cartSummary:summary,
  previewRows:[{ean:'3270190010000',qty:2,name:'Moutarde de Dijon'}],
  cartOutcomes:[{ean:'3270190010000',kind:'missing',reason:'Référence introuvable sur Carrefour'}]};
 const show=runInNewContext(slice(script,'function showCartSummary(note=\'\'){',
  'const shopWarning=')+';showCartSummary',ctx);
 show();
 const values=[];
 function visit(node){if(node?.textContent)values.push(node.textContent);for(const child of node?.children||[])visit(child)}
 for(const node of summary.children)visit(node);
 assert.ok(values.includes('Moutarde de Dijon'),'Le nom Speedrive doit être présenté en premier');
 assert.ok(values.some(t=>t.includes('Référence introuvable sur Carrefour')));
 assert.ok(!values.includes('Référence 3270190010000'),'Ne pas montrer un EAN comme seul titre');
 assert.ok(values.some(t=>t.includes('EAN 3270190010000')),'EAN conservé en détail');
});

test('V41.13.2 : le script Userscripts reste en mise à jour officielle et sans changement du PATCH panier',()=>{
 assert.match(script,/@version\s+0\.10\.0/);
 assert.match(script,/@updateURL\s+https:\/\/raw\.githubusercontent\.com\/jb8br7jgpr-eng\/mes-menus-drive\/developpement-v1\/scripts\/carrefour-diagnostic\.user\.js/);
 assert.match(script,/method:'PATCH',credentials:'same-origin'/);
 assert.match(script,/body:JSON\.stringify\(\{items:\[\{basketServiceId:sid,counter:target,ean,subBasketType:'drive_clcv'\}\]\}\)/);
 assert.match(script,/const prefix=\['#md-drive-v2=','#md-drive-v1='\]/);
 assert.match(script,/expected\?\.name\|\|item\.name\|\|'Référence '/);
});
