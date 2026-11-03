import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const start=app.indexOf('function catalogueIconV418(');
const end=app.indexOf('function renderProduits()',start);
assert.ok(start>0&&end>start,'fonctions catalogue V41.8 présentes');
const source=app.slice(start,end);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[ch]);
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();

function makeUI(items,products=[]){
 const original=JSON.stringify({items,products});
 const env={
  norm,html:escapeHtml,
  quantity:(num,unit)=>num+' '+unit,
  unifiedCatalogueItems:()=>items,
  productById:id=>products.find(p=>p.id===id),
 };
 const ui=runInNewContext(source+
  ';({catalogueIconV418,catalogueReferenceV418,unifiedCatalogueRows})',env);
 return {ui,original,unchanged:()=>JSON.stringify({items,products})===original};
}
const sample=[
 {type:'ingredient',id:'ail',name:'Ail',category:'Autres',store:'grandfrais',item:{name:'Ail'}},
 {type:'ingredient',id:'avocat',name:'Avocats',category:'Autres',store:'grandfrais',item:{name:'Avocats'}},
 {type:'ingredient',id:'basilic',name:'Basilic surgelé',category:'Autres',store:'carrefour',item:{name:'Basilic surgelé',productId:null}},
 {type:'ingredient',id:'beurre',name:'Beurre',category:'Autres',store:'carrefour',item:{name:'Beurre',productId:'p-beurre'}},
 {type:'ingredient',id:'poulet',name:'Blanc de poulet',category:'Autres',store:'carrefour',item:{name:'Blanc de poulet',productId:null}},
 {type:'ingredient',id:'boeuf',name:'Boeuf',category:'Autres',store:'grandfrais',item:{name:'Boeuf'}}
];
const products=[
 {id:'p-beurre',name:'Beurre doux',packAmount:250,packUnit:'g',url:''},
 {id:'p-lessive',name:'Lessive',category:'Entretien et nettoyage',store:'carrefour',url:''},
 {id:'p-sopalin',name:'Sopalin',category:'Papier et consommables',store:'carrefour',url:'https://www.carrefour.fr/p/123'},
];
test('V41.8 : différentes icônes pour les ingrédients historiques Autres',()=>{
 const {ui}=makeUI(sample,products);
 for(const [name,expected] of [
  ['Ail','🧄'],['Avocats','🥑'],['Basilic surgelé','🌿'],['Beurre','🧈'],
  ['Blanc de poulet','🍗'],['Boeuf','🥩'],['Bœuf','🥩'],
  ['Tomates','🍅'],['Courgettes','🥒'],['Œufs','🥚'],
  ['Pâtes','🍝'],['Crème fraîche','🥛'],['Papier toilette','🧻']
 ])assert.equal(ui.catalogueIconV418(name,'Autres'),expected,name);
 assert.equal(ui.catalogueIconV418('Produit sans nom connu','Surgelés'),'🧊');
 assert.equal(ui.catalogueIconV418('Produit sans nom connu','Papier et consommables'),'🧻');
 assert.equal(ui.catalogueIconV418('Produit sans nom connu','Autres'),'🛍️');
});

test('V41.8 : magasin Grand Frais — sans faux avertissement de référence Carrefour',()=>{
 const {ui}=makeUI(sample,products);
 const status=ui.catalogueReferenceV418(sample[0],null);
 assert.equal(status.kind,'grandfrais');
 assert.equal(status.label,'Liste Grand Frais');
 assert.match(status.detail,/Aucune référence Carrefour nécessaire/);
 const html=ui.unifiedCatalogueRows();
 assert.match(html,/v418-card--grandfrais/);
 assert.match(html,/v418-store-badge--grandfrais/);
 assert.match(html,/v418-reference-badge--grandfrais/);
 assert.match(html,/🥬<\/span> Grand Frais/);
});

test('V41.8 : ingrédients Carrefour — référence liée ou réellement absente',()=>{
 const {ui}=makeUI(sample,products);
 const linked=ui.catalogueReferenceV418(sample[3],products[0]);
 assert.equal(linked.kind,'linked');
 assert.equal(linked.label,'Référence associée');
 assert.match(linked.detail,/Beurre doux · 250 g/);
 const absent=ui.catalogueReferenceV418(sample[2],null);
 assert.equal(absent.kind,'missing');
 assert.equal(absent.label,'Référence à associer');
 assert.doesNotMatch(absent.detail,/associée/);
 const markup=ui.unifiedCatalogueRows();
 assert.match(markup,/v418-reference-badge--missing/);
 assert.match(markup,/v418-reference-badge--linked/);
 assert.match(markup,/🛒<\/span> Carrefour Drive/);
});

test('V41.8 : achat quotidien — lien réel et absence de lien ne sont pas confondus',()=>{
 const linked={type:'daily',id:'p-sopalin',name:'Sopalin',category:'Papier et consommables',store:'carrefour',item:products[2]};
 const unlinked={type:'daily',id:'p-lessive',name:'Lessive',category:'Entretien et nettoyage',store:'carrefour',item:products[1]};
 const {ui}=makeUI([linked,unlinked],products);
 assert.deepEqual(
  {kind:ui.catalogueReferenceV418(linked,products[2]).kind,label:ui.catalogueReferenceV418(linked,products[2]).label},
  {kind:'linked',label:'Lien Carrefour enregistré'}
 );
 assert.equal(ui.catalogueReferenceV418(unlinked,products[1]).label,'Lien Carrefour à renseigner');
 const html=ui.unifiedCatalogueRows();
 assert.match(html,/data-action="edit-unified-product" data-kind="daily"/);
 assert.match(html,/data-action="add-unified-courses" data-kind="daily"/);
});

test('V41.8 : catalogue non modifié, boutons et compte toujours présents',()=>{
 const {ui,unchanged}=makeUI(sample,products);
 const html=ui.unifiedCatalogueRows();
 assert.equal((html.match(/class="catalogue-unified-card v418-card /g)||[]).length,sample.length);
 assert.equal((html.match(/data-action="add-unified-courses"/g)||[]).length,sample.length);
 assert.equal((html.match(/data-action="edit-unified-product"/g)||[]).length,sample.length);
 assert.equal((html.match(/v418-store-badge--/g)||[]).length,sample.length);
 assert.equal((html.match(/v418-reference-badge--/g)||[]).length,sample.length);
 assert.ok(unchanged(),'rendu en lecture seule');
 assert.match(app,/out\+='<div class="section-head"><h2>Votre catalogue<\/h2><span class="pill" id="catalogueCount">/);
 assert.match(app,/function refreshCatalogueV40\(\)/);
 const visualLogic=source.slice(0,source.indexOf('function unifiedCatalogueRows()'));
 assert.doesNotMatch(visualLogic,/\bpersist\s*\(/);
 assert.doesNotMatch(visualLogic,/\bstate\.(?:products|ingredientCatalog)\s*=/);
});

test('V41.8 : échappement HTML des titres, détails et identifiants',()=>{
 const fake={type:'ingredient',id:'X<&',name:'Test <b>&',store:'carrefour',category:'Autres',item:{productId:'p',name:'Test <b>&'}};
 const p={id:'p',name:'Marque <script>alert(1)</script>',packAmount:1,packUnit:'kg'};
 const html=makeUI([fake],[p]).ui.unifiedCatalogueRows();
 assert.ok(html.includes('Test &lt;b&gt;&amp;'));
 assert.ok(html.includes('data-id="X&lt;&amp;"'));
 assert.ok(!html.includes('<script>'));
});

test('V41.8 : styles mobiles et contrastes différenciés sans scroll interne',()=>{
 for(const cls of [
  '.catalogue-unified-card.v418-card','.v418-card--grandfrais',
  '.v418-card--carrefour','.v418-store-badge--grandfrais',
  '.v418-store-badge--carrefour','.v418-reference-badge--linked',
  '.v418-reference-badge--missing','.v418-reference-badge--grandfrais'
 ])assert.ok(styles.includes(cls),'classe absente '+cls);
 assert.match(styles,/@media\(max-width:370px\)/);
 assert.match(styles,/\.v418-card \.v418-card-meta|\.v418-card \.v418-product-name/);
 assert.doesNotMatch(styles.slice(styles.indexOf('/* V41.8')),/overflow-y:scroll|max-height:\d+dvh/);
});
