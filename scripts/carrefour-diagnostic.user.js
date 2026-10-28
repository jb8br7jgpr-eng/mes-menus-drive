// ==UserScript==
// @name         Menus & Drive — Diagnostic Carrefour (lecture seule)
// @namespace    https://github.com/jb8br7jgpr-eng/mes-menus-drive
// @version      0.1.0
// @description  Vérifie uniquement que Userscripts fonctionne sur Carrefour.fr. Aucune opération de panier.
// @match        https://www.carrefour.fr/*
// @match        https://carrefour.fr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Sécurité de cette étape : aucun fetch/XHR, aucun cookie, aucun token,
  // aucune donnée de compte collectée, aucun ajout/suppression d'article.
  if (!/^(www\.)?carrefour\.fr$/i.test(location.hostname)) return;
  if (document.getElementById('md-carrefour-diagnostic-root')) return;

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
    panel.append(heading, status, domain, ean, notice, shop, close);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'trigger';
    trigger.textContent = '🧪 Test Menus & Drive';
    trigger.setAttribute('aria-label', 'Afficher le diagnostic Carrefour');

    function refresh() {
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
    close.addEventListener('click', () => {
      panel.classList.remove('open');
      trigger.focus();
    });
    root.append(style, panel, trigger);
    document.body.appendChild(host);
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
