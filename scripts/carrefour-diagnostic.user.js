// ==UserScript==
// @name         Menus & Drive — Diagnostic Carrefour (lecture seule)
// @namespace    https://github.com/jb8br7jgpr-eng/mes-menus-drive
// @version      0.3.0
// @description  Copie une fiche Carrefour vers Menus & Drive installé sur iPhone, sans toucher au panier.
// @match        https://www.carrefour.fr/*
// @match        https://carrefour.fr/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jb8br7jgpr-eng/mes-menus-drive/developpement-v1/scripts/carrefour-diagnostic.user.js
// @updateURL    https://raw.githubusercontent.com/jb8br7jgpr-eng/mes-menus-drive/developpement-v1/scripts/carrefour-diagnostic.user.js
// ==/UserScript==

(() => {
  'use strict';

  // Sécurité de cette étape : aucun fetch/XHR, aucun cookie, aucun token,
  // aucune donnée de compte collectée, aucun ajout/suppression d'article.
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
      .panel{display:none;width:min(325px,calc(100vw - 28px));background:#fff;color:#25382e;border:1px solid #dce8df;border-radius:18px;box-shadow:0 8px 30px #0003;padding:17px;margin-bottom:8px;font-size:13px;line-height:1.5}
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
    const notice = document.createElement('div');
    notice.className = 'light';
    notice.innerHTML = '<strong>✅ Lecture seule</strong><div class="muted">Aucun produit ajouté, panier inchangé, aucune donnée envoyée.</div>';
    const shop = document.createElement('p');
    shop.className = 'muted';
    shop.textContent = 'Vérifie toi-même dans l’interface Carrefour que le Drive actif est bien École-Valentin : le diagnostic ne peut pas le certifier.';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = 'Fermer le diagnostic';
    panel.append(heading, status, domain, ean, preview, importBtn, manualCopy, notice, shop, close);

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
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
