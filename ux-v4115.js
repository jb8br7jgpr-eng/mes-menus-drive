'use strict';
// Speedrive V41.15 — confort visuel uniquement. Aucune écriture métier ni Firebase.
// Cet état est volatile : il n'est jamais inclus dans les sauvegardes de données.
const uxViewsV4115=new Map();
let uxRenderedTabV4115=null,uxRenderedStockViewV4115='home';
let uxModalPositionV4115=null;

function uxViewKeyV4115(tab,stockView){
 return tab==='stock'?'stock:'+(stockView||'home'):tab
}
function uxCaptureViewV4115(){
 if(!uxRenderedTabV4115||!app?.firstElementChild)return;
 const key=uxViewKeyV4115(uxRenderedTabV4115,uxRenderedStockViewV4115);
 const previous=uxViewsV4115.get(key)||{};
 const snap={...previous};
 if(uxRenderedTabV4115==='produits')
  snap.rayons=captureCatalogueRayonUiV4115('produits');
 if(uxRenderedTabV4115==='stock'){
  const search=app.querySelector('#v41StockSearch');
  if(search)snap.search=search.value;
 }
 if(uxRenderedTabV4115==='courses'||uxRenderedTabV4115==='drive'){
  snap.openDetails=[...app.querySelectorAll('details')].map((detail,index)=>({
   key:uxDetailKeyV4115(detail,index),open:detail.open
  }))
 }
 uxViewsV4115.set(key,snap)
}
function uxDetailKeyV4115(detail,index){
 return detail.dataset.section?'section:'+detail.dataset.section:
   detail.dataset.uxKey?'key:'+detail.dataset.uxKey:
   'position:'+index
}
function uxRestoreViewV4115(tab,stockView){
 const snap=uxViewsV4115.get(uxViewKeyV4115(tab,stockView));
 if(snap){
  if(tab==='produits'&&snap.rayons)
   restoreCatalogueRayonUiV4115('produits',snap.rayons);
  if(tab==='courses'||tab==='drive'){
   const byKey=new Map((snap.openDetails||[]).map(x=>[x.key,x.open]));
   app.querySelectorAll('details').forEach((detail,index)=>{
    const key=uxDetailKeyV4115(detail,index);
    if(byKey.has(key))detail.open=byKey.get(key)
   })
  }
  if(tab==='stock'&&typeof snap.search==='string'){
   const input=app.querySelector('#v41StockSearch');
   if(input&&snap.search){
    input.value=snap.search;
    input.dispatchEvent(new Event('input',{bubbles:true}))
   }
  }
 }
 uxRenderedTabV4115=tab;
 uxRenderedStockViewV4115=stockView
}
// Appelé autour des reconstructions : on capture les panneaux AVANT de détruire le DOM
// et on les restaure uniquement pour l'onglet et la sous-vue concernés.
function uxCaptureBeforeRenderV4115(){uxCaptureViewV4115()}
function uxRestoreAfterRenderV4115(tab,stockView){uxRestoreViewV4115(tab,stockView)}
function uxVisibleAnchorV4115(){
 const nodes=app?.querySelectorAll('[data-meal-day], .recipe-card, .catalogue-unified-card, .shopping-row, [data-v41-stock-row]')||[];
 for(const el of nodes){
  const rect=el.getBoundingClientRect();
  if(rect.bottom<=76||rect.top>=window.innerHeight-35)continue;
  let kind='',id='';
  if(el.hasAttribute('data-meal-day')){kind='meal';id=el.dataset.mealDay}
  else if(el.matches('.recipe-card')){kind='recipe';id=el.querySelector('[data-action="view-recipe"]')?.dataset.id}
  else if(el.matches('.catalogue-unified-card')){kind='product';id=el.querySelector('[data-action="edit-unified-product"]')?.dataset.id}
  else if(el.matches('.shopping-row')){kind='shopping';id=el.querySelector('[data-check]')?.dataset.check}
  else if(el.matches('[data-v41-stock-row]')){kind='stock';id=el.querySelector('[data-identity]')?.dataset.identity}
  if(kind&&id!==undefined&&id!==null&&id!=='')return {kind,id,top:rect.top}
 }
 return null
}
function uxLocateAnchorV4115(anchor){
 if(!anchor)return null;
 const selectors={
  meal:'[data-meal-day]',recipe:'.recipe-card',product:'.catalogue-unified-card',
  shopping:'.shopping-row',stock:'[data-v41-stock-row]'
 };
 return [...(app?.querySelectorAll(selectors[anchor.kind]||'.ux-never')||[])].find(el=>{
  if(anchor.kind==='meal')return el.dataset.mealDay===anchor.id;
  if(anchor.kind==='recipe')return el.querySelector('[data-action="view-recipe"]')?.dataset.id===anchor.id;
  if(anchor.kind==='product')return el.querySelector('[data-action="edit-unified-product"]')?.dataset.id===anchor.id;
  if(anchor.kind==='shopping')return el.querySelector('[data-check]')?.dataset.check===anchor.id;
  return el.querySelector('[data-identity]')?.dataset.identity===anchor.id
 })||null
}
function uxRestoreAnchorV4115(anchor,originalY){
 const el=uxLocateAnchorV4115(anchor);
 if(el){
  const delta=el.getBoundingClientRect().top-anchor.top;
  if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'auto'})
 }else if(Number.isFinite(originalY))window.scrollTo({top:originalY,behavior:'auto'})
}
// Coche d'achat : ne remplacer que les fragments concernés de l'onglet Courses.
// Les quantités, le stock et les règles de calcul sont toujours gérés par app.js.
function uxRefreshCourseCheckV4115(clickedInput){
 if(currentTab!=='courses'||!clickedInput?.closest('.shopping-row')||!app?.querySelector('.course-v33-progress'))return false;
 const origin=clickedInput.closest('.shopping-row');
 const adjacent=[origin.nextElementSibling,origin.previousElementSibling].find(el=>el?.matches?.('.shopping-row'));
 const adjacentInput=adjacent?.querySelector('[data-check]');
 const anchor=adjacentInput?{id:adjacentInput.dataset.check,top:adjacent.getBoundingClientRect().top}:null;
 const scrollBefore=window.scrollY;
 const wrapper=document.createElement('div');wrapper.innerHTML=renderCourses();
 const replace=(selector)=>{
  const current=app.querySelector(selector),next=wrapper.querySelector(selector);
  if(current&&next){current.replaceWith(next);return true}
  return false
 };
 if(!wrapper.querySelector('.course-v33-progress'))return false;
 replace('.course-v33-progress');
 replace('[data-action="v41-courses-done"]');
 replace('.course-summary');
 for(const store of ['carrefour','grandfrais'])replace('[data-action="clear-store-courses"][data-store="'+store+'"]');
 for(const cls of ['drive','fresh'])replace('.course-store.'+cls);
 const before=app.querySelector('details[data-section="checked"]');
 const after=wrapper.querySelector('details[data-section="checked"]');
 if(before&&after){after.open=before.open;before.replaceWith(after)}
 else if(before&&!after)before.remove();
 else if(!before&&after){
  const target=app.querySelector('details[data-section="home"], .course-clear-all');
  if(target)target.before(after);
 }
 // Conserver l'élément adjacent à la même hauteur, même si la ligne
 // que l'on vient de cocher a migré vers « Articles achetés ».
 if(anchor){
  const next=[...app.querySelectorAll('[data-check]')].find(el=>el.dataset.check===anchor.id)?.closest('.shopping-row');
  if(next)window.scrollBy({top:next.getBoundingClientRect().top-anchor.top,behavior:'auto'});
  else window.scrollTo({top:scrollBefore,behavior:'auto'})
 }else window.scrollTo({top:scrollBefore,behavior:'auto'});
 return true
}
