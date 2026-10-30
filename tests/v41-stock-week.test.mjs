import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStockV41,applyStockTransactionV41} from '../stock-engine-v41.mjs';
import {kitchenMovementsV41,shoppingShortfallsV41,planFrozenMealV41,
  remainingFreezerPortionsV41,freezerReservationsV41,purchasedMovementsV41} from '../stock-week-v41.mjs';
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
