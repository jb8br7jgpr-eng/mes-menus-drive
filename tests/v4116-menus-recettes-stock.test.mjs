import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {resolveStockArticleV41} from '../stock-week-v41.mjs';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const stockActions=readFileSync(new URL('../stock-actions-v41.mjs',import.meta.url),'utf8');
const section=(a,b)=>{const i=src.indexOf('function '+a+'('),j=src.indexOf('function '+b+'(',i+1);
 assert.ok(i>=0&&j>i,a+' / '+b+' introuvables');return src.slice(i,j)};
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const state={ingredientCatalog:[{id:'ing1',name:'Blanc de poulet',store:'grandfrais'}],
 products:[{id:'p1',name:'Cordons bleus',store:'carrefour',unit:'paquet'}]};
const matching=runInNewContext(section('recipeMatchKeyV4116','preferredIngredientUnit')+
 ';({recipeMatchKeyV4116,recipeSuggestionsV4116})',{state,norm});
const count=runInNewContext(section('purchaseItemCountV4116','clearWeekShopping')+
 ';purchaseItemCountV4116');

test('V41.16 : ordre des mots et mots superflus ne créent pas un nouvel ingrédient',()=>{
 assert.equal(matching.recipeMatchKeyV4116('produit blanc poulet'),
  matching.recipeMatchKeyV4116('blanc de poulet'));
 const match=matching.recipeSuggestionsV4116('produit blanc poulet')[0];
 assert.equal(match.kind,'ingredient');assert.equal(match.item.id,'ing1');assert.ok(match.score>=95);
});
test('V41.16 : un achat du quotidien est proposé comme référence de recette',()=>{
 const found=matching.recipeSuggestionsV4116('cordons bleus');
 assert.ok(found.some(x=>x.kind==='daily'&&x.item.id==='p1'));
 assert.match(src,/sourceKind:'daily'/);
 assert.match(src,/if\(line\.sourceKind==='daily'\)continue/);
 const article=resolveStockArticleV41({name:'Cordons bleus',sourceKind:'daily',ingredientId:null,productId:'p1'},[],state.products);
 assert.ok(article);assert.equal(article.product.id,'p1');
});
test('V41.16 : compter les paquets et bouteilles, pas uniquement les références',()=>{
 assert.equal(count([{qty:2,unit:'paquet'},{qty:3,unit:'bouteille'}]),5);
 assert.equal(count([{qty:350,unit:'g'}]),1);
 assert.equal(count([]),0);
});
test('V41.16 : repas congelé, scroll stable et validations stock disponibles',()=>{
 assert.match(src,/function openMealPickerV4116/);
 assert.match(src,/remainingFreezerPortionsV41/);
 assert.match(src,/modalPageLockV4116/);
 assert.match(css,/\.v4116-menu-tabs/);
 assert.match(css,/\.modal\.v4116-menu-modal/);
 assert.match(src,/v4116-confirm-courses/);
 assert.match(stockActions,/selectedPurchaseIds/);
 assert.match(stockActions,/if\(mode==='v41-stock-quick'\)/);
 assert.match(stockActions,/if\(mode==='v41-freezer-quick'\)/);
});
