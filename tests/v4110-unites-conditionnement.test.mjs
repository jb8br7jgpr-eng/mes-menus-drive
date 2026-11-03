import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const unitsCode=app.slice(app.indexOf('const units='),app.indexOf('const baseState='));
const unitInfo=runInNewContext(unitsCode+';({units,contentUnits})');
const units=Array.from(unitInfo.units),contentUnits=Array.from(unitInfo.contentUnits);
const editor=app.slice(app.indexOf('function catalogueEditor('),app.indexOf('function previewCarrefourPackV38('));
const recipe=app.slice(app.indexOf('function ingredientRow('),app.indexOf('// V41.7',app.indexOf('function ingredientRow(')));
const shopCode=app.slice(app.indexOf('function shopping(){'),app.indexOf('function clearWeekShopping(',app.indexOf('function shopping(){')));

test('V41.10 : contenu des produits et ingrédients de recettes ont exactement les mêmes unités',()=>{
 const expected=['g','kg','ml','cl','l','pièce','paquet','boîte','rouleau','bouteille','pot','sachet'];
 assert.deepEqual(units,expected);
 assert.deepEqual(contentUnits,expected);
 assert.equal(new Set(contentUnits).size,expected.length);
 assert.match(recipe,/selectOptions\(units,item\.unit\)/);
 assert.match(editor,/selectOptions\(units,suggestedUnit\)/,'unités achetées existantes préservées');
 assert.match(editor,/selectOptions\(contentUnits,record\.packUnit\|\|'pièce'\)/,'contenu et anciennes valeurs conservés');
 assert.match(editor,/Unité du contenu/);
 assert.match(editor,/une boîte contenant 2 paquets de jambon/);
 assert.match(app,/contentUnits\.includes\(packUnit\)/,'validation enregistrement suit les unités partagées');
 assert.match(app,/contentUnits\.includes\(contentUnit\)/,'aperçu suit les unités partagées');
});

function shoppingFor({needed,neededUnit,purchaseUnit,packAmount,packUnit}){
 const product={id:'ref-jambon',name:'Jambon',store:'carrefour',
  category:'Charcuterie',unit:purchaseUnit,packAmount,packUnit};
 const ingredient={id:'ing-jambon',name:'Jambon',store:'carrefour',productId:product.id};
 const week={generatedIngredients:[{name:'Jambon',qty:needed,unit:neededUnit,ingredientId:ingredient.id,
  productId:product.id}],extras:[],pantry:{},checked:[],excluded:[]};
 const ctx={
  getWeek:()=>week,
  productById:id=>id===product.id?product:null,
  ingredientById:id=>id===ingredient.id?ingredient:null,
  ingredientStore:()=> 'carrefour',
  converted:(q,u)=>u==='kg'?[Number(q)*1000,'g']:u==='l'?[Number(q)*1000,'ml']:
   u==='cl'?[Number(q)*10,'ml']:[Number(q)||0,u||'pièce'],
  norm:v=>String(v).toLowerCase(),quantity:(v,u)=>v+' '+u,
  productGroup:()=> 'Viandes et poissons',groupFor:()=> 'Viandes et poissons',
  shoppingStore:()=> 'carrefour'
 };
 const shop=runInNewContext(shopCode+';shopping',ctx);
 return {product,ingredient,items:shop()};
}

test('V41.10 : recette 1 paquet de jambon = achat 1 paquet, si contenu déclaré',()=>{
 const {items}=shoppingFor({needed:1,neededUnit:'paquet',purchaseUnit:'paquet',packAmount:1,packUnit:'paquet'});
 assert.equal(items.length,1);
 assert.equal(items[0].qty,1);
 assert.equal(items[0].unit,'paquet');
 assert.equal(items[0].grossNeeded,'1 paquet');
});
test('V41.10 : recette 3 paquets de jambon avec boîte de 2 paquets = achat 2 boîtes',()=>{
 const {items}=shoppingFor({needed:3,neededUnit:'paquet',purchaseUnit:'boîte',packAmount:2,packUnit:'paquet'});
 assert.equal(items.length,1);
 assert.equal(items[0].qty,2);
 assert.equal(items[0].unit,'boîte');
 assert.equal(items[0].grossNeeded,'3 paquet');
 assert.equal(items[0].packageDescription,'2 paquet');
});
test('V41.10 : recettes existantes en pièces et emballages existants fonctionnent',()=>{
 const {items}=shoppingFor({needed:7,neededUnit:'pièce',purchaseUnit:'boîte',packAmount:6,packUnit:'pièce'});
 assert.equal(items.length,1);
 assert.equal(items[0].qty,2);
 assert.equal(items[0].unit,'boîte');
});
test('V41.10 : pas de fausse conversion g ↔ ml ou paquet ↔ grammes',()=>{
 const {items}=shoppingFor({needed:180,neededUnit:'g',purchaseUnit:'paquet',packAmount:1,packUnit:'paquet'});
 assert.equal(items.length,1);
 assert.equal(items[0].qty,180);
 assert.equal(items[0].unit,'g');
});
test('V41.10 : synchronisation et structure des produits inchangées',()=>{
 assert.match(app,/const V34_CLOUD_ACTIVE = true/);
 assert.match(app,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(app,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(app,/packUnit:packAmount\?packUnit:null,frequent/);
});
