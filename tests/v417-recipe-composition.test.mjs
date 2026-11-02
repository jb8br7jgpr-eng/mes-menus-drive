import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareRecipeImportV417,mergeRecipeIngredientsV417} from '../recipe-import-v417.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const ratatouille={id:'r-ratatouille',name:'Ratatouille',people:4,ingredients:[
 {ingredientId:'tomato',name:'Tomates',qty:600,unit:'g',productId:'p-tomatoes'},
 {ingredientId:'zucchini',name:'Courgettes',qty:400,unit:'g'},
 {ingredientId:'onion',name:'Oignons',qty:2,unit:'pièce'},
 {ingredientId:'oil',name:'Huile d’olive',qty:30,unit:'ml'}
]};

test('V41.7 : copier la ratatouille dans une recette riz/viande pour quatre portions',()=>{
 const before=JSON.stringify(ratatouille);
 const copied=prepareRecipeImportV417(ratatouille,4);
 const combined=mergeRecipeIngredientsV417([
  {name:'Riz',qty:250,unit:'g'},
  {name:'Viande hachée',qty:400,unit:'g'}
 ],copied);
 assert.equal(combined.added,4);
 assert.equal(combined.merged,0);
 assert.equal(combined.rows.length,6);
 assert.deepEqual(combined.rows.map(r=>r.name),[
  'Riz','Viande hachée','Tomates','Courgettes','Oignons','Huile d’olive'
 ]);
 assert.equal(copied[0].productId,'p-tomatoes','la référence catalogue est reprise');
 assert.equal(JSON.stringify(ratatouille),before,'la recette source reste intacte');
 copied[0].qty=1000;
 assert.equal(ratatouille.ingredients[0].qty,600,'pas de liaison vivante entre les recettes');
});

test('V41.7 : adaptation explicite des quantités au nombre de portions',()=>{
 const before=JSON.stringify(ratatouille);
 const half=prepareRecipeImportV417(ratatouille,2,{scale:true});
 assert.deepEqual(half.map(x=>x.qty),[300,200,1,15]);
 const original=prepareRecipeImportV417(ratatouille,2,{scale:false});
 assert.deepEqual(original.map(x=>x.qty),[600,400,2,30]);
 assert.equal(JSON.stringify(ratatouille),before);
});

test('V41.7 : les ingrédients communs sont additionnés, dont unités compatibles',()=>{
 const current=[
  {name:'tomates',qty:1,unit:'kg',store:'grandfrais'},
  {name:'Huile d’olive',qty:2,unit:'cl',store:'carrefour'},
  {name:'Riz',qty:250,unit:'g'}
 ];
 const combined=mergeRecipeIngredientsV417(current,prepareRecipeImportV417(ratatouille,4));
 assert.equal(combined.merged,2);
 assert.equal(combined.added,2);
 assert.equal(combined.rows.find(x=>x.name==='tomates').qty,1.6,'600g convertis en 0,6kg');
 assert.equal(combined.rows.find(x=>x.name==='Huile d’olive').qty,5,'30ml convertis en 3cl');
 assert.equal(combined.rows.find(x=>x.name==='Riz').qty,250);
 assert.equal(current[0].qty,1,'la saisie utilisateur initiale reste immuable');
});

test('V41.7 : aucune fausse conversion masse/volume',()=>{
 const result=mergeRecipeIngredientsV417([{name:'Huile d’olive',qty:90,unit:'g'}],
  [{name:'Huile d’olive',qty:100,unit:'ml'}]);
 assert.equal(result.added,1);
 assert.equal(result.merged,0);
 assert.equal(result.separateUnits,1);
 assert.equal(result.rows.length,2);
 assert.deepEqual(result.rows.map(r=>r.unit),['g','ml']);
});

test('V41.7 : ajout sans écraser le formulaire, y compris valeurs incomplètes',()=>{
 const current=[
  {name:'Riz',qty:'250',unit:'g',store:'carrefour'},
  {name:'Tomates',qty:'',unit:'g',store:'grandfrais'},
  {name:'',qty:'',unit:'g',store:'carrefour'}
 ];
 const result=mergeRecipeIngredientsV417(current,[{name:'Tomates',qty:600,unit:'g'},
  {name:'Courgettes',qty:400,unit:'g'}]);
 assert.equal(result.merged,0,'une quantité incomplète n’est jamais modifiée');
 assert.equal(result.rows.find(x=>x.name==='Riz').qty,'250');
 assert.equal(result.rows.filter(x=>x.name==='Tomates').length,2,'ligne ancienne préservée');
 assert.equal(result.rows.find(x=>x.name==='Courgettes').qty,400,'case vide réutilisée');
 assert.equal(result.separateUnits,1);
});

test('V41.7 : vérifications sécurisées avant toute composition',()=>{
 assert.throws(()=>prepareRecipeImportV417({...ratatouille,people:0},4),/portions/i);
 assert.throws(()=>prepareRecipeImportV417(ratatouille,0),/portions/i);
 assert.throws(()=>prepareRecipeImportV417({...ratatouille,ingredients:[]},4),/aucun ingrédient/);
 assert.throws(()=>prepareRecipeImportV417({...ratatouille,ingredients:[{name:'Tomates',qty:-2,unit:'g'}]},4),/incomplet/);
 assert.throws(()=>prepareRecipeImportV417({...ratatouille,ingredients:[{name:'Tomates',qty:.00001,unit:'g'}]},2),/trop faible/);
 assert.throws(()=>mergeRecipeIngredientsV417([], [{name:'Tomates',qty:0,unit:'g'}]),/incomplet/);
});

test('V41.7 : import dans le formulaire même pendant une édition, sans stockage ni affichage imbriqué',()=>{
 assert.match(app,/data-action="v417-toggle-recipe-import"/);
 assert.match(app,/data-action="v417-import-recipe"/);
 assert.match(app,/id="v417ImportSearch"/);
 assert.match(app,/id="v417ScaleToPortions"/);
 assert.match(app,/id="v417ImportFeedback"/);
 assert.match(app,/recipeImportResultsV417\('',old\?\.id\|\|''\)/,'le plat en cours d’édition est exclu');
 assert.match(app,/import\('\.\/recipe-import-v417\.mjs'\)/);
 assert.match(app,/if\(\$\('#recipeForm'\)!==form/,'un import tardif ne modifie pas un autre formulaire');
 assert.match(app,/if\(e\.target\.id==='v417ImportSearch'\)/);
 assert.match(app,/mode==='v417-import-recipe'/);
 assert.match(styles,/#v417ImportPanel\[hidden\]/);
 assert.match(styles,/\.v417-import-options\{[^}]*overflow:visible/);
 const importCode=app.slice(app.indexOf('async function importRecipeIngredientsV417('),
  app.indexOf('function recipeEditor(',app.indexOf('async function importRecipeIngredientsV417(')));
 const actualStatements=importCode.replace(/\/\/[^\n]*/g,'');
 assert.doesNotMatch(actualStatements,/\bpersist\s*\(/,'l’import ne doit jamais enregistrer automatiquement');
 assert.doesNotMatch(actualStatements,/\bcloseModal\s*\(/,'ne doit pas perdre les champs ou la photo en cours');
});
