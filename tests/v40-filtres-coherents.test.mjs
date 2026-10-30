import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
function fragment(start,end){
 const a=js.indexOf(start),b=js.indexOf(end,a);
 assert.ok(a>=0&&b>a,start+' → '+end);return js.slice(a,b)
}
const state={
 ingredientCatalog:[{id:'ing-oeuf',name:'Œufs',store:'carrefour',category:'Œufs',productId:'boite',qty:4,unit:'pièce'},
 {id:'ing-banane',name:'Bananes',store:'grandfrais',category:'Fruits',qty:2,unit:'pièce'},
 {id:'ing-piment',name:'Piment',store:'carrefour',category:'Épices et assaisonnements',frequent:true,qty:3,unit:'g'}],
 products:[{id:'boite',name:'Boîte de 6 œufs',store:'carrefour',category:'Œufs',unit:'boîte',qty:1},
 {id:'p1',name:'Papier toilette',store:'carrefour',category:'Papier et consommables',frequent:true,qty:2,unit:'paquet'},
 {id:'p2',name:'Litière',store:'grandfrais',category:'Animaux',qty:1,unit:'paquet'}],
 storePreferences:{},recipes:[]};
const html=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;');
const helpers=runInNewContext(fragment('const catalogueSortChoicesV40=', 'function productById(')+
 ';({catalogueCategoryV40,catalogueSortCompareV40,catalogueFiltersV40,catalogueStoreLabelV40})',{
 state,html,selectOptions:(values,selected)=>values.map(v=>
 '<option value="'+html(v)+'" '+(v===selected?'selected':'')+'>'+html(v)+'</option>').join(''),
 productById:id=>state.products.find(p=>p.id===id)
});
test('Les mêmes champs apparaissent dans Produits et dans Ajout des courses',()=>{
 const common={searchId:'v37BulkSearch',storeId:'v40BulkStore',
  categoryId:'v40BulkCategory',sortId:'v40BulkSort',categories:['Œufs','Fruits']};
 const modal=helpers.catalogueFiltersV40(common);
 const catalogue=helpers.catalogueFiltersV40({...common,searchId:'productSearch',
  storeId:'catalogueStoreSelectV40',categoryId:'catalogueCategoryFilter',sortId:'catalogueSortV40'});
 for(const name of ['Rechercher un article','Magasin','Catégorie','Trier par','Carrefour Drive','Grand Frais',
  'Toutes les catégories','Nom : A → Z','Catégorie : A → Z','Magasin : Carrefour / Grand Frais']){
  assert.ok(modal.includes(name),name);assert.ok(catalogue.includes(name),name);
 }
 assert.ok(modal.indexOf('id="v37BulkSearch"')<modal.indexOf('id="v40BulkStore"'));
 assert.ok(modal.indexOf('id="v40BulkStore"')<modal.indexOf('id="v40BulkCategory"'));
 assert.ok(!modal.includes('id="v37BulkFilter"'),'ancien filtre mélangeant magasin et favoris supprimé');
 assert.match(modal,/data-action="v40-reset-filters" data-context="courses"/);
 assert.match(catalogue,/data-action="v40-reset-filters" data-context="produits"/);
 assert.match(js,/mode==='v40-reset-filters'/);
 assert.match(css,/\.v40-filter-search\{width:100%/);
 assert.match(css,/grid-template-columns:76px minmax\(0,1fr\)/);
 assert.match(css,/@media\(min-width:660px\)/);
});
test('Les catégories et magasins se trient réellement dans les deux endroits',()=>{
 const x=[{name:'Bananes',store:'grandfrais',category:'Fruits'},
  {name:'Œufs',store:'carrefour',category:'Œufs'},
  {name:'Ail',store:'carrefour',category:'Fruits'},
  {name:'Lessive',store:'carrefour',category:'Entretien et nettoyage'}];
 const ordered=(sort)=>x.slice().sort((a,b)=>helpers.catalogueSortCompareV40(a,b,sort)).map(y=>y.name);
 assert.deepEqual(ordered('name'),['Ail','Bananes','Lessive','Œufs']);
 assert.deepEqual(ordered('category'),['Lessive','Ail','Bananes','Œufs']);
 assert.deepEqual(ordered('store'),['Ail','Lessive','Œufs','Bananes']);
});
test('Un ingrédient lié peut utiliser une catégorie précise de sa référence sans changer les données',()=>{
 const ingredient={id:'ing',name:'Œufs',category:'Autres'};
 const original=JSON.stringify(ingredient);
 assert.equal(helpers.catalogueCategoryV40(ingredient,'boite'),'Œufs');
 assert.equal(helpers.catalogueCategoryV40({category:'Épices et assaisonnements'},'boite'),'Épices et assaisonnements');
 assert.equal(JSON.stringify(ingredient),original);
});
test('Filtrer par magasin/catégorie/favoris conserve les autres sélections et quantités',()=>{
 const entries=[
  {dataset:{store:'carrefour',category:'Œufs',name:'Œufs',kind:'ingredient',search:'oeufs',frequent:'false'},hidden:false,qty:4,selected:true},
  {dataset:{store:'grandfrais',category:'Fruits',name:'Bananes',kind:'ingredient',search:'bananes',frequent:'false'},hidden:false,qty:2,selected:false},
  {dataset:{store:'carrefour',category:'Papier et consommables',name:'Papier toilette',kind:'daily',search:'papier toilette',frequent:'true'},hidden:false,qty:3,selected:true}
 ];
 const controls={
  v37BulkSearch:{value:''},v40BulkStore:{value:'carrefour'},v40BulkCategory:{value:'all'},
  v40BulkSort:{value:'category'},v40BulkFrequent:{checked:false},
  v37BulkVisible:{textContent:''},v37BulkSubmit:{disabled:true,textContent:''},
  v37BulkStatus:{textContent:''}
 };
 const list={entries:entries.slice(),querySelectorAll:()=>list.entries.slice(),appendChild(row){
  this.entries=this.entries.filter(x=>x!==row);this.entries.push(row)
 }};
 const modalRoot={
  querySelector:()=>list,
  querySelectorAll:()=>entries.filter(x=>x.selected).map(()=>({}))
 };
 const code=fragment('function filterBulkV37(){','function stepBulkV37(');
 const filter=runInNewContext(code+';filterBulkV37',{
  modalRoot,norm:v=>String(v||'').toLowerCase(),
  $:key=>controls[key.slice(1)]||null,catalogueSortCompareV40:helpers.catalogueSortCompareV40
 });
 filter();
 assert.deepEqual(entries.map(x=>x.hidden),[false,true,false]);
 assert.equal(controls.v37BulkVisible.textContent,'2 résultats');
 assert.match(controls.v37BulkSubmit.textContent,/Ajouter 2 articles/);
 controls.v40BulkStore.value='grandfrais';
 controls.v40BulkCategory.value='Fruits';
 filter();
 assert.deepEqual(entries.map(x=>x.hidden),[true,false,true]);
 assert.equal(entries[0].qty,4);assert.equal(entries[2].qty,3);
 assert.equal(entries[0].selected,true);assert.equal(entries[2].selected,true);
 assert.equal(controls.v37BulkStatus.textContent,'2 articles sélectionnés');
 controls.v40BulkStore.value='all';controls.v40BulkCategory.value='all';
 controls.v40BulkFrequent.checked=true;filter();
 assert.deepEqual(entries.map(x=>x.hidden),[true,true,false]);
});
test('Catégories V39, stock V38, achats V37 et Firebase conservés',()=>{
 assert.match(js,/const productCategoryGroups=/);
 assert.match(js,/function homeStockModal\(/);
 assert.match(js,/function commitBulkV37\(/);
 assert.match(js,/const V34_CLOUD_ACTIVE = true/);
 assert.match(js,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(js,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 const bulk=fragment('function openBulkCatalogueV37','function updateBulkV37');
 assert.match(bulk,/data-category/);
 assert.match(bulk,/v40BulkCategory/);
 assert.match(bulk,/v40BulkFrequent/);
 assert.match(bulk,/v37-bulk-add/);
});
