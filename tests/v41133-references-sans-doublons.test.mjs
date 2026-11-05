import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function part(start,end){
 const a=src.indexOf('function '+start+'('),b=src.indexOf('function '+end+'(',a);
 assert.ok(a>=0&&b>a,start+' / '+end+' introuvables');
 return src.slice(a,b);
}
const helpers=part('carrefourReferenceLinkedV4133','productBadge');
const independent=part('independentProducts','productRows');
const catalogue=part('unifiedCatalogueSourceV4114','catalogueIconV418');
const norm=s=>String(s||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
function fixture({ingredients,products,recipes=[],weeks={},stockV41=null,confirmResult=true}={}){
 const ing=ingredients??[{id:'ing1',name:'Moutarde',store:'carrefour',productId:'p1',category:'Sauces'}];
 const prods=products??[{id:'p1',name:'Moutarde Carrefour',url:'https://www.carrefour.fr/p/moutarde-1234567890123',
  ean:'1234567890123',brand:'Carrefour',packaging:'250g',category:'Sauces',unit:'pot',qty:1}];
 const state={ingredientCatalog:structuredClone(ing),products:structuredClone(prods),
  recipes:structuredClone(recipes),weeks:structuredClone(weeks),storePreferences:{},
  ...(stockV41?{stockV41:structuredClone(stockV41)}:{})};
 const calls=[],ctx={state,norm,productSearch:'',catalogueTypeFilter:'all',catalogueStoreFilter:'all',
  catalogueSortV40:'name',ingredientStoreTab:'carrefour',
  categoryMatchesV4114:(category,selected)=>!selected.size||selected.has(category),
  categorySelectionV4114:()=>new Set(),
  productById:id=>state.products.find(p=>p.id===id),
  ingredientById:id=>state.ingredientCatalog.find(p=>p.id===id),
  ingredientStore:i=>i.store||'carrefour',catalogueCategoryV40:i=>i.category||'Autres',
  catalogueSortCompareV40:(a,b)=>a.name.localeCompare(b.name,'fr'),
  checkpoint:x=>calls.push(['checkpoint',x]),persist:()=>calls.push(['persist']),
  closeModal:()=>calls.push(['close']),render:x=>calls.push(['render',x]),toast:x=>calls.push(['toast',x]),
  confirm:x=>{calls.push(['confirm',x]);return confirmResult}
 };
 const api=runInNewContext(helpers+independent+catalogue+
  ';({unlinkIngredientCarrefourV413,clearDailyCarrefourV413,removeOrphanCarrefourReferenceV4133,unifiedCatalogueItems,independentProducts})',ctx);
 return {state,api,calls}
}
const visible=f=>Array.from(f.api.unifiedCatalogueItems(),x=>({type:x.type,id:x.id,name:x.name}));

test('V41.13.3 : annuler la confirmation ne modifie rien',()=>{
 const f=fixture({confirmResult:false});
 const before=JSON.stringify(f.state);
 assert.equal(f.api.unlinkIngredientCarrefourV413('ing1'),false);
 assert.equal(JSON.stringify(f.state),before);
 assert.ok(f.calls.some(x=>x[0]==='confirm'));
 assert.ok(!f.calls.some(x=>x[0]==='persist'));
});

test('V41.13.3 : référence retirée réellement, aucun objet caché ni doublon créé',()=>{
 const f=fixture({recipes:[{ingredients:[{ingredientId:'ing1',name:'Moutarde',productId:'p1'}]}],
  weeks:{w1:{extras:[{id:'extra',name:'Moutarde',productId:'p1',qty:2,unit:'pot'}],
   generatedIngredients:[{name:'Moutarde',productId:'p1',qty:1,unit:'g'}]}}});
 assert.equal(f.api.unlinkIngredientCarrefourV413('ing1'),true);
 assert.equal(f.state.ingredientCatalog[0].productId,null);
 assert.equal(f.state.recipes[0].ingredients[0].productId,null);
 assert.equal(f.state.products.length,0,'référence réellement supprimée');
 assert.equal(f.state.weeks.w1.extras[0].productId,null);
 assert.equal(f.state.weeks.w1.extras[0].qty,2);
 assert.equal(f.state.weeks.w1.generatedIngredients[0].productId,null);
 assert.deepEqual(visible(f),[{type:'ingredient',id:'ing1',name:'Moutarde'}]);
 assert.ok(f.calls.some(x=>x[0]==='persist'));
});

test('V41.13.3 : le stock permanent attaché à une référence supprimée reste conservé',()=>{
 const f=fixture({stockV41:{items:{
  'product:p1|g':{identity:'product:p1',unit:'g',quantity:3,name:'Moutarde'},
  'ingredient:ing1|g':{identity:'ingredient:ing1',unit:'g',quantity:2,name:'Moutarde'}
 }}});
 assert.equal(f.api.unlinkIngredientCarrefourV413('ing1'),true);
 assert.equal(f.state.stockV41.items['product:p1|g'],undefined);
 assert.equal(f.state.stockV41.items['ingredient:ing1|g'].quantity,5);
});

test('V41.13.3 : une référence partagée reste intacte pour le deuxième ingrédient',()=>{
 const f=fixture({ingredients:[
  {id:'ing1',name:'Moutarde',store:'carrefour',productId:'p1'},
  {id:'ing2',name:'Sauce',store:'carrefour',productId:'p1'}
 ]});
 assert.equal(f.api.unlinkIngredientCarrefourV413('ing1'),true);
 assert.equal(f.state.ingredientCatalog[0].productId,null);
 assert.equal(f.state.ingredientCatalog[1].productId,'p1');
 assert.equal(f.state.products.length,1);
 assert.equal(f.state.products[0].ean,'1234567890123');
 assert.deepEqual(visible(f),[
  {type:'ingredient',id:'ing1',name:'Moutarde'},
  {type:'ingredient',id:'ing2',name:'Sauce'}
 ]);
});

test('V41.13.3 : une référence utilisée dans un repas produit ne peut être effacée silencieusement',()=>{
 const f=fixture({weeks:{w1:{meals:[{type:'products',products:[{productId:'p1',qty:1,unit:'pot'}]}]}}});
 assert.equal(f.api.unlinkIngredientCarrefourV413('ing1'),false);
 assert.equal(f.state.ingredientCatalog[0].productId,'p1');
 assert.equal(f.state.products.length,1);
 assert.ok(!f.calls.some(x=>x[0]==='persist'));
});

test('V41.13.3 : retirer une référence d’un achat quotidien préserve entièrement sa fiche',()=>{
 const f=fixture(),p=f.state.products[0];
 const before={...p,url:'',ean:''};
 assert.equal(f.api.clearDailyCarrefourV413('p1'),true);
 assert.deepEqual(p,before);
 assert.equal(f.state.products.length,1);
 assert.equal(f.api.clearDailyCarrefourV413('p1'),false);
 assert.equal(f.calls.filter(x=>x[0]==='persist').length,1);
});

test('V41.13.3 : une suppression du lien quotidien annulée ne modifie aucune donnée',()=>{
 const f=fixture({confirmResult:false});const before=JSON.stringify(f.state);
 assert.equal(f.api.clearDailyCarrefourV413('p1'),false);
 assert.equal(JSON.stringify(f.state),before);
});

test('V41.13.3 : un véritable produit indépendant reste visible sans filtre caché',()=>{
 const f=fixture({ingredients:[{id:'ing1',name:'Moutarde',store:'carrefour',productId:null}],
  products:[{id:'p1',name:'Essuie-tout',url:'',ean:'',store:'carrefour'}]});
 assert.deepEqual(visible(f),[
  {type:'daily',id:'p1',name:'Essuie-tout'},
  {type:'ingredient',id:'ing1',name:'Moutarde'}
 ]);
});

test('V41.13.3 : aucune archive cachée et confirmation de toute suppression',()=>{
 assert.doesNotMatch(src,/carrefourReferenceHiddenV4133|Masquer doublon|v4133-show-hidden|v4133-restore-reference/);
 assert.match(src,/data-action="v413-unlink-ingredient-carrefour"/);
 assert.match(src,/data-action="v413-clear-daily-carrefour"/);
 assert.match(src,/function removeOrphanCarrefourReferenceV4133/);
 assert.match(src,/confirm\('Supprimer définitivement la référence Carrefour/);
 assert.match(src,/if\(previousProductId&&previousProductId!==productId\)/);
 assert.match(src,/removeOrphanCarrefourReferenceV4133\(previousProductId,ing.id\)/);
});
