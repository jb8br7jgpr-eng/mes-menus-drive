// V34 cloud-first : panneau simplifié, non activé tant que les
// tests Firebase et la sauvegarde indépendante ne sont pas validés.
import {
  observeLogin, signIn, signOutAccount,
  resendVerification, refreshVerifiedAccount
} from "./v34-auth.js";
import { previewLocalMigration } from "./v34-model.js";
import { inspectFirstCloudImport } from "./v34-import-preflight.js";
import { currentCloudStatus, confirmFirstCloudImport, retryUnconfirmedSave } from "./v34-cloud-runtime.js";

const ENABLE_ACCOUNT_SETUP = false; // DO NOT ENABLE before security tests.
const root = document.getElementById("v34SyncRoot");
let user = null, ready = false, loading = false;
let error = "", info = "", localPreview = null;
let cloudStatus = {phase:"idle"};

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
  const preview = localPreview ? `<div class="${localPreview.canImport?"v34-good":"v34-note"}">
    <strong>Contrôle local : ${localPreview.canImport?"aucun blocage détecté":"import bloqué"}</strong>
    <span>${localPreview.recipes} recettes · ${localPreview.products} produits · ${localPreview.photos} photos</span>
    <span>${localPreview.weeks} semaines · ${localPreview.meals} repas · ${localPreview.records} éléments</span>
    <span>${localPreview.snapshotBytes===null?"Taille du contenu inconnue":Math.round(localPreview.snapshotBytes/1024)+" Ko de données"} · ${Math.round(localPreview.photoBytes/1024)} Ko de photos</span>
    <span>${localPreview.chunkCount??"?"} bloc(s) cloud · ${localPreview.duplicates} doublon(s) potentiel(s) · ${localPreview.warnings} avertissement(s)</span>
    ${localPreview.errors?.length?"<ul>"+localPreview.errors.map(x=>"<li>"+escapeHtml(x)+"</li>").join("")+"</ul>":""}
    <span class="v34-small">Données analysées sur cet iPhone uniquement. Rien n'a été envoyé.</span>
  </div>` : "";
  let cloudArea = "";
  if (ready && user?.emailVerified) {
    const phase=cloudStatus.phase;
    if(phase==="needs-import") {
      cloudArea = `<div class="v34-note"><strong>Premier iPhone : transfert initial</strong>
        <p>Vérifie d'abord le nombre de recettes, produits et photos de cet iPhone.
        Il deviendra la bibliothèque de référence uniquement après ton accord.
        Sur le second iPhone, ne fais jamais de transfert initial.</p></div>
        <button class="v34-button v34-primary" data-v34-action="first-import"
          ${!ENABLE_ACCOUNT_SETUP||loading||!localPreview||!localPreview.canImport||(!localPreview.recipes&&!localPreview.products)?"disabled":""}>
          Confirmer l'envoi initial vers Firebase
        </button>`;
    } else if(phase==="recovery") {
      cloudArea = `<div class="v34-note"><strong>Modifications locales à récupérer</strong>
        <p>Une modification n'a pas encore été confirmée sur Firebase.
        Elle est conservée sur cet iPhone. Réessayer n'écrasera jamais
        une version plus récente présente sur l'autre iPhone.</p></div>
        ${button("Réessayer la sauvegarde", "retry-draft", "v34-primary")}
        <p class="v34-small">Si Firebase a changé entre-temps, le brouillon sera préservé
        pour une résolution ultérieure, sans suppression automatique.</p>`;
    } else if(phase==="ready") {
      cloudArea='<div class="v34-good"><strong>Enregistré sur Firebase</strong><span>Dernière version du serveur confirmée.</span></div>';
    } else if(phase==="readonly") {
      cloudArea='<div class="v34-note"><strong>Serveur indisponible</strong><p>Consultation uniquement. Les modifications restent bloquées.</p></div>';
    }
  }
  let accountArea = '<p class="v34-muted">Initialisation du compte…</p>';
  if (ready && !user) {
    accountArea = `<p class="v34-muted">Un seul compte familial, déjà créé dans Firebase. Connecte ce même compte sur chacun des deux iPhone : la session restera mémorisée.</p>
      <form class="v34-form" data-v34-form="login">
        <label>Adresse e-mail<input required type="email" name="email" autocomplete="email" autocapitalize="none" spellcheck="false"></label>
        <label>Mot de passe<input required type="password" name="password" minlength="8"
          autocomplete="current-password"></label>
        <button type="submit" class="v34-button v34-primary"
          ${!ENABLE_ACCOUNT_SETUP||loading?"disabled":""}>Se connecter au compte familial</button>
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
      <div class="v34-body"><h3>Compte commun aux deux iPhone</h3>${accountArea}${cloudArea}</div>
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
    // Read-only, safe even with ENABLE_ACCOUNT_SETUP=false.
    if(loading)return;
    loading=true;error="";info="";render();
    void (async()=>{
      try {
        const state=window.speedriveV34ReadLocalCopy?.();
        if(!state)throw Error("Speedrive V33 n'est pas encore chargé.");
        const [raw,preflight]=await Promise.all([
          Promise.resolve(previewLocalMigration(state)),
          inspectFirstCloudImport(state)
        ]);
        localPreview={
          ...preflight,
          records:raw.count,
          duplicates:Object.values(raw.duplicates).reduce((n,arr)=>n+arr.length,0),
          warnings:preflight.warnings.length+raw.warnings.length
        };
        if(!preflight.canImport)info="L'analyse a détecté un problème à corriger avant le premier transfert.";
      } catch(err) {error=errorText(err);localPreview=null;}
      finally {loading=false;render();}
    })();
    return;
  }
  const action=target.closest("[data-v34-action]")?.dataset.v34Action;
  if (action==="first-import") {
    if (!ENABLE_ACCOUNT_SETUP || !localPreview?.canImport || (!localPreview.recipes&&!localPreview.products)) return;
    if (!confirm("Ce premier iPhone contient-il bien les recettes à conserver ? L'envoi initial sera confirmé sur Firebase avant toute utilisation depuis le second téléphone.")) return;
    act(async()=>{await confirmFirstCloudImport();info="Bibliothèque initiale enregistrée et confirmée sur Firebase.";});
    return;
  }
  if (action==="retry-draft") {
    if (!ENABLE_ACCOUNT_SETUP) return;
    act(async()=>{const result=await retryUnconfirmedSave();info=result?.stale
      ? "Le serveur possède une version plus récente. Le brouillon est conservé."
      : "Sauvegarde confirmée sur Firebase.";});
    return;
  }
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
  if(form.dataset.v34Form!=="login") return;
  act(async()=>{await signIn(email,password);});
});
document.addEventListener("click",e=>{if(e.target.closest("[data-v34-open]"))openPanel();});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&enabled()){e.stopImmediatePropagation();closePanel();}
},true);
if(root)observeLogin(account=>{user=account;ready=true;render();},
  e=>{ready=true;error=errorText(e);render();});

window.addEventListener("speedrive-v34-cloud-status",e=>{
  cloudStatus=e.detail||{phase:"idle"};
  render();
});
// If the panel opens after the sync state was emitted, recover the latest state.
cloudStatus=currentCloudStatus();
