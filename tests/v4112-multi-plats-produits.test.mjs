import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stockIdentityV41,stockMeasureV41} from '../stock-engine-v41.mjs';
import {repeatWeekMealsV41,resolveStockArticleV41} from '../stock-week-v41.mjs';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const stockActions=readFileSync(new URL('../stock-actions-v41.mjs',import.meta.url),'utf8');
const stockUI=readFileSync(new URL('../stock-ui-v41.mjs',import.meta.url),'utf8');
const take=(from,to)=>{
 const a=src.indexOf('function '+from+'('),b=src.indexOf('function '+to+'(',a);
 assert.ok(a>=0&&b>a,from+' → '+to+' introuvable');
 return src.slice(a,b)
};
const units=['g','kg','ml','cl','l','pièce','paquet','boîte','rouleau','bouteille','pot','sachet'];
const catalog={products:[
 {id:'cordons',name:'Cordons-bleus',unit:'boîte',packAmount:2,packUnit:'pièce',store:'carrefour'},
 {id:'raviolis',name:'Raviolis',unit:'boîte',packAmount:450,packUnit:'g'}
],ingredientCatalog:[],settings:{people:2}};
const recipes=[
 {id:'cake',name:'Cake au thon',people:4,ingredients:[{name:'Thon',qty:200,unit:'g'}]},
 {id:'poireaux',name:'Fondue de poireaux',people:4,ingredients:[{name:'Poireaux',qty:600,unit:'g'}]},
 {id:'patates',name:'Patates sautées',people:2,ingredients:[{name:'Patates',qty:500,unit:'g'}]}
];
const recipeById=id=>recipes.find(x=>x.id===id);
const productById=id=>catalog.products.find(x=>x.id===id);
const code=take('mealProductsV412','mealCard')+
 ';({mealProductsV412,mealGuestsV412,mealProductRefV4118,mealProductInfoV4118})';
const helpers=runInNewContext(code,{units,state:catalog,productById,ingredientById:()=>null,ingredientStore:()=> 'carrefour'});
const mealDishes=runInNewContext(take('mealDishes','mealProductsV412')+';mealDishes',{});
const portionsEatenHere=runInNewContext(take('portionsEatenHere','isMealDoneV41')+';portionsEatenHere',{});
const products=helpers.mealProductsV412;
const context={units,mealDishes,mealProductsV412:products,recipeById,productById,state:catalog,
 mealProductRefV4118:helpers.mealProductRefV4118,mealProductInfoV4118:helpers.mealProductInfoV4118};
const storeCode=take('mealLeftovers','portionsEatenHere')+
 ';({mealLeftovers,storeMealParts,setMealProductsV412,setMealGuestsV412})';
const store=runInNewContext(storeCode,{...context,isMealDoneV41:()=>false,reconcileLeftovers:()=>{}});
const collect=runInNewContext(take('collectRecipeIngredients','menuGenerationSignature')+
 ';collectRecipeIngredients',context);
const signature=runInNewContext(take('menuGenerationSignature','hasCookedMeals')+
 ';menuGenerationSignature',context);

test('V41.12 : deux plats de quatre portions ne doublent pas les convives',()=>{
 const a={type:'multi',guests:2,dishes:[{recipeId:'cake',people:4},{recipeId:'poireaux',people:4}]};
 const d=mealDishes(a);
 assert.equal(helpers.mealGuestsV412(a),2);
 assert.equal(portionsEatenHere(d[0],d,2),2);
 assert.equal(portionsEatenHere(d[1],d,2),2);
 assert.equal(d[0].people-portionsEatenHere(d[0],d,2),2);
 assert.equal(d[1].people-portionsEatenHere(d[1],d,2),2);
 const lines=collect({meals:[a],v41MealActions:{}});
 assert.equal(lines.length,2);
 assert.equal(lines[0].qty,200);
 assert.equal(lines[1].qty,600);
});

test('V41.12 : les recettes et les produits cohabitent sans modifier le catalogue',()=>{
 const w={meals:[{type:'recipe',recipeId:'patates',people:2,guests:2}]};
 const before=JSON.stringify(catalog);
 assert.ok(store.setMealProductsV412(w,0,[{productId:'cordons',qty:2,unit:'pièce'}]));
 assert.equal(w.meals[0].type,'recipe');
 assert.equal(w.meals[0].people,2);
 assert.equal(w.meals[0].products[0].qty,2);
 assert.equal(collect(w).length,2);
 assert.deepEqual(Array.from(collect(w),x=>x.name),['Patates','Cordons-bleus']);
 assert.equal(JSON.stringify(catalog),before);
});

test('V41.12 : retirer le dernier plat conserve les produits du repas',()=>{
 const w={meals:[{type:'recipe',recipeId:'patates',people:2,guests:2,
  products:[{productId:'cordons',qty:2,unit:'pièce'}]}]};
 store.storeMealParts(w,0,[]);
 assert.equal(w.meals[0].type,'products');
 assert.equal(w.meals[0].products[0].productId,'cordons');
 assert.equal(w.meals[0].guests,2);
 assert.equal(mealDishes(w.meals[0]).length,0);
 assert.equal(collect(w).length,1);
 assert.ok(store.setMealProductsV412(w,0,[]));
 assert.equal(w.meals[0],null);
});

test('V41.12 : des produits ajoutés aux menus déclenchent des courses puis deviennent obsolètes après une modification',()=>{
 const w={meals:[{type:'products',products:[{productId:'cordons',qty:2,unit:'pièce'}]}]};
 const before=signature(w);
 assert.equal(collect(w)[0].qty,2);
 w.meals[0].products[0].qty=4;
 assert.notEqual(signature(w),before);
 w.meals[0].products[0].qty=2;
 w.v41MealActions={'0:product:cordons':{status:'eaten'}};
 assert.notEqual(signature(w),before);
 assert.equal(collect(w).length,0);
});

test('V41.12 : 2 pièces correspondent à 1 boîte de 2 sans déduire 2 boîtes',()=>{
 const p=productById('cordons'),m=stockMeasureV41(2,'pièce',p);
 assert.equal(m.amount,2);assert.equal(m.unit,'pièce');
 const pack=stockMeasureV41(1,'boîte',p);
 assert.equal(pack.amount,2);assert.equal(pack.unit,'pièce');
 const identity=stockIdentityV41({productId:p.id},catalog.ingredientCatalog);
 assert.equal(identity,'product:cordons');
 const movementSource=stockActions.slice(stockActions.indexOf('function mealProductMovementV412('),
  stockActions.indexOf('function replaceModal(',stockActions.indexOf('function mealProductMovementV412(')));
 const movement=runInNewContext(movementSource+';mealProductMovementV412',{
  stockIdentityV41,stockMeasureV41,resolveStockArticleV41});
 const m2=movement({state:catalog,units},{productId:'cordons',qty:2,unit:'pièce'});
 assert.equal(m2.amount,2);assert.equal(m2.unit,'pièce');assert.equal(m2.direction,'consume');
});

test('V41.12 : reprise de semaine et stock restent compatibles avec les nouveaux produits',()=>{
 const previous={meals:Array(14).fill(null),v41MealActions:{}};
 previous.meals[0]={type:'multi',guests:2,dishes:[{recipeId:'cake',people:4},{recipeId:'poireaux',people:4}],
  products:[{productId:'cordons',qty:2,unit:'pièce'}]};
 const current={meals:Array(14).fill(null),v41MealActions:{}};
 const weeks={'2026-11-07':previous,'2026-11-14':current};
 const stock={version:1,items:{},freezer:{},applied:{},history:[]};
 const result=repeatWeekMealsV41(weeks,stock,'2026-11-07','2026-11-14');
 assert.equal(result.weeks['2026-11-14'].meals[0].products[0].qty,2);
 assert.equal(result.weeks['2026-11-14'].meals[0].dishes.length,2);
 assert.deepEqual(current.meals,Array(14).fill(null));
});

test('V41.12 : boutons et validations produits accessibles dans les menus et le stock',()=>{
 assert.match(src,/data-action="v4116-open-picker" data-kind="products"/);
 assert.match(src,/data-action="v412-save-meal-product"/);
 assert.match(src,/data-action="v412-remove-meal-product"/);
 assert.match(src,/data-action="v412-save-guests"/);
 assert.match(src,/button\('v41-eat-product'/);
 assert.match(stockUI,/data-action="v41-eat-product"/);
 assert.match(stockUI,/data-kind="product"/);
 assert.match(stockActions,/if\(mode==='v41-eat-product'\)/);
 assert.match(stockActions,/if\(kind==='product'\)/);
});
