// Speedrive V34 — interface Firestore isolée (non importée par la V33).
// NE PAS raccorder persist() à une écriture globale de l'état local.
import { firebaseAuth, firebaseDb } from "../firebase-v34.js";
import { productFingerprint, ingredientFingerprint } from "./v34-model.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  reload,
  getIdToken
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  setDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

export class DuplicateRecord extends Error {
  constructor(key, recordId) {
    super("Doublon détecté dans le catalogue familial.");
    this.name = "DuplicateRecord";
    this.uniqueKey = key;
    this.recordId = recordId;
  }
}
const uniqueKeyFor = (kind, payload) => {
  if (kind !== "product" && kind !== "ingredient") return null;
  const raw = kind === "product" ? productFingerprint(payload) : ingredientFingerprint(payload);
  if (!raw) throw Error("Un produit ou ingrédient doit avoir un nom valide.");
  return kind + ":" + encodeURIComponent(raw);
};

export class SyncConflict extends Error {
  constructor(message, serverRecord = null) {
    super(message);
    this.name = "SyncConflict";
    this.serverRecord = serverRecord;
  }
}
const validId = id => typeof id === "string" && id.length > 0 && id.length < 600 && !id.includes("/");
const cleanPayload = payload => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error("Payload invalide.");
  const result = JSON.parse(JSON.stringify(payload));
  if (new TextEncoder().encode(JSON.stringify(result)).length > 750000) {
    throw Error("Document trop lourd : séparer ou compresser la photo.");
  }
  return result;
};
const verifiedUser = () => {
  const user = firebaseAuth.currentUser;
  if (!user) throw Error("Compte non connecté.");
  if (!user.emailVerified) throw Error("Adresse e-mail à vérifier avant la synchronisation.");
  return user;
};

export async function persistentLogin() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
}
export const observeLogin = (callback, onError) => onAuthStateChanged(firebaseAuth, callback, onError);
export async function signUp(email, password) {
  await persistentLogin();
  const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await sendEmailVerification(result.user);
  return result.user;
}
export async function signIn(email, password) {
  await persistentLogin();
  return (await signInWithEmailAndPassword(firebaseAuth, email, password)).user;
}
export async function resendVerification() {
  const user = firebaseAuth.currentUser;
  if (!user) throw Error("Compte non connecté.");
  await sendEmailVerification(user);
}
export const signOutAccount = () => signOut(firebaseAuth);
export const ownAccountCode = () => verifiedUser().uid;

export async function findMyHousehold() {
  verifiedUser();
  const profile = await getDoc(doc(firebaseDb, "userProfiles", firebaseAuth.currentUser.uid));
  if (!profile.exists() || !profile.data()?.householdId) return null;
  return fetchHousehold(profile.data().householdId);
}
export async function connectHousehold(hid) {
  verifiedUser();
  if (!validId(hid)) throw Error("Code d'espace invalide.");
  const household = await fetchHousehold(hid);
  if (!household) throw Error("Espace familial introuvable.");
  await setDoc(doc(firebaseDb, "userProfiles", firebaseAuth.currentUser.uid), {
    householdId: hid, updatedAt: serverTimestamp()
  });
  return household;
}
export async function refreshVerifiedAccount() {
  const user = firebaseAuth.currentUser;
  if (!user) throw Error("Compte non connecté.");
  await reload(user);
  if (user.emailVerified) await getIdToken(user, true);
  return user.emailVerified;
}

export async function createHousehold(name = "Speedrive") {
  const uid = verifiedUser().uid;
  const hid = crypto.randomUUID();
  // Create the space AND its owner pointer atomically. No orphan space if
  // the phone loses its connection between the two writes.
  const batch = writeBatch(firebaseDb);
  batch.set(doc(firebaseDb, "households", hid), {
    ownerUid: uid, name: String(name).slice(0, 80), createdAt: serverTimestamp()
  });
  batch.set(doc(firebaseDb, "userProfiles", uid), {
    householdId: hid, updatedAt: serverTimestamp()
  });
  await batch.commit();
  return hid;
}
export async function addSecondPhone(hid, accountUid) {
  verifiedUser();
  if (!validId(hid) || !validId(accountUid)) throw Error("Identifiant invalide.");
  if (accountUid === firebaseAuth.currentUser.uid) throw Error("Ce compte est déjà propriétaire.");
  const ref = doc(firebaseDb, "households", hid, "members", accountUid);
  if ((await getDoc(ref)).exists()) return false; // idempotent invitation
  await setDoc(ref, { uid: accountUid, role: "member", createdAt: serverTimestamp() });
  return true;
}
export async function fetchHousehold(hid) {
  verifiedUser();
  if (!validId(hid)) throw Error("Espace invalide.");
  const snapshot = await getDoc(doc(firebaseDb, "households", hid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
export function observeSharedRecords(hid, callback, onError) {
  verifiedUser();
  if (!validId(hid)) throw Error("Espace invalide.");
  return onSnapshot(collection(firebaseDb, "households", hid, "records"),
    { includeMetadataChanges: true },
    snapshot => callback({
      records: snapshot.docs.map(d => ({ ...d.data(), documentId: d.id })),
      fromCache: snapshot.metadata.fromCache,
      pendingWrites: snapshot.metadata.hasPendingWrites
    }),
    onError
  );
}

// Each record has an independent version. Stale versions are refused,
// rather than silently overwriting another phone's changes.
// Firestore transactions need network access: queue offline edits separately.
export async function commitSharedRecord(hid, input, expectedVersion = 0) {
  const uid = verifiedUser().uid;
  if (!validId(hid) || !validId(input?.id)) throw Error("Identifiant invalide.");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw Error("Version attendue invalide.");
  const kind = String(input.kind || "");
  const payload = cleanPayload(input.payload);
  // Stable ID supplied by the durable outbox; retries become idempotent.
  const mutationId = input.mutationId || crypto.randomUUID();
  if (!validId(mutationId) || mutationId.length > 100) throw Error("Mutation invalide.");
  const key = uniqueKeyFor(kind, payload);
  const target = doc(firebaseDb, "households", hid, "records", input.id);
  return runTransaction(firebaseDb, async tx => {
    // Read all documents BEFORE writing; Firestore transactions require this.
    const snapshot = await tx.get(target);
    const previous = snapshot.exists() ? snapshot.data() : null;
    const version = previous?.version || 0;
    if (previous?.lastMutationId === mutationId) return version;
    const lock = !previous && key
      ? doc(firebaseDb, "households", hid, "uniqueKeys", key) : null;
    const reserved = lock ? await tx.get(lock) : null;
    if (version !== expectedVersion) throw new SyncConflict(
      "Modifications simultanées : une comparaison est nécessaire.", previous
    );
    if (previous && previous.kind !== kind) throw Error("Type d'élément non modifiable.");
    if (previous && previous.uniqueKey !== key) {
      throw Error("Renommage du produit ou de l'ingrédient : réindexation sécurisée à développer.");
    }
    if (reserved?.exists()) {
      throw new DuplicateRecord(key, reserved.data()?.recordId);
    }
    if (previous) {
      tx.update(target, {
        payload, version: version + 1, updatedAt: serverTimestamp(),
        updatedBy: uid, deleted: Boolean(input.deleted), lastMutationId: mutationId
      });
    } else {
      if (input.deleted) throw Error("Impossible de supprimer un élément inexistant.");
      if (lock) {
        tx.set(lock, {
          key, kind, recordId: input.id, createdAt: serverTimestamp(),
          createdBy: uid
        });
      }
      tx.set(target, {
        id: input.id, kind, payload, uniqueKey: key, version: 1, deleted: false,
        createdAt: serverTimestamp(), createdBy: uid,
        updatedAt: serverTimestamp(), updatedBy: uid, lastMutationId: mutationId
      });
    }
    return version + 1;
  });
}
export async function softDeleteSharedRecord(hid, previous) {
  if (!previous?.id) throw Error("Aucun élément à supprimer.");
  return commitSharedRecord(hid, {
    id: previous.id, kind: previous.kind, payload: previous.payload, deleted: true
  }, previous.version);
}
