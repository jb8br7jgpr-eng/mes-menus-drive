import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const appCode=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const uxCode=readFileSync(new URL('../ux-v4115.js',import.meta.url),'utf8');
const rayonCode=readFileSync(new URL('../rayon-filters-v4114.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

function makeEnv(options={}){
 let nodes=options.nodes||[],search=options.search||null;
 const calls=[];
 const app={
  firstElementChild:{},
  querySelector(sel){if(sel==='#v41StockSearch')return search;return null},
  querySelectorAll(sel){if(sel==='details')return nodes;return []}
 };
 const ctx={
  app,window:{scrollY:120,innerHeight:800,scrollTo:v=>calls.push(['scrollTo',v]),scrollBy:v=>calls.push(['scrollBy',v])},
  currentTab:'stock',renderCourses:()=>'',document:{createElement:()=>({innerHTML:'',querySelector:()=>null})},
  Event:class{constructor(type,options){this.type=type;this.bubbles=options?.bubbles}},
  captureCatalogueRayonUiV4115:()=>null,
  restoreCatalogueRayonUiV4115:()=>{},
  requestAnimationFrame:fn=>fn()
 };
 Object.assign(ctx,options.ctx||{});
 const api=runInNewContext(uxCode+
  ';({uxCaptureBeforeRenderV4115,uxRestoreAfterRenderV4115,uxViewKeyV4115,uxRefreshCourseCheckV4115,uxVisibleAnchorV4115})',ctx);
 return {api,app,ctx,calls,setSearch:x=>{search=x},setNodes:x=>{nodes=x}}
}

test('V41.15 : la recherche du stock revient après modification, indépendamment dans Maison et Congélateur',()=>{
 let dispatches=0;
 const home={value:'Lait',dispatchEvent:e=>{assert.equal(e.type,'input');dispatches++}};
 const env=makeEnv({search:home});
 env.api.uxRestoreAfterRenderV4115('stock','home');
 env.api.uxCaptureBeforeRenderV4115();
 home.value='';
 env.api.uxRestoreAfterRenderV4115('stock','home');
 assert.equal(home.value,'Lait');
 assert.equal(dispatches,1);
 env.api.uxCaptureBeforeRenderV4115();
 env.setSearch({value:'chili',dispatchEvent:e=>{dispatches++}});
 env.api.uxRestoreAfterRenderV4115('stock','freezer');
 env.api.uxCaptureBeforeRenderV4115();
 const another={value:'',dispatchEvent:()=>dispatches++};
 env.setSearch(another);
 env.api.uxRestoreAfterRenderV4115('stock','home');
 assert.equal(another.value,'Lait');
 assert.equal(dispatches,2);
});

test('V41.15 : les détails ouverts dans Courses/Drive restent ouverts après reconstruction',()=>{
 const details=[{dataset:{section:'favorites'},open:true},{dataset:{section:'checked'},open:false}];
 const env=makeEnv({nodes:details});
 env.api.uxRestoreAfterRenderV4115('courses','home');
 env.api.uxCaptureBeforeRenderV4115();
 env.setNodes([{dataset:{section:'favorites'},open:false},{dataset:{section:'checked'},open:true}]);
 env.api.uxRestoreAfterRenderV4115('courses','home');
 const replacement=env.app.querySelectorAll('details');
 assert.equal(replacement[0].open,true);
 assert.equal(replacement[1].open,false);
 env.setNodes([{dataset:{uxKey:'articles'},open:true}]);
 env.api.uxRestoreAfterRenderV4115('drive','home');
 env.api.uxCaptureBeforeRenderV4115();
 env.setNodes([{dataset:{uxKey:'articles'},open:false}]);
 env.api.uxRestoreAfterRenderV4115('drive','home');
 assert.equal(env.app.querySelectorAll('details')[0].open,true)
});

test('V41.15 : les rayons de Produits sont capturés et restaurés après changement de type',()=>{
 let captureCount=0,restoreCount=0;
 const expected={open:true,search:'frais',expanded:['Crémerie, œufs et produits frais']};
 const env=makeEnv({ctx:{
  captureCatalogueRayonUiV4115:()=>{captureCount++;return expected},
  restoreCatalogueRayonUiV4115:(context,snapshot)=>{assert.equal(context,'produits');assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),expected);restoreCount++}
 }});
 env.api.uxRestoreAfterRenderV4115('produits','home');
 env.api.uxCaptureBeforeRenderV4115();
 env.api.uxRestoreAfterRenderV4115('produits','home');
 assert.equal(captureCount,1);
 assert.equal(restoreCount,1)
});

test('V41.15 : le contexte est séparé selon les onglets et sections du stock',()=>{
 const env=makeEnv();
 assert.equal(env.api.uxViewKeyV4115('stock','home'),'stock:home');
 assert.equal(env.api.uxViewKeyV4115('stock','freezer'),'stock:freezer');
 assert.equal(env.api.uxViewKeyV4115('produits','home'),'produits');
 assert.equal(env.api.uxViewKeyV4115('courses','home'),'courses')
});

test('V41.15 : cochage des achats sans reconstruction totale et calcul métier inchangé',()=>{
 const start=appCode.indexOf("else if(e.target.matches('[data-check]')){");
 const end=appCode.indexOf("document.addEventListener('input'",start);
 assert.ok(start>0&&end>start,'gestionnaire de cases à cocher');
 const handler=appCode.slice(start,end);
 assert.match(handler,/w\.checked=e\.target\.checked\?\[\.\.\.new Set/);
 assert.match(handler,/persist\(\)/);
 assert.match(handler,/if\(!uxRefreshCourseCheckV4115\(e\.target\)\)render\(true\)/);
 assert.match(uxCode,/function uxRefreshCourseCheckV4115\(clickedInput\)/);
 assert.match(uxCode,/renderCourses\(\)/);
 assert.match(uxCode,/replace\('\.course-v33-progress'\)/);
 assert.match(uxCode,/replace\('\.course-summary'\)/);
 assert.match(uxCode,/replace\('\.course-store\.'\+cls\)/);
 assert.match(uxCode,/const anchor=adjacentInput/);
 assert.doesNotMatch(uxCode,/persist\(\)|state\.weeks\s*=|state\.stockV41\s*=/)
});

test('V41.15 : modales sans focus clavier automatique et scroll sauvegardé',()=>{
 const open=appCode.slice(appCode.indexOf('function showModal(title,body'),appCode.indexOf('function closeModal(){'));
 const close=appCode.slice(appCode.indexOf('function closeModal(){'),appCode.indexOf('function selectOptions('));
 assert.match(open,/uxModalPositionV4115=\{tab:currentTab,scrollY:window\.scrollY\}/);
 assert.match(open,/querySelector\('\.close-btn'\)/);
 assert.match(open,/focus\(\{preventScroll:true\}\)/);
 assert.doesNotMatch(open,/querySelector\(autoFocus\?'input,button'/);
 assert.match(close,/position\.tab===currentTab/);
 assert.match(close,/position\.scrollY/);
 assert.match(close,/anchored!==null&&currentTab==='produits'/)
});

test('V41.15 : les actions locales et la synchro Firebase ne forcent plus le retour en haut',()=>{
 const save=appCode.slice(appCode.indexOf('async function saveRecipe(e){'),appCode.indexOf('function addExtra('));
 assert.match(save,/pendingRecipeDraftImage='';render\(true\)/);
 assert.match(appCode,/clearCalendarWeek\(w\);persist\(\);render\(true\)/);
 assert.match(appCode,/state=next;render\(true\)/);
 assert.match(appCode,/uxCaptureBeforeRenderV4115\(\)/);
 assert.match(appCode,/uxRestoreAfterRenderV4115\(currentTab,stockViewV41\)/);
 assert.match(appCode,/uxRestoreAnchorV4115\(anchor,scrollY\)/)
});

test('V41.15 : intégration cache iPhone, aucun changement de données, références et Firebase',()=>{
 assert.match(index,/ux-v4115\.js\?v=20261106-41-15-ux-stage/);
 assert.match(sw,/ux-v4115\.js\?v=20261106-41-15-ux-stage/);
 assert.match(index,/rayon-filters-v4114\.js\?v=20261106-41-14-1-stage/);
 assert.match(index,/firebase\/v34-ui\.js\?v=20261104-41-12-2-release/);
 assert.match(appCode,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(appCode,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(rayonCode,/function catalogueRayonCountsV4115/);
});
