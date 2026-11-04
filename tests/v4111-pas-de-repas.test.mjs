import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {repeatWeekMealsV41} from '../stock-week-v41.mjs';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const between=(from,to)=>{
 const a=src.indexOf('function '+from+'('),b=src.indexOf('function '+to+'(',a);
 assert.ok(a>=0&&b>a,from+' → '+to+' non trouvé');
 return src.slice(a,b)
};
const mealDishes=runInNewContext(between('mealDishes','mealCard')+';mealDishes',{});
const recipe={id:'r1',people:2,ingredients:[{name:'Riz',qty:200,unit:'g',ingredientId:'riz'}]};
const context={mealDishes,mealProductsV412:()=>[],recipeById:id=>id==='r1'?recipe:null};
const signature=runInNewContext(between('menuGenerationSignature','hasCookedMeals')+';menuGenerationSignature',context);
const ingredients=runInNewContext(between('collectRecipeIngredients','menuGenerationSignature')+';collectRecipeIngredients',context);
const meal={type:'recipe',recipeId:'r1',people:2};

test('V41.11 : le créneau « Pas de repas » ne produit aucun ingrédient ou achat',()=>{
 const week={meals:[{type:'no-meal'},meal,...Array(12).fill(null)],v41MealActions:{}};
 assert.equal(ingredients(week).length,1);
 assert.equal(ingredients(week)[0].name,'Riz');
 week.meals[1]={type:'no-meal'};
 assert.equal(ingredients(week).length,0);
 assert.equal(mealDishes({type:'no-meal'}).length,0);
});
test('V41.11 : « Pas de repas » est un créneau renseigné que Générer les repas respecte',()=>{
 const full=Array(14).fill(null);
 full[0]={type:'no-meal'};
 full[13]={type:'no-meal'};
 assert.equal(full.filter(Boolean).length,2,'les deux samedis comptent dans les 14 repas');
 assert.equal(full.filter(m=>!m).length,12,'le générateur ne remplit que les 12 autres créneaux');
 const generator=src.slice(src.indexOf('function populate('),src.indexOf('async function compressImage(',src.indexOf('function populate(')));
 assert.match(generator,/if\(w\.meals\[i\]\)continue/);
 assert.match(src,/count<14\?/);
});
test('V41.11 : la liste de courses doit signaler un changement après « Pas de repas »',()=>{
 const w={meals:[meal,...Array(13).fill(null)]};
 const before=signature(w);
 w.meals[0]={type:'no-meal'};
 assert.notEqual(signature(w),before,'la signature change si le plat est remplacé par une sortie');
 w.meals[0]=null;
 assert.notEqual(signature(w),before);
 assert.notEqual(signature({meals:[{type:'no-meal'},...Array(13).fill(null)]}),
  signature({meals:Array(14).fill(null)}),'un créneau renseigné diffère dun créneau vide');
});
test('V41.11 : interface claire, réversible, sans actions réservées aux repas cuisinés',()=>{
 const menuCard=between('mealCard','renderMenus');
 assert.match(menuCard,/meal\?\.type==='no-meal'/);
 assert.match(menuCard,/names=\['🍽️ Pas de repas'\]/);
 assert.match(menuCard,/menuMealPeriodV411\(i\)/,'samedi soir et samedi midi doivent être affichés correctement');
 const picker=between('pickMeal','extraSearchItems');
 assert.match(picker,/data-action="mark-no-meal"/);
 assert.match(picker,/meal\?\.type==='no-meal'/);
 assert.match(picker,/data-action="remove-meal"/,'l’utilisateur peut vider et choisir de nouveau');
 assert.match(picker,/data-action="v41-replace-meal"/,'l’utilisateur peut revenir à un plat');
 assert.match(picker,/if\(validated\)\{/,'aucune modification de repas validé sans annulation');
 const handler=src.slice(src.indexOf("else if(mode==='mark-no-meal')"),src.indexOf("else if(mode==='move-copy-meal')"));
 assert.match(handler,/if\(isMealDoneV41\(w,index\)\)/);
 assert.match(handler,/confirm\('Remplacer le repas prévu/);
 assert.match(handler,/const before=weekBeforeUndo\(\)/);
 assert.match(handler,/clearMealWithPair\(w,index\)/,'nettoyage des restes liés');
 assert.match(handler,/w\.meals\[index\]=\{type:'no-meal'\}/);
 assert.match(handler,/persist\(\)/);
 assert.match(handler,/toastWeekUndo\(/);
 assert.doesNotMatch(handler,/v41MealActions\s*=/,'aucun reset silencieux du stock');
 assert.match(css,/\.meal-tile\.v411-no-meal/);
 assert.match(css,/\.v411-no-meal-button/);
});
test('V41.11 : les semaines précédentes copient les sorties, sans toucher aux recettes',()=>{
 const a='2026-11-07',b='2026-11-14';
 const previous={meals:[{type:'no-meal'},meal,...Array(12).fill(null)]};
 const target={meals:Array(14).fill(null),v41MealActions:{}};
 const weeks={[a]:previous,[b]:target};
 const original=JSON.stringify(weeks);
 const stock={version:1,items:{},freezer:{},applied:{},history:[]};
 const result=repeatWeekMealsV41(weeks,stock,a,b);
 assert.equal(result.weeks[b].meals[0].type,'no-meal');
 assert.equal(result.weeks[b].meals[1].recipeId,'r1');
 assert.equal(JSON.stringify(weeks),original,'pas de modification de la source');
});
test('V41.11 : aucun changement aux données produit, recettes, Firebase et stockage',()=>{
 assert.match(src,/const V34_CLOUD_ACTIVE = true/);
 assert.match(src,/const baseState=\(\)=>\(\{schema:1,recipes:\[\],products:\[\],weeks:\{\}/);
 assert.match(src,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 const handler=src.slice(src.indexOf("else if(mode==='mark-no-meal')"),src.indexOf("else if(mode==='move-copy-meal')"));
 assert.doesNotMatch(handler,/state\.(recipes|products|ingredientCatalog|stockV41)/);
 assert.match(css,/\.day-meals\.v411-one-meal\{grid-template-columns:minmax\(0,1fr\)/);
});
