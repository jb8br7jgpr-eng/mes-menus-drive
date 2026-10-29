// Speedrive V34 — panneau familial (branche de test uniquement).
// Les opérations réseau sont volontairement verrouillées tant que les
// règles Firestore et les tests de sécurité ne sont pas validés.
import {
  observeLogin, signUp, signIn, signOutAccount, resendVerification,
  refreshVerifiedAccount, findMyHousehold, createHousehold,
  connectHousehold, addSecondPhone
} from "./sync-api-v34.js";

const ENABLE_ACCOUNT_SETUP = false; // NE PAS activer avant validation + règles publiées.
const root = document.getElementById("v34SyncRoot");
let account = null, household = null, loading = false, error = "", info = "";
let authReady = false, view = "login", showJoin = false;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
function visible() { return root?.dataset.open === "true"; }
function feedback() {
  return `${error ? '<p class="v34-alert v34-error" role="alert">'+esc(error)+'</p>' : ''}
    ${info ? '<p class="v34-alert" role="status">'+esc(info)+'</p>' : ''}`;
}
function btn(label, action, options = "") {
  return `<button type="button" class="v34-button ${options}" data-v34-action="${action}"
    ${loading || !ENABLE_ACCOUNT_SETUP ? "disabled" : ""}>${esc(label)}</button>`;
}
function render() {
  if (!root || !visible()) return;
  const setupNotice = !ENABLE_ACCOUNT_SETUP
    ? '<div class="v34-note"><strong>Prototype V34 non activé</strong><p>Les comptes et les échanges ne sont pas encore disponibles. Les règles Firebase restent volontairement verrouillées. Aucune donnée de la V33 ne sera envoyée.</p></div>' : '';
  let body = "";
  if (!authReady) {
    body = '<p class="v34-muted">Chargement de la session…</p>';
  } else if (!account) {
    body = `<p class="v34-muted">Chaque personne possède son compte, mais vous partagez les mêmes recettes, menus et courses.</p>
      <div class="v34-switch">
        <button data-v34-view="login" class="${view === "login" ? "selected" : ""}" type="button">Se connecter</button>
        <button data-v34-view="register" class="${view === "register" ? "selected" : ""}" type="button">Créer un compte</button>
      </div>
      <form id="v34AuthForm" data-v34-form="${view}" class="v34-form">
        <label>Adresse e-mail<input name="email" type="email" required autocomplete="email" inputmode="email"></label>
        <label>Mot de passe<input name="password" type="password" required minlength="8"
          autocomplete="${view === "register" ? "new-password" : "current-password"}"></label>
        <button class="v34-button v34-primary" type="submit" ${loading || !ENABLE_ACCOUNT_SETUP ? "disabled" : ""}>
          ${view === "register" ? "Créer mon compte" : "Connexion"}
        </button>
      </form>
      <p class="v34-small">Connexion enregistrée sur cet appareil. Aucun mot de passe n'est stocké par Speedrive.</p>`;
  } else if (!account.emailVerified) {
    body = `<p class="v34-muted">Compte : <strong>${esc(account.email)}</strong></p>
      <div class="v34-note"><strong>Vérifie ton adresse e-mail</strong>
      <p>Ouvre le courriel Firebase et confirme ton adresse. Reviens ensuite ici et appuie sur « Vérification terminée ».</p></div>
      ${btn("Vérification terminée", "refresh", "v34-primary")}
      ${btn("Renvoyer le courriel", "resend")}
      ${btn("Changer de compte", "signout", "v34-subtle")}`;
  } else {
    const code = `<div class="v34-code"><label>Mon identifiant de compte</label>
      <output>${esc(account.uid)}</output>
      <button type="button" data-v34-copy="${esc(account.uid)}">Copier</button></div>`;
    if (!household) {
      body = `<p class="v34-muted">Connecté en tant que <strong>${esc(account.email)}</strong>.</p>
        ${code}
        <h3>Créer votre espace familial</h3>
        <p class="v34-small">À faire une seule fois sur le premier iPhone. Il contiendra les données communes après la migration sécurisée.</p>
        ${btn("Créer l'espace Speedrive", "create", "v34-primary")}
        <hr><button type="button" class="v34-link" data-v34-toggle-join="true">J'ai déjà un code d'espace</button>
        ${showJoin ? `<form class="v34-form" data-v34-form="join">
          <label>Code de l'espace partagé<input required name="household" autocapitalize="off" spellcheck="false" autocomplete="off" placeholder="Code transmis par l'autre téléphone"></label>
          <button type="submit" class="v34-button v34-primary" ${loading || !ENABLE_ACCOUNT_SETUP ? "disabled" : ""}>Rejoindre l'espace</button>
          <p class="v34-small">L'autre compte doit d'abord avoir autorisé ton identifiant personnel.</p>
        </form>` : ""}
        ${btn("Se déconnecter", "signout", "v34-subtle")}`;
    } else {
      const isOwner = household.ownerUid === account.uid;
      body = `<p class="v34-muted">Connecté en tant que <strong>${esc(account.email)}</strong>.</p>
        <div class="v34-good"><strong>Espace familial associé</strong><span>${esc(household.name || "Speedrive")}</span></div>
        <div class="v34-code"><label>Code de l'espace familial</label>
          <output>${esc(household.id)}</output>
          <button type="button" data-v34-copy="${esc(household.id)}">Copier</button></div>
        ${code}
        ${isOwner ? `<h3>Ajouter le deuxième iPhone</h3>
          <p class="v34-small">Après création et vérification du compte sur le second téléphone, récupère son identifiant personnel et colle-le ici.</p>
          <form class="v34-form" data-v34-form="invite">
            <label>Identifiant du deuxième compte<input name="uid" required autocomplete="off" autocapitalize="off" spellcheck="false"></label>
            <button type="submit" class="v34-button v34-primary" ${loading || !ENABLE_ACCOUNT_SETUP ? "disabled" : ""}>Autoriser ce compte</button>
          </form>` : '<div class="v34-good">Accès familial accordé par le propriétaire.</div>'}
        <p class="v34-small">Le partage des recettes et des courses n'est pas encore activé dans ce prototype.</p>
        ${btn("Se déconnecter", "signout", "v34-subtle")}`;
    }
  }
  root.innerHTML = `<div class="v34-overlay" data-v34-overlay>
    <section class="v34-panel" role="dialog" aria-modal="true" aria-labelledby="v34Title">
      <div class="v34-head"><div><span class="v34-eyebrow">SPEEDRIVE • VERSION 34</span>
      <h2 id="v34Title">Synchronisation familiale</h2></div>
      <button type="button" class="v34-close" data-v34-close aria-label="Fermer">×</button></div>
      ${setupNotice}
      ${feedback()}
      ${loading ? '<p class="v34-muted" role="status">Opération en cours…</p>' : ''}
      <div class="v34-body">${body}</div>
      <div class="v34-foot"><span>✓ Les données V33 restent stockées sur cet iPhone</span></div>
    </section></div>`;
}
function openPanel() { if(!root)return; root.dataset.open="true"; render(); root.querySelector("[data-v34-close]")?.focus(); }
function closePanel() { if(!root)return; root.dataset.open="false"; root.innerHTML=""; }
function setFeedback(message, isError = false) { error = isError ? message : ""; info = isError ? "" : message; render(); }
function friendlyError(e) {
  const map = {
    "auth/email-already-in-use": "Cette adresse possède déjà un compte.",
    "auth/invalid-email": "Vérifie l'adresse e-mail.",
    "auth/weak-password": "Choisis un mot de passe plus robuste.",
    "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie plus tard.",
    "permission-denied": "Accès refusé : vérifie que le compte a bien été autorisé."
  };
  return map[e?.code] || map[e?.message] || (e?.message && !String(e.message).includes("Firebase:") ? String(e.message) : "Opération impossible. Vérifie la connexion et les autorisations.");
}
async function refreshHousehold() {
  if (!account?.emailVerified || !ENABLE_ACCOUNT_SETUP) { household = null; render(); return; }
  try { household = await findMyHousehold(); }
  catch(e) { household = null; setFeedback(friendlyError(e), true); }
  render();
}
async function act(operation) {
  if (loading) return;
  if (!ENABLE_ACCOUNT_SETUP) { setFeedback("La connexion familiale n'est pas encore activée sur cette branche de préparation.", true); return; }
  loading = true; error = ""; info = ""; render();
  try { await operation(); }
  catch (e) { error = friendlyError(e); }
  finally { loading = false; render(); }
}
root?.addEventListener("click", event => {
  const t = event.target;
  if (t === root.querySelector("[data-v34-overlay]") || t.closest("[data-v34-close]")) {
    closePanel(); return;
  }
  const viewBtn = t.closest("[data-v34-view]");
  if (viewBtn) { view = viewBtn.dataset.v34View; error = ""; info = ""; render(); return; }
  if (t.closest("[data-v34-toggle-join]")) { showJoin = !showJoin; render(); return; }
  const copyBtn = t.closest("[data-v34-copy]");
  if (copyBtn) {
    if (!navigator.clipboard?.writeText) {
      setFeedback("Copie manuellement le code affiché.", true);
      return;
    }
    navigator.clipboard.writeText(copyBtn.dataset.v34Copy).then(
      () => setFeedback("Code copié."),
      () => setFeedback("Copie manuellement le code affiché.", true)
    );
    return;
  }
  const action = t.closest("[data-v34-action]")?.dataset.v34Action;
  if (!action) return;
  if (action === "create") act(async () => {
    const id = await createHousehold();
    household = await findMyHousehold();
    info = "Espace créé : " + id;
  });
  if (action === "refresh") act(async () => {
    const verified = await refreshVerifiedAccount();
    if (!verified) throw Error("Adresse non encore vérifiée. Consulte tes e-mails.");
    await refreshHousehold();
  });
  if (action === "resend") act(async () => { await resendVerification(); info = "Courriel de vérification renvoyé."; });
  if (action === "signout") act(async () => { await signOutAccount(); household = null; info = "Compte déconnecté."; });
});
root?.addEventListener("submit", event => {
  const form = event.target.closest("[data-v34-form]"); if (!form) return;
  event.preventDefault();
  const data = new FormData(form), mode = form.dataset.v34Form;
  if (mode === "login") act(async () => { await signIn(String(data.get("email")).trim(), String(data.get("password"))); });
  if (mode === "register") act(async () => {
    await signUp(String(data.get("email")).trim(), String(data.get("password")));
    info = "Un lien de vérification vient d'être envoyé par e-mail.";
  });
  if (mode === "join") act(async () => {
    household = await connectHousehold(String(data.get("household")).trim());
    info = "Espace familial associé à ce compte.";
  });
  if (mode === "invite") act(async () => {
    await addSecondPhone(household.id, String(data.get("uid")).trim());
    info = "Deuxième compte autorisé. Il peut maintenant rejoindre l'espace.";
  });
});
document.addEventListener("click", event => {
  if (event.target.closest("[data-v34-open]")) openPanel();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && visible()) { event.stopImmediatePropagation(); closePanel(); }
}, true);
if (root) observeLogin(user => {
  const oldUid = account?.uid;
  account = user; authReady = true;
  if (!user || oldUid !== user.uid) household = null;
  if (user?.emailVerified && ENABLE_ACCOUNT_SETUP && (!household || oldUid !== user.uid))
    refreshHousehold();
  else render();
}, e => { authReady = true; setFeedback(friendlyError(e), true); });
