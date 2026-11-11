// V41.19 — couverture visuelle sans impact sur les courses ou le stock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {addFrozenToMealV4117,remainingFreezerPortionsV41} from '../stock-week-v41.mjs';
import {emptyStockV41,applyStockTransactionV41} from '../stock-engine-v41.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function section(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a, 'section source disponible : '+start);
 return app.slice(a,b);
}
const units=['pièce','g','kg','l','ml','paquet'];
const dishes=meal=>(meal?.dishes||[]).filter(x=>!x.type);
const leftover=meal=>(meal?.dishes||[]).filter(x=>x.type==='leftovers');
const freezer=meal=>meal?.frozen||[];
const products=meal=>meal?.products||[];
const coverage=runInNewContext(section('function mealPortionCoverageV4119(', 'function setMealGuestsV412(')+
 ';mealPortionCoverageV4119',{mealDishes:dishes,mealFrozenV4117:freezer,
 mealLeftovers:leftover,mealProductsV412:products});

test('2 couverts et 4 portions cuisinees : 2 cases remplies, sans multiplier les courses',()=>{
 const meal={type:'multi',dishes:[{recipeId:'chili',people:4}]};
 const before=JSON.stringify(meal);
 const result=coverage(meal,2);
 assert.equal(result.filled,2);
 assert.equal(result.missing,0);
 assert.equal(result.planned,2);
 assert.equal(JSON.stringify(meal),before,'calcul sans mutation');
});
test('cases vides et ajouts multi-sources : la progression est dynamique',()=>{
 const meal={type:'composed',dishes:[{recipeId:'chili',people:1}],
  frozen:[{lotId:'f1',portions:1}],products:[{productId:'tomates',qty:2,unit:'pièce'},
   {productId:'cordon',qty:2,unit:'pièce',servings:2}]};
 assert.equal(coverage(meal,4).planned,4);
 assert.equal(coverage(meal,4).filled,4);
 assert.equal(coverage({type:'composed',products:[{productId:'tomates',qty:2,unit:'pièce'}]},2).missing,2);
 assert.equal(coverage({type:'composed',dishes:[{recipeId:'chili',people:1}]},3).missing,2);
});
test('choix du nombre de couverts sans creer de faux repas vide',()=>{
 const guestSrc=section('function mealComposerGuestsV4119(', 'function mealPortionCoverageV4119(');
 const saveSrc=section('function setMealGuestsV412(', '// « Préparées »');
 const w={meals:Array(14).fill(null),v41MealActions:{}};
 const ctx={getWeek:()=>w,mealGuestsV412:()=>2,mealDraftV4120:()=>null,isMealDoneV41:()=>false,reconcileLeftovers:()=>{}};
 const api=runInNewContext(guestSrc+saveSrc+';({mealComposerGuestsV4119,setMealGuestsV412,applyMealDraftGuestsV4119})',ctx);
 assert.equal(api.mealComposerGuestsV4119(0,null),2);
 assert.equal(api.setMealGuestsV412(w,0,5),true);
 assert.equal(api.mealComposerGuestsV4119(0,null),5);
 assert.equal(w.meals[0],null,'une selection de couverts ne remplit pas artificiellement le calendrier');
 w.meals[0]={type:'recipe',recipeId:'chili',people:5};
 api.applyMealDraftGuestsV4119(w,0);
 assert.equal(w.meals[0].guests,5);
 assert.equal(api.setMealGuestsV412(w,0,4),true);
 assert.equal(w.meals[0].guests,4);
 assert.equal(api.setMealGuestsV412(w,0,0),false);
});
test('produits historiques et nouveaux : portions principales facultatives',()=>{
 const mealProducts=runInNewContext(section('function mealProductsV412(', '// V41.18 :')+
 ';mealProductsV412',{units});
 const old=mealProducts({products:[{productId:'cordons',qty:2,unit:'pièce'}]});
 assert.equal(old.length,1);
 assert.equal(old[0].servings,undefined);
 const today=mealProducts({products:[{ingredientId:'tomates',qty:2,unit:'pièce',servings:0},
  {productId:'cordons',qty:2,unit:'pièce',servings:2}]});
 assert.equal(today[0].servings,undefined);
 assert.equal(today[1].servings,2);
 assert.equal(coverage({products:today},2).planned,2);
});
test('moteur de reservation du congelateur : modification sans surreservation',()=>{
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'freezer-seed',
  movements:[{type:'freezer',direction:'add',lotId:'f1',recipeId:'lasagnes',name:'Lasagnes',portions:5}]}).stock;
 const weeks={'2026-11-14':{meals:Array(14).fill(null),v41MealActions:{}}};
 let planned=addFrozenToMealV4117(weeks,stock,'2026-11-14',0,'f1',2);
 planned=addFrozenToMealV4117(planned,stock,'2026-11-14',1,'f1',2);
 assert.equal(remainingFreezerPortionsV41(stock,planned,'f1'),1);
 assert.equal(remainingFreezerPortionsV41(stock,planned,'f1',{weekId:'2026-11-14',index:0}),3);
 const draft=JSON.parse(JSON.stringify(planned));
 draft['2026-11-14'].meals[0].frozen=[];
 const modified=addFrozenToMealV4117(draft,stock,'2026-11-14',0,'f1',3);
 assert.equal(remainingFreezerPortionsV41(stock,modified,'f1'),0);
 assert.equal(modified['2026-11-14'].meals[1].frozen[0].portions,2);
 assert.throws(()=>addFrozenToMealV4117(draft,stock,'2026-11-14',0,'f1',4),
  /assez de portions libres/);
 assert.equal(weeks['2026-11-14'].meals[0],null,'pas de mutation de la source');
});
test('calendrier → composeur visuel et etats speciaux accessibles',()=>{
 assert.match(app,/data-action="pick-meal"/);
 assert.match(app,/else if\(mode==='pick-meal'\)/);
 assert.match(app,/openMealPickerV4116\(index,'recipes'\)/);
 assert.match(app,/function mealComposerVisualV4119\(/);
 assert.match(app,/mealComposerVisualV4119\(index,meal\)/);
 assert.match(app,/function showSpecialMealV4119\(/);
 assert.match(app,/v4119-replace-special/);
 assert.match(app,/v4119-finish/);
 assert.match(app,/v4119-dish-step/);
 assert.match(app,/v4119-guests-step/);
 assert.match(app,/v4119-edit-frozen/);
 assert.match(app,/v4119-save-frozen/);
 assert.match(app,/v4119-edit-leftover/);
 assert.match(app,/v4119-save-leftover/);
 assert.match(app,/source\?\.available\|\|0/);
 assert.match(app,/id="v4119ProductServings"/);
 assert.match(app,/v4119-main-product-field/);
 assert.match(css,/\.v4119-portion\.is-filled/);
 assert.match(css,/\.v4119-footer/);
 assert.match(index,/41-21-unified/);
 assert.match(worker,/41-21-unified/);
 assert.doesNotThrow(()=>new Function(app),'syntaxe app.js valide');
});
test('les cases visuelles correspondent aux convives et restent lisibles',()=>{
 const src=section('function mealComposerVisualV4119(', 'function showSpecialMealV4119(');
 const meal={type:'multi',dishes:[{recipeId:'chili',people:1}],products:[]};
 const visual=runInNewContext(src+';mealComposerVisualV4119',{
   mealComposerGuestsV4119:()=>3,mealComposerPreviewV4120:(_index,meal)=>meal,mealPortionCoverageV4119:coverage,
   mealDishes:dishes,mealLeftovers:leftover,mealFrozenV4117:freezer,mealProductsV412:products,
   recipeById:()=>({name:'Chili'}),state:{stockV41:{freezer:{}}},
   portionsEatenHere:()=>1,mealProductInfoV4118:()=>null,mealProductRefV4118:()=>null,
   html:x=>String(x).replaceAll('<','&lt;'),quantity:(n,u)=>n+' '+u,quickMealActionsV413:()=>''
 });
 const view=visual(0,meal);
 assert.equal((view.match(/class="v4119-portion(?: is-filled)?"/g)||[]).length,3);
 assert.equal((view.match(/class="v4119-portion is-filled"/g)||[]).length,1);
 assert.match(view,/2 couverts à compléter/);
 assert.match(view,/À préparer/);
 assert.match(view,/data-action="v4119-dish-step"/);
});
