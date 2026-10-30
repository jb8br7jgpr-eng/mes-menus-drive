import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyStockV41,applyStockTransactionV41,availableStockV41,availableFreezerV41,stockIdentityV41} from '../stock-engine-v41.mjs';
import {freezerReservationsV41} from '../stock-week-v41.mjs';
import {previewStockMovementsV413,stockConfirmationTextV413} from '../stock-preview-v413.mjs';
import {renderStockV41} from '../stock-ui-v41.mjs';
import {handleStockActionV41} from '../stock-actions-v41.mjs';
import {packState,unpackState} from '../firebase/v34-cloud-codec.js';
import {webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

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
const mealLeftovers=m=>m?.type==='leftovers'?
 [{recipeId:m.recipeId,people:Number(m.leftoverPortions)||2,fromIndex:m.fromIndex}]:
 m?.type==='multi'?m.dishes.filter(x=>x.type==='leftovers')
  .map(x=>({recipeId:x.recipeId,people:x.people,fromIndex:x.fromIndex})):[];

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
  recipeById:id=>recipes.find(x=>x.id===id),mealDishes,mealLeftovers,
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

test('Sauvegarde Firebase : les portions congelées, menus, achats et anciens stocks survivent à un aller-retour',async()=>{
 const f=fixture();
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'purchase-once',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:500,unit:'g'},
  {type:'freezer',direction:'add',lotId:'l1',recipeId:'pasta-dinner',name:'Pâtes',portions:2}
 ]}).stock;
 f.state.stockV41=initial;
 f.week.meals[1]={type:'frozen',lotId:'l1',recipeId:'pasta-dinner',portions:1};
 f.week.meals[2]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.week.v41MealActions={'2:pasta-dinner':{status:'eaten',at:'2026-10-30T12:00:00.000Z'}};
 f.week.v41ValidatedRows={'produit:pack|achat':{qty:1,unit:'paquet'}};
 f.week.pantry={'ingredient:pasta|g':200};
 const before=JSON.parse(JSON.stringify(f.state));
 const packed=await packState(f.state);
 const result=await unpackState(packed,{});
 assert.deepEqual(result,before,'les métadonnées V41 restent présentes et intactes');
 assert.equal(availableFreezerV41(result.stockV41,'pasta-dinner'),2);
 assert.equal(result.weeks[weekId].meals[1].portions,1);
 assert.equal(result.weeks[weekId].v41MealActions['2:pasta-dinner'].status,'eaten');
 assert.equal(result.weeks[weekId].pantry['ingredient:pasta|g'],200);
 assert.ok(packed.bytes<8_000_000);
});

test('Le calcul V41 des courses enlève le stock réel avant l’arrondi des boîtes Carrefour',()=>{
 const eggs={id:'eggsbox',name:'Œufs boîte de 6',unit:'boîte',packAmount:6,packUnit:'pièce',store:'carrefour'};
 const ing={id:'eggs',name:'Œufs',productId:'eggsbox',store:'carrefour'};
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'stock-eggs',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:eggs',name:'Œufs',amount:4,unit:'pièce'}
 ]}).stock;
 const week={meals:[],generatedIngredients:[{ingredientId:'eggs',productId:'eggsbox',
  name:'Œufs',qty:8,unit:'pièce'}],pantry:{'produit:eggsbox|pièce':99},
  extras:[],checked:[],excluded:[]};
 const source=app.slice(app.indexOf('function shopping(){'),app.indexOf('function stockUnitChoices('));
 assert.ok(source.startsWith('function shopping(){'));
 const state={stockV41:stock,ingredientCatalog:[ing]};
 const context={state,getWeek:()=>week,productById:id=>id===eggs.id?eggs:null,
  ingredientById:id=>id===ing.id?ing:null,ingredientStore:()=> 'carrefour',
  converted:(q,u)=>[Number(q)||0,u],quantity:(q,u)=>q+' '+u,
  norm:s=>String(s).toLowerCase(),productGroup:()=> 'Produits frais',
  groupFor:()=> 'Produits frais',shoppingStore:()=> 'carrefour',
  stockModulesV41:{core:{availableStockV41,stockIdentityV41}}};
 const shopping=runInNewContext(source+';shopping',context);
 const result=shopping();
 assert.equal(result.length,1);
 assert.equal(result[0].qty,1,'8 œufs − 4 en stock = 1 boîte de 6 à acheter');
 assert.equal(result[0].stockAmount,4,'ne jamais additionner le stock historique de 99');
 assert.equal(result[0].covered,false);
 state.stockV41=applyStockTransactionV41(stock,{id:'additional-eggs',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:eggs',amount:1,unit:'boîte',product:eggs}
 ]}).stock;
 const covered=shopping()[0];
 assert.equal(covered.stockAmount,10);
 assert.equal(covered.qty,0);
 assert.equal(covered.covered,true);
});

test('Stock maison : recherche iPhone sans zoom, six onglets et accès aux articles',()=>{
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'initial-ui',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(stock);
 const view=renderStockV41({state:f.state,week:f.week,weekId,view:'home',
  recipeById:f.ctx.recipeById,mealDishes});
 assert.match(view,/id="v41StockSearch"/);
 assert.match(view,/id="v41StockResults"/);
 assert.match(view,/data-v41-stock-row/);
 assert.match(view,/data-action="v41-adjust-stock"/);
 assert.match(style,/v41-stock-search input\{font-size:16px/);
 assert.match(app,/e\.target\.id==='v41StockSearch'/);
 assert.match(style,/\.v41-stock-row\[hidden\]/);
});

test('Congélateur : affichage des portions libres et prévues dans les menus',()=>{
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'initial-freezer-ui',movements:[
  {type:'freezer',direction:'add',lotId:'lot1',name:'Chili',recipeId:'chili',portions:5}
 ]}).stock;
 const f=fixture(stock);
 f.week.meals[3]={type:'frozen',lotId:'lot1',recipeId:'chili',portions:2};
 const view=renderStockV41({state:f.state,week:f.week,weekId,view:'freezer',
  recipeById:f.ctx.recipeById,mealDishes});
 assert.match(view,/5<\/strong>/);
 assert.match(view,/3 encore libres/);
 assert.match(view,/3 libres/);
 assert.match(view,/2 prévues dans les menus/);
});

test('Cette semaine affiche aussi les restes et les repas commandés sans nouvelle consommation',()=>{
 const f=fixture();
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:4};
 f.week.meals[2]={type:'leftovers',recipeId:'pasta-dinner',fromIndex:0,leftoverPortions:2};
 f.week.meals[3]={type:'ordered'};
 const view=renderStockV41({state:f.state,week:f.week,weekId,view:'week',
  recipeById:f.ctx.recipeById,mealDishes,mealLeftovers});
 assert.match(view,/Restes : Pâtes/);
 assert.match(view,/sans nouvelle déduction d’ingrédients/);
 assert.match(view,/À préparer/);
 assert.match(view,/Repas libre ou commandé/);
 assert.match(view,/Sans stock/);
});

test('Un paquet ajouté à la main soustrait le stock en grammes avant calcul des achats',()=>{
 const packet={id:'pack',name:'Pâtes 500 g',unit:'paquet',packAmount:500,packUnit:'g',store:'carrefour'};
 const ing={id:'pasta',name:'Pâtes',productId:'pack',store:'carrefour'};
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'pasta-on-hand',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:350,unit:'g',name:'Pâtes'}
 ]}).stock;
 const week={meals:[],generatedIngredients:[],pantry:{},
  extras:[{id:'extra1',productId:'pack',name:'Pâtes',qty:1,unit:'paquet',fromCatalogue:true}],checked:[],excluded:[]};
 const source=app.slice(app.indexOf('function shopping(){'),app.indexOf('function stockUnitChoices('));
 const state={stockV41:stock,ingredientCatalog:[ing]};
 const shopping=runInNewContext(source+';shopping',{
  state,getWeek:()=>week,productById:id=>id==='pack'?packet:null,
  ingredientById:id=>id==='pasta'?ing:null,ingredientStore:()=> 'carrefour',
  converted:(q,u)=>[Number(q)||0,u],quantity:(q,u)=>q+' '+u,
  norm:s=>String(s).toLowerCase(),productGroup:()=> 'Épicerie et divers',
  groupFor:()=> 'Épicerie et divers',shoppingStore:()=> 'carrefour',
  stockModulesV41:{core:{availableStockV41,stockIdentityV41}}
 });
 const purchase=shopping()[0];
 assert.equal(purchase.qty,1,'350 g à la maison ne couvrent pas le paquet de 500 g');
 assert.equal(purchase.stockAmount,350);
 assert.equal(purchase.totalNeedAmount,500);
 assert.equal(purchase.stockUnit,'g');
 state.stockV41=applyStockTransactionV41(stock,{id:'more-pasta',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:150,unit:'g',name:'Pâtes'}
 ]}).stock;
 const covered=shopping()[0];
 assert.equal(covered.qty,0,'500 g à la maison couvrent exactement le paquet ajouté manuellement');
 assert.equal(covered.covered,true);
});

test('Conditionnement inconnu : le stock est mesuré dans l’unité vendue et non en pièces imaginaires',()=>{
 const packet={id:'packet-unknown',name:'Biscuits',unit:'paquet',store:'carrefour'};
 const week={meals:[],generatedIngredients:[],pantry:{},
  extras:[{id:'extra1',productId:'packet-unknown',name:'Biscuits',qty:2,unit:'paquet',fromCatalogue:true}],
  checked:[],excluded:[]};
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'biscuit-stock',movements:[
  {type:'inventory',direction:'add',identity:'product:packet-unknown',amount:1,unit:'paquet',name:'Biscuits'}
 ]}).stock;
 const source=app.slice(app.indexOf('function shopping(){'),app.indexOf('function stockUnitChoices('));
 const shopping=runInNewContext(source+';shopping',{
  state:{stockV41:stock,ingredientCatalog:[]},getWeek:()=>week,
  productById:id=>id===packet.id?packet:null,ingredientById:()=>null,
  converted:(q,u)=>[Number(q)||0,u],quantity:(q,u)=>q+' '+u,
  norm:s=>String(s).toLowerCase(),productGroup:()=> 'Épicerie et divers',
  groupFor:()=> 'Épicerie et divers',shoppingStore:()=> 'carrefour',
  stockModulesV41:{core:{availableStockV41,stockIdentityV41}}
 });
 const purchase=shopping()[0];
 assert.equal(purchase.unit,'paquet');
 assert.equal(purchase.qty,1);
 assert.equal(purchase.stockAmount,1);
});

test('Restes : repas d’origine non préparé bloque C’est mangé sans toucher aux ingrédients',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'begin-leftovers',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:4};
 f.week.meals[3]={type:'leftovers',recipeId:'pasta-dinner',fromIndex:0,leftoverPortions:2};
 f.invoke('v41-eat-leftovers',{index:3,id:'pasta-dinner',dataset:{source:'0'}});
 assert.equal(f.saved,0);
 assert.match(f.message,/d’abord/);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),0);
 f.invoke('v41-eat-leftovers',{index:3,id:'pasta-dinner',dataset:{source:'0'}});
 assert.equal(f.week.v41MealActions['3:leftovers:0:pasta-dinner'].status,'eaten');
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),0,
  'les restes ne retirent jamais deux fois les ingrédients');
 const saved=f.saved;
 f.invoke('v41-eat-leftovers',{index:3,id:'pasta-dinner',dataset:{source:'0'}});
 assert.equal(f.saved,saved);
});

test('Congeler une préparation ne peut pas effacer des restes déjà mangés',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'begin-freeze-leftovers',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs({...f.inputs,v41FreezePortions:2});
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:4};
 f.week.meals[3]={type:'leftovers',recipeId:'pasta-dinner',fromIndex:0,leftoverPortions:2};
 f.week.v41MealActions={'3:leftovers:0:pasta-dinner':{status:'eaten'}};
 f.invoke('v41-confirm-freeze-recipe',{index:0,id:'pasta-dinner'});
 assert.equal(f.saved,0);
 assert.match(f.message,/déjà été mangés/);
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),0);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
});

test('Premier ajout au stock : aucune quantité héritée ne disparaît sans choix explicite',()=>{
 const f=fixture();withInputs(f.inputs);
 f.week.pantry={'ingredient:pasta|g':300};
 const before=JSON.stringify(f.state);
 f.invoke('v41-add-stock');
 assert.match(f.modals.at(-1).title,/Initialiser mon stock permanent/);
 assert.match(f.modals.at(-1).body,/Examiner le stock du 2026-10-26/);
 assert.match(f.modals.at(-1).body,/Démarrer un stock vide/);
 assert.equal(JSON.stringify(f.state),before);
 assert.equal(f.saved,0);
 f.invoke('v41-add-stock-fresh');
 assert.ok(f.state.stockV41);
 assert.equal(f.state.stockV41.version,1);
 assert.equal(f.week.pantry['ingredient:pasta|g'],300,'l’historique reste conservé');
 assert.equal(f.saved,1);
 assert.equal(f.modals.at(-1).title,'Ajouter au stock');
});
test('L’ancien stock peut être repris sans création silencieuse de produits',()=>{
 const f=fixture();withInputs(f.inputs);
 f.week.pantry={'ingredient:pasta|g':300};
 f.invoke('v41-preview-migration');
 assert.match(f.modals.at(-1).body,/300 g/);
 assert.equal(f.state.stockV41,null);
 f.invoke('v41-confirm-migration');
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),300);
 assert.equal(f.week.pantry['ingredient:pasta|g'],300);
 assert.equal(f.state.stockV41MigratedFrom,weekId);
});

test('Stock de la semaine précédente : un premier achat ne peut pas créer un nouveau stock silencieux',()=>{
 const f=fixture();withInputs(f.inputs);
 f.state.weeks['2026-10-19']={meals:Array(14).fill(null),
  pantry:{'ingredient:pasta|g':450},extras:[],checked:[],excluded:[]};
 f.week.checked=['produit:pack|achat'];
 f.week.pantry={};
 const before=JSON.stringify(f.state);
 f.invoke('v41-courses-done');
 assert.match(f.modals.at(-1).title,/Initialiser mon stock permanent/);
 assert.match(f.modals.at(-1).body,/2026-10-19/);
 assert.equal(f.saved,0);
 assert.equal(JSON.stringify(f.state),before);
 f.invoke('v41-preview-migration',{dataset:{week:'2026-10-19'}});
 assert.match(f.modals.at(-1).body,/450 g/);
 f.invoke('v41-confirm-migration',{dataset:{week:'2026-10-19'}});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),450);
 assert.equal(f.state.stockV41MigratedFrom,'2026-10-19');
 assert.equal(f.week.checked.length,1,'l’achat en attente n’est pas validé par la migration');
});

test('La création d’un plat congelé n’ignore jamais le stock de l’ancienne semaine',()=>{
 const f=fixture();withInputs(f.inputs);
 f.state.weeks['2026-10-19']={meals:Array(14).fill(null),pantry:{'ingredient:pasta|g':120}};
 f.invoke('v41-add-frozen');
 assert.equal(f.state.stockV41,null);
 assert.equal(f.saved,0);
 assert.match(f.modals.at(-1).body,/2026-10-19/);
 f.invoke('v41-save-frozen',{id:'pasta-dinner'});
 assert.equal(f.state.stockV41,null);
 assert.equal(f.saved,0);
});

test('La déduction d’une recette attend également le choix de migration',()=>{
 const f=fixture();withInputs(f.inputs);
 f.state.weeks['2026-10-19']={meals:Array(14).fill(null),pantry:{'ingredient:pasta|g':250}};
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 assert.equal(f.saved,0);
 assert.equal(f.state.stockV41,null);
 assert.equal(f.week.v41MealActions,undefined);
});

test('Annuler un repas validé remet ses ingrédients en stock et débloque sa suppression',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'undo-start',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),250);
 assert.ok(Array.isArray(f.week.v41MealActions['0:pasta-dinner'].movements),
  'les validations récentes sauvegardent la quantité exacte à annuler');
 const before=f.saved;
 f.invoke('v41-undo-validation',{index:0,id:'pasta-dinner',dataset:{kind:'recipe'}});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 assert.equal(f.week.v41MealActions['0:pasta-dinner'],undefined);
 assert.equal(f.saved,before+1);
 const history=f.state.stockV41.history.at(-1);
 assert.match(history.label,/Annulation de validation/);
 f.ctx.clearMealWithPair(f.week,0);
 assert.equal(f.week.meals[0],null);
 const saved=f.saved;
 f.invoke('v41-undo-validation',{index:0,id:'pasta-dinner',dataset:{kind:'recipe'}});
 assert.equal(f.saved,saved,'impossible de créditer deux fois la même annulation');
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
});

test('V41 déjà utilisée : une validation ancienne reste annulable avec quantités reconstituées',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'undo-legacy',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs(f.inputs);
 f.week.meals[2]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-eat-recipe',{index:2,id:'pasta-dinner'});
 delete f.week.v41MealActions['2:pasta-dinner'].movements;
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),250);
 let prompt='';
 globalThis.confirm=message=>{prompt=message;return true};
 f.invoke('v41-undo-validation',{index:2,id:'pasta-dinner',dataset:{kind:'recipe'}});
 assert.match(prompt,/recette ACTUELLE/);
 assert.match(prompt,/250 g de Pâtes/);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 assert.equal(f.week.v41MealActions['2:pasta-dinner'],undefined);
});

test('La validation de restes se retire sans ajouter d’ingrédients',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'undo-leftovers-start',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.week.meals[3]={type:'leftovers',recipeId:'pasta-dinner',fromIndex:0,leftoverPortions:2};
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 f.invoke('v41-eat-leftovers',{index:3,id:'pasta-dinner',dataset:{source:'0'}});
 const stockBefore=JSON.stringify(f.state.stockV41);
 f.invoke('v41-undo-validation',{index:0,id:'pasta-dinner',dataset:{kind:'recipe'}});
 assert.match(f.message,/Annule d’abord la validation des restes/);
 assert.equal(JSON.stringify(f.state.stockV41),stockBefore);
 f.invoke('v41-undo-validation',{index:3,id:'pasta-dinner',dataset:{kind:'leftovers',source:'0'}});
 assert.equal(f.week.v41MealActions['3:leftovers:0:pasta-dinner'],undefined);
 assert.equal(JSON.stringify(f.state.stockV41),stockBefore);
 f.invoke('v41-undo-validation',{index:0,id:'pasta-dinner',dataset:{kind:'recipe'}});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
});

test('Annuler la mise au congélateur rétablit ingrédients et portions uniquement si le lot est intact',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'undo-freeze-start',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:1000,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs({...f.inputs,v41FreezePortions:2});
 f.week.meals[1]={type:'recipe',recipeId:'pasta-dinner',people:4};
 f.invoke('v41-confirm-freeze-recipe',{index:1,id:'pasta-dinner'});
 const action=f.week.v41MealActions['1:pasta-dinner'];
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),2);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 f.week.meals[3]={type:'frozen',lotId:action.lotId,recipeId:'pasta-dinner',portions:2};
 const frozenBefore=JSON.stringify(f.state.stockV41);
 f.invoke('v41-undo-validation',{index:1,id:'pasta-dinner',dataset:{kind:'recipe'}});
 assert.match(f.message,/portions.*utilisées, modifiées ou réservées/);
 assert.equal(JSON.stringify(f.state.stockV41),frozenBefore);
 delete f.week.meals[3];
 f.invoke('v41-undo-validation',{index:1,id:'pasta-dinner',dataset:{kind:'recipe'}});
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),0);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),1000);
 assert.equal(f.week.v41MealActions['1:pasta-dinner'],undefined);
});

test('Une portion de plat congelé mangée par erreur peut être rétablie dans le même lot',()=>{
 const stock=applyStockTransactionV41(emptyStockV41(),{id:'undo-eat-frozen',movements:[
  {type:'freezer',direction:'add',lotId:'lot-pasta',recipeId:'pasta-dinner',name:'Pâtes',portions:3}
 ]}).stock;
 const f=fixture(stock);withInputs(f.inputs);
 f.week.meals[4]={type:'frozen',lotId:'lot-pasta',recipeId:'pasta-dinner',portions:2};
 f.invoke('v41-eat-frozen',{index:4});
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),1);
 const saved=f.saved;
 f.invoke('v41-undo-validation',{index:4,dataset:{kind:'frozen'}});
 assert.equal(f.saved,saved+1);
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),3);
 assert.equal(f.week.meals[4].consumed,undefined);
 assert.equal(f.week.v41MealActions['4:frozen'],undefined);
 f.invoke('v41-undo-validation',{index:4,dataset:{kind:'frozen'}});
 assert.equal(f.saved,saved+1);
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),3);
});

test('Les boutons de récupération sont visibles dans Stock et dans le menu du repas',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'undo-display-stock',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 const page=renderStockV41({state:f.state,week:f.week,weekId,view:'week',
  recipeById:f.ctx.recipeById,mealDishes,mealLeftovers});
 assert.match(page,/data-action="v41-undo-validation"/);
 assert.match(page,/data-kind="recipe"/);
 assert.match(page,/Annuler la validation/);
 assert.match(app,/function undoMealValidationControlsV41\(/);
 assert.match(app,/undoMealValidationControlsV41\(index,meal\)/);
 assert.match(style,/\.v41-meal-undo-panel/);
});

test('Une validation orpheline bloque le repas : l’interface propose une réparation explicite',()=>{
 const f=fixture();withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.week.v41MealActions={'0:ancien-plat':{status:'eaten',at:'2026-10-30T12:00:00.000Z'}};
 const source=app.slice(app.indexOf('function undoMealValidationControlsV41('),app.indexOf('function pickMeal(index)'));
 assert.ok(source.startsWith('function undoMealValidationControlsV41('));
 const controls=runInNewContext(source+';undoMealValidationControlsV41',{
  getWeek:()=>f.week,mealDishes,mealLeftovers,
  recipeById:id=>recipes.find(r=>r.id===id),
  html:x=>String(x)
 });
 const panel=controls(0,f.week.meals[0]);
 assert.match(panel,/v41-review-old-validation/);
 assert.match(panel,/Examiner 1 ancienne validation bloquante/);
 f.invoke('v41-review-old-validation',{index:0});
 assert.match(f.modals.at(-1).title,/Débloquer un ancien repas/);
 assert.match(f.modals.at(-1).body,/sans changer le stock/);
 const before=JSON.stringify(f.state.stockV41);
 f.invoke('v41-confirm-reset-old-validation',{index:0});
 assert.equal(Object.keys(f.week.v41MealActions).length,0);
 assert.equal(JSON.stringify(f.state.stockV41),before,'aucun remboursement d’ingrédient inventé');
 assert.equal(f.saved,1);
 const saved=f.saved;
 f.invoke('v41-confirm-reset-old-validation',{index:0});
 assert.equal(f.saved,saved,'deuxième confirmation sans effet');
});

test('Une validation encore liée au plat n’est jamais réinitialisée sans inversion de stock',()=>{
 const f=fixture();withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.week.v41MealActions={'0:pasta-dinner':{status:'eaten',at:'2026-10-30T12:00:00.000Z'}};
 f.invoke('v41-review-old-validation',{index:0});
 assert.match(f.message,/Aucune ancienne validation/);
 f.invoke('v41-confirm-reset-old-validation',{index:0});
 assert.ok(f.week.v41MealActions['0:pasta-dinner']);
 assert.equal(f.saved,0);
});

test('Un ancien verrou de congélation ne peut pas être effacé sans reconstituer le lot',()=>{
 const f=fixture();withInputs(f.inputs);
 f.week.meals[0]={type:'ordered'};
 f.week.v41MealActions={'0:ancien-congelé':{status:'frozen',lotId:'lot:old',frozenPortions:2}};
 f.invoke('v41-review-old-validation',{index:0});
 assert.match(f.modals.at(-1).body,/Réinitialisation automatique indisponible/);
 assert.doesNotMatch(f.modals.at(-1).body,/data-action="v41-confirm-reset-old-validation"/);
 f.invoke('v41-confirm-reset-old-validation',{index:0});
 assert.match(f.message,/Congélateur impliqué/);
 assert.ok(f.week.v41MealActions['0:ancien-congelé']);
 assert.equal(f.saved,0);
});

test('Un repas réellement présent mais bloqué offre une réparation sans crédit de stock',()=>{
 const start=applyStockTransactionV41(emptyStockV41(),{id:'recovery-start',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(start);withInputs(f.inputs);
 f.week.meals[2]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-eat-recipe',{index:2,id:'pasta-dinner'});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),250);
 const source=app.slice(app.indexOf('function undoMealValidationControlsV41('),app.indexOf('function pickMeal(index)'));
 const controls=runInNewContext(source+';undoMealValidationControlsV41',{
  getWeek:()=>f.week,mealDishes,mealLeftovers,
  recipeById:id=>recipes.find(r=>r.id===id),html:x=>String(x)
 });
 const shown=controls(2,f.week.meals[2]);
 assert.match(shown,/v41-review-validation-recovery/,'l’alternative est visible sur le repas validé');
 assert.match(shown,/Toujours bloqué \? Réparer ce repas/);
 f.invoke('v41-review-validation-recovery',{index:2,id:'pasta-dinner'});
 assert.match(f.modals.at(-1).body,/ne sera pas augmenté/);
 assert.match(f.modals.at(-1).body,/Débloquer ce plat sans changer le stock/);
 const stockBefore=JSON.stringify(f.state.stockV41);
 f.invoke('v41-confirm-validation-recovery',{index:2,id:'pasta-dinner'});
 assert.equal(JSON.stringify(f.state.stockV41),stockBefore);
 assert.equal(f.week.v41MealActions['2:pasta-dinner'],undefined);
 assert.equal(f.week.v41RecoveryLog.length,1);
 assert.equal(f.week.v41RecoveryLog[0].stockAdjusted,false);
 assert.equal(f.saved,2);
 // Une suppression après réparation est à nouveau possible.
 f.ctx.clearMealWithPair(f.week,2);
 assert.equal(f.week.meals[2],null);
 const saved=f.saved;
 f.invoke('v41-confirm-validation-recovery',{index:2,id:'pasta-dinner'});
 assert.equal(f.saved,saved);
});

test('La réparation manuelle ne contourne pas les validations de congélation',()=>{
 const start=applyStockTransactionV41(emptyStockV41(),{id:'recovery-freezer',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(start);withInputs({...f.inputs,v41FreezePortions:1});
 f.week.meals[2]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-confirm-freeze-recipe',{index:2,id:'pasta-dinner'});
 const stockBefore=JSON.stringify(f.state.stockV41);
 f.invoke('v41-review-validation-recovery',{index:2,id:'pasta-dinner'});
 assert.match(f.message,/Les congélations doivent être annulées/);
 f.invoke('v41-confirm-validation-recovery',{index:2,id:'pasta-dinner'});
 assert.equal(JSON.stringify(f.state.stockV41),stockBefore);
 assert.ok(f.week.v41MealActions['2:pasta-dinner']);
 assert.equal(f.saved,1);
});

test('Une réparation manuelle bloque tant que les restes sont validés',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'recovery-leftover',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g'}
 ]}).stock;
 const f=fixture(initial);withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:4};
 f.week.meals[3]={type:'leftovers',recipeId:'pasta-dinner',fromIndex:0,leftoverPortions:2};
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 f.invoke('v41-eat-leftovers',{index:3,id:'pasta-dinner',dataset:{source:'0'}});
 f.invoke('v41-review-validation-recovery',{index:0,id:'pasta-dinner'});
 assert.match(f.modals.at(-1).body,/Annule d’abord la validation/);
 assert.doesNotMatch(f.modals.at(-1).body,/data-action="v41-confirm-validation-recovery"/);
 const stockBefore=JSON.stringify(f.state.stockV41);
 f.invoke('v41-confirm-validation-recovery',{index:0,id:'pasta-dinner'});
 assert.match(f.message,/Annule d’abord les restes/);
 assert.equal(JSON.stringify(f.state.stockV41),stockBefore);
 assert.ok(f.week.v41MealActions['0:pasta-dinner']);
});

test('V41.3 : aperçu exact avec conversion boîte/grammes et transaction totalement immuable',()=>{
 const start=applyStockTransactionV41(emptyStockV41(),{id:'v413-import',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:1,unit:'paquet',product:products[0]}
 ]}).stock;
 const snapshot=JSON.stringify(start);
 const take=[{type:'inventory',direction:'consume',identity:'ingredient:pasta',name:'Pâtes',amount:250,unit:'g'}];
 const preview=previewStockMovementsV413(start,take);
 assert.equal(preview.lines.length,1);
 assert.equal(preview.lines[0].before,500);
 assert.equal(preview.lines[0].after,250);
 assert.match(preview.lines[0].text,/Pâtes : 500 → 250 g \(−250 g\)/);
 assert.equal(JSON.stringify(start),snapshot,'l’aperçu ne change aucune quantité ni historique');
 const add=previewStockMovementsV413(start,[{
  type:'inventory',direction:'add',identity:'ingredient:pasta',
  name:'Pâtes',amount:1,unit:'paquet',product:products[0]
 }]);
 assert.equal(add.lines[0].before,500);
 assert.equal(add.lines[0].after,1000);
 assert.match(stockConfirmationTextV413(start,take,'Plat mangé'),/Valider ces mouvements de stock/);
 assert.equal(start.applied['v413:preview:never-persisted'],undefined);
});

test('V41.3 : avant C’est mangé la confirmation montre avant/après et un refus ne déduit rien',()=>{
 const start=applyStockTransactionV41(emptyStockV41(),{id:'v413-meal-start',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g',name:'Pâtes'}
 ]}).stock;
 const f=fixture(start);withInputs(f.inputs);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 let message='';
 globalThis.confirm=msg=>{message=String(msg);return false};
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 assert.match(message,/Pâtes : 500 → 250 g/);
 assert.equal(f.saved,0);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 assert.equal(f.week.v41MealActions,undefined);
 globalThis.confirm=()=>true;
 f.invoke('v41-eat-recipe',{index:0,id:'pasta-dinner'});
 assert.equal(f.saved,1);
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),250);
});

test('V41.3 : aperçu de courses et congélateur avant confirmation, sans écriture si annulation',()=>{
 const f=fixture();withInputs({...f.inputs,v41FreezePortions:1});
 f.week.extras.push({id:'e1',name:'Pâtes',qty:1,unit:'paquet'});
 f.week.checked=['produit:pack|achat'];
 let message='';
 globalThis.confirm=msg=>{message=String(msg);return false};
 f.invoke('v41-courses-done');
 assert.match(message,/Pâtes : 0 → 500 g/);
 assert.equal(f.saved,0);
 assert.equal(f.state.stockV41,null);
 // Le congélateur montre aussi l'ajout de portions avant la préparation.
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'freeze-ingredients',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',name:'Pâtes',amount:500,unit:'g'}
 ]}).stock;
 f.state.stockV41=initial;
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 f.invoke('v41-confirm-freeze-recipe',{index:0,id:'pasta-dinner'});
 assert.match(message,/Pâtes : 500 → 250 g/);
 assert.match(message,/❄️ Pâtes : 0 → 1 portion/);
 assert.equal(f.saved,0);
 assert.equal(availableFreezerV41(f.state.stockV41,'pasta-dinner'),0);
});

test('V41.3 : recherche dans ajouter au stock, boutons +/- et raccourci paquet',()=>{
 const f=fixture();withInputs(f.inputs);
 f.invoke('v41-add-stock');
 assert.match(f.modals.at(-1).body,/id="v413StockPickerSearch"/);
 assert.match(f.modals.at(-1).body,/data-v413-stock-choice/);
 assert.match(f.modals.at(-1).body,/id="v413StockPickerResults"/);
 f.invoke('v41-stock-select',{id:'pasta',dataset:{kind:'ingredient'}});
 assert.match(f.modals.at(-1).body,/data-action="v413-stock-step"/);
 assert.match(f.modals.at(-1).body,/data-action="v413-stock-one-package"/);
 const field={value:'1'},unit={value:'g'};
 globalThis.document={getElementById:id=>({v41StockQuantity:field,v41StockUnit:unit}[id]||null)};
 f.invoke('v413-stock-step',{dataset:{step:'1'}});
 assert.equal(field.value,'101');
 f.invoke('v413-stock-step',{dataset:{step:'-1'}});
 assert.equal(field.value,'1');
 f.invoke('v413-stock-one-package',{dataset:{unit:'paquet'}});
 assert.equal(field.value,'1');
 assert.equal(unit.value,'paquet');
 f.invoke('v41-save-stock',{id:'pasta',dataset:{kind:'ingredient'}});
 assert.equal(availableStockV41(f.state.stockV41,'ingredient:pasta','g'),500);
 assert.match(style,/v413-meal-quick/);
 assert.match(style,/data-v413-stock-choice/);
 assert.match(app,/e\.target\.id==='v413StockPickerSearch'/);
});

test('V41.3 : les actions du repas changent avec son statut et n’affichent pas de modification bloquée',()=>{
 const source=app.slice(app.indexOf('function quickMealActionsV413('),app.indexOf('function pickMeal(index)'));
 const f=fixture();const ctx={
  getWeek:()=>f.week,mealDishes,mealLeftovers,recipeById:id=>recipes.find(r=>r.id===id),
  html:x=>String(x)
 };
 const actions=runInNewContext(source+';quickMealActionsV413',ctx);
 f.week.meals[0]={type:'recipe',recipeId:'pasta-dinner',people:2};
 let row=actions(0,f.week.meals[0]);
 assert.match(row,/v41-eat-recipe/);
 assert.match(row,/v41-freeze-recipe/);
 f.week.v41MealActions={'0:pasta-dinner':{status:'eaten'}};
 row=actions(0,f.week.meals[0]);
 assert.equal(row,'','une recette déjà validée ne propose pas de nouvelle consommation');
 const modal=app.slice(app.indexOf('function pickMeal(index)'),app.indexOf('function extraSearchItems('));
 assert.match(modal,/if\(validated\)\{/);
 assert.match(modal,/undoMealValidationControlsV41\(index,meal\)/);
 assert.match(modal,/Les modifications sont protégées/);
 assert.match(modal,/remove-meal/);
 assert.match(modal,/quickMealActionsV413\(index,meal\)/);
});
