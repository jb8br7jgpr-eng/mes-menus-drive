// V41.18 — parcours Grand Frais, composition, quantites, courses, achat.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stockMeasureV41,stockIdentityV41} from '../stock-engine-v41.mjs';
import {resolveStockArticleV41} from '../stock-week-v41.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const actions=readFileSync(new URL('../stock-actions-v41.mjs',import.meta.url),'utf8');
const units=['g','kg','ml','cl','l','pièce','paquet','boîte','rouleau','bouteille','pot','sachet'];
const ingredients=[{id:'tomates',name:'Tomates',store:'grandfrais',unit:'pièce'},
 {id:'riz',name:'Riz',store:'carrefour',productId:'p-riz',unit:'g'}];
const products=[{id:'p-riz',name:'Riz',store:'carrefour',unit:'paquet',packAmount:500,packUnit:'g'}];
const state={ingredientCatalog:ingredients,products,recipes:[],settings:{people:2}};
const ingredientById=id=>ingredients.find(x=>x.id===id);
const productById=id=>products.find(x=>x.id===id);
const ingredientStore=x=>x.store;
const from=(start,end,text=app)=>{
 const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Section absente '+start);return text.slice(a,b)
};
const helpers=runInNewContext(from('function mealProductsV412(meal){','function mealFrozenV4117(meal){')+
 ';({mealProductsV412,mealProductRefV4118,mealProductInfoV4118})',
 {units,state,ingredientById,productById,ingredientStore});
const entries=helpers.mealProductsV412;
const setMeal=runInNewContext(from('function setMealProductsV412(w,index,items){','function setMealGuestsV412(w,index,guests){')+
 ';setMealProductsV412',{units,ingredientById,productById,mealProductRefV4118:helpers.mealProductRefV4118});
const ctx={state,units,mealProductsV412:entries,mealDishes:()=>[],productById,ingredientById,
 mealProductInfoV4118:helpers.mealProductInfoV4118,mealProductRefV4118:helpers.mealProductRefV4118};
const collect=runInNewContext(from('function collectRecipeIngredients(w){','function menuGenerationSignature(w){')+
 ';collectRecipeIngredients',{...ctx,recipeById:()=>null});
const move=runInNewContext(from('function mealProductMovementV412(ctx,item){','function replaceModal(ctx,index)',actions)+
 ';mealProductMovementV412',{resolveStockArticleV41,stockMeasureV41});

test('Ingrédient Grand Frais sans fiche commerciale : repas, courses, stock et catalogue inchangé',()=>{
 const before=JSON.stringify(state),week={meals:Array(14).fill(null),v41MealActions:{}};
 assert.equal(setMeal(week,0,[{ingredientId:'tomates',qty:2,unit:'pièce'}]),true);
 assert.equal(week.meals[0].products[0].ingredientId,'tomates');
 assert.equal(week.meals[0].products[0].productId,null);
 assert.equal(helpers.mealProductRefV4118(week.meals[0].products[0]),'ingredient:tomates');
 const shopping=collect(week);
 assert.equal(shopping.length,1);
 assert.equal(shopping[0].ingredientId,'tomates');
 assert.equal(shopping[0].productId,null);
 const stock=move({state,units},week.meals[0].products[0]);
 assert.equal(stock.identity,'ingredient:tomates');
 assert.equal(stock.name,'Tomates');
 assert.equal(stock.store,'grandfrais');
 assert.equal(stock.amount,2);
 assert.equal(stock.direction,'consume');
 assert.equal(JSON.stringify(state),before);
});
test('Même référence physique liée à un ingrédient : aucun doublon dans le même repas',()=>{
 const week={meals:Array(14).fill(null)};
 assert.equal(setMeal(week,1,[{ingredientId:'riz',productId:'p-riz',qty:200,unit:'g'},
  {productId:'p-riz',qty:1,unit:'paquet'}]),false);
 assert.equal(week.meals[1],null);
});
test('Aperçu des courses : seules les différences des menus sont comptées',()=>{
 const code=from('function menuShoppingChangesV4118(w){','function menuChangedSlotsV4118(w){');
 const delta=runInNewContext(code+';menuShoppingChangesV4118',{
  collectRecipeIngredients:collect,converted:(q,u)=>[Number(q),u],
  norm:x=>String(x||'').toLowerCase(),ingredientById,productById,ingredientStore
 });
 const week={meals:Array(14).fill(null),generatedIngredients:[{name:'Tomates',ingredientId:'tomates',qty:2,unit:'pièce'}]};
 week.meals[0]={type:'products',products:[{ingredientId:'tomates',qty:3,unit:'pièce'}]};
 const result=delta(week);
 assert.equal(result.length,1);
 assert.equal(result[0].delta,1);
 assert.equal(result[0].store,'grandfrais');
});
test('Compositeur unique : quatre sources et elements modifiables sans perte des choix',()=>{
 assert.match(app,/function mealComposerSelectedV4118/);
 for(const kind of ['recipes','leftovers','frozen','products'])assert.ok(app.includes("'"+kind+"'"));
 assert.match(app,/data-action="remove-dish"/);
 assert.match(app,/data-action="remove-leftover"/);
 assert.match(app,/data-action="v4117-remove-frozen"/);
 assert.match(app,/data-action="v412-edit-meal-product"/);
 assert.match(app,/data-action="mark-no-meal"/);
 assert.match(app,/data-action="v41171-mark-ordered"/);
});
test('Quantites alimentaires et conditionnements distincts, achats explicites',()=>{
 assert.match(app,/const sensible=\{g:100,kg:0\.2,ml:100,cl:10,l:0\.2/);
 assert.match(app,/Quantité prévue pour le repas/);
 assert.match(app,/Conditionnement :/);
 const begin=app.indexOf('function renderCourses('),end=app.indexOf('function grandFraisText(',begin);
 const courses=app.slice(begin,end);
 assert.match(courses,/Enregistrer mes achats/);
 assert.doesNotMatch(courses,/Enregistrer uniquement les articles cochés/);
 assert.match(app,/Mettre à jour ma liste/);
 assert.match(app,/Évolution des besoins des menus/);
 assert.match(actions,/if\(mode==='v41-courses-done'\)/);
});
