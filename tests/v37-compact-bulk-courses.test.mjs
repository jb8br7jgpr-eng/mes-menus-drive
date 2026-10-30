import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const between=(from,to)=>{
 const start=source.indexOf('function '+from+'('),end=source.indexOf('function '+to+'(',start);
 assert.ok(start>=0&&end>start,from+' to '+to+' not found');return source.slice(start,end)
};
function api(){
 const state={
  ingredientCatalog:[
   {id:'ing-lait',name:'Lait',store:'carrefour',productId:'ref-lait',frequent:true},
   {id:'ing-pomme',name:'Pommes',store:'grandfrais',frequent:false}
  ],
  products:[
   {id:'ref-lait',name:'Lait référence Carrefour',store:'carrefour',unit:'bouteille',qty:1},
   {id:'papier',name:'Papier toilette',store:'carrefour',unit:'paquet',qty:2,frequent:false},
   {id:'sac',name:'Sacs poubelle',store:'carrefour',unit:'paquet',qty:1,frequent:true}
  ],
  recipes:[{ingredients:[{ingredientId:'ing-lait',name:'Lait',qty:250,unit:'ml'},
   {ingredientId:'ing-pomme',name:'Pommes',qty:4,unit:'pièce'}]}],storePreferences:{}
 };
 const units=['g','kg','ml','cl','l','pièce','paquet','boîte','rouleau','bouteille','pot','sachet'];
 const ctx={state,units,ingredientStore:i=>i.store,preferredIngredientUnit:i=>i.id==='ing-pomme'?'pièce':'ml',
   norm:s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
   ingredientById:id=>state.ingredientCatalog.find(x=>x.id===id),
   productById:id=>state.products.find(x=>x.id===id),uid:()=> 'nouveau'};
 const methods=runInNewContext(between('bulkCatalogueV37','extraModal')+';({bulkCatalogueV37,bulkPurchaseExtraV37,commitBulkV37})',ctx);
 return {state,ctx,methods}
}

test('Le sélecteur montre tous les ingrédients et les produits du quotidien, pas seulement les favoris',()=>{
 const {methods}=api(),all=methods.bulkCatalogueV37();
 assert.equal(all.length,4);
 assert.deepEqual(Array.from(all.map(x=>x.name).sort()),['Lait','Papier toilette','Pommes','Sacs poubelle']);
 assert.equal(all.filter(x=>x.id==='ref-lait').length,0,'pas de doublon entre ingrédient et sa référence Carrefour');
 assert.equal(all.find(x=>x.id==='ing-lait').qty,250);
 assert.equal(all.find(x=>x.id==='ing-pomme').unit,'pièce');
 assert.equal(all.find(x=>x.id==='papier').qty,2);
});

test('La préparation de ligne conserve une quantité et une unité distinctes',()=>{
 const {methods}=api();
 const ingredient=methods.bulkPurchaseExtraV37('ingredient','ing-pomme',3,'kg');
 const daily=methods.bulkPurchaseExtraV37('daily','papier',2,'paquet');
 assert.equal(ingredient.ingredientId,'ing-pomme');
 assert.equal(ingredient.productId,null);
 assert.equal(ingredient.qty,3);assert.equal(ingredient.unit,'kg');
 assert.equal(daily.productId,'papier');assert.equal(daily.qty,2);
 for(const invalid of [0,-1,Infinity,100001,NaN])
  assert.equal(methods.bulkPurchaseExtraV37('daily','papier',invalid,'paquet'),null);
 assert.equal(methods.bulkPurchaseExtraV37('daily','papier',2,'inconnue'),null);
 assert.equal(methods.bulkPurchaseExtraV37('ingredient','introuvable',1,'g'),null);
});

test('Une sélection multiple est atomique et enregistrée en une seule fois',()=>{
 const {methods,ctx}=api();const week={extras:[],checked:['avant'],excluded:['retire']};
 const makeRow=(kind,id,qty,unit)=>({
  dataset:{kind,id},
  querySelector(selector){
   if(selector==='[data-v37-qty]')return {value:qty};
   if(selector==='[data-v37-unit]')return {value:unit};
   if(selector==='strong')return {textContent:id};
   if(selector==='[data-v37-select]')return {checked:true};
   return null
  }
 });
 let rows=[makeRow('ingredient','ing-lait','250','ml'),makeRow('daily','papier','3','paquet')];
 let writes=0,closed=0,toast='',undone=0;
 Object.assign(ctx,{
  modalRoot:{querySelectorAll:()=>rows},
  getWeek:()=>week,weekBeforeUndo:()=>JSON.parse(JSON.stringify(week)),
  shopping:()=>[],
  persist:()=>writes++,closeModal:()=>closed++,
  switchTabV33:()=>{},toastWeekUndo:()=>undone++,
  toast:m=>{toast=m;},tabScrollV33:{courses:55}
 });
 methods.commitBulkV37();
 assert.equal(writes,1);assert.equal(undone,1);assert.equal(closed,1);
 assert.equal(week.extras.length,2);
 assert.equal(week.extras[0].unit,'ml');assert.equal(week.extras[0].qty,250);
 assert.equal(week.extras[1].unit,'paquet');assert.equal(week.extras[1].qty,3);
 assert.deepEqual(Array.from(week.checked),['avant']);
 assert.deepEqual(Array.from(week.excluded),['retire']);

 rows=[makeRow('ingredient','ing-pomme','2','pièce'),makeRow('daily','papier','0','paquet')];
 methods.commitBulkV37();
 assert.equal(writes,1,'aucune sauvegarde partielle en cas d’erreur de quantité');
 assert.equal(week.extras.length,2);
 assert.match(toast,/Vérifie la quantité/);
});

test('Une addition sur une ligne achetée ou retirée réactive correctement cette ligne',()=>{
 const {methods,ctx}=api();
 const week={extras:[],checked:['shop1','autre'],excluded:['shop1','autre']};
 const row={dataset:{kind:'daily',id:'papier'},querySelector(sel){
  if(sel==='[data-v37-select]')return {checked:true};
  if(sel==='[data-v37-qty]')return {value:'2'};
  if(sel==='[data-v37-unit]')return {value:'paquet'};
  return {textContent:'Papier toilette'}
 }};
 Object.assign(ctx,{modalRoot:{querySelectorAll:()=>[row]},getWeek:()=>week,
  weekBeforeUndo:()=>JSON.parse(JSON.stringify(week)),
  shopping:()=>[{id:'shop1',productId:'papier'},{id:'autre',productId:'rien'}],
  persist:()=>{},closeModal:()=>{},switchTabV33:()=>{},toastWeekUndo:()=>{},
  tabScrollV33:{courses:0}});
 methods.commitBulkV37();
 assert.deepEqual(Array.from(week.checked),['autre']);
 assert.deepEqual(Array.from(week.excluded),['autre']);
});

test('Les cartes Plats ont une seule rangée d’actions regroupées, sans ancienne colonne',()=>{
 const markup=between('recipeRows','viewRecipeV33');
 assert.match(markup,/v37-recipe-card/);
 assert.match(markup,/v37-recipe-actions/);
 assert.match(markup,/[+＋] Menus/);
 assert.match(markup,/Dupliquer/);
 assert.match(markup,/✎ Modifier/);
 assert.match(css,/\.v37-recipe-actions\s*\.btn/);
 assert.match(css,/flex-direction:row;flex-wrap:nowrap/);
 assert.match(css,/min-height:0;height:auto/);
});

test('Cours : article coché signifie acheté, pas sélectionné pour ajout',()=>{
 const shopping=between('shoppingRow','editShoppingItemModal');
 assert.match(shopping,/v37-purchase-action/);
 assert.match(shopping,/Acheté \?/);
 assert.match(shopping,/✓ Acheté/);
 const courses=between('renderCourses','grandFraisText');
 assert.match(courses,/Articles achetés/);
 assert.match(courses,/Stock maison et articles retirés/);
 assert.match(courses,/v37-open-bulk/);
 assert.match(source,/Retirer de la liste \(sans achat\)/);
});

test('Le serveur Firebase, le format de sauvegarde et les nouveautés V36 sont conservés',()=>{
 assert.match(source,/const V34_CLOUD_ACTIVE = true/);
 assert.match(source,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(source,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(source,/function calendarMarkupV36/);
 assert.match(source,/function planRecipeV36/);
 assert.match(source,/function availableLeftoverSources/);
 assert.match(source,/function generateWeekCourses/);
});
