import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const between=(from,to)=>{
 const start=source.indexOf('function '+from+'('),end=source.indexOf('function '+to+'(',start);
 assert.ok(start>=0 && end>start,'Functions missing: '+from+' / '+to);
 return source.slice(start,end)
};

test('Le calendrier utilise les semaines du lundi au dimanche, y compris aux changements de mois',()=>{
 const f=runInNewContext(between('localDate','getWeek')+';({monday,localDate,parseDate})',{});
 assert.equal(f.monday(f.parseDate('2026-10-30')),'2026-10-26');
 assert.equal(f.monday(f.parseDate('2026-11-01')),'2026-10-26');
 assert.equal(f.monday(f.parseDate('2026-11-02')),'2026-11-02');
 assert.equal(f.monday(f.parseDate('2027-01-01')),'2026-12-28');
});

test('Semaines déjà remplies signalées sans modifier les données',()=>{
 const state={weeks:{'2026-10-26':{meals:[null,{type:'recipe',recipeId:'a',people:2}]},
 '2026-11-02':{meals:Array(14).fill(null)}}};
 const detect=runInNewContext(between('weekHasMealsV36','calendarMarkupV36')+';weekHasMealsV36',{state});
 const original=JSON.stringify(state);
 assert.equal(detect('2026-10-26'),true);
 assert.equal(detect('2026-11-02'),false);
 assert.equal(detect('2026-11-09'),false);
 assert.equal(JSON.stringify(state),original);
});

test('Calendrier accessible depuis Menus et Courses, avec points et retour à cette semaine',()=>{
 assert.match(source,/data-action="open-week-calendar"/);
 assert.ok((source.match(/data-action="open-week-calendar"/g)||[]).length>=2);
 assert.match(source,/data-action="calendar-select"/);
 assert.match(source,/data-action="calendar-shift"/);
 assert.match(source,/data-action="calendar-current"/);
 assert.match(source,/calendarMonthV36/);
 assert.match(css,/\.v36-calendar-grid/);
});

test('Un plat se planifie directement sans effacer les plats déjà présents',()=>{
 assert.match(source,/data-action="plan-recipe"/);
 assert.match(source,/data-action="plan-recipe-to-meal"/);
 const plan=between('planRecipeV36','recipeImg');
 assert.match(plan,/addRecipeToMeal\(w,index,recipeId,portions\)/);
 assert.doesNotMatch(plan,/w\.meals\[index\]\s*=\s*null/);
 assert.match(plan,/toastWeekUndo\(/);
});

test('Plusieurs favoris se sélectionnent et sont ajoutés avec une seule sauvegarde',()=>{
 const body=between('addBulkFavoritesV36','frequentCatalogueItems');
 assert.match(body,/querySelectorAll\('\[data-v36-favorite\]:checked'\)/);
 assert.match(body,/favoriteAlreadyAddedV36\(w,extra\)/);
 assert.equal((body.match(/persist\(\)/g)||[]).length,1);
 const dup=runInNewContext(between('favoriteAlreadyAddedV36','bulkFavoritesV36')+';favoriteAlreadyAddedV36',{});
 assert.equal(dup({extras:[{ingredientId:'ing-1',productId:'p-1'}]},{ingredientId:'ing-1',productId:null}),true);
 assert.equal(dup({extras:[{ingredientId:'ing-1',productId:'p-1'}]},{ingredientId:null,productId:'p-1'}),true);
 assert.equal(dup({extras:[{ingredientId:'ing-1',productId:'p-1'}]},{ingredientId:'ing-2',productId:'p-2'}),false);
});

test('Les restes indiquent le stock disponible et conservent le placement manuel',()=>{
 assert.match(source,/v36-leftovers-summary/);
 assert.match(source,/v36-leftover-pill/);
 assert.match(source,/availableLeftoverSources\(getWeek\(\),index\)/);
 assert.match(source,/data-action="choose-leftovers"/);
 assert.match(source,/if\(prepared<=2\)return prepared/);
});

test('Cloud-first Firebase et données inchangés',()=>{
 assert.match(source,/const V34_CLOUD_ACTIVE = true/);
 assert.match(source,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(source,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(css,/prefers-reduced-motion/);
});
