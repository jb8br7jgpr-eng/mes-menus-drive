// ==UserScript==
// @name         Menus & Drive — Diagnostic Carrefour (lecture seule)
// @namespace    https://github.com/jb8br7jgpr-eng/mes-menus-drive
// @version      0.9.0
// @description  Constitue le panier Drive et présente un bilan clair des articles ajoutés, présents ou manquants. Aucun paiement.
// @match        https://www.carrefour.fr/*
// @match        https://carrefour.fr/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jb8br7jgpr-eng/mes-menus-drive/developpement-v1/scripts/carrefour-diagnostic.user.js
// @updateURL    https://raw.githubusercontent.com/jb8br7jgpr-eng/mes-menus-drive/developpement-v1/scripts/carrefour-diagnostic.user.js
// ==/UserScript==

(() => {
  'use strict';

  // Le clic dans l'application Menus & Drive déclenche la préparation du panier.
  // Aucun paiement, suppression, retrait ni commande. Les quantités existantes
  // ne sont jamais réduites et les échecs sont affichés à l'écran.
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
      .danger{color:#af443d}
      .summary{background:#f8faf8;border:1px solid #dce7dc;border-radius:16px;padding:12px;margin:9px 0 14px;font-size:12px;line-height:1.5}
      .summary-title{font-size:15px;font-weight:800;color:#233d31;margin-bottom:2px}
      .summary-sub{font-size:11px;color:#596c60;margin-bottom:10px}
      .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:9px 0 10px}
      .summary-tile{border-radius:12px;padding:9px 10px;min-width:0;border:1px solid transparent}
      .summary-tile strong{display:block;font-size:21px;line-height:1.15;font-weight:800}
      .summary-tile span{display:block;font-size:11px;font-weight:650;margin-top:3px}
      .summary-added{background:#e2f3e8;border-color:#c9e9d3;color:#205e41}
      .summary-existing{background:#e9f0fa;border-color:#d4e2f4;color:#26577f}
      .summary-missing{background:#fff0e8;border-color:#f7d8c8;color:#994c34}
      .summary-partial{background:#fff5d9;border-color:#f0e2ad;color:#88641e}
      .summary-progress{height:5px;background:#dce8e0;overflow:hidden;border-radius:10px;margin:9px 0 3px}
      .summary-progress > span{display:block;background:#347757;height:100%;border-radius:10px}
      .summary-section{border-top:1px solid #dbe6de;padding-top:10px;margin-top:10px}
      .summary-section summary{font-weight:750;font-size:12px;cursor:pointer;list-style:auto;line-height:1.6}
      .summary-section[open] summary{margin-bottom:8px}
      .summary-product{border-radius:10px;background:#fff;padding:9px 10px;margin:6px 0;border-left:3px solid #bfd5c8;overflow-wrap:anywhere}
      .summary-product.problem{border-left-color:#d18462}
      .summary-product.partial{border-left-color:#dfb94c}
      .summary-product .product-name{font-weight:720;color:#26372b;line-height:1.35}
      .summary-product .product-meta{color:#68786d;font-size:11px;margin-top:3px}
      .summary-product .product-reason{color:#954d36;font-size:11px;margin-top:4px}
      .summary-foot{background:#edf4ed;border-radius:10px;padding:9px;color:#4b6252;font-size:11px;margin-top:9px}
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
    const fillCartBtn = document.createElement('button');
    fillCartBtn.type='button';fillCartBtn.className='import';fillCartBtn.hidden=true;
    fillCartBtn.textContent='🛒 Ajouter les produits disponibles au panier';
    const confirmStoreBtn = document.createElement('button');
    confirmStoreBtn.type='button';confirmStoreBtn.className='minor';confirmStoreBtn.hidden=true;
    confirmStoreBtn.textContent='✓ Je confirme que mon Drive affiché est École-Valentin';
    const cartSummary = document.createElement('div');
    cartSummary.className='summary';cartSummary.hidden=true;
    cartSummary.setAttribute('aria-live','polite');
    const lookupStatus = document.createElement('p');
    lookupStatus.className='muted';lookupStatus.setAttribute('aria-live','polite');
    const verifiedProducts = document.createElement('div');
    verifiedProducts.setAttribute('aria-label','Références retrouvées sur Carrefour');
    const listPreview = document.createElement('div');
    listPreview.setAttribute('aria-label','Aperçu de la liste sans modification du panier');
    let previewRows=[];
    const notice = document.createElement('div');
    notice.className = 'light';
    notice.innerHTML = '<strong>🛒 Panier Carrefour</strong><div class="muted">Seuls les produits vérifiés comme disponibles seront ajoutés. Aucun paiement, aucune commande, aucun retrait des autres articles. Le bouton « Vérifier mes références » reste sans modification.</div>';
    const shop = document.createElement('p');
    shop.className = 'muted';
    shop.textContent = 'Vérifie toi-même dans l’interface Carrefour que le Drive actif est bien École-Valentin : le diagnostic ne peut pas le certifier.';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = 'Fermer le diagnostic';
    panel.append(heading, cartSummary, status, domain, ean, preview, importBtn, manualCopy, listBtn, pasteField, pasteConfirm, listStatus, fillCartBtn, confirmStoreBtn, verifyBtn, lookupStatus, listPreview, verifiedProducts, notice, shop, close);

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
      fillCartBtn.hidden=!data.rows.length;
      fillCartBtn.disabled=false;
      confirmStoreBtn.hidden=true;
      cartSummary.hidden=true;cartSummary.replaceChildren();
      listStatus.textContent=data.rows.length+' référence'+(data.rows.length!==1?'s':'')+' transférée'+(data.rows.length!==1?'s':'')+' (code-barres + quantité).';
      const note=document.createElement('p');
      note.className='muted';
      note.textContent='Codes reçus. Le panier ne sera modifié que si Carrefour confirme une disponibilité suffisante.';
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
      safe.textContent='🛒 Ton panier peut être constitué automatiquement : vérifie impérativement le Drive affiché, puis les quantités avant paiement.';
      listPreview.append(safe);
      pasteField.hidden=true;pasteConfirm.hidden=true;
    }
    function parseAndShow(raw){
      try{renderPreview(validateTransfer(raw));return true}
      catch(e){listStatus.textContent='⚠️ '+String(e.message||'Liste non reconnue');listPreview.replaceChildren();verifiedProducts.replaceChildren();verifyBtn.hidden=true;fillCartBtn.hidden=true;return false}
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
    let activeCartRun=false;
    const cartOutcomes=[];
    const expectedDriveName=/(?:[eé]cole|besan[cç]on)[-\s]?valentin/i;
    function cartItems(cart){
      return (Array.isArray(cart?.items)?cart.items:[])
        .flatMap(group=>Array.isArray(group?.products)?group.products:[]);
    }
    function cartLine(cart,ean){
      return cartItems(cart).find(row=>String(row?.product?.attributes?.ean||'')===ean)||null
    }
    function currentQuantity(cart,ean){
      const count=Number(cartLine(cart,ean)?.counter||0);
      return Number.isFinite(count)&&count>0?count:0
    }
    // Lecture stricte de l'offre exacte dans le HTML de la fiche produit.
    // Une réponse imprévue => disponibilité INCONNUE => aucune écriture.
    function pageAvailability(html,sid,ean){
      if(typeof html!=='string'||!sid||!/^\d{13}$/.test(ean))return 'unknown';
      const key='"'+sid+'-'+ean+'"';
      const at=html.indexOf(key);
      if(at<0)return 'unknown';
      let pos=at+key.length;
      while(/\s/.test(html[pos]||'')&&pos<at+key.length+20)pos++;
      if(html[pos++]!==':')return 'unknown';
      while(/\s/.test(html[pos]||'')&&pos<at+key.length+30)pos++;
      if(html[pos]!=='{')return 'unknown';
      let depth=0,inside=false,escaped=false,last=-1;
      for(let i=pos;i<html.length&&i<pos+15000;i++){
        const char=html[i];
        if(inside){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inside=false;continue}
        if(char==='"'){inside=true;continue}
        if(char==='{')depth++;
        if(char==='}'){depth--;if(depth===0){last=i+1;break}}
      }
      if(last<0)return 'unknown';
      try{
        const offer=JSON.parse(html.slice(pos,last));
        const a=offer?.attributes?.availability;
        if(a?.purchasable===false||a?.stopped===true||a?.suspended===true)return 'unavailable';
        return a?.purchasable===true?'available':'unknown';
      }catch(e){return 'unknown'}
    }
    async function availabilityFromProductPage(attrs,ean,sid){
      const slug=String(attrs?.slug||'');
      if(!/^[a-z0-9-]+$/i.test(slug)||!sid)return 'unknown';
      const url='/p/'+slug+'-'+ean;
      const response=await fetch(url,{method:'GET',credentials:'same-origin',
        cache:'no-store',headers:{Accept:'text/html'}});
      if(!response.ok)throw Error('Fiche produit HTTP '+response.status);
      const type=response.headers.get('content-type')||'';
      if(!type.includes('html'))throw Error('Fiche Carrefour non reconnue');
      return pageAvailability(await response.text(),sid,ean)
    }
    async function patchCartQuantity(ean,target,sid){
      if(!/^\d{13}$/.test(ean)||!Number.isInteger(target)||target<1||target>999||!sid)throw Error('Quantité invalide');
      const response=await fetch('/api/cart',{
        method:'PATCH',credentials:'same-origin',cache:'no-store',
        headers:{'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json'},
        body:JSON.stringify({items:[{basketServiceId:sid,counter:target,ean,subBasketType:'drive_clcv'}]})
      });
      if(!response.ok){
        const e=new Error('Modification du panier refusée (HTTP '+response.status+')');
        e.status=response.status;throw e
      }
      if(!(response.headers.get('content-type')||'').includes('json'))throw Error('Réponse panier invalide');
      const body=await response.json();
      return body?.cart||body
    }
    // Présentation uniquement : ces lignes n'ajoutent, ne retirent et ne modifient
    // aucun article du panier. Elles lisent uniquement cartOutcomes et previewRows.
    function showCartSummary(note=''){
      cartSummary.hidden=false;
      const added=cartOutcomes.filter(x=>x.kind==='added');
      const existing=cartOutcomes.filter(x=>x.kind==='existing');
      const missing=cartOutcomes.filter(x=>x.kind==='missing');
      const partial=cartOutcomes.filter(x=>x.kind==='partial');
      const pending=Math.max(0,previewRows.length-cartOutcomes.length);
      const create=(tag,className,text)=>{
        const n=document.createElement(tag);
        if(className)n.className=className;
        if(text!==undefined)n.textContent=String(text);
        return n
      };
      const title=create('div','summary-title','🛒 Bilan de ton panier');
      const subtitle=create('div','summary-sub',pending?'Analyse en cours · '+cartOutcomes.length+'/'+previewRows.length+' références traitées'
        :'Liste traitée · '+previewRows.length+' référence'+(previewRows.length===1?'':'s'));
      const grid=create('div','summary-grid');
      for(const [count,label,style] of [
        [added.length,'Ajoutés','summary-added'],
        [existing.length,'Déjà présents','summary-existing'],
        [missing.length,'Indisponibles / erreurs','summary-missing'],
        [partial.length,'Quantités partielles','summary-partial']
      ]){
        const tile=create('div','summary-tile '+style);
        tile.append(create('strong','',count),create('span','',label));
        grid.append(tile)
      }
      const nodes=[title,subtitle,grid];
      if(pending){
        const track=create('div','summary-progress');
        const bar=create('span');
        bar.style.width=(Math.round(cartOutcomes.length/Math.max(1,previewRows.length)*100))+'%';
        track.append(bar);
        nodes.push(track,create('div','summary-sub',pending+' référence'+(pending===1?'':'s')+' encore à traiter'))
      }
      const groups=[
        {name:'⚠️ Indisponibles ou à vérifier',rows:missing,klass:'problem',open:true},
        {name:'⚠️ Quantités partielles',rows:partial,klass:'partial',open:true},
        {name:'✅ Produits ajoutés',rows:added,klass:'added',open:added.length<=4},
        {name:'✓ Déjà dans le panier',rows:existing,klass:'existing',open:existing.length<=4}
      ];
      for(const group of groups){
        if(!group.rows.length)continue;
        const section=create('details','summary-section');
        section.open=group.open;
        section.append(create('summary','',group.name+' ('+group.rows.length+')'));
        for(const item of group.rows){
          const expected=previewRows.find(x=>x.ean===item.ean);
          const row=create('div','summary-product '+group.klass);
          row.append(create('div','product-name',item.name||'Référence '+item.ean));
          const quantities='Demandé : '+(expected?.qty??'?')+
            (Number.isInteger(item.finalQty)?' · Dans le panier : '+item.finalQty:'');
          row.append(create('div','product-meta','EAN '+item.ean+' · '+quantities));
          if(group.klass==='problem'||group.klass==='partial')
            row.append(create('div','product-reason',item.reason||'À vérifier dans Carrefour'));
          section.append(row)
        }
        nodes.push(section)
      }
      if(!pending&&!missing.length&&!partial.length)
        nodes.push(create('div','summary-foot','✅ Aucune référence manquante ou partielle signalée.'));
      nodes.push(create('div','summary-foot',note||'Vérifie les quantités dans le vrai panier Carrefour. Le paiement reste entièrement manuel.'));
      cartSummary.replaceChildren(...nodes)
    }
    const shopWarning='Le magasin actif n’a pas pu être identifié. Contrôle École-Valentin sur Carrefour.fr.';
    async function runCartFill(userConfirmedStore=false){
      if(activeCartRun||!previewRows.length)return;
      activeCartRun=true;fillCartBtn.disabled=true;verifyBtn.disabled=true;
      cartOutcomes.length=0;verifiedProducts.replaceChildren();
      confirmStoreBtn.hidden=true;
      let sid='',storeName='';
      try{
        const data=await carrefourRead('/api/cart');
        const cart=data?.cart;
        if(!cart?.facilityServiceId||String(cart.storeRef)==='6'||String(cart.facilityServiceId).endsWith('-6')){
          lookupStatus.textContent='⚠️ Sélectionne le Drive École-Valentin sur Carrefour puis relance le transfert.';
          return
        }
        sid=String(cart.facilityServiceId);
        storeName=getSelectedStoreName(sid);
        if(storeName&&!expectedDriveName.test(storeName)){
          lookupStatus.textContent='⛔ Drive différent détecté : '+storeName+'. Sélectionne École-Valentin avant tout ajout.';
          return
        }
        if(!storeName&&!userConfirmedStore){
          lookupStatus.textContent='⚠️ '+shopWarning+' Appuie sur le bouton de confirmation uniquement si tu vois bien École-Valentin sur le site.';
          confirmStoreBtn.hidden=false;
          return
        }
        lookupStatus.textContent='Drive : '+(storeName||'École-Valentin (confirmé manuellement)')+' · Constitution du panier en cours…';
        // Objectif en quantités absolues : un nouvel essai ne rajoute pas des doublons.
        for(const [index,row] of previewRows.entries()){
          lookupStatus.textContent='Drive : '+(storeName||'École-Valentin confirmé')+' · Produit '+(index+1)+'/'+previewRows.length;
          let name='';
          try{
            const existingCart=(await carrefourRead('/api/cart'))?.cart;
            if(!existingCart||String(existingCart.facilityServiceId)!==sid)
              throw Error('STOP : le Drive actif a changé');
            const current=currentQuantity(existingCart,row.ean);
            if(current>=row.qty){
              cartOutcomes.push({ean:row.ean,name:String(cartLine(existingCart,row.ean)?.product?.attributes?.title||'').slice(0,100),finalQty:current,kind:'existing',reason:'Déjà en quantité suffisante'});
              showCartSummary();continue
            }
            const result=await carrefourRead('/autocomplete?q='+encodeURIComponent(row.ean)+'&maxResults=12&productCard=true');
            const product=(Array.isArray(result?.data?.products)?result.data.products:[])
              .find(p=>String(p?.attributes?.ean||'')===row.ean);
            if(!product){
              cartOutcomes.push({ean:row.ean,kind:'missing',reason:'Référence introuvable sur Carrefour'});
              showCartSummary();continue
            }
            const attrs=product.attributes||{};
            name=String(attrs.title||attrs.shortTitle||'').slice(0,100);
            const local=attrs.offers?.[row.ean]?.[sid]?.attributes;
            if(!local){
              cartOutcomes.push({ean:row.ean,name,kind:'missing',reason:'Offre non trouvée pour ce Drive'});
              showCartSummary();continue
            }
            if(local.availability?.purchasable===false||
               local.availability?.stopped===true||local.availability?.suspended===true){
              cartOutcomes.push({ean:row.ean,name,kind:'missing',reason:'Indiqué indisponible dans ce Drive'});
              showCartSummary();continue
            }
            // Carrefour peut déclarer disponible dans la recherche un produit indisponible
            // sur sa fiche : seule la disponibilité explicite sur la fiche autorise l'ajout.
            const availability=await availabilityFromProductPage(attrs,row.ean,sid);
            if(availability!=='available'){
              cartOutcomes.push({ean:row.ean,name,kind:'missing',reason:availability==='unavailable'?
                'Indisponible sur la fiche Carrefour':'Disponibilité impossible à confirmer'});
              showCartSummary();continue
            }
            // Le Drive peut changer pendant la recherche : revérifier avant toute écriture.
            const freshCart=(await carrefourRead('/api/cart'))?.cart;
            if(!freshCart||String(freshCart.facilityServiceId)!==sid)
              throw Error('STOP : le Drive actif a changé');
            const already=currentQuantity(freshCart,row.ean);
            const target=Math.max(already,row.qty);
            if(target===already){
              cartOutcomes.push({ean:row.ean,name,finalQty:already,kind:'existing',reason:'Déjà présent'});
              showCartSummary();continue
            }
            const updated=await patchCartQuantity(row.ean,target,sid);
            const line=cartLine(updated,row.ean);
            const granted=currentQuantity(updated,row.ean);
            if(granted<target||line?.isStockOff||line?.available===false){
              cartOutcomes.push({ean:row.ean,name,finalQty:granted,kind:'partial',reason:granted>0?
                'Quantité réelle '+granted+'/'+target+' ; à vérifier dans le panier':'Ajout refusé ou indisponible'});
            }else{
              cartOutcomes.push({ean:row.ean,name,finalQty:granted,kind:'added',reason:'Quantité finale '+granted});
            }
            showCartSummary()
          }catch(e){
            const msg=String(e.message||'Erreur inconnue');
            cartOutcomes.push({ean:row.ean,name,kind:'missing',reason:'Échec technique : '+msg});
            showCartSummary();
            if(/STOP : le Drive actif a changé/.test(msg)||[400,401,403,429].includes(e.status)){
              lookupStatus.textContent='⛔ Arrêt du transfert : '+msg;
              break
            }
          }
          // Requêtes espacées ; pas de traitement simultané des commandes.
          if(index<previewRows.length-1)await new Promise(resolve=>setTimeout(resolve,400));
        }
        if(!lookupStatus.textContent.startsWith('⛔')){
          lookupStatus.textContent='✓ Opération terminée. Vérifie le panier Carrefour avant de choisir ton créneau et de payer.';
        }
        showCartSummary();
        panel.scrollTop=0;
      }catch(e){
        lookupStatus.textContent='⛔ Impossible de constituer le panier : '+String(e.message||'Erreur Carrefour');
      }finally{
        activeCartRun=false;fillCartBtn.disabled=false;verifyBtn.disabled=false;
      }
    }
    fillCartBtn.addEventListener('click',()=>runCartFill(false));
    confirmStoreBtn.addEventListener('click',()=>{
      confirmStoreBtn.hidden=true;runCartFill(true)
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
      if(imported)heading.textContent='🛒 Ma liste Menus & Drive';
      if(imported){
        listStatus.textContent+=' · Import direct depuis ton appli ✓';
        // Le clic "Ouvrir Carrefour avec ma liste" autorise la simple lecture de
        // références, sans aucun ajout ni modification du vrai panier.
        runCartFill(false);
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
