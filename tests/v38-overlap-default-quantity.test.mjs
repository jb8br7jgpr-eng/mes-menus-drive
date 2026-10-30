import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
function between(start,end){
 const a=js.indexOf('function '+start+'('),b=js.indexOf('function '+end+'(',a);
 assert.ok(a>=0&&b>a,start+' to '+end);return js.slice(a,b)
}
test('Les cartes du sélecteur ne peuvent pas rétrécir et dépasser leurs contrôles',()=>{
 assert.match(css,/\.v37-bulk-modal\s+\.v37-bulk-list\s*\{[^}]*flex:0 0 auto/);
 assert.match(css,/\.v37-bulk-modal\s+\.v37-bulk-item\s*\{[^}]*flex:0 0 auto/);
 assert.match(css,/\.v37-bulk-modal\s+\.v37-bulk-item\s*\{[^}]*height:auto/);
 assert.match(css,/\.v37-bulk-modal\s+\.v37-bulk-amount\s*\{[^}]*flex:0 0 auto/);
 assert.match(css,/\.v37-bulk-modal\s+\.v37-bulk-footer\s*\{[^}]*bottom:0/);
 assert.match(css,/overscroll-behavior:contain/);
});
test('La quantité habituelle est remplacée par une quantité proposée, facultative à ajuster',()=>{
 const editor=between('catalogueEditor','previewCourseQuantityV38');
 assert.doesNotMatch(editor,/Quantité habituelle/);
 assert.match(editor,/Quantité proposée aux courses/);
 assert.match(editor,/Facultatif · toucher pour modifier/);
 assert.match(editor,/Quantité pré-remplie/);
 assert.match(editor,/ni les quantités des recettes, ni le stock maison, ni le contenu des paquets Carrefour/);
 assert.match(css,/\.v38-course-defaults/);
 const bulk=between('openBulkCatalogueV37','filterBulkV37');
 assert.match(bulk,/simples propositions/);
 assert.match(bulk,/data-v37-qty/);
 assert.match(bulk,/data-v37-unit/);
});
test('Une quantité et une unité déjà définies sont respectées dans les achats multiples',()=>{
 const state={ingredientCatalog:[
  {id:'a',name:'Ail',store:'grandfrais',unit:'pièce',qty:3},
  {id:'b',name:'Cannelle',store:'carrefour',qty:undefined}],
  products:[],recipes:[{ingredients:[{ingredientId:'b',name:'Cannelle',unit:'g',qty:10}]}],
  storePreferences:{}};
 const code=between('bulkCatalogueV37','bulkPurchaseExtraV37');
 const run=runInNewContext(code+';bulkCatalogueV37',{
  state,norm:s=>String(s).toLowerCase(),ingredientStore:x=>x.store,
  preferredIngredientUnit:x=>x.id==='b'?'g':'pièce',
  units:['pièce','g','kg','paquet']
 });
 const items=run();
 const ail=items.find(x=>x.id==='a'),cannelle=items.find(x=>x.id==='b');
 assert.equal(ail.qty,3);assert.equal(ail.unit,'pièce');
 assert.equal(cannelle.qty,10);assert.equal(cannelle.unit,'g');
});
test('Les recettes, historiques, Firebase et sauvegardes sont conservés',()=>{
 assert.match(js,/const V34_CLOUD_ACTIVE = true/);
 assert.match(js,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(js,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(js,/function calendarMarkupV36/);
 assert.match(js,/function commitBulkV37/);
 assert.match(js,/function generateWeekCourses/);
});
