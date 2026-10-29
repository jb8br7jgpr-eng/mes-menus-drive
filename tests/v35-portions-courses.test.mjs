import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function code(from, to) {
  const start = source.indexOf('function ' + from + '(');
  const end = source.indexOf('function ' + to + '(', start);
  assert.ok(start >= 0 && end > start, 'Functions missing: ' + from + ' → ' + to);
  return source.slice(start, end);
}

test('Portions préparées 1 et 2 : jamais de restes, y compris avec plusieurs plats', () => {
  const eaten = runInNewContext(code('portionsEatenHere', 'sourceBudget') + ';portionsEatenHere', {});
  for (const count of [1,2]) {
    for (const dishes of [[{people:count}],[{people:count},{people:2}]]) {
      assert.equal(eaten({people:count},dishes),count);
    }
  }
  assert.equal(eaten({people:4},[{people:4}]),2);
  assert.equal(eaten({people:4},[{people:4},{people:1}]),2);
});

test('Le choix d’un plat reprend ses portions de base, sauf quantité explicitement saisie', () => {
  let raw='';
  const select = runInNewContext(code('peopleInput','portionInputForDish') + ';peopleInput', {
    $: () => ({value:raw}), recipeById: id => ({one:{people:1},two:{people:2},four:{people:4}}[id])
  });
  assert.equal(select('one'),1);
  assert.equal(select('two'),2);
  assert.equal(select('four'),4);
  raw='4';assert.equal(select('two'),4);
  raw='0';assert.equal(select('two'),null);
  raw='31';assert.equal(select('two'),null);
  raw='1.5';assert.equal(select('two'),null);
});

function setupShopping() {
  const week = {
    meals:[{type:'recipe',recipeId:'keep',people:2}],
    generatedIngredients:[
      {name:'Pomme',qty:2,unit:'pièce'},
      {name:'Lait',qty:1,unit:'l',productId:'milk'},
      {name:'Pomme',qty:3,unit:'pièce'}
    ],
    extras:[
      {id:'extra-lait',name:'Lait',qty:1,unit:'bouteille',fromCatalogue:true,productId:'milk'},
      {id:'extra-pomme',name:'Pomme',qty:1,unit:'pièce'}
    ],
    pantry:{'maison':'préservé'},pantryUnits:{},
    checked:[],excluded:[]
  };
  const products={milk:{id:'milk',name:'Lait',packAmount:1,packUnit:'l',unit:'bouteille',category:'Produits frais'}};
  const context={
    getWeek:()=>week,
    productById:id=>products[id]||null,
    ingredientById:()=>null,
    converted:(value,unit)=>[value,unit],
    norm:s=>String(s).toLocaleLowerCase('fr-FR'),
    groupFor:()=> 'Épicerie et divers',
    productGroup:()=> 'Produits frais',
    quantity:(num,unit)=>num+' '+unit,
    shoppingStore:x=>x.productId==='milk'?'carrefour':'grandfrais'
  };
  const actions=runInNewContext(code('shopping','stockUnitChoices')+';({shopping,clearWeekShopping})',context);
  return {...actions,week};
}
test('Vider Carrefour conserve Grand Frais, les menus, les stocks et les fiches', () => {
  const {week,shopping,clearWeekShopping}=setupShopping();
  const initial=shopping();
  assert.equal(initial.length,2);
  const milk=initial.find(x=>x.store==='carrefour'),apple=initial.find(x=>x.store==='grandfrais');
  assert.deepEqual(Array.from(milk.generatedIndexes),[1]);
  assert.deepEqual(Array.from(apple.generatedIndexes),[0,2]);
  week.checked=[milk.id,apple.id];week.excluded=[milk.id,apple.id];
  assert.equal(clearWeekShopping(week,'carrefour',initial),1);
  assert.equal(shopping().length,1);
  assert.equal(shopping()[0].name,'Pomme');
  assert.equal(week.generatedIngredients.length,2);
  assert.equal(week.extras.length,1);
  assert.equal(week.extras[0].id,'extra-pomme');
  assert.deepEqual(week.checked,[apple.id]);
  assert.deepEqual(week.excluded,[apple.id]);
  assert.equal(week.meals[0].recipeId,'keep');
  assert.equal(week.pantry.maison,'préservé');
  assert.equal(week.coursesManuallyCleared,true);
});
test('Vider toutes les courses laisse la semaine et les produits intacts', () => {
  const {week,shopping,clearWeekShopping}=setupShopping();
  assert.equal(clearWeekShopping(week,'all',shopping()),2);
  assert.equal(week.generatedIngredients.length,0);
  assert.equal(week.extras.length,0);
  assert.equal(shopping().length,0);
  assert.equal(week.meals.length,1);
  assert.equal(clearWeekShopping(week,'all',shopping()),0);
});
test('Vider Grand Frais conserve Carrefour', () => {
  const {week,shopping,clearWeekShopping}=setupShopping();
  assert.equal(clearWeekShopping(week,'grandfrais',shopping()),1);
  const remaining=shopping();
  assert.equal(remaining.length,1);
  assert.equal(remaining[0].store,'carrefour');
  assert.equal(week.generatedIngredients.length,1);
  assert.equal(week.extras[0].id,'extra-lait');
});

test('Les boutons de magasin précèdent leurs encarts et le bouton global termine Courses', () => {
  const render=code('renderCourses','grandFraisText');
  const beforeStore=render.indexOf('data-action="clear-store-courses"');
  const storeCard=render.indexOf('<section class="course-store');
  const checked=render.indexOf("if(checked.length)");
  const global=render.indexOf('data-action="clear-all-courses"');
  const lastReturn=render.lastIndexOf('return out');
  assert.ok(beforeStore>=0 && storeCard>beforeStore,'Le bouton magasin doit être hors et au-dessus du cadre.');
  assert.ok(global>checked && lastReturn>global,'Le bouton global doit se trouver après les listes de courses.');
});
