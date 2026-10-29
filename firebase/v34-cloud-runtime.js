// Speedrive V34 — browser connector (prototype, feature-gated in app.js).
// No Firebase writes happen until the app explicitly enables cloud mode.
import { firebaseAuth } from "../firebase-v34.js";
import { observeLogin } from "./v34-auth.js";
import { cloudRecoveryStore } from "./v34-cloud-recovery-store.js";
import { createCloudSession } from "./v34-session-core.js";
import { loadAuthoritativeState, saveAuthoritativeState } from "./v34-cloud-first.js";

const message = {
  idle:"Synchronisation non initialisée",
  login:"Compte familial requis",
  verification:"Vérification de l'adresse e-mail requise",
  loading:"Récupération du serveur…",
  readonly:"Connexion requise — modifications bloquées",
  "needs-import":"Premier transfert des données à confirmer",
  recovery:"Modifications non confirmées — récupération nécessaire",
  saving:"Enregistrement sur Firebase…",
  ready:"Enregistré sur le serveur"
};
let stopAuth = null, session = null, userId = null, refreshing = false;
let previousStatus = {phase:"idle"};
let authGeneration = 0;
let appOptions = null;
function report(event) {
  previousStatus = event;
  const holder=document.getElementById("v34CloudStatus");
  const shield=document.getElementById("v34CloudGuard");
  const safe = event.phase === "ready";
  if (holder) {
    holder.hidden=false;
    holder.dataset.phase=event.phase;
    holder.textContent=message[event.phase] || "État de sauvegarde inconnu";
  }
  if (shield) {
    shield.hidden=safe;
    shield.querySelector("[data-v34-guard-text]").textContent =
      message[event.phase] || "Modifications bloquées";
  }
  window.dispatchEvent(new CustomEvent("speedrive-v34-cloud-status",{detail:event}));
  appOptions?.onStatus?.(event);
}
const viewBlocked = () => previousStatus.phase !== "ready";
function guardEditing(event) {
  if (!viewBlocked()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#v34SyncRoot, #v34CloudGuard")) return;
  if (target.closest(".app-shell, #modalRoot") &&
      !target.closest("[data-tab], [data-v34-open], #settingsBtn")) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
async function onUser(user) {
  const generation=++authGeneration;
  if (!appOptions) return;
  if (!user) { userId=null;session=null;report({phase:"login"});return; }
  if (!user.emailVerified) { userId=null;session=null;report({phase:"verification"});return; }
  if (user.uid !== firebaseAuth.currentUser?.uid) return;
  const uid=user.uid;
  userId=uid;
  report({phase:"loading"});
  const sessionForUser=createCloudSession({
    cloud:{loadAuthoritativeState,saveAuthoritativeState},
    storage:cloudRecoveryStore,
    applyServerState:async state=>{
      if (generation!==authGeneration || firebaseAuth.currentUser?.uid!==uid)
        throw Error("Changement de compte pendant le téléchargement. Installation annulée.");
      return appOptions.installCloudState(state);
    },
    onStatus:event=>{
      if(generation===authGeneration)report(event);
    }
  });
  session=sessionForUser;
  try {
    const local=appOptions.readLocalState();
    // Preserve the complete original V33 state before the first cloud adoption.
    await cloudRecoveryStore.preserveV33Once(uid,local);
    // Crash recovery: if V33's locally persisted state differs from the last
    // confirmed state, preserve it as an unsent draft before ANY server import.
    const confirmed=await cloudRecoveryStore.readConfirmed(uid);
    const pending=await cloudRecoveryStore.readDraft(uid);
    if (!pending && confirmed && JSON.stringify(local)!==JSON.stringify(confirmed.state)) {
      await cloudRecoveryStore.saveDraft(uid,{
        state:local, expectedRevision:confirmed.revision, createdAt:Date.now(),
        detectedBy:"local-state-mismatch"
      });
    }
    if (generation!==authGeneration || firebaseAuth.currentUser?.uid!==uid) return;
    await sessionForUser.open(uid);
  } catch(e) {
    if(generation===authGeneration)report({phase:"readonly",error:String(e.message||e)});
  }
}
async function resume() {
  if (refreshing || !session || !userId ||
      ["saving","loading","recovery","needs-import"].includes(previousStatus.phase)) return;
  refreshing=true;
  try { await session.open(userId); }
  finally { refreshing=false; }
}
function onVisible() {
  if (document.visibilityState === "visible") void resume();
}
function onFocus() { void resume(); }
function onReconnect() { void resume(); }
function refreshRequest(event) {
  if (event.target.closest("[data-v34-refresh]")) void resume();
}

export function setupCloudV34({readLocalState,installCloudState,onStatus}={}) {
  if (appOptions) throw Error("La connexion cloud est déjà préparée.");
  if (typeof readLocalState !== "function" || typeof installCloudState !== "function")
    throw Error("Lecteur local ou installation cloud manquant.");
  appOptions={readLocalState,installCloudState,onStatus};
  report({phase:"loading"});
  for(const type of ["click","submit","change"]) {
    document.addEventListener(type,guardEditing,true);
  }
  window.addEventListener("focus",onFocus);
  window.addEventListener("online",onReconnect);
  document.addEventListener("click",refreshRequest);
  document.addEventListener("visibilitychange",onVisible);
  stopAuth=observeLogin(user => {void onUser(user);},
    err=>report({phase:"readonly",error:String(err?.message||err)}));
  return () => {
    authGeneration++;
    stopAuth?.();
    for(const type of ["click","submit","change"]) {
      document.removeEventListener(type,guardEditing,true);
    }
    window.removeEventListener("focus",onFocus);
    window.removeEventListener("online",onReconnect);
    document.removeEventListener("click",refreshRequest);
    document.removeEventListener("visibilitychange",onVisible);
    appOptions=null;session=null;userId=null;
  };
}
export function currentCloudStatus() { return {...previousStatus}; }
export async function commitLocalModification(snapshot) {
  if (!session || !userId) throw Error("Connexion familiale absente.");
  if (viewBlocked()) throw Error("Le serveur doit être prêt avant toute modification.");
  return session.save(snapshot);
}
export async function confirmFirstCloudImport() {
  if (!session || previousStatus.phase !== "needs-import")
    throw Error("Premier import indisponible.");
  return session.initialImport(appOptions.readLocalState());
}
export async function retryUnconfirmedSave() {
  if (!session || previousStatus.phase !== "recovery")
    throw Error("Aucune modification à reprendre.");
  return session.retryDraft();
}
export async function loadServerDiscardingLocalDraft(confirmation) {
  if (!session) throw Error("Connexion familiale absente.");
  return session.resolveWithServer({confirmation});
}
