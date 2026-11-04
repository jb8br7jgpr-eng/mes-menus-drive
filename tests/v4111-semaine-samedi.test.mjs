import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const take=(from,to)=>{
 const a=app.indexOf('function '+from+'('),b=app.indexOf('function '+to+'(',a);
 assert.ok(a>=0&&b>a,from+' → '+to+' non trouvé');
 return app.slice(a,b)
};
const helpers=runInNewContext(take('localDate','getWeek')+
 ';({localDate,parseDate,saturdayV411,currentMenuWeekV411,menuMealDayV411,menuMealPeriodV411,menuMealLabelV411,menuDayMealsV411,currentMenuDayV411,menuWeekRangeV411,offsetDate})',{});

test('V41.11 : une période contient 14 repas du samedi soir au samedi midi suivant',()=>{
 const labels=Array.from({length:14},(_,i)=>helpers.menuMealLabelV411(i));
 assert.equal(labels[0],'Samedi soir');
 assert.equal(labels[1],'Dimanche midi');
 assert.equal(labels[2],'Dimanche soir');
 assert.equal(labels[3],'Lundi midi');
 assert.equal(labels[4],'Lundi soir');
 assert.equal(labels[11],'Vendredi midi');
 assert.equal(labels[12],'Vendredi soir');
 assert.equal(labels[13],'Samedi midi');
 const d=Array.from({length:14},(_,i)=>helpers.menuMealDayV411(i));
 assert.deepEqual(d,[0,1,1,2,2,3,3,4,4,5,5,6,6,7]);
 const idx=Array.from({length:8},(_,day)=>Array.from(helpers.menuDayMealsV411(day)));
 assert.deepEqual(idx,[[0],[1,2],[3,4],[5,6],[7,8],[9,10],[11,12],[13]]);
 assert.deepEqual(idx.flat(),Array.from({length:14},(_,i)=>i),'aucun doublon ni repas manquant');
});

test('V41.11 : vendredi, dimanche, changement de mois et passage d’année',()=>{
 assert.equal(helpers.saturdayV411(helpers.parseDate('2026-11-04')),'2026-10-31');
 assert.equal(helpers.saturdayV411(helpers.parseDate('2026-11-01')),'2026-10-31');
 assert.equal(helpers.saturdayV411(helpers.parseDate('2026-11-07')),'2026-11-07');
 assert.equal(helpers.saturdayV411(helpers.parseDate('2027-01-01')),'2026-12-26');
 assert.equal(helpers.offsetDate('2026-12-26',7),'2027-01-02');
 assert.match(helpers.menuWeekRangeV411('2026-10-31'),/31 oct.*soir.*7 nov.*midi/);
});

test('V41.11 : samedi matin garde le dernier déjeuner, samedi après-midi commence une nouvelle semaine',()=>{
 const before=new Date(2026,10,7,10,30),after=new Date(2026,10,7,15,0);
 assert.equal(helpers.currentMenuWeekV411(before),'2026-10-31');
 assert.equal(helpers.currentMenuWeekV411(after),'2026-11-07');
 assert.equal(helpers.currentMenuDayV411(before),7);
 assert.equal(helpers.currentMenuDayV411(after),0);
 assert.equal(helpers.currentMenuWeekV411(new Date(2026,10,4,19)),'2026-10-31');
 assert.equal(helpers.currentMenuDayV411(new Date(2026,10,4,19)),4);
});

test('V41.11 : menus et planification affichent huit dates mais seulement quatorze créneaux',()=>{
 const menu=take('renderMenus','planRecipeV36');
 assert.match(menu,/for\(let day=0;day<8;day\+\+\)/);
 assert.match(menu,/const indices=menuDayMealsV411\(day\)/);
 assert.match(menu,/indices\.map\(i=>mealCard\(w\.meals\[i\],i\)\)/);
 assert.match(menu,/menuDaysV411\[day\]/);
 assert.match(menu,/menuWeekRangeV411\(currentWeek\)/);
 assert.match(menu,/count\+' \/ 14 repas/);
 const planning=take('planRecipeV36','commitPlannedRecipeV36');
 assert.match(planning,/for\(let i=0;i<14;i\+\+\)/);
 assert.match(planning,/menuMealLabelV411\(i\)/);
 assert.match(planning,/menuWeekRangeV411\(currentWeek\)/);
 assert.doesNotMatch(menu,/w\.meals\[day\*2\]/);
});

test('V41.11 : vider un samedi ne supprime que son repas, pas le samedi suivant',()=>{
 const clear=runInNewContext(take('clearCalendarDay','clearCalendarWeek')+
 ';clearCalendarDay',{
   menuDayMealsV411:helpers.menuDayMealsV411,
   clearMealWithPair:(w,i)=>{w.meals[i]=null}
 });
 const week={meals:Array.from({length:14},(_,i)=>({recipeId:'r'+i}))};
 assert.equal(clear(week,0),true);
 assert.equal(week.meals[0],null);
 assert.equal(week.meals[13].recipeId,'r13');
 assert.equal(week.meals[1].recipeId,'r1');
 assert.equal(clear(week,7),true);
 assert.equal(week.meals[13],null);
 assert.equal(week.meals[12].recipeId,'r12');
 assert.equal(clear(week,7),false);
 assert.equal(clear(week,8),false);
 const action=app.slice(app.indexOf("else if(mode==='clear-day')"),app.indexOf("else if(mode==='clear-week')"));
 assert.match(action,/const indexes=menuDayMealsV411\(day\)/);
 assert.match(action,/indexes\.some\(i=>isMealDoneV41\(w,i\)\)/,'repas déjà consommés protégés');
});

test('V41.11 : calendrier démarrant samedi et sélectionnant les nouvelles périodes',()=>{
 const cal=take('calendarMarkupV36','openCalendarV36');
 assert.match(cal,/const offset=\(start\.getDay\(\)\+1\)%7/,'première colonne samedi');
 assert.match(cal,/menuDaysV411\.slice\(0,7\)/);
 assert.match(cal,/key=saturdayV411\(day\)/);
 assert.match(cal,/day\.getDay\(\)===6&&weekHasMealsV36\(key\)/,'point menu sur samedi');
 assert.match(cal,/samedi soir → samedi midi suivant/);
 const select=take('selectCalendarV36','emptyView');
 assert.match(select,/currentWeek=saturdayV411\(d\)/);
 const nav=take('weekSwitcher','courseGenerationBanner');
 assert.match(nav,/menuWeekRangeV411\(currentWeek\)/);
 assert.match(nav,/currentWeek!==currentMenuWeekV411\(new Date\(\)\)/);
});

test('V41.11 : noms, retour au jour, restes et groupes du générateur adaptés',()=>{
 const meal=take('mealCard','renderMenus');
 assert.match(meal,/menuMealLabelV411\(i\)/);
 const context=take('renderMealContext','pageHeading');
 assert.match(context,/menuMealDayV411\(index\)/);
 const generator=app.slice(app.indexOf('function populate('),app.indexOf('async function compressImage(',app.indexOf('function populate(')));
 assert.match(generator,/menuMealDayV411\(i\)/);
 assert.match(generator,/menuDayMealsV411\(day\)/);
 for(const term of ['menuMealLabelV411(index)','menuMealLabelV411(left.fromIndex)',
  'menuMealLabelV411(x.sourceIndex)'])
  assert.ok(app.includes(term),term);
 assert.match(app,/const day=currentMenuDayV411\(new Date\(\)\)/);
});

test('V41.11 : courses et stock utilisent toujours la même semaine, sans toucher au catalogue',()=>{
 assert.match(app,/const w=getWeek\(\),map=new Map\(\),packs=new Map\(\)/);
 assert.match(app,/weekId:currentWeek/);
 assert.match(app,/state\.weeks\[offsetDate\(currentWeek,-7\*weeksAgo\)\]/);
 assert.match(app,/previousWeekId=offsetDate\(currentWeek,-7\)/);
 assert.match(app,/const baseState=\(\)=>\(\{schema:1,recipes:\[\],products:\[\],weeks:\{\}/);
 assert.match(app,/const V34_CLOUD_ACTIVE = true/);
 assert.match(app,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 const helpersCode=take('localDate','getWeek');
 assert.doesNotMatch(helpersCode,/state\.recipes\s*=|state\.products\s*=|state\.weeks\s*=/);
 assert.doesNotMatch(helpersCode,/\bpersist\(/);
});
