// V41.18 — parcours utilisateurs sans acces aux donnees reelles ni Firebase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {resolveStockArticleV41} from '../stock-week-v41.mjs';
import {emptyStockV41,applyStockTransactionV41,availableStockV41,stockIdentityV41} from '../stock-engine-v41.mjs';
import {handleStockActionV41} from '../stock-actions-v41.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const stockUI=readFileSync(new URL('../stock-ui-v41.mjs',import.meta.url),'utf8');
const stockActions=readFileSync(new URL('../stock-actions-v41.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const slice=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i+1);assert.ok(i>=0&&j>i,a);return app.slice(i,j)};
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

test('Un ingredient Grand Frais sans fiche commerciale est un composant de repas distinct',()=>{
 const ctx={units:['pièce','g','paquet']};
 const api=runInNewContext(slice('function mealProductsV412(meal){','// V41.17')+
  ';({mealProductsV412,mealProductRefV4118})',ctx);
 const result=api.mealProductsV412({products:[{ingredientId:'tomates',qty:2,unit:'pièce'}]});
 assert.equal(result.length,1);assert.equal(result[0].ingredientId,'tomates');
 assert.equal(api.mealProductRefV4118(result[0]),'ingredient:tomates');
 const old=api.mealProductsV412({products:[{productId:'cordon',qty:2,unit:'pièce'}]});
 assert.equal(api.mealProductRefV4118(old[0]),'cordon');
});
test('Le selecteur de repas contient les fiches Grand Frais du catalogue, meme non liees',()=>{
 const tomato={id:'i-tomate',name:'Tomates',store:'grandfrais',unit:'pièce'};
 const apple={id:'i-pomme',name:'Pommes',store:'grandfrais',unit:'pièce'};
 const product={id:'p-cordon',name:'Cordons-bleus',store:'carrefour',packAmount:4,packUnit:'pièce'};
 const state={products:[product]};
 const api=runInNewContext(slice("function mealProductPickerResultsV412(index,term=''){",'function openMealProductPickerV412(index){')+
  ';mealProductPickerResultsV412',{
  getWeek:()=>({meals:Array(14).fill(null)}),mealProductsV412:()=>[],
  unifiedCatalogueSourceV4114:()=>[
   {type:'ingredient',id:tomato.id,item:tomato,name:tomato.name,store:'grandfrais'},
   {type:'ingredient',id:apple.id,item:apple,name:apple.name,store:'grandfrais'},
   {type:'daily',id:product.id,item:product,name:product.name,store:'carrefour'}
  ],productById:id=>state.products.find(p=>p.id===id),norm,html:x=>String(x)
 });
 const result=api(0);
 assert.match(result,/data-kind="ingredient" data-id="i-tomate"/);
 assert.match(result,/Grand Frais/);
 assert.match(result,/data-kind="daily" data-id="p-cordon"/);
 assert.match(api(0,'tomat'),/Tomates/);
 assert.doesNotMatch(api(0,'tomat'),/Cordons-bleus/);
});
test('Le moteur existant identifie un ingredient Grand Frais sans produit Carrefour',()=>{
 const tomato={id:'i-tomate',name:'Tomates',store:'grandfrais',category:'Légumes'};
 const ref=resolveStockArticleV41({ingredientId:'i-tomate',qty:2,unit:'pièce'},[tomato],[]);
 assert.ok(ref);
 assert.equal(ref.name,'Tomates');assert.equal(ref.store,'grandfrais');
 assert.equal(ref.product,undefined);
});
test('Les quantites proposees pour un produit a la piece sont celles des convives',()=>{
 let body='';
 const api=runInNewContext(slice("function editMealProductV412(index,id,kind='daily'){","function extraSearchItems(term=''){")+
  ';editMealProductV412',{
  productById:()=>({id:'c',name:'Cordons-bleus',store:'carrefour',unit:'paquet',packAmount:4,packUnit:'pièce'}),
  ingredientById:()=>null,getWeek:()=>({meals:Array(14).fill(null)}),mealProductsV412:()=>[],
  mealProductRefV4118:x=>x.productId,isMealDoneV41:()=>false,
  mealComposerGuestsV4119:()=>2,
  units:['pièce','paquet','g'],state:{settings:{people:2}},
  preferredIngredientUnit:()=> 'pièce',ingredientStore:()=> 'carrefour',
  selectOptions:()=>'<option>pièce</option>',quantity:(n,u)=>n+' '+u,
  html:x=>String(x),showModal:(_,html)=>{body=html}
 });
 api(0,'c','daily');
 assert.match(body,/value="2"/);
 assert.match(body,/Conditionnement : 4 pièce/);
 assert.match(body,/Quantité prévue pour le repas/);
});
test('Le compositeur affiche ses quatre sources et le repas courant',()=>{
 assert.match(app,/function mealComposerSelectedV4118\(/);
 assert.match(app,/mealComposerVisualV4119\(index,meal\)/);
 assert.match(app,/const modes=\['recipes','leftovers','frozen','products'\]/);
 assert.match(app,/data-action="v4119-finish"/);
 assert.match(app,/data-action="save-dish-portions"/);
 assert.match(css,/\.v4119-card/);
});
test('Le diff des besoins ne touche pas les achats et distingue les magasins',()=>{
 const code=slice('function menuShoppingChangesV4118(w){','function courseGenerationBanner(w=getWeek()');
 const fn=runInNewContext(code+';menuShoppingChangesV4118',{
  collectRecipeIngredients:()=>[{name:'Tomates',qty:3,unit:'pièce',ingredientId:'i'}],
  converted:(v,u)=>[Number(v),u],norm,ingredientById:id=>id==='i'?{id:'i',store:'grandfrais'}:null,
  ingredientStore:i=>i.store,productById:()=>null
 });
 const generatedIngredients=[{name:'Tomates',qty:1,unit:'pièce',ingredientId:'i'}],w={generatedIngredients};
 const result=fn(w);
 assert.equal(result.length,1);assert.equal(result[0].delta,2);assert.equal(result[0].store,'grandfrais');
 assert.equal(generatedIngredients[0].qty,1,'la liste generee reste intacte');
});
test('Un seul acces pour enregistrer les achats et cache Safari actualise',()=>{
 const courses=slice('function renderCourses(){','function grandFraisText(){');
 assert.match(courses,/data-action="v4116-finish-courses"/);
 assert.doesNotMatch(courses,/data-action="v41-courses-done"/);
 assert.match(app,/Coche uniquement les produits réellement achetés/);
 assert.match(index,/app\.js\?v=20261111-41-20-flow/);
 assert.match(sw,/menus-drive-v41-20-flow-20261111/);
 assert.match(stockUI,/ingredient\?\.name\|\|p\?\.name/);
 assert.match(stockActions,/resolveStockArticleV41\(item,ctx\.state\.ingredientCatalog,ctx\.state\.products\)/);
});

test('Grand Frais : consommation reelle puis annulation retablit le stock sans doublon',()=>{
 const ing={id:'tomates',name:'Tomates',store:'grandfrais',category:'Légumes',unit:'pièce'};
 const identity=stockIdentityV41({ingredientId:ing.id},[ing]);
 const initial=applyStockTransactionV41(emptyStockV41(),{
  id:'inventaire-initial',movements:[{type:'inventory',direction:'add',identity,name:'Tomates',store:'grandfrais',
   category:'Légumes',amount:4,unit:'pièce'}]
 }).stock;
 const weekId='2026-11-14',product={ingredientId:ing.id,qty:2,unit:'pièce'};
 const w={meals:[{type:'products',products:[product]},...Array(13).fill(null)],v41MealActions:{}};
 const state={stockV41:initial,ingredientCatalog:[ing],products:[],weeks:{[weekId]:w}};
 let writes=0,uid=0,last='';
 const ctx={mode:'v41-eat-product',a:{dataset:{}},id:'ingredient:tomates',index:0,
  state,currentWeek:weekId,uid:()=>String(++uid),units:['pièce'],
  toast:x=>{last=String(x)},persist:()=>writes++,render:()=>{},renderMealContext:()=>{},
  closeModal:()=>{},showModal:()=>{},getWeek:()=>w,
  mealProductsV412:m=>m?.products||[],mealDishes:()=>[],mealLeftovers:()=>[],
  recipeById:()=>null,shopping:()=>[],generateWeekCourses:()=>{}
 };
 const oldConfirm=globalThis.confirm;globalThis.confirm=()=>true;
 try{
  assert.equal(availableStockV41(state.stockV41,identity,'pièce'),4);
  assert.equal(handleStockActionV41(ctx),true);
  assert.equal(availableStockV41(state.stockV41,identity,'pièce'),2,last);
  assert.ok(w.v41MealActions['0:product:ingredient:tomates']);
  ctx.mode='v41-undo-validation';ctx.a={dataset:{kind:'product'}};
  assert.equal(handleStockActionV41(ctx),true);
  assert.equal(availableStockV41(state.stockV41,identity,'pièce'),4,last);
  assert.equal(w.v41MealActions['0:product:ingredient:tomates'],undefined);
  assert.equal(writes,2);
 }finally{if(oldConfirm===undefined)delete globalThis.confirm;else globalThis.confirm=oldConfirm}
});
