import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const appSource=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const rayonsSource=readFileSync(new URL('../rayon-filters-v4114.js',import.meta.url),'utf8');
const defs=appSource.slice(appSource.indexOf('const productCategoryGroups='),appSource.indexOf('function productById('));
const selectors=rayonsSource.slice(0,rayonsSource.indexOf("document.addEventListener('click'"));
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function logicWith({app=null,modalRoot=null}={}){
 return runInNewContext(defs+selectors+
  ';({catalogueRayonCountsV4115,catalogueRayonMarkupV4114,refreshCatalogueRayonCountsV4115,categorySelectionV4114,captureCatalogueRayonUiV4115,restoreCatalogueRayonUiV4115})',{
   html,state:{ingredientCatalog:[],products:[]},selectOptions:()=>'',productById:()=>null,
   app:app||{querySelector:()=>null},modalRoot:modalRoot||{querySelector:()=>null}
  })
}

const items=[
 {kind:'ingredient',id:'i1',name:'Carottes',category:'Légumes',store:'grandfrais'},
 {kind:'daily',id:'p1',name:'Pommes',category:'Fruits',store:'grandfrais'},
 {kind:'daily',id:'p2',name:'Sopalin',category:'Papier et consommables',store:'carrefour'},
 {kind:'ingredient',id:'i2',name:'Lait',category:'Lait',store:'carrefour'},
 {kind:'ingredient',id:'i2',name:'Lait',category:'Lait',store:'carrefour'}
];

test('V41.14.1 : magasin Carrefour, Grand Frais ou tous, compteurs exacts sans doublons',()=>{
 const m=logicWith();
 const all=m.catalogueRayonCountsV4115(items,'all');
 const carrefour=m.catalogueRayonCountsV4115(items,'carrefour');
 const frais=m.catalogueRayonCountsV4115(items,'grandfrais');
 assert.equal(all.get('Lait'),1,'même ingrédient pas compté en double');
 assert.equal(all.get('Fruits'),1);
 assert.equal(carrefour.get('Lait'),1);
 assert.equal(carrefour.get('Papier et consommables'),1);
 assert.equal(carrefour.get('Légumes')||0,0);
 assert.equal(frais.get('Légumes'),1);
 assert.equal(frais.get('Fruits'),1);
 assert.equal(frais.get('Papier et consommables')||0,0);
});

test('V41.14.1 : rendu du sélecteur compte le rayon dans le magasin, conserve les catégories à 0',()=>{
 const m=logicWith();
 const htmlCarrefour=m.catalogueRayonMarkupV4114('produits',
  ['Fruits','Légumes','Papier et consommables','Lait'],items,'carrefour');
 const htmlFrais=m.catalogueRayonMarkupV4114('courses',
  ['Fruits','Légumes','Papier et consommables','Lait'],items,'grandfrais');
 assert.match(htmlCarrefour,/Fruits, légumes et marché[\s\S]*?v4114-count">0</);
 assert.match(htmlFrais,/Fruits, légumes et marché[\s\S]*?v4114-count">2</);
 assert.match(htmlCarrefour,/data-category="Fruits"/);
 assert.match(htmlFrais,/data-category="Papier et consommables"/);
 assert.match(htmlCarrefour,/Papier et consommables<\/span><small>1<\/small>/);
 assert.match(htmlFrais,/Papier et consommables<\/span><small>0<\/small>/);
 assert.match(appSource,/catalogueRayonMarkupV4114\(prefix,categories,items,storeValue\)/);
});

test('V41.14.1 : changements de magasin actualisent les compteurs sans toucher aux catégories cochées',()=>{
 const freshSmall={textContent:''},milkSmall={textContent:''},badge={textContent:''};
 const rows=[
  {dataset:{category:'Fruits'},querySelector:s=>s==='small'?freshSmall:null},
  {dataset:{category:'Lait'},querySelector:s=>s==='small'?milkSmall:null}
 ];
 const group={
  querySelectorAll:s=>s==='[data-v4114-child-row]'?rows:[],
  querySelector:s=>s==='.v4114-count'?badge:null
 };
 const root={querySelectorAll:s=>s==='[data-v4114-group]'?[group]:[]};
 const m=logicWith({app:{querySelector:()=>root},modalRoot:{querySelector:()=>root}});
 const selected=m.categorySelectionV4114('courses');
 selected.add('Fruits');
 m.refreshCatalogueRayonCountsV4115('courses',items,'carrefour');
 assert.equal(freshSmall.textContent,'0');assert.equal(milkSmall.textContent,'1');assert.equal(badge.textContent,'1');
 m.refreshCatalogueRayonCountsV4115('courses',items,'grandfrais');
 assert.equal(freshSmall.textContent,'1');assert.equal(milkSmall.textContent,'0');assert.equal(badge.textContent,'1');
 assert.deepEqual([...selected],['Fruits']);
 assert.match(appSource,/refreshCatalogueRayonCountsV4115\('produits',unifiedCatalogueSourceV4114\(\),catalogueStoreFilter\)/);
 assert.match(appSource,/refreshCatalogueRayonCountsV4115\('courses',rows.map/);
});

test('V41.14.1 : modifier la catégorie conserve tous les filtres actifs et le panneau ouvert',()=>{
 const start=appSource.indexOf('function saveUnifiedCatalogue(e){');
 const end=appSource.indexOf('// V41.13.3 : supprimer réellement la référence',start);
 assert.ok(start>0&&end>start);
 const code=appSource.slice(start,end);
 const ing={id:'i1',name:'Ail',store:'grandfrais',category:'Fruits',qty:1,unit:'pièce',frequent:false,productId:null};
 const state={ingredientCatalog:[ing],products:[],recipes:[],storePreferences:{}};
 const active=new Set(['Fruits']),events=[];
 const fields={
  '#catalogueName':{value:'Ail'},'#catalogueStore':{value:'carrefour'},'#catalogueCategory':{value:'Légumes'},
  '#catalogueQty':{value:'2'},'#catalogueUnit':{value:'pièce'},'#catalogueFrequent':{checked:false},
  '#catalogueLinkedProduct':{value:''}
 };
 const ctx={
  state,productCategories:['Fruits','Légumes'],units:['pièce'],
  catalogueStoreFilter:'grandfrais',catalogueTypeFilter:'daily',
  ingredientStoreTab:'grandfrais',
  $:selector=>fields[selector]||null,
  ingredientById:id=>state.ingredientCatalog.find(x=>x.id===id),
  ingredientByName:name=>state.ingredientCatalog.find(x=>x.name===name),
  productById:id=>state.products.find(x=>x.id===id),
  norm:s=>String(s||'').toLowerCase(),checkpoint:()=>{},
  categorySelectionV4114:()=>active,
  captureCatalogueRayonUiV4115:()=>{events.push('capture');return{open:true,expanded:['Fruits, légumes et marché'],search:'fruits'}},
  restoreCatalogueRayonUiV4115:(context,snapshot)=>events.push(['restore',context,snapshot]),
  persist:()=>events.push('persist'),closeModal:()=>events.push('close'),
  render:()=>events.push('render'),toast:text=>events.push(['toast',text]),
  confirm:()=>true
 };
 const fn=runInNewContext(code+';saveUnifiedCatalogue',ctx);
 fn({preventDefault:()=>{},target:{dataset:{kind:'ingredient',id:'i1'}}});
 assert.equal(ing.category,'Légumes');
 assert.equal(ing.store,'carrefour');
 assert.equal(ctx.catalogueStoreFilter,'grandfrais','le filtre magasin ne suit pas la fiche modifiée');
 assert.equal(ctx.catalogueTypeFilter,'daily','le filtre type ne se réinitialise pas');
 assert.deepEqual([...active],['Fruits'],'les catégories actives restent cochées');
 assert.ok(events.includes('persist'));
 assert.ok(events.indexOf('render')<events.findIndex(x=>Array.isArray(x)&&x[0]==='restore'));
 assert.equal(events.find(x=>Array.isArray(x)&&x[0]==='restore')[2].open,true);
});

test('V41.14.1 : le stockage Firebase et la sélection des produits aux courses ne sont pas modifiés',()=>{
 assert.match(appSource,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(appSource,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 const bulk=appSource.slice(appSource.indexOf('function filterBulkV37(){'),appSource.indexOf('function stepBulkV37('));
 assert.match(bulk,/list\.appendChild\(row\)/);
 assert.match(bulk,/updateBulkV37\(\)/);
 assert.doesNotMatch(bulk,/row\.innerHTML\s*=/);
 const saved=appSource.slice(appSource.indexOf('function saveUnifiedCatalogue(e){'),appSource.indexOf('// V41.13.3 : supprimer réellement la référence'));
 assert.doesNotMatch(saved,/categorySelectionV4114\('produits'\)\.clear/);
 assert.doesNotMatch(saved,/catalogueStoreFilter=store/);
});
