import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const part=(a,b)=>{
 const i=src.indexOf('function '+a+'('),j=src.indexOf('function '+b+'(',i+1);
 assert.ok(i>=0&&j>i,'Fonctions introuvables : '+a+' / '+b);
 return src.slice(i,j)
};
const implementation=[
 part('independentProducts','productRows'),
 part('unifiedCatalogueSourceV4114','unifiedCatalogueItems'),
 part('frequentCatalogueItems','canonicalIngredient'),
 part('extraSearchItems','extraSearchResults'),
 part('bulkCatalogueV37','bulkPurchaseExtraV37')
].join('\n');
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function fixture({merged=true,store='carrefour',frequent=true}={}){
 const state={ingredientCatalog:[
  {id:'ing1',name:'Beurre pour recettes',productId:'p1',store:'carrefour',category:'Beurre et crème',unit:'g',qty:200,frequent:false}
 ],products:[
  {id:'p1',name:'Beurre salé',ean:'3451790988813',url:'https://www.carrefour.fr/p/beurre-tendre-demi-sel-elle-vire-3451790988813',
   store,category:'Beurre et crème',qty:1,unit:'paquet',frequent,showInCatalogue:merged},
  {id:'p2',name:'Lait',store:'carrefour',category:'Lait',qty:1,unit:'bouteille',frequent:false},
  {id:'p3',name:'Autre beurre déjà lié',store:'carrefour',category:'Beurre et crème',showInCatalogue:false}
 ],recipes:[{ingredients:[{ingredientId:'ing1',name:'Beurre pour recettes',unit:'g',qty:100}]}],
 storePreferences:{}};
 state.ingredientCatalog.push({id:'ing3',name:'Autre ingrédient',store:'carrefour',productId:'p3',category:'Beurre et crème'});
 const context={
  state,norm,units:['g','kg','ml','l','pièce','paquet','boîte','bouteille','pot'],
  ingredientStore:i=>i.store,
  preferredIngredientUnit:i=>i.unit||'g',
  catalogueCategoryV40:i=>i.category||'Autres',
  ingredientById:id=>state.ingredientCatalog.find(i=>i.id===id),
  productById:id=>state.products.find(p=>p.id===id),
  ingredientStoreTab:'carrefour'
 };
 const api=runInNewContext(implementation+';({independentProducts,unifiedCatalogueSourceV4114,frequentCatalogueItems,extraSearchItems,bulkCatalogueV37})',context);
 return {state,api}
}
const productIds=items=>Array.from(items).filter(x=>x.kind==='daily'||x.type==='daily'||x.ean!==undefined).map(x=>x.id);
test('V41.15.5 : la fiche Beurre salé fusionnée apparaît dans Produits ET dans Ajouter plusieurs produits',()=>{
 const f=fixture();
 assert.deepEqual(productIds(f.api.unifiedCatalogueSourceV4114()),['p1','p2']);
 assert.deepEqual(productIds(f.api.bulkCatalogueV37()),['p1','p2']);
 assert.ok(f.api.bulkCatalogueV37().some(x=>x.name==='Beurre salé'&&x.kind==='daily'));
 assert.ok(f.api.bulkCatalogueV37().some(x=>x.name==='Beurre pour recettes'&&x.kind==='ingredient'));
});
test('V41.15.5 : recherche ajout ponctuel et achats fréquents montrent aussi le beurre fusionné',()=>{
 const f=fixture();
 assert.deepEqual(productIds(f.api.extraSearchItems('Beurre')),['p1']);
 assert.deepEqual(productIds(f.api.frequentCatalogueItems()),['p1']);
 assert.deepEqual(Array.from(f.api.independentProducts(),p=>p.id),['p1','p2']);
});
test('V41.15.5 : les références anciennes liées mais non fusionnées restent sans doublon',()=>{
 const f=fixture({merged:false});
 assert.deepEqual(productIds(f.api.unifiedCatalogueSourceV4114()),['p2']);
 assert.deepEqual(productIds(f.api.bulkCatalogueV37()),['p2']);
 assert.deepEqual(productIds(f.api.extraSearchItems('beurre')),[]);
 assert.deepEqual(productIds(f.api.frequentCatalogueItems()),[]);
});
test('V41.15.5 : le sélecteur conserve les vraies identités produits et n’ajoute pas de fiche Firebase',()=>{
 const f=fixture(),before=JSON.stringify(f.state);
 const matches=f.api.bulkCatalogueV37().filter(x=>x.kind==='daily'&&x.id==='p1');
 assert.equal(matches.length,1);
 assert.equal(matches[0].name,'Beurre salé');
 assert.equal(JSON.stringify(f.state),before);
 assert.equal(f.state.products.length,3);
 assert.equal(f.state.products[0].ean,'3451790988813');
 assert.equal(f.state.ingredientCatalog[0].productId,'p1');
});
test('V41.15.5 : le filtre magasin des achats indépendants continue de fonctionner',()=>{
 const f=fixture({store:'grandfrais'});
 assert.deepEqual(Array.from(f.api.independentProducts('carrefour'),p=>p.id),['p2']);
 assert.deepEqual(Array.from(f.api.independentProducts('grandfrais'),p=>p.id),['p1']);
 assert.ok(f.api.bulkCatalogueV37().some(x=>x.kind==='daily'&&x.id==='p1'&&x.store==='grandfrais'));
});
