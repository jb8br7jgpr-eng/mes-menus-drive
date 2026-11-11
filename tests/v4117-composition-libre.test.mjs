import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {emptyStockV41,applyStockTransactionV41,availableFreezerV41} from '../stock-engine-v41.mjs';
import {mealFrozenPartsV4117,addFrozenToMealV4117,freezerReservationsV41,
 remainingFreezerPortionsV41,repeatWeekMealsV41} from '../stock-week-v41.mjs';
import {handleStockActionV41} from '../stock-actions-v41.mjs';
import {renderStockV41} from '../stock-ui-v41.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('fr');
const weekId='2026-11-07';
const makeStock=()=>applyStockTransactionV41(emptyStockV41(),{
 id:'initial-freezer',movements:[
  {type:'freezer',direction:'add',lotId:'chili',recipeId:'rc',name:'Chili',portions:1},
  {type:'freezer',direction:'add',lotId:'soupe',recipeId:'rs',name:'Soupe',portions:1}
 ]}).stock;
const makeWeeks=meal=>({[weekId]:{meals:[meal,...Array(13).fill(null)],v41MealActions:{},checked:[],extras:[],excluded:[]}});

test('Deux plats congeles differents cohabitent, chacun une portion reservee',()=>{
 const stock=makeStock();let weeks=makeWeeks(null);
 weeks=addFrozenToMealV4117(weeks,stock,weekId,0,'chili',1);
 weeks=addFrozenToMealV4117(weeks,stock,weekId,0,'soupe',1);
 assert.deepEqual(mealFrozenPartsV4117(weeks[weekId].meals[0]).map(x=>[x.lotId,x.portions]),
  [['chili',1],['soupe',1]]);
 assert.deepEqual(freezerReservationsV41(weeks),{chili:1,soupe:1});
 assert.equal(remainingFreezerPortionsV41(stock,weeks,'chili'),0);
 assert.equal(remainingFreezerPortionsV41(stock,weeks,'soupe'),0);
 assert.equal(availableFreezerV41(stock,'rc'),1,'planifier ne consomme pas');
 assert.throws(()=>addFrozenToMealV4117(weeks,stock,weekId,1,'chili',1),/Pas assez/);
 assert.throws(()=>addFrozenToMealV4117(weeks,stock,weekId,0,'chili',1),/déjà présent/);
});

test('Repas existant : recette, restes, produits et deux congelés conservés',()=>{
 const original={type:'multi',dishes:[
  {recipeId:'ratatouille',people:2},
  {type:'leftovers',recipeId:'riz',fromIndex:0,people:1}
 ],products:[{productId:'cordons',qty:2,unit:'pièce'}],guests:2};
 let weeks=makeWeeks(original);const stock=makeStock();
 weeks=addFrozenToMealV4117(weeks,stock,weekId,0,'chili',1);
 weeks=addFrozenToMealV4117(weeks,stock,weekId,0,'soupe',1);
 const current=weeks[weekId].meals[0];
 assert.equal(current.type,'multi');
 assert.deepEqual(current.dishes,original.dishes);
 assert.deepEqual(current.products,original.products);
 assert.equal(current.guests,2);
 assert.equal(current.frozen.length,2);
 assert.deepEqual(original,{type:'multi',dishes:[
  {recipeId:'ratatouille',people:2},
  {type:'leftovers',recipeId:'riz',fromIndex:0,people:1}
 ],products:[{productId:'cordons',qty:2,unit:'pièce'}],guests:2});
});

test('Ancien repas congelé conservé si on ajoute un deuxième lot',()=>{
 const stock=makeStock(),weeks=makeWeeks({type:'frozen',lotId:'chili',recipeId:'rc',portions:1});
 const out=addFrozenToMealV4117(weeks,stock,weekId,0,'soupe',1);
 assert.equal(out[weekId].meals[0].type,'composed');
 assert.deepEqual(out[weekId].meals[0].frozen.map(x=>x.lotId),['chili','soupe']);
 assert.equal(weeks[weekId].meals[0].type,'frozen','aucune mutation de la source');
});

test('Une seule portion consommée ne supprime pas la réservation de la deuxième',()=>{
 const stock=makeStock();let weeks=makeWeeks(null);
 weeks=addFrozenToMealV4117(weeks,stock,weekId,0,'chili',1);
 weeks=addFrozenToMealV4117(weeks,stock,weekId,0,'soupe',1);
 const state={stockV41:stock,weeks,products:[],ingredientCatalog:[],recipes:[]};
 let saved=0,msg='',n=0;const oldConfirm=globalThis.confirm;
 globalThis.confirm=()=>true;
 const ctx={
  mode:'v41-eat-frozen-part',a:{dataset:{}},id:'chili',index:0,state,currentWeek:weekId,
  uid:()=>String(++n),units:['pièce'],toast:x=>{msg=String(x)},persist:()=>{saved++},
  render:()=>{},renderMealContext:()=>{},closeModal:()=>{},showModal:()=>{},
  getWeek:()=>state.weeks[weekId],freezerReservationsV41,
  recipeById:()=>null,mealDishes:()=>[],mealLeftovers:()=>[],mealProductsV412:()=>[],shopping:()=>[]
 };
 try{
  assert.equal(handleStockActionV41(ctx),true);
  assert.equal(state.weeks[weekId].meals[0].frozen[0].consumed,true);
  assert.equal(availableFreezerV41(state.stockV41,'rc'),0);
  assert.equal(availableFreezerV41(state.stockV41,'rs'),1);
  assert.deepEqual(freezerReservationsV41(state.weeks),{soupe:1});
  assert.equal(handleStockActionV41(ctx),true);
  assert.equal(saved,1,'double validation impossible');
  ctx.id='soupe';handleStockActionV41(ctx);
  assert.equal(availableFreezerV41(state.stockV41,'rs'),0);
  assert.equal(saved,2);
  ctx.mode='v41-undo-validation';ctx.id='chili';ctx.a={dataset:{kind:'frozen-part'}};
  handleStockActionV41(ctx);
  assert.equal(availableFreezerV41(state.stockV41,'rc'),1);
  assert.equal(state.weeks[weekId].meals[0].frozen[0].consumed,undefined);
  assert.equal(saved,3);
 }finally{if(oldConfirm===undefined)delete globalThis.confirm;else globalThis.confirm=oldConfirm}
});

test('La copie de semaine ne double pas les portions congélées indisponibles',()=>{
 const stock=makeStock();let weeks=makeWeeks(null);
 weeks=addFrozenToMealV4117(weeks,stock,weekId,0,'chili',1);
 weeks['2026-11-14']={meals:Array(14).fill(null),v41MealActions:{}};
 const out=repeatWeekMealsV41(weeks,stock,weekId,'2026-11-14');
 assert.equal(out.skippedFrozen,1);
 assert.equal(out.weeks['2026-11-14'].meals[0],null);
});

test('Seules les fiches visibles du catalogue sont suggérées, aucun doublon Blanc de poulet',()=>{
 const state={ingredientCatalog:[{id:'i1',name:'Blanc de poulet',productId:'p1'}],products:[
  {id:'p1',name:'Blanc de poulet',showInCatalogue:true},
  {id:'p2',name:'Blanc de poulet'},{id:'p3',name:'Lait entier'}]};
 const a=app.indexOf('function recipeMatchKeyV4116('),b=app.indexOf('function preferredIngredientUnit(',a);
 const src=app.slice(a,b);
 const api=runInNewContext(src+';recipeSuggestionsV4116',{state,norm,
  unifiedCatalogueSourceV4114:()=>[
   {type:'ingredient',item:state.ingredientCatalog[0]},
   {type:'daily',item:state.products[0]},
   {type:'daily',item:state.products[1]},
   {type:'daily',item:state.products[2]}
  ]});
 const found=api('blanc poulet');
 assert.equal(found.length,1);
 assert.equal(found[0].item.id,'i1');
 assert.ok(api('lait').some(x=>x.item.id==='p3'));
});

test('UI : quatre onglets persistants, produit non redirigé, actions et scroll',()=>{
 assert.doesNotThrow(()=>new Function(app));
 assert.match(app,/const modes=\['recipes','leftovers','frozen','products'\]/);
 const a=app.indexOf("function openMealPickerV4116("),b=app.indexOf('function pickMeal(',a);
 const picker=app.slice(a,b);
 assert.doesNotMatch(picker,/if\(kind==='products'\)\{openMealProductPickerV412/);
 assert.match(picker,/data-action="v4117-add-frozen"/);
 assert.match(picker,/data-action="apply-leftovers"/);
 assert.match(picker,/v412ProductResults/);
 assert.match(app,/mode==='v4117-remove-frozen'/);
 assert.match(app,/v41-eat-frozen-part/);
 assert.match(styles,/\.v4117-composer-tabs/);
});
