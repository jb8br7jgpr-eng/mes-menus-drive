// Speedrive V41 — actions du stock en mode brouillon. Aucune migration automatique.
import {emptyStockV41,applyStockTransactionV41,availableStockV41,
 stockIdentityV41,previewLegacyPantryV41} from './stock-engine-v41.mjs';
import {kitchenMovementsV41,purchasedMovementsV41,planFrozenMealV41,
 remainingFreezerPortionsV41} from './stock-week-v41.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=n=>Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:3});
const input=(id,label,amount=1,min=0.001,max=100000)=>'<div class="field"><label for="'+id+'">'+esc(label)+'</label><input type="number" inputmode="decimal" id="'+id+'" step="any" min="'+min+'" max="'+max+'" value="'+amount+'"></div>';
const amount=id=>{const el=document.getElementById(id);return el?.value.trim()===''?NaN:Number(el?.value)};
const stockOf=state=>state.stockV41||emptyStockV41();
const legacyPantryWeeks=state=>Object.entries(state.weeks||{})
 .filter(([_,week])=>Object.values(week?.pantry||{}).some(value=>Number(value)>0))
 .map(([id])=>id).sort().reverse();
function migrationGate(ctx) {
 if(ctx.state.stockV41 || !legacyPantryWeeks(ctx.state).length)return false;
 const weeks=legacyPantryWeeks(ctx.state);
 ctx.showModal('Initialiser mon stock permanent',
  '<p class="helper">Du stock est déjà renseigné dans '+weeks.length+
  ' ancienne'+(weeks.length>1?'s semaines':' semaine')+
  '. Le nouvel inventaire remplace les quantités par semaine pour calculer les achats. Choisis UNE semaine de référence : les anciennes données resteront conservées.</p>'+
  '<div class="v41-select-list">'+weeks.map(weekId=>
    '<button class="v41-select-row" data-action="v41-preview-migration" data-week="'+esc(weekId)+'">'+
    'Examiner le stock du '+esc(weekId)+' <span>→</span></button>').join('')+'</div>'+
  '<button class="btn secondary wide" data-action="v41-add-stock-fresh">Démarrer un stock vide à la place</button>');
 return true;
}
function commit(ctx,transaction,done) {
 try {
  const res=applyStockTransactionV41(stockOf(ctx.state),transaction);
  if(!res.changed){ctx.toast('Cette opération a déjà été enregistrée.');return false}
  // Ne jamais laisser l'inventaire avancé si la validation associée échoue.
  const previousStock=ctx.state.stockV41;
  const previousWeeks=JSON.parse(JSON.stringify(ctx.state.weeks));
  ctx.state.stockV41=res.stock;
  try { done?.(); }
  catch(error){
   ctx.state.stockV41=previousStock;
   ctx.state.weeks=previousWeeks;
   throw error;
  }
  ctx.persist();ctx.closeModal();ctx.render(true);ctx.toast(transaction.label||'Stock mis à jour !');
  return true;
 } catch(e){ctx.toast(e.message||'Stock non modifié.');return false}
}
const productOf=(ctx,id)=>ctx.state.products.find(p=>p.id===id);
const ingredientOf=(ctx,id)=>ctx.state.ingredientCatalog.find(p=>p.id===id);
function articleOf(ctx,kind,id) {
 const ingredient=kind==='ingredient'?ingredientOf(ctx,id):null;
 const product=kind==='product'?productOf(ctx,id):productOf(ctx,ingredient?.productId);
 if(!ingredient&&!product)return null;
 const identity=stockIdentityV41({ingredientId:ingredient?.id||null,productId:product?.id||null},ctx.state.ingredientCatalog);
 return {identity,product,name:ingredient?.name||product?.name,category:ingredient?.category||product?.category||'Autres',
  store:ingredient?.store||product?.store,unit:ingredient?.unit||product?.unit||'pièce'};
}
function selection(ctx,forFrozen=false) {
 if(forFrozen){
  const recipes=ctx.state.recipes.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  ctx.showModal('Plat déjà congelé','<p class="helper">Enregistre uniquement des portions déjà présentes au congélateur. Les ingrédients ne sont pas déduits une deuxième fois.</p>'+
   (recipes.length?'<div class="v41-select-list">'+recipes.map(r=>'<button class="v41-select-row" data-action="v41-freezer-select" data-id="'+esc(r.id)+'">'+esc(r.name)+'<span>＋</span></button>').join('')+'</div>':'<div class="note">Ajoute d’abord une recette dans Plats.</div>'));
  return;
 }
 const ingredients=(ctx.state.ingredientCatalog||[]).map(x=>({kind:'ingredient',...x}));
 const linked=new Set(ingredients.map(x=>x.productId).filter(Boolean));
 const products=(ctx.state.products||[]).filter(x=>!linked.has(x.id)).map(x=>({kind:'product',...x}));
 const all=[...ingredients,...products].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 ctx.showModal('Ajouter au stock','<p class="helper">Choisis un produit ou un ingrédient existant, pour éviter les doublons.</p>'+
  (all.length?'<div class="v41-select-list">'+all.map(x=>
   '<button class="v41-select-row" data-action="v41-stock-select" data-kind="'+x.kind+'" data-id="'+esc(x.id)+'">'+
   '<span>'+esc(x.name)+'<small>'+esc(x.category||'Autres')+'</small></span><span>＋</span></button>').join('')+'</div>':
   '<div class="note">Ajoute d’abord tes ingrédients et produits habituels dans Produits.</div>'));
}
// A validation marker may survive a recipe deletion or an earlier migration.
function orphanValidationKeys(ctx,week,index) {
 if(!Number.isInteger(index)||index<0||index>13)return [];
 const meal=week.meals[index],known=new Set();
 if(meal?.type==='frozen')known.add(index+':frozen');
 for(const d of ctx.mealDishes(meal))known.add(index+':'+d.recipeId);
 for(const d of ctx.mealLeftovers(meal))
  known.add(index+':leftovers:'+d.fromIndex+':'+d.recipeId);
 return Object.keys(week.v41MealActions||{}).filter(k=>
  k.startsWith(index+':')&&!known.has(k));
}
function replaceModal(ctx,index) {
 const meal=ctx.getWeek().meals[index],actions=ctx.getWeek().v41MealActions||{};
 if(Object.keys(actions).some(k=>k.startsWith(index+':'))){ctx.toast('Repas déjà terminé : corrige le stock si nécessaire.');return}
 const recipes=ctx.state.recipes.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 const frozen=Object.values(stockOf(ctx.state).freezer||{}).filter(l=>remainingFreezerPortionsV41(
  stockOf(ctx.state),ctx.state.weeks,l.lotId,{weekId:ctx.currentWeek,index})>0);
 let body='<p class="helper">Remplace uniquement ce repas. L’ancien plat ne déduit aucun ingrédient du stock.</p>'+
  '<button class="btn secondary wide" data-action="v41-replace-ordered" data-index="'+index+'">🍕 Repas commandé / libre</button>'+
  '<div class="section-head"><h3>Un plat de mes recettes</h3></div>'+
  input('v41RecipePortions','Portions à préparer',2,1,30)+
  '<div class="v41-select-list">'+
  recipes.map(r=>'<button class="v41-select-row" data-action="v41-replace-recipe" data-index="'+index+'" data-id="'+esc(r.id)+'">'+esc(r.name)+' <span>→</span></button>').join('')+'</div>';
 if(frozen.length)body+='<div class="section-head"><h3>Un plat du congélateur</h3></div>'+
  input('v41FrozenMealPortions','Portions à décongeler',Math.min(2,Math.max(...frozen.map(x=>remainingFreezerPortionsV41(
    stockOf(ctx.state),ctx.state.weeks,x.lotId,{weekId:ctx.currentWeek,index})))),1,30)+
  '<div class="v41-select-list">'+frozen.map(l=>'<button class="v41-select-row" data-action="v41-replace-frozen" data-index="'+index+'" data-id="'+esc(l.lotId)+'">'+
  esc(l.name)+'<small>'+remainingFreezerPortionsV41(stockOf(ctx.state),ctx.state.weeks,l.lotId,{weekId:ctx.currentWeek,index})+' portions disponibles pour ce repas</small></button>').join('')+'</div>';
 ctx.showModal('Remplacer le repas',body);
}
export function handleStockActionV41(ctx) {
 const {mode,a,id,index}=ctx,w=ctx.getWeek(),state=ctx.state,stock=stockOf(state);
 const tx=(label,movements)=>({id:'v41:'+ctx.uid(),label,movements});
 const requiresInventory=['v41-add-stock','v41-add-frozen','v41-save-stock','v41-save-frozen',
  'v41-courses-done','v41-eat-recipe','v41-confirm-freeze-recipe',
  'v41-adjust-stock','v41-confirm-stock','v41-correct-freezer','v41-confirm-freezer'];
 if(requiresInventory.includes(mode)&&migrationGate(ctx))return true;
 if(mode==='v41-add-stock'){selection(ctx);return true}
 if(mode==='v41-add-stock-fresh'){
  if(state.stockV41){selection(ctx);return true}
  if(!confirm('Commencer un nouvel inventaire vide ? Les quantités indiquées dans les anciennes courses resteront enregistrées dans leur historique, mais ne seront plus utilisées pour calculer les achats.'))return true;
  state.stockV41=emptyStockV41();
  ctx.persist();selection(ctx);
  return true;
 }
 if(mode==='v41-add-frozen'){selection(ctx,true);return true}
 if(mode==='v41-stock-select'){
  const article=articleOf(ctx,a.dataset.kind,id);if(!article)return true;
  ctx.showModal('Stock · '+article.name,
   '<p class="helper">Quantité à ajouter au stock permanent.</p>'+
   input('v41StockQuantity','Quantité',1)+
   '<div class="field"><label for="v41StockUnit">Unité</label><select id="v41StockUnit">'+
   ctx.units.map(u=>'<option value="'+esc(u)+'" '+(u===article.unit?'selected':'')+'>'+esc(u)+'</option>').join('')+
   '</select></div><button class="btn wide" data-action="v41-save-stock" data-kind="'+a.dataset.kind+'" data-id="'+esc(id)+'">Ajouter au stock</button>');return true
 }
 if(mode==='v41-save-stock'){
  const article=articleOf(ctx,a.dataset.kind,id),n=amount('v41StockQuantity'),unit=document.getElementById('v41StockUnit')?.value;
  if(!article||!Number.isFinite(n)||n<=0||n>100000||!ctx.units.includes(unit)){ctx.toast('Quantité ou unité incorrecte.');return true}
  commit(ctx,tx('Produit ajouté au stock',[{type:'inventory',direction:'add',identity:article.identity,
   name:article.name,category:article.category,store:article.store,amount:n,unit,product:article.product}]));return true
 }
 if(mode==='v41-adjust-stock'){
  const current=availableStockV41(stock,a.dataset.identity,a.dataset.unit);
  ctx.showModal('Corriger le stock','<p class="helper">Indique la quantité réellement disponible. Le calcul se fera sans remplacer les autres articles.</p>'+
   input('v41StockActual','Quantité disponible en '+a.dataset.unit,current,0)+
   '<button class="btn wide" data-action="v41-confirm-stock" data-identity="'+esc(a.dataset.identity)+'" data-unit="'+esc(a.dataset.unit)+'">Enregistrer</button>');return true
 }
 if(mode==='v41-confirm-stock'){
  const n=amount('v41StockActual'),identity=a.dataset.identity,unit=a.dataset.unit;
  if(!Number.isFinite(n)||n<0||n>100000){ctx.toast('Quantité invalide.');return true}
  const before=availableStockV41(stock,identity,unit),diff=Math.round((n-before)*1000)/1000;
  if(Math.abs(diff)<0.0001){ctx.closeModal();ctx.toast('Aucun changement.');return true}
  const record=stock.items[identity+'|'+unit];
  commit(ctx,tx('Correction du stock',[{type:'inventory',direction:diff>0?'add':'consume',
   identity,amount:Math.abs(diff),unit,name:record?.name||identity,category:record?.category,store:record?.store}]));return true
 }
 if(mode==='v41-freezer-select'){
  const r=ctx.recipeById(id);if(!r)return true;
  ctx.showModal('Congélateur · '+r.name,'<p class="helper">Portions déjà préparées et congelées. Aucun ingrédient n’est déduit maintenant.</p>'+
   input('v41FreezerPortions','Portions disponibles',2,1,1000)+
   '<button class="btn wide" data-action="v41-save-frozen" data-id="'+esc(id)+'">Ajouter au congélateur</button>');return true
 }
 if(mode==='v41-save-frozen'){
  const r=ctx.recipeById(id),portions=amount('v41FreezerPortions');
  if(!r||!Number.isInteger(portions)||portions<1||portions>1000){ctx.toast('Nombre de portions invalide.');return true}
  commit(ctx,tx('Plat ajouté au congélateur',[{type:'freezer',direction:'add',lotId:'lot:'+ctx.uid(),
   recipeId:id,name:r.name,portions,preparedAt:new Date().toISOString()}]));return true
 }
 if(mode==='v41-correct-freezer'){
  const lot=stock.freezer[id];if(!lot)return true;
  ctx.showModal('Corriger · '+lot.name,input('v41FreezerActual','Portions réellement disponibles',lot.portions,0,1000)+
   '<button class="btn wide" data-action="v41-confirm-freezer" data-id="'+esc(id)+'">Enregistrer</button>');return true
 }
 if(mode==='v41-confirm-freezer'){
  const lot=stock.freezer[id],n=amount('v41FreezerActual');
  if(!lot||!Number.isInteger(n)||n<0||n>1000){ctx.toast('Nombre de portions invalide.');return true}
  const diff=n-lot.portions;
  if(diff===0){ctx.closeModal();return true}
  // Le retrait ne doit pas rendre des réservations futures impossibles.
  const reserved=ctx.freezerReservationsV41(state.weeks)[id]||0;
  if(n<reserved){ctx.toast('Ces portions sont déjà programmées dans des menus.');return true}
  commit(ctx,tx('Correction du congélateur',[{type:'freezer',direction:diff>0?'add':'consume',
   lotId:id,recipeId:lot.recipeId,name:lot.name,portions:Math.abs(diff)}]));return true
 }
 if(mode==='v41-freeze-recipe'){
  if(!Number.isInteger(index)||index<0||index>13)return true;
  const dish=ctx.mealDishes(w.meals[index]).find(x=>x.recipeId===id),r=ctx.recipeById(id);
  if(!dish||!r||w.v41MealActions?.[index+':'+id])return true;
  ctx.showModal('Congeler · '+r.name,
   '<p class="helper">Les ingrédients de la recette seront retirés du stock pour les '+dish.people+' portions préparées. Indique combien tu en mets au congélateur ; les autres portions sont considérées comme mangées.</p>'+
   input('v41FreezePortions','Portions à congeler',dish.people,1,dish.people)+
   '<button class="btn wide" data-action="v41-confirm-freeze-recipe" data-index="'+index+'" data-id="'+esc(id)+'">❄️ Confirmer la préparation</button>');
  return true
 }
 if(mode==='v41-eat-recipe'||mode==='v41-confirm-freeze-recipe'){
  if(!Number.isInteger(index)||index<0||index>13)return true;
  const dish=ctx.mealDishes(w.meals[index]).find(x=>x.recipeId===id),r=ctx.recipeById(id);
  if(!dish||!r)return true;
  const key=index+':'+id;
  if(w.v41MealActions?.[key]){ctx.toast('Ce plat a déjà été validé.');return true}
  const freeze=mode==='v41-confirm-freeze-recipe';
  const relatedLeftovers=w.meals.flatMap((meal,otherIndex)=>ctx.mealLeftovers(meal)
   .filter(x=>x.fromIndex===index&&x.recipeId===id)
   .map(x=>({index:otherIndex,people:x.people})));
  if(freeze){
   if(relatedLeftovers.some(x=>w.v41MealActions?.[x.index+':leftovers:'+index+':'+id])){
    ctx.toast('Ces restes ont déjà été mangés : impossible de congeler le même plat une deuxième fois.');return true
   }
   if(relatedLeftovers.length&&!confirm('Ce plat a déjà '+relatedLeftovers.length+
    ' repas de restes prévus. Les congeler retirera ces restes des menus pour éviter de compter deux fois les portions. Continuer ?'))return true;
  }
  if(!freeze&&!confirm('Confirmer que « '+r.name+' » a bien été préparé ('+dish.people+' portions) ? Les ingrédients de toutes les portions seront déduits du Stock maison.'))return true;
  const frozenPortions=freeze?amount('v41FreezePortions'):0;
  if(freeze&&(!Number.isInteger(frozenPortions)||frozenPortions<1||frozenPortions>Number(dish.people))){
   ctx.toast('Choisis un nombre de portions compris entre 1 et '+dish.people+'.');return true
  }
  try{
   const movements=kitchenMovementsV41(r,Number(dish.people),state.ingredientCatalog,state.products);
   let lotId=null;
   if(freeze){
    lotId='lot:'+ctx.uid();
    movements.push({type:'freezer',direction:'add',lotId,recipeId:id,name:r.name,portions:frozenPortions,preparedAt:new Date().toISOString()});
   }
   commit(ctx,tx(freeze?'Plat préparé et congelé':'Plat préparé et mangé',movements),()=>{
    w.v41MealActions=w.v41MealActions||{};
    w.v41MealActions[key]={status:freeze?'frozen':'eaten',lotId,frozenPortions,at:new Date().toISOString(),
     movements:JSON.parse(JSON.stringify(movements))};
    if(freeze)ctx.reconcileLeftovers(w,index);
    if(Array.isArray(w.generatedIngredients))ctx.generateWeekCourses(w);
   });
  }catch(e){ctx.toast(e.message||'Impossible de retirer les ingrédients.')}return true
 }
 // Les restes ont déjà été cuisinés. Ne JAMAIS débiter les ingrédients de nouveau.
 // On exige d'abord la validation de la préparation d'origine.
 if(mode==='v41-eat-leftovers'){
  if(!Number.isInteger(index)||index<0||index>13)return true;
  const sourceIndex=Number(a.dataset.source);
  const left=ctx.mealLeftovers(w.meals[index]).find(x=>x.recipeId===id&&x.fromIndex===sourceIndex);
  if(!left||!Number.isInteger(sourceIndex)||sourceIndex<0||sourceIndex>=index){
   ctx.toast('Ces restes ne correspondent à aucune préparation précédente.');return true;
  }
  const key=index+':leftovers:'+sourceIndex+':'+id;
  if(w.v41MealActions?.[key]){ctx.toast('Ces restes ont déjà été validés.');return true}
  const origin=w.v41MealActions?.[sourceIndex+':'+id];
  if(origin?.status!=='eaten'){
   ctx.toast('Valide d’abord « C’est mangé » pour la préparation d’origine afin de retirer une seule fois les ingrédients.');return true
  }
  if(!confirm('Confirmer que '+left.people+' portion'+(left.people>1?'s':'')+' de restes de « '+
   (ctx.recipeById(id)?.name||'ce plat')+' » ont été mangées ? Aucun ingrédient ne sera retiré deux fois.'))return true;
  w.v41MealActions=w.v41MealActions||{};
  w.v41MealActions[key]={status:'eaten',at:new Date().toISOString(),sourceIndex};
  ctx.persist();ctx.render(true);ctx.toast('Restes mangés · stock déjà déduit à la préparation.');
  return true;
 }
 if(mode==='v41-eat-frozen'){
  const meal=w.meals[index],key=index+':frozen';
  if(meal?.type!=='frozen'||w.v41MealActions?.[key])return true;
  if(!confirm('Confirmer que '+meal.portions+' portion'+(meal.portions>1?'s':'')+' congelée'+(meal.portions>1?'s':'')+' ont été mangées ?'))return true;
  commit(ctx,tx('Portions congelées mangées',[{type:'freezer',direction:'consume',
   lotId:meal.lotId,recipeId:meal.recipeId,portions:meal.portions}]),()=>{
    w.v41MealActions=w.v41MealActions||{};w.v41MealActions[key]={status:'eaten',at:new Date().toISOString(),
     movements:[{type:'freezer',direction:'consume',lotId:meal.lotId,recipeId:meal.recipeId,portions:meal.portions}]};
    meal.consumed=true;
  });return true
 }
 // Annulation d'une validation accidentelle : jamais un simple retrait du verrou.
 // Le mouvement inverse de stock est atomique, enregistré et conservé dans Firebase.
 // Les validations V41 antérieures à ce correctif n'avaient pas conservé leurs
 // mouvements détaillés : elles sont reconstituées d'après la recette actuelle,
 // avec un avertissement explicite au moment de confirmer.
 if(mode==='v41-undo-validation'){
  if(!Number.isInteger(index)||index<0||index>13)return true;
  const kind=a.dataset.kind;
  const sourceIndex=Number(a.dataset.source);
  const key=kind==='frozen'?index+':frozen':
   kind==='leftovers'?index+':leftovers:'+sourceIndex+':'+id:index+':'+id;
  const action=w.v41MealActions?.[key];
  if(!action){ctx.toast('Aucune validation à annuler pour ce repas.');return true}
  if(kind==='leftovers'){
   const leftover=ctx.mealLeftovers(w.meals[index]).some(x=>x.recipeId===id&&x.fromIndex===sourceIndex);
   if(!leftover){ctx.toast('Ces restes ne sont plus présents dans le planning.');return true}
   if(!confirm('Annuler la validation « Restes mangés » ? Aucun ingrédient ne sera modifié.'))return true;
   delete w.v41MealActions[key];
   ctx.persist();ctx.closeModal();ctx.render(true);
   ctx.toast('Validation des restes annulée.');return true
  }
  if(kind==='frozen'){
   const meal=w.meals[index];
   if(meal?.type!=='frozen'||!meal.consumed){
    ctx.toast('Repas congelé introuvable ou état incohérent.');return true
   }
   const lot=stock.freezer?.[meal.lotId];
   if(!lot||lot.recipeId!==meal.recipeId){ctx.toast('Lot congelé introuvable.');return true}
   if(!confirm('Annuler « C’est mangé » pour les '+meal.portions+
    ' portions du congélateur ? Les portions seront remises dans le lot et le repas pourra être modifié.'))return true;
   const original=action.movements?.find(x=>x.type==='freezer'&&x.direction==='consume');
   if(original&&(original.lotId!==meal.lotId||original.portions!==meal.portions)){
    ctx.toast('Le lot ou les portions ont changé. Annulation automatique impossible.');return true
   }
   commit(ctx,tx('Annulation du repas congelé',[{type:'freezer',direction:'add',
    lotId:meal.lotId,recipeId:meal.recipeId,name:lot.name,portions:meal.portions}]),()=>{
    delete w.v41MealActions[key];delete meal.consumed;
   });
   return true
  }
  if(kind!=='recipe'){ctx.toast('Type de validation inconnu.');return true}
  const dish=ctx.mealDishes(w.meals[index]).find(x=>x.recipeId===id);
  if(!dish||!['eaten','frozen'].includes(action.status)){
   ctx.toast('Plat validé introuvable dans ce repas.');return true
  }
  if(w.meals.some((meal,i)=>ctx.mealLeftovers(meal).some(x=>
   x.fromIndex===index&&x.recipeId===id&&w.v41MealActions?.[i+':leftovers:'+index+':'+id]))){
   ctx.toast('Annule d’abord la validation des restes déjà mangés avant celle du plat.');return true
  }
  const legacy=!Array.isArray(action.movements);
  let original;
  try{
   original=legacy?kitchenMovementsV41(ctx.recipeById(id),Number(dish.people),
    state.ingredientCatalog,state.products):JSON.parse(JSON.stringify(action.movements));
  }catch(err){ctx.toast('Impossible de reconstituer les ingrédients : '+(err.message||err));return true}
  if(!original.length || original.some(x=>
   !((x.type==='inventory'&&x.direction==='consume')||
   (x.type==='freezer'&&x.direction==='add'&&action.status==='frozen')))){
   ctx.toast('Mouvements d’origine non reconnus. Aucun stock modifié.');return true
  }
  const inverse=original.map(x=>({...x,direction:x.direction==='add'?'consume':'add'}));
  if(action.status==='frozen'){
   const lotId=action.lotId;
   const lot=stock.freezer?.[lotId];
   const expected=Number(action.frozenPortions);
   const record=original.find(x=>x.type==='freezer'&&x.direction==='add');
   if(!lot||!Number.isInteger(expected)||expected<1||lot.recipeId!==id||
      lot.portions!==expected||(ctx.freezerReservationsV41(state.weeks)[lotId]||0)>0||
      (record&&(record.lotId!==lotId||record.portions!==expected))){
    ctx.toast('Des portions de ce lot ont été utilisées, modifiées ou réservées. Annulation automatique refusée.');return true
   }
   if(legacy) inverse.push({type:'freezer',direction:'consume',lotId,
    recipeId:id,portions:expected,name:lot.name});
  }
  const details=original.filter(x=>x.type==='inventory')
   .map(x=>Number(x.amount).toLocaleString('fr-FR',{maximumFractionDigits:3})+' '+x.unit+
    ' de '+(x.name||x.identity)).join(' ; ');
  const legacyNotice=legacy?'\n\nAttention : cette validation est antérieure au correctif. Les quantités ont été recalculées à partir de la recette ACTUELLE. Vérifie-les avant de confirmer.':'';
  if(!confirm('Annuler la validation du plat « '+(ctx.recipeById(id)?.name||'recette')+
   ' » ? Les ingrédients seront remis au Stock maison : '+details+
   (action.status==='frozen'?' ; les portions congelées de ce lot seront également annulées.':'')+
   legacyNotice+'\n\nAprès cela, tu pourras modifier ou supprimer le repas.'))return true;
  commit(ctx,tx('Annulation de validation · '+(ctx.recipeById(id)?.name||id),inverse),()=>{
   delete w.v41MealActions[key];
   if(Array.isArray(w.generatedIngredients))ctx.generateWeekCourses(w);
  });
  return true
 }
 // Réparation contrôlée des anciennes validations dont le plat d'origine
 // n'est plus présent dans cette case. Ne JAMAIS inventer un remboursement
 // d'ingrédients : le stock doit être corrigé séparément si nécessaire.
 if(mode==='v41-review-old-validation'){
  const old=orphanValidationKeys(ctx,w,index);
  if(!old.length){ctx.toast('Aucune ancienne validation bloquante sur ce repas.');return true}
  const unsafe=old.some(key=>w.v41MealActions[key]?.status==='frozen'||
    w.v41MealActions[key]?.movements?.some(m=>m.type==='freezer'));
  ctx.showModal('Débloquer un ancien repas',
   '<p class="helper">Cette case contient '+old.length+' validation'+(old.length>1?'s':'')+
   ' d’un ancien plat qui n’apparaît plus ici. Elles empêchent de modifier ou supprimer le repas.</p>'+
   '<p class="note">Pour éviter de doubler le stock, Speedrive ne rétablit PAS automatiquement les ingrédients associés à un plat qui n’est plus identifiable. Vérifie tes quantités dans Stock → Maison.</p>'+
   (unsafe?'<p class="note">Une ancienne congélation est également concernée : corrige d’abord manuellement ce lot avant de débloquer la case. Réinitialisation automatique indisponible.</p>':
   '<button class="btn wide" data-action="v41-confirm-reset-old-validation" data-index="'+index+'">↩ Retirer les anciens verrous (sans changer le stock)</button>'));
  return true
 }
 if(mode==='v41-confirm-reset-old-validation'){
  const old=orphanValidationKeys(ctx,w,index);
  if(!old.length){ctx.toast('Aucune validation orpheline à retirer.');return true}
  if(old.some(key=>w.v41MealActions[key]?.status==='frozen'||
    w.v41MealActions[key]?.movements?.some(m=>m.type==='freezer'))){
   ctx.toast('Congélateur impliqué : annulation automatique refusée.');return true
  }
  if(!confirm('Retirer '+old.length+' ancien(s) verrou(s) de ce repas ? Cela permettra de le supprimer ou le modifier. ATTENTION : le Stock maison ne sera pas modifié ; corrige manuellement les quantités si elles ont été déduites lors du test.'))return true;
  for(const key of old)delete w.v41MealActions[key];
  ctx.persist();ctx.closeModal();ctx.render(true);
  ctx.toast('Anciennes validations retirées. Vérifie les quantités du Stock maison.');
  return true
 }
 if(mode==='v41-courses-done'){
  const selected=ctx.shopping().filter(x=>x.checked&&!x.excluded&&!x.covered);
  const result=purchasedMovementsV41(selected,state.ingredientCatalog,state.products);
  if(!result.movements.length){ctx.toast(result.warnings.length?'Relie ces achats à une fiche Produit avant de les enregistrer.':'Aucun nouvel achat coché à valider.');return true}
  if(!confirm('Ajouter '+result.movements.length+' achat(s) réellement effectués au Stock maison ?'))return true;
  commit(ctx,tx('Courses faites · '+ctx.currentWeek,result.movements),()=>{
   w.v41ValidatedRows=w.v41ValidatedRows||{};
   const registered=selected.filter(x=>x.productId||x.ingredientId);
   const registeredIds=new Set(registered.map(x=>x.id));
   const manualIds=new Set(registered.flatMap(x=>x.manualExtraIds||[]));
   registered.forEach(x=>{w.v41ValidatedRows[x.id]={
    qty:x.qty,unit:x.unit,at:new Date().toISOString()
   }});
   // La coche « Acheté » devient un achat enregistré, non une commande en attente.
   // Permettre un nouvel achat du même article lorsque le stock baisse.
   w.checked=w.checked.filter(id=>!registeredIds.has(id));
   w.extras=w.extras.filter(extra=>!manualIds.has(extra.id));
  });
  if(result.warnings.length)ctx.toast('Achats connus enregistrés. '+result.warnings.length+' article(s) sans fiche à vérifier.');
  return true
 }
 if(mode==='v41-preview-migration'){
  const selectedWeek=a.dataset.week||legacyPantryWeeks(state)[0]||ctx.currentWeek;
  const candidate=state.weeks?.[selectedWeek];
  if(!candidate){ctx.toast('Semaine introuvable.');return true}
  const preview=previewLegacyPantryV41(candidate,state.ingredientCatalog,state.products);
  if(!preview.entries.length){ctx.toast('Aucun ancien stock de cette semaine à reprendre.');return true}
  const body='<p class="helper">Stock de la semaine du '+esc(selectedWeek)+
   '. Une seule semaine est examinée. Aucun stock n’est transféré sans confirmation.</p>'+
   preview.entries.map(x=>'<div class="shopping-row"><div class="grow"><strong>'+esc(x.name)+'</strong><div class="helper">'+esc(x.identity)+'</div></div><b>'+qty(x.amount)+' '+esc(x.unit)+'</b></div>').join('')+
   (preview.warnings.length?'<div class="note">'+preview.warnings.map(esc).join(' · ')+'</div>':'')+
   (preview.requiresReview?'<p class="helper">Certaines lignes sont ambiguës : saisis ton stock manuellement pour éviter un double comptage.</p>':
    '<button class="btn wide" data-action="v41-confirm-migration" data-week="'+esc(selectedWeek)+'">Reprendre ce stock comme inventaire initial</button>');
  ctx.showModal('Reprise de mon ancien stock',body);return true
 }
 if(mode==='v41-confirm-migration'){
  const selectedWeek=a.dataset.week||legacyPantryWeeks(state)[0]||ctx.currentWeek;
  const candidate=state.weeks?.[selectedWeek];
  if(!candidate){ctx.toast('Semaine introuvable.');return true}
  const preview=previewLegacyPantryV41(candidate,state.ingredientCatalog,state.products);
  if(preview.requiresReview||!preview.entries.length||state.stockV41){ctx.toast('Reprise indisponible : examine les quantités manuellement.');return true}
  commit(ctx,tx('Reprise du stock initial · '+selectedWeek,preview.entries.map(x=>({
   type:'inventory',direction:'add',identity:x.identity,name:x.name,category:x.category,
   store:x.store,amount:x.amount,unit:x.unit
  }))),()=>{state.stockV41MigratedFrom=selectedWeek});return true
 }
 if(mode==='v41-replace-meal'){replaceModal(ctx,index);return true}
 if(['v41-replace-recipe','v41-replace-frozen','v41-replace-ordered'].includes(mode)){
  if(!Number.isInteger(index)||index<0||index>13||Object.keys(w.v41MealActions||{}).some(k=>k.startsWith(index+':'))){ctx.toast('Ce repas est déjà terminé.');return true}
  try{
   if(mode==='v41-replace-ordered'){
    ctx.clearMealWithPair(w,index);w.meals[index]={type:'ordered'};
   }else if(mode==='v41-replace-recipe'){
    const r=ctx.recipeById(id),portions=amount('v41RecipePortions');
    if(!r)throw Error('Recette introuvable.');
    if(!Number.isInteger(portions)||portions<1||portions>30)throw Error('Choisis entre 1 et 30 portions.');
    // Supprimer l'ancien repas et tous ses restes liés avant de placer le nouveau.
    ctx.clearMealWithPair(w,index);
    ctx.selectRecipeForMeal(w,index,id,portions);
   }else{
    const n=amount('v41FrozenMealPortions');
    state.weeks=planFrozenMealV41(state.weeks,stock,ctx.currentWeek,index,id,n);
    ctx.reconcileLeftovers(state.weeks[ctx.currentWeek],index);
   }
   if(Array.isArray(ctx.getWeek().generatedIngredients))ctx.generateWeekCourses(ctx.getWeek());
   ctx.persist();ctx.closeModal();ctx.renderMealContext(index);ctx.toast('Repas remplacé et courses actualisées !');
  }catch(e){ctx.toast(e.message||'Impossible de remplacer ce repas.')}return true
 }
 return false;
}
