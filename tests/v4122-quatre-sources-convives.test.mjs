// Speedrive V41.22 — composition libre et panneau de convives sans double comptage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const section=(a,b)=>{
 const i=app.indexOf(a),j=app.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'bloc manquant '+a);
 return app.slice(i,j);
};
const dishes=meal=>meal?.dishes||[];
const frozen=meal=>meal?.frozen||[];
const leftovers=meal=>meal?.leftovers||[];
const products=meal=>meal?.products||[];
const coverage=runInNewContext(section('function mealPortionCoverageV4119(', 'function setMealGuestsV412(')+
 ';mealPortionCoverageV4119',{
 mealDishes:dishes,mealFrozenV4117:frozen,mealLeftovers:leftovers,mealProductsV412:products
});
test('patates et ratatouille : 2 portions chacune pour 2 personnes restent 2 couverts',()=>{
 const meal={dishes:[{recipeId:'patates',people:2},{recipeId:'ratatouille',people:2}]};
 const before=JSON.stringify(meal);
 assert.equal(coverage(meal,2).planned,2);
 assert.equal(coverage(meal,2).filled,2);
 assert.equal(coverage(meal,2).missing,0);
 assert.equal(JSON.stringify(meal),before);
 // Les anciennes métadonnées accompagnement ne doivent plus changer ce calcul.
 assert.equal(coverage({...meal,sideRecipeIds:['ratatouille']},2).planned,2);
});
test('restes, congélateur et produits avec portions complètent les convives',()=>{
 const meal={dishes:[{recipeId:'ratatouille',people:1}],
  frozen:[{lotId:'f1',portions:1}],
  products:[{productId:'tomates',qty:2,unit:'pièce'}]};
 assert.equal(coverage(meal,2).planned,2);
 assert.equal(coverage(meal,2).filled,2);
 assert.equal(coverage({products:meal.products},2).filled,0,
  'un produit ne compte pour des convives que si les portions sont renseignées');
 assert.equal(coverage({products:[{productId:'cordon',qty:2,unit:'pièce',servings:2}]},2).filled,2);
});
test('Le panneau convives est dépliable, accessible et sans couverture en doublon',()=>{
 const block=section('function mealComposerVisualV4119(', 'function showSpecialMealV4119(');
 assert.match(block,/<details class="v4122-people-panel"/);
 assert.match(block,/Personnes à table/);
 assert.match(block,/role="progressbar"/);
 assert.match(block,/Couverture indicative/);
 assert.match(block,/v4119-guests-step/);
 assert.match(block,/v4119-dish-step/);
 assert.doesNotMatch(block,/<section class="v4119-coverage"/);
 assert.doesNotMatch(block,/v4120-toggle-side/);
 assert.doesNotMatch(block,/Définir comme accompagnement|Passer en plat principal/);
 assert.match(css,/\.v4122-people-panel/);
 assert.match(css,/\.v4122-people-panel\[open\]/);
});
test('Les boutons + et − maintiennent le panneau ouvert sans persister',()=>{
 const block=section('function refreshMealVisualV4120(', 'function persist(){');
 assert.match(block,/wasOpen=/);
 assert.match(block,/panel\.open=wasOpen/);
 assert.doesNotMatch(block,/persist\(\)|commitLocalModification/);
});
test('Navigation quatre sources, options spéciales et cache iPhone séparé',()=>{
 const block=section('function openMealPickerV4116(', 'function pickMeal(index){');
 assert.match(block,/const modes=\['recipes','leftovers','frozen','products'\]/);
 assert.doesNotMatch(block,/data-kind="side"/);
 assert.match(block,/data-action="mark-no-meal"/);
 assert.match(block,/data-action="v41171-mark-ordered"/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 for(const file of [index,sw]){
  assert.match(file,/styles\.css\?v=20261111-41-22-four-sources/);
  assert.match(file,/app\.js\?v=20261111-41-22-four-sources/);
 }
 assert.match(sw,/menus-drive-v41-22-four-sources-20261111/);
 assert.doesNotThrow(()=>new Function(app));
});
