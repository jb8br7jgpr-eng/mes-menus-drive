import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('const productCategoryGroups=');
const end=source.indexOf('function productById(',begin);
assert.ok(begin>=0 && end>begin);
const definitions=source.slice(begin,end);
const html=v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;');
const state={
 ingredientCatalog:[{id:'oeufs',name:'Œufs',category:'Autres',store:'carrefour'}],
 products:[{id:'papier',name:'Sopalin',category:'Autres',store:'carrefour'}]
};
const ctx={state,html,selectOptions:(xs,selected)=>xs.map(x=>
 '<option value="'+html(x)+'" '+(x===selected?'selected':'')+'>'+html(x)+'</option>').join('')};
const m=runInNewContext(definitions+
 ';({productCategories,productCategoryChoices,catalogueCategoryOptionsV40})',ctx);

test('Les 40 catégories sont proposées même quand toutes les fiches sont classées Autres',()=>{
 const values=Array.from(m.productCategoryChoices());
 assert.ok(values.length>=40);
 for(const cat of ['Fruits','Œufs','Poissons','Épices et assaisonnements',
  'Papier et consommables','Surgelés','Bébé et puériculture','Animaux','Autres'])
  assert.ok(values.includes(cat),cat);
 assert.equal(values.filter(x=>x==='Autres').length,1);
 const htmlOptions=m.catalogueCategoryOptionsV40(values);
 assert.match(htmlOptions,/<option value="Œufs"/);
 assert.match(htmlOptions,/<option value="Papier et consommables"/);
 assert.match(htmlOptions,/<option value="Autres"/);
});
test('La catégorie d’une ancienne fiche personnalisée reste proposée sans migration',()=>{
 const before=JSON.stringify(state);
 state.products.push({id:'ancien',name:'Ancien produit',category:'Rayon spécifique'});
 assert.ok(Array.from(m.productCategoryChoices()).includes('Rayon spécifique'));
 state.products.pop();
 assert.equal(JSON.stringify(state),before);
});
test('Les deux filtres proposent la liste commune de catégories',()=>{
 const products=source.slice(source.indexOf('function renderProduits(){'),
  source.indexOf('function chooseUnifiedProductType(){'));
 const bulk=source.slice(source.indexOf('function openBulkCatalogueV37('),
  source.indexOf('function filterBulkV37(){'));
 assert.match(products,/categories:productCategoryChoices\(\)/);
 assert.match(bulk,/const categories=productCategoryChoices\(\)/);
});
test('La connexion Firebase et le modèle de données restent inchangés',()=>{
 assert.match(source,/const V34_CLOUD_ACTIVE = true/);
 assert.match(source,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(source,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
});
