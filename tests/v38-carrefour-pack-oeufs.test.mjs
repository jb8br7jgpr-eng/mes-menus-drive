import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('function shopping(){');
const stop=source.indexOf('function clearWeekShopping(',start);
assert.ok(start>0&&stop>start);
const shoppingCode=source.slice(start,stop);

function calculate(required,boxSize,hasPack=true){
 const product={id:'carrefour-oeufs',name:'Œufs en boîte',store:'carrefour',
  category:'Produits frais',unit:'boîte',packAmount:hasPack?boxSize:null,
  packUnit:hasPack?'pièce':null,ean:'1234567890123'};
 const ingredient={id:'oeufs',name:'Œufs',store:'carrefour',productId:product.id};
 const week={generatedIngredients:[{name:'Œufs',qty:required,unit:'pièce',
  productId:product.id,ingredientId:ingredient.id}],extras:[],pantry:{},
  checked:[],excluded:[]};
 const ctx={
  getWeek:()=>week,productById:id=>id===product.id?product:null,
  ingredientById:id=>id===ingredient.id?ingredient:null,
  ingredientStore:()=> 'carrefour',
  converted:(q,u)=>u==='kg'?[q*1000,'g']:u==='l'?[q*1000,'ml']:u==='cl'?[q*10,'ml']:[Number(q)||0,u||'pièce'],
  norm:s=>String(s).toLowerCase(),quantity:(n,u)=>n+' '+u,
  productGroup:()=> 'Produits frais',groupFor:()=> 'Produits frais',
  shoppingStore:()=> 'carrefour'
 };
 const calc=runInNewContext(shoppingCode+';shopping',ctx);
 return {items:calc(),week,product};
}

test('4 œufs pour une boîte de 6 = 1 boîte à acheter',()=>{
 const {items}=calculate(4,6);assert.equal(items.length,1);
 assert.equal(items[0].qty,1);assert.equal(items[0].unit,'boîte');
 assert.equal(items[0].grossNeeded,'4 pièce');
});
test('4 œufs pour une boîte de 12 = 1 boîte à acheter',()=>{
 const {items}=calculate(4,12);assert.equal(items[0].qty,1);
 assert.equal(items[0].unit,'boîte');
});
test('14 œufs pour boîtes de 6 = 3 boîtes ; de 12 = 2 boîtes',()=>{
 assert.equal(calculate(14,6).items[0].qty,3);
 assert.equal(calculate(14,12).items[0].qty,2);
});
test('Sans conditionnement déclaré, aucune conversion trompeuse en boîtes',()=>{
 const {items}=calculate(4,0,false);
 assert.equal(items.length,1);assert.equal(items[0].qty,4);
 assert.equal(items[0].unit,'pièce');
});
test('L’interface sépare unité achetée, contenu Carrefour et quantité préremplie',()=>{
 const at=source.indexOf('function catalogueEditor('),end=source.indexOf('function previewCarrefourPackV38(',at);
 const editor=source.slice(at,end);
 assert.ok(editor.includes('Unité achetée (boîte, paquet, bouteille'));
 assert.ok(editor.includes('Contenu d’une unité achetée'));
 assert.ok(editor.includes('Quantité proposée aux courses'));
 assert.ok(editor.includes('Un lien Carrefour ne suffit pas'));
 assert.ok(editor.includes('previewCarrefourPackV38()'));
 const a=source.indexOf('function shoppingRow('),b=source.indexOf('function editShoppingItemModal(',a);
 assert.ok(source.slice(a,b).includes("1 '+(p.unit||'paquet')+' = "));
 assert.ok(editor.includes('cataloguePackAmount'));
});
test('La sérialisation et la connexion serveur restent inchangées',()=>{
 assert.ok(source.includes('const V34_CLOUD_ACTIVE = true'));
 assert.ok(source.includes('v34CloudRuntime.commitLocalModification(snapshot)'));
 assert.ok(source.includes('const baseState=()=>({schema:1'));
});
