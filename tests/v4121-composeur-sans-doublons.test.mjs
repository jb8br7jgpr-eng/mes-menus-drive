// V41.21 : unique source de sélection, résultats accolés, aucun doublon.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
function slice(a,b){
 const first=app.indexOf(a),last=app.indexOf(b,first+a.length);
 assert.ok(first>=0&&last>first,'bloc source absent : '+a);
 return app.slice(first,last);
}

test('Une navigation de cinq catégories, sans raccourci ni deuxième barre',()=>{
 const source=slice('function openMealPickerV4116(', 'function pickMeal(index){');
 assert.match(source,/const modes=\['recipes','side','leftovers','frozen','products'\]/);
 assert.match(source,/v4121-source-nav/);
 assert.match(source,/v4121PickerPanel/);
 assert.ok(source.indexOf('tabs+')<source.indexOf('mealPickerBodyV4121(index,selected)'));
 assert.doesNotMatch(source,/v4120-quick-sources|v4120-side-shortcuts|v4120-role-picker/);
 assert.doesNotMatch(app,/function mealSideShortcutsV4120\(/);
 assert.match(css,/\.v4121-source-nav/);
 assert.match(css,/\.v4121-picker-panel/);
 assert.doesNotThrow(()=>new Function(app));
});

test('Choix de catégorie : mise à jour locale du panneau sous la barre, sans serveur',()=>{
 const code=slice('function switchMealComposerSourceV4121(', 'function openMealPickerV4116(');
 const buttons=['recipes','side','leftovers','frozen','products'].map(kind=>({
  dataset:{kind},active:null,aria:null,
  classList:{toggle(_,v){this.active=v}},
  setAttribute(_,value){this.aria=value}
 }));
 const bar={querySelectorAll:()=>buttons,getBoundingClientRect:()=>({top:170})};
 const panel={innerHTML:'ancien contenu'};
 const composer={dataset:{v4119Kind:'recipes'},querySelector:k=>k==='#v4121PickerPanel'?panel:bar};
 const modal={scrollTop:280,getBoundingClientRect:()=>({top:80})};
 const ctx={
  modalRoot:{querySelector:k=>k==='.v4119-composer'?composer:k==='.modal'?modal:null},
  mealPickerBodyV4121:(i,k)=>'<div>'+i+':'+k+'</div>',
  getWeek:()=>({}),isMealDoneV41:()=>false,
  openMealPickerV4116:()=>{throw Error('ne pas reconstruire la fenêtre')},
  persist:()=>{throw Error('aucune requête cloud par changement')},
  render:()=>{throw Error('aucun rendu calendrier')}
 };
 const api=runInNewContext(code+';switchMealComposerSourceV4121',ctx);
 api(1,'side');
 assert.equal(composer.dataset.v4119Kind,'side');
 assert.equal(panel.innerHTML,'<div>1:side</div>');
 assert.equal(buttons[1].aria,'true');
 assert.equal(buttons[0].aria,'false');
 assert.ok(modal.scrollTop<300);
 api(1,'frozen');
 assert.equal(panel.innerHTML,'<div>1:frozen</div>');
 assert.equal(buttons[3].aria,'true');
});

test('Accompagnement regroupe recettes et produits existants dans un seul panneau',()=>{
 const code=slice('function mealPickerBodyV4121(', 'function switchMealComposerSourceV4121(');
 const ctx={
  getWeek:()=>({meals:Array(14).fill(null)}),mealRecipeRoleV4120:'main',
  state:{recipes:[],stockV41:{freezer:{}}},mealDishes:()=>[],mealFrozenV4117:()=>[],
  mealLeftovers:()=>[],mealProductsV412:()=>[],availableLeftoverSources:()=>[],
  recipeTypes:[],normalRecipeType:()=>'',html:v=>String(v),
  mealRecipePickerResults:()=>'<button>Recette riz</button>',
  mealProductPickerResultsV412:()=>'<button>Tomates Grand Frais</button>',
  mealComposerGuestsV4119:()=>2
 };
 const ui=runInNewContext(code+';({render:mealPickerBodyV4121,role:()=>mealRecipeRoleV4120})',ctx);
 const side=ui.render(0,'side');
 assert.match(side,/Rechercher un accompagnement/);
 assert.match(side,/Recette riz/);
 assert.match(side,/Tomates Grand Frais/);
 assert.match(side,/v4121SideProductResults/);
 assert.doesNotMatch(side,/Accompagnements rapides|v4120-role-picker/);
 assert.equal(ui.role(),'side');
 const main=ui.render(0,'recipes');
 assert.match(main,/Recette riz/);
 assert.doesNotMatch(main,/v4121SideProductResults/);
 assert.equal(ui.role(),'main');
});

test('Les filtres de recherche mettent à jour les recettes ET les produits accompagnements',()=>{
 const src=slice('function refreshMealRecipePicker(){', '// V41.1 :');
 assert.match(src,/sideResults\.innerHTML=mealProductPickerResultsV412\(index,term\)/);
 assert.match(src,/results\.innerHTML=mealRecipePickerResults\(index,term,type\)/);
 assert.match(app,/mealProductReturnKindV4121/);
 assert.match(app,/openMealPickerV4116\(index,mealProductReturnKindV4121\)/);
});

test('Les repas spéciaux et la composition sont conservés, sans modification du stock',()=>{
 const src=slice('function openMealPickerV4116(', 'function pickMeal(index){');
 assert.match(src,/data-action="mark-no-meal"/);
 assert.match(src,/data-action="v41171-mark-ordered"/);
 assert.match(src,/mealComposerVisualV4119\(index,meal\)/);
 assert.match(src,/data-action="v4119-finish"/);
 assert.doesNotMatch(src,/state\.stockV41\s*=/);
});
