
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const categories=['Autres','Épicerie','Fruits et légumes','Viandes et poissons','Produits frais','Hygiène','Maison'];
const icons={'Pâtes':'🍝','Viande':'🥩','Poisson':'🐟','Légumes':'🥦','Salade':'🥗','Dessert':'🍰','Autre':'🍽️'};
const units=['g','kg','ml','cl','l','pièce','paquet','boîte','rouleau','bouteille','pot','sachet'];
const contentUnits=['g','kg','ml','cl','l','pièce','rouleau'];
const baseState=()=>({schema:1,recipes:[],products:[],weeks:{},staples:[],settings:{people:2}});
let state=baseState(), currentTab='menus', currentWeek='', search='', productSearch='', productCategory='Toutes', db=null, usingFallback=false;
const app=$('#app'), modalRoot=$('#modalRoot');
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
function localDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function monday(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()-((x.getDay()+6)%7));return localDate(x)}
function offsetDate(s,n){const d=parseDate(s);d.setDate(d.getDate()+n);return localDate(d)}
function niceDate(s){return parseDate(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
function getWeek(key=currentWeek){if(!state.weeks[key])state.weeks[key]={meals:Array(14).fill(null),extras:[],checked:[],excluded:[]};const w=state.weeks[key];if(!Array.isArray(w.meals))w.meals=Array(14).fill(null);if(!Array.isArray(w.extras))w.extras=[];if(!Array.isArray(w.checked))w.checked=[];if(!Array.isArray(w.excluded))w.excluded=[];return w}
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
  persist();await saveQueue;closeModal();render();toast('Version précédente restaurée !')
 }catch(e){toast('Restauration impossible. Exporte ton JSON si nécessaire.')}
}
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2800)}
function render(preserveScroll=false){const scrollY=window.scrollY;document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.tab===currentTab;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});app.innerHTML=({menus:renderMenus,plats:renderPlats,produits:renderProduits,courses:renderCourses,drive:renderDrive}[currentTab])();window.scrollTo({top:preserveScroll?scrollY:0,behavior:'auto'})}
function pageHeading(kicker,title,sub){return '<div class="eyebrow">'+kicker+'</div><h1>'+title+'</h1><p class="muted" style="font-size:13px">'+sub+'</p>'}
function recipeById(id){return state.recipes.find(r=>r.id===id)}
function emptyView(emoji,title,description,button){return '<div class="empty"><div class="illustration">'+emoji+'</div><strong>'+title+'</strong><p>'+description+'</p>'+button+'</div>'}
function mealCard(meal,i){let label='',classes='',note='';
  if(meal?.type==='leftovers'){label='Restes';classes=' filled';note='Aucune course supplémentaire'}
  else if(meal?.type==='recipe'){const r=recipeById(meal.recipeId);label=r?r.name:'Plat supprimé';classes=' filled';note=(meal.people||2)+' pers.'}
  return '<button class="meal-tile'+classes+'" data-action="pick-meal" data-index="'+i+'" aria-label="'+html(days[Math.floor(i/2)])+' '+(i%2?'soir':'midi')+', '+html(label||'ajouter un plat')+'"><span class="meal-type">'+(i%2?'Soir':'Midi')+(note?' · '+html(note):'')+'</span>'+(label?'<strong>'+html(label)+'</strong>':'<span class="add">＋ Ajouter un plat</span>')+'</button>';
}
function renderMenus(){const w=getWeek(),count=w.meals.filter(Boolean).length, last=offsetDate(currentWeek,6),isThis=currentWeek===monday(new Date());
  let out='<div class="hero"><div class="eyebrow">Planificateur hebdomadaire</div><h1>Qu’est-ce qu’on mange cette semaine ?</h1><p>Deux repas par jour, zéro prise de tête. Choisis tes plats ou laisse l’application te proposer des idées.</p><button class="btn cream" data-action="complete-week">✦ Compléter ma semaine</button></div>';
  out+='<div class="section-head"><h2>Votre semaine</h2><span class="pill">'+count+' / 14 repas</span></div>';
  out+='<div class="week-control"><button class="icon-btn" aria-label="Semaine précédente" data-action="week-prev">‹</button><div class="week-label">Du '+niceDate(currentWeek)+' au '+niceDate(last)+(isThis?'<small>Cette semaine</small>':'<small>Planning personnalisé</small>')+'</div><button class="icon-btn" aria-label="Semaine suivante" data-action="week-next">›</button></div>';
  out+='<div class="status-bar"><span style="width:'+(count/14*100)+'%"></span></div>';
  out+='<div class="meal-list">';
  for(let day=0;day<7;day++){const d=offsetDate(currentWeek,day);out+='<section class="day-card"><div class="day-title">'+days[day]+' <small>'+niceDate(d)+'</small></div><div class="day-meals">'+mealCard(w.meals[day*2],day*2)+mealCard(w.meals[day*2+1],day*2+1)+'</div></section>'}
  out+='</div><div class="toolbar"><button class="btn secondary" data-action="generate-week">✦ Générer les 14 repas</button><button class="btn secondary" data-action="repeat-week">↻ Reprendre la semaine passée</button></div>';
  out+='<button class="btn wide" data-action="go-courses">Voir ma liste de courses →</button>';
  out+='<p class="helper">Le générateur favorise les plats peu servis récemment et varie les catégories, dans la limite de ton catalogue. Tu peux garder certains repas manuels et compléter uniquement les cases vides. « Restes » ne crée pas d’ingrédients supplémentaires : prévois davantage de portions lors de la cuisson précédente.</p>';
  return out
}
function recipeImg(r){return '<div class="recipe-img">'+(r.image?'<img src="'+html(r.image)+'" alt="">':html(icons[r.category]||'🍽️'))+'</div>'}
function recipeRows(){let list=state.recipes.filter(r=>r.name.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));return list.map(r=>'<div class="recipe-card">'+recipeImg(r)+'<div class="grow"><h3>'+html(r.name)+'</h3><p>'+r.ingredients.length+' ingrédient'+(r.ingredients.length>1?'s':'')+' · '+r.people+' personnes</p><span class="pill gray">'+html(r.category||'Autre')+'</span></div><div class="recipe-actions"><button class="icon-btn" data-action="edit-recipe" data-id="'+r.id+'" aria-label="Modifier '+html(r.name)+'">✎</button></div></div>').join('')||emptyView('🍲','Aucun plat trouvé',search?'Essaie un autre nom.':'Commence par ajouter votre premier plat.','<button class="btn" data-action="add-recipe">＋ Ajouter un plat</button>')}
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
  if(already){
    showModal('Produit déjà enregistré','<div class="note"><strong>'+html(already.name)+'</strong><p>Cette référence Carrefour est déjà dans ton catalogue. Tu peux modifier sa fiche au lieu de créer un doublon.</p></div><button class="btn wide" data-action="edit-product" data-id="'+html(already.id)+'">Modifier la fiche existante</button>');
  }else{
    productEditor(null,{name,brand,packaging,category:'Autres',qty:1,unit:'paquet',url,ean,packAmount:null,packUnit:null});
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
function carrefourClipboardModal(){
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
function productBadge(p){return (p.category==='Hygiène'?'🧴':p.category==='Maison'?'🧻':p.category==='Fruits et légumes'?'🥕':p.category==='Produits frais'?'🥛':p.category==='Viandes et poissons'?'🥩':'🛍️')}
function productRows(){
  const list=(state.products||[]).filter(p=>(productCategory==='Toutes'||p.category===productCategory)&&[p.name,p.brand,p.packaging].some(v=>norm(v).includes(norm(productSearch)))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  if(!list.length)return emptyView('🛍️',state.products.length?'Aucun produit trouvé':'Votre catalogue est vide',state.products.length?'Essaie une autre recherche.':'Ajoute vos articles préférés pour les retrouver en un clic.','<button class="btn" data-action="add-product">＋ Ajouter un produit</button>');
  return list.map(p=>'<article class="product-card"><div class="product-symbol" aria-hidden="true">'+productBadge(p)+'</div><div class="grow"><h3>'+html(p.name)+'</h3><p>'+html([p.brand,p.packaging].filter(Boolean).join(' · ')||quantity(p.qty,p.unit))+'</p><span class="pill gray">'+html(p.category)+'</span>'+(p.url?'<div class="product-link"><a href="'+html(p.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Voir '+html(p.name)+' sur Carrefour">Voir sur Carrefour ↗</a></div>':'')+'</div><div class="product-actions"><button class="icon-btn" data-action="edit-product" data-id="'+html(p.id)+'" aria-label="Modifier '+html(p.name)+'">✎</button><button class="btn tiny" data-action="add-catalog-product" data-id="'+html(p.id)+'" aria-label="Ajouter '+html(p.name)+' aux courses">＋ Courses</button></div></article>').join('')
}
function renderProduits(){
  let out=pageHeading('Vos achats habituels','Mes produits','Enregistre vos références préférées pour les ajouter aux courses sans les rechercher à chaque fois.');
  out+='<div class="toolbar"><button class="btn wide" data-action="add-product">＋ Ajouter un produit</button></div>';
  out+='<div class="card soft"><strong>📲 Importer depuis Carrefour</strong><p class="subtext">Sur Carrefour.fr, touche le bouton vert « ➕ Mes produits » puis « Copier pour mon appli ». Reviens ici par ton icône iPhone et colle le produit.</p><button class="btn wide" data-action="open-carrefour-import" style="margin:8px 0">📋 Coller un produit Carrefour</button><a href="https://www.carrefour.fr/" target="_blank" rel="noopener noreferrer" class="btn secondary wide">Ouvrir Carrefour.fr ↗</a></div>';
  out+='<div class="field"><input class="text-input" id="productSearch" value="'+html(productSearch)+'" placeholder="⌕ Rechercher un produit ou une marque…" aria-label="Rechercher un produit"></div>';
  out+='<div class="chip-row" aria-label="Filtrer par catégorie">'+['Toutes',...productCategories].map(x=>'<button class="chip'+(productCategory===x?' active':'')+'" data-action="filter-products" data-category="'+html(x)+'">'+html(x)+'</button>').join('')+'</div>';
  out+='<div class="section-head"><h2>Votre catalogue</h2><span class="pill">'+state.products.length+' produit'+(state.products.length===1?'':'s')+'</span></div><div id="productResults">'+productRows()+'</div>';
  out+='<p class="helper">Les liens Carrefour sont facultatifs. Ils ouvrent la fiche produit, sans ajouter automatiquement l’article au panier.</p>';
  return out
}
function productEditor(id,draft=null){
 const p=productById(id)||draft,title=id?'Modifier le produit':draft?'Importer depuis Carrefour':'Ajouter un produit';
 const body='<form id="productForm" data-id="'+html(p?.id||'')+'"><div class="field"><label for="productName">Nom du produit</label><input id="productName" maxlength="100" required placeholder="Ex. Papier toilette" value="'+html(p?.name||'')+'"></div><div class="field"><label for="productBrand">Marque (facultatif)</label><input id="productBrand" maxlength="80" placeholder="Ex. Lotus" value="'+html(p?.brand||'')+'"></div><div class="field"><label for="productPackaging">Conditionnement (facultatif)</label><input id="productPackaging" maxlength="80" placeholder="Ex. Lot de 12 rouleaux" value="'+html(p?.packaging||'')+'"></div><div class="field"><label for="productCategory">Catégorie</label><select id="productCategory">'+selectOptions(productCategories,p?.category||'Autres')+'</select></div><div class="row" style="align-items:start"><div class="field grow"><label for="productQty">Quantité habituelle à acheter</label><input id="productQty" type="number" min=".01" step="any" required value="'+(p?.qty||1)+'"></div><div class="field grow"><label for="productUnit">Unité</label><select id="productUnit">'+selectOptions(units,p?.unit||'paquet')+'</select></div></div><div class="card soft" style="margin:12px 0"><strong>Contenu d’un emballage (facultatif)</strong><p class="helper">Exemple : un paquet contenant 1 kg de riz, pour calculer le nombre de paquets à acheter.</p><div class="row" style="align-items:start"><div class="field grow"><label for="packAmount">Contenu</label><input id="packAmount" type="number" min=".01" step="any" placeholder="Ex. 1" value="'+html(p?.packAmount??'')+'"></div><div class="field grow"><label for="packUnit">Unité de contenu</label><select id="packUnit">'+selectOptions(contentUnits,p?.packUnit||'g')+'</select></div></div></div><div class="field"><label for="productEan">Code-barres EAN-13 (facultatif)</label><input id="productEan" maxlength="13" inputmode="numeric" pattern="[0-9]{13}" placeholder="13 chiffres" value="'+html(p?.ean||'')+'"><div class="helper">Code de la fiche Carrefour, à vérifier sur l’emballage si nécessaire.</div></div><div class="field"><label for="productUrl">Lien du produit Carrefour (facultatif)</label><input id="productUrl" type="url" maxlength="2000" autocomplete="off" placeholder="https://www.carrefour.fr/p/..." value="'+html(p?.url||'')+'"><div class="helper">Colle le lien exact depuis Carrefour.fr. Aucune connexion à ton compte n’est demandée.</div></div><button class="btn wide" type="submit">✓ Enregistrer le produit</button></form>';
 showModal(title,(draft&&!id?'<div class="note" style="margin-bottom:12px"><strong>Import depuis Carrefour.fr</strong><p>Vérifie le nom, la marque, la quantité et le conditionnement avant d’enregistrer. Aucun panier n’est modifié.</p></div>':'')+body+(id?'<button class="btn danger wide" style="margin-top:10px" data-action="delete-product" data-id="'+html(id)+'">Supprimer ce produit</button>':''))
}
function saveProduct(e){
 e.preventDefault();
 const id=e.target.dataset.id,old=productById(id),name=$('#productName').value.trim(),brand=$('#productBrand').value.trim(),packaging=$('#productPackaging').value.trim(),category=$('#productCategory').value,qty=Number($('#productQty').value),unit=$('#productUnit').value,packValue=$('#packAmount').value.trim(),packAmount=packValue?Number(packValue):null,packUnit=$('#packUnit').value,ean=$('#productEan').value.trim();
 if(!name||!Number.isFinite(qty)||qty<=0||!units.includes(unit)||!productCategories.includes(category)||(packAmount!==null&&(!Number.isFinite(packAmount)||packAmount<=0||!contentUnits.includes(packUnit)))||(ean&&!/^\d{13}$/.test(ean))){toast('Vérifie le nom, le code EAN et les quantités.');return}
 let url='';try{url=validCarrefourLink($('#productUrl').value)}catch(e){toast(e.message);return}
 const product={id:old?.id||uid(),name,brand,packaging,category,qty,unit,url,ean,packAmount,packUnit:packAmount?packUnit:null};
 if(old)state.products=state.products.map(p=>p.id===old.id?product:p);else state.products.push(product);
 persist();closeModal();render();toast(old?'Produit modifié !':'Produit ajouté au catalogue !')
}
function addCatalogProduct(id){
 const p=productById(id);if(!p)return;
 getWeek().extras.push({id:uid(),name:p.name,qty:p.qty,unit:p.unit,productId:p.id,fromCatalogue:true});
 persist();render(true);toast(p.name+' ajouté aux courses !')
}

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase()}
function converted(q,u){q=Number(q)||0;return u==='kg'?[q*1000,'g']:u==='l'?[q*1000,'ml']:u==='cl'?[q*10,'ml']:[q,u||'pièce']}
function quantity(q,u){const n=Math.round((Number(q)+Number.EPSILON)*100)/100;const s=n.toLocaleString('fr-FR',{maximumFractionDigits:2});const plurals={'pièce':'pièces','paquet':'paquets','boîte':'boîtes','bouteille':'bouteilles','pot':'pots','sachet':'sachets','rouleau':'rouleaux'};return s+' '+(n>1&&plurals[u]?plurals[u]:(u||'pièce'))}
function groupFor(name,unit){const s=norm(name);if(/pq|papier toilette|lessive|savon|shampo|dentifrice|baume|douche|mouchoir|deodorant/.test(s))return 'Hygiène et maison';if(/poulet|boeuf|bœuf|jambon|poisson|saumon|crevette|porc|steak|dinde/.test(s))return 'Viandes et poissons';if(/tomate|oignon|carotte|salade|pomme|banane|courgette|ail|citron|poivron|brocoli|champignon/.test(s))return 'Fruits et légumes';if(/lait|crème|creme|yaourt|fromage|beurre|mozzarella|oeuf|œuf/.test(s))return 'Produits frais';return 'Épicerie et divers'}
function productGroup(p){if(['Hygiène','Maison'].includes(p?.category))return 'Hygiène et maison';if(p?.category==='Viandes et poissons')return 'Viandes et poissons';if(p?.category==='Fruits et légumes')return 'Fruits et légumes';if(p?.category==='Produits frais')return 'Produits frais';return 'Épicerie et divers'}
function shopping(){
 const w=getWeek(),map=new Map(),packs=new Map();
 function plain(name,qty,unit,source,productId){const clean=String(name||'').trim();if(!clean)return;const [v,u]=converted(qty,unit);if(!(v>0))return;const p=productById(productId);const key=(p?'produit:'+p.id:norm(clean))+'|'+u;if(!map.has(key))map.set(key,{id:key,name:clean,qty:0,unit:u,source:[],productId:p?.id||null});const item=map.get(key);item.qty+=v;if(!item.source.includes(source))item.source.push(source)}
 function add(name,qty,unit,source,productId,fromCatalogue=false){
  const p=productById(productId),[val,u]=converted(qty,unit),[size,packUnit]=p&&p.packAmount>0?converted(p.packAmount,p.packUnit):[0,''];
  const compatible=p&&size>0&&packUnit===u,catalogue=p&&fromCatalogue&&unit===p.unit;
  if(compatible||catalogue){if(!packs.has(p.id))packs.set(p.id,{p,needed:0,needUnit:packUnit||u,size,manualPacks:0,source:[]});const item=packs.get(p.id);if(catalogue)item.manualPacks+=Number(qty);else item.needed+=val;if(!item.source.includes(source))item.source.push(source);return}
  plain(name,qty,unit,source,productId)
 }
 w.meals.forEach(m=>{if(!m||m.type!=='recipe')return;const recipe=recipeById(m.recipeId);if(!recipe)return;const factor=(Number(m.people)||2)/Math.max(1,Number(recipe.people)||2);recipe.ingredients.forEach(x=>add(x.name,Number(x.qty)*factor,x.unit,'Recettes',x.productId))});
 w.extras.forEach(x=>add(x.name,x.qty,x.unit,'Ajout manuel',x.productId,Boolean(x.fromCatalogue)));
 for(const [productId,item] of packs){const p=item.p,n=item.needed>0&&item.size>0?Math.ceil(item.needed/item.size-1e-9):0,count=n+item.manualPacks;if(count<=0)continue;const id='produit:'+productId+'|achat';map.set(id,{id,name:p.name,qty:count,unit:p.unit||'paquet',source:item.source,productId,needed:item.needed>0?quantity(item.needed,item.needUnit):'',packageDescription:p.packaging||((p.packAmount>0)?quantity(p.packAmount,p.packUnit):'')})}
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(x=>({...x,category:x.productId?productGroup(productById(x.productId)):groupFor(x.name,x.unit),checked:w.checked.includes(x.id),excluded:w.excluded.includes(x.id)}))
}
function shoppingRow(x){return '<div class="shopping-row'+(x.checked?' checked':'')+'"><input class="check" type="checkbox" data-check="'+html(x.id)+'" '+(x.checked?'checked':'')+' aria-label="Cocher '+html(x.name)+'"><div class="grow"><div class="shopping-name">'+html(x.name)+'</div><div class="shopping-meta">'+(x.needed?'Besoin : '+html(x.needed)+' · ':'')+html(x.source.join(' + '))+(productById(x.productId)?' · '+html([productById(x.productId).brand,productById(x.productId).packaging].filter(Boolean).join(' · ')):'')+(productById(x.productId)?.url?' · <a href="'+html(productById(x.productId).url)+'" target="_blank" rel="noopener noreferrer">Carrefour ↗</a>':'')+'</div></div><div class="shopping-qty">'+html(quantity(x.qty,x.unit))+'</div><button class="icon-btn" data-action="exclude" data-id="'+html(x.id)+'" aria-label="Déjà à la maison : '+html(x.name)+'" title="Déjà à la maison">−</button></div>'}
function renderCourses(){const items=shopping(),available=items.filter(x=>!x.excluded),excluded=items.filter(x=>x.excluded),left=available.filter(x=>!x.checked), w=getWeek();
  let out=pageHeading('Liste intelligente','Mes courses','Tous les ingrédients de la semaine, plus vos produits du quotidien.');
  out+='<div class="card soft"><div class="row between"><div><div class="eyebrow">À acheter</div><h1 style="margin:3px 0 0">'+left.length+' <span style="font-size:15px;color:#6f8174">produit'+(left.length!==1?'s':'')+'</span></h1></div><span style="font-size:35px">🛒</span></div><p class="subtext">Les quantités sont additionnées automatiquement entre les recettes.</p></div>';
  out+='<div class="toolbar"><button class="btn" data-action="add-extra">＋ Ajouter un produit</button><button class="btn secondary" data-action="copy-list">⧉ Copier la liste</button></div><button class="btn ghost" data-action="go-products">Voir mes produits habituels →</button>';
  if(state.staples.length){out+='<div class="section-head"><h2>Vos favoris</h2><span class="subtext">Appuyer pour ajouter</span></div><div class="favorites">'+state.staples.map(x=>'<button class="favorite-chip" data-action="quick-staple" data-id="'+x.id+'">＋ '+html(x.name)+'</button>').join('')+'</div>'}
  if(available.length){const order=['Fruits et légumes','Viandes et poissons','Produits frais','Épicerie et divers','Hygiène et maison'];order.forEach(cat=>{const relevant=available.filter(x=>x.category===cat);if(relevant.length){out+='<div class="shopping-category">'+cat+'</div>'+relevant.map(shoppingRow).join('')}})}
  else out+=emptyView('🧺','Votre liste est vide','Planifie des repas ou ajoute des produits du quotidien.','<button class="btn" data-action="add-extra">＋ Ajouter un produit</button>');
  if(excluded.length)out+='<div class="section-head"><h2>Déjà à la maison</h2><span class="pill gray">'+excluded.length+'</span></div>'+excluded.map(x=>'<div class="shopping-row"><span class="grow muted">'+html(x.name)+' · '+html(quantity(x.qty,x.unit))+'</span><button class="btn tiny secondary" data-action="include" data-id="'+html(x.id)+'">Réintégrer</button></div>').join('');
  if(w.extras.length)out+='<div class="section-head"><h2>Produits ajoutés cette semaine</h2></div>'+w.extras.map(x=>'<div class="shopping-row"><span class="grow shopping-name">'+html(x.name)+'</span><span class="shopping-qty">'+html(quantity(x.qty,x.unit))+'</span><button class="icon-btn" data-action="delete-extra" data-id="'+x.id+'" aria-label="Supprimer">×</button></div>').join('');
  out+='<div class="toolbar"><button class="btn wide" data-action="go-drive">Préparer mon Drive →</button></div>';
  return out
}
function listText(){return shopping().filter(x=>!x.checked&&!x.excluded).map(x=>x.name+' — '+quantity(x.qty,x.unit)+(x.needed?' (besoin : '+x.needed+')':'')).join('\n')}
function renderDrive(){const items=shopping().filter(x=>!x.checked&&!x.excluded);let out=pageHeading('Carrefour École-Valentin','Mon Drive','Votre sélection de courses, prête à être utilisée sur Carrefour.');
  out+='<div class="card"><div class="drive-illustration">🛍️</div><div class="row between"><h2>'+items.length+' produit'+(items.length!==1?'s':'')+' à acheter</h2><span class="pill">Drive favori</span></div><p class="subtext">Carrefour Besançon-Valentin · École-Valentin</p><div class="divider"></div><div class="steps"><div class="step"><div class="step-num">1</div><div><strong>Prépare tes menus</strong><p>Les ingrédients sont additionnés et les produits habituels ajoutés.</p></div></div><div class="step"><div class="step-num">2</div><div><strong>Copie ta liste</strong><p>La liste inclut uniquement les produits restant à acheter.</p></div></div><div class="step"><div class="step-num">3</div><div><strong>Ouvre Carrefour Drive</strong><p>Recherche et ajoute les produits, puis valide ton panier sur le site Carrefour.</p></div></div></div><button class="btn wide" data-action="copy-list" '+(!items.length?'disabled':'')+'>⧉ Copier ma liste de courses</button><a class="btn secondary wide" style="margin-top:9px" href="https://www.carrefour.fr/" target="_blank" rel="noopener noreferrer">Ouvrir Carrefour ↗</a></div>';
  out+='<div class="note" style="margin-top:16px"><strong>Panier automatique : prochaine étape.</strong> Cette première version ne consulte pas les stocks du Drive et ne se connecte pas à ton compte Carrefour. Nous testerons cette intégration à part avant de l’annoncer fonctionnelle.</div>';
  out+='<div class="section-head"><h2>Votre panier à préparer</h2></div>';
  out+=items.length?'<div class="card">'+items.map(x=>'<div class="row between" style="padding:8px 0;border-bottom:1px solid #eef1ea"><span class="grow" style="font-size:13px">'+html(x.name)+(x.needed?' <small class="muted">(besoin : '+html(x.needed)+')</small>':'')+(productById(x.productId)?.url?'<br><a href="'+html(productById(x.productId).url)+'" target="_blank" rel="noopener noreferrer" style="font-size:11px">Voir le produit Carrefour ↗</a>':'')+'</span><strong style="font-size:12px">'+html(quantity(x.qty,x.unit))+'</strong></div>').join('')+'</div>':emptyView('🥬','Rien à commander','Remplis ton planning et ta liste de courses.','<button class="btn" data-action="go-menus">Créer mes menus</button>');
  return out
}
function showModal(title,body){modalRoot.innerHTML='<div class="modal-overlay" data-overlay="true"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><h2 id="modalTitle">'+title+'</h2><button class="close-btn" aria-label="Fermer" data-action="close-modal">×</button></div>'+body+'</div></div>';const first=modalRoot.querySelector('input,button');if(first)first.focus()}
function closeModal(){modalRoot.innerHTML=''}
function selectOptions(values,value){return values.map(x=>'<option value="'+html(x)+'" '+(x===value?'selected':'')+'>'+html(x)+'</option>').join('')}
function ingredientRow(item={name:'',qty:'',unit:'g'}){const choices='<option value="">Aucune référence liée</option>'+state.products.map(p=>'<option value="'+html(p.id)+'" '+(item.productId===p.id?'selected':'')+'>'+html([p.name,p.brand,p.packaging].filter(Boolean).join(' · '))+'</option>').join('');return '<div class="ingredient-line"><div class="ingredient-edit-row"><input class="ingredient-name" placeholder="Ingrédient" aria-label="Ingrédient" value="'+html(item.name)+'"><input class="ingredient-qty" type="number" min=".01" step="any" placeholder="Qté" aria-label="Quantité" value="'+html(item.qty)+'"><select class="ingredient-unit" aria-label="Unité">'+selectOptions(units,item.unit)+'</select><button type="button" class="icon-btn" aria-label="Retirer cet ingrédient" data-action="remove-ingredient">×</button></div><select class="ingredient-product" aria-label="Produit Carrefour associé">'+choices+'</select></div>'}
function recipeEditor(id){const r=recipeById(id),title=r?'Modifier le plat':'Ajouter un plat',ingredients=r?.ingredients?.length?r.ingredients:[{name:'',qty:'',unit:'g'}];let body='<form id="recipeForm" data-id="'+(r?.id||'')+'"><div class="field"><label for="recipeName">Nom du plat</label><input required maxlength="90" id="recipeName" placeholder="Ex. Poulet au curry" value="'+html(r?.name||'')+'"></div><div class="row" style="align-items:start;gap:11px"><div class="field grow"><label for="recipeCategory">Type de plat</label><select id="recipeCategory">'+selectOptions(Object.keys(icons),r?.category||'Autre')+'</select></div><div class="field" style="width:115px"><label for="recipePeople">Pour combien ?</label><input id="recipePeople" type="number" min="1" max="30" required value="'+(r?.people||2)+'"></div></div><div class="field"><label for="recipePhoto">Photo (facultatif)</label><div class="image-input"><input id="recipePhoto" type="file" accept="image/*"><div class="helper">Photo conservée sur ce téléphone. Format allégé automatiquement.</div></div></div><div class="row between" style="margin:15px 0 8px"><h3>Ingrédients</h3><button type="button" class="btn secondary tiny" data-action="add-ingredient">＋ Ingrédient</button></div><div id="ingredientRows">'+ingredients.map(ingredientRow).join('')+'</div><div class="divider"></div><button class="btn wide" type="submit">✓ Enregistrer le plat</button></form>';
  if(r)body+='<button class="btn danger wide" style="margin-top:10px" data-action="delete-recipe" data-id="'+r.id+'">Supprimer ce plat</button>';
  showModal(title,body)
}
function pickMeal(index){const w=getWeek(),meal=w.meals[index],existing=meal?.type==='recipe'?recipeById(meal.recipeId):null,people=meal?.people||2;
  let out='<div class="field"><label for="mealPeople">Nombre de personnes</label><input type="number" id="mealPeople" min="1" max="30" value="'+people+'"></div>';
  if(existing)out+='<div class="card soft" style="margin-bottom:12px"><strong>'+html(existing.name)+'</strong><p class="subtext">Recette sélectionnée</p><button class="btn secondary tiny" data-action="update-people" data-index="'+index+'">Mettre à jour les portions</button></div>';
  out+='<div class="recipe-picker"><button class="picker-item" data-action="choose-leftovers" data-index="'+index+'"><span class="emoji">🍱</span><span class="grow"><strong>Restes d’un autre repas</strong><small>Ne rajoute aucun ingrédient aux courses</small></span><span class="end">＋</span></button>';
  state.recipes.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr')).forEach(r=>{out+='<button class="picker-item" data-action="choose-recipe" data-id="'+r.id+'" data-index="'+index+'"><span class="emoji">'+html(icons[r.category]||'🍽️')+'</span><span class="grow"><strong>'+html(r.name)+'</strong><small>'+r.ingredients.length+' ingrédients · base '+r.people+' pers.</small></span><span class="end">＋</span></button>'});
  out+='</div>';
  if(!state.recipes.length)out+='<div class="note" style="margin-top:10px">Ajoute d’abord tes plats au catalogue, puis retrouve-les ici.</div>';
  if(meal)out+='<button class="btn secondary wide" style="margin-top:12px" data-action="remove-meal" data-index="'+index+'">Vider ce repas</button>';
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
function peopleInput(){return Math.min(30,Math.max(1,Number($('#mealPeople')?.value)||2))}
function populate(mode){
 if(!state.recipes.length){toast('Ajoute d’abord quelques plats à ton catalogue.');currentTab='plats';render();return}
 const w=getWeek();
 if(mode==='generate'&&w.meals.some(Boolean)&&!confirm('Remplacer les 14 repas de cette semaine ?'))return;
 if(mode==='generate')w.meals=Array(14).fill(null);
 const counts={},types={},history={};
 // Le générateur évite les plats récents, sans dépendance à une API ni aux données externes.
 [1,2,3].forEach((weeksAgo)=>{
  const old=state.weeks[offsetDate(currentWeek,-7*weeksAgo)];
  if(!old||!Array.isArray(old.meals))return;
  old.meals.forEach(m=>{if(m?.type==='recipe'&&recipeById(m.recipeId))history[m.recipeId]=(history[m.recipeId]||0)+(weeksAgo===1?36:weeksAgo===2?16:7)})
 });
 w.meals.forEach(m=>{if(m?.type!=='recipe')return;const r=recipeById(m.recipeId);if(!r)return;counts[r.id]=(counts[r.id]||0)+1;types[r.category||'Autre']=(types[r.category||'Autre']||0)+1});
 const chosenByDay=day=>[w.meals[day*2],w.meals[day*2+1]].filter(m=>m?.type==='recipe').map(m=>m.recipeId);
 w.meals=w.meals.map((meal,i)=>{
  if(meal)return meal;
  const day=Math.floor(i/2),previous=i>0?w.meals[i-1]:null;
  const scored=state.recipes.map(r=>{
   const count=counts[r.id]||0,cat=r.category||'Autre',nearby=chosenByDay(day).includes(r.id),sameCategory=previous?.recipeId&&recipeById(previous.recipeId)?.category===cat;
   return {r,score:count*100+(history[r.id]||0)+(types[cat]||0)*5+(nearby?180:0)+(sameCategory?18:0)+Math.random()*7}
  }).sort((a,b)=>a.score-b.score);
  const selected=scored[0].r;counts[selected.id]=(counts[selected.id]||0)+1;const cat=selected.category||'Autre';types[cat]=(types[cat]||0)+1;
  // Affectation immédiate pour que la case du soir évite le repas du midi.
  const result={type:'recipe',recipeId:selected.id,people:state.settings.people||2};w.meals[i]=result;return result
 });
 persist();render();toast(mode==='generate'?'Semaine variée générée !':'Les repas manquants sont complétés !')
}
async function compressImage(file){if(!file)return null;if(file.size>12*1024*1024)throw Error('Photo trop volumineuse (12 Mo maximum).');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Impossible de lire la photo.'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(Error('Photo non reconnue.'));img.onload=()=>{const max=640,scale=Math.min(1,max/Math.max(img.width,img.height)),can=document.createElement('canvas');can.width=Math.round(img.width*scale);can.height=Math.round(img.height*scale);can.getContext('2d').drawImage(img,0,0,can.width,can.height);resolve(can.toDataURL('image/jpeg',.76))};img.src=reader.result};reader.readAsDataURL(file)})}
async function saveRecipe(e){e.preventDefault();const form=e.target,name=$('#recipeName').value.trim(),people=Number($('#recipePeople').value),category=$('#recipeCategory').value;const ingredients=[...$('#ingredientRows').children].map(row=>({name:$('.ingredient-name',row).value.trim(),qty:Number($('.ingredient-qty',row).value),unit:$('.ingredient-unit',row).value,productId:$('.ingredient-product',row).value||null}));
  if(!name||!Number.isFinite(people)||people<1||people>30){toast('Vérifie le nom et le nombre de personnes.');return}
  if(!ingredients.length||ingredients.some(x=>!x.name||!Number.isFinite(x.qty)||x.qty<=0)){toast('Chaque ingrédient doit avoir un nom et une quantité positive.');return}
  const old=recipeById(form.dataset.id);let image=old?.image||'';
  try{if($('#recipePhoto').files[0])image=await compressImage($('#recipePhoto').files[0])}catch(err){toast(err.message);return}
  const recipe={id:old?.id||uid(),name,people,category,ingredients,image};
  if(old)state.recipes=state.recipes.map(x=>x.id===old.id?recipe:x);else state.recipes.push(recipe);
  persist();closeModal();render();toast(old?'Plat modifié !':'Plat ajouté !')
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
  checkpoint('Avant import JSON');state={schema:1,recipes:raw.recipes,products:Array.isArray(raw.products)?raw.products:[],weeks:raw.weeks,staples:raw.staples,settings:{people:2,...raw.settings}};persist();closeModal();render();toast('Sauvegarde restaurée !')
}catch(err){toast(err.message||'Importation impossible.')}}
document.addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab){currentTab=tab.dataset.tab;render();return}
  const a=e.target.closest('[data-action]');if(!a){if(e.target.matches('[data-overlay]'))closeModal();return}
  const mode=a.dataset.action,index=Number(a.dataset.index),w=getWeek(),id=a.dataset.id;
  if(mode==='close-modal')closeModal();
  else if(mode==='go-courses'){currentTab='courses';render()}
  else if(mode==='go-drive'){currentTab='drive';render()}
  else if(mode==='go-menus'){currentTab='menus';render()}
  else if(mode==='go-products'){currentTab='produits';render()}
  else if(mode==='week-prev'||mode==='week-next'){currentWeek=offsetDate(currentWeek,mode==='week-prev'?-7:7);render()}
  else if(mode==='pick-meal')pickMeal(index);
  else if(mode==='add-recipe')recipeEditor(null);
  else if(mode==='edit-recipe')recipeEditor(id);
  else if(mode==='add-product')productEditor(null);
  else if(mode==='open-carrefour-import')carrefourClipboardModal();
  else if(mode==='read-carrefour-clipboard')readCarrefourClipboard();
  else if(mode==='import-pasted-carrefour')importCopiedCarrefourProduct($('#carrefourPaste')?.value);
  else if(mode==='edit-product')productEditor(id);
  else if(mode==='add-catalog-product')addCatalogProduct(id);
  else if(mode==='filter-products'){productCategory=a.dataset.category;render(true)}
  else if(mode==='delete-product'){if(confirm('Supprimer ce produit du catalogue ? Les courses déjà saisies resteront.')){checkpoint('Avant suppression de produit');state.products=state.products.filter(x=>x.id!==id);state.recipes.forEach(r=>r.ingredients.forEach(i=>{if(i.productId===id)i.productId=null}));persist();closeModal();render();toast('Produit supprimé du catalogue.')}}
  else if(mode==='add-ingredient')$('#ingredientRows').insertAdjacentHTML('beforeend',ingredientRow());
  else if(mode==='remove-ingredient')a.closest('.ingredient-line')?.remove();
  else if(mode==='choose-recipe'){w.meals[index]={type:'recipe',recipeId:id,people:peopleInput()};persist();closeModal();render()}
  else if(mode==='choose-leftovers'){w.meals[index]={type:'leftovers'};persist();closeModal();render()}
  else if(mode==='update-people'){if(w.meals[index]?.type==='recipe'){w.meals[index].people=peopleInput();persist();closeModal();render();toast('Portions mises à jour !')}}
  else if(mode==='remove-meal'){w.meals[index]=null;persist();closeModal();render()}
  else if(mode==='generate-week')populate('generate');
  else if(mode==='complete-week')populate('complete');
  else if(mode==='repeat-week'){const prev=state.weeks[offsetDate(currentWeek,-7)];if(!prev?.meals?.some(Boolean)){toast('Aucun menu trouvé la semaine précédente.');return}if(w.meals.some(Boolean)&&!confirm('Remplacer les repas de cette semaine ?'))return;w.meals=JSON.parse(JSON.stringify(prev.meals));persist();render();toast('Menus de la semaine précédente repris !')}
  else if(mode==='add-extra')extraModal();
  else if(mode==='quick-staple'){const s=state.staples.find(x=>x.id===id);if(s){w.extras.push({id:uid(),name:s.name,qty:s.qty,unit:s.unit});persist();render();toast(s.name+' ajouté !')}}
  else if(mode==='delete-extra'){w.extras=w.extras.filter(x=>x.id!==id);persist();render()}
  else if(mode==='exclude'){if(!w.excluded.includes(id))w.excluded.push(id);persist();render(true)}
  else if(mode==='include'){w.excluded=w.excluded.filter(x=>x!==id);persist();render(true)}
  else if(mode==='copy-list')copyList();
  else if(mode==='delete-recipe'){if(confirm('Supprimer ce plat ? Il disparaîtra aussi des menus qui l’utilisent.')){checkpoint('Avant suppression de plat');state.recipes=state.recipes.filter(r=>r.id!==id);Object.values(state.weeks).forEach(week=>{week.meals=week.meals.map(m=>m?.recipeId===id?null:m)});persist();closeModal();render();toast('Plat supprimé.')}}
  else if(mode==='export-data')exportData();
  else if(mode==='refresh-backups')refreshBackupList();
  else if(mode==='restore-backup')restoreSnapshot(id);
  else if(mode==='clear-all'){if(confirm('Effacer toutes les données actuelles ? Une copie locale sera conservée dans les versions précédentes.')){checkpoint('Avant effacement');state=baseState();persist();closeModal();render();toast('Données actuelles effacées.')}}
});
document.addEventListener('change',e=>{if(e.target.matches('[data-check]')){const w=getWeek(),id=e.target.dataset.check;w.checked=e.target.checked?[...new Set([...w.checked,id])]:w.checked.filter(x=>x!==id);persist();render(true)}else if(e.target.id==='importFile')importData(e.target.files?.[0])});
document.addEventListener('input',e=>{if(e.target.id==='recipeSearch'){search=e.target.value;const result=$('#recipeResults');if(result)result.innerHTML=recipeRows()}else if(e.target.id==='productSearch'){productSearch=e.target.value;const result=$('#productResults');if(result)result.innerHTML=productRows()}});
document.addEventListener('submit',e=>{if(e.target.id==='recipeForm')saveRecipe(e);if(e.target.id==='extraForm')addExtra(e);if(e.target.id==='productForm')saveProduct(e)});
window.addEventListener('hashchange',()=>importCarrefourProductFromHash());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('#settingsBtn').addEventListener('click',settingsModal);
(async function boot(){currentWeek=monday(new Date());try{db=await openDatabase();const stored=await readRecord();if(stored?.schema===1)state={...baseState(),...stored,products:Array.isArray(stored.products)?stored.products:[]}}catch(err){usingFallback=true;try{const raw=localStorage.getItem('menus-drive-backup');if(raw){const saved=JSON.parse(raw);state={...baseState(),...saved,products:Array.isArray(saved.products)?saved.products:[]}}}catch(e){}toast('Mode de sauvegarde local de secours activé.')}
  render();importCarrefourProductFromHash();if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
