'use strict';
// V41.14 — filtrage visuel des rayons/catégories.
// Aucun changement au modèle de données, aux recettes ou aux références Carrefour.
const catalogueCategorySelectedV4114={produits:new Set(),courses:new Set()};
function categorySelectionV4114(context){return catalogueCategorySelectedV4114[context==='courses'?'courses':'produits']}
function categoryMatchesV4114(category,selected){return !selected.size||selected.has(String(category||'Autres'))}
function catalogueRayonGroupsV4114(categories){
 const remaining=new Set(categories),groups=productCategoryGroups.map(([name,values])=>{
  const chosen=values.filter(c=>remaining.has(c));chosen.forEach(c=>remaining.delete(c));
  return {name,categories:chosen}
 }).filter(g=>g.categories.length);
 if(remaining.size)groups.push({name:'Anciennes catégories et catégories personnalisées',
  categories:[...remaining].sort((a,b)=>a.localeCompare(b,'fr'))});
 return groups
}
function catalogueRayonMarkupV4114(context,categories,items=[]){
 const groups=catalogueRayonGroupsV4114(categories),selected=categorySelectionV4114(context);
 const seen=new Set(),countByCategory=new Map();
 for(const x of items){
  const key=String(x.type||x.kind||'produit')+':'+String(x.id||'');
  if(seen.has(key))continue;seen.add(key);
  const c=String(x.category||'Autres');countByCategory.set(c,(countByCategory.get(c)||0)+1)
 }
 const rows=groups.map(g=>{
  const count=g.categories.reduce((n,c)=>n+(countByCategory.get(c)||0),0);
  const children=g.categories.map(c=>
   '<label class="v4114-child" data-v4114-child-row data-category="'+html(c)+'">'+
    '<input type="checkbox" data-v4114-child data-category="'+html(c)+'" '+(selected.has(c)?'checked':'')+'>'+
    '<span>'+html(c)+'</span><small>'+String(countByCategory.get(c)||0)+'</small></label>').join('');
  return '<section class="v4114-group" data-v4114-group data-name="'+html(g.name)+'">'+
   '<div class="v4114-group-head"><label class="v4114-parent">'+
    '<input type="checkbox" data-v4114-rayon data-name="'+html(g.name)+'" aria-label="Sélectionner le rayon '+html(g.name)+'">'+
    '<span class="v4114-group-name">'+html(g.name)+'</span><span class="v4114-count">'+count+'</span></label>'+
   '<button type="button" class="v4114-expand" data-v4114-expand aria-expanded="false" aria-label="Afficher les catégories de '+html(g.name)+'">⌄</button></div>'+
   '<div class="v4114-children" data-v4114-children hidden>'+children+'</div></section>'
 }).join('');
 return '<div class="v4114-filter" data-v4114-selector="'+context+'">'+
  '<span class="v4114-label">Rayons et catégories</span>'+
  '<button type="button" class="v4114-open" data-v4114-open aria-expanded="false">'+
   '<span>☷ <span data-v4114-button-label>Toutes les catégories</span></span><span aria-hidden="true">⌄</span></button>'+
  '<div class="v4114-summary" aria-live="polite"><span data-v4114-summary>Tous les produits</span>'+
   '<button type="button" data-v4114-reset class="v4114-reset">Tout réinitialiser</button></div>'+
  '<div class="v4114-active-chips" data-v4114-chips></div>'+
  '<div class="v4114-panel" data-v4114-panel hidden>'+
   '<div class="field"><label for="v4114-search-'+context+'">Rechercher un rayon ou une catégorie</label>'+
    '<input type="search" id="v4114-search-'+context+'" data-v4114-search placeholder="Ex. épicerie, sauces, boissons…" autocomplete="off"></div>'+
   '<div class="v4114-groups">'+rows+'</div>'+
   '<div class="v4114-no-result" data-v4114-empty hidden>Aucun rayon ni catégorie trouvé.</div>'+
  '</div></div>'
}
function syncCatalogueRayonsV4114(context){
 const root=(context==='courses'?modalRoot:app).querySelector('[data-v4114-selector="'+context+'"]');
 if(!root)return;
 const selected=categorySelectionV4114(context),tokens=[];let full=0;
 for(const group of root.querySelectorAll('[data-v4114-group]')){
  const cats=[...group.querySelectorAll('[data-v4114-child]')],active=cats.filter(c=>selected.has(c.dataset.category)).length;
  const parent=group.querySelector('[data-v4114-rayon]');
  parent.checked=!!cats.length&&active===cats.length;
  parent.indeterminate=active>0&&active<cats.length;
  parent.setAttribute('aria-checked',parent.indeterminate?'mixed':String(parent.checked));
  cats.forEach(c=>c.checked=selected.has(c.dataset.category));
  if(active===cats.length&&cats.length){full++;tokens.push({kind:'rayon',name:group.dataset.name})}
  else cats.filter(c=>selected.has(c.dataset.category)).forEach(c=>tokens.push({kind:'category',name:c.dataset.category}))
 }
 const count=selected.size;
 const summary=root.querySelector('[data-v4114-summary]'),btn=root.querySelector('[data-v4114-button-label]');
 if(summary)summary.textContent=count?full+' rayon'+(full>1?'s':'')+' complet'+(full>1?'s':'')+' · '+count+' catégorie'+(count>1?'s':''):'Tous les produits';
 if(btn)btn.textContent=count?count+' catégorie'+(count>1?'s':'')+' sélectionnée'+(count>1?'s':''):'Toutes les catégories';
 const chips=root.querySelector('[data-v4114-chips]');
 if(chips)chips.innerHTML=tokens.map(t=>'<button type="button" class="v4114-chip" data-v4114-remove-token data-kind="'+t.kind+'" data-name="'+html(t.name)+'" aria-label="Retirer '+html(t.name)+'">'+html(t.name)+' <span aria-hidden="true">×</span></button>').join('');
 const reset=root.querySelector('[data-v4114-reset]');if(reset)reset.disabled=!count
}
function applyCatalogueRayonsV4114(context){
 syncCatalogueRayonsV4114(context);
 if(context==='courses')filterBulkV37();else refreshCatalogueV40()
}
function catalogueRayonSearchV4114(input){
 const root=input.closest('[data-v4114-selector]');if(!root)return;
 const q=norm(input.value||'');let visible=0;
 root.querySelectorAll('[data-v4114-group]').forEach(group=>{
  const matchRayon=norm(group.dataset.name).includes(q);
  const children=[...group.querySelectorAll('[data-v4114-child-row]')];let matches=0;
  children.forEach(row=>{const match=matchRayon||norm(row.dataset.category).includes(q);row.hidden=!!q&&!match;if(match)matches++});
  group.hidden=!!q&&!matches;if(!group.hidden)visible++;
  const body=group.querySelector('[data-v4114-children]'),btn=group.querySelector('[data-v4114-expand]');
  if(q){
   if(!Object.prototype.hasOwnProperty.call(group.dataset,'beforeSearchOpen'))group.dataset.beforeSearchOpen=String(!body.hidden);
   body.hidden=false;btn.setAttribute('aria-expanded','true')
  }else if(Object.prototype.hasOwnProperty.call(group.dataset,'beforeSearchOpen')){
   body.hidden=group.dataset.beforeSearchOpen!=='true';btn.setAttribute('aria-expanded',String(!body.hidden));
   delete group.dataset.beforeSearchOpen
  }
 });
 const empty=root.querySelector('[data-v4114-empty]');if(empty)empty.hidden=!!visible
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-v4114-open],[data-v4114-expand],[data-v4114-reset],[data-v4114-remove-token]');
 if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 const selector=button.closest('[data-v4114-selector]'),context=selector?.dataset.v4114Selector;
 if(!context)return;
 if(button.hasAttribute('data-v4114-open')){
  const panel=selector.querySelector('[data-v4114-panel]');
  panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));return
 }
 if(button.hasAttribute('data-v4114-expand')){
  const body=button.closest('[data-v4114-group]').querySelector('[data-v4114-children]');
  body.hidden=!body.hidden;button.setAttribute('aria-expanded',String(!body.hidden));return
 }
 const selected=categorySelectionV4114(context);
 if(button.hasAttribute('data-v4114-reset'))selected.clear();
 else if(button.dataset.kind==='category')selected.delete(button.dataset.name);
 else selector.querySelectorAll('[data-v4114-group]').forEach(group=>{
  if(group.dataset.name===button.dataset.name)group.querySelectorAll('[data-v4114-child]').forEach(c=>selected.delete(c.dataset.category))
 });
 applyCatalogueRayonsV4114(context)
});
document.addEventListener('change',event=>{
 const input=event.target;
 if(!input.matches('[data-v4114-rayon],[data-v4114-child]'))return;
 event.stopImmediatePropagation();
 const selector=input.closest('[data-v4114-selector]'),context=selector?.dataset.v4114Selector;
 if(!context)return;
 const selected=categorySelectionV4114(context);
 if(input.matches('[data-v4114-child]')){
  if(input.checked)selected.add(input.dataset.category);else selected.delete(input.dataset.category)
 }else{
  const categories=[...input.closest('[data-v4114-group]').querySelectorAll('[data-v4114-child]')].map(c=>c.dataset.category);
  const full=categories.length>0&&categories.every(c=>selected.has(c));
  categories.forEach(c=>full?selected.delete(c):selected.add(c))
 }
 applyCatalogueRayonsV4114(context)
});
document.addEventListener('input',event=>{
 if(!event.target.matches('[data-v4114-search]'))return;
 event.stopImmediatePropagation();catalogueRayonSearchV4114(event.target)
});
