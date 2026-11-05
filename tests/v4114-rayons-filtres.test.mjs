import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const rayon=readFileSync(new URL('../rayon-filters-v4114.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const defs=app.slice(app.indexOf('const productCategoryGroups='),app.indexOf('function productById('));
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selectors=rayon.slice(0,rayon.indexOf("document.addEventListener('click'"));
const state={ingredientCatalog:[],products:[]};
const logic=runInNewContext(defs+selectors+';({catalogueRayonGroupsV4114,catalogueRayonMarkupV4114,categorySelectionV4114,categoryMatchesV4114})',{
 html,state,selectOptions:()=>'',productById:()=>null
});

test('V41.14 : toutes les catégories, y compris historiques et personnalisées, restent accessibles',()=>{
 const groups=Array.from(logic.catalogueRayonGroupsV4114(['Fruits','Légumes','Œufs','Rayon personnalisé','Épicerie']));
 assert.ok(groups.some(g=>g.name==='Fruits, légumes et marché'));
 assert.ok(groups.some(g=>g.name==='Crémerie, œufs et produits frais'));
 const last=groups.find(g=>g.name==='Anciennes catégories et catégories personnalisées');
 assert.deepEqual(Array.from(last.categories),['Épicerie','Rayon personnalisé']);
});

test('V41.14 : compteur unique par rayon, catégories consultables, recherche et anciennes fiches échappées',()=>{
 const markup=logic.catalogueRayonMarkupV4114('produits',
  ['Fruits','Légumes','Œufs','Rayon <personnalisé>'],[
   {type:'ingredient',id:'i1',category:'Fruits'},
   {type:'daily',id:'d1',category:'Fruits'},
   {type:'daily',id:'d1',category:'Fruits'},
   {type:'daily',id:'d2',category:'Légumes'},
   {type:'daily',id:'d3',category:'Œufs'}
  ]);
 assert.match(markup,/Fruits, légumes et marché[\s\S]*?v4114-count">3</);
 assert.match(markup,/data-v4114-rayon/);
 assert.match(markup,/data-v4114-child/);
 assert.match(markup,/data-v4114-search/);
 assert.match(markup,/data-v4114-summary/);
 assert.match(markup,/Tout réinitialiser/);
 assert.match(markup,/Rayon &lt;personnalisé&gt;/);
 assert.doesNotMatch(markup,/<personnalisé>/);
});

test('V41.14 : aucun filtre = tous les produits, rayons et catégories multiples en union',()=>{
 const selected=logic.categorySelectionV4114('produits');
 assert.equal(logic.categoryMatchesV4114('Fruits',selected),true);
 selected.add('Fruits');selected.add('Œufs');
 assert.equal(logic.categoryMatchesV4114('Fruits',selected),true);
 assert.equal(logic.categoryMatchesV4114('Œufs',selected),true);
 assert.equal(logic.categoryMatchesV4114('Légumes',selected),false);
 selected.delete('Fruits');
 assert.equal(logic.categoryMatchesV4114('Fruits',selected),false);
 selected.clear();
 assert.equal(logic.categoryMatchesV4114('Légumes',selected),true)
});

test('V41.14 : un clic coche le rayon entier, le second le retire, et un autre rayon reste coché',()=>{
 const handlers={};
 const sandbox={document:{addEventListener:(type,fn)=>handlers[type]=fn},
  app:{querySelector:()=>null},modalRoot:{querySelector:()=>null},refreshCatalogueV40:()=>{},filterBulkV37:()=>{}};
 const live=runInNewContext(rayon+';({categorySelectionV4114})',sandbox);
 const selected=live.categorySelectionV4114('produits');
 const selector={dataset:{v4114Selector:'produits'}};
 const mkGroup=(names)=>({querySelectorAll:()=>names.map(category=>({dataset:{category}}))});
 const fireParent=group=>{
  const target={matches:selector=>selector==='[data-v4114-child]'?false:true,
   closest:selector=>selector==='[data-v4114-selector]'?{...selectorRoot}:group};
  handlers.change({target,stopImmediatePropagation:()=>{}})
 };
 const selectorRoot=selector;
 const legumes=mkGroup(['Fruits','Légumes']),boissons=mkGroup(['Eaux et sodas','Jus et sirops']);
 fireParent(legumes);
 assert.deepEqual([...selected].sort(),['Fruits','Légumes']);
 fireParent(boissons);
 assert.deepEqual([...selected].sort(),['Eaux et sodas','Fruits','Jus et sirops','Légumes']);
 fireParent(legumes);
 assert.deepEqual([...selected].sort(),['Eaux et sodas','Jus et sirops']);
});

test('V41.14 : les cases des produits, unités, quantités et liste courses ne sont jamais recréées lors d’un filtre',()=>{
 const bulk=app.slice(app.indexOf('function filterBulkV37(){'),app.indexOf('function stepBulkV37('));
 assert.match(bulk,/categoryMatchesV4114\(row.dataset.category,categorySelectionV4114\('courses'\)\)/);
 assert.match(bulk,/list\.appendChild\(row\)/);
 assert.doesNotMatch(bulk,/row\.innerHTML\s*=/);
 assert.match(bulk,/updateBulkV37\(\)/);
 assert.match(rayon,/function syncCatalogueRayonsV4114/);
 assert.match(rayon,/parent\.indeterminate=active>0&&active<cats.length/);
 assert.match(rayon,/const full=categories.length>0&&categories.every/);
 assert.match(css,/\.v4114-parent/);
 assert.match(css,/\.v4114-children\[hidden\]/);
 assert.match(app,/const baseState=\(\)=>\(\{schema:1/);
});
