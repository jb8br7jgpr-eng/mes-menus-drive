import test from 'node:test';
import assert from 'node:assert/strict';
import {
 emptyStockV41, normalizeStockV41, stockIdentityV41, stockMeasureV41,
 applyStockTransactionV41, availableStockV41, availableFreezerV41, previewLegacyPantryV41
} from '../stock-engine-v41.mjs';

const eggs={id:'box6',unit:'boîte',packAmount:6,packUnit:'pièce'};
const oeufs={name:'Œufs',identity:'ingredient:oeufs',unit:'boîte',product:eggs};

test('Un article produit lié et son ingrédient ont une seule identité de stock',()=>{
 const ingredients=[{id:'oeufs',name:'Œufs',productId:'box6'}];
 assert.equal(stockIdentityV41({productId:'box6'},ingredients),'ingredient:oeufs');
 assert.equal(stockIdentityV41({ingredientId:'oeufs'},ingredients),'ingredient:oeufs');
 assert.equal(stockIdentityV41({productId:'p1'},ingredients),'product:p1');
 assert.throws(()=>stockIdentityV41({name:'Œufs'},ingredients));
 const duplicated=[...ingredients,{id:'oeufs-special',productId:'box6'}];
 assert.equal(stockIdentityV41({productId:'box6'},duplicated),'product:box6');
});

test('Unités et conditionnements : une boîte de 6 = six pièces, 1 kg = mille grammes',()=>{
 assert.deepEqual(stockMeasureV41(1,'boîte',eggs),{amount:6,unit:'pièce'});
 assert.deepEqual(stockMeasureV41(3,'boîte',{...eggs,packAmount:12}),{amount:36,unit:'pièce'});
 assert.deepEqual(stockMeasureV41(1,'boîte',{...eggs,packAmount:null}),{amount:1,unit:'boîte'});
 assert.deepEqual(stockMeasureV41(1.5,'kg'),{amount:1500,unit:'g'});
 assert.deepEqual(stockMeasureV41(1.25,'l'),{amount:1250,unit:'ml'});
 assert.deepEqual(stockMeasureV41(15,'cl'),{amount:150,unit:'ml'});
 assert.throws(()=>stockMeasureV41(0,'pièce'));
});

test('Courses faites : achats réels crédités une seule fois, double-appui sans effet',()=>{
 const initial=emptyStockV41();
 const tx={id:'courses:2026-10-26:batch-a',label:'Courses faites',movements:[
  {type:'inventory',direction:'add',amount:1,...oeufs,name:'Œufs'},
  {type:'inventory',direction:'add',amount:2,unit:'paquet',identity:'product:papier',name:'Papier toilette'}
 ]};
 const first=applyStockTransactionV41(initial,tx);
 assert.equal(first.changed,true);
 assert.equal(availableStockV41(first.stock,'ingredient:oeufs','pièce'),6);
 assert.equal(availableStockV41(first.stock,'product:papier','paquet'),2);
 assert.equal(availableStockV41(initial,'ingredient:oeufs','pièce'),0,'sans mutation de la source');
 const retry=applyStockTransactionV41(first.stock,tx);
 assert.equal(retry.changed,false);
 assert.deepEqual(retry.stock,first.stock);
 assert.equal(first.stock.history.length,1);
});

test('Repas réellement cuisiné : consommation des ingrédients exactement une fois',()=>{
 const bought=applyStockTransactionV41(emptyStockV41(),{id:'courses-1',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:oeufs',name:'Œufs',amount:2,unit:'boîte',product:eggs}
 ]}).stock;
 const cooked=applyStockTransactionV41(bought,{id:'cuisine:2026-10-30:soir:chili',movements:[
  {type:'inventory',direction:'consume',identity:'ingredient:oeufs',name:'Œufs',amount:8,unit:'pièce'}
 ]});
 assert.equal(availableStockV41(cooked.stock,'ingredient:oeufs','pièce'),4);
 const retry=applyStockTransactionV41(cooked.stock,{id:'cuisine:2026-10-30:soir:chili',movements:[
  {type:'inventory',direction:'consume',identity:'ingredient:oeufs',amount:8,unit:'pièce'}
 ]});
 assert.equal(retry.changed,false);
 assert.equal(availableStockV41(retry.stock,'ingredient:oeufs','pièce'),4);
});

test('Si un ingrédient manque, aucune des consommations de la transaction ne passe',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'achat',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:oeufs',amount:4,unit:'pièce'},
  {type:'inventory',direction:'add',identity:'ingredient:tomate',amount:2,unit:'pièce'}
 ]}).stock;
 assert.throws(()=>applyStockTransactionV41(initial,{id:'repas-partiel',movements:[
  {type:'inventory',direction:'consume',identity:'ingredient:tomate',amount:1,unit:'pièce'},
  {type:'inventory',direction:'consume',identity:'ingredient:oeufs',amount:8,unit:'pièce'}
 ]}),/Stock insuffisant/);
 assert.equal(availableStockV41(initial,'ingredient:tomate','pièce'),2);
 assert.equal(availableStockV41(initial,'ingredient:oeufs','pièce'),4);
 assert.equal(initial.applied['repas-partiel'],undefined);
});

test('Congélateur : ajouter 2 portions, prévoir ne retire rien, consommer retire 1',()=>{
 const start=emptyStockV41();
 const freeze=applyStockTransactionV41(start,{id:'cuisson-chili',movements:[
  {type:'freezer',direction:'add',lotId:'lot-chili',recipeId:'chili',name:'Chili',portions:2}
 ]}).stock;
 assert.equal(availableFreezerV41(freeze,'chili'),2);
 // La simple planification n'appelle pas le moteur de stock.
 assert.equal(availableFreezerV41(freeze,'chili'),2);
 const eaten=applyStockTransactionV41(freeze,{id:'congele-chili-portion-1',movements:[
  {type:'freezer',direction:'consume',lotId:'lot-chili',recipeId:'chili',portions:1}
 ]}).stock;
 assert.equal(availableFreezerV41(eaten,'chili'),1);
 assert.throws(()=>applyStockTransactionV41(eaten,{id:'trop-de-chili',movements:[
  {type:'freezer',direction:'consume',lotId:'lot-chili',recipeId:'chili',portions:2}
 ]}),/assez/);
});

test('Un mouvement combinant ingrédients et congélateur est atomique',()=>{
 const initial=applyStockTransactionV41(emptyStockV41(),{id:'achat-lait',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:lait',name:'Lait',amount:1,unit:'l'}
 ]}).stock;
 const out=applyStockTransactionV41(initial,{id:'prepare-soupe',label:'Préparer soupe pour congeler',movements:[
  {type:'inventory',direction:'consume',identity:'ingredient:lait',amount:600,unit:'ml'},
  {type:'freezer',direction:'add',lotId:'soupe-1',recipeId:'soupe',name:'Soupe',portions:3}
 ]}).stock;
 assert.equal(availableStockV41(out,'ingredient:lait','ml'),400);
 assert.equal(availableFreezerV41(out,'soupe'),3);
 assert.throws(()=>applyStockTransactionV41(out,{id:'prepare-soupe-a-nouveau',movements:[
  {type:'inventory',direction:'consume',identity:'ingredient:lait',amount:500,unit:'ml'},
  {type:'freezer',direction:'add',lotId:'soupe-2',recipeId:'soupe',portions:1}
 ]}),/Stock insuffisant/);
 assert.equal(availableFreezerV41(out,'soupe'),3);
});

test('Le noyau est optionnel et refuse une structure incohérente',()=>{
 assert.deepEqual(normalizeStockV41(null),emptyStockV41());
 assert.throws(()=>normalizeStockV41({items:[]}),/non reconnu/);
 assert.throws(()=>applyStockTransactionV41(emptyStockV41(),{id:'empty',movements:[]}));
 assert.throws(()=>applyStockTransactionV41(emptyStockV41(),{id:'bad',movements:[{type:'other'}]}));
});

test('La reprise historique n'utilise qu'une seule semaine et ne modifie aucune donnée',()=>{
 const week={pantry:{'ingredient:oeufs|pièce':4,'produit:papier|paquet':2},pantryUnits:{}};
 const old=JSON.stringify(week);
 const preview=previewLegacyPantryV41(week,[{id:'oeufs',name:'Œufs',store:'carrefour'}],
  [{id:'papier',name:'Papier toilette',store:'carrefour'}]);
 assert.equal(preview.entries.length,2);
 assert.equal(preview.entries[0].amount,4);
 assert.equal(preview.entries[1].amount,2);
 assert.equal(preview.requiresReview,false);
 assert.equal(JSON.stringify(week),old);
});
test('Un même produit et ingrédient liés ne sont jamais additionnés silencieusement',()=>{
 const w={pantry:{'ingredient:oeufs|pièce':4,'produit:box6|pièce':5}};
 const preview=previewLegacyPantryV41(w,[{id:'oeufs',name:'Œufs',productId:'box6'}],[eggs]);
 assert.equal(preview.entries.length,2);
 assert.equal(preview.requiresReview,true);
 assert.equal(preview.entries.filter(x=>x.requiresReview).length,2);
 assert.match(preview.warnings.join(' '),/ne pas additionner automatiquement/);
});
test('Les anciennes lignes non reliées au catalogue nécessitent une vérification manuelle',()=>{
 const preview=previewLegacyPantryV41({pantry:{'ail|pièce':3,'ingredient:introuvable|g':5}});
 assert.equal(preview.entries.length,0);
 assert.equal(preview.requiresReview,true);
 assert.equal(preview.warnings.length,2);
});
