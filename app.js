
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const categories=['Autres','Épicerie','Fruits et légumes','Viandes et poissons','Produits frais','Hygiène','Maison'];
const icons={'Pâtes':'🍝','Viande':'🥩','Poisson':'🐟','Légumes':'🥦','Salade':'🥗','Dessert':'🍰','Autre':'🍽️'};
const units=['g','kg','ml','cl','l','pièce','paquet','boîte','rouleau','bouteille','pot','sachet'];
const contentUnits=['g','kg','ml','cl','l','pièce','rouleau'];
const baseState=()=>({schema:1,recipes:[],products:[],weeks:{},staples:[],storePreferences:{},ingredientCatalog:[],settings:{people:2}});
let state=baseState(), currentTab='menus', currentWeek='', search='', productSearch='', productCategory='Toutes', ingredientStoreTab='carrefour', db=null, usingFallback=false;
let pendingRecipeDraftImage='',pendingIngredientLinkId=null;
let independentProductsOpen=false;const courseOpenSections=new Set();
const app=$('#app'), modalRoot=$('#modalRoot');
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
function localDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function monday(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()-((x.getDay()+6)%7));return localDate(x)}
function offsetDate(s,n){const d=parseDate(s);d.setDate(d.getDate()+n);return localDate(d)}
function niceDate(s){return parseDate(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
function getWeek(key=currentWeek){if(!state.weeks[key])state.weeks[key]={meals:Array(14).fill(null),extras:[],checked:[],excluded:[]};const w=state.weeks[key];if(!Array.isArray(w.meals))w.meals=Array(14).fill(null);if(!Array.isArray(w.extras))w.extras=[];if(!Array.isArray(w.checked))w.checked=[];if(!Array.isArray(w.excluded))w.excluded=[];if(!w.pantry||typeof w.pantry!=='object'||Array.isArray(w.pantry))w.pantry={};if(!w.pantryUnits||typeof w.pantryUnits!=='object'||Array.isArray(w.pantryUnits))w.pantryUnits={};return w}
// Données principales dans IndexedDB ; historique de points de restauration indépendants.
function openDatabase(){return new Promise((resolve,reject)=>{const r=indexedDB.open('menus-drive-v1',2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('records'))r.result.createObjectStore('records');if(!r.result.objectStoreNames.contains('snapshots'))r.result.createObjectStore('snapshots',{keyPath:'id',autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function readRecord(){return new Promise((resolve,reject)=>{const req=db.transaction('records','readonly').objectStore('records').get('state');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function writeRecord(value){return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(value,'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function readSnapshots(){if(!db||usingFallback)return Promise.resolve([]);return new Promise((resolve,reject)=>{const req=db.transaction('snapshots','readonly').objectStore('snapshots').getAll();req.onsuccess=()=>resolve((req.result||[]).reverse());req.onerror=()=>reject(req.error)})}
function writeSnapshot(snapshot,label='Sauvegarde automatique',force=false){
 if(!db||usingFallback)return Promise.resolve(false);
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');
  const cursor=store.openCursor(null,'prev');
  cursor.onsuccess=()=>{const latest=cursor.result?.value;
   // Une version locale au maximum toutes les 10 minutes, sauf restauration/suppression.
   if(!force&&latest&&Date.now()-latest.time<600000)return;
   store.add({time:Date.now(),label,data:snapshot});
   const keys=store.getAllKeys();
   keys.onsuccess=()=>{const excess=keys.result.length-10;for(let i=0;i<excess;i++)store.delete(keys.result[i])};
  };
  tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 })
}
let saveQueue=Promise.resolve(),saveError=false;
function persist(){
 const snapshot=JSON.parse(JSON.stringify(state));
 if(usingFallback){try{localStorage.setItem('menus-drive-backup',JSON.stringify(snapshot));saveError=false}catch(e){saveError=true;toast('Stockage saturé : exporte une sauvegarde JSON.')}return}
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  await writeRecord(snapshot);saveError=false;
  try{await writeSnapshot(snapshot)}catch(e){/* Les versions locales peuvent dépasser le quota : données principales conservées. */}
 }).catch(()=>{saveError=true;toast('Enregistrement impossible : exporte une sauvegarde JSON.')});
}
function checkpoint(label){
 const snapshot=JSON.parse(JSON.stringify(state));
 if(usingFallback)return Promise.resolve(false);
 // La file d'écriture protège l'ordre des opérations en cas de clics rapides.
 const job=saveQueue.catch(()=>{}).then(()=>writeSnapshot(snapshot,label,true));
 saveQueue=job.catch(()=>{});return job;
}
async function restoreSnapshot(id){
 try{
  const records=await readSnapshots(),selected=records.find(x=>x.id===Number(id));
  if(!selected||!selected.data||!Array.isArray(selected.data.recipes))throw Error('Sauvegarde introuvable.');
  if(!confirm('Remplacer tes données actuelles par cette sauvegarde locale ?'))return;
  await checkpoint('Avant restauration');
  state={...baseState(),...selected.data,products:Array.isArray(selected.data.products)?selected.data.products:[]};
  normalizeIngredientCatalog();persist();await saveQueue;closeModal();render();toast('Version précédente restaurée !')
 }catch(e){toast('Restauration impossible. Exporte ton JSON si nécessaire.')}
}
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
function render(preserveScroll=false){const scrollY=window.scrollY;document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.tab===currentTab;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});app.innerHTML=({menus:renderMenus,plats:renderPlats,produits:renderProduits,courses:renderCourses,drive:renderDrive}[currentTab])();window.scrollTo({top:preserveScroll?scrollY:0,behavior:'auto'})}
function pageHeading(kicker,title,sub){return '<div class="eyebrow">'+kicker+'</div><h1>'+title+'</h1><p class="muted" style="font-size:13px">'+sub+'</p>'}
function recipeById(id){return state.recipes.find(r=>r.id===id)}
function emptyView(emoji,title,description,button){return '<div class="empty"><div class="illustration">'+emoji+'</div><strong>'+title+'</strong><p>'+description+'</p>'+button+'</div>'}
// Toutes les anciennes cases (un seul plat) restent lisibles après la mise à jour.
function mealDishes(meal){
 if(meal?.type==='recipe'&&meal.recipeId)return [{recipeId:meal.recipeId,people:Number(meal.people)||2}];
 if(meal?.type==='multi'&&Array.isArray(meal.dishes))
   return meal.dishes.filter(d=>d&&d.type!=='leftovers'&&d.recipeId&&Number(d.people)>0)
     .map(d=>({recipeId:d.recipeId,people:Number(d.people)}));
 return []
}
function mealCard(meal,i){
 let names=[],note='',classes='';
 if(meal?.type==='leftovers'){
  const r=meal.recipeId?recipeById(meal.recipeId):null;
  names=[r?'🍱 Restes : '+r.name:'🍱 Restes'];classes=' filled';
  note=(meal.leftoverPortions||2)+' portion'+((meal.leftoverPortions||2)>1?'s':'')+' · sans nouvelles courses'
 }else{
  const dishes=mealDishes(meal);
  if(dishes.length){
   names=dishes.map(d=>{
    const r=recipeById(d.recipeId),here=portionsEatenHere(d,dishes),left=Math.max(0,d.people-here);
    return (r?r.name:'Plat supprimé')+' · '+here+' portion'+(here>1?'s':'')+' ici'+
     (left?' · '+left+' reste'+(left>1?'s':''):'')
   })
  }
  mealLeftovers(meal).forEach(x=>{const r=recipeById(x.recipeId);names.push('🍱 Restes : '+(r?.name||'Autre plat')+' · '+x.people+' portion'+(x.people>1?'s':''))});
  if(names.length){classes=' filled';note=names.length===1?'1 plat':names.length+' plats pour ce repas'}
 }
 return '<button class="meal-tile'+classes+'" data-action="pick-meal" data-index="'+i+'" aria-label="'+html(days[Math.floor(i/2)])+' '+(i%2?'soir':'midi')+', '+html(names.join(' et ')||'ajouter un plat')+'"><span class="meal-type">'+(i%2?'Soir':'Midi')+(note?' · '+html(note):'')+'</span>'+
 (names.length?names.map(n=>'<strong>'+html(n)+'</strong>').join(''):'<span class="add">＋ Ajouter un plat</span>')+'</button>';
}
function renderMenus(){const w=getWeek(),count=w.meals.filter(Boolean).length, last=offsetDate(currentWeek,6),isThis=currentWeek===monday(new Date()),planned=shopping().filter(x=>x.source.includes('Recettes'));
  let out='<div class="hero"><div class="eyebrow">Planificateur hebdomadaire</div><h1>Qu’est-ce qu’on mange cette semaine ?</h1><p>Pour vous deux : cuisine 4 portions, puis choisis librement quand manger les restes. Tu peux aussi faire deux plats différents au même repas !</p><button class="btn cream" data-action="complete-week">✦ Compléter ma semaine</button></div>';
  out+='<div class="section-head"><h2>Votre semaine</h2><span class="pill">'+count+' / 14 repas</span></div>';
  out+='<div class="week-control"><button class="icon-btn" aria-label="Semaine précédente" data-action="week-prev">‹</button><div class="week-label">Du '+niceDate(currentWeek)+' au '+niceDate(last)+(isThis?'<small>Cette semaine</small>':'<small>Planning personnalisé</small>')+'</div><button class="icon-btn" aria-label="Semaine suivante" data-action="week-next">›</button></div>';
  out+='<div class="status-bar"><span style="width:'+(count/14*100)+'%"></span></div>';
  out+='<div class="menus-courses-link"><div class="grow"><strong>🛒 Courses synchronisées avec vos menus</strong><p>'+(
    planned.length?planned.length+' référence'+(planned.length>1?'s':'')+' calculée'+(planned.length>1?'s':'')+' depuis vos recettes. Les quantités sont additionnées automatiquement.':
    'Dès qu’un plat est ajouté au calendrier, ses ingrédients alimentent automatiquement les courses.'
   )+'</p></div><button class="btn secondary" data-action="go-courses">Voir les courses</button></div>';
  out+='<div class="meal-list">';
  for(let day=0;day<7;day++){
   const d=offsetDate(currentWeek,day),hasMeals=Boolean(w.meals[day*2]||w.meals[day*2+1]);
   out+='<section class="day-card"><div class="day-card-head"><div class="day-title">'+days[day]+' <small>'+niceDate(d)+'</small></div>'+
   '<button class="day-clear-btn" data-action="clear-day" data-day="'+day+'" aria-label="Vider les repas du '+html(days[day])+'" '+(!hasMeals?'disabled':'')+'>✕ Vider le jour</button></div>'+
   '<div class="day-meals">'+mealCard(w.meals[day*2],day*2)+mealCard(w.meals[day*2+1],day*2+1)+'</div></section>'
  }
  out+='</div><div class="toolbar"><button class="btn secondary" data-action="generate-week">✦ Générer les 14 repas</button><button class="btn secondary" data-action="repeat-week">↻ Reprendre la semaine passée</button></div>'+
  '<button class="btn danger wide clear-week-btn" data-action="clear-week" '+(!count?'disabled':'')+'>🗑️ Vider tous les repas de cette semaine</button>';
  out+='<p class="helper">Choisis librement quand manger les restes : touche le repas souhaité, puis « Placer des restes ici ». La sélection indique les plats cuisinés et les portions encore disponibles. Aucun repas de restes n’est rempli automatiquement.</p>';
  return out
}
function recipeImg(r){return '<div class="recipe-img">'+(r.image?'<img src="'+html(r.image)+'" alt="">':html(icons[r.category]||'🍽️'))+'</div>'}
function recipeRows(){let list=state.recipes.filter(r=>r.name.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));return list.map(r=>'<div class="recipe-card">'+recipeImg(r)+'<div class="grow"><h3>'+html(r.name)+'</h3><p>'+r.ingredients.length+' ingrédient'+(r.ingredients.length>1?'s':'')+' · recette pour '+r.people+' portions</p><span class="pill gray">'+html(r.category||'Autre')+'</span></div><div class="recipe-actions"><button class="icon-btn" data-action="edit-recipe" data-id="'+r.id+'" aria-label="Modifier '+html(r.name)+'">✎</button><button class="btn tiny secondary" data-action="duplicate-recipe" data-id="'+r.id+'">Dupliquer</button></div></div>').join('')||emptyView('🍲','Aucun plat trouvé',search?'Essaie un autre nom.':'Commence par ajouter votre premier plat.','<button class="btn" data-action="add-recipe">＋ Ajouter un plat</button>')}
function renderPlats(){let out=pageHeading('Votre bibliothèque','Mes plats','Enregistre une seule fois les ingrédients de vos plats habituels.');
  out+='<div class="toolbar"><button class="btn wide" data-action="add-recipe">＋ Ajouter un plat</button></div>';
  out+='<div class="field"><input class="text-input" id="recipeSearch" value="'+html(search)+'" placeholder="⌕ Rechercher un plat…" aria-label="Rechercher un plat"></div>';
  out+='<div class="section-head"><h2>Votre catalogue</h2><span class="pill">'+state.recipes.length+' plat'+(state.recipes.length===1?'':'s')+'</span></div><div id="recipeResults">'+recipeRows()+'</div>';
  return out
}

const productCategories=['Épicerie','Fruits et légumes','Viandes et poissons','Produits frais','Hygiène','Maison','Autres'];
function productById(id){return (state.products||[]).find(p=>p.id===id)}
function validCarrefourLink(raw){
  const value=String(raw||'').trim();if(!value)return '';
  try{const u=new URL(value);if(u.protocol!=='https:'||!(u.hostname==='carrefour.fr'||u.hostname.endsWith('.carrefour.fr'))||u.username||u.password)throw Error('Lien invalide');return u.href}
  catch(e){throw Error('Utilise un lien HTTPS provenant de carrefour.fr.')}
}
// Échange volontaire depuis Safari Carrefour : fragment d’URL, jamais d'accès au stockage d'un autre site.
const CARREFOUR_CLIP_PREFIX='MD-CARREFOUR-V1:';
function openImportedCarrefourProduct(data){
  if(!data||data.v!==1||typeof data.url!=='string')throw Error('Format non reconnu');
  const url=validCarrefourLink(data.url);
  if(!new URL(url).pathname.startsWith('/p/'))throw Error('Ce lien n’est pas une fiche produit');
  const name=String(data.name||'').trim().slice(0,100);
  const brand=String(data.brand||'').trim().slice(0,80);
  const packaging=String(data.packaging||'').trim().slice(0,80);
  const ean=/^\d{13}$/.test(String(data.ean||''))?String(data.ean):'';
  if(!name)throw Error('Nom du produit introuvable');
  const already=state.products.find(p=>(p.url&&p.url.split(/[?#]/)[0]===url.split(/[?#]/)[0])||(ean&&p.ean===ean));
  currentTab='produits';render();
  const linked=ingredientById(pendingIngredientLinkId);
  pendingIngredientLinkId=null;
  if(already){
    showModal('Produit déjà enregistré','<div class="note"><strong>'+html(already.name)+'</strong><p>Cette référence existe déjà, inutile de la créer deux fois.</p></div>'+
      '<button class="btn wide" data-action="edit-product" data-id="'+html(already.id)+'">Modifier la fiche existante</button>'+
      (linked?'<button class="btn secondary wide" style="margin-top:8px" data-action="link-imported-existing" data-id="'+html(already.id)+'" data-ingredient="'+html(linked.id)+'">✓ Associer à '+html(linked.name)+'</button>':''));
  }else{
    productEditor(null,{name,brand,packaging,category:'Autres',qty:1,unit:'paquet',url,ean,packAmount:null,packUnit:null},linked?.id||null);
  }
}
function importCarrefourProductFromHash(){
  const prefix='#carrefour-product=';
  if(!location.hash.startsWith(prefix))return false;
  const raw=location.hash.slice(prefix.length);
  if(typeof history!=='undefined'&&history.replaceState)history.replaceState(null,'',location.pathname+location.search);
  if(raw.length>5000){toast('Lien de produit trop long.');return true}
  try{openImportedCarrefourProduct(JSON.parse(decodeURIComponent(raw)))}
  catch(error){toast('Import Carrefour impossible : '+String(error.message||'lien invalide'))}
  return true
}
function carrefourClipboardModal(ingredientId=null){
 pendingIngredientLinkId=ingredientById(ingredientId)?.id||null;
  const body='<div class="note"><strong>Depuis l’icône sur ton iPhone</strong><p>Sur Carrefour.fr, copie le produit avec notre bouton vert. Reviens ici avec l’icône Menus & Drive, puis appuie sur « Coller et vérifier ».</p></div>'+
    '<button class="btn wide" data-action="read-carrefour-clipboard" style="margin:13px 0">📋 Coller et vérifier le produit</button>'+
    '<div class="field"><label for="carrefourPaste">Si le collage automatique ne marche pas</label><textarea id="carrefourPaste" class="text-input" rows="3" placeholder="Appuie ici longtemps puis choisis Coller"></textarea></div>'+
    '<button class="btn secondary wide" data-action="import-pasted-carrefour">Vérifier le texte collé</button>'+
    '<p class="helper">L’import ne supprime aucune recette et ne modifie pas le panier Carrefour. La fiche doit encore être validée avant d’être enregistrée.</p>';
  showModal('Importer un produit Carrefour',body)
}
function importCopiedCarrefourProduct(raw){
  try{
    const text=String(raw||'').trim();
    if(text.length>5000)throw Error('Texte trop long');
    if(!text.startsWith(CARREFOUR_CLIP_PREFIX))throw Error('Ce texte ne vient pas du bouton Carrefour « Copier pour mon appli ».');
    const parsed=JSON.parse(text.slice(CARREFOUR_CLIP_PREFIX.length));
    openImportedCarrefourProduct(parsed);
  }catch(e){toast('Import impossible : '+String(e.message||'texte invalide'))}
}
async function readCarrefourClipboard(){
  if(!navigator.clipboard?.readText){toast('Appuie longtemps sur le champ ci-dessous puis choisis « Coller ».');$('#carrefourPaste')?.focus();return}
  try{
    const content=await navigator.clipboard.readText();
    importCopiedCarrefourProduct(content);
  }catch(e){
    toast('Accès au presse-papiers refusé. Utilise le champ et « Coller ».');
    $('#carrefourPaste')?.focus();
  }
}
function ingredientRowsCatalogue(){
 const filter=norm(productSearch);
 const list=(state.ingredientCatalog||[]).filter(x=>ingredientStore(x)===ingredientStoreTab&&norm(x.name).includes(filter)).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 if(!list.length)return '<div class="note">'+(filter?'Aucun ingrédient trouvé. Essaie un autre nom.':'Aucun ingrédient pour ce magasin. Les ingrédients des recettes y seront ajoutés automatiquement.')+'</div>';
 return list.map(x=>{
  const p=productById(x.productId),isDrive=ingredientStoreTab==='carrefour';
  let details='';
  if(isDrive){
   if(p){
    details='<span class="catalog-status linked">✓ Référence liée</span> '+html(p.name);
    if(p.packAmount>0)details+=' · '+html(quantity(p.packAmount,p.packUnit))+' / paquet';
    else details+=' · <span class="ingredient-warning">Contenu du paquet à préciser</span>';
    if(!p.ean)details+=' · <span class="ingredient-warning">EAN à vérifier</span>';
   }else details='<span class="catalog-status unlinked">À associer à Carrefour</span>';
  }else details='Pour votre liste Grand Frais · aucune référence nécessaire';
  return '<article class="ingredient-catalog-card"><div class="grow"><strong>'+html(x.name)+'</strong><div class="ingredient-catalog-details">'+details+'</div></div>'+
   '<div class="ingredient-catalog-actions"><button class="btn tiny" data-action="add-ingredient-to-courses" data-id="'+html(x.id)+'" aria-label="Ajouter '+html(x.name)+' aux courses">＋ Courses</button>'+
 '<button class="btn tiny secondary" data-action="edit-ingredient" data-id="'+html(x.id)+'" aria-label="Gérer la fiche '+html(x.name)+'">Gérer</button></div></article>'
 }).join('')
}
function addIngredientToCoursesModal(id){
 const ing=ingredientById(id);if(!ing)return;
 const unit=preferredIngredientUnit(ing);
 const out='<p class="helper">Ajout ponctuel aux courses de cette semaine. L’ingrédient reste enregistré dans Produits ; son magasin habituel est '+(ingredientStore(ing)==='carrefour'?'Carrefour Drive':'Grand Frais')+'.</p>'+
 '<div class="row" style="align-items:start"><div class="field grow"><label for="extraIngredientQty">Quantité nécessaire</label><input id="extraIngredientQty" type="number" min=".01" step="any" value="1"></div>'+
 '<div class="field grow"><label for="extraIngredientUnit">Unité</label><select id="extraIngredientUnit">'+selectOptions(units,unit)+'</select></div></div>'+
 '<button class="btn wide" data-action="save-ingredient-to-courses" data-id="'+html(id)+'">＋ Ajouter aux courses</button>';
 showModal('Ajouter aux courses · '+html(ing.name),out)
}
function ingredientEditor(id,draftName=''){
 const ing=ingredientById(id),store=ing?ingredientStore(ing):ingredientStoreTab;
 let out='<form id="ingredientCatalogForm" data-id="'+html(ing?.id||'')+'">'+
 '<div class="field"><label for="catalogIngredientName">Nom unique de l’ingrédient</label><input id="catalogIngredientName" maxlength="100" required placeholder="Ex. Chorizo" value="'+html(ing?.name||draftName)+'"></div>'+
 '<div class="field"><label for="catalogIngredientStore">Magasin habituel</label><select id="catalogIngredientStore">'+
 '<option value="carrefour" '+(store==='carrefour'?'selected':'')+'>🛒 Carrefour Drive</option>'+
 '<option value="grandfrais" '+(store==='grandfrais'?'selected':'')+'>🥬 Grand Frais</option></select></div>'+
 '<div class="field"><label for="catalogIngredientProduct">Produit Carrefour associé (facultatif pour Grand Frais)</label><select id="catalogIngredientProduct">'+
 '<option value="">Aucun produit associé</option>'+
 state.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(p=>'<option value="'+html(p.id)+'" '+(ing?.productId===p.id?'selected':'')+'>'+html([p.name,p.brand,p.packaging].filter(Boolean).join(' · '))+'</option>').join('')+'</select>'+
 '<div class="helper">Pour Carrefour, sélectionne la référence dont le code EAN et le poids ou contenu du paquet ont été renseignés. La même référence sera utilisée dans toutes les recettes contenant cet ingrédient.</div></div>'+
 '<button class="btn wide" type="submit">✓ Enregistrer dans la base</button></form>';
 if(ing&&store==='carrefour'&&productById(ing.productId))out+='<button class="btn wide" style="margin-top:10px" data-action="edit-product" data-id="'+html(ing.productId)+'">✎ Modifier la référence Carrefour liée</button>';
 if(ing&&store==='carrefour')out+='<button class="btn secondary wide" style="margin-top:10px" data-action="import-linked-product" data-id="'+html(ing.id)+'">📋 Importer un produit depuis Carrefour</button>'+
 '<button class="btn secondary wide" style="margin-top:8px" data-action="new-linked-product" data-id="'+html(ing.id)+'">＋ Créer une fiche produit manuellement</button>';
 else out+='<p class="helper">Enregistre d’abord cet ingrédient, puis tu pourras créer ou lier sa référence Carrefour.</p>';
 out+='<p class="helper">La quantité en grammes ou en pièces se renseigne toujours dans chaque recette, et non dans cette base.</p>';
 showModal(ing?'Modifier l’ingrédient':'Nouvel ingrédient',out)
}
function saveCatalogIngredient(e){
 e.preventDefault();
 const name=$('#catalogIngredientName')?.value.trim(),store=$('#catalogIngredientStore')?.value,productId=$('#catalogIngredientProduct')?.value||null;
 if(!name||!['carrefour','grandfrais'].includes(store)||!(!productId||productById(productId))){
  toast('Vérifie le nom, le magasin et la référence Carrefour.');return
 }
 const old=ingredientById(e.target.dataset.id),duplicate=ingredientByName(name);
 if(duplicate&&duplicate.id!==old?.id){
  toast('Cet ingrédient existe déjà. Modifie sa fiche plutôt que de créer un doublon.');return
 }
 if(!old){
  const sim=ingredientSimilar(name);
  if(sim.length&&!confirm('« '+sim[0].name+' » ressemble à ce nouvel ingrédient. Créer une fiche distincte quand même ?'))return
 }
 const ing=old||makeIngredient(name,store,productId);
 if(!ing)return;
 const previous=ing.name;
 Object.assign(ing,{name,store,productId});
 if(state.storePreferences)delete state.storePreferences['ingredient:'+ing.id];
 // Les plats utilisent toujours la fiche partagée, y compris après un renommage.
 state.recipes.forEach(r=>(r.ingredients||[]).forEach(line=>{
  if(line.ingredientId===ing.id||norm(line.name)===norm(previous)){
   line.ingredientId=ing.id;line.name=ing.name;line.productId=ing.productId
  }
 }));
 ingredientStoreTab=store;persist();closeModal();render();toast('Ingrédient enregistré dans la base !')
}
function productBadge(p){return (p.category==='Hygiène'?'🧴':p.category==='Maison'?'🧻':p.category==='Fruits et légumes'?'🥕':p.category==='Produits frais'?'🥛':p.category==='Viandes et poissons'?'🥩':'🛍️')}
// Les références déjà liées à un ingrédient apparaissent uniquement
// sur sa fiche, jamais une seconde fois dans les articles indépendants.
function independentProducts(store=ingredientStoreTab){
 const linked=new Set((state.ingredientCatalog||[]).map(i=>i.productId).filter(Boolean));
 return (state.products||[]).filter(p=>!linked.has(p.id)&&
  (state.storePreferences?.['product:'+p.id]||p.store||'carrefour')===store)
}
function productRows(){
 const filter=norm(productSearch);
 const list=independentProducts().filter(p=>[p.name,p.brand,p.packaging].some(v=>norm(v).includes(filter))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 if(!list.length)return '<div class="note">'+(filter?'Aucun article indépendant pour cette recherche.':'Aucun article indépendant pour ce magasin.')+'</div>';
 return list.map(p=>'<article class="product-card"><div class="product-symbol" aria-hidden="true">'+productBadge(p)+'</div><div class="grow"><h3>'+html(p.name)+'</h3><p>'+html([p.brand,p.packaging].filter(Boolean).join(' · ')||quantity(p.qty,p.unit))+'</p>'+
 (p.url&&ingredientStoreTab==='carrefour'?'<div class="product-link"><a href="'+html(p.url)+'" target="_blank" rel="noopener noreferrer">Voir sur Carrefour ↗</a></div>':'')+'</div>'+
 '<div class="product-actions"><button class="btn tiny secondary" data-action="edit-product" data-id="'+html(p.id)+'" aria-label="Modifier '+html(p.name)+'">Modifier</button>'+
 '<button class="btn tiny" data-action="add-catalog-product" data-id="'+html(p.id)+'" aria-label="Ajouter '+html(p.name)+' aux courses">＋ Courses</button></div></article>').join('')
}
function renderProduits(){
 const isCarrefour=ingredientStoreTab==='carrefour',
  total=state.ingredientCatalog.filter(i=>ingredientStore(i)===ingredientStoreTab).length,
  independent=independentProducts().length;
 let out=pageHeading('Bibliothèque permanente','Mes produits','Enregistre chaque ingrédient une seule fois. Les quantités à acheter se gèrent dans Courses.');
 out+='<div class="ingredient-tabs" role="group" aria-label="Choisir un magasin">'+
 '<button class="ingredient-tab '+(isCarrefour?'active':'')+'" data-action="ingredient-store-tab" data-store="carrefour">🛒 Carrefour</button>'+
 '<button class="ingredient-tab '+(!isCarrefour?'active':'')+'" data-action="ingredient-store-tab" data-store="grandfrais">🥬 Grand Frais</button></div>';
 out+='<div class="catalog-primary-actions">'+
 '<button class="btn" data-action="add-catalog-ingredient">＋ Ingrédient</button>'+
 (isCarrefour?'<button class="btn secondary" data-action="open-carrefour-import">📋 Importer Carrefour</button>':'')+'</div>';
 out+='<div class="field catalog-search"><input class="text-input" id="productSearch" value="'+html(productSearch)+'" placeholder="⌕ Chercher dans ce magasin…" aria-label="Rechercher un ingrédient ou un article"></div>';
 out+='<div class="section-head"><h2>Ingrédients</h2><span class="pill">'+total+'</span></div>'+
 '<p class="helper catalog-help">'+(isCarrefour?'Associe une référence Carrefour une seule fois à chaque ingrédient.':'Aucun lien ni code-barres nécessaire pour Grand Frais.')+'</p>'+
 '<div id="ingredientCatalogResults">'+ingredientRowsCatalogue()+'</div>';
 out+='<section class="daily-products"><div class="daily-products-heading"><div class="daily-icon">🧻</div><div class="grow"><h2>Achats du quotidien</h2><p>Papier toilette, sopalin, chewing-gum, mascara, produits ménagers…</p></div><span class="pill gray">'+independent+'</span></div>'+
 '<p class="helper">Ce sont les articles qui ne sont pas des ingrédients de recettes. Garde-les ici pour les ajouter aux courses quand tu en as besoin.</p>'+
 '<button class="btn wide" data-action="add-product">＋ Ajouter un achat du quotidien</button>'+
 '<div class="daily-suggestions"><span class="helper">Exemples :</span>'+
 '<button class="daily-suggestion" data-action="daily-example" data-name="Papier toilette" data-category="Hygiène" data-unit="paquet">＋ PQ</button>'+
 '<button class="daily-suggestion" data-action="daily-example" data-name="Sopalin" data-category="Maison" data-unit="rouleau">＋ Sopalin</button>'+
 '<button class="daily-suggestion" data-action="daily-example" data-name="Chewing-gum" data-category="Épicerie" data-unit="paquet">＋ Chewing-gum</button>'+
 '<button class="daily-suggestion" data-action="daily-example" data-name="Mascara" data-category="Hygiène" data-unit="pièce">＋ Mascara</button></div>'+
 '<details class="catalog-independent" '+(independentProductsOpen||productSearch?'open':'')+'><summary>Mes articles enregistrés <span class="pill gray">'+independent+'</span></summary>'+
 '<div id="productResults">'+productRows()+'</div></details></section>';
 if(isCarrefour){
  out+='<p class="helper catalog-footer">Import Carrefour inchangé : copie une référence depuis Carrefour.fr, puis utilise « Importer Carrefour » ci-dessus. Tu peux aussi importer depuis la fiche de chaque ingrédient.</p>';
 }
 return out
}
function productEditor(id,draft=null,linkedIngredientId=null){
 const p=productById(id)||draft,title=id?'Modifier le produit':draft?.url?'Importer depuis Carrefour':draft?'Nouvel achat du quotidien':'Ajouter un achat du quotidien';
 const body='<form id="productForm" data-id="'+html(p?.id||'')+'" data-ingredient-id="'+html(linkedIngredientId||'')+'"><div class="field"><label for="productName">Nom du produit</label><input id="productName" maxlength="100" required placeholder="Ex. Papier toilette" value="'+html(p?.name||'')+'"></div><details class="daily-optional" '+(id||p?.brand||p?.packaging?'open':'')+'><summary>Marque et description (facultatif)</summary><div class="field"><label for="productBrand">Marque (facultatif)</label><input id="productBrand" maxlength="80" placeholder="Ex. Lotus" value="'+html(p?.brand||'')+'"></div><div class="field"><label for="productPackaging">Conditionnement (facultatif)</label><input id="productPackaging" maxlength="80" placeholder="Ex. Lot de 12 rouleaux" value="'+html(p?.packaging||'')+'"></div></details><div class="field"><label for="productCategory">Catégorie</label><select id="productCategory">'+selectOptions(productCategories,p?.category||'Autres')+'</select></div><div class="field"><label for="productStore">Magasin habituel</label><select id="productStore"><option value="carrefour" '+((state.storePreferences?.['product:'+p?.id]||p?.store||'carrefour')==='carrefour'?'selected':'')+'>Carrefour Drive</option><option value="grandfrais" '+((state.storePreferences?.['product:'+p?.id]||p?.store)==='grandfrais'?'selected':'')+'>Grand Frais</option></select></div><div class="row" style="align-items:start"><div class="field grow"><label for="productQty">Quantité habituelle à acheter</label><input id="productQty" type="number" min=".01" step="any" required value="'+(p?.qty||1)+'"></div><div class="field grow"><label for="productUnit">Unité</label><select id="productUnit">'+selectOptions(units,p?.unit||'paquet')+'</select></div></div><details class="daily-optional" '+(id||p?.url||p?.ean||p?.packAmount?'open':'')+'><summary>Référence Carrefour et contenu du paquet (facultatif)</summary><div class="card soft" style="margin:12px 0"><strong>Contenu d’un emballage</strong><p class="helper">Exemple : un paquet contenant 1 kg de riz, pour calculer le nombre de paquets à acheter.</p><div class="row" style="align-items:start"><div class="field grow"><label for="packAmount">Contenu</label><input id="packAmount" type="number" min=".01" step="any" placeholder="Ex. 1" value="'+html(p?.packAmount??'')+'"></div><div class="field grow"><label for="packUnit">Unité de contenu</label><select id="packUnit">'+selectOptions(contentUnits,p?.packUnit||'g')+'</select></div></div></div><div class="field"><label for="productEan">Code-barres EAN-13 (facultatif)</label><input id="productEan" maxlength="13" inputmode="numeric" pattern="[0-9]{13}" placeholder="13 chiffres" value="'+html(p?.ean||'')+'"><div class="helper">Code de la fiche Carrefour, à vérifier sur l’emballage si nécessaire.</div></div><div class="field"><label for="productUrl">Lien du produit Carrefour (facultatif)</label><input id="productUrl" type="url" maxlength="2000" autocomplete="off" placeholder="https://www.carrefour.fr/p/..." value="'+html(p?.url||'')+'"><div class="helper">Colle le lien exact depuis Carrefour.fr. Aucune connexion à ton compte n’est demandée.</div></div></details><button class="btn wide" type="submit">✓ Enregistrer le produit</button></form>';
 showModal(title,(draft?.url&&!id?'<div class="note" style="margin-bottom:12px"><strong>Import depuis Carrefour.fr</strong><p>Vérifie le nom, la marque, la quantité et le conditionnement avant d’enregistrer. Aucun panier n’est modifié.</p></div>':'')+body+(id?'<button class="btn danger wide" style="margin-top:10px" data-action="delete-product" data-id="'+html(id)+'">Supprimer ce produit</button>':''))
}
function saveProduct(e){
 e.preventDefault();
 const id=e.target.dataset.id,old=productById(id),name=$('#productName').value.trim(),brand=$('#productBrand').value.trim(),packaging=$('#productPackaging').value.trim(),category=$('#productCategory').value,qty=Number($('#productQty').value),unit=$('#productUnit').value,packValue=$('#packAmount').value.trim(),packAmount=packValue?Number(packValue):null,packUnit=$('#packUnit').value,ean=$('#productEan').value.trim(),store=$('#productStore').value;
 if(!name||!Number.isFinite(qty)||qty<=0||!units.includes(unit)||!productCategories.includes(category)||!['carrefour','grandfrais'].includes(store)||(packAmount!==null&&(!Number.isFinite(packAmount)||packAmount<=0||!contentUnits.includes(packUnit)))||(ean&&!/^\d{13}$/.test(ean))){toast('Vérifie le nom, le code EAN et les quantités.');return}
 let url='';try{url=validCarrefourLink($('#productUrl').value)}catch(e){toast(e.message);return}
 const product={id:old?.id||uid(),name,brand,packaging,category,store,qty,unit,url,ean,packAmount,packUnit:packAmount?packUnit:null};
 if(state.storePreferences)delete state.storePreferences['product:'+product.id];
 if(old)state.products=state.products.map(p=>p.id===old.id?product:p);else state.products.push(product);
 const ing=ingredientById(e.target.dataset.ingredientId);
 if(ing){ing.productId=product.id;ing.store='carrefour';ingredientStoreTab='carrefour';
  state.recipes.forEach(r=>r.ingredients?.forEach(i=>{if(i.ingredientId===ing.id)i.productId=product.id}))
 }
 persist();closeModal();render();toast(ing?'Produit Carrefour associé à '+ing.name+' !':old?'Produit modifié !':'Produit ajouté au catalogue !')
}
function addCatalogProduct(id){
 const p=productById(id);if(!p)return;
 getWeek().extras.push({id:uid(),name:p.name,qty:p.qty,unit:p.unit,productId:p.id,fromCatalogue:true});
 persist();render(true);toast(p.name+' ajouté aux courses !')
}

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase()}
function converted(q,u){q=Number(q)||0;return u==='kg'?[q*1000,'g']:u==='l'?[q*1000,'ml']:u==='cl'?[q*10,'ml']:[q,u||'pièce']}
function quantity(q,u){const n=Math.round((Number(q)+Number.EPSILON)*100)/100;const s=n.toLocaleString('fr-FR',{maximumFractionDigits:2});const plurals={'pièce':'pièces','paquet':'paquets','boîte':'boîtes','bouteille':'bouteilles','pot':'pots','sachet':'sachets','rouleau':'rouleaux'};return s+' '+(n>1&&plurals[u]?plurals[u]:(u||'pièce'))}
function defaultShoppingStore(category){return ['Fruits et légumes','Viandes et poissons'].includes(category)?'grandfrais':'carrefour'}
// Chaque ingrédient physique est unique dans la base, même s'il apparaît
// dans dix recettes. Les quantités restent propres à chaque plat.
function ingredientById(id){return (state.ingredientCatalog||[]).find(i=>i.id===id)}
function ingredientByName(name){return (state.ingredientCatalog||[]).find(i=>norm(i.name)===norm(name))}
function ingredientSimilar(name){
 const n=norm(name);if(n.length<3)return [];
 const stem=s=>s.endsWith('s')&&s.length>4?s.slice(0,-1):s;
 const distance=(a,b)=>{if(Math.abs(a.length-b.length)>2)return 3;
  let old=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,old[j]+1,old[j-1]+(a[i-1]===b[j-1]?0:1));old=next}return old[b.length]
 };
 return (state.ingredientCatalog||[]).filter(i=>{const o=norm(i.name);return o!==n&&(stem(o)===stem(n)||(n.length>=5&&o.length>=5&&distance(n,o)<=(Math.min(n.length,o.length)>=9?2:1)))}).slice(0,4)
}
function preferredIngredientUnit(ing){
 if(!ing)return 'g';const counts=new Map();
 state.recipes.forEach(r=>(r.ingredients||[]).forEach(x=>{if(x.ingredientId===ing.id||norm(x.name)===norm(ing.name))counts.set(x.unit,(counts.get(x.unit)||0)+1)}));
 return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'g'
}
function frequentIngredients(){
 const counts=new Map();state.recipes.forEach(r=>(r.ingredients||[]).forEach(x=>{const ing=canonicalIngredient(x);if(ing)counts.set(ing.id,(counts.get(ing.id)||0)+1)}));
 return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id])=>ingredientById(id)).filter(Boolean)
}
function refreshIngredientEntry(row){
 if(!row)return;const inp=row.querySelector('.ingredient-name'),ing=ingredientByName(inp?.value||'');
 const store=row.querySelector('.ingredient-store'),unit=row.querySelector('.ingredient-unit'),hint=row.querySelector('.ingredient-suggestions');
 if(store){store.disabled=Boolean(ing);if(ing)store.value=ingredientStore(ing)}
 if(ing&&unit&&!row.dataset.unitSelected)unit.value=preferredIngredientUnit(ing);
 const note=row.querySelector('.ingredient-link-note');if(note){const p=ing?productById(ing.productId):null;note.textContent=ing?(p&&ingredientStore(ing)==='carrefour'?'✓ Produit lié : '+p.name:'✓ Fiche existante · magasin défini dans Produits'):'Nouvel ingrédient créé dans Produits à l’enregistrement.'}
 if(hint){const sim=ing?[]:ingredientSimilar(inp?.value);hint.innerHTML=sim.map(i=>'<button type="button" class="ingredient-suggestion" data-action="reuse-ingredient" data-id="'+html(i.id)+'">✓ Utiliser '+html(i.name)+'</button>').join('')}
}

function ingredientDefaultStore(name,productId){
 const p=productById(productId);
 const oldStore=productId?state.storePreferences?.['product:'+productId]:null;
 if(oldStore==='grandfrais'||oldStore==='carrefour')return oldStore;
 if(p?.store==='grandfrais'||p?.store==='carrefour')return p.store;
 if(p)return 'carrefour';
 return defaultShoppingStore(groupFor(name,'g'))
}
function ingredientStore(ing){
 if(!ing)return 'carrefour';
 const chosen=state.storePreferences?.['ingredient:'+ing.id];
 return ['carrefour','grandfrais'].includes(chosen)?chosen:(ing.store==='grandfrais'?'grandfrais':'carrefour')
}
function makeIngredient(name,store,productId){
 const clean=String(name||'').trim().slice(0,100);
 if(!clean)return null;
 const already=ingredientByName(clean);
 if(already)return already;
 const item={id:uid(),name:clean,store:store==='grandfrais'?'grandfrais':'carrefour',productId:productId||null};
 state.ingredientCatalog.push(item);
 return item
}
function normalizeIngredientCatalog(){
 let changed=false;
 if(!Array.isArray(state.ingredientCatalog)){state.ingredientCatalog=[];changed=true}
 const distinct=new Map();
 for(const record of state.ingredientCatalog){
  const key=norm(record?.name);
  if(!key)continue;
  if(!distinct.has(key)){distinct.set(key,record);continue}
  const master=distinct.get(key);
  if(!master.productId&&record.productId)master.productId=record.productId;
  state.recipes.forEach(r=>r.ingredients?.forEach(i=>{if(i.ingredientId===record.id)i.ingredientId=master.id}));
  changed=true
 }
 if(distinct.size!==state.ingredientCatalog.length){state.ingredientCatalog=[...distinct.values()];changed=true}
 for(const recipe of state.recipes){
  for(const line of (recipe.ingredients||[])){
   let ing=ingredientById(line.ingredientId);
   if(!ing)ing=ingredientByName(line.name);
   if(!ing){
    const oldUnit=converted(line.qty,line.unit)[1];
    const oldKey=norm(line.name)+'|'+oldUnit;
    const oldStore=state.storePreferences?.[oldKey];
    ing=makeIngredient(line.name,oldStore==='grandfrais'||oldStore==='carrefour'?oldStore:ingredientDefaultStore(line.name,line.productId),line.productId||null);
    if(ing)changed=true
   }
   if(!ing)continue;
   if(!ing.productId&&line.productId&&productById(line.productId)){ing.productId=line.productId;changed=true}
   if(line.ingredientId!==ing.id){line.ingredientId=ing.id;changed=true}
  }
 }
 return changed
}
function canonicalIngredient(line){
 return ingredientById(line?.ingredientId)||ingredientByName(line?.name)
}
function mergeIngredientInRecipe(line,store){
 let ing=canonicalIngredient(line);
 if(!ing){ing=makeIngredient(line.name,store||ingredientDefaultStore(line.name,line.productId),line.productId||null)}
 return ing
}
function shoppingStore(x){
 const ing=ingredientById(x.ingredientId);
 if(ing)return ingredientStore(ing);
 const p=productById(x.productId);
 const key=p?'product:'+p.id:x.id;
 const saved=state.storePreferences?.[key];
 if(saved==='grandfrais'||saved==='carrefour')return saved;
 if(p?.store==='grandfrais'||p?.store==='carrefour')return p.store;
 return p?'carrefour':defaultShoppingStore(x.category)
}
function setShoppingStore(itemId,store){
 if(!['grandfrais','carrefour'].includes(store))return;
 const item=shopping().find(x=>x.id===itemId);
 if(!item)return;
 const ing=ingredientById(item.ingredientId);
 const key=ing?'ingredient:'+ing.id:(item.productId?'product:'+item.productId:item.id);
 if(!state.storePreferences)state.storePreferences={};
 state.storePreferences[key]=store;
 if(ing)ing.store=store;
 // Le choix mémorisé s'applique aux prochaines semaines aussi.
 persist();render(true);toast(store==='grandfrais'?'Mis sur la liste Grand Frais':'Mis sur la liste Carrefour Drive')
}
function groupFor(name,unit){const s=norm(name);if(/pq|papier toilette|lessive|savon|shampo|dentifrice|baume|douche|mouchoir|deodorant/.test(s))return 'Hygiène et maison';if(/poulet|boeuf|bœuf|jambon|poisson|saumon|crevette|porc|steak|dinde/.test(s))return 'Viandes et poissons';if(/tomate|oignon|carotte|salade|pomme|banane|courgette|ail|citron|poivron|brocoli|champignon/.test(s))return 'Fruits et légumes';if(/lait|crème|creme|yaourt|fromage|beurre|mozzarella|oeuf|œuf/.test(s))return 'Produits frais';return 'Épicerie et divers'}
function productGroup(p){if(['Hygiène','Maison'].includes(p?.category))return 'Hygiène et maison';if(p?.category==='Viandes et poissons')return 'Viandes et poissons';if(p?.category==='Fruits et légumes')return 'Fruits et légumes';if(p?.category==='Produits frais')return 'Produits frais';return 'Épicerie et divers'}
function shopping(){
 const w=getWeek(),map=new Map(),packs=new Map();
 function plain(name,qty,unit,source,productId,ingredientId,store){
  const clean=String(name||'').trim();if(!clean)return;
  const [v,u]=converted(qty,unit);if(!(v>0))return;
  const p=productById(productId),ing=ingredientById(ingredientId);
  const key=(ing?'ingredient:'+ing.id:(p?'produit:'+p.id:norm(clean)))+'|'+u;
  if(!map.has(key))map.set(key,{id:key,name:ing?.name||clean,qty:0,unit:u,source:[],productId:p?.id||null,ingredientId:ing?.id||null,forcedStore:store||null});
  const x=map.get(key);x.qty+=v;if(!x.source.includes(source))x.source.push(source)
 }
 function add(name,qty,unit,source,productId,fromCatalogue=false,ingredientId=null){
  const ing=ingredientById(ingredientId),store=ing?ingredientStore(ing):null;
  const selectedProductId=ing?(ing.productId||null):productId;
  const p=productById(selectedProductId);
  const [val,u]=converted(qty,unit),[size,packUnit]=p&&p.packAmount>0?converted(p.packAmount,p.packUnit):[0,''];
  const compatible=p&&size>0&&packUnit===u,catalogue=p&&fromCatalogue&&unit===p.unit;
  if((compatible||catalogue)&&(!ing||store==='carrefour')){
   if(!packs.has(p.id))packs.set(p.id,{p,needed:0,needUnit:packUnit||u,size,manualPacks:0,source:[],ingredientId:ing?.id||null});
   const item=packs.get(p.id);
   if(catalogue)item.manualPacks+=Number(qty);else item.needed+=val;
   if(ing&&!item.ingredientId)item.ingredientId=ing.id;
   if(!item.source.includes(source))item.source.push(source);
   return
  }
  plain(ing?.name||name,qty,unit,source,(store==='grandfrais')?null:p?.id,ing?.id||null,store)
 }
 w.meals.forEach(m=>mealDishes(m).forEach(d=>{
  const recipe=recipeById(d.recipeId);if(!recipe)return;
  const factor=(Number(d.people)||2)/Math.max(1,Number(recipe.people)||2);
  recipe.ingredients.forEach(x=>add(x.name,Number(x.qty)*factor,x.unit,'Recettes',x.productId,false,x.ingredientId))
 }));
 w.extras.forEach(x=>add(x.name,x.qty,x.unit,'Ajout manuel',x.productId,Boolean(x.fromCatalogue),x.ingredientId));
 for(const [productId,item] of packs){
  const p=item.p,stockUnit=item.needed>0?item.needUnit:(p.unit||'paquet');
  const pantryKey='produit:'+productId+'|'+stockUnit;
  const stockAmount=Math.max(0,Number(w.pantry[pantryKey])||0);
  const grossNeed=item.needed>0?item.needed+item.manualPacks*item.size:item.manualPacks;
  const netNeed=Math.max(0,grossNeed-stockAmount);
  const count=item.needed>0&&item.size>0?Math.ceil(netNeed/item.size-1e-9):netNeed;
  const id='produit:'+productId+'|achat';
  map.set(id,{id,name:p.name,qty:count,unit:p.unit||'paquet',source:item.source,productId,ingredientId:item.ingredientId,
   needed:netNeed>0?quantity(netNeed,stockUnit):'',grossNeeded:grossNeed>0?quantity(grossNeed,stockUnit):'',
   totalNeedAmount:grossNeed,totalNeedUnit:stockUnit,
   stockKey:pantryKey,stockAmount,stockUnit,covered:count<=0,
   packageDescription:p.packaging||((p.packAmount>0)?quantity(p.packAmount,p.packUnit):'')})
 }
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(x=>{
  const category=x.productId?productGroup(productById(x.productId)):groupFor(x.name,x.unit);
  const stockKey=x.stockKey||x.id,stockAmount=Math.max(0,Number(w.pantry[stockKey])||0);
  const fromPack=Boolean(x.stockKey),qty=fromPack?x.qty:Math.max(0,x.qty-stockAmount);
  const item={...x,qty,stockKey,stockAmount:fromPack?x.stockAmount:stockAmount,stockUnit:fromPack?x.stockUnit:x.unit,
   covered:fromPack?x.covered:qty<=0,grossQty:fromPack?x.totalNeedAmount:x.qty,
   totalNeedAmount:fromPack?x.totalNeedAmount:x.qty,totalNeedUnit:fromPack?x.totalNeedUnit:x.unit,
   category,checked:w.checked.includes(x.id),excluded:w.excluded.includes(x.id)};
  return {...item,store:shoppingStore(item)}
 })
}
function stockUnitChoices(x){
 const unit=x.stockUnit,p=productById(x.productId);
 const arr=[unit];if(unit==='g')arr.push('kg');
 if(unit==='ml')arr.push('cl','l');
 if(p?.packAmount>0&&p.packUnit){
  const [v,u]=converted(p.packAmount,p.packUnit);
  if(v>0&&u===unit&&unit!=='paquet')arr.push('paquet')
 }
 return [...new Set(arr)]
}
function stockInputToBase(x,amount,unit){
 if(!Number.isFinite(amount)||amount<0)return null;
 if(unit==='paquet'&&x.stockUnit!=='paquet'){
  const p=productById(x.productId);
  if(!p||!(p.packAmount>0))return null;
  const [size,baseUnit]=converted(p.packAmount,p.packUnit);
  return baseUnit===x.stockUnit?amount*size:null
 }
 const [value,base]=converted(amount,unit);
 return base===x.stockUnit?value:null
}
function stockBaseToUnit(x,amount,unit){
 if(unit==='paquet'&&x.stockUnit!=='paquet'){
  const p=productById(x.productId),[size,base]=converted(p?.packAmount,p?.packUnit);
  return size>0&&base===x.stockUnit?amount/size:amount
 }
 if(unit==='kg'&&x.stockUnit==='g')return amount/1000;
 if(unit==='l'&&x.stockUnit==='ml')return amount/1000;
 if(unit==='cl'&&x.stockUnit==='ml')return amount/10;
 return amount
}
function stockPreview(x,amount,unit){
 const val=stockInputToBase(x,amount,unit);
 if(val===null)return 'Cette unité ne correspond pas au produit.';
 const need=x.totalNeedAmount||0,left=Math.max(0,need-val);
 let remaining='Reste à acheter : '+quantity(left,x.stockUnit);
 const p=productById(x.productId);
 const [packValue,packUnit]=p?.packAmount>0?converted(p.packAmount,p.packUnit):[0,''];
 if(packValue>0&&packUnit===x.stockUnit){
  const packs=Math.ceil(Math.max(0,left)/packValue-1e-9);
  remaining+=' · '+packs+' '+(packs>1?'paquets':'paquet')+' Carrefour';
 }
 if(left===0)remaining='✓ Vous avez déjà tout ce qu’il faut pour ce produit.';
 return 'Besoin : '+quantity(need,x.stockUnit)+' · Stock maison : '+quantity(val,x.stockUnit)+' · '+remaining
}
function refreshStockPreview(){
 const id=$('#homeStockItemId')?.value,x=shopping().find(z=>z.id===id),amount=Number($('#homeStockAmount')?.value),unit=$('#homeStockUnit')?.value;
 const target=$('#homeStockPreview');
 if(x&&target)target.textContent=stockPreview(x,amount,unit)
}
function homeStockModal(itemId){
 const x=shopping().find(i=>i.id===itemId);if(!x)return;
 const w=getWeek(),choices=stockUnitChoices(x),selected=choices.includes(w.pantryUnits[x.stockKey])?w.pantryUnits[x.stockKey]:choices[0];
 const amount=stockBaseToUnit(x,x.stockAmount||0,selected);
 const p=productById(x.productId),[packSize,packUnit]=p?.packAmount>0?converted(p.packAmount,p.packUnit):[0,''];
 let htmlBody='<p class="helper">Note ce que vous avez déjà chez vous. Seuls les achats de cette semaine sont recalculés ; la fiche produit et les recettes ne changent pas.</p>'+
 '<input id="homeStockItemId" type="hidden" value="'+html(x.id)+'">'+
 '<div class="stock-overview"><div><small>Besoin pour les repas</small><strong>'+html(quantity(x.totalNeedAmount,x.totalNeedUnit))+'</strong></div>'+
 '<div><small>Déjà à la maison</small><strong>'+html(quantity(x.stockAmount,x.stockUnit))+'</strong></div></div>'+
 '<div class="row stock-editor-row"><div class="field grow"><label for="homeStockAmount">Quantité disponible</label>'+
 '<input id="homeStockAmount" type="number" min="0" step="any" inputmode="decimal" value="'+html(Number(amount.toFixed(3)))+'"></div>'+
 '<div class="field grow"><label for="homeStockUnit">Unité</label><select id="homeStockUnit" data-previous="'+html(selected)+'">'+
 choices.map(u=>'<option value="'+html(u)+'" '+(selected===u?'selected':'')+'>'+html(u==='paquet'?'paquet':u)+'</option>').join('')+'</select></div></div>';
 if(choices.includes('paquet')&&packSize>0)htmlBody+='<p class="helper">1 paquet = '+html(quantity(packSize,packUnit))+'. Tu peux indiquer un stock en paquets ou dans une unité de poids/volume.</p>';
 htmlBody+='<div class="stock-quick-actions"><button class="btn secondary" data-action="stock-zero">Aucun stock</button><button class="btn secondary" data-action="stock-all">✓ J’ai tout</button></div>'+
 '<div id="homeStockPreview" class="stock-preview">'+html(stockPreview(x,Number(amount),selected))+'</div>'+
 '<button class="btn wide" data-action="save-home-stock" data-id="'+html(x.id)+'">✓ Enregistrer mon stock</button>';
 showModal('🏠 Stock maison · '+x.name,htmlBody)
}
function shoppingRow(x){
 const p=productById(x.productId);
 const stock=x.stockAmount>0;
 let detail='';
 if(x.grossNeeded){
  detail='Besoin : '+html(x.grossNeeded);
  if(stock)detail+=' · Maison : '+html(quantity(x.stockAmount,x.stockUnit));
  if(x.needed&&stock)detail+=' · Reste : '+html(x.needed);
 }else{
  detail=html(x.source.join(' + '));
  if(stock)detail+=' · Stock : '+html(quantity(x.stockAmount,x.stockUnit));
 }
 if(p?.packaging)detail+=' · '+html(p.packaging);
 return '<div class="shopping-row shopping-clean'+(x.checked?' checked':'')+'">'+
 '<input class="check" type="checkbox" data-check="'+html(x.id)+'" '+(x.checked?'checked':'')+' aria-label="Marquer '+html(x.name)+' comme acheté">'+
 '<div class="grow"><div class="shopping-row-top"><strong class="shopping-name">'+html(x.name)+'</strong><span class="shopping-qty">'+html(quantity(x.qty,x.unit))+'</span></div>'+
 '<div class="shopping-meta">'+detail+'</div>'+
 '<div class="shopping-controls"><label class="store-label" for="store-'+encodeURIComponent(x.id)+'">Magasin</label>'+
 '<select class="store-select" id="store-'+encodeURIComponent(x.id)+'" data-store-item="'+html(x.id)+'" aria-label="Changer le magasin de '+html(x.name)+'">'+
 '<option value="carrefour" '+(x.store==='carrefour'?'selected':'')+'>Carrefour</option>'+
 '<option value="grandfrais" '+(x.store==='grandfrais'?'selected':'')+'>Grand Frais</option></select>'+
 '<button class="home-stock-btn" data-action="home-stock" data-id="'+html(x.id)+'">'+(stock?'🏠 Stock : '+html(quantity(x.stockAmount,x.stockUnit)):'🏠 Stock')+'</button>'+
 '<button class="home-owned" data-action="exclude" data-id="'+html(x.id)+'" title="Ne pas acheter cette semaine">Retirer</button></div></div></div>'
}
function renderCourses(){
 const items=shopping(),w=getWeek();
 const active=items.filter(x=>!x.excluded&&!x.covered&&!x.checked),
  checked=items.filter(x=>x.checked&&!x.excluded&&!x.covered),
  excluded=items.filter(x=>x.excluded),
  covered=items.filter(x=>x.covered&&!x.excluded),
  carrefour=active.filter(x=>x.store==='carrefour'),
  grand=active.filter(x=>x.store==='grandfrais');
 const order=['Fruits et légumes','Viandes et poissons','Produits frais','Épicerie et divers','Hygiène et maison'];
 let out=pageHeading('Achats de la semaine','Mes courses','Les quantités sont calculées depuis vos repas. Ici, prépare uniquement ce qu’il reste à acheter.');
 out+='<div class="course-summary"><div class="course-shop-count carrefour"><strong>'+carrefour.length+'</strong><span>🛒 Carrefour Drive</span></div>'+
 '<div class="course-shop-count grand"><strong>'+grand.length+'</strong><span>🥬 Grand Frais</span></div></div>';
 out+='<button class="btn wide course-add-btn" data-action="add-extra">＋ Ajouter un article à cette semaine</button>';
 if(state.staples.length){
  out+='<details class="course-optional" data-section="favorites" '+(courseOpenSections.has('favorites')?'open':'')+'><summary>☆ Ajouter depuis mes favoris <span class="pill gray">'+state.staples.length+'</span></summary>'+
   '<div class="favorites">'+state.staples.map(x=>'<button class="favorite-chip" data-action="quick-staple" data-id="'+html(x.id)+'">＋ '+html(x.name)+'</button>').join('')+'</div></details>'
 }
 function section(store,title,icon,rows){
  const isDrive=store==='carrefour';
  let section='<section class="course-store '+(isDrive?'drive':'fresh')+'"><div class="course-store-head"><div><div class="eyebrow">À acheter</div><h2>'+icon+' '+title+'</h2></div><span class="pill">'+rows.length+' article'+(rows.length===1?'':'s')+'</span></div>';
  section+='<button class="btn '+(isDrive?'secondary':'')+' wide" data-action="'+(isDrive?'go-drive':'copy-grand-frais')+'" '+(!rows.length?'disabled':'')+'>'+
   (isDrive?'🛒 Préparer mon panier Carrefour':'📋 Copier Grand Frais dans Notes')+'</button>';
  if(rows.length){
   if(rows.length>=6){
    for(const cat of order){const filtered=rows.filter(x=>x.category===cat);if(filtered.length)section+='<div class="shopping-category">'+cat+'</div>'+filtered.map(shoppingRow).join('')}
    const other=rows.filter(x=>!order.includes(x.category));if(other.length)section+=other.map(shoppingRow).join('')
   }else section+=rows.map(shoppingRow).join('');
  }else section+='<div class="course-empty">Aucun achat prévu dans ce magasin.</div>';
  return section+'</section>'
 }
 out+=section('carrefour','Carrefour Drive','🛒',carrefour);
 out+=section('grandfrais','Grand Frais','🥬',grand);
 if(checked.length)out+='<details class="course-optional" data-section="checked" '+(courseOpenSections.has('checked')?'open':'')+'><summary>✓ Articles cochés <span class="pill gray">'+checked.length+'</span></summary>'+
  '<p class="helper">Décoche un article pour le remettre dans les achats.</p>'+checked.map(shoppingRow).join('')+'</details>';
 if(covered.length||excluded.length){
  out+='<details class="course-optional" data-section="home" '+(courseOpenSections.has('home')?'open':'')+'><summary>🏠 Déjà chez nous / retirés <span class="pill gray">'+(covered.length+excluded.length)+'</span></summary>'+
   (covered.length?'<p class="helper">Couverts par votre stock : corrige la quantité si nécessaire.</p>'+
     covered.map(x=>'<div class="course-house-row"><span class="grow"><strong>'+html(x.name)+'</strong><small> · '+html(quantity(x.stockAmount,x.stockUnit))+' disponible</small></span><button class="btn tiny secondary" data-action="home-stock" data-id="'+html(x.id)+'">Modifier le stock</button></div>').join(''):'')+
   (excluded.length?'<p class="helper">Retirés manuellement des achats de cette semaine.</p>'+
     excluded.map(x=>'<div class="course-house-row"><span class="grow">'+html(x.name)+'</span><button class="btn tiny secondary" data-action="include" data-id="'+html(x.id)+'">Réintégrer</button></div>').join(''):'')+'</details>'
 }
 if(w.extras.length){
  out+='<details class="course-optional" data-section="manual" '+(courseOpenSections.has('manual')?'open':'')+'><summary>Gérer les ajouts manuels <span class="pill gray">'+w.extras.length+'</span></summary>'+
   '<p class="helper">Ces articles figurent déjà dans les magasins ci-dessus. Ici, tu peux supprimer uniquement leur ajout manuel.</p>'+
   w.extras.map(x=>'<div class="course-house-row"><span class="grow">'+html(x.name)+' · '+html(quantity(x.qty,x.unit))+'</span><button class="btn tiny secondary" data-action="delete-extra" data-id="'+html(x.id)+'" aria-label="Supprimer l’ajout manuel">Supprimer</button></div>').join('')+'</details>'
 }
 return out
}
function grandFraisText(){
 const items=shopping().filter(x=>!x.checked&&!x.excluded&&!x.covered&&x.store==='grandfrais');
 return items.length?'Grand Frais\n'+items.map(x=>'• '+x.name+' — '+quantity(x.qty,x.unit)+(x.needed?' (besoin : '+x.needed+')':'')).join('\n'):''
}
async function copyGrandFrais(){
 const value=grandFraisText();
 if(!value){toast('La liste Grand Frais est vide.');return}
 try{await navigator.clipboard.writeText(value);toast('Liste Grand Frais copiée ! Colle-la dans Notes.')}
 catch(err){showModal('Liste Grand Frais à copier','<p class="helper">Sélectionne tout ce texte puis copie-le dans Notes :</p><textarea class="text-input" style="height:220px" readonly>'+html(value)+'</textarea>')}
}
function listText(){return shopping().filter(x=>!x.checked&&!x.excluded&&!x.covered).map(x=>x.name+' — '+quantity(x.qty,x.unit)+(x.needed?' (besoin : '+x.needed+')':'')).join('\n')}
function driveTransferRows(){
 return shopping().filter(x=>!x.checked&&!x.excluded&&!x.covered&&x.store==='carrefour').map(x=>{
  const p=productById(x.productId);
  const matchedEan=(p?.ean&&/^\d{13}$/.test(String(p.ean)))?String(p.ean):((p?.url||'').match(/(?:-|\/)(\d{13})(?:[/?#]|$)/)?.[1]||'');
  const qty=Number(x.qty),unit=x.unit;
  // Les unités de masse/volume ne représentent pas une quantité de colis.
  const isCountable=Boolean(p)&&['pièce','paquet','boîte','rouleau','bouteille','pot','sachet'].includes(unit)
    &&unit===p.unit&&Number.isInteger(qty)&&qty>0&&qty<=999;
  let reason='';
  if(!matchedEan)reason='Référence Carrefour à associer';
  else if(!isCountable)reason='Unité à acheter incompatible ou conditionnement à préciser';
  return {id:x.id,ingredientId:x.ingredientId||null,productId:x.productId||null,name:x.name.slice(0,120),qty,unit,ean:matchedEan,url:p?.url||'',brand:p?.brand||'',
   packaging:p?.packaging||'',needed:x.needed||'',ready:Boolean(!reason),reason};
 });
}
function driveTransferLines(){
 // Seules les références complètes avec un nombre entier de colis sont exportées.
 // Les occurrences d’un même EAN sont regroupées pour ne pas multiplier les lignes.
 const grouped=new Map();
 for(const item of driveTransferRows().filter(x=>x.ready)){
  grouped.set(item.ean,(grouped.get(item.ean)||0)+item.qty);
 }
 return [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([ean,qty])=>({ean,qty}));
}
function driveTransferText(){
 return driveTransferLines().map(x=>x.ean+' '+x.qty).join('\n');
}
// Un lien extérieur transmet seulement les EAN et quantités via le fragment d'URL.
function driveDirectUrl(){
 const lines=driveTransferLines(),text=driveTransferText();
 if(!lines.length||lines.length>120)return '';
 const encoded=encodeURIComponent(text);
 if(encoded.length>2900)return ''; // Garde une URL courte pour Safari iPhone.
 return 'https://www.carrefour.fr/#md-drive-v1='+encoded;
}
// Sur l'iPhone, les liens HTTPS externes d'une PWA peuvent s'ouvrir dans un
// navigateur intégré sans extension Safari. On utilise alors l'URL scheme Safari.
function isIosHomeScreenApp(){
 const ios=/iPad|iPhone|iPod/i.test(navigator.userAgent||'')||
   (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=navigator.standalone===true||
   Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
 return ios&&standalone
}
function openDriveInSafari(){
 const url=driveDirectUrl();
 if(!url){toast('Aucune référence prête pour Carrefour.');return}
 if(isIosHomeScreenApp()){
   // Le schéma x-safari-https est reconnu par Safari sur les iOS récents.
   // Il contourne le navigateur intégré de la PWA. Test réel requis selon iOS.
   window.location.href='x-safari-'+url;
 }else{
   window.open(url,'_blank','noopener,noreferrer')
 }
}
async function copyDriveUrl(){
 const url=driveDirectUrl();
 if(!url){toast('Aucune référence prête à transférer.');return}
 try{await navigator.clipboard.writeText(url);toast('Lien Carrefour copié ! Colle-le dans la barre d’adresse Safari.')}
 catch(e){showModal('Lien Carrefour pour Safari','<p class="helper">Copie ce lien dans la barre d’adresse Safari :</p><textarea class="text-input" rows="4" readonly>'+html(url)+'</textarea>')}
}
function driveListModal(){
 const rows=driveTransferRows(),ready=rows.filter(x=>x.ready),missing=rows.filter(x=>!x.ready),lines=driveTransferLines();
 let body='<div class="card soft"><strong>Références et quantités</strong><p class="subtext">Une ligne = un code-barres et un nombre d’articles. Le bouton principal tente maintenant de constituer ton vrai panier Carrefour avec les seuls produits disponibles.</p></div>';
 body+='<div class="row between" style="margin:12px 0"><span class="pill">'+lines.length+' code'+(lines.length>1?'s':'')+' à copier</span><span class="pill">'+missing.length+' produit'+(missing.length>1?'s':'')+' à préciser</span></div>';
 body+=driveDirectUrl()?'<button class="btn wide" data-action="open-drive-in-safari">🛒 Constituer mon panier Carrefour</button>':'<div class="note">La liste est trop longue pour un lien direct ou aucun produit n’est prêt. Utilise la copie de secours.</div>';
 body+='<button class="btn secondary wide" style="margin-top:10px" data-action="copy-drive-url" '+(!driveDirectUrl()?'disabled':'')+'>🔗 Copier le lien pour Safari (secours)</button>';
 body+='<button class="btn secondary wide" style="margin-top:9px" data-action="copy-drive-transfer" '+(!lines.length?'disabled':'')+'>📋 Copier les codes-barres (autre secours)</button>';
 body+='<div class="field" style="margin-top:12px"><label for="driveTransferFallback">Aperçu du texte à copier</label><textarea class="text-input" id="driveTransferFallback" rows="5" readonly>'+html(driveTransferText())+'</textarea><div class="helper">Si la copie automatique est bloquée : appui long → Tout sélectionner → Copier.</div></div>';
 body+='<div class="note"><strong>Sur iPhone</strong>, le bouton tente d’ouvrir directement Safari (pas la fenêtre intégrée). Si Safari ne s’ouvre pas, copie le lien de secours et colle-le dans sa barre d’adresse. Aucun paiement automatique.</div>';
 if(!lines.length)body+='<p class="helper">Aucune référence exploitable : associe des produits Carrefour aux ingrédients et indique leur conditionnement avant de transférer.</p>';
 if(missing.length)body+='<div class="section-head"><h3>Non transférés — à compléter</h3></div>'+missing.slice(0,25).map(x=>'<div class="shopping-row"><div class="grow"><strong>'+html(x.name)+'</strong><div class="shopping-meta">'+html(x.reason)+'</div></div><span class="pill gray">'+html(quantity(x.qty,x.unit))+'</span></div>').join('')+(missing.length>25?'<p class="helper">Et '+(missing.length-25)+' autres lignes.</p>':'');
 showModal('Préparer mon panier Carrefour',body)
}
async function copyDriveTransfer(){
 const text=driveTransferText();
 if(!text){toast('Aucun code-barres transférable : complète les références manquantes.');return}
 if(text.length>60000){toast('Liste trop volumineuse.');return}
 try{await navigator.clipboard.writeText(text);toast('Codes et quantités copiés ! Ouvre Carrefour dans Safari.')}
 catch(e){toast('Utilise le champ de copie manuelle.');$('#driveTransferFallback')?.focus()}
}
function renderDrive(){const items=shopping().filter(x=>!x.checked&&!x.excluded&&!x.covered&&x.store==='carrefour'),grandFraisCount=shopping().filter(x=>!x.checked&&!x.excluded&&!x.covered&&x.store==='grandfrais').length,transfers=driveTransferRows(),ready=transfers.filter(x=>x.ready),directUrl=driveDirectUrl();
 let out=pageHeading('Carrefour École-Valentin','Mon Drive','Prépare les références et les quantités pour ton Carrefour Drive.');
 out+='<div class="card"><div class="drive-illustration">🛍️</div><div class="row between"><h2>'+items.length+' produit'+(items.length!==1?'s':'')+' à acheter</h2><span class="pill">Drive favori</span></div><p class="subtext">Carrefour Besançon-Valentin · École-Valentin (à vérifier sur Carrefour.fr)</p><div class="divider"></div>';
 out+='<p class="subtext">Contrôle avant Drive : '+ready.length+' référence'+(ready.length!==1?'s':'')+' prête'+(ready.length!==1?'s':'')+' · '+(transfers.length-ready.length)+' à compléter.</p>';
 if(transfers.some(x=>!x.ready)){
  out+='<div class="drive-preflight"><strong>⚠️ Références à compléter avant Carrefour</strong><p class="helper">Ces produits ne seront pas envoyés automatiquement tant que leur fiche n’est pas prête.</p>';
  for(const item of transfers.filter(x=>!x.ready)){
   out+='<div class="drive-preflight-item"><div class="grow"><strong>'+html(item.name)+'</strong><p>'+html(item.reason)+'</p></div>'+
    '<button class="btn tiny secondary" data-action="fix-drive-item" data-id="'+html(item.id)+'">Compléter</button></div>'
  }
  out+='</div>'
 }else if(transfers.length){
  out+='<div class="drive-ready">✅ Toutes les références sélectionnées sont prêtes pour la vérification de disponibilité Carrefour.</div>'
 }
 out+=directUrl?'<button class="btn wide" data-action="open-drive-in-safari">🛒 Constituer mon panier Carrefour</button>':'<button class="btn wide" disabled>🛒 Constituer mon panier Carrefour</button>';
 out+='<button class="btn secondary wide" style="margin-top:9px" data-action="prepare-drive-transfer" '+(!items.length?'disabled':'')+'>📋 Détails et copie de secours</button>';
 // La copie de Grand Frais reste dans Courses : ce panneau est exclusivement dédié à Carrefour.
 out+='<a class="btn secondary wide" style="margin-top:9px" href="https://www.carrefour.fr/" target="_blank" rel="noopener noreferrer">Ouvrir Carrefour ↗</a></div>';
 out+='<div class="note" style="margin-top:16px"><strong>Ce panneau est réservé à Carrefour.</strong> La liste Grand Frais est à copier dans l’onglet Courses. <strong>Ajout au panier réel — test.</strong> En appuyant sur le bouton principal, tu autorises Userscripts à ajouter les produits confirmés disponibles au panier Carrefour actif. Les absents seront signalés. Aucun paiement ni commande automatique. Vérifie le Drive École-Valentin avant de continuer.</div>';
 out+='<div class="section-head"><h2>Ta liste à préparer</h2></div>';
 out+=items.length?'<div class="card">'+items.map(x=>'<div class="row between" style="padding:8px 0;border-bottom:1px solid #eef1ea"><span class="grow" style="font-size:13px">'+html(x.name)+(x.needed?' <small class="muted">(besoin : '+html(x.needed)+')</small>':'')+(productById(x.productId)?.url?'<br><a href="'+html(productById(x.productId).url)+'" target="_blank" rel="noopener noreferrer" style="font-size:11px">Voir sur Carrefour ↗</a>':'')+'</span><strong style="font-size:12px">'+html(quantity(x.qty,x.unit))+'</strong></div>').join('')+'</div>':emptyView('🥬','Aucun produit au Drive',grandFraisCount?'Tous les achats de cette liste sont prévus chez Grand Frais. Tu peux copier cette liste dans Notes.':'Remplis ton planning et ta liste de courses.','<button class="btn" data-action="go-courses">Voir mes deux listes de courses</button>');
 return out
}

function showModal(title,body){modalRoot.innerHTML='<div class="modal-overlay" data-overlay="true"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><h2 id="modalTitle">'+title+'</h2><button class="close-btn" aria-label="Fermer" data-action="close-modal">×</button></div>'+body+'</div></div>';const first=modalRoot.querySelector('input,button');if(first)first.focus()}
function closeModal(){modalRoot.innerHTML='';pendingIngredientLinkId=null}
function selectOptions(values,value){return values.map(x=>'<option value="'+html(x)+'" '+(x===value?'selected':'')+'>'+html(x)+'</option>').join('')}
function ingredientRow(item={name:'',qty:'',unit:'g'}){
 const ing=canonicalIngredient(item);
 const store=ing?ingredientStore(ing):(item.store==='grandfrais'?'grandfrais':ingredientDefaultStore(item.name,item.productId));
 const linked=ing?productById(ing.productId):productById(item.productId);
 return '<div class="ingredient-line">'+
 '<div class="ingredient-edit-row"><input class="ingredient-name" list="ingredientNames" placeholder="Ingrédient de la base" aria-label="Nom de l’ingrédient" value="'+html(ing?.name||item.name)+'">'+
 '<input class="ingredient-qty" type="number" min=".01" step="any" placeholder="Qté" aria-label="Quantité dans cette recette" value="'+html(item.qty)+'">'+
 '<select class="ingredient-unit" aria-label="Unité">'+selectOptions(units,item.unit)+'</select>'+
 '<button type="button" class="icon-btn" aria-label="Retirer cet ingrédient" data-action="remove-ingredient">×</button></div><div class="ingredient-suggestions"></div>'+
 '<div class="ingredient-store-row"><label>Ajouter dans Produits :</label><select class="ingredient-store" aria-label="Magasin habituel de cet ingrédient" '+(ing?'disabled':'')+'>'+
 '<option value="carrefour" '+(store==='carrefour'?'selected':'')+'>🛒 Carrefour</option>'+
 '<option value="grandfrais" '+(store==='grandfrais'?'selected':'')+'>🥬 Grand Frais</option></select></div>'+
 '<p class="ingredient-link-note">'+(store==='grandfrais'?'Grand Frais : aucune fiche produit nécessaire.':
  linked?'Produit Carrefour : '+html(linked.name)+(linked.packAmount?' · '+html(quantity(linked.packAmount,linked.packUnit))+'/paquet':' · contenu du paquet à préciser'):
  'Aucun produit Carrefour lié : tu pourras l’associer dans la base.')+'</p></div>'
}
function recipeEditor(id,draft=null){
 const old=recipeById(id),r=old||draft,title=old?'Modifier le plat':draft?'Dupliquer un plat':'Ajouter un plat',ingredients=r?.ingredients?.length?r.ingredients:[{name:'',qty:'',unit:'g'}];
 pendingRecipeDraftImage=!old&&draft?draft.image||'':'';
 let body='<form id="recipeForm" data-id="'+(old?.id||'')+'">'+
 '<div class="field"><label for="recipeName">Nom du plat</label><input required maxlength="90" id="recipeName" placeholder="Ex. Poulet au curry" value="'+html(r?.name||'')+'"></div>'+
 '<div class="row" style="align-items:start;gap:11px"><div class="field grow"><label for="recipeCategory">Type de plat</label><select id="recipeCategory">'+selectOptions(Object.keys(icons),r?.category||'Autre')+'</select></div>'+
 '<div class="field" style="width:115px"><label for="recipePeople">Portions de base</label><input id="recipePeople" type="number" min="1" max="30" required value="'+(r?.people||4)+'"></div></div>'+
 '<div class="field"><label for="recipePhoto">Photo (facultatif)</label><div class="image-input"><input id="recipePhoto" type="file" accept="image/*"><div class="helper">Photo conservée sur ce téléphone. Format allégé automatiquement.</div></div></div>'+
 '<div class="row between" style="margin:15px 0 8px"><h3>Ingrédients</h3></div>'+
 '<div class="note ingredient-auto-note">✓ Chaque ingrédient sera automatiquement enregistré dans <strong>Produits → Carrefour ou Grand Frais</strong> lorsque tu enregistreras le plat. Si son nom existe déjà, sa fiche sera réutilisée, sans doublon.</div>'+
 '<datalist id="ingredientNames">'+(state.ingredientCatalog||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(x=>'<option value="'+html(x.name)+'"></option>').join('')+'</datalist>'+
 '<div class="ingredient-favorites"><span class="helper">Ingrédients fréquents :</span>'+
 frequentIngredients().map(i=>'<button type="button" class="ingredient-favorite" data-action="favorite-ingredient" data-id="'+html(i.id)+'">＋ '+html(i.name)+'</button>').join('')+'</div>'+
 '<div id="ingredientRows">'+ingredients.map(ingredientRow).join('')+'</div>'+
 '<button id="addIngredientBottom" type="button" class="btn secondary wide ingredient-add-bottom" data-action="add-ingredient">＋ Ajouter un ingrédient</button>'+
 '<div class="divider"></div><button class="btn wide" type="submit">✓ Enregistrer le plat</button></form>';
 if(old)body+='<button class="btn danger wide" style="margin-top:10px" data-action="delete-recipe" data-id="'+old.id+'">Supprimer ce plat</button>';
 showModal(title,body)
}
function pickMeal(index){
 const meal=getWeek().meals[index],dishes=mealDishes(meal),leftovers=mealLeftovers(meal),extraDefault=dishes.length?1:4;
 let out='';
 if(leftovers.length){
  out+='<div class="section-head"><h3>Restes prévus pour ce repas</h3></div>';
  leftovers.forEach((left,n)=>{
   const r=recipeById(left.recipeId),source=Number.isInteger(left.fromIndex)?' · préparé '+days[Math.floor(left.fromIndex/2)]+' '+(left.fromIndex%2?'soir':'midi'):'';
   out+='<div class="meal-dish"><div class="grow"><strong>🍱 '+html(r?.name||'Restes')+'</strong><div class="helper">'+left.people+' portion'+(left.people>1?'s':'')+html(source)+' · sans courses supplémentaires</div></div><button class="btn tiny secondary" data-action="remove-leftover" data-index="'+index+'" data-leftover="'+n+'">Retirer</button></div>'
  })
 }
 if(dishes.length){
  out+='<div class="section-head"><h3>Plats prévus pour ce repas</h3><span class="pill">'+dishes.length+' plat'+(dishes.length>1?'s':'')+'</span></div>';
  dishes.forEach((d,n)=>{
   const r=recipeById(d.recipeId);
   const here=portionsEatenHere(d,dishes),remaining=sourceBudget(getWeek(),index,d.recipeId)-usedLeftovers(getWeek(),index,d.recipeId);
   out+='<div class="meal-dish"><div class="grow"><strong>'+html(r?.name||'Plat supprimé')+'</strong><label class="helper" for="dishPortions'+n+'">Portions préparées (pour les courses)</label><input id="dishPortions'+n+'" class="meal-dish-qty" data-dish-qty="'+n+'" type="number" min="1" max="30" value="'+d.people+'">'+
   '<div class="meal-portions-explainer">'+here+' mangée'+(here>1?'s':'')+' ici · '+Math.max(0,d.people-here)+' reste'+(d.people-here>1?'s':'')+' au total'+
   (d.people>here?' · '+Math.max(0,remaining)+' encore disponible'+(remaining>1?'s':''):'')+'</div></div><div class="meal-dish-actions"><button class="btn tiny secondary" data-action="save-dish-portions" data-index="'+index+'" data-dish="'+n+'">✓ Modifier</button><button class="btn tiny ghost" data-action="remove-dish" data-index="'+index+'" data-dish="'+n+'">Retirer</button></div></div>'
  })
 }
 out+='<div class="field"><label for="mealPeople">'+(dishes.length?'Portions à préparer pour le plat supplémentaire':'Combien de portions veux-tu préparer ?')+'</label>'+
 '<input type="number" id="mealPeople" min="1" max="30" value="'+extraDefault+'">'+
 '<div class="helper">Exemple : 4 portions préparées = 2 mangées à ce repas + 2 restes à placer le jour de ton choix. Pour un repas à deux sans restes, choisis 2. Si vous mangez chacun un plat différent, choisis 1 portion par plat.</div></div>';
 out+='<div class="section-head"><h3>'+ (dishes.length?'Ajouter un autre plat':'Choisir un plat')+'</h3></div>';
 out+='<div class="recipe-picker"><button class="picker-item" data-action="choose-leftovers" data-index="'+index+'"><span class="emoji">🍱</span><span class="grow"><strong>Placer des restes ici</strong><small>Choisis leur plat d’origine et le nombre de portions, même plusieurs jours après</small></span><span class="end">＋</span></button>';
 state.recipes.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr')).forEach(r=>{
  if(dishes.some(d=>d.recipeId===r.id))return;
  out+='<button class="picker-item" data-action="choose-recipe" data-id="'+r.id+'" data-index="'+index+'"><span class="emoji">'+html(icons[r.category]||'🍽️')+'</span><span class="grow"><strong>'+html(r.name)+'</strong><small>'+r.ingredients.length+' ingrédients · recette de base pour '+r.people+' portions</small></span><span class="end">＋</span></button>'
 });
 out+='</div>';
 if(!state.recipes.length)out+='<div class="note" style="margin-top:10px">Ajoute d’abord tes plats au catalogue, puis retrouve-les ici.</div>';
 if(meal)out+='<div class="meal-transfer-actions">'+
 '<button class="btn secondary" data-action="move-copy-meal" data-mode="copy" data-index="'+index+'" '+(!dishes.length?'disabled':'')+'>⧉ Copier</button>'+
 '<button class="btn secondary" data-action="move-copy-meal" data-mode="move" data-index="'+index+'">↔ Déplacer</button></div>'+
 '<button class="btn secondary wide" style="margin-top:12px" data-action="remove-meal" data-index="'+index+'">Vider ce repas</button>';
 showModal(days[Math.floor(index/2)]+' '+(index%2?'soir':'midi'),out)
}
function extraModal(){let out='<form id="extraForm"><div class="field"><label for="extraName">Produit</label><input id="extraName" maxlength="80" placeholder="Ex. papier toilette, baume à lèvres…" required></div><div class="row" style="align-items:start"><div class="field grow"><label for="extraQty">Quantité</label><input id="extraQty" type="number" min=".01" step="any" value="1" required></div><div class="field grow"><label for="extraUnit">Unité</label><select id="extraUnit">'+selectOptions(units,'paquet')+'</select></div></div><label class="row" style="font-size:13px;margin:5px 0 19px"><input type="checkbox" id="extraFavorite" checked> Mémoriser dans mes favoris</label><button class="btn wide" type="submit">＋ Ajouter aux courses</button></form>';showModal('Ajouter un produit',out)}
function settingsModal(){
 let out='<div class="card soft"><strong>Sauvegarde automatique activée</strong><p class="subtext">Chaque modification est enregistrée immédiatement sur cet iPhone. Jusqu’à 10 points de restauration locaux sont conservés automatiquement (espacés d’environ 10 min).</p></div>';
 out+='<div class="section-head"><h3>Versions locales précédentes</h3><button class="btn tiny secondary" data-action="refresh-backups">Actualiser</button></div><div id="snapshotList" class="subtext">Chargement…</div>';
 out+='<div class="note" style="margin:13px 0">Important : ces sauvegardes restent sur ce téléphone. Effacer les données Safari ou perdre l’iPhone peut supprimer l’original et ses copies. Seul un export dans iCloud Drive protège contre cela.</div>';
 out+='<div class="section-head"><h3>Sauvegarde hors du téléphone</h3></div><p class="helper">Exporte régulièrement le JSON dans Fichiers → iCloud Drive : recettes, photos, produits, liens Carrefour, menus et favoris.</p><button class="btn wide" data-action="export-data">↓ Exporter vers Fichiers / iCloud</button>';
 out+='<div class="divider"></div><div class="field"><label for="importFile">Restaurer depuis un fichier JSON</label><input id="importFile" type="file" accept=".json,application/json"></div><div class="note">La restauration depuis un fichier remplace les données actuelles.</div>';
 out+='<div class="divider"></div><button class="btn danger wide" data-action="clear-all">Effacer toutes les données locales</button>';
 showModal('Sauvegardes et paramètres',out);refreshBackupList()
}
async function refreshBackupList(){
 const box=$('#snapshotList');if(!box)return;
 if(usingFallback){box.textContent='Navigateur en mode de secours : pas d’historique automatique. Utilise l’export JSON.';return}
 try{const rows=await readSnapshots();if(!$('#snapshotList'))return;
  $('#snapshotList').innerHTML=rows.length?rows.map(s=>'<div class="shopping-row"><div class="grow"><strong style="font-size:12px">'+html(s.label)+'</strong><div class="shopping-meta">'+new Date(s.time).toLocaleString('fr-FR')+'</div></div><button class="btn tiny secondary" data-action="restore-backup" data-id="'+s.id+'">Restaurer</button></div>').join(''):'Aucune version précédente pour le moment. Elles apparaissent au fil des modifications.';
 }catch(e){box.textContent='Impossible de lire les versions locales.'}
}
function peopleInput(){return Math.min(30,Math.max(1,Number($('#mealPeople')?.value)||1))}
function portionInputForDish(dish){
 const n=Number($('[data-dish-qty="'+dish+'"]')?.value);
 return Number.isInteger(n)&&n>0&&n<=30?n:null
}
// Compatibilité avec les anciennes recettes et les anciens restes.
function mealLeftovers(meal){
 if(meal?.type==='leftovers')return [{type:'leftovers',recipeId:meal.recipeId||null,fromIndex:Number.isInteger(meal.fromIndex)?meal.fromIndex:null,people:Number(meal.leftoverPortions)||2}];
 if(meal?.type==='multi'&&Array.isArray(meal.dishes))return meal.dishes.filter(x=>x?.type==='leftovers')
  .map(x=>({type:'leftovers',recipeId:x.recipeId||null,fromIndex:Number.isInteger(x.fromIndex)?x.fromIndex:null,people:Number(x.people)||2}));
 return []
}
function mealParts(meal){return [...mealDishes(meal),...mealLeftovers(meal)]}
function storeMealParts(w,index,parts){
 const valid=parts.filter(p=>p&&Number.isInteger(Number(p.people))&&Number(p.people)>=1&&Number(p.people)<=30);
 if(!valid.length){w.meals[index]=null;return}
 if(valid.length===1){
  const p=valid[0];
  if(p.type==='leftovers')w.meals[index]={type:'leftovers',recipeId:p.recipeId||undefined,fromIndex:Number.isInteger(p.fromIndex)?p.fromIndex:undefined,leftoverPortions:Number(p.people)};
  else w.meals[index]={type:'recipe',recipeId:p.recipeId,people:Number(p.people)}
 }else w.meals[index]={type:'multi',dishes:valid.map(p=>p.type==='leftovers'?{type:'leftovers',recipeId:p.recipeId||null,fromIndex:p.fromIndex,people:Number(p.people)}:{recipeId:p.recipeId,people:Number(p.people)})}
}
// « Préparées » = quantités cuisinées et achetées ; « ici » = portions mangées.
// Pour un plat de 4 personnes : 2 ici, 2 portions de restes à placer librement.
function portionsEatenHere(d,dishes){
 const prepared=Math.max(0,Number(d?.people)||0);
 return Math.min(prepared,prepared>=4?2:(dishes.length===1?2:1))
}
function sourceBudget(w,fromIndex,recipeId){
 const dishes=mealDishes(w.meals[fromIndex]);
 const d=dishes.find(x=>x.recipeId===recipeId);
 if(!d)return 0;
 return Math.max(0,d.people-portionsEatenHere(d,dishes))
}
function usedLeftovers(w,fromIndex,recipeId,exceptIndex=-1){
 let used=0;w.meals.forEach((m,i)=>{if(i!==exceptIndex)mealLeftovers(m).forEach(x=>{
  if(x.fromIndex===fromIndex&&x.recipeId===recipeId)used+=x.people
 })});return used
}
function availableLeftoverSources(w,targetIndex){
 const results=[];
 w.meals.forEach((m,i)=>{
  if(i>=targetIndex)return;
  mealDishes(m).forEach(d=>{
   const free=sourceBudget(w,i,d.recipeId)-usedLeftovers(w,i,d.recipeId);
   if(free>0&&recipeById(d.recipeId))results.push({sourceIndex:i,recipeId:d.recipeId,available:free})
  })
 });
 return results
}
function reconcileLeftovers(w,sourceIndex){
 const budget=new Map();
 mealDishes(w.meals[sourceIndex]).forEach(d=>budget.set(d.recipeId,sourceBudget(w,sourceIndex,d.recipeId)));
 for(let i=0;i<w.meals.length;i++){
  if(i===sourceIndex)continue;
  const parts=mealParts(w.meals[i]);
  if(!parts.some(p=>p.type==='leftovers'&&p.fromIndex===sourceIndex))continue;
  const next=[];
  for(const p of parts){
   if(p.type!=='leftovers'||p.fromIndex!==sourceIndex){next.push(p);continue}
   const free=i>sourceIndex?(budget.get(p.recipeId)||0):0;
   if(free<=0)continue;
   const granted=Math.min(p.people,free);budget.set(p.recipeId,free-granted);
   next.push({...p,people:granted})
  }
  storeMealParts(w,i,next)
 }
}
function clearMealWithPair(w,index){
 if(index<0||index>=w.meals.length)return;
 w.meals[index]=null;reconcileLeftovers(w,index)
}
// On efface seulement le calendrier, jamais les recettes, les produits,
// ni les ajouts manuels de courses. Les restes liés sont réconciliés.
function clearCalendarDay(w,day){
 if(!Number.isInteger(day)||day<0||day>6)return false;
 const first=day*2;
 if(!w.meals[first]&&!w.meals[first+1])return false;
 clearMealWithPair(w,first);
 clearMealWithPair(w,first+1);
 return true
}
function clearCalendarWeek(w){
 if(!w.meals.some(Boolean))return false;
 w.meals=Array(14).fill(null);
 return true
}
function moveCopyMeal(w,source,target,mode){
 if(!Number.isInteger(source)||!Number.isInteger(target)||source===target||source<0||target<0||source>=w.meals.length||target>=w.meals.length)return false;
 const original=w.meals[source];if(!original)return false;
 const parts=mealParts(original),dishes=mealDishes(original),leftovers=mealLeftovers(original);
 if(mode==='copy'&&!dishes.length)return false; // Les mêmes restes ne peuvent pas être consommés deux fois.
 if(mode==='copy'){
  clearMealWithPair(w,target);
  storeMealParts(w,target,dishes.map(x=>({...x})));
  return true
 }
 if(mode!=='move')return false;
 const moved=JSON.parse(JSON.stringify(original));
 clearMealWithPair(w,target);
 w.meals[source]=null;w.meals[target]=moved;
 // Les restes liés suivent le plat cuisiné qui change de jour.
 for(let i=0;i<w.meals.length;i++){
  if(i===target)continue;
  const parts=mealParts(w.meals[i]);let changed=false;
  for(const p of parts)if(p.type==='leftovers'&&p.fromIndex===source){p.fromIndex=target;changed=true}
  if(changed)storeMealParts(w,i,parts)
 }
 // Un reste ne peut pas précéder son plat d'origine.
 const retained=mealParts(w.meals[target]).filter(p=>p.type!=='leftovers'||p.fromIndex===null||p.fromIndex<target);
 if(retained.length!==mealParts(w.meals[target]).length)storeMealParts(w,target,retained);
 reconcileLeftovers(w,target);
 return true
}
function moveCopyMealModal(index,mode){
 const w=getWeek(),source=w.meals[index];if(!source)return;
 const dishes=mealDishes(source);
 if(mode==='copy'&&!dishes.length){toast('Les restes ne peuvent pas être copiés : utilise Déplacer.');return}
 let out='<p class="helper">'+(mode==='move'?'Déplacer les plats et leurs portions, en mettant à jour les restes liés.':'Copier les plats et leurs portions sans dupliquer les restes déjà consommés.')+' Choisis une case ci-dessous.</p><div class="meal-targets">';
 for(let i=0;i<14;i++)if(i!==index){
  out+='<button class="meal-target" data-action="apply-meal-transfer" data-index="'+index+'" data-target="'+i+'" data-mode="'+mode+'">'+
   html(days[Math.floor(i/2)])+' '+(i%2?'soir':'midi')+(w.meals[i]?' · occupé':' · libre')+'</button>'
 }
 out+='</div>';
 showModal(mode==='move'?'Déplacer ce repas':'Copier ce repas',out)
}
function setMealDishes(w,index,dishes){
 if(index<0||index>=w.meals.length)return;
 const clean=dishes.filter(d=>d&&recipeById(d.recipeId)&&Number.isInteger(Number(d.people))&&Number(d.people)>=1&&Number(d.people)<=30)
  .map(d=>({recipeId:d.recipeId,people:Number(d.people)}));
 storeMealParts(w,index,[...clean,...mealLeftovers(w.meals[index])]);
 reconcileLeftovers(w,index)
}
function selectRecipeForMeal(w,index,recipeId,portions){setMealDishes(w,index,[{recipeId,people:portions}])}
function addRecipeToMeal(w,index,recipeId,portions){
 if(!recipeById(recipeId))return false;
 const current=mealDishes(w.meals[index]);
 if(current.some(d=>d.recipeId===recipeId))return false;
 setMealDishes(w,index,[...current,{recipeId,people:portions}]);return true
}
function addLeftoversToMeal(w,targetIndex,sourceIndex,recipeId,portions){
 if(targetIndex<=sourceIndex||!recipeById(recipeId)||!Number.isInteger(portions)||portions<1)return false;
 const source=availableLeftoverSources(w,targetIndex).find(x=>x.sourceIndex===sourceIndex&&x.recipeId===recipeId);
 if(!source||portions>source.available)return false;
 storeMealParts(w,targetIndex,[...mealParts(w.meals[targetIndex]),{type:'leftovers',recipeId,fromIndex:sourceIndex,people:portions}]);
 return true
}
function pickLeftoverSource(index){
 const w=getWeek(),choices=availableLeftoverSources(w,index);
 let body='<p class="subtext">Choisis le plat préparé précédemment. Les restes se placeront uniquement dans ce repas, sans créer de nouvelles courses.</p>';
 if(choices.length){
  body+='<div class="field"><label for="leftoverPeople">Portions à manger ici</label><input type="number" id="leftoverPeople" min="1" max="30" value="'+Math.min(2,Math.max(...choices.map(x=>x.available)))+'"><div class="helper">Regarde la quantité disponible sous chaque plat.</div></div><div class="recipe-picker">';
  choices.forEach(x=>{
   const r=recipeById(x.recipeId);
   body+='<button class="picker-item" data-action="apply-leftovers" data-index="'+index+'" data-source="'+x.sourceIndex+'" data-id="'+html(x.recipeId)+'"><span class="emoji">🍱</span><span class="grow"><strong>'+html(r.name)+'</strong><small>Préparé '+html(days[Math.floor(x.sourceIndex/2)]+' '+(x.sourceIndex%2?'soir':'midi'))+' · '+x.available+' portion'+(x.available>1?'s':'')+' disponible'+(x.available>1?'s':'')+'</small></span><span class="end">＋</span></button>'
  });
  body+='</div>'
 }else body+='<div class="note">Aucun reste disponible avant ce repas. Prévois davantage de portions lors de la cuisson d’un plat (par exemple 4 pour deux personnes), puis choisis ici le jour où manger les restes.</div>';
 body+='<button class="btn secondary wide" style="margin-top:14px" data-action="pick-meal" data-index="'+index+'">← Retour au repas</button>';
 showModal('🍱 Choisir les restes',body)
}
function populate(mode){
 if(!state.recipes.length){toast('Ajoute d’abord quelques plats à ton catalogue.');currentTab='plats';render();return}
 const w=getWeek();
 if(mode==='generate'&&w.meals.some(Boolean)&&!confirm('Remplacer les 14 repas de cette semaine ?'))return;
 if(mode==='generate')w.meals=Array(14).fill(null);
 // Aucun repas n'est réservé automatiquement aux restes : le calendrier
 // laisse entièrement à l'utilisateur le choix de leur jour et de leur repas.
 const counts={},types={},history={};
 // Le générateur évite les plats récents, sans dépendance à une API ni aux données externes.
 [1,2,3].forEach((weeksAgo)=>{
  const old=state.weeks[offsetDate(currentWeek,-7*weeksAgo)];
  if(!old||!Array.isArray(old.meals))return;
  old.meals.forEach(m=>mealDishes(m).forEach(d=>{if(recipeById(d.recipeId))history[d.recipeId]=(history[d.recipeId]||0)+(weeksAgo===1?36:weeksAgo===2?16:7)}))
 });
 w.meals.forEach(m=>mealDishes(m).forEach(d=>{const r=recipeById(d.recipeId);if(!r)return;counts[r.id]=(counts[r.id]||0)+1;types[r.category||'Autre']=(types[r.category||'Autre']||0)+1}));
 const chosenByDay=day=>[w.meals[day*2],w.meals[day*2+1]].flatMap(mealDishes).map(d=>d.recipeId);
 for(let i=0;i<w.meals.length;i++){
  if(w.meals[i])continue;
  const day=Math.floor(i/2),previousDishes=i>0?mealDishes(w.meals[i-1]):[];
  const scored=state.recipes.map(r=>{
   const count=counts[r.id]||0,cat=r.category||'Autre',nearby=chosenByDay(day).includes(r.id),sameCategory=previousDishes.some(d=>recipeById(d.recipeId)?.category===cat);
   return {r,score:count*100+(history[r.id]||0)+(types[cat]||0)*5+(nearby?180:0)+(sameCategory?18:0)+Math.random()*7}
  }).sort((a,b)=>a.score-b.score);
  const selected=scored[0].r;
  counts[selected.id]=(counts[selected.id]||0)+1;
  types[selected.category||'Autre']=(types[selected.category||'Autre']||0)+1;
  // Un repas généré correspond à deux personnes, sans placement automatique de restes.
  selectRecipeForMeal(w,i,selected.id,2);
 }
 persist();render();toast(mode==='generate'?'Semaine variée générée !':'Les repas manquants sont complétés !')
}
async function compressImage(file){if(!file)return null;if(file.size>12*1024*1024)throw Error('Photo trop volumineuse (12 Mo maximum).');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Impossible de lire la photo.'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(Error('Photo non reconnue.'));img.onload=()=>{const max=640,scale=Math.min(1,max/Math.max(img.width,img.height)),can=document.createElement('canvas');can.width=Math.round(img.width*scale);can.height=Math.round(img.height*scale);can.getContext('2d').drawImage(img,0,0,can.width,can.height);resolve(can.toDataURL('image/jpeg',.76))};img.src=reader.result};reader.readAsDataURL(file)})}
async function saveRecipe(e){
 e.preventDefault();
 const form=e.target,name=$('#recipeName').value.trim(),people=Number($('#recipePeople').value),category=$('#recipeCategory').value;
 const rows=[...$('#ingredientRows').children].map(row=>({
  name:$('.ingredient-name',row).value.trim(),qty:Number($('.ingredient-qty',row).value),
  unit:$('.ingredient-unit',row).value,store:$('.ingredient-store',row).value
 }));
 if(!name||!Number.isFinite(people)||people<1||people>30){toast('Vérifie le nom et le nombre de portions.');return}
 if(!rows.length||rows.some(x=>!x.name||!Number.isFinite(x.qty)||x.qty<=0||!units.includes(x.unit)||!['carrefour','grandfrais'].includes(x.store))){
  toast('Chaque ingrédient doit avoir un nom, une quantité et un magasin.');return
 }
 for(const x of rows){
  if(ingredientByName(x.name))continue;
  const sim=ingredientSimilar(x.name);
  if(sim.length&&!confirm('« '+sim[0].name+' » existe déjà. Créer quand même « '+x.name+' » ? Appuie sur Annuler pour réutiliser la fiche existante.')){
   toast('Réutilise la fiche proposée pour éviter le doublon.');return
  }
 }
 const old=recipeById(form.dataset.id);let image=old?.image||pendingRecipeDraftImage||'';
 try{if($('#recipePhoto').files[0])image=await compressImage($('#recipePhoto').files[0])}catch(err){toast(err.message);return}
 // Ne modifier la base que lorsque toute la recette est validée.
 const ingredients=[],unique=new Map();
 for(const x of rows){
  let ing=ingredientByName(x.name);
  if(!ing)ing=makeIngredient(x.name,x.store,null);
  // La fiche partagée reste maître du magasin : aucune recette ne le change.
  if(!ing)return;
  const row={ingredientId:ing.id,name:ing.name,qty:x.qty,unit:x.unit,productId:ing.productId||null};
  const key=ing.id+'|'+converted(x.qty,x.unit)[1];
  const before=unique.get(key);
  if(before&&before.unit===row.unit){before.qty+=row.qty;continue}
  // Même ingrédient répété dans une recette : regrouper lorsque les unités coïncident.
  if(!before)unique.set(key,row);
  ingredients.push(row)
 }
 const recipe={id:old?.id||uid(),name,people,category,ingredients,image};
 if(old)state.recipes=state.recipes.map(x=>x.id===old.id?recipe:x);else state.recipes.push(recipe);
 persist();closeModal();pendingRecipeDraftImage='';render();toast(old?'Plat modifié !':'Plat ajouté et ingrédients enregistrés !')
}
function addExtra(e){e.preventDefault();const name=$('#extraName').value.trim(),qty=Number($('#extraQty').value),unit=$('#extraUnit').value;
  if(!name||!Number.isFinite(qty)||qty<=0){toast('Renseigne un produit et sa quantité.');return}
  const item={id:uid(),name,qty,unit};getWeek().extras.push(item);
  if($('#extraFavorite').checked){const old=state.staples.find(x=>norm(x.name)===norm(name));if(old)Object.assign(old,{name,qty,unit});else state.staples.push({...item})}
  persist();closeModal();render();toast('Produit ajouté aux courses !')
}
async function copyList(){const value=listText();if(!value){toast('Aucun produit à copier.');return}try{await navigator.clipboard.writeText(value);toast('Liste copiée !')}catch(err){showModal('Liste à copier','<p class="helper">Sélectionne le texte ci-dessous pour le copier :</p><textarea class="text-input" style="height:180px" readonly>'+html(value)+'</textarea>')}}
function exportData(){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mes-menus-drive-sauvegarde-'+localDate(new Date())+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Sauvegarde créée. Conserve le fichier !')}
async function importData(file){if(!file)return;try{if(file.size>25*1024*1024)throw Error('Fichier trop volumineux.');const raw=JSON.parse(await file.text());if(raw.schema!==1||!Array.isArray(raw.recipes)||!raw.weeks||typeof raw.weeks!=='object'||!Array.isArray(raw.staples))throw Error('Format de sauvegarde non reconnu.');
  if(!confirm('Remplacer les données actuelles par celles de ce fichier ?'))return;
  checkpoint('Avant import JSON');state={schema:1,recipes:raw.recipes,products:Array.isArray(raw.products)?raw.products:[],weeks:raw.weeks,staples:raw.staples,storePreferences:raw.storePreferences&&typeof raw.storePreferences==='object'&&!Array.isArray(raw.storePreferences)?raw.storePreferences:{},ingredientCatalog:Array.isArray(raw.ingredientCatalog)?raw.ingredientCatalog:[],settings:{people:2,...raw.settings}};normalizeIngredientCatalog();persist();closeModal();render();toast('Sauvegarde restaurée !')
}catch(err){toast(err.message||'Importation impossible.')}}
document.addEventListener('click',e=>{
 const summary=e.target.closest('summary');
 if(summary){
  const parent=summary.parentElement;
  if(parent?.matches('.catalog-independent'))independentProductsOpen=!parent.open;
  if(parent?.matches('.course-optional')){
   const name=parent.dataset.section;
   if(name){if(parent.open)courseOpenSections.delete(name);else courseOpenSections.add(name)}
  }
 }
 const tab=e.target.closest('[data-tab]');if(tab){currentTab=tab.dataset.tab;render();return}
  const a=e.target.closest('[data-action]');if(!a){if(e.target.matches('[data-overlay]'))closeModal();return}
  const mode=a.dataset.action,index=Number(a.dataset.index),w=getWeek(),id=a.dataset.id;
  if(mode==='close-modal')closeModal();
  else if(mode==='go-courses'){currentTab='courses';render()}
  else if(mode==='go-drive'){currentTab='drive';render()}
  else if(mode==='go-menus'){currentTab='menus';render()}
  else if(mode==='go-products'){currentTab='produits';render()}
  else if(mode==='fix-drive-item'){
   const x=shopping().find(i=>i.id===id);
   if(!x)return;
   if(x.productId){productEditor(x.productId);return}
   if(x.ingredientId){ingredientEditor(x.ingredientId);return}
   ingredientEditor(null,x.name)
  }
  else if(mode==='home-stock')homeStockModal(id);
  else if(mode==='stock-zero'||mode==='stock-all'){
   const x=shopping().find(i=>i.id===$('#homeStockItemId')?.value);if(!x)return;
   const unit=$('#homeStockUnit')?.value,field=$('#homeStockAmount');
   if(!field)return;
   field.value=mode==='stock-zero'?'0':String(Number(stockBaseToUnit(x,x.totalNeedAmount||0,unit).toFixed(3)));
   refreshStockPreview()
  }
  else if(mode==='save-home-stock'){
   const x=shopping().find(i=>i.id===id),field=$('#homeStockAmount'),unit=$('#homeStockUnit')?.value;
   const amount=field?.value===''?NaN:Number(field?.value),value=x?stockInputToBase(x,amount,unit):null;
   if(value===null||!Number.isFinite(value)){toast('Choisis une quantité positive et une unité compatible.');return}
   w.pantry[x.stockKey]=value;
   w.pantryUnits[x.stockKey]=unit;
   persist();closeModal();render(true);toast('Stock maison déduit des achats !')
  }
  else if(mode==='week-prev'||mode==='week-next'){currentWeek=offsetDate(currentWeek,mode==='week-prev'?-7:7);render()}
  else if(mode==='clear-day'){
   const day=Number(a.dataset.day);
   if(!Number.isInteger(day)||day<0||day>6||!w.meals[day*2]&&!w.meals[day*2+1])return;
   if(!confirm('Vider les repas du '+days[day]+' (midi et soir) ? Les éventuels restes liés à ces plats seront aussi retirés. Les recettes et les produits resteront enregistrés.'))return;
   checkpoint('Avant suppression des repas du '+days[day]);
   clearCalendarDay(w,day);persist();render(true);toast('Repas du '+days[day]+' retirés !')
  }
  else if(mode==='clear-week'){
   if(!w.meals.some(Boolean))return;
   if(!confirm('Vider les 14 repas de la semaine du '+niceDate(currentWeek)+' ? Tu conserveras toutes tes recettes, tes produits et tes autres ajouts de courses.'))return;
   checkpoint('Avant suppression des repas de toute la semaine');
   clearCalendarWeek(w);persist();render();toast('Calendrier de la semaine vidé !')
  }
  else if(mode==='pick-meal')pickMeal(index);
  else if(mode==='move-copy-meal')moveCopyMealModal(index,a.dataset.mode);
  else if(mode==='apply-meal-transfer'){
   const target=Number(a.dataset.target),action=a.dataset.mode;
   if(!Number.isInteger(target)||target<0||target>13||!w.meals[index])return;
   if(w.meals[target]&&!confirm('Le repas cible contient déjà des plats. Le remplacer ?'))return;
   if(action==='move'&&target>index){
    const earlier=w.meals.some((m,i)=>i>index&&i<=target&&mealLeftovers(m).some(x=>x.fromIndex===index));
    if(earlier&&!confirm('Des restes étaient prévus avant le nouveau jour de cuisson. Ils seront retirés du planning. Continuer ?'))return
   }
   if(!moveCopyMeal(w,index,target,action)){toast('Impossible de déplacer ou copier ce repas.');return}
   persist();closeModal();render();toast(action==='move'?'Repas déplacé !':'Repas copié !')
  }
  else if(mode==='add-recipe')recipeEditor(null);
  else if(mode==='edit-recipe')recipeEditor(id);
  else if(mode==='duplicate-recipe'){const r=recipeById(id);if(r)recipeEditor(null,{...r,id:null,name:r.name+' (variante)',ingredients:r.ingredients.map(x=>({...x}))})}
  else if(mode==='favorite-ingredient'){
   const ing=ingredientById(id);if(!ing)return;
   const rows=$('#ingredientRows'),all=[...(rows?.children||[])];
   if(all.some(x=>norm(x.querySelector('.ingredient-name')?.value)===norm(ing.name))){toast('Ingrédient déjà présent.');return}
   let row=all.find(x=>!x.querySelector('.ingredient-name')?.value.trim());
   if(!row){rows?.insertAdjacentHTML('beforeend',ingredientRow());row=rows?.lastElementChild}
   if(!row)return;
   row.querySelector('.ingredient-name').value=ing.name;
   row.querySelector('.ingredient-unit').value=preferredIngredientUnit(ing);
   refreshIngredientEntry(row);row.querySelector('.ingredient-qty')?.focus();
   $('#addIngredientBottom')?.scrollIntoView?.({behavior:'smooth',block:'nearest'})
  }
  else if(mode==='add-product')productEditor(null);
  else if(mode==='daily-example'){
   productEditor(null,{name:a.dataset.name||'',category:a.dataset.category||'Autres',
    brand:'',packaging:'',store:ingredientStoreTab,qty:1,unit:a.dataset.unit||'paquet',
    url:'',ean:'',packAmount:null,packUnit:null})
  }
  else if(mode==='ingredient-store-tab'){ingredientStoreTab=a.dataset.store==='grandfrais'?'grandfrais':'carrefour';render(true)}
  else if(mode==='add-catalog-ingredient')ingredientEditor(null);
  else if(mode==='add-ingredient-to-courses')addIngredientToCoursesModal(id);
  else if(mode==='save-ingredient-to-courses'){
   const ing=ingredientById(id),qty=Number($('#extraIngredientQty')?.value),unit=$('#extraIngredientUnit')?.value;
   if(!ing||!Number.isFinite(qty)||qty<=0||!units.includes(unit)){toast('Vérifie la quantité et l’unité.');return}
   w.extras.push({id:uid(),ingredientId:ing.id,productId:ing.productId||null,name:ing.name,qty,unit});
   persist();closeModal();currentTab='courses';render();toast(ing.name+' ajouté aux courses !')
  }
  else if(mode==='edit-ingredient')ingredientEditor(id);
  else if(mode==='new-linked-product'){
   const ing=ingredientById(id);if(!ing)return;
   productEditor(null,{name:ing.name,brand:'',packaging:'',category:'Autres',store:'carrefour',qty:1,unit:'paquet',url:'',ean:'',packAmount:null,packUnit:null},ing.id)
  }
  else if(mode==='open-carrefour-import')carrefourClipboardModal();
  else if(mode==='import-linked-product')carrefourClipboardModal(id);
  else if(mode==='link-imported-existing'){
   const ing=ingredientById(a.dataset.ingredient),p=productById(id);if(!ing||!p)return;
   ing.productId=p.id;ing.store='carrefour';
   state.recipes.forEach(r=>(r.ingredients||[]).forEach(x=>{if(x.ingredientId===ing.id)x.productId=p.id}));
   persist();closeModal();render();toast('Référence Carrefour associée à '+ing.name+' !')
  }
  else if(mode==='read-carrefour-clipboard')readCarrefourClipboard();
  else if(mode==='import-pasted-carrefour')importCopiedCarrefourProduct($('#carrefourPaste')?.value);
  else if(mode==='edit-product')productEditor(id);
  else if(mode==='add-catalog-product')addCatalogProduct(id);
  else if(mode==='filter-products'){productCategory=a.dataset.category;render(true)}
  else if(mode==='delete-product'){if(confirm('Supprimer ce produit du catalogue ? Les courses déjà saisies resteront.')){checkpoint('Avant suppression de produit');state.products=state.products.filter(x=>x.id!==id);state.recipes.forEach(r=>r.ingredients.forEach(i=>{if(i.productId===id)i.productId=null}));state.ingredientCatalog.forEach(i=>{if(i.productId===id)i.productId=null});persist();closeModal();render();toast('Produit supprimé du catalogue.')}}
  else if(mode==='add-ingredient'){
   const rows=$('#ingredientRows');if(!rows)return;
   rows.insertAdjacentHTML('beforeend',ingredientRow());
   $('#addIngredientBottom')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  }
  else if(mode==='remove-ingredient')a.closest('.ingredient-line')?.remove();
  else if(mode==='reuse-ingredient'){
   const ing=ingredientById(id),row=a.closest('.ingredient-line');if(!ing||!row)return;
   row.querySelector('.ingredient-name').value=ing.name;
   row.querySelector('.ingredient-unit').value=preferredIngredientUnit(ing);
   refreshIngredientEntry(row);row.querySelector('.ingredient-qty')?.focus()
  }
  else if(mode==='choose-recipe'){if(!addRecipeToMeal(w,index,id,peopleInput())){toast('Ce plat est déjà présent dans ce repas. Modifie plutôt ses portions.');return}persist();closeModal();render()}
  else if(mode==='choose-leftovers')pickLeftoverSource(index);
  else if(mode==='apply-leftovers'){
   const source=Number(a.dataset.source),qty=Number($('#leftoverPeople')?.value);
   if(!Number.isInteger(qty)||qty<1||qty>30){toast('Choisis entre 1 et 30 portions de restes.');return}
   if(!addLeftoversToMeal(w,index,source,id,qty)){toast('Cette quantité de restes n’est plus disponible.');pickLeftoverSource(index);return}
   persist();closeModal();render();toast('Restes placés au repas choisi !')
  }
  else if(mode==='remove-leftover'){
   const li=Number(a.dataset.leftover),parts=mealParts(w.meals[index]),left=mealLeftovers(w.meals[index]);
   if(!Number.isInteger(li)||!left[li])return;
   const removed=left[li];
   const at=parts.findIndex(p=>p.type==='leftovers'&&p.recipeId===removed.recipeId&&p.fromIndex===removed.fromIndex);
   if(at>=0)parts.splice(at,1);
   storeMealParts(w,index,parts);persist();closeModal();render();toast('Restes retirés de ce repas.')
  }
  else if(mode==='save-dish-portions'){
   const dishIndex=Number(a.dataset.dish),dishes=mealDishes(w.meals[index]),portions=portionInputForDish(dishIndex);
   if(!Number.isInteger(dishIndex)||!dishes[dishIndex]||portions===null){toast('Choisis entre 1 et 30 portions.');return}
   dishes[dishIndex].people=portions;setMealDishes(w,index,dishes);persist();closeModal();render();toast('Portions du plat enregistrées !')
  }
  else if(mode==='remove-dish'){
   const dishIndex=Number(a.dataset.dish),dishes=mealDishes(w.meals[index]);
   if(!Number.isInteger(dishIndex)||!dishes[dishIndex])return;
   dishes.splice(dishIndex,1);setMealDishes(w,index,dishes);persist();closeModal();render();toast('Plat retiré de ce repas.')
  }
  else if(mode==='remove-meal'){clearMealWithPair(w,index);persist();closeModal();render()}
  else if(mode==='generate-week')populate('generate');
  else if(mode==='complete-week')populate('complete');
  else if(mode==='repeat-week'){const prev=state.weeks[offsetDate(currentWeek,-7)];if(!prev?.meals?.some(Boolean)){toast('Aucun menu trouvé la semaine précédente.');return}if(w.meals.some(Boolean)&&!confirm('Remplacer les repas de cette semaine ?'))return;w.meals=JSON.parse(JSON.stringify(prev.meals));persist();render();toast('Menus de la semaine précédente repris !')}
  else if(mode==='add-extra')extraModal();
  else if(mode==='quick-staple'){const s=state.staples.find(x=>x.id===id);if(s){w.extras.push({id:uid(),name:s.name,qty:s.qty,unit:s.unit});persist();render();toast(s.name+' ajouté !')}}
  else if(mode==='delete-extra'){w.extras=w.extras.filter(x=>x.id!==id);persist();render()}
  else if(mode==='exclude'){if(!w.excluded.includes(id))w.excluded.push(id);persist();render(true)}
  else if(mode==='include'){w.excluded=w.excluded.filter(x=>x!==id);persist();render(true)}
  else if(mode==='copy-list')copyList();
  else if(mode==='copy-grand-frais')copyGrandFrais();
  else if(mode==='prepare-drive-transfer')driveListModal();
  else if(mode==='open-drive-in-safari')openDriveInSafari();
  else if(mode==='copy-drive-url')copyDriveUrl();
  else if(mode==='copy-drive-transfer')copyDriveTransfer();
  else if(mode==='delete-recipe'){if(confirm('Supprimer ce plat ? Il disparaîtra aussi des menus qui l’utilisent.')){checkpoint('Avant suppression de plat');state.recipes=state.recipes.filter(r=>r.id!==id);Object.values(state.weeks).forEach(week=>{
  if(!Array.isArray(week.meals))return;
  for(let i=0;i<week.meals.length;i++){
   const m=week.meals[i];
   if(m?.type==='leftovers'&&m.recipeId===id){week.meals[i]=null;continue}
   const parts=mealParts(m);
   if(parts.some(d=>d.recipeId===id)){
    storeMealParts(week,i,parts.filter(d=>d.recipeId!==id));
    reconcileLeftovers(week,i)
   }
  }
 });persist();closeModal();render();toast('Plat supprimé.')}}
  else if(mode==='export-data')exportData();
  else if(mode==='refresh-backups')refreshBackupList();
  else if(mode==='restore-backup')restoreSnapshot(id);
  else if(mode==='clear-all'){if(confirm('Effacer toutes les données actuelles ? Une copie locale sera conservée dans les versions précédentes.')){checkpoint('Avant effacement');state=baseState();persist();closeModal();render();toast('Données actuelles effacées.')}}
});
document.addEventListener('change',e=>{
 if(e.target.id==='homeStockUnit'){
  const x=shopping().find(i=>i.id===$('#homeStockItemId')?.value),field=$('#homeStockAmount'),oldUnit=e.target.dataset.previous;
  if(x&&field&&field.value!==''){
   const base=stockInputToBase(x,Number(field.value),oldUnit);
   if(base!==null)field.value=String(Number(stockBaseToUnit(x,base,e.target.value).toFixed(3)))
  }
  e.target.dataset.previous=e.target.value;refreshStockPreview()
 }else if(e.target.id==='homeStockAmount')refreshStockPreview();if(e.target.matches('.ingredient-name')){
 const match=ingredientByName(e.target.value),row=e.target.closest('.ingredient-line');
 const store=row?.querySelector('.ingredient-store');
 if(match&&store)store.value=ingredientStore(match);
 const linked=row?.querySelector('.ingredient-link-note');
 if(match&&linked){
  const p=productById(match.productId);
  linked.textContent=ingredientStore(match)==='grandfrais'?'Grand Frais : aucune fiche produit nécessaire.':p?'Produit Carrefour lié : '+p.name:'Pas encore de produit Carrefour lié (à associer dans la base).'
 }
 }else if(e.target.matches('[data-store-item]')){setShoppingStore(e.target.dataset.storeItem,e.target.value)}else if(e.target.matches('[data-check]')){const w=getWeek(),id=e.target.dataset.check;w.checked=e.target.checked?[...new Set([...w.checked,id])]:w.checked.filter(x=>x!==id);persist();render(true)}else if(e.target.id==='importFile')importData(e.target.files?.[0])});
document.addEventListener('input',e=>{if(e.target.id==='homeStockAmount')refreshStockPreview();if(e.target.matches?.('.ingredient-name'))refreshIngredientEntry(e.target.closest('.ingredient-line'));if(e.target.matches?.('.ingredient-unit'))e.target.closest('.ingredient-line').dataset.unitSelected='true';if(e.target.id==='recipeSearch'){search=e.target.value;const result=$('#recipeResults');if(result)result.innerHTML=recipeRows()}else if(e.target.id==='productSearch'){productSearch=e.target.value;if(productSearch.trim()){independentProductsOpen=true;const section=document.querySelector('.catalog-independent');if(section)section.open=true}const result=$('#productResults');if(result)result.innerHTML=productRows();const ings=$('#ingredientCatalogResults');if(ings)ings.innerHTML=ingredientRowsCatalogue()}});
document.addEventListener('submit',e=>{if(e.target.id==='recipeForm')saveRecipe(e);if(e.target.id==='ingredientCatalogForm')saveCatalogIngredient(e);if(e.target.id==='extraForm')addExtra(e);if(e.target.id==='productForm')saveProduct(e)});
window.addEventListener('hashchange',()=>importCarrefourProductFromHash());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('#settingsBtn').addEventListener('click',settingsModal);
(async function boot(){currentWeek=monday(new Date());try{db=await openDatabase();const stored=await readRecord();if(stored?.schema===1)state={...baseState(),...stored,products:Array.isArray(stored.products)?stored.products:[]}}catch(err){usingFallback=true;try{const raw=localStorage.getItem('menus-drive-backup');if(raw){const saved=JSON.parse(raw);state={...baseState(),...saved,products:Array.isArray(saved.products)?saved.products:[]}}}catch(e){}toast('Mode de sauvegarde local de secours activé.')}
  if(normalizeIngredientCatalog())persist();
  render();importCarrefourProductFromHash();if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
