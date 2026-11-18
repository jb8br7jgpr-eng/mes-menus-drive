import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const between=(a,b)=>{
 const i=app.indexOf(a),j=app.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,a+' manquant');
 return app.slice(i,j);
};
const guidance=between('function driveConditioningHelpV41222(', 'function driveTransferRows(){');
const drive=between('function driveTransferRows(){','function driveTransferLines(){');
const shopping=between('function shopping(){','function clearWeekShopping(');
const ean=between('function carrefourEanV41221(','function carrefourCandidateKeyV41221(');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const converted=(q,u)=>u==='kg'?[Number(q)*1000,'g']:u==='l'?[Number(q)*1000,'ml']:
 u==='cl'?[Number(q)*10,'ml']:[Number(q)||0,u||'pièce'];
const quantity=(q,u)=>q+' '+u;
const html=s=>String(s).replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));
function fixture(){
 const p={id:'p-cordon',name:'Cordons bleus',ean:'3560070123456',
  store:'carrefour',unit:'paquet',packAmount:null,packUnit:null};
 const ingredient={id:'i-cordon',name:'Cordon bleu',productId:p.id,store:'carrefour'};
 const week={generatedIngredients:[{name:ingredient.name,qty:2,unit:'pièce',
  productId:p.id,ingredientId:ingredient.id}],extras:[],pantry:{},
  checked:[],excluded:[]};
 const state={products:[p],ingredientCatalog:[ingredient],weeks:{}};
 const env={state,norm,converted,quantity,html,getWeek:()=>week,
  productById:id=>state.products.find(x=>x.id===id),
  ingredientById:id=>state.ingredientCatalog.find(x=>x.id===id),
  ingredientStore:()=> 'carrefour',productGroup:()=> 'Viandes et poissons',
  groupFor:()=> 'Viandes et poissons',shoppingStore:()=> 'carrefour'};
 const code=ean+shopping+guidance+drive+';({shopping,driveTransferRows,driveConditioningHelpV41222,fixDriveItemV41222})';
 return {p,week,state,env,api:runInNewContext(code,env)};
}
test('Sans contenu renseigné, un besoin de 2 pièces ne se transforme pas arbitrairement en paquet',()=>{
 const {api}=fixture();
 const list=api.shopping(),drive=api.driveTransferRows();
 assert.equal(list.length,1);
 assert.equal(list[0].name,'Cordon bleu');
 assert.equal(list[0].qty,2);
 assert.equal(list[0].unit,'pièce');
 assert.equal(drive[0].ready,false);
 assert.match(drive[0].reason,/unité incompatible/);
});
test('Contenu réel 2 pièces par paquet : 2 pièces deviennent automatiquement 1 paquet prêt pour le panier',()=>{
 const f=fixture();
 f.p.packAmount=2;f.p.packUnit='pièce';
 const list=f.api.shopping(),drive=f.api.driveTransferRows();
 assert.equal(list.length,1);
 assert.equal(list[0].qty,1);
 assert.equal(list[0].unit,'paquet');
 assert.equal(list[0].productId,f.p.id);
 assert.equal(drive[0].ean,f.p.ean);
 assert.equal(drive[0].ready,true);
});
test('Avec 5 pièces dans des paquets réels de 2, calcul arrondi au colis entier : 3 paquets',()=>{
 const f=fixture();
 f.week.generatedIngredients[0].qty=5;
 f.p.packAmount=2;f.p.packUnit='pièce';
 assert.equal(f.api.shopping()[0].qty,3);
 assert.equal(f.api.driveTransferRows()[0].ready,true);
});
test('Le bouton Compléter explique la conversion et ouvre la fiche, sans changer les données',()=>{
 const f=fixture();
 const markup={html:'',opened:false};
 const form={insertAdjacentHTML(_where,content){markup.html=content},
  querySelector(){return {setAttribute(){markup.opened=true}}}};
 const opened=[];let writes=0;
 Object.assign(f.env,{$:selector=>selector==='#catalogueEditorForm'?form:null,
  productEditor:id=>opened.push(id),ingredientEditor:id=>opened.push('ing:'+id),
  persist:()=>{writes++}});
 const before=JSON.stringify(f.state)+JSON.stringify(f.week);
 assert.equal(f.api.fixDriveItemV41222('ingredient:i-cordon|pièce'),true);
 assert.deepEqual(opened,['p-cordon']);
 assert.match(markup.html,/liste de courses demande/);
 assert.match(markup.html,/2 pièce/);
 assert.match(markup.html,/paquet/);
 assert.match(markup.html,/Contenu d’une unité achetée/);
 assert.match(markup.html,/2 pièces/);
 assert.equal(markup.opened,true);
 assert.equal(writes,0);
 assert.equal(JSON.stringify(f.state)+JSON.stringify(f.week),before);
});
test('Badge référence enregistré = code-barres seulement, pas promesse de panier prêt',()=>{
 const catalogue=between('function catalogueReferenceV418(','function unifiedCatalogueRows(){');
 assert.match(catalogue,/label:'EAN Carrefour enregistré'/);
 assert.doesNotMatch(catalogue,/label:'Référence Carrefour prête'/);
 assert.match(app,/else if\(mode==='fix-drive-item'\)fixDriveItemV41222\(id\)/);
 assert.match(css,/\.v41222-drive-help/);
 assert.doesNotThrow(()=>new Function(app));
});
