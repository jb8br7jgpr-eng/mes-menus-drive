// V41.16 — garde-fous avant toute fusion/deploiement.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.js'),stockActions=read('stock-actions-v41.mjs'),stockUI=read('stock-ui-v41.mjs');
const sw=read('sw.js'),index=read('index.html'),styles=read('styles.css');
const fn=(start,end)=>{
 const i=app.indexOf('function '+start+'('),j=app.indexOf('function '+end+'(',i+1);
 assert.ok(i>=0&&j>i,'Fonction introuvable : '+start);
 return app.slice(i,j);
};
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('fr');

test('V41.16 : app.js est du JavaScript valide',()=>{
 assert.doesNotThrow(()=>new Function(app));
});
test('V41.16 : la recherche voit les mots inverses et les articles deja existants',()=>{
 const state={ingredientCatalog:[{id:'i1',name:'Blanc de poulet'}],
  products:[{id:'p1',name:'Filets de poulet'},{id:'p2',name:'Lait entier'}]};
 const helpers=fn('recipeMatchKeyV4116','preferredIngredientUnit');
 const api=runInNewContext(helpers+';({recipeMatchKeyV4116,recipeSuggestionsV4116})',{state,norm});
 assert.equal(api.recipeMatchKeyV4116('Produit blanc poulet'),api.recipeMatchKeyV4116('Blanc de poulet'));
 const results=api.recipeSuggestionsV4116('produit blanc poulet');
 assert.equal(results[0].item.id,'i1');
 assert.ok(results[0].score>=95);
 assert.ok(api.recipeSuggestionsV4116('lait').some(x=>x.item.id==='p2'));
});
test('V41.16 : les recettes conservent les produits directs sans nouvelle fiche',()=>{
 assert.match(app,/sourceKind:'daily',ingredientId:null,productId:direct\.id/);
 assert.match(app,/if\(line\.sourceKind==='daily'\)continue/);
 assert.match(app,/recipeDailyOptionsV4116/);
 assert.match(read('recipe-import-v417.mjs'),/sourceKind:line\.sourceKind==='daily'\?'daily':null/);
});
test('V41.16 : compteur Carrefour = somme des quantites, pas lignes',()=>{
 const src=fn('purchaseItemCountV4116','clearWeekShopping');
 const count=runInNewContext(src+';purchaseItemCountV4116');
 assert.equal(count([{qty:2,unit:'paquet'},{qty:3,unit:'bouteille'}]),5);
 assert.equal(count([{qty:250,unit:'g'},{qty:2,unit:'boîte'}]),3);
 assert.match(app,/purchaseItemCountV4116\(carrefour\)/);
 assert.match(app,/purchaseItemCountV4116\(grand\)/);
});
test('V41.16 : le stock nest pas valide quand on ouvre la confirmation',()=>{
 const i=app.indexOf("else if(mode==='v4116-finish-courses')");
 const j=app.indexOf("else if(mode==='generate-week-courses')",i);
 assert.ok(i>=0&&j>i);
 const part=app.slice(i,j);
 assert.match(part,/selectedPurchaseIds:\[\.\.\.selected\]/);
 assert.doesNotMatch(part,/w\.checked\s*=/);
 assert.match(stockActions,/selection\?selected\.map\(x=>\(\{\.\.\.x,checked:true\}\)\):selected/);
 assert.match(stockActions,/ctx\.selectedPurchaseIds/);
});
test('V41.16 : menus, congelateur, scroll independant et boutons stock',()=>{
 assert.match(app,/openMealPickerV4116/);
 assert.match(app,/remainingFreezerPortionsV41\(state\.stockV41,state\.weeks/);
 assert.match(app,/modalPageLockV4116/);
 assert.match(styles,/\.modal\.v4116-menu-modal/);
 assert.match(stockUI,/data-action="v41-stock-quick"/);
 assert.match(stockUI,/data-action="v41-freezer-quick"/);
 assert.match(stockActions,/if\(mode==='v41-freezer-quick'\)/);
 assert.match(stockActions,/lot\.portions<=reserved/);
});
test('V41.16 : ressources Safari et cache coherents',()=>{
 assert.match(index,/app\.js\?v=20261111-41-21-unified/);
 assert.match(index,/styles\.css\?v=20261111-41-21-unified/);
 assert.match(sw,/menus-drive-v41-21-unified-20261111/);
 assert.match(sw,/app\.js\?v=20261111-41-21-unified/);
 assert.match(sw,/styles\.css\?v=20261111-41-21-unified/);
});
