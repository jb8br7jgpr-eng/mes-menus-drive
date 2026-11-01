import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sourceStart=app.indexOf('function recipeIngredientNamesV416(');
const sourceEnd=app.indexOf('function recipeRows(){',sourceStart);
assert.ok(sourceStart>0&&sourceEnd>sourceStart,'fonctions V41.6 présentes');
const helperSource=app.slice(sourceStart,sourceEnd);
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();

const ingredientCatalog=[
 {id:'cream',name:'Crème fraîche épaisse',productId:'pcream'},
 {id:'pasta',name:'Pâtes',productId:'ppasta'},
 {id:'chicken',name:'Poulet'}
];
const products=[
 {id:'pcream',name:'Crème Fraîche entière 30%'},
 {id:'ppasta',name:'Pâtes 500 g'},
 {id:'coconut',name:'Crème de coco'}
];
const recipes=[
 {id:'1',name:'Poulet à la crème',category:'Viande',ingredients:[
  {ingredientId:'cream',productId:'pcream',name:'Crème fraîche',qty:200,unit:'g'},
  {ingredientId:'chicken',name:'Poulet',qty:250,unit:'g'}]},
 {id:'2',name:'Pâtes carbonara',category:'Pâtes',ingredients:[
  {ingredientId:'pasta',name:'Pâtes',qty:300,unit:'g'}]},
 {id:'3',name:'Gratin de pommes de terre',category:'Gratins',ingredients:[
  {name:'Creme fraiche',qty:100,unit:'g'}]},
 {id:'4',name:'Curry au lait de coco',category:'Plats mijotés & en sauce',ingredients:[
  {name:'Crème de coco',productId:'coconut',qty:200,unit:'ml'}]},
 {id:'5',name:'Crème brûlée',category:'Desserts',ingredients:[
  {name:'Œufs',qty:3,unit:'pièce'}]}
];
function context(extra={}){
 const state={recipes:structuredClone(recipes),ingredientCatalog:structuredClone(ingredientCatalog),products:structuredClone(products)};
 const environment={state,norm,search:'',recipeTypeFilter:'all',recipeIngredientFilterV416:'',
  recipeSort:'az',recipeTypes:['Pâtes','Viande','Gratins','Desserts','Plats mijotés & en sauce'],
  normalRecipeType:x=>x,...extra};
 const api=runInNewContext(helperSource+
  ';({recipeIngredientNamesV416,recipesWithIngredientV416,recipeIngredientSuggestionsV416,visibleRecipes})',environment);
 return {api,environment};
}
test('Crème fraîche : recherche insensible aux accents, anciennes recettes comprises',()=>{
 const {api,environment}=context();
 const original=JSON.stringify(environment.state);
 const matches=api.recipesWithIngredientV416(environment.state.recipes,'creme fraiche');
 assert.deepEqual(Array.from(matches,r=>r.id),['1','3']);
 assert.equal(JSON.stringify(environment.state),original,'un filtre ne modifie aucune recette');
 const matchesWithAccents=api.recipesWithIngredientV416(environment.state.recipes,'CRÈME FRAÎCHE');
 assert.deepEqual(Array.from(matchesWithAccents,r=>r.id),['1','3']);
});
test('Recherche par nom de produit lié en conservant identifiant et ingrédient',()=>{
 const {api,environment}=context();
 assert.deepEqual(Array.from(api.recipesWithIngredientV416(environment.state.recipes,'entière 30%'),r=>r.id),['1']);
 assert.deepEqual(Array.from(api.recipesWithIngredientV416(environment.state.recipes,'Pâtes 500 g'),r=>r.id),['2']);
 assert.deepEqual(Array.from(api.recipesWithIngredientV416(environment.state.recipes,'crème de coco'),r=>r.id),['4']);
 assert.deepEqual(Array.from(api.recipesWithIngredientV416(environment.state.recipes,'sauce barbecue'),r=>r.id),[]);
});
test('Pas de faux positif sur les noms de recettes ni sur les produits non utilisés',()=>{
 const {api,environment}=context();
 const q=api.recipesWithIngredientV416(environment.state.recipes,'crème');
 assert.deepEqual(Array.from(q,r=>r.id),['1','3','4']);
 assert.ok(!Array.from(q,r=>r.id).includes('5'),'Crème brûlée ne contient pas de crème dans sa liste');
 const names=api.recipeIngredientSuggestionsV416();
 assert.ok(names.includes('Crème fraîche épaisse'));
 assert.ok(names.includes('Crème Fraîche entière 30%'));
 assert.ok(!names.includes('Produit jamais utilisé'));
 assert.deepEqual(Array.from(api.recipesWithIngredientV416(environment.state.recipes,''),r=>r.id),['1','2','3','4','5']);
});
test('Filtre ingrédient + type + nom compatibles, tri des recettes inchangé',()=>{
 const {api,environment}=context({recipeIngredientFilterV416:'crème fraîche',recipeTypeFilter:'Viande'});
 assert.deepEqual(Array.from(api.visibleRecipes(),r=>r.id),['1']);
 environment.recipeTypeFilter='Gratins';
 assert.deepEqual(Array.from(api.visibleRecipes(),r=>r.id),['3']);
 environment.search='poulet';
 assert.deepEqual(Array.from(api.visibleRecipes(),r=>r.id),[]);
 environment.recipeTypeFilter='all';
 assert.deepEqual(Array.from(api.visibleRecipes(),r=>r.id),['1']);
 environment.recipeIngredientFilterV416='';
 assert.deepEqual(Array.from(api.visibleRecipes(),r=>r.id),['1']);
});
test('Interface mobile : champ, suggestions, bouton effacer, mises à jour sans persist',()=>{
 assert.match(app,/id="recipeIngredientSearch"/);
 assert.match(app,/id="v416IngredientSuggestions"/);
 assert.match(app,/data-action="v416-clear-ingredient"/);
 assert.match(app,/recipeIngredientSuggestionsV416\(\)/);
 assert.match(app,/e\.target\.id==='recipeIngredientSearch'/);
 assert.match(app,/recipeIngredientFilterV416=e\.target\.value/);
 assert.match(app,/refreshRecipeResultsV416\(\)/);
 assert.match(css,/\.v416-ingredient-search-row/);
 assert.match(css,/min-width:0/);
 const helperActions=app.slice(sourceStart,sourceEnd);
 assert.ok(!helperActions.includes('persist('),'aucune écriture de stock ou sauvegarde en filtrant');
});
