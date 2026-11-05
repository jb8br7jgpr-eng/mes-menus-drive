import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function part(start,end){
 const a=src.indexOf('function '+start+'('),b=src.indexOf('function '+end+'(',a);
 assert.ok(a>=0&&b>a,start+' / '+end+' absents');
 return src.slice(a,b);
}
function norm(x){return String(x||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
const helpers=part('carrefourReferenceLinkedV4133','productBadge');
const independent=part('independentProducts','productRows');
const catalogue=part('unifiedCatalogueItems','catalogueIconV418');
function fixture({ingredients,products,recipes=[],weeks={}}={}){
 const ing=ingredients??[{id:'ing1',name:'Moutarde',store:'carrefour',productId:'p1',category:'Sauces et condiments'}];
 const prods=products??[{id:'p1',name:'Moutarde',url:'https://www.carrefour.fr/p/moutarde-1234567890123',
    ean:'1234567890123',brand:'Carrefour',packaging:'250g',category:'Sauces et condiments',unit:'pot',qty:1}];
 const state={ingredientCatalog:structuredClone(ing),products:structuredClone(prods),recipes:structuredClone(recipes),
  weeks:structuredClone(weeks),storePreferences:{}};
 const calls=[],ctx={state,norm,productSearch:'',catalogueTypeFilter:'all',catalogueStoreFilter:'all',
  catalogueCategoryFilter:'all',catalogueSortV40:'name',ingredientStoreTab:'carrefour',
  ingredientById:id=>state.ingredientCatalog.find(i=>i.id===id),
  productById:id=>state.products.find(p=>p.id===id),
  ingredientStore:i=>i.store||'carrefour',catalogueCategoryV40:i=>i.category||'Autres',
  catalogueSortCompareV40:(a,b)=>a.name.localeCompare(b.name,'fr'),
  checkpoint:msg=>calls.push(['checkpoint',msg]),persist:()=>calls.push(['persist']),
  closeModal:()=>calls.push(['close']),render:x=>calls.push(['render',x]),
  toast:msg=>calls.push(['toast',msg]),html:String,
  showCatalogueModalV413:(...a)=>calls.push(['modal',...a])
 };
 const api=runInNewContext(helpers+independent+catalogue+
  ';({hideOrphanCarrefourReferenceV4133,carrefourReferenceLinkedV4133,activeIndependentProductsV4133,hiddenOrphanCarrefourReferencesV4133,potentialExistingDuplicateV4133,hidePotentialDuplicateV4133,restoreHiddenReferenceV4133,showHiddenReferencesV4133,unlinkIngredientCarrefourV413,independentProducts,unifiedCatalogueItems})',ctx);
 return {state,api,calls,ctx}
}
function visible(f){return Array.from(f.api.unifiedCatalogueItems(),x=>({type:x.type,id:x.id,name:x.name}))}

test('V41.13.3 : détacher une référence ne crée pas un deuxième produit visible',()=>{
 const f=fixture({recipes:[{ingredients:[{ingredientId:'ing1',name:'Moutarde',productId:'p1',qty:1},
  {name:'Moutarde',productId:'p1',qty:1}]}],
  weeks:{w1:{extras:[{productId:'p1',name:'Moutarde',qty:1}]}}});
 const before=JSON.stringify({url:f.state.products[0].url,ean:f.state.products[0].ean,
  weeks:f.state.weeks,brand:f.state.products[0].brand,packaging:f.state.products[0].packaging});
 assert.equal(f.api.unlinkIngredientCarrefourV413('ing1'),true);
 assert.equal(f.state.ingredientCatalog[0].productId,null);
 assert.deepEqual(visible(f),[{type:'ingredient',id:'ing1',name:'Moutarde'}]);
 assert.equal(f.state.products.length,1);
 assert.equal(f.state.products[0].carrefourReferenceHiddenV4133,true);
 assert.ok(f.state.recipes[0].ingredients.every(i=>i.productId===null),'y compris ancienne recette sans identifiant');
 assert.equal(JSON.stringify({url:f.state.products[0].url,ean:f.state.products[0].ean,
  weeks:f.state.weeks,brand:f.state.products[0].brand,packaging:f.state.products[0].packaging}),before);
 assert.equal(f.api.hiddenOrphanCarrefourReferencesV4133().length,1);
 assert.ok(f.calls.some(x=>x[0]==='persist'));
});

test('V41.13.3 : une référence utilisée par deux ingrédients reste associée au deuxième',()=>{
 const f=fixture({ingredients:[
  {id:'a',name:'Moutarde',productId:'p1'},
  {id:'b',name:'Sauce',productId:'p1'}
 ]});
 assert.equal(f.api.unlinkIngredientCarrefourV413('a'),true);
 assert.equal(f.state.ingredientCatalog[0].productId,null);
 assert.equal(f.state.ingredientCatalog[1].productId,'p1');
 assert.equal(f.state.products[0].carrefourReferenceHiddenV4133,undefined);
 assert.deepEqual(visible(f),[{type:'ingredient',id:'a',name:'Moutarde'},
  {type:'ingredient',id:'b',name:'Sauce'}]);
});

test('V41.13.3 : une référence indépendante normale reste visible',()=>{
 const f=fixture({products:[{id:'p1',name:'Moutarde',url:'https://www.carrefour.fr/p/x'}],
  ingredients:[{id:'ing1',name:'Sauce',productId:null}]});
 assert.deepEqual(visible(f),[{type:'daily',id:'p1',name:'Moutarde'},{type:'ingredient',id:'ing1',name:'Sauce'}]);
 assert.equal(f.api.hiddenOrphanCarrefourReferencesV4133().length,0);
});

test('V41.13.3 : doublon ancien proposé pour masquage, mais jamais masqué automatiquement',()=>{
 const f=fixture({ingredients:[{id:'ing1',name:'Moutarde',productId:null}],
  products:[{id:'old',name:'Moutarde',ean:'1234567890123'}]});
 assert.equal(f.api.potentialExistingDuplicateV4133(f.state.products[0]),true);
 assert.equal(visible(f).length,2,'lecture seule : les données ambiguës restent affichées jusqu’à un choix');
 assert.equal(f.api.hidePotentialDuplicateV4133('old'),true);
 assert.equal(visible(f).length,1);
 assert.equal(f.state.products.length,1,'aucune fiche supprimée');
 assert.ok(f.calls.some(x=>x[0]==='checkpoint'));
 assert.ok(f.calls.some(x=>x[0]==='persist'));
});

test('V41.13.3 : masque et réaffichage sont réversibles, même lorsque la fiche contient un EAN',()=>{
 const f=fixture();
 f.api.unlinkIngredientCarrefourV413('ing1');
 const before=JSON.stringify({...f.state.products[0]});
 assert.equal(f.api.restoreHiddenReferenceV4133('p1'),true);
 assert.deepEqual(visible(f),[{type:'ingredient',id:'ing1',name:'Moutarde'},
  {type:'daily',id:'p1',name:'Moutarde'}]);
 assert.equal(f.state.products[0].ean,'1234567890123');
 assert.equal(f.state.products[0].carrefourReferenceHiddenV4133,undefined);
 assert.equal(f.api.restoreHiddenReferenceV4133('p1'),false);
 assert.equal(f.state.products.length,1);
 assert.match(before,/carrefourReferenceHiddenV4133/);
});

test('V41.13.3 : le menu de restauration liste les références techniques sans les effacer',()=>{
 const f=fixture();f.api.unlinkIngredientCarrefourV413('ing1');
 f.api.showHiddenReferencesV4133();
 const modal=f.calls.find(x=>x[0]==='modal');
 assert.ok(modal);
 assert.match(modal[2],/data-action="v4133-restore-reference"/);
 assert.match(modal[2],/Moutarde/);
 assert.equal(f.state.products.length,1);
});

test('V41.13.3 : les chemins d’édition et de remplacement masquent la référence précédente',()=>{
 assert.match(src,/if\(previousProductId&&previousProductId!==productId\)\s*hideOrphanCarrefourReferenceV4133\(previousProductId\)/);
 assert.match(src,/if\(previousProductId&&previousProductId!==product\.id\)\s*hideOrphanCarrefourReferenceV4133\(previousProductId\)/);
 assert.match(src,/if\(previousProductId&&previousProductId!==p\.id\)\s*hideOrphanCarrefourReferenceV4133\(previousProductId\)/);
 assert.match(src,/!productById\(line\.productId\)\.carrefourReferenceHiddenV4133/);
});

test('V41.13.3 : toutes les listes d’achat excluent les anciennes références masquées',()=>{
 assert.match(src,/function frequentCatalogueItems\(\)[\s\S]*?activeIndependentProductsV4133\(\)/);
 assert.match(src,/function mealProductPickerResultsV412[\s\S]*?activeIndependentProductsV4133\(\)/);
 assert.match(src,/function extraSearchItems[\s\S]*?activeIndependentProductsV4133\(\)/);
 assert.match(src,/function bulkCatalogueV37[\s\S]*?activeIndependentProductsV4133\(\)/);
 assert.match(src,/function independentProducts\(store=ingredientStoreTab\)\{\s*return activeIndependentProductsV4133\(\)/);
 assert.match(src,/data-action="v4133-hide-duplicate"/);
 assert.match(src,/data-action="v4133-show-hidden"/);
 assert.match(src,/data-action="v4133-restore-reference"/);
});
