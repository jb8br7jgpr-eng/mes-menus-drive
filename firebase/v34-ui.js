// V34 cloud-first : panneau simplifié, non activé tant que les
// tests Firebase et la sauvegarde indépendante ne sont pas validés.
import {
  observeLogin, signUp, signIn, signOutAccount,
  resendVerification, refreshVerifiedAccount
} from "./v34-auth.js";
import { previewLocalMigration } from "./v34-model.js";

const ENABLE_ACCOUNT_SETUP = false; // DO NOT ENABLE before security tests.
const root = document.getElementById("v34SyncRoot");
let user = null, ready = false, mode = "login", loading = false;
let error = "", info = "", localPreview = null;

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const enabled = () => root?.dataset.open === "true";
function button(label, action, css = "") {
  return `<button type="button" class="v34-button ${css}" data-v34-action="${action}"
    ${!ENABLE_ACCOUNT_SETUP || loading ? "disabled" : ""}>${escapeHtml(label)}</button>`;
}
function errorText(e) {
  const errors = {
    "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
    "auth/email-already-in-use": "Ce compte existe déjà : utilise Connexion.",
    "auth/weak-password": "Le mot de passe est trop faible.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie plus tard."
  };
  return errors[e?.code] || (e?.message && !e.message.includes("Firebase:") ?
    e.message : "Impossible de terminer cette opération.");
}
function render() {
  if (!root || !enabled()) return;
  const preview = localPreview ? `<div class="v34-good">
    <strong>Analyse locale, sans envoi</strong>
    <span>${localPreview.recipes} recettes · ${localPreview.products} produits · ${localPreview.photos} photos</span>
    <span>${localPreview.weeks} semaines · ${localPreview.records} éléments à transférer</span>
    <span>${localPreview.duplicates} doublon(s) potentiel(s) · ${localPreview.warnings} avertissement(s)</span>
  </div>` : "";
  let accountArea = '<p class="v34-muted">Initialisation du compte…</p>';
  if (ready && !user) {
    accountArea = `<p class="v34-muted">Un seul compte familial, utilisé une première fois sur chaque iPhone. La connexion est ensuite mémorisée.</p>
      <div class="v34-switch">
        <button type="button" data-v34-mode="login" class="${mode==="login"?"selected":""}">Connexion</button>
        <button type="button" data-v34-mode="register" class="${mode==="register"?"selected":""}">Première inscription</button>
      </div>
      <form class="v34-form" data-v34-form="${mode}">
        <label>Adresse e-mail<input required type="email" name="email" autocomplete="email"></label>
        <label>Mot de passe<input required type="password" name="password" minlength="8"
          autocomplete="${mode==="register"?"new-password":"current-password"}"></label>
        <button type="submit" class="v34-button v34-primary"
          ${!ENABLE_ACCOUNT_SETUP||loading?"disabled":""}>${mode==="register"?"Créer le compte familial":"Se connecter"}</button>
      </form>`;
  } else if (ready && !user.emailVerified) {
    accountArea = `<p class="v34-muted">Compte : <strong>${escapeHtml(user.email)}</strong></p>
      <div class="v34-note"><strong>Adresse e-mail à vérifier</strong><p>Ouvre le courriel de confirmation avant d'utiliser les données partagées.</p></div>
      ${button("Vérification terminée","verify","v34-primary")}
      ${button("Renvoyer le courriel","resend")}
      ${button("Se déconnecter","logout","v34-subtle")}`;
  } else if (ready) {
    accountArea = `<div class="v34-good"><strong>Compte familial identifié</strong>
      <span>${escapeHtml(user.email)}</span></div>
      <p class="v34-small">Sur le deuxième iPhone, tu utiliseras ce même compte. Chaque ouverture récupérera d'abord la dernière version vérifiée du serveur.</p>
      ${button("Se déconnecter","logout","v34-subtle")}`;
  }
  root.innerHTML = `<div class="v34-overlay" data-v34-overlay>
    <section class="v34-panel" role="dialog" aria-modal="true" aria-labelledby="v34Title">
      <div class="v34-head"><div><span class="v34-eyebrow">SPEEDRIVE • V34</span>
        <h2 id="v34Title">Sauvegarde et partage</h2></div>
        <button type="button" class="v34-close" data-v34-close aria-label="Fermer">×</button></div>
      <div class="v34-note"><strong>Préparation, non activée</strong>
        <p>La base officielle sera sur Firebase. Une seule session sera utilisée à la fois.
        Les modifications seront autorisées uniquement avec une connexion fonctionnelle,
        et affichées comme sauvegardées après confirmation du serveur.</p>
      </div>
      <button type="button" class="v34-button" data-v34-preview>Vérifier mes données locales sans les envoyer</button>
      ${preview}
      ${error ? '<div class="v34-alert v34-error" role="alert">'+escapeHtml(error)+'</div>' : ''}
      ${info ? '<div class="v34-alert" role="status">'+escapeHtml(info)+'</div>' : ''}
      <div class="v34-body"><h3>Compte commun aux deux iPhone</h3>${accountArea}</div>
      <div class="v34-foot">Les données et sauvegardes locales de la V33 restent inchangées</div>
    </section>
  </div>`;
}
function openPanel() { if (!root) return; root.dataset.open="true"; render(); root.querySelector("[data-v34-close]")?.focus(); }
function closePanel() { if (!root) return; root.dataset.open="false"; root.innerHTML=""; }
async function act(fn) {
  if (!ENABLE_ACCOUNT_SETUP || loading) return;
  loading = true;error="";info="";render();
  try { await fn(); } catch(e) { error = errorText(e); }
  finally { loading=false;render(); }
}
root?.addEventListener("click", e => {
  const target=e.target;
  if (target===root.querySelector("[data-v34-overlay]") || target.closest("[data-v34-close]")) {
    closePanel();return;
  }
  if (target.closest("[data-v34-preview]")) {
    try {
      const state = window.speedriveV34ReadLocalCopy?.();
      if (!state) throw Error("Speedrive V33 n'est pas encore chargé.");
      const report = previewLocalMigration(state);
      localPreview={
        recipes:state.recipes.length,
        products:state.products.length,
        photos:state.recipes.filter(x=>!!x.image).length,
        weeks:Object.keys(state.weeks||{}).length,
        records:report.count,
        warnings:report.warnings.length,
        duplicates:Object.values(report.duplicates).reduce((n,arr)=>n+arr.length,0)
      };
      error="";info="";
    } catch(err) { error=errorText(err);localPreview=null; }
    render();return;
  }
  const modeButton=target.closest("[data-v34-mode]");
  if (modeButton) {mode=modeButton.dataset.v34Mode;render();return;}
  const action=target.closest("[data-v34-action]")?.dataset.v34Action;
  if (action==="verify") act(async()=>{if(!await refreshVerifiedAccount())throw Error("Adresse e-mail non encore vérifiée.");});
  if (action==="resend") act(async()=>{await resendVerification();info="Courriel renvoyé.";});
  if (action==="logout") act(async()=>{await signOutAccount();info="Compte déconnecté.";});
});
root?.addEventListener("submit",e=>{
  const form=e.target.closest("[data-v34-form]");
  if (!form) return;
  e.preventDefault();
  if (!ENABLE_ACCOUNT_SETUP) return;
  const data=new FormData(form);
  const email=String(data.get("email")||"").trim(), password=String(data.get("password")||"");
  if(form.dataset.v34Form==="login") act(async()=>{await signIn(email,password);});
  else act(async()=>{await signUp(email,password);info="Vérifie le message de confirmation dans tes e-mails.";});
});
document.addEventListener("click",e=>{if(e.target.closest("[data-v34-open]"))openPanel();});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&enabled()){e.stopImmediatePropagation();closePanel();}
},true);
if(root)observeLogin(account=>{user=account;ready=true;render();},
  e=>{ready=true;error=errorText(e);render();});
