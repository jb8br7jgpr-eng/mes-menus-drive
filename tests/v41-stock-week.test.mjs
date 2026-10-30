import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStockV41,applyStockTransactionV41} from '../stock-engine-v41.mjs';
import {kitchenMovementsV41,shoppingShortfallsV41,planFrozenMealV41,
  remainingFreezerPortionsV41,freezerReservationsV41,purchasedMovementsV41,repeatWeekMealsV41} from '../stock-week-v41.mjs';
const ing=[{id:'pasta',name:'Pâtes',productId:'pack',store:'carrefour'}];
const products=[{id:'pack',name:'Pâtes 500g',unit:'paquet',packAmount:500,packUnit:'g'}];
const recipe={id:'pates',people:2,ingredients:[{name:'Pâtes',ingredientId:'pasta',qty:300,unit:'g'}]};
const start=applyStockTransactionV41(emptyStockV41(),{id:'initial',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:1,unit:'paquet',product:products[0]}
]}).stock;

test('Repas : préparer 4 portions retire 600 g et refuse les recettes non identifiées',()=>{
 const moves=kitchenMovementsV41(recipe,4,ing,products);
 assert.equal(moves[0].identity,'ingredient:pasta');
 assert.equal(moves[0].amount,600);
 assert.throws(()=>applyStockTransactionV41(start,{id:'eat',movements:moves}),/Stock insuffisant/);
 assert.throws(()=>kitchenMovementsV41({...recipe,ingredients:[{name:'Inconnu',qty:1,unit:'pièce'}]},2,ing,products),/sans fiche/);
});
test('Besoins : cumul de deux repas, retrait du stock une seule fois, arrondi externe',()=>{
 const needs=shoppingShortfallsV41([recipe.ingredients[0],recipe.ingredients[0]],start,ing,products);
 assert.equal(needs.length,1);
 assert.equal(needs[0].gross,600);
 assert.equal(needs[0].available,500);
 assert.equal(needs[0].toBuy,100);
});
test('Courses faites : coché uniquement, emballage connu converti, ponctuel signalé',()=>{
 const result=purchasedMovementsV41([
  {name:'Pâtes',productId:'pack',qty:2,unit:'paquet',checked:true},
  {name:'Non acheté',productId:'pack',qty:5,unit:'paquet',checked:false},
  {name:'Divers',qty:3,unit:'pièce',checked:true}
 ],ing,products);
 assert.equal(result.movements.length,1);
 assert.equal(result.movements[0].amount,1000);
 assert.equal(result.warnings.length,1);
});
test('Congélateur : ne pas réserver les mêmes portions sur deux semaines',()=>{
 const frozen=applyStockTransactionV41(emptyStockV41(),{id:'gel',movements:[
  {type:'freezer',direction:'add',lotId:'lot1',recipeId:'chili',portions:3}
 ]}).stock;
 const week1=planFrozenMealV41({},frozen,'2026-10-26',1,'lot1',2);
 assert.equal(remainingFreezerPortionsV41(frozen,week1,'lot1'),1);
 assert.throws(()=>planFrozenMealV41(week1,frozen,'2026-11-02',1,'lot1',2),/assez/);
 const week2=planFrozenMealV41(week1,frozen,'2026-11-02',1,'lot1',1);
 assert.equal(freezerReservationsV41(week2).lot1,3);
 assert.equal(remainingFreezerPortionsV41(frozen,week2,'lot1'),0);
 const shifted=planFrozenMealV41(week2,frozen,'2026-10-26',1,'lot1',1);
 assert.equal(shifted['2026-10-26'].meals[1].portions,1);
 assert.equal(remainingFreezerPortionsV41(frozen,shifted,'lot1'),1);
 assert.equal(week2['2026-10-26'].meals[1].portions,2,'pas de mutation de la source');
});

test('Recette ancienne reliée par nom : 1 boîte de 6 œufs déduit bien six pièces',()=>{
 const ingred=[{id:'eggs',name:'Œufs',productId:'box-eggs'}];
 const catalog=[{id:'box-eggs',name:'Œufs boîte 6',unit:'boîte',packAmount:6,packUnit:'pièce'}];
 const oldRecipe={id:'omelette',people:2,ingredients:[{name:'Œufs',qty:1,unit:'boîte'}]};
 const movements=kitchenMovementsV41(oldRecipe,2,ingred,catalog);
 assert.equal(movements.length,1);
 assert.equal(movements[0].identity,'ingredient:eggs');
 assert.equal(movements[0].amount,6);
 assert.equal(movements[0].unit,'pièce');
});

test('Reprendre la semaine passée réattribue chaque lot sans dupliquer les réservations',()=>{
 const frozen=applyStockTransactionV41(emptyStockV41(),{id:'stock-reprise',movements:[
  {type:'freezer',direction:'add',lotId:'chili-lot',recipeId:'chili',portions:3,name:'Chili'}
 ]}).stock;
 const prior={meals:Array(14).fill(null),v41MealActions:{'0:chili':{status:'eaten'}}};
 prior.meals[0]={type:'frozen',lotId:'chili-lot',recipeId:'chili',portions:2,consumed:true};
 prior.meals[1]={type:'recipe',recipeId:'pates',people:4};
 prior.meals[4]={type:'leftovers',recipeId:'pates',fromIndex:1,leftoverPortions:2};
 const target={meals:Array(14).fill(null),extras:[{id:'essuie-tout'}],
  generatedIngredients:[],v41MealActions:{},checked:[],excluded:[]};
 const weeks={'2026-10-19':prior,'2026-10-26':target};
 const result=repeatWeekMealsV41(weeks,frozen,'2026-10-19','2026-10-26');
 assert.equal(result.skippedFrozen,0);
 assert.equal(result.copiedFrozen,1);
 const copied=result.weeks['2026-10-26'];
 assert.equal(copied.meals[0].consumed,undefined,'ancienne consommation jamais recopiée');
 assert.equal(copied.meals[0].portions,2);
 assert.equal(copied.meals[1].people,4);
 assert.equal(copied.meals[4].fromIndex,1);
 assert.deepEqual(copied.v41MealActions,{});
 assert.equal(copied.extras.length,1,'les achats manuels restent');
 assert.equal(freezerReservationsV41(result.weeks)['chili-lot'],2);
 assert.equal(weeks['2026-10-26'].meals[0],null,'état source non modifié');
});
test('Reprendre la semaine passée n’invente pas de portions déjà réservées ailleurs',()=>{
 const frozen=applyStockTransactionV41(emptyStockV41(),{id:'stock-reprise',movements:[
  {type:'freezer',direction:'add',lotId:'lot-a',recipeId:'chili',portions:2}
 ]}).stock;
 const week=()=>({meals:Array(14).fill(null),extras:[],checked:[],excluded:[]});
 const prior=week();prior.meals[1]={type:'frozen',lotId:'lot-a',recipeId:'chili',portions:2,consumed:true};
 const reserved=week();reserved.meals[3]={type:'frozen',lotId:'lot-a',recipeId:'chili',portions:2};
 const target=week();target.meals[1]={type:'ordered'};
 const weeks={'2026-10-19':prior,'2026-10-26':target,'2026-11-02':reserved};
 const result=repeatWeekMealsV41(weeks,frozen,'2026-10-19','2026-10-26');
 assert.equal(result.skippedFrozen,1);
 assert.equal(result.weeks['2026-10-26'].meals[1],null,'un repas congelé sans stock n’est pas cloné');
 assert.equal(freezerReservationsV41(result.weeks)['lot-a'],2);
});
test('Reprendre une semaine supprime les restes qui n’ont plus de plat source',()=>{
 const source={meals:Array(14).fill(null)};
 source.meals[3]={type:'leftovers',recipeId:'chili',fromIndex:1,leftoverPortions:2};
 const target={meals:Array(14).fill(null)};
 const repeated=repeatWeekMealsV41(
  {'2026-10-19':source,'2026-10-26':target},emptyStockV41(),'2026-10-19','2026-10-26');
 assert.equal(repeated.weeks['2026-10-26'].meals[3],null);
});
