// V41.20 — gestes locaux et accompagnements, sans écritures cloud à chaque +/−.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const segment=(a,b)=>{
 const start=app.indexOf(a),end=app.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'bloc manquant : '+a);return app.slice(start,end);
};

test('les clics +/− des convives et recettes restent uniquement locaux',()=>{
 const actions=segment("else if(mode==='v4119-guests-step')", "else if(mode==='v4119-edit-leftover')");
 assert.match(actions,/mealDraftV4120\(index,true\)\.guests=next/);
 assert.match(actions,/mealDraftV4120\(index,true\)\.portions/);
 assert.match(actions,/refreshMealVisualV4120\(index\)/);
 assert.doesNotMatch(actions,/persist\(\)|render\(true\)|openMealPickerV4116\(/);
 assert.match(app,/mealComposerDraftV4120\)persist\(\)/);
 assert.match(app,/function persist\(\)\{\s*commitMealComposerDraftV4120\(\)/);
});

test('brouillon convives, portions et rôle ne change pas la donnée avant la sauvegarde',()=>{
 const w={meals:[{type:'recipe',recipeId:'riz',people:2,guests:2},...Array(13).fill(null)],v41MealActions:{}};
 let writes=0;
 const ctx={
  currentWeek:'2026-11-14',state:{weeks:{'2026-11-14':w}},
  getWeek:()=>w,isMealDoneV41:()=>false,
  mealDishes:m=>m?.type==='recipe'?[{recipeId:m.recipeId,people:m.people}]:[],
  setMealGuestsV412:(week,index,guests)=>{week.meals[index].guests=guests;return true},
  setMealDishes:(week,index,dishes)=>{week.meals[index]={...week.meals[index],people:dishes[0].people};},
  persist:()=>{writes++}
 };
 const src=segment('// V41.20 : gestes instantanés', 'function persist(){');
 const api=runInNewContext(src+';({mealDraftV4120,mealComposerPreviewV4120,commitMealComposerDraftV4120})',ctx);
 const draft=api.mealDraftV4120(0,true);
 draft.guests=3;draft.portions.riz=4;draft.roles.riz=true;
 const preview=api.mealComposerPreviewV4120(0,w.meals[0]);
 assert.equal(preview.people,4);
 assert.deepEqual([...preview.sideRecipeIds],['riz']);
 assert.equal(w.meals[0].people,2);
 assert.equal(w.meals[0].guests,2);
 assert.equal(writes,0);
 assert.equal(api.commitMealComposerDraftV4120(),true);
 assert.equal(w.meals[0].people,4);
 assert.equal(w.meals[0].guests,3);
 assert.deepEqual([...w.meals[0].sideRecipeIds],['riz']);
 assert.equal(writes,0,'le flush de brouillon ne fait pas un 2e appel réseau');
 assert.equal(api.commitMealComposerDraftV4120(),false);
});

test('accompagnement ne remplit pas un couvert, sans modifier les ingrédients',()=>{
 const coverage=runInNewContext(segment('function mealPortionCoverageV4119(', 'function setMealGuestsV412(')+
 ';mealPortionCoverageV4119',{
  mealDishes:m=>m?.dishes||[],
  mealFrozenV4117:()=>[],mealLeftovers:()=>[],mealProductsV412:()=>[]
 });
 const meal={dishes:[{recipeId:'riz',people:2},{recipeId:'poulet',people:2}],sideRecipeIds:['riz']};
 const frozen=JSON.stringify(meal);
 assert.equal(coverage(meal,2).planned,2);
 assert.equal(coverage({...meal,sideRecipeIds:[]},2).planned,4);
 assert.equal(JSON.stringify(meal),frozen,'aucune mutation du planning');
});

test('les recettes accompagnements restent identifiées après modification et retrait',()=>{
 const s=segment('function storeMealParts(w,index,parts){', 'function setMealProductsV412(');
 const ctx={
  mealProductsV412:()=>[],mealFrozenV4117:()=>[],
  mealDishes:m=>m?.type==='recipe'?[{recipeId:m.recipeId,people:m.people}]:
   m?.type==='multi'?m.dishes.filter(d=>!d.type):[],
 };
 const save=runInNewContext(s+';storeMealParts',ctx);
 const w={meals:[{type:'multi',dishes:[{recipeId:'riz',people:2},{recipeId:'poulet',people:2}],
  sideRecipeIds:['riz'],guests:2}],v4119GuestChoices:{}};
 save(w,0,[{recipeId:'riz',people:4},{recipeId:'poulet',people:2}]);
 assert.deepEqual([...w.meals[0].sideRecipeIds],['riz']);
 assert.equal(w.meals[0].dishes[0].people,4);
 save(w,0,[{recipeId:'poulet',people:2}]);
 assert.equal(w.meals[0].sideRecipeIds,undefined,'ne pas garder un accompagnement supprimé');
});

test('le catalogue utilise les fiches existantes sans raccourcis dupliqués',()=>{
 assert.doesNotMatch(app,/function mealSideShortcutsV4120\(/);
 assert.doesNotMatch(app,/data-action="v4120-open-side"/);
 assert.doesNotMatch(app,/data-action="v4120-open-main"/);
 assert.match(app,/function mealProductPickerResultsV412\(/);
 assert.match(app,/unifiedCatalogueSourceV4114\(\)/);
 assert.match(app,/v4121SideProductResults/);
});
test('recettes directement proposées pour les convives, sans seconde saisie',()=>{
 const picker=segment('function mealPickerBodyV4121(', 'function pickMeal(index){');
 assert.doesNotMatch(picker,/id="mealPeople"/);
 assert.match(app,/mealComposerGuestsV4119\(index,w\.meals\[index\]\)/);
 assert.match(app,/data-action="v4120-toggle-side"/);
 assert.match(app,/À préparer/);
 assert.match(picker,/v4121-source-nav/);
 assert.doesNotMatch(picker,/v4120-quick-sources|v4120-side-shortcuts|v4120-role-picker/);
 assert.match(styles,/\.v4121-source-nav/);
 assert.match(styles,/\.v4121-picker-panel/);
 assert.match(html,/41-20-flow/);
 assert.match(sw,/41-20-flow/);
 assert.doesNotThrow(()=>new Function(app));
});
