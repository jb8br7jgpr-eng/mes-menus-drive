// Speedrive V34 — pure cloud-first session coordinator.
// NO Firebase or browser imports: can be tested with simulated server/storage.
// Never silently import local data, overwrite a local draft or declare unsent changes saved.

const clone = value => JSON.parse(JSON.stringify(value));
const checkUid = uid => {
  if (typeof uid !== "string" || !uid || uid.length > 200) throw Error("Compte invalide.");
  return uid;
};
export function createCloudSession({cloud, storage, applyServerState, onStatus = () => {}}) {
  if (!cloud || !storage || typeof applyServerState !== "function") throw Error("Configuration manquante.");
  let phase = "idle", revision = null, owner = null, confirmed = null, draft = null, busy = false;
  const snapshot = () => ({ phase, revision, hasDraft: !!draft, owner });
  function update(next, extra = {}) {
    phase = next;
    onStatus({ ...snapshot(), ...extra });
  }
  function guardReady() {
    if (phase !== "ready" || busy || revision == null || !confirmed)
      throw Error("Speedrive est en lecture seule tant que la synchronisation n'est pas confirmée.");
  }
  async function adoptServer(result) {
    if (result.status !== "ready" || !result.state) throw Error("État distant invalide.");
    // Preserve the draft until both local persistence and memory activation succeed.
    await storage.saveConfirmed(owner,clone(result.state),result.revision);
    await applyServerState(clone(result.state));
    confirmed = clone(result.state);
    revision = result.revision;
    await storage.clearDraft(owner);
    draft = null;
    update("ready", { saved: true });
  }
  async function open(uid) {
    if (busy) throw Error("Une sauvegarde est en cours.");
    busy = true;
    owner = checkUid(uid);
    confirmed = null; revision = null; draft = null;
    update("loading");
    try {
      draft = await storage.readDraft(owner);
      const remote = await cloud.loadAuthoritativeState();
      if (remote.status === "empty") {
        revision = 0;
        update(draft ? "recovery" : "needs-import", { remoteEmpty: true });
      } else if (remote.status === "ready") {
        revision = remote.revision;
        confirmed = clone(remote.state);
        if (draft) {
          update("recovery", { serverRevision: remote.revision });
        } else {
          await adoptServer(remote);
        }
      } else throw Error("Réponse cloud inattendue.");
      return snapshot();
    } catch (error) {
      update(draft ? "recovery" : "readonly", { error: String(error.message || error) });
      return snapshot();
    } finally { busy = false; }
  }
  async function upload(nextState, firstImport) {
    const clean = clone(nextState);
    const base = revision;
    draft = { state: clean, expectedRevision: base, createdAt: Date.now() };
    update("saving");
    // Durable draft MUST be stored before sending anything to Firestore.
    await storage.saveDraft(owner, draft);
    const result = await cloud.saveAuthoritativeState(clean,base,
      firstImport ? null : confirmed,{ allowInitialImport: firstImport });
    // A confirmed server save can still be followed by a local storage error;
    // keeping the draft ensures the next launch can resolve that case safely.
    await storage.saveConfirmed(owner,clean,result.revision);
    confirmed = clean; revision = result.revision;
    await storage.clearDraft(owner);
    draft = null;
    update("ready", { saved: true, serverRevision: revision });
    return result;
  }
  async function initialImport(localState) {
    if (busy || phase !== "needs-import" || revision !== 0)
      throw Error("Import initial interdit : serveur ou compte non vérifié.");
    busy = true;
    try {
      const result = await upload(localState,true);
      return result;
    } catch (e) {
      update(draft ? "recovery" : "readonly", { error: String(e.message || e) });
      throw e;
    } finally { busy = false; }
  }
  async function save(nextState) {
    guardReady();
    busy = true;
    try { return await upload(nextState,false); }
    catch (e) {
      update(draft ? "recovery" : "readonly", {
        error: String(e.message || e),
        stale: e.name === "CloudStaleVersion"
      });
      throw e;
    } finally { busy = false; }
  }
  async function resolveWithServer({ confirmation } = {}) {
    if (confirmation !== "ABANDONNER_LE_BROUILLON" || phase !== "recovery" || busy)
      throw Error("Une confirmation explicite est nécessaire.");
    busy = true;update("loading");
    try {
      const remote = await cloud.loadAuthoritativeState();
      if (remote.status !== "ready") throw Error("Version serveur inaccessible.");
      await adoptServer(remote); // only after an explicit decision
      return snapshot();
    } catch (e) { update("recovery", { error: String(e.message || e) });throw e; }
    finally { busy = false; }
  }
  async function retryDraft() {
    if (busy || phase !== "recovery" || !draft)
      throw Error("Aucun brouillon à reprendre.");
    busy = true; update("loading");
    try {
      const remote = await cloud.loadAuthoritativeState();
      const current = remote.status === "empty" ? 0 : remote.revision;
      if (current !== draft.expectedRevision) {
        // Lost confirmation: the remote commit already contains this exact draft.
        // After a verified server download we can safely mark it confirmed.
        if (remote.status === "ready" &&
            JSON.stringify(remote.state) === JSON.stringify(draft.state)) {
          await adoptServer(remote);
          return { recovered: true, revision: current, status: "saved" };
        }
        update("recovery", { stale: true, serverRevision: current,
          error: "La version du serveur a changé : résolution manuelle nécessaire." });
        return { stale: true, serverRevision: current };
      }
      confirmed = remote.status === "ready" ? clone(remote.state) : null;
      revision = current;
      const result = await upload(draft.state,current === 0);
      return result;
    } catch (e) { update("recovery",{error:String(e.message||e)});throw e; }
    finally { busy = false; }
  }
  return {open,save,initialImport,resolveWithServer,retryDraft,status:snapshot};
}
