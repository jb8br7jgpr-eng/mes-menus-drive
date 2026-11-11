// Régression V41.21 -> V41.22 : source unique, quatre choix, sans rôle imposé.
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
const modes=['recipes','leftovers','frozen','products'];
test('Quatre catégories, pas de raccourcis redondants ni d’accompagnement',()=>{
 const source=slice('function openMealPickerV4116(', 'function pickMeal(index){');
 assert.match(source,/const modes=\['recipes','leftovers','frozen','products'\]/);
 assert.match(source,/v4121-source-nav/);
 assert.match(source,/v4121PickerPanel/);
 assert.ok(source.indexOf('tabs+')<source.indexOf('mealPickerBodyV4121(index,selected)'));
 assert.doesNotMatch(source,/v4120-quick-sources|v4120-side-shortcuts|v4120-role-picker/);
 assert.doesNotMatch(source,/data-kind="side"/);
 assert.doesNotMatch(app,/function mealSideShortcutsV4120\(/);
 assert.doesNotMatch(app,/function mealSidePickerResultsV4121\(/);
 assert.doesNotMatch(app,/data-action="v4120-toggle-side"/);
 assert.match(css,/\.v4121-source-nav/);
 assert.match(css,/repeat\(4,minmax\(0,1fr\)\)/);
 assert.doesNotThrow(()=>new Function(app));
});
test('Changer de source ne reconstruit ni la fenêtre ni les données serveur',()=>{
 const code=slice('function switchMealComposerSourceV4121(', 'function openMealPickerV4116(');
 const buttons=modes.map(kind=>({
  dataset:{kind},aria:null,
  classList:{toggle(_,v){this.active=v}},setAttribute(_,value){this.aria=value}
 }));
 const bar={querySelectorAll:()=>buttons,getBoundingClientRect:()=>({top:170})};
 const panel={innerHTML:'ancien contenu'};
 const composer={dataset:{v4119Kind:'recipes'},querySelector:k=>k==='#v4121PickerPanel'?panel:bar};
 const modal={scrollTop:280,getBoundingClientRect:()=>({top:80})};
 const api=runInNewContext(code+';switchMealComposerSourceV4121',{
  modalRoot:{querySelector:k=>k==='.v4119-composer'?composer:k==='.modal'?modal:null},
  mealPickerBodyV4121:(i,k)=>'<div>'+i+':'+k+'</div>',
  getWeek:()=>({}),isMealDoneV41:()=>false,
  openMealPickerV4116:()=>{throw Error('pas de nouvelle fenêtre')},
  persist:()=>{throw Error('pas de requête cloud')},
  render:()=>{throw Error('pas de rendu du calendrier')}
 });
 api(1,'frozen');
 assert.equal(composer.dataset.v4119Kind,'frozen');
 assert.equal(panel.innerHTML,'<div>1:frozen</div>');
 assert.equal(buttons[2].aria,'true');
 assert.equal(modal.scrollTop,304);
 api(1,'products');
 assert.equal(panel.innerHTML,'<div>1:products</div>');
 assert.equal(buttons[3].aria,'true');
});
test('Plat propose toutes les recettes sans distinguer leur rôle',()=>{
 const code=slice('function mealPickerBodyV4121(', 'function switchMealComposerSourceV4121(');
 const ctx={
  getWeek:()=>({meals:Array(14).fill(null)}),mealRecipeRoleV4120:'side',
  state:{recipes:[],stockV41:{freezer:{}}},mealDishes:()=>[],
  mealFrozenV4117:()=>[],mealLeftovers:()=>[],mealProductsV412:()=>[],
  availableLeftoverSources:()=>[],recipeTypes:[],normalRecipeType:()=>'',html:v=>String(v),
  mealRecipePickerResults:()=>'<button>Patates sautées</button><button>Ratatouille</button>',
  mealProductPickerResultsV412:()=>'<button>Riz en sachet</button>',
  mealComposerGuestsV4119:()=>2
 };
 const api=runInNewContext(code+';({render:mealPickerBodyV4121,role:()=>mealRecipeRoleV4120})',ctx);
 const main=api.render(0,'recipes');
 assert.match(main,/Patates sautées/);
 assert.match(main,/Ratatouille/);
 assert.equal(api.role(),'main');
 assert.match(main,/id="mealRecipeResults"/);
 assert.doesNotMatch(main,/v4121SideResults/);
 assert.match(api.render(0,'products'),/Riz en sachet/);
 assert.doesNotMatch(code,/kind==='side'/);
});
test('Recettes ajoutées sans classification, et produits reviennent sur Produit',()=>{
 const src=slice("else if(mode==='choose-recipe')", "else if(mode==='v412-save-meal-product')");
 assert.match(src,/addRecipeToMeal\(w,index,id,portions\)/);
 assert.match(src,/openMealPickerV4116\(index,'recipes'\)/);
 assert.doesNotMatch(src,/sideRecipeIds/);
 assert.match(src,/mealProductReturnKindV4121='products'/);
 assert.match(app,/openMealPickerV4116\(index,mealProductReturnKindV4121\)/);
});
test('États spéciaux et validation restent présents',()=>{
 const src=slice('function openMealPickerV4116(', 'function pickMeal(index){');
 assert.match(src,/data-action="mark-no-meal"/);
 assert.match(src,/data-action="v41171-mark-ordered"/);
 assert.match(src,/mealComposerVisualV4119\(index,meal\)/);
 assert.match(src,/data-action="v4119-finish"/);
 assert.doesNotMatch(src,/state\.stockV41\s*=/);
});
