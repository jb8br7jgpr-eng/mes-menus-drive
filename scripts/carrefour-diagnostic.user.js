// ==UserScript==
// @name         Menus & Drive — Diagnostic Carrefour (lecture seule)
// @namespace    https://github.com/jb8br7jgpr-eng/mes-menus-drive
// @version      0.7.0
// @description  Ouvre automatiquement la liste de courses transmise par l’app iPhone, sans modifier le panier.
// @match        https://www.carrefour.fr/*
// @match        https://carrefour.fr/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jb8br7jgpr-eng/mes-menus-drive/developpement-v1/scripts/carrefour-diagnostic.user.js
// @updateURL    https://raw.githubusercontent.com/jb8br7jgpr-eng/mes-menus-drive/developpement-v1/scripts/carrefour-diagnostic.user.js
// ==/UserScript==

(() => {
  'use strict';

  // Sécurité : requêtes GET Carrefour.fr uniquement sur clic pour rechercher les EAN.
  // Aucune requête d'écriture, aucun cookie/token/profil lu ou conservé,
  // aucun produit ajouté/supprimé du panier.
  if (!/^(www\.)?carrefour\.fr$/i.test(location.hostname)) return;
  if (document.getElementById('md-carrefour-diagnostic-root')) return;

  const APP_URL = 'https://jb8br7jgpr-eng.github.io/mes-menus-drive/';
  const productPage = () => location.pathname.startsWith('/p/');
  function extractProductInfo() {
    if (!productPage()) return null;
    const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const title = (document.querySelector('h1')?.textContent?.trim() || og).replace(/\s+(?:à|au)\s+prix\s+Carrefour.*$/i,'').slice(0,100).trim();
    let brand='', packaging='';
    for(const el of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0,16)) {
      try {
        const val=JSON.parse(el.textContent);
        function find(x,depth=0){
          if(!x||typeof x!=='object'||depth>5)return null;
          if(Array.isArray(x)){for(const y of x){const result=find(y,depth+1);if(result)return result}return null}
          const types=Array.isArray(x['@type'])?x['@type']:[x['@type']];
          if(types.some(t=>typeof t==='string'&&t.endsWith('Product')))return x;
          for(const key of ['@graph','mainEntity','itemListElement']){const result=find(x[key],depth+1);if(result)return result}
          return null;
        }
        const p=find(val);
        if(p){brand=typeof p.brand==='string'?p.brand:String(p.brand?.name||'');packaging=typeof p.size==='string'?p.size:'';break;}
      }catch(e){/* Données structurées facultatives */}
    }
    return {v:1,name:title,brand:brand.slice(0,80),packaging:packaging.slice(0,80),ean:extractProductEan()||'',url:location.origin+location.pathname};
  }
  function extractProductEan() {
    const match = location.pathname.match(/(?:^|[-/])(\d{13})(?=\/|$)/);
    return match ? match[1] : null;
  }

  function boot() {
    if (!document.body) return;
    if (document.getElementById('md-carrefour-diagnostic-root')) return;

    const host = document.createElement('div');
    host.id = 'md-carrefour-diagnostic-root';
    host.style.cssText = 'position:fixed;bottom:calc(95px + env(safe-area-inset-bottom));right:14px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;';
    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      *{box-sizing:border-box}
      button{font:inherit;cursor:pointer}
      .trigger{border:0;background:#245943;color:white;border-radius:14px;padding:12px 15px;font-size:13px;font-weight:750;box-shadow:0 8px 24px #0003}
      .panel{display:none;width:min(345px,calc(100vw - 28px));max-height:calc(100dvh - 175px);overflow-y:auto;overscroll-behavior:contain;background:#fff;color:#25382e;border:1px solid #dce8df;border-radius:18px;box-shadow:0 8px 30px #0003;padding:17px;margin-bottom:8px;font-size:13px;line-height:1.5}
      .panel.open{display:block}
      h2{font-size:17px;margin:0 0 12px;line-height:1.25}
      p{margin:8px 0}
      strong{font-weight:750}
      .green{color:#1d7e52}
      .light{background:#eef5ed;border-radius:11px;padding:10px;margin:10px 0}
      .close{background:#f0f4ef;border:1px solid #dce8df;border-radius:10px;padding:9px 12px;width:100%;font-weight:650;color:#245943;margin-top:10px}
      .muted{color:#66766c;font-size:12px}
      .data{overflow-wrap:anywhere}
      .import{background:#245943;color:white;border:0;border-radius:12px;width:100%;padding:12px;font-size:13px;font-weight:750;margin:9px 0}
      .minor{background:#edf3ee;color:#245943;border:1px solid #bcd5c3;border-radius:11px;width:100%;padding:11px;margin-top:8px;font-size:13px;font-weight:700}
      .listArea{width:100%;height:65px;border:1px solid #bfd4c4;border-radius:9px;padding:8px;font-size:12px;margin-top:8px}
      .line{padding:8px 0;border-bottom:1px solid #e4ece7;font-size:12px}
      .line strong{display:block;overflow-wrap:anywhere}
      .line small{display:block;color:#66766c;margin-top:2px}
      .greenTxt{color:#217947}.orangeTxt{color:#945900}
    `;

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Diagnostic Menus et Drive');
    const heading = document.createElement('h2');
    heading.textContent = '🧪 Diagnostic Menus & Drive';
    const status = document.createElement('p');
    const domain = document.createElement('p');
    const ean = document.createElement('p');
    const preview = document.createElement('p');
    preview.style.cssText='font-weight:700;overflow-wrap:anywhere';
    const importBtn = document.createElement('button');
    importBtn.type='button';importBtn.className='import';importBtn.textContent='📋 Copier pour mon appli';
    let importDraft=null;
    const manualCopy = document.createElement('textarea');
    manualCopy.readOnly=true;
    manualCopy.hidden=true;
    manualCopy.setAttribute('aria-label','Code du produit Carrefour à copier');
    manualCopy.style.cssText='width:100%;min-height:85px;border:1px solid #bfd4c4;border-radius:8px;padding:8px;font-size:12px;margin:7px 0;resize:none';
    const listBtn = document.createElement('button');
    listBtn.type='button';listBtn.className='minor';listBtn.textContent='📋 Coller mes codes-barres (secours)';
    const pasteField = document.createElement('textarea');
    pasteField.className='listArea';pasteField.hidden=true;
    pasteField.placeholder='Si Safari refuse le collage automatique : appui long ici → Coller';
    pasteField.setAttribute('aria-label','Coller des codes-barres et leurs quantités');
    const pasteConfirm = document.createElement('button');
    pasteConfirm.type='button';pasteConfirm.className='minor';pasteConfirm.hidden=true;
    pasteConfirm.textContent='Vérifier la liste collée';
    const listStatus = document.createElement('p');
    listStatus.className='muted';listStatus.setAttribute('aria-live','polite');
    const verifyBtn = document.createElement('button');
    verifyBtn.type='button';verifyBtn.className='minor';verifyBtn.hidden=true;
    verifyBtn.textContent='🔎 Vérifier mes références sur Carrefour';
    const lookupStatus = document.createElement('p');
    lookupStatus.className='muted';lookupStatus.setAttribute('aria-live','polite');
    const verifiedProducts = document.createElement('div');
    verifiedProducts.setAttribute('aria-label','Références retrouvées sur Carrefour');
    const listPreview = document.createElement('div');
    listPreview.setAttribute('aria-label','Aperçu de la liste sans modification du panier');
    let previewRows=[];
    const notice = document.createElement('div');
    notice.className = 'light';
    notice.innerHTML = '<strong>🔒 Lecture seule</strong><div class="muted">Aucune modification de panier. En cliquant sur « Vérifier mes références », des requêtes de consultation sont envoyées uniquement à Carrefour.fr.</div>';
    const shop = document.createElement('p');
    shop.className = 'muted';
    shop.textContent = 'Vérifie toi-même dans l’interface Carrefour que le Drive actif est bien École-Valentin : le diagnostic ne peut pas le certifier.';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = 'Fermer le diagnostic';
    panel.append(heading, status, domain, ean, preview, importBtn, manualCopy, listBtn, pasteField, pasteConfirm, listStatus, verifyBtn, lookupStatus, listPreview, verifiedProducts, notice, shop, close);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'trigger';
    trigger.textContent = productPage() ? '➕ Mes produits' : '🧪 Test Menus & Drive';
    trigger.setAttribute('aria-label', 'Afficher le diagnostic Carrefour');

    function refresh() {
      importDraft=extractProductInfo();
      heading.textContent=importDraft?'🛍️ Ajouter à Mes produits':'🧪 Diagnostic Menus & Drive';
      trigger.textContent=importDraft?'➕ Mes produits':'🧪 Test Menus & Drive';
      preview.textContent=importDraft?(importDraft.name||'Nom du produit introuvable'):'Sur une fiche produit Carrefour, tu pourras importer son nom et son lien.';
      importBtn.hidden=!importDraft;importBtn.disabled=!importDraft?.name;
      status.textContent = '✅ Extension active sur Carrefour.fr';
      status.className = 'green';
      domain.textContent = 'Site détecté : ' + location.hostname;
      domain.className = 'data';
      const code = extractProductEan();
      ean.textContent = code
        ? 'Code EAN détecté dans l’adresse de cette page : ' + code
        : 'Aucun code EAN produit trouvé dans cette adresse (normal sur la page d’accueil).';
      ean.className = 'data';
      // La liste reste accessible sur toutes les pages Carrefour, même sans fiche produit.
    }

    trigger.addEventListener('click', () => {
      refresh();
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) close.focus();
    });
    importBtn.addEventListener('click',async()=>{
      if(!importDraft||!importDraft.name||!productPage())return;
      const code='MD-CARREFOUR-V1:'+JSON.stringify(importDraft);
      if(code.length>5000){notice.textContent='Fiche trop longue à copier.';return}
      let success=false;
      try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);success=true}}
      catch(e){/* Autorisation presse-papiers refusée : tentative alternative. */}
      if(!success){
        manualCopy.value=code;
        manualCopy.hidden=false;
        manualCopy.focus();manualCopy.select();
        try{success=document.execCommand('copy')}catch(e){/* iOS peut demander un copier manuel. */}
      }
      if(success){
        manualCopy.hidden=true;
        notice.textContent='✅ Produit copié ! Ouvre maintenant ton icône Menus & Drive → Produits → Coller un produit Carrefour.';
      }else{
        notice.textContent='Appuie longtemps sur le texte sélectionné puis « Copier ». Ouvre ensuite ton icône Menus & Drive → Produits → Coller un produit Carrefour.';
      }
    });
    // Prévisualisation uniquement : ne fait aucun appel aux API Carrefour ni aucune action de panier.
    function validateTransfer(raw){
      const text=String(raw||'').trim();
      if(!text)throw Error('Aucun code-barres à lire.');
      if(text.length>60000)throw Error('Liste trop longue.');
      const sourceLines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      if(sourceLines.length>200)throw Error('Maximum 200 lignes.');
      const totals=new Map();
      for(const line of sourceLines){
        const match=line.match(/^(\d{13})[\s;,]+([1-9]\d{0,2})$/);
        if(!match)throw Error('Format attendu : 13 chiffres puis la quantité, par exemple 3270190010000 2.');
        const ean=match[1],qty=Number(match[2]),total=(totals.get(ean)||0)+qty;
        if(total>999)throw Error('Quantité trop grande pour '+ean+'.');
        totals.set(ean,total);
      }
      return {rows:[...totals].map(([ean,qty])=>({ean,qty})).sort((a,b)=>a.ean.localeCompare(b.ean))};
    }
    function renderPreview(data){
      previewRows=data.rows;
      listPreview.replaceChildren();
      verifiedProducts.replaceChildren();
      lookupStatus.textContent='';
      verifyBtn.hidden=!data.rows.length;
      verifyBtn.disabled=false;
      listStatus.textContent=data.rows.length+' référence'+(data.rows.length!==1?'s':'')+' transférée'+(data.rows.length!==1?'s':'')+' (code-barres + quantité).';
      const note=document.createElement('p');
      note.className='muted';
      note.textContent='Ces codes ne sont pas encore vérifiés dans le catalogue Carrefour. Aucun panier modifié.';
      listPreview.append(note);
      for(const item of data.rows){
        const line=document.createElement('div');line.className='line';
        const headline=document.createElement('strong');
        headline.textContent=item.ean;
        headline.className='greenTxt';
        const extra=document.createElement('small');
        extra.textContent='Quantité : '+item.qty;
        line.append(headline,extra);
        listPreview.append(line);
      }
      const safe=document.createElement('p');safe.className='light';
      safe.textContent='🔒 Mode aperçu : aucun article ajouté au panier. Vérifie ton Drive d’École-Valentin directement sur Carrefour.fr.';
      listPreview.append(safe);
      pasteField.hidden=true;pasteConfirm.hidden=true;
    }
    function parseAndShow(raw){
      try{renderPreview(validateTransfer(raw));return true}
      catch(e){listStatus.textContent='⚠️ '+String(e.message||'Liste non reconnue');listPreview.replaceChildren();verifiedProducts.replaceChildren();verifyBtn.hidden=true;return false}
    }
    // Protocole de test : lecture seule. Les API Carrefour ci-dessous sont non officielles,
    // sujettes à changement et l'utilisateur doit sélectionner son magasin sur Carrefour.fr.
    async function carrefourRead(path){
      const response=await fetch(path,{
        method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{'X-Requested-With':'XMLHttpRequest'}
      });
      if(!response.ok)throw Error('Réponse Carrefour : '+response.status);
      if(!(response.headers.get('content-type')||'').includes('json'))throw Error('Format de réponse Carrefour inattendu');
      return response.json()
    }
    function getSelectedStoreName(serviceId){
      try{
        const p=window.__INITIAL_STATE__?.pinia?.offline?.offlineStore;
        if(p&&p.basketServiceId===serviceId&&!p.isVirtual&&typeof p.name==='string')
          return p.name.slice(0,85);
      }catch(e){/* Le site peut changer sa structure interne. */}
      return '';
    }
    function resolveProduct(data,ean,serviceId){
      const products=Array.isArray(data?.data?.products)?data.data.products:[];
      const match=products.find(p=>String(p?.attributes?.ean||'')===ean);
      if(!match)return {ean,status:'Référence introuvable',detail:'Aucun produit correspondant exactement à ce code.'};
      const a=match.attributes||{},offers=a.offers?.[ean],local=serviceId&&offers?offers[serviceId]?.attributes:null;
      const info={ean,name:String(a.title||a.shortTitle||'Produit sans nom').slice(0,130),brand:String(a.brand||'').slice(0,70),status:'Référence reconnue'};
      if(local){
        const price=Number(local.price?.price);
        if(Number.isFinite(price)&&price>=0)info.price=price.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
        const av=local.availability;
        if(av?.purchasable===false||av?.stopped===true||av?.suspended===true)info.status='Offre indiquée indisponible';
        else info.status='Offre trouvée — disponibilité à confirmer';
      }else info.status='Référence trouvée — offre du Drive non confirmée';
      return info;
    }
    function drawVerified(item,qty){
      const el=document.createElement('div');el.className='line';
      const title=document.createElement('strong');title.textContent=item.name||item.ean;
      const details=document.createElement('small');
      details.textContent='EAN : '+item.ean+' · Quantité : '+qty+
        (item.brand?' · '+item.brand:'')+(item.price?' · Prix indicatif : '+item.price:'');
      const state=document.createElement('small');state.textContent=item.status+(item.detail?' — '+item.detail:'');
      state.className=/introuvable|indisponible|non confirmée/i.test(item.status)?'orangeTxt':'muted';
      el.append(title,details,state);
      verifiedProducts.append(el)
    }
    verifyBtn.addEventListener('click',async()=>{
      if(!previewRows.length)return;
      verifyBtn.disabled=true;verifiedProducts.replaceChildren();
      lookupStatus.textContent='Recherche du Drive actif (lecture seule)…';
      let serviceId='',storeName='';
      try{
        // Le panier est seulement lu pour connaître le Drive actif.
        // Aucun élément, ID client ou montant du panier n'est affiché ni enregistré.
        const response=await carrefourRead('/api/cart');
        const cart=response?.cart;
        if(!cart||!cart.facilityServiceId||String(cart.storeRef)==='6'||String(cart.facilityServiceId).endsWith('-6')){
          lookupStatus.textContent='⚠️ Aucun Drive actif détecté. Sélectionne École-Valentin sur Carrefour.fr puis recommence.';
          verifyBtn.disabled=false;return
        }
        serviceId=String(cart.facilityServiceId);
        storeName=getSelectedStoreName(serviceId);
      }catch(e){
        lookupStatus.textContent='⚠️ Impossible de vérifier le Drive actif : '+String(e.message||'erreur Carrefour');
        verifyBtn.disabled=false;return
      }
      const isExpected=/valentin/i.test(storeName);
      lookupStatus.textContent=storeName
        ?'Drive actif : '+storeName+(isExpected?' ✓':' — ⚠️ Vérifie que tu as choisi École-Valentin')
        :'⚠️ Drive actif détecté, mais nom du magasin non lisible : vérifie École-Valentin manuellement.';
      const limit=Math.min(previewRows.length,15);
      for(let i=0;i<limit;i++){
        const item=previewRows[i];
        try{
          const result=await carrefourRead('/autocomplete?q='+encodeURIComponent(item.ean)+'&maxResults=12&productCard=true');
          drawVerified(resolveProduct(result,item.ean,serviceId),item.qty);
        }catch(e){
          drawVerified({ean:item.ean,status:'Vérification impossible',detail:'Carrefour ne répond pas pour ce code.'},item.qty)
        }
        // Limite volontaire du nombre de vérifications pour ménager le site et la batterie.
        if(i<limit-1)await new Promise(resolve=>setTimeout(resolve,350));
      }
      if(previewRows.length>limit)lookupStatus.textContent+=' · '+limit+' premières références vérifiées sur '+previewRows.length+'.';
      verifyBtn.disabled=false;
    });
    listBtn.addEventListener('click',async()=>{
      pasteField.hidden=false;pasteConfirm.hidden=false;
      listStatus.textContent='Autorise le collage des codes-barres depuis Menus & Drive si Safari le demande.';
      if(!navigator.clipboard?.readText){pasteField.focus();return}
      try{const value=await navigator.clipboard.readText();if(!parseAndShow(value)){pasteField.focus()}}
      catch(e){listStatus.textContent='Collage automatique indisponible : appui long dans le champ, puis « Coller ».';pasteField.focus()}
    });
    pasteConfirm.addEventListener('click',()=>parseAndShow(pasteField.value));
    // Transfert direct depuis la PWA iPhone par fragment URL : aucune dépendance
    // aux permissions du presse-papiers et aucune donnée personnelle envoyée.
    function loadDirectTransfer(){
      const prefix='#md-drive-v1=';
      if(!location.hash.startsWith(prefix))return false;
      const encoded=location.hash.slice(prefix.length);
      let imported=false;
      try{
        if(encoded.length>4000)throw Error('Lien trop long');
        const text=decodeURIComponent(encoded);
        imported=parseAndShow(text);
      }catch(e){
        listStatus.textContent='⚠️ Lien Menus & Drive non reconnu : '+String(e.message||'erreur');
      }
      // Effacer le fragment après consommation pour éviter de réimporter en rechargeant.
      try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
      panel.classList.add('open');
      if(imported){
        listStatus.textContent+=' · Import direct depuis ton appli ✓';
        // Le clic "Ouvrir Carrefour avec ma liste" autorise la simple lecture de
        // références, sans aucun ajout ni modification du vrai panier.
        verifyBtn.click();
      }else{
        lookupStatus.textContent='Tu peux utiliser le bouton « Coller mes codes-barres (secours) ».';
      }
      return true;
    }
    window.addEventListener('hashchange',loadDirectTransfer);
    close.addEventListener('click', () => {
      panel.classList.remove('open');
      trigger.focus();
    });
    root.append(style, panel, trigger);
    // Carrefour peut changer de fiche sans recharger la page.
    let prevPath=location.pathname;
    const observer=new MutationObserver(()=>{
      if(prevPath!==location.pathname){prevPath=location.pathname;refresh();}
    });
    observer.observe(document.body,{childList:true,subtree:true});
    document.body.appendChild(host);
    loadDirectTransfer();
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
