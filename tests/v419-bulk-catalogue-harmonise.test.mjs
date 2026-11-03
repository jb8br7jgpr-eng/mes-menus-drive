import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const stockCss=readFileSync(new URL('../stock-ui-v41.css',import.meta.url),'utf8');
const p=app.indexOf('function catalogueIconV418('),
      q=app.indexOf('function unifiedCatalogueRows()',p);
const start=app.indexOf('function bulkCatalogueItemV419('),
      end=app.indexOf('function openBulkCatalogueV37(',start);
assert.ok(p>0&&q>p&&start>q&&end>start);
const snippets=app.slice(p,q)+'\n'+app.slice(start,end);
const ingredients=[
 {id:'ail',name:'Ail',category:'Autres',store:'grandfrais'},
 {id:'beurre',name:'Beurre',category:'Autres',store:'carrefour',productId:'ref-beurre'},
 {id:'basilic',name:'Basilic surgelé',category:'Autres',store:'carrefour'},
 {id:'poulet',name:'Blanc de poulet',category:'Autres',store:'carrefour'}
];
const products=[
 {id:'ref-beurre',name:'Beurre Carrefour',packAmount:250,packUnit:'g'},
 {id:'pq',name:'Papier toilette',category:'Papier et consommables',unit:'paquet',qty:2,store:'carrefour'},
 {id:'huile',name:'Huile de tournesol',category:'Huiles et vinaigres',unit:'bouteille',qty:1,store:'carrefour',url:'https://www.carrefour.fr/p/123456'}
];
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const units=['g','kg','ml','cl','l','pièce','paquet','boîte','rouleau','bouteille','pot','sachet'];
const selectOptions=(v,w)=>v.map(x=>'<option value="'+html(x)+'" '+(x===w?'selected':'')+'>'+html(x)+'</option>').join('');
const srcFor=(kind,id,options={})=>{
 const item=kind==='ingredient'?ingredients.find(i=>i.id===id):products.find(p=>p.id===id);
 return {kind,id,name:item.name,store:item.store,category:item.category||'Autres',
   frequent:false,qty:kind==='ingredient'?150:1,unit:kind==='ingredient'?'g':item.unit,...options};
};
function makeUI(){
 const state={ingredients:JSON.stringify(ingredients),products:JSON.stringify(products)};
 const env={norm,html,units,selectOptions,
  ingredientById:id=>ingredients.find(x=>x.id===id),
  productById:id=>products.find(x=>x.id===id),
  quantity:(q,u)=>q+' '+u};
 const logic=runInNewContext(snippets+';({catalogueIconV418,catalogueReferenceV418,bulkCatalogueItemV419})',env);
 return {logic,unchanged:()=>state.ingredients===JSON.stringify(ingredients)&&state.products===JSON.stringify(products)};
}
test('V41.9 : Ail et Beurre ont une illustration distincte et une identité magasin cohérente',()=>{
 const {logic}=makeUI();
 const grandfrais=logic.bulkCatalogueItemV419(srcFor('ingredient','ail'));
 const carrefour=logic.bulkCatalogueItemV419(srcFor('ingredient','beurre'));
 assert.match(grandfrais,/🧄/);
 assert.match(grandfrais,/v419-bulk-card--grandfrais/);
 assert.match(grandfrais,/v418-store-badge--grandfrais/);
 assert.match(grandfrais,/🥬<\/span> Grand Frais/);
 assert.match(grandfrais,/v418-reference-badge--grandfrais/);
 assert.match(grandfrais,/Liste Grand Frais/);
 assert.doesNotMatch(grandfrais,/Référence à associer/);
 assert.match(carrefour,/🧈/);
 assert.match(carrefour,/v419-bulk-card--carrefour/);
 assert.match(carrefour,/v418-store-badge--carrefour/);
 assert.match(carrefour,/🛒<\/span> Carrefour Drive/);
 assert.match(carrefour,/v418-reference-badge--linked/);
 assert.match(carrefour,/Référence associée/);
 assert.match(carrefour,/Beurre Carrefour · 250 g/);
});
test('V41.9 : référence Carrefour manquante visible, sans bloquer les cases à cocher',()=>{
 const {logic}=makeUI();
 const basilic=logic.bulkCatalogueItemV419(srcFor('ingredient','basilic'));
 assert.match(basilic,/🌿/);
 assert.match(basilic,/v418-reference-badge--missing/);
 assert.match(basilic,/Référence à associer/);
 assert.match(basilic,/data-v37-select/);
 assert.match(basilic,/data-v37-qty/);
 assert.match(basilic,/data-v37-unit/);
 assert.match(basilic,/data-action="v37-qty-minus"/);
 assert.match(basilic,/data-action="v37-qty-plus"/);
});
test('V41.9 : achats quotidiens avec ou sans lien Carrefour sont distingués',()=>{
 const {logic}=makeUI();
 const pq=logic.bulkCatalogueItemV419(srcFor('daily','pq'));
 const huile=logic.bulkCatalogueItemV419(srcFor('daily','huile'));
 assert.match(pq,/🧻/);
 assert.match(pq,/Lien Carrefour à renseigner/);
 assert.match(pq,/v418-reference-badge--missing/);
 assert.match(huile,/🫒/);
 assert.match(huile,/Lien Carrefour enregistré/);
 assert.match(huile,/v418-reference-badge--linked/);
});
test('V41.9 : nombre de contrôles, identifiants et quantités inchangés',()=>{
 const {logic,unchanged}=makeUI();
 const x=srcFor('ingredient','poulet',{qty:250,unit:'g',frequent:true});
 const markup=logic.bulkCatalogueItemV419(x,true);
 assert.equal((markup.match(/data-v37-select/g)||[]).length,1);
 assert.equal((markup.match(/data-v37-qty/g)||[]).length,1);
 assert.equal((markup.match(/data-v37-unit/g)||[]).length,1);
 assert.equal((markup.match(/data-v37-row/g)||[]).length,1);
 assert.match(markup,/data-kind="ingredient" data-id="poulet"/);
 assert.match(markup,/data-search="blanc de poulet"/);
 assert.match(markup,/data-frequent="true"/);
 assert.match(markup,/value="250" aria-label="Quantité/);
 assert.match(markup,/<option value="g" selected>/);
 assert.match(markup,/Déjà dans les courses/);
 assert.match(markup,/🍗/);
 assert.ok(unchanged(),'aucun changement aux ingrédients ni produits persistants');
});
test('V41.9 : les lignes sont identiques pour le stock et les courses, actions distinctes conservées',()=>{
 const from=app.indexOf('function openBulkCatalogueV37(');
 const to=app.indexOf('function filterBulkV37()',from);
 const opener=app.slice(from,to);
 assert.match(opener,/bulkCatalogueItemV419\(x,matched\)/);
 assert.match(opener,/data-bulk-target=/);
 assert.match(opener,/stockMode\?'stock':'courses'/);
 assert.match(opener,/stockMode\?'v41-bulk-stock-add':'v37-bulk-add'/);
 assert.match(opener,/!stockMode&&existing\.some/);
 assert.match(opener,/filterBulkV37\(\)/);
 assert.match(app,/function commitBulkV37\(\)/);
 assert.match(app,/function readBulkStockV414\(\)/);
 assert.match(app,/function stepBulkV37\(\w+,\w+\)/);
 assert.match(stockCss,/\.modal\.v37-bulk-modal\.v414-one-scroll/);
});
test('V41.9 : styles mobiles, couleurs et statut conservés sans double défilement',()=>{
 for(const name of ['.v419-bulk-card--grandfrais','.v419-bulk-card--carrefour',
  '.v419-bulk-icon','.v419-bulk-badges','.v419-bulk-reference',
  '.v419-bulk-category','.v419-already-in-courses'])
  assert.ok(style.includes(name),name);
 assert.match(style,/@media\(max-width:380px\)/);
 assert.match(style,/\.v419-bulk-card:has\(\[data-v37-select\]:checked\)/);
 const part=style.slice(style.indexOf('/* V41.9'));
 assert.doesNotMatch(part,/max-height:\d+dvh|overflow-y:scroll|overflow-y:auto/);
 assert.ok(stockCss.includes('overflow:visible!important'),'défilement unique conservé');
});
test('V41.9 : les caractères du catalogue restent échappés dans le sélecteur',()=>{
 const {logic}=makeUI();
 const x=srcFor('ingredient','ail',{name:'Ail <script>alert(1)</script>',id:'<x&"'});
 const rendered=logic.bulkCatalogueItemV419(x,false);
 assert.ok(rendered.includes('Ail &lt;script&gt;'));
 assert.ok(rendered.includes('data-id="&lt;x&amp;&quot;"'));
 assert.ok(!rendered.includes('<script>'));
});
