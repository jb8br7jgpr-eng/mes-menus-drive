// Speedrive V41 — rendu seul du sixième onglet. Aucune écriture Firebase ici.
import {freezerReservationsV41} from './stock-week-v41.mjs';
const escape = x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q = n=>Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:3});
const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const row=(name,description,content='')=>'<div class="v41-stock-row" data-v41-stock-row><div class="grow"><strong>'+escape(name)+'</strong><small>'+escape(description)+'</small></div>'+content+'</div>';
export function renderStockV41({state,week,weekId,view='home',recipeById,mealDishes,mealLeftovers}) {
 const stock=state.stockV41||{items:{},freezer:{}};
 const items=Object.values(stock.items||{}).filter(x=>Number(x.quantity)>0).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 const frozen=Object.values(stock.freezer||{}).filter(x=>Number(x.portions)>0).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 const reserved=freezerReservationsV41(state.weeks||{});
 const freePortions=lot=>Math.max(0,Number(lot.portions||0)-Number(reserved[lot.lotId]||0));
 const search='<div class="v41-stock-search"><label for="v41StockSearch">Rechercher dans mon stock</label>'+
   '<input id="v41StockSearch" type="search" autocomplete="off" placeholder="Ex. œufs, pâtes, chili…" aria-controls="v41StockResults">'+
   '<small id="v41StockSearchCount" role="status" aria-live="polite"></small></div>';
 const active=name=>view===name?' is-selected':'';
 let out='<div class="v41-stock-head"><div class="eyebrow">Inventaire permanent</div><h1>Stock maison</h1><p class="muted">Tes produits et tes plats congelés, reliés aux menus et aux courses.</p></div>'+
 '<div class="v41-stock-segments" role="group" aria-label="Sections du stock">'+
 '<button class="v41-stock-segment'+active('home')+'" data-action="v41-stock-section" data-view="home">🏠 Maison</button>'+
 '<button class="v41-stock-segment'+active('freezer')+'" data-action="v41-stock-section" data-view="freezer">❄️ Congélateur</button>'+
 '<button class="v41-stock-segment'+active('week')+'" data-action="v41-stock-section" data-view="week">🍽️ Cette semaine</button></div>';
 if(view==='home'){
  out+='<div class="v41-stock-stat"><strong>'+items.length+'</strong><span>référence'+(items.length>1?'s':'')+' en stock</span></div>'+
   '<button class="btn wide" data-action="v41-add-stock">＋ Ajouter un produit au stock</button>'+
   (!state.stockV41?'<p class="note">Ton nouvel inventaire est vide. Tu peux le remplir manuellement ou examiner la reprise du stock indiqué dans les anciennes courses.</p><button class="btn secondary wide" data-action="v41-preview-migration">Examiner mon ancien stock</button>':'');
  if(!items.length) out+='<div class="v41-empty">🏠 Aucun produit enregistré. Les achats validés pourront remplir ce stock.</div>';
  else out+=search+'<div class="v41-stock-list" id="v41StockResults">'+items.map(x=>row(x.name,(x.category||'Autres')+' · '+(x.store==='grandfrais'?'Grand Frais':'Carrefour / maison'),
   '<div class="v41-stock-qty">'+q(x.quantity)+' '+escape(x.unit)+'</div><button class="btn tiny secondary" data-action="v41-adjust-stock" data-identity="'+escape(x.identity)+'" data-unit="'+escape(x.unit)+'">Corriger</button>')).join('')+'</div>'
 }else if(view==='freezer'){
  out+='<div class="v41-stock-stat"><strong>'+frozen.reduce((n,x)=>n+x.portions,0)+'</strong><span>portions au congélateur · '+frozen.reduce((n,x)=>n+freePortions(x),0)+' encore libres</span></div>'+
   '<button class="btn wide" data-action="v41-add-frozen">＋ Ajouter un plat déjà congelé</button>';
  if(!frozen.length)out+='<div class="v41-empty">❄️ Aucun plat congelé. Tu pourras congeler un plat depuis le planning.</div>';
  else out+=search+'<div class="v41-stock-list" id="v41StockResults">'+frozen.map(x=>row('❄️ '+x.name,
    'Lot de '+(x.preparedAt?new Date(x.preparedAt).toLocaleDateString('fr-FR'):'date non précisée')+
    ' · '+freePortions(x)+' libre'+(freePortions(x)>1?'s':'')+
    (reserved[x.lotId]?' · '+reserved[x.lotId]+' prévue'+(reserved[x.lotId]>1?'s':'')+' dans les menus':''),
    '<div class="v41-stock-qty">'+x.portions+' portion'+(x.portions>1?'s':'')+'</div><button class="btn tiny secondary" data-action="v41-correct-freezer" data-id="'+escape(x.lotId)+'">Corriger</button>')).join('')+'</div>';
 }else{
  const w=week||{meals:[]},actions=w.v41MealActions||{},entries=[];
  (w.meals||[]).forEach((meal,i)=>{
   if(meal?.type==='frozen'){
    const lot=stock.freezer?.[meal.lotId];
    const completed=Boolean(actions[i+':frozen']);
    entries.push(row('❄️ '+(recipeById(meal.recipeId)?.name||lot?.name||'Plat congelé'),
     days[Math.floor(i/2)]+' '+(i%2?'soir':'midi')+' · '+meal.portions+' portion'+(meal.portions>1?'s':'')+' · congélateur',
     completed?'<div class="v41-stock-actions"><span class="v41-stock-done">✓ Mangé</span>'+
      '<button class="btn tiny secondary" data-action="v41-undo-validation" data-kind="frozen" data-index="'+i+'">Annuler la validation</button></div>':
      '<button class="btn tiny" data-action="v41-eat-frozen" data-index="'+i+'">C’est mangé</button>'));
   }
   for(const dish of mealDishes(meal)){
    const recipe=recipeById(dish.recipeId),status=actions[i+':'+dish.recipeId];
    entries.push(row(recipe?.name||'Plat supprimé',days[Math.floor(i/2)]+' '+(i%2?'soir':'midi')+' · '+dish.people+' portion'+(dish.people>1?'s':''),
      status?'<div class="v41-stock-actions"><span class="v41-stock-done">✓ '+(status.status==='frozen'?'Congelé':'Mangé')+'</span>'+
      '<button class="btn tiny secondary" data-action="v41-undo-validation" data-kind="recipe" data-index="'+i+
      '" data-id="'+escape(dish.recipeId)+'">Annuler la validation</button></div>':
      '<div class="v41-stock-actions"><button class="btn tiny" data-action="v41-eat-recipe" data-index="'+i+'" data-id="'+escape(dish.recipeId)+'">C’est mangé</button>'+
      '<button class="btn tiny secondary" data-action="v41-freeze-recipe" data-index="'+i+'" data-id="'+escape(dish.recipeId)+'">❄️ Au congélateur</button></div>'));
   }
   for(const leftover of (typeof mealLeftovers==='function'?mealLeftovers(meal):[])){
    const source=recipeById(leftover.recipeId),prepared=actions[leftover.fromIndex+':'+leftover.recipeId];
    const leftoverKey=i+':leftovers:'+leftover.fromIndex+':'+leftover.recipeId;
    const completed=actions[leftoverKey];
    entries.push(row('🍱 Restes : '+(source?.name||'Plat préparé'),
      days[Math.floor(i/2)]+' '+(i%2?'soir':'midi')+' · '+leftover.people+' portion'+(leftover.people>1?'s':'')+
      ' · sans nouvelle déduction d’ingrédients',
      completed?'<div class="v41-stock-actions"><span class="v41-stock-done">✓ Mangé</span>'+
      '<button class="btn tiny secondary" data-action="v41-undo-validation" data-kind="leftovers" data-index="'+i+
      '" data-source="'+leftover.fromIndex+'" data-id="'+escape(leftover.recipeId)+'">Annuler la validation</button></div>':
      '<div class="v41-stock-actions"><span class="v41-stock-info">'+
      (prepared?.status==='eaten'?'Déjà cuisinés':'À préparer')+'</span>'+
      '<button class="btn tiny" data-action="v41-eat-leftovers" data-index="'+i+
      '" data-source="'+leftover.fromIndex+'" data-id="'+escape(leftover.recipeId)+'">C’est mangé</button></div>'));
   }
   if(meal?.type==='ordered')entries.push(row('🍕 Repas libre ou commandé',
    days[Math.floor(i/2)]+' '+(i%2?'soir':'midi')+' · aucun ingrédient à acheter',
    '<span class="v41-stock-info">Sans stock</span>'));
  });
  out+='<div class="v41-week-caption">📅 Semaine du '+escape(weekId)+
    ' · les ingrédients ne sortent du stock qu’à la préparation effective du plat.</div>';
  out+=entries.length?'<div class="v41-stock-list">'+entries.join('')+'</div>':
    '<div class="v41-empty">Aucun plat planifié cette semaine. Ajoute des plats dans Menus.</div>'
 }
 return out;
}
