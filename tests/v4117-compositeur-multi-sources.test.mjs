// Speedrive V41.17 — tests de la composition libre sans ecriture cloud.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {emptyStockV41,applyStockTransactionV41,availableFreezerV41} from '../stock-engine-v41.mjs';
import {mealFrozenPartsV4117,addFrozenToMealV4117,freezerReservationsV41,remainingFreezerPortionsV41,repeatWeekMealsV41} from '../stock-week-v41.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const actions=readFileSync(new URL('../stock-actions-v41.mjs',import.meta.url),'utf8');
const UI=readFileSync(new URL('../stock-ui-v41.mjs',import.meta.url),'utf8');
const wId='2026-11-14';
const recipe={id:'soupe',name:'Soupe',people:2,ingredients:[]};
const weekly=()=>({[wId]:{meals:Array(14).fill(null),v41MealActions:{},extras:[],checked:[],excluded:[]}});
const inventory=()=>applyStockTransactionV41(emptyStockV41(),{id:'init',movements:[
 {type:'freezer',direction:'add',lotId:'chili-a',recipeId:'chili',name:'Chili',portions:1},
 {type:'freezer',direction:'add',lotId:'soupe-b',recipeId:'soupe',name:'Soupe',portions:1}
]}).stock;
const between=(start,end)=>{
 const i=app.indexOf('function '+start+'('),j=app.indexOf('function '+end+'(',i+1);
 assert.ok(i>=0&&j>i, start+' → '+end+' introuvable');
 return app.slice(i,j);
};

test('V41.17 : les 2 portions de 2 plats se retrouvent au meme repas',()=>{
 const stock=inventory(),old=weekly();
 const a=addFrozenToMealV4117(old,stock,wId,2,'chili-a',1);
 const both=addFrozenToMealV4117(a,stock,wId,2,'soupe-b',1);
 assert.equal(mealFrozenPartsV4117(both[wId].meals[2]).length,2);
 assert.deepEqual(mealFrozenPartsV4117(both[wId].meals[2]).map(x=>x.lotId),['chili-a','soupe-b']);
 assert.equal(old[wId].meals[2],null,'aucune mutation de la semaine initiale');
 assert.deepEqual(freezerReservationsV41(both),{'chili-a':1,'soupe-b':1});
 assert.equal(remainingFreezerPortionsV41(stock,both,'chili-a'),0);
 assert.equal(remainingFreezerPortionsV41(stock,both,'soupe-b'),0);
 assert.equal(availableFreezerV41(stock,'chili'),1,'planifier ne consomme pas');
 assert.throws(()=>addFrozenToMealV4117(both,stock,wId,3,'chili-a',1),/assez de portions/);
});

test('V41.17 : une recette et un produit survivent a l ajout de portions congelees',()=>{
 const stock=inventory(),weeks=weekly();
 weeks[wId].meals[1]={type:'recipe',recipeId:'soupe',people:2,
  products:[{productId:'pain',qty:1,unit:'paquet'}]};
 const out=addFrozenToMealV4117(weeks,stock,wId,1,'chili-a',1);
 assert.equal(out[wId].meals[1].type,'recipe');
 assert.equal(out[wId].meals[1].recipeId,'soupe');
 assert.equal(out[wId].meals[1].products[0].productId,'pain');
 assert.equal(out[wId].meals[1].frozen.length,1);
});
test('V41.17 : ancienne case congelee reste compatible et peut accueillir une autre portion',()=>{
 const stock=inventory(),weeks=weekly();
 weeks[wId].meals[2]={type:'frozen',lotId:'chili-a',recipeId:'chili',portions:1};
 const out=addFrozenToMealV4117(weeks,stock,wId,2,'soupe-b',1);
 assert.equal(out[wId].meals[2].type,'composed');
 assert.deepEqual(out[wId].meals[2].frozen.map(x=>x.lotId),['chili-a','soupe-b']);
});
test('V41.17 : les validations empechent les modifications et la double reservation',()=>{
 const stock=inventory(),weeks=weekly();
 weeks[wId].meals[2]={type:'recipe',recipeId:'soupe',people:2};
 weeks[wId].v41MealActions['2:soupe']={status:'eaten'};
 assert.throws(()=>addFrozenToMealV4117(weeks,stock,wId,2,'chili-a',1),/deja valide|déjà validé/i);
 delete weeks[wId].v41MealActions['2:soupe'];
 const once=addFrozenToMealV4117(weeks,stock,wId,2,'chili-a',1);
 assert.throws(()=>addFrozenToMealV4117(once,stock,wId,2,'chili-a',1),/deja present|déjà présent/i);
});
test('V41.17 : une portion mangee n est plus reservee, la deuxieme reste reservee',()=>{
 const stock=inventory(),out=addFrozenToMealV4117(
  addFrozenToMealV4117(weekly(),stock,wId,1,'chili-a',1),stock,wId,1,'soupe-b',1);
 out[wId].meals[1].frozen[0].consumed=true;
 assert.deepEqual(freezerReservationsV41(out),{'soupe-b':1});
});
test('V41.17 : reprise de la semaine reserve correctement les differents lots',()=>{
 const stock=inventory(),weeks=weekly(),next='2026-11-21';
 weeks[next]={meals:Array(14).fill(null),v41MealActions:{}};
 weeks[wId].meals[0]={type:'recipe',recipeId:'soupe',people:2};
 const a=addFrozenToMealV4117(weeks,stock,wId,0,'chili-a',1);
 const copy=repeatWeekMealsV41(a,stock,wId,next);
 assert.equal(copy.skippedFrozen,1,'lot deja reserve la premiere semaine');
 assert.equal(copy.weeks[next].meals[0].recipeId,'soupe');
 assert.equal(copy.weeks[next].meals[0].frozen,undefined);
});
test('V41.17 : compositeur visible et produits sur le meme parcours',()=>{
 assert.doesNotThrow(()=>new Function(app));
 assert.match(app,/v4117-composer-tabs/);
 assert.match(app,/data-kind="leftovers"/);
 assert.match(app,/data-kind="frozen"/);
 assert.match(app,/data-kind="products"/);
 assert.match(app,/data-action="v4117-add-frozen"/);
 assert.match(app,/data-action="v4117-remove-frozen"/);
 assert.match(styles,/\.v4117-composer-tabs/);
 assert.match(actions,/if\(mode==='v41-eat-frozen-part'\)/);
 assert.match(actions,/if\(kind==='frozen-part'\)/);
 assert.match(UI,/mealFrozenPartsV4117/);
});
test('V41.17 : suggestions alignees sur les seules fiches courantes dans Produits',()=>{
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const ing={id:'i',name:'Blanc de poulet',productId:'p'};
 const product={id:'p',name:'Blanc de poulet'};
 const state={ingredientCatalog:[ing],products:[product]};
 const src=between('recipeMatchKeyV4116','preferredIngredientUnit');
 const api=runInNewContext(src+';recipeSuggestionsV4116',{state,norm,
  unifiedCatalogueSourceV4114:()=>[{type:'ingredient',id:'i',item:ing,name:ing.name}]});
 const found=api('produit blanc poulet');
 assert.equal(found.length,1);
 assert.equal(found[0].item.id,'i');
});
