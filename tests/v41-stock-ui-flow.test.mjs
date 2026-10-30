import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyStockV41,applyStockTransactionV41,availableStockV41,availableFreezerV41} from '../stock-engine-v41.mjs';
import {freezerReservationsV41} from '../stock-week-v41.mjs';
import {renderStockV41} from '../stock-ui-v41.mjs';
import {handleStockActionV41} from '../stock-actions-v41.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const style=readFileSync(new URL('../stock-ui-v41.css',import.meta.url),'utf8');
const weekId='2026-10-26';
const ingredients=[{id:'pasta',name:'Pâtes',productId:'pack',store:'carrefour',unit:'g',category:'Pâtes'}];
const products=[{id:'pack',name:'Pâtes 500 g',unit:'paquet',packAmount:500,packUnit:'g',category:'Pâtes',store:'carrefour'}];
const recipes=[
 {id:'pasta-dinner',name:'Pâtes',people:2,ingredients:[{ingredientId:'pasta',productId:'pack',name:'Pâtes',qty:250,unit:'g'}]},
 {id:'pizza',name:'Pizza maison',people:2,ingredients:[]}
];
const mealDishes=m=>m?.type==='recipe'?[{recipeId:m.recipeId,people:m.people}]:
 m?.type==='multi'?m.dishes.filter(x=>x.recipeId&&!x.type):[];
function fixture(stock=null){
 const week={meals:Array(14).fill(null),extras:[],checked:[],excluded:[],pantry:{},generatedIngredients:[]};
 const state={schema:1,recipes,products,ingredientCatalog:ingredients,weeks:{[weekId]:week},stockV41:stock};
 let saved=0,lastMessage='',uid=0,modals=[];
 const inputs={};
 const ctx={
  mode:null,a:{dataset:{}},id:null,index:NaN,
  state,currentWeek:weekId,uid:()=>++uid,
  units:['g','kg','pièce','paquet','boîte'],
  toast:msg=>{lastMessage=String(msg)},persist:()=>{saved++},
  render:()=>{},renderMealContext:()=>{},closeModal:()=>{},
  showModal:(title,body)=>{modals.push({title,body})},
  getWeek:()=>state.weeks[weekId],
  recipeById:id=>recipes.find(x=>x.id===id),mealDishes,
  shopping:()=>state.weeks[weekId].checked.includes('produit:pack|achat')?
   [{id:'produit:pack|achat',name:'Pâtes',productId:'pack',ingredientId:'pasta',
     unit:'paquet',qty:1,checked:true,excluded:false,covered:false,manualExtraIds:['e1']}]:[],
  clearMealWithPair:(w,i)=>{
   w.meals[i]=null;
   for(let j=0;j<w.meals.length;j++)if(w.meals[j]?.type==='leftovers'&&w.meals[j].fromIndex===i)w.meals[j]=null;
  },
  selectRecipeForMeal:(w,i,r,p)=>{w.meals[i]={type:'recipe',recipeId:r,people:p}},
  reconcileLeftovers:()=>{},
  generateWeekCourses:w=>{
   w.generatedIngredients=w.meals.flatMap(m=>mealDishes(m).flatMap(d=>
    recipes.find(r=>r.id===d.recipeId)?.ingredients||[]));
  },
  freezerReservationsV41
 };
 const invoke=(mode,{id=null,index=NaN,dataset={}}={})=>{
  ctx.mode=mode;ctx.id=id;ctx.index=index;ctx.a={dataset};
  return handleStockActionV41(ctx)
 };
 return {ctx,state,week,inputs,invoke,get saved(){return saved},get message(){return lastMessage},modals};
}
function withInputs(inputs){
 globalThis.document={getElementById:id=>id in inputs?{value:String(inputs[id])}:null};
 globalThis.confirm=()=>true;
}

test('Sixième onglet iPhone et actions de stock présents, aucune sortie en production',()=>{
 assert.match(index,/data-tab="stock"/);
 assert.match(index,/repeat\(6, minmax\(0, 1fr\)\)/);
 assert.match(style,/repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(app,/stockModulesV41/);
 const f=fixture();
 const home=renderStockV41({state:f.state,week:f.week,weekId,view:'home',recipeById:f.ctx.recipeById,mealDishes});
 assert.match(home,/Maison/);
 assert.match(home,/Congélateur/);
 assert.match(home,/Cette semaine/);
 assert.match(home,/v41-add-stock/);
 const freezer=renderStockV41({state:f.state,week:f.week,weekId,view:'freezer',recipeById:f.ctx.recipeById,mealDishes});
 assert.match(freezer,/v41-add-frozen/);
});

test('Courses faites crédite seulement les achats cochés et libère la ligne pour de futures courses',()=>{
 const f=fixture();withInputs(f.inputs);
 f.week.extras.push({id:'e1',name:'Pâtes',qty:1,unit:'paquet'});
 f.week.checked=['produit:pack|achat'];
 assert.equal(f.invoke('v41-courses-done'),true);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 assert.equal(f.week.extras.length,0,'l’achat manuel terminé n’est plus une demande en attente');
 assert.equal(f.week.checked.length,0,'la coche ne peut pas créer un second achat');
 const saved=f.saved;
 assert.equal(f.invoke('v41-courses-done'),true);
 assert.equal(f.saved,saved,'aucune écriture lors du deuxième appui');
 f.week.checked=['produit:pack|achat'];
 f.invoke('v41-courses-done');
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),1000,
  'un nouvel achat volontaire du même produit doit rester possible');
});

test('Remplacer chili par pizza retire les restes dépendants, sans déduire le stock',()=>{
 const f=fixture();withInputs({...f.inputs,v41RecipePortions:2});
 f.week.meals[1]={type:'recipe',recipeId:'pasta-dinner',people:4};
 f.week.meals[5]={type:'leftovers',recipeId:'pasta-dinner',fromIndex:1,leftoverPortions:2};
 const before=JSON.stringify(f.state.stockV41);
 f.invoke('v41-replace-recipe',{index:1,id:'pizza'});
 assert.deepEqual(f.week.meals[1],{type:'recipe',recipeId:'pizza',people:2});
 assert.equal(f.week.meals[5],null);
 assert.equal(JSON.stringify(f.state.stockV41),before,'un simple remplacement ne consomme rien');
 assert.equal(f.week.generatedIngredients.length,0);
});

test('C’est mangé prépare les ingrédients une fois puis conserve le statut de repas',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'import',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:1,unit:'paquet',product:products[0]}
 ]}).stock;
 const f=fixture(initial);withInputs(f.inputs);
 f.week.meals[1]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-eat-recipe',{index:1,id:'pasta-dinner'});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),250);
 assert.equal(f.week.v41MealActions['1:pasta-dinner'].status,'eaten');
 const saved=f.saved;
 f.invoke('v41-eat-recipe',{index:1,id:'pasta-dinner'});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),250);
 assert.equal(f.saved,saved);
});

test('Au congélateur retire les ingrédients préparés, mais congèle uniquement les portions choisies',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'import',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:2,unit:'paquet',product:products[0]}
 ]}).stock;
 const f=fixture(initial);withInputs({...f.inputs,v41FreezePortions:2});
 f.week.meals[1]={type:'recipe',recipeId:'pasta-dinner',people:4};
 f.invoke('v41-confirm-freeze-recipe',{index:1,id:'pasta-dinner'});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),2);
 assert.equal(f.week.v41MealActions['1:pasta-dinner'].frozenPortions,2);
 const saved=f.saved;
 f.invoke('v41-confirm-freeze-recipe',{index:1,id:'pasta-dinner'});
 assert.equal(f.saved,saved);
});

test('Repas congelé : réservation sans courses ni décompte, consommation une seule fois',()=>{
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'freezer',movements:[
  {type:'freezer',direction:'add',lotId:'lot-pasta',recipeId:'pasta-dinner',name:'Pâtes',portions:3}
 ]}).stock;
 const f=fixture(stock);withInputs({...f.inputs,v41FrozenMealPortions:2});
 f.invoke('v41-replace-frozen',{index:4,id:'lot-pasta'});
 assert.equal(f.ctx.getWeek().meals[4].type,'frozen');
 assert.equal(f.ctx.getWeek().meals[4].portions,2);
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),3);
 f.invoke('v41-eat-frozen',{index:4});
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),1);
 assert.equal(f.ctx.getWeek().v41MealActions['4:frozen'].status,'eaten');
 const saved=f.saved;
 f.invoke('v41-eat-frozen',{index:4});
 assert.equal(f.saved,saved);
});
