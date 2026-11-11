// V41.18 — scenarios de bout en bout sans acces au cloud et sans mutation des donnees reelles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {emptyStockV41,applyStockTransactionV41,availableStockV41} from '../stock-engine-v41.mjs';
import {shoppingShortfallsV41,purchasedMovementsV41} from '../stock-week-v41.mjs';
import {handleStockActionV41} from '../stock-actions-v41.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../stock-ui-v41.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const html=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
const units=['pièce','g','kg','paquet','boîte','ml','l'];
const ingredients=[
 {id:'tomates',name:'Tomates Grand Frais',store:'grandfrais',category:'Fruits et légumes',unit:'pièce'},
 {id:'riz',name:'Riz',store:'carrefour',productId:'riz-500g',category:'Épicerie',unit:'g'}
];
const products=[
 {id:'riz-500g',name:'Riz',store:'carrefour',unit:'paquet',packAmount:500,packUnit:'g'},
 {id:'cordons',name:'Cordons-bleus',store:'carrefour',unit:'paquet',packAmount:4,packUnit:'pièce'}
];
const byIng=id=>ingredients.find(x=>x.id===id);
const byProd=id=>products.find(x=>x.id===id);
const snippet=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'bloc introuvable '+start);return app.slice(a,b)};
const parsedProducts=runInNewContext(snippet('function mealProductsV412(', '// V41.17 — compatibilite')+';mealProductsV412',{units});
const week=meal=>({meals:[meal,...Array(13).fill(null)],v41MealActions:{},extras:[],checked:[],excluded:[]});
const catalogue=()=>[
 {type:'ingredient',id:'tomates',name:'Tomates Grand Frais',store:'grandfrais',item:ingredients[0]},
 {type:'ingredient',id:'riz',name:'Riz',store:'carrefour',item:ingredients[1]},
 {type:'daily',id:'cordons',name:'Cordons-bleus',store:'carrefour',item:products[1]}
];

test('V41.18 : les produits anciens et les ingredients Grand Frais sont lus sans perte',()=>{
 const old={type:'products',products:[{productId:'cordons',qty:2,unit:'pièce'}]};
 const newer={type:'products',products:[{ingredientId:'tomates',productId:null,qty:2,unit:'pièce'}]};
 assert.equal(parsedProducts(old)[0].productId,'cordons');
 assert.equal(parsedProducts(newer)[0].ingredientId,'tomates');
 assert.equal(parsedProducts(newer)[0].qty,2);
 assert.equal(old.products[0].ingredientId,undefined,'schema precedent non modifie');
});

test('V41.18 : le selecteur propose Grand Frais sans creer de produit Carrefour',()=>{
 const chosen=parsedProducts({products:[{productId:'cordons',qty:2,unit:'pièce'}]});
 const ctx={getWeek:()=>week({products:chosen}),mealProductsV412:parsedProducts,productById:byProd,
  unifiedCatalogueSourceV4114:catalogue,norm,html,recipeMatchKeyV4116:norm};
 const chooser=runInNewContext(snippet('function mealProductPickerResultsV412(', 'function openMealProductPickerV412(')+
  ';mealProductPickerResultsV412',ctx);
 const result=chooser(0);
 assert.match(result,/Tomates Grand Frais/);
 assert.match(result,/data-kind="ingredient" data-id="tomates"/);
 assert.doesNotMatch(result,/data-id="cordons"/,'deja au repas : non duplique');
 assert.equal(products.length,2,'aucune fiche commerciale creee');
});

test('V41.18 : les courses recoivent le bon ingredient sans fiche commerciale',()=>{
 const state={ingredientCatalog:ingredients,products,recipes:[]};
 const collect=runInNewContext(snippet('function collectRecipeIngredients(', 'function menuGenerationSignature(')+
  ';collectRecipeIngredients',{state,recipeById:()=>null,mealDishes:()=>[],mealProductsV412:parsedProducts,
  mealProductRefV4118:x=>x.ingredientId?'ingredient:'+x.ingredientId:String(x.productId||''),
  mealProductInfoV4118:x=>{const ingredient=byIng(x.ingredientId),product=byProd(x.productId);
   return {ingredient,product,name:ingredient?.name||product?.name};},productById:byProd});
 const w=week({type:'products',products:[{ingredientId:'tomates',productId:null,qty:2,unit:'pièce'}]});
 const result=collect(w);
 assert.equal(result.length,1);
 assert.equal(result[0].ingredientId,'tomates');
 assert.equal(result[0].productId,null);
 assert.equal(result[0].qty,2);
 assert.equal(result[0].sourceKind,'meal-product','source distincte des ingrédients de recette');
 assert.equal(w.generatedIngredients,undefined,'la generation doit rester explicite');
});

test('V41.18 : consommation Grand Frais puis annulation restaurent exactement le stock',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'stock-initial',movements:[{
  type:'inventory',direction:'add',identity:'ingredient:tomates',name:'Tomates Grand Frais',
  store:'grandfrais',amount:3,unit:'pièce'
 }]}).stock;
 const w=week({type:'products',products:[{ingredientId:'tomates',productId:null,qty:2,unit:'pièce'}]});
 const state={stockV41:initial,weeks:{'2026-11-14':w},ingredientCatalog:ingredients,products,recipes:[]};
 let saves=0,serial=0,lastToast='';
 const ctx={mode:'v41-eat-product',id:'ingredient:tomates',index:0,a:{dataset:{}},
  state,currentWeek:'2026-11-14',units,uid:()=>String(++serial),
  getWeek:()=>w,mealProductsV412:parsedProducts,mealDishes:()=>[],mealLeftovers:()=>[],
  shopping:()=>[],persist:()=>saves++,render:()=>{},closeModal:()=>{},toast:x=>lastToast=String(x),
  generateWeekCourses:()=>{},showModal:()=>{}};
 const previous=globalThis.confirm;globalThis.confirm=()=>true;
 try{
  assert.equal(handleStockActionV41(ctx),true);
  assert.equal(availableStockV41(state.stockV41,'ingredient:tomates','pièce'),1);
  assert.equal(w.v41MealActions['0:product:ingredient:tomates'].status,'eaten');
  assert.equal(saves,1);
  assert.equal(handleStockActionV41(ctx),true);
  assert.equal(saves,1,'la deuxieme validation ne doit pas rededuire');
  ctx.mode='v41-undo-validation';ctx.a={dataset:{kind:'product'}};
  assert.equal(handleStockActionV41(ctx),true);
  assert.equal(availableStockV41(state.stockV41,'ingredient:tomates','pièce'),3);
  assert.equal(w.v41MealActions['0:product:ingredient:tomates'],undefined);
  assert.equal(saves,2);
 }finally{
  if(previous===undefined)delete globalThis.confirm;else globalThis.confirm=previous;
 }
});

test('V41.18 : enregistrement partiel des achats Grand Frais ne valide pas Carrefour',()=>{
 const rows=[
  {id:'gf',ingredientId:'tomates',name:'Tomates Grand Frais',qty:2,unit:'pièce',checked:true,excluded:false,covered:false},
  {id:'cf',productId:'cordons',name:'Cordons-bleus',qty:1,unit:'paquet',checked:false,excluded:false,covered:false}
 ];
 const result=purchasedMovementsV41(rows,ingredients,products);
 assert.equal(result.movements.length,1);
 assert.equal(result.movements[0].identity,'ingredient:tomates');
 assert.equal(result.movements[0].store,'grandfrais');
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'achats-gf',movements:result.movements}).stock;
 assert.equal(availableStockV41(stock,'ingredient:tomates','pièce'),2);
 assert.equal(availableStockV41(stock,'product:cordons','pièce'),0);
});

test('V41.18 : les quatre sources, quantites et nouveau flux achats restent presentes',()=>{
 assert.match(app,/function mealComposerSelectedV4118/);
 for(const kind of ['recipes','leftovers','frozen','products'])
  assert.match(app,new RegExp('data-kind="'+kind+'"'));
 assert.match(app,/v4118-current-meal/);
 assert.match(app,/v412ProductQty/);
 assert.match(app,/menuShoppingChangesV4118/);
 assert.match(app,/Mettre à jour ma liste/);
 assert.match(app,/Enregistrer mes achats/);
 assert.match(app,/x\.sourceKind==='meal-product'\?'Repas':'Recettes'/);
 assert.doesNotMatch(app,/Enregistrer uniquement les articles cochés/);
 assert.match(ui,/ingredient\.ingredientId|product\.ingredientId/);
 assert.match(index,/41-20-flow/);
 assert.match(sw,/41-20-flow/);
 assert.doesNotThrow(()=>new Function(app));
});

test('V41.18 : emballage de 4 articles mais seulement 2 consommes, stock coherent',()=>{
 const bought=purchasedMovementsV41([{id:'c',name:'Cordons-bleus',productId:'cordons',
  qty:1,unit:'paquet',checked:true,excluded:false,covered:false}],ingredients,products);
 assert.equal(bought.movements.length,1);
 assert.equal(bought.movements[0].unit,'pièce');
 assert.equal(bought.movements[0].amount,4);
 const afterPurchase=applyStockTransactionV41(emptyStockV41(),{id:'purchase-pack',movements:bought.movements}).stock;
 const needs=shoppingShortfallsV41([{name:'Cordons-bleus',productId:'cordons',qty:2,unit:'pièce'}],
  afterPurchase,ingredients,products);
 assert.equal(needs[0].gross,2);
 assert.equal(needs[0].toBuy,0,'ne pas acheter un autre paquet');
 const consumed=applyStockTransactionV41(afterPurchase,{id:'eat-two',movements:[{
  type:'inventory',direction:'consume',identity:'product:cordons',name:'Cordons-bleus',
  amount:2,unit:'pièce'
 }]}).stock;
 assert.equal(availableStockV41(consumed,'product:cordons','pièce'),2);
});

test('V41.18 : le stock maison est deduit des besoins Grand Frais sans faux Carrefour',()=>{
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'tomates-maison',movements:[{
  type:'inventory',direction:'add',identity:'ingredient:tomates',name:'Tomates Grand Frais',
  amount:2,unit:'pièce',store:'grandfrais'
 }]}).stock;
 const needs=shoppingShortfallsV41([{name:'Tomates Grand Frais',ingredientId:'tomates',
  qty:3,unit:'pièce',productId:null}],stock,ingredients,products);
 assert.equal(needs.length,1);
 assert.equal(needs[0].identity,'ingredient:tomates');
 assert.equal(needs[0].gross,3);
 assert.equal(needs[0].available,2);
 assert.equal(needs[0].toBuy,1);
});

test('V41.18 : apercu des menus ne modifie pas les courses deja generees',()=>{
 const generated=[{name:'Tomates Grand Frais',ingredientId:'tomates',productId:null,qty:2,unit:'pièce'}];
 const w={generatedIngredients:generated,meals:Array(14).fill(null)};
 const result=runInNewContext(snippet('function menuShoppingChangesV4118(', 'function courseGenerationBanner(')+
  ';menuShoppingChangesV4118',{
    collectRecipeIngredients:()=>[{name:'Tomates Grand Frais',ingredientId:'tomates',
      productId:null,qty:3,unit:'pièce'}],
    converted:(qty,unit)=>[qty,unit],
    ingredientById:byIng,productById:byProd,
    ingredientStore:x=>x.store,norm
  })(w);
 assert.equal(result.length,1);
 assert.equal(result[0].name,'Tomates Grand Frais');
 assert.equal(result[0].delta,1);
 assert.equal(result[0].store,'grandfrais');
 assert.equal(w.generatedIngredients,generated,'liste originale intacte');
 assert.equal(w.generatedIngredients[0].qty,2);
});
