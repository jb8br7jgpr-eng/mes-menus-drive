// V41.17.1 — options de repas sans recette accessibles, aucune suppression de donnees.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const begin=app.indexOf('function openMealPickerV4116(index,kind=');
const end=app.indexOf('function pickMeal(index){',begin);
assert.ok(begin>0&&end>begin,'Le compositeur doit rester disponible');
const source=app.slice(begin,end);
function renderChoices(kind='recipes',meal=null){
 let modal=null;const w={meals:Array(14).fill(null)};w.meals[1]=meal;
 const ctx={
  getWeek:()=>w,isMealDoneV41:()=>false,mealCanEditV4117:()=>true,
  mealDishes:()=>[],mealLeftovers:()=>[],mealFrozenV4117:()=>[],mealProductsV412:()=>[],
  state:{recipes:[],stockV41:{freezer:{}},weeks:{}},
  recipeTypes:[],normalRecipeType:()=>'',menuMealLabelV411:()=> 'Samedi midi',
  mealRecipePickerResults:()=>'<div>Aucun plat</div>',recipeById:()=>null,
  availableLeftoverSources:()=>[],mealProductPickerResultsV412:()=>'<div>Produits</div>',
  stockModulesV41:{week:{remainingFreezerPortionsV41:()=>0}},currentWeek:'2026-11-14',
  html:x=>String(x),toast:()=>{},showModal:(title,body)=>{modal={title,body}}
 };
 runInNewContext(source+';openMealPickerV4116(1,'+JSON.stringify(kind)+');',ctx);
 return modal;
}
test('Le compositeur ouvert sur un créneau vide expose Pas de repas immédiatement',()=>{
 const r=renderChoices();
 assert.ok(r?.title.includes('Composer'));
 assert.match(r.body,/data-action="mark-no-meal" data-index="1"/);
 assert.match(r.body,/Pas de repas/);
 assert.match(r.body,/Restaurant, invitation, sortie/);
 assert.ok(r.body.indexOf('data-action="mark-no-meal"')<r.body.indexOf('mealRecipeResults'),
   'Option rapide affichée avant la liste des recettes');
});
test('Repas commandé accessible sans passer par un autre écran',()=>{
 const r=renderChoices();
 assert.match(r.body,/data-action="v41171-mark-ordered" data-index="1"/);
 assert.match(r.body,/Repas commandé/);
 assert.doesNotMatch(r.body,/Repas libre \/ commandé/);
});
test('Ces options persistent sur chacun des quatre onglets',()=>{
 for(const kind of ['recipes','leftovers','frozen','products']){
  const r=renderChoices(kind);
  assert.ok(r?.body.includes('data-action="mark-no-meal"'),kind);
  assert.ok(r?.body.includes('data-action="v41171-mark-ordered"'),kind);
  for(const tab of ['recipes','leftovers','frozen','products'])
   assert.ok(r.body.includes('data-kind="'+tab+'"'),tab+' visible dans '+kind);
 }
});
test('Les remplacements ne détruisent pas les fiches et sont protégés par une confirmation',()=>{
 assert.match(app,/else if\(mode==='mark-no-meal'\)/);
 const a=app.indexOf("else if(mode==='v41171-mark-ordered')"),b=app.indexOf("else if(mode==='mark-no-meal')",a);
 assert.ok(a>0&&b>a);
 const handler=app.slice(a,b);
 assert.match(handler,/isMealDoneV41\(w,index\)/);
 assert.match(handler,/confirm\(/);
 assert.match(handler,/clearMealWithPair\(w,index\)/);
 assert.match(handler,/w\.meals\[index\]=\{type:'ordered'\}/);
 assert.doesNotMatch(handler,/state\.recipes\s*=|state\.products\s*=|state\.stockV41\s*=/);
});
test('Le sélecteur et les actions de repas historiques restent accessibles',()=>{
 for(const action of ['choose-recipe','v4117-add-frozen','v4117-remove-frozen',
  'apply-leftovers','v412-select-product','v412-save-meal-product','mark-no-meal',
  'v41-replace-meal','move-copy-meal','save-dish-portions','remove-dish','remove-leftover'])
  assert.ok(app.includes("mode==='"+action+"'")||app.includes('data-action="'+action+'"'),action);
 assert.match(css,/\.v41171-choices-actions/);
 assert.doesNotThrow(()=>new Function(app));
});
test('Le cache iPhone reference les nouveaux JS et CSS',()=>{
 for(const file of [index,sw]){
  assert.match(file,/styles\.css\?v=20261111-41-19-visual/);
  assert.match(file,/app\.js\?v=20261111-41-19-visual/);
 }
 assert.match(sw,/menus-drive-v41-19-visual-20261111/);
});
