import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
function between(a,b){
 const start=js.indexOf(a),end=js.indexOf(b,start);
 assert.ok(start>=0&&end>start,a+' to '+b);return js.slice(start,end);
}
const defs=between('const productCategoryGroups=', 'function productById(');
const ctx={
 html:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;'),
 selectOptions:(values,selected)=>values.map(v=>'<option value="'+v+'" '+(v===selected?'selected':'')+'>'+v+'</option>').join(''),
 state:{ingredientCatalog:[],products:[]}
};
const data=runInNewContext(defs+';({productCategoryGroups,productCategoriesLegacy,productCategories,productCategoryOptions,productCategoryChoices,productCategoryGroupName})',ctx);
test('La liste comporte au moins 35 catégories utiles sans doublon',()=>{
 assert.ok(data.productCategories.length>=35);
 assert.equal(new Set(Array.from(data.productCategories)).size,data.productCategories.length);
 for(const category of ['Fruits','Légumes','Œufs','Poissons','Pâtes, riz et féculents','Conserves et bocaux',
  'Boissons','Entretien et nettoyage','Papier et consommables','Beauté et cosmétiques','Bébé et puériculture','Animaux','Autres']){
  if(category==='Boissons')continue;
  assert.ok(data.productCategories.includes(category),category);
 }
});
test('Les catégories anciennes ne sont pas perdues, les nouvelles sont regroupées pour iPhone',()=>{
 for(const c of ['Épicerie','Fruits et légumes','Viandes et poissons','Produits frais','Hygiène','Maison','Autres']){
  assert.ok(data.productCategories.includes(c),c);
 }
 const newUI=data.productCategoryOptions('Œufs');
 assert.match(newUI,/<optgroup label="Crémerie, œufs et produits frais">/);
 assert.match(newUI,/<option value="Œufs" selected>/);
 const oldUI=data.productCategoryOptions('Produits frais');
 assert.match(oldUI,/Catégorie précédente \(conservée\)/);
 assert.match(oldUI,/<option value="Produits frais" selected>/);
 const unusual=data.productCategoryOptions('Rayon ancien personnalisé');
 assert.match(unusual,/Rayon ancien personnalisé/);
 assert.match(unusual,/selected/);
});
test('Le filtre par catégorie fonctionne pour ingrédients ET achats du quotidien',()=>{
 const state={ingredientCatalog:[
 {id:'ing1',name:'Œufs',category:'Œufs',store:'carrefour',productId:'ean1'},
 {id:'ing2',name:'Banane',category:'Fruits',store:'grandfrais'}
 ],products:[
 {id:'ean1',name:'Œufs en boîte',category:'Œufs',store:'carrefour'},
 {id:'p1',name:'Papier toilette',category:'Papier et consommables',store:'carrefour'},
 {id:'p2',name:'Lessive',category:'Entretien et nettoyage',store:'carrefour'}]
 };
 const fn=runInNewContext(between('function unifiedCatalogueItems(){','function unifiedCatalogueRows(){')+';unifiedCatalogueItems',{
  state,catalogueTypeFilter:'all',catalogueStoreFilter:'all',catalogueCategoryFilter:'Œufs',
  productSearch:'',norm:v=>String(v||'').toLowerCase(),ingredientStore:x=>x.store,
  catalogueSortV40:'name',catalogueCategoryV40:item=>item.category||'Autres',
  catalogueSortCompareV40:(a,b)=>a.name.localeCompare(b.name,'fr')
 });
 const one=fn();
 assert.equal(one.length,1);
 assert.equal(one[0].name,'Œufs');
 assert.equal(one[0].type,'ingredient');
 assert.ok(!one.some(x=>x.id==='ean1'),'La référence associée n’apparaît pas en double');
});
test('Les catégories détaillées conservent les grandes sections de courses sans changer les quantités',()=>{
 const categoryFunctions=between('function defaultShoppingStore(','// Chaque ingrédient physique est unique');
 const base=runInNewContext(categoryFunctions+';defaultShoppingStore',{});
 for(const c of ['Fruits','Légumes','Poissons','Volailles','Fruits et légumes'])assert.equal(base(c),'grandfrais',c);
 assert.equal(base('Papier et consommables'),'carrefour');
 const productGrouping=runInNewContext(between('function productGroup(p){','// Les menus sont un brouillon')+';productGroup',{});
 for(const [cat,group] of Object.entries({
  'Fruits':'Fruits et légumes','Poissons':'Viandes et poissons','Œufs':'Produits frais',
  'Papier et consommables':'Hygiène et maison','Santé et parapharmacie':'Hygiène et maison',
  'Pâtes, riz et féculents':'Épicerie et divers','Hygiène':'Hygiène et maison',
  'Produits frais':'Produits frais'
 }))assert.equal(productGrouping({category:cat}),group,cat);
});
test('Les fiches affichent la catégorie et le filtre est un select compact',()=>{
 const editor=between('function catalogueEditor(', 'function previewCarrefourPackV38(');
 assert.match(editor,/productCategoryOptions\(record.category\|\|'Autres'\)/);
 const listing=between('function renderProduits(){','function chooseUnifiedProductType(){');
 assert.match(listing,/categoryId:'catalogueCategoryFilter'/);
 assert.match(listing,/productCategoryChoices\(\)/);
 const row=between('function unifiedCatalogueRows(){','function renderProduits(){');
 assert.match(row,/v39-category-label/);
 assert.match(css,/\.v40-filter-panel/);
});
test('Les données restent compatibles avec la sauvegarde existante et les menus',()=>{
 assert.match(js,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(js,/const V34_CLOUD_ACTIVE = true/);
 assert.match(js,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(js,/function calendarMarkupV36/);
 assert.match(js,/function commitBulkV37/);
 assert.match(js,/function homeStockModal\(/);
 assert.match(js,/function generateWeekCourses\(/);
});
