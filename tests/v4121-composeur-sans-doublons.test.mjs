// V41.21 : un seul parcours d'ajout, résultats accolés et recherche mixte accompagnements.
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
test('Une seule navigation de cinq catégories, résultats immédiatement dessous',()=>{
 const source=slice('function openMealPickerV4116(', 'function pickMeal(index){');
 assert.match(source,/const modes=\['recipes','side','leftovers','frozen','products'\]/);
 assert.match(source,/v4121-source-nav/);
 assert.match(source,/v4121PickerPanel/);
 assert.ok(source.indexOf('tabs+')<source.indexOf('mealPickerBodyV4121(index,selected)'));
 assert.doesNotMatch(source,/v4120-quick-sources|v4120-side-shortcuts|v4120-role-picker/);
 assert.doesNotMatch(app,/function mealSideShortcutsV4120\(/);
 assert.doesNotMatch(app,/data-action="v4120-open-(main|side)"/);
 assert.match(css,/\.v4121-source-nav/);
 assert.match(css,/\.v4121-picker-panel/);
 assert.doesNotThrow(()=>new Function(app));
});
test('Le choix de catégorie modifie le panneau en place, jamais le serveur',()=>{
 const code=slice('function switchMealComposerSourceV4121(', 'function openMealPickerV4116(');
 const buttons=['recipes','side','leftovers','frozen','products'].map(kind=>({
  dataset:{kind},active:null,aria:null,
  classList:{toggle(_,v){this.active=v}},setAttribute(_,value){this.aria=value}
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
  persist:()=>{throw Error('aucune requête cloud')},
  render:()=>{throw Error('aucun rechargement calendrier')}
 };
 const api=runInNewContext(code+';switchMealComposerSourceV4121',ctx);
 api(1,'side');
 assert.equal(composer.dataset.v4119Kind,'side');
 assert.equal(panel.innerHTML,'<div>1:side</div>');
 assert.equal(buttons[1].aria,'true');
 assert.equal(buttons[0].aria,'false');
 assert.equal(modal.scrollTop,304,'la barre est positionnée sous l’entête, sans saut en bas de liste');
 api(1,'frozen');
 assert.equal(panel.innerHTML,'<div>1:frozen</div>');
 assert.equal(buttons[3].aria,'true');
});
test('Un seul champ et une seule liste pour les accompagnements',()=>{
 const code=slice('function mealPickerBodyV4121(', 'function switchMealComposerSourceV4121(');
 const ctx={
  getWeek:()=>({meals:Array(14).fill(null)}),mealRecipeRoleV4120:'main',
  state:{recipes:[],stockV41:{freezer:{}}},mealDishes:()=>[],mealFrozenV4117:()=>[],
  mealLeftovers:()=>[],mealProductsV412:()=>[],availableLeftoverSources:()=>[],
  recipeTypes:[],normalRecipeType:()=>'',html:v=>String(v),
  mealRecipePickerResults:()=>'<button>Recette riz</button>',
  mealSidePickerResultsV4121:()=>'<button>Riz</button><button>Tomates Grand Frais</button>',
  mealProductPickerResultsV412:()=>'<button>Produit</button>',
  mealComposerGuestsV4119:()=>2
 };
 const ui=runInNewContext(code+';({render:mealPickerBodyV4121,role:()=>mealRecipeRoleV4120})',ctx);
 const side=ui.render(0,'side');
 assert.match(side,/Rechercher un accompagnement/);
 assert.match(side,/Riz/);
 assert.match(side,/Tomates Grand Frais/);
 assert.match(side,/id="v4121SideResults"/);
 assert.doesNotMatch(side,/v4121SideProductResults|mealRecipeResults|Accompagnements rapides/);
 assert.equal(ui.role(),'side');
 const main=ui.render(0,'recipes');
 assert.match(main,/Recette riz/);
 assert.doesNotMatch(main,/v4121SideResults/);
 assert.equal(ui.role(),'main');
});
test('Liste mixte: recettes et produits du catalogue sans doublons de références',()=>{
 const code=slice('function mealSidePickerResultsV4121(', 'function mealPickerBodyV4121(');
 const ingredients=[{id:'t1',name:'Tomates',store:'grandfrais',category:'Fruits et légumes'}];
 const products=[{id:'p1',name:'Riz basmati',store:'carrefour',category:'Épicerie'},
  {id:'p2',name:'Yaourt',store:'carrefour',category:'Produits frais'}];
 const week={meals:[{type:'products',products:[{productId:'p2',qty:1,unit:'pièce'}]}]};
 const ctx={
  getWeek:()=>week,mealDishes:()=>[],mealProductsV412:m=>m?.products||[],
  state:{recipes:[{id:'r1',name:'Carottes rôties',category:'Accompagnements'},
    {id:'r2',name:'Riz en sauce',category:'Riz & céréales'}]},
  normalRecipeType:v=>v,icons:{},html:v=>String(v),norm:v=>String(v).toLowerCase(),
  unifiedCatalogueSourceV4114:()=>[
   {type:'ingredient',id:'t1',item:ingredients[0],name:'Tomates',store:'grandfrais'},
   {type:'daily',id:'p1',item:products[0],name:'Riz basmati',store:'carrefour'},
   {type:'daily',id:'p1',item:products[0],name:'Riz basmati',store:'carrefour'},
   {type:'daily',id:'p2',item:products[1],name:'Yaourt',store:'carrefour'}
  ],productById:id=>products.find(p=>p.id===id)
 };
 const fn=runInNewContext(code+';mealSidePickerResultsV4121',ctx);
 const result=fn(0);
 assert.match(result,/Carottes rôties/);
 assert.match(result,/Tomates/);
 assert.match(result,/data-kind="ingredient"/);
 assert.match(result,/Riz basmati/);
 assert.equal((result.match(/Riz basmati/g)||[]).length,1,'une seule fiche produit par référence');
 assert.doesNotMatch(result,/Yaourt/,'fiche déjà planifiée non reproposée');
 assert.match(fn(0,'tomat'),/Tomates/);
 assert.doesNotMatch(fn(0,'tomat'),/Carottes rôties/);
});
test('Recherche commune sans écran ni champ de produit supplémentaire',()=>{
 const src=slice('function refreshMealRecipePicker(){', '// V41.1 :');
 assert.match(src,/side\.innerHTML=mealSidePickerResultsV4121/);
 assert.match(src,/results\.innerHTML=mealRecipePickerResults/);
 assert.doesNotMatch(src,/v4121SideProductResults/);
 assert.match(app,/mealProductReturnKindV4121/);
 assert.match(app,/openMealPickerV4116\(index,mealProductReturnKindV4121\)/);
});
test('Repas spéciaux, panier et stock demeurent intacts',()=>{
 const src=slice('function openMealPickerV4116(', 'function pickMeal(index){');
 assert.match(src,/data-action="mark-no-meal"/);
 assert.match(src,/data-action="v41171-mark-ordered"/);
 assert.match(src,/mealComposerVisualV4119\(index,meal\)/);
 assert.match(src,/data-action="v4119-finish"/);
 assert.doesNotMatch(src,/state\.stockV41\s*=/);
});
