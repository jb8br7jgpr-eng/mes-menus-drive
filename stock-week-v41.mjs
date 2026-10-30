// Speedrive V41 — besoins des menus et réservations de congélateur.
// Fonctions pures sans accès réseau, interface ni modification de données utilisateur.
import {normalizeStockV41,stockIdentityV41,stockMeasureV41,availableStockV41} from './stock-engine-v41.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const positive = value => Number.isFinite(value) && value > 0;
const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
const norm = text => String(text||'').trim().toLocaleLowerCase('fr-FR');

export function resolveStockArticleV41(line, ingredients=[], products=[]) {
  let ingredient = ingredients.find(i=>line?.ingredientId && i.id===line.ingredientId);
  if (!ingredient && !line?.ingredientId && !line?.productId && line?.name) {
    const matches=ingredients.filter(i=>norm(i.name)===norm(line.name));
    if (matches.length===1) ingredient=matches[0];
  }
  if (line?.ingredientId && !ingredient) return null;
  // Chercher le conditionnement APRÈS la résolution d'un ingrédient ancien par son nom :
  // sinon « 1 boîte de 6 œufs » reste une boîte et ne se déduit jamais de 6 pièces.
  const product = products.find(p=>p.id===(ingredient?.productId || line?.productId));
  if (!ingredient && !product) return null;
  const identity=stockIdentityV41({ingredientId:ingredient?.id||null,productId:product?.id||null},ingredients);
  return {identity,ingredient,product,name:ingredient?.name||product?.name||line.name,
    category:ingredient?.category||product?.category||'Autres',
    store:ingredient?.store||product?.store||null};
}

// Décompte des ingrédients d'une préparation. Aucune déduction à la planification.
// Refuse les lignes non identifiées : on ne peut pas consommer silencieusement un autre article.
export function kitchenMovementsV41(recipe,preparedPortions,ingredients=[],products=[]) {
  if (!recipe?.id || !Array.isArray(recipe.ingredients)) throw Error('Recette introuvable.');
  if (!Number.isInteger(preparedPortions)||preparedPortions<1||preparedPortions>1000)
    throw Error('Nombre de portions invalide.');
  const recipePortions=Number(recipe.people)||2;
  if (!positive(recipePortions)) throw Error('Portions de la recette invalides.');
  return recipe.ingredients.map(line=>{
    const article=resolveStockArticleV41(line,ingredients,products);
    if (!article) throw Error('Ingrédient sans fiche unique : '+(line?.name||'inconnu'));
    const qty=Number(line.qty)*preparedPortions/recipePortions;
    if (!positive(qty)) throw Error('Quantité incorrecte : '+article.name);
    const {amount,unit}=stockMeasureV41(qty,line.unit,article.product);
    return {type:'inventory',direction:'consume',identity:article.identity,name:article.name,
      amount,unit,category:article.category,store:article.store};
  });
}

// Un même lot ne peut être programmé deux fois si ses portions sont déjà réservées.
// On inclut les semaines passées/futures pour préserver les portions sur les deux iPhone.
export function freezerReservationsV41(weeks={}) {
  const reservations={};
  for (const week of Object.values(weeks||{})) {
    for (const meal of week?.meals||[]) {
      const dishes=meal?.type==='frozen'? [meal] :
        meal?.type==='multi' ? (meal.dishes||[]).filter(d=>d?.type==='frozen') : [];
      for (const dish of dishes) {
        if (!dish.lotId || !Number.isInteger(dish.portions) || dish.portions<1 || dish.consumed) continue;
        reservations[dish.lotId]=(reservations[dish.lotId]||0)+dish.portions;
      }
    }
  }
  return reservations;
}
export function remainingFreezerPortionsV41(stock,weeks,lotId,excludedSlot=null) {
  const lot=normalizeStockV41(stock).freezer[lotId];
  if (!lot) return 0;
  const reserved=freezerReservationsV41(weeks);
  if (excludedSlot) {
    const meal=weeks?.[excludedSlot.weekId]?.meals?.[excludedSlot.index];
    if (meal?.type==='frozen' && meal.lotId===lotId && !meal.consumed)
      reserved[lotId]=Math.max(0,(reserved[lotId]||0)-meal.portions);
  }
  return Math.max(0,lot.portions-(reserved[lotId]||0));
}
export function planFrozenMealV41(weeks,stock,weekId,index,lotId,portions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekId) || !Number.isInteger(index)||index<0||index>13)
    throw Error('Case du calendrier invalide.');
  if (!Number.isInteger(portions)||portions<1||portions>30)
    throw Error('Nombre de portions invalide.');
  const lot=normalizeStockV41(stock).freezer[lotId];
  if (!lot || lot.portions<1) throw Error('Lot congelé introuvable.');
  const week=weeks?.[weekId],previous=week?.meals?.[index]||null;
  if (previous?.consumed || previous?.completed) throw Error('Repas déjà terminé.');
  if (remainingFreezerPortionsV41(stock,weeks,lotId,{weekId,index})<portions)
    throw Error('Pas assez de portions disponibles dans le congélateur.');
  const updated=copy(weeks||{});
  if (!updated[weekId]) updated[weekId]={meals:Array(14).fill(null),extras:[],checked:[],excluded:[]};
  if (!Array.isArray(updated[weekId].meals))updated[weekId].meals=Array(14).fill(null);
  updated[weekId].meals[index]={type:'frozen',lotId,recipeId:lot.recipeId,portions};
  return updated;
}

// Reprendre une ancienne semaine : les recettes peuvent être rejouées mais les
// portions congelées doivent TOUJOURS être réservées à nouveau. Une portion déjà
// mangée la semaine précédente ne devient jamais une nouvelle portion disponible.
export function repeatWeekMealsV41(weeks,stock,sourceWeekId,targetWeekId) {
  if(sourceWeekId===targetWeekId || !weeks?.[sourceWeekId]?.meals ||
     !weeks?.[targetWeekId]?.meals ||
     !/^\\d{4}-\\d{2}-\\d{2}$/.test(targetWeekId))
    throw Error('Semaines de planning invalides.');
  let updated=copy(weeks),skippedFrozen=0,copiedFrozen=0;
  updated[targetWeekId].meals=Array(14).fill(null);
  // L'action ne doit jamais conserver une validation d'inventaire passée.
  updated[targetWeekId].v41MealActions={};
  for(let i=0;i<14;i++){
    const meal=weeks[sourceWeekId].meals[i];
    if(!meal)continue;
    if(meal.type==='frozen'){
      try{
        updated=planFrozenMealV41(updated,stock,targetWeekId,i,meal.lotId,meal.portions);
        copiedFrozen++;
      }catch(_){skippedFrozen++}
      continue
    }
    if(meal.type==='multi'&&Array.isArray(meal.dishes)){
      // Les sous-plats congelés sont historiques et ne doivent pas se recopier
      // silencieusement ; aucun sous-plat réservé sans contrôle des portions.
      const keep=meal.dishes.filter(d=>d&&d.type!=='frozen').map(copy);
      skippedFrozen+=meal.dishes.length-keep.length;
      if(keep.length)updated[targetWeekId].meals[i]={type:'multi',dishes:keep};
    }else{
      updated[targetWeekId].meals[i]=copy(meal);
      // Ne pas reprendre les drapeaux de consommation d'une semaine passée.
      delete updated[targetWeekId].meals[i].consumed;
      delete updated[targetWeekId].meals[i].completed;
    }
  }
  // Les restes ne doivent jamais faire référence à une préparation absente.
  const hasSource=(idx,id)=>{
    const source=updated[targetWeekId].meals[idx];
    return source?.type==='recipe'?source.recipeId===id:
      source?.type==='multi'&&(source.dishes||[]).some(d=>d?.recipeId===id&&d.type!=='leftovers'&&d.type!=='frozen');
  };
  for(let i=0;i<14;i++){
    const meal=updated[targetWeekId].meals[i];
    if(meal?.type==='leftovers'&&!hasSource(meal.fromIndex,meal.recipeId))updated[targetWeekId].meals[i]=null;
    if(meal?.type==='multi'){
      const kept=meal.dishes.filter(d=>d.type!=='leftovers'||hasSource(d.fromIndex,d.recipeId));
      updated[targetWeekId].meals[i]=kept.length?{type:'multi',dishes:kept}:null;
    }
  }
  return {weeks:updated,skippedFrozen,copiedFrozen};
}

// Les courses représentent toujours le manque total, jamais un mélange de boîtes
// et de pièces. L'arrondi au paquet reste la responsabilité du catalogue existant.
export function shoppingShortfallsV41(lines,stock,ingredients=[],products=[]) {
  const byKey=new Map();
  for (const line of lines||[]) {
    const qty=Number(line.qty);
    if (!positive(qty)) continue;
    const article=resolveStockArticleV41(line,ingredients,products);
    // Achats ponctuels sans fiche : achetables, mais aucun retrait de stock inventé.
    const measured=stockMeasureV41(qty,line.unit,article?.product||null);
    const key=(article?.identity||'unlinked:'+norm(line.name))+'|'+measured.unit;
    const existing=byKey.get(key)||{key,identity:article?.identity||null,name:article?.name||line.name,
      unit:measured.unit,gross:0,available:0,toBuy:0};
    existing.gross=round(existing.gross+measured.amount);
    byKey.set(key,existing);
  }
  for (const line of byKey.values()) {
    line.available=line.identity?availableStockV41(stock,line.identity,line.unit):0;
    line.toBuy=round(Math.max(0,line.gross-line.available));
  }
  return [...byKey.values()];
}

// Le bouton Courses faites ne valide que les lignes cochées et identifiables.
// Les achats libres sans fiche sont signalés pour validation manuelle.
export function purchasedMovementsV41(rows,ingredients=[],products=[]) {
  const movements=[],warnings=[];
  for (const line of rows||[]) {
    if (!line.checked || line.excluded || line.covered || !positive(Number(line.qty))) continue;
    const article=resolveStockArticleV41(line,ingredients,products);
    if (!article) {warnings.push('Article sans fiche : '+(line.name||'inconnu'));continue}
    const {amount,unit}=stockMeasureV41(Number(line.qty),line.unit,article.product);
    movements.push({type:'inventory',direction:'add',identity:article.identity,name:article.name,
      category:article.category,store:article.store,amount,unit});
  }
  return {movements,warnings};
}
