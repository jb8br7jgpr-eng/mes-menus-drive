// Speedrive V34 — file locale durable. Non utilisée par l'application V33.
// IMPORTANT : queue -> server ONLY through versioned Firestore transactions.
// No writes are sent by this module unless flushPendingEdits is called explicitly.
import { commitSharedRecord, SyncConflict, DuplicateRecord } from "./sync-api-v34.js";
import { firebaseAuth } from "../firebase-v34.js";

const DB_NAME = "speedrive-v34-outbox";
const STORE = "edits";
const LOCKS = "leases";
const DB_VERSION = 1;
const LEASE_MS = 90000;
const MAX_PAYLOAD_BYTES = 750000;
let connection = null;
let active = false;

export class QueuedEditConflict extends Error {
  constructor(message) { super(message); this.name = "QueuedEditConflict"; }
}
const clone = value => JSON.parse(JSON.stringify(value));
const requireId = value => {
  if (typeof value !== "string" || !value || value.length > 400 || value.includes("/"))
    throw Error("Identifiant de synchronisation invalide.");
  return value;
};
const idFor = (userUid, householdId, recordId) =>
  JSON.stringify([requireId(userUid), requireId(householdId), requireId(recordId)]);
function requireOwnAccount(userUid) {
  if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userUid)
    throw Error("Compte Firebase différent : synchronisation refusée.");
}
const announce = () => {
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined")
    window.dispatchEvent(new CustomEvent("speedrive-v34-queue-change"));
};
export function openOutbox() {
  if (connection) return connection;
  if (typeof indexedDB === "undefined") return Promise.reject(Error(
    "Stockage sécurisé indisponible : modifications hors ligne désactivées."
  ));
  connection = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(LOCKS)) db.createObjectStore(LOCKS, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { connection = null; reject(req.error || Error("IndexedDB indisponible.")); };
    req.onblocked = () => { connection = null; reject(Error("Stockage bloqué par un autre onglet.")); };
  });
  return connection;
}
async function transaction(storeNames, handler) {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    let result;
    try { handler(tx, value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || Error("Transaction locale annulée."));
    tx.onerror = () => reject(tx.error || Error("Erreur IndexedDB."));
  });
}
async function listAll() {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || Error("Lecture locale impossible."));
  });
}
export async function listQueuedEdits(userUid, householdId) {
  requireOwnAccount(userUid);
  requireId(userUid); requireId(householdId);
  const records = await listAll();
  return records
    .filter(item => item.userUid === userUid && item.householdId === householdId)
    .sort((a, b) => a.createdAt - b.createdAt).map(clone);
}
export async function queueLocalEdit(userUid, householdId, input, expectedVersion = 0) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    throw Error("Version de base invalide.");
  requireOwnAccount(userUid);
  const key = idFor(userUid, householdId, input?.id);
  const kind = requireId(input?.kind);
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload))
    throw Error("Modifications invalides.");
  const payload = clone(input.payload);
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PAYLOAD_BYTES)
    throw Error("Modification trop volumineuse pour l'enregistrement local.");
  const now = Date.now();
  const saved = await transaction([STORE], (tx, done) => {
    const store = tx.objectStore(STORE);
    store.get(key).onsuccess = event => {
      const previous = event.target.result;
      if (previous?.status === "conflict") {
        done({ conflict: true }); return;
      }
      if (previous && previous.kind !== kind) { done({ conflict: true }); return; }
      if (previous && expectedVersion !== previous.expectedVersion &&
          expectedVersion !== previous.expectedVersion + 1) {
        // The caller has an incompatible known server base.
        done({ conflict: true }); return;
      }
      // Unpublished create immediately cancelled: no server record to delete.
      if (input.deleted && expectedVersion === 0 && !previous) {
        done({ cancelled: true }); return;
      }
      if (input.deleted && previous?.expectedVersion === 0 &&
          previous.status === "pending" && previous.attempts === 0) {
        store.delete(key); done({ cancelled: true }); return;
      }
      const updated = {
        key, userUid, householdId, recordId: input.id, kind, payload,
        deleted: Boolean(input.deleted), expectedVersion: previous?.expectedVersion ?? expectedVersion,
        mutationId: crypto.randomUUID(),
        revision: (previous?.revision || 0) + 1,
        createdAt: previous?.createdAt || now, updatedAt: now,
        status: previous?.status === "sending" ? "sending" : "pending",
        attempts: previous?.attempts || 0, lastError: null, serverRecord: null
      };
      store.put(updated);
      done(updated);
    };
  });
  if (saved.conflict) throw new QueuedEditConflict(
    "Modification déjà en conflit ou version de base incompatible."
  );
  announce();
  return clone(saved);
}
async function acquireLease(userUid, householdId) {
  const key = JSON.stringify([userUid, householdId]);
  const token = crypto.randomUUID();
  const result = await transaction([LOCKS], (tx, done) => {
    const store = tx.objectStore(LOCKS);
    store.get(key).onsuccess = event => {
      const old = event.target.result;
      if (old && old.until > Date.now()) { done(false); return; }
      store.put({ key, token, until: Date.now() + LEASE_MS });
      done(true);
    };
  });
  return result ? { key, token } : null;
}
async function releaseLease(lease) {
  await transaction([LOCKS], (tx) => {
    const store = tx.objectStore(LOCKS);
    store.get(lease.key).onsuccess = event => {
      if (event.target.result?.token === lease.token) store.delete(lease.key);
    };
  });
}
async function recoverSending(userUid, householdId) {
  return transaction([STORE], tx => {
    const store = tx.objectStore(STORE);
    store.openCursor().onsuccess = event => {
      const cursor = event.target.result;
      if (!cursor) return;
      const item = cursor.value;
      if (item.userUid === userUid && item.householdId === householdId &&
          item.status === "sending") {
        cursor.update({ ...item, status: "pending" });
      }
      cursor.continue();
    };
  });
}
async function markSending(entry) {
  return transaction([STORE], (tx, done) => {
    const store = tx.objectStore(STORE);
    store.get(entry.key).onsuccess = event => {
      const latest = event.target.result;
      if (!latest || latest.revision !== entry.revision || latest.status !== "pending") {
        done(null); return;
      }
      store.put({ ...latest, status: "sending", attempts: latest.attempts + 1 });
      done(latest);
    };
  });
}
async function settle(entry, result, error = null) {
  await transaction([STORE], (tx) => {
    const store = tx.objectStore(STORE);
    store.get(entry.key).onsuccess = event => {
      const latest = event.target.result;
      if (!latest) return;
      if (!error) {
        if (latest.revision === entry.revision) store.delete(entry.key);
        else store.put({ ...latest, expectedVersion: result, status: "pending" });
      } else {
        const conflict = error instanceof SyncConflict || error instanceof DuplicateRecord;
        store.put({ ...latest,
          status: conflict ? "conflict" : "pending",
          serverRecord: conflict ? clone(error.serverRecord || null) : null,
          lastError: String(error.message || "Erreur réseau").slice(0, 250)
        });
      }
    };
  });
  announce();
}
export async function flushPendingEdits(userUid, householdId, onProgress = () => {}) {
  requireOwnAccount(userUid);
  requireId(userUid); requireId(householdId);
  if (active) return { busy: true };
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { offline: true, pending: (await listQueuedEdits(userUid, householdId)).length };
  const lease = await acquireLease(userUid, householdId);
  if (!lease) return { busy: true };
  active = true;
  let synced = 0, conflicts = 0, paused = false;
  try {
    await recoverSending(userUid, householdId);
    const batch = await listQueuedEdits(userUid, householdId);
    for (const item of batch) {
      if (item.status !== "pending") continue;
      const entry = await markSending(item);
      if (!entry) continue;
      try {
        const version = await commitSharedRecord(householdId, {
          id: entry.recordId, kind: entry.kind, payload: entry.payload,
          deleted: entry.deleted, mutationId: entry.mutationId
        }, entry.expectedVersion);
        await settle(entry, version);
        synced++;
      } catch (error) {
        await settle(entry, null, error);
        if (error instanceof SyncConflict || error instanceof DuplicateRecord) {
          conflicts++;
        } else {
          paused = true; // keep durable changes, retry on next foreground/online event
        }
      }
      onProgress({ synced, conflicts, paused });
      if (paused) break;
    }
    return { synced, conflicts, paused, pending: (await listQueuedEdits(userUid, householdId)).length };
  } finally {
    active = false;
    await releaseLease(lease);
  }
}
export async function resolveQueuedConflict(userUid, householdId, recordId, choice, serverVersion) {
  requireOwnAccount(userUid);
  const key = idFor(userUid, householdId, recordId);
  if (!["keep-local", "discard-local"].includes(choice)) throw Error("Choix invalide.");
  if (choice === "keep-local" && (!Number.isSafeInteger(serverVersion) || serverVersion < 0))
    throw Error("Version serveur invalide.");
  await transaction([STORE], (tx) => {
    const store = tx.objectStore(STORE);
    store.get(key).onsuccess = event => {
      const item = event.target.result;
      if (!item || item.status !== "conflict") { tx.abort(); return; }
      if (choice === "discard-local") store.delete(key);
      else store.put({ ...item, expectedVersion: serverVersion,
        mutationId: crypto.randomUUID(), status: "pending", serverRecord: null, lastError: null });
    };
  });
  announce();
}

/**
 * Call only after the family account + rules have been activated.
 * Foreground/online retry; iOS web apps do NOT guarantee background sync
 * while Safari/the PWA is closed.
 */
export function startForegroundQueueSync(userUid, householdId, callback = () => {}) {
  requireOwnAccount(userUid);
  const attempt = async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try { callback(await flushPendingEdits(userUid, householdId)); }
    catch (error) { callback({ paused: true, error: String(error.message || error) }); }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void attempt();
  };
  const onOnline = () => { void attempt(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  // Foreground watchdog also retries after leases left by crashed sessions.
  const timer = window.setInterval(onVisible, 30000);
  void attempt();
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
