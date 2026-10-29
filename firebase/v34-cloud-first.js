// V34 cloud-first backend — isolated, NOT imported by current Speedrive UI.
// Single shared Firebase Auth account, online edits only, server is canonical.
// Every save is a new immutable snapshot, pointed to by one atomic versioned head.
// This is a development prototype: don't activate without backups and tests.
import { firebaseAuth, firebaseDb } from "../firebase-v34.js";
import {
  collection, doc, getDocFromServer, getDocsFromServer, setDoc,
  writeBatch, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { packState, unpackState, listPhotoRefs, detectNewDuplicates } from "./v34-cloud-codec.js";

const knownPhotosByAccount = new Map();
function knownPhotos(uid) {
  if (!knownPhotosByAccount.has(uid)) knownPhotosByAccount.set(uid,new Set());
  return knownPhotosByAccount.get(uid);
}
export class CloudUnavailable extends Error {
  constructor(message) { super(message); this.name = "CloudUnavailable"; }
}
export class CloudStaleVersion extends Error {
  constructor(currentRevision) {
    super("L'autre téléphone a enregistré une version plus récente. Aucun changement n'a été écrasé.");
    this.name = "CloudStaleVersion";
    this.serverRevision = currentRevision;
  }
}
export class CloudDuplicate extends Error {
  constructor(entries) {
    super("Un produit ou ingrédient existe déjà dans la bibliothèque commune.");
    this.name = "CloudDuplicate";
    this.entries = entries;
  }
}
function onlineAccount() {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) throw Error("Compte familial non connecté ou e-mail non vérifié.");
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new CloudUnavailable("Connexion Internet nécessaire pour modifier Speedrive.");
  return user.uid;
}
function refs(uid) {
  return {
    head: doc(firebaseDb, "vaults", uid, "head", "current"),
    snap: sid => doc(firebaseDb, "vaults", uid, "snapshots", sid),
    chunks: sid => collection(firebaseDb, "vaults", uid, "snapshots", sid, "chunks"),
    chunk: (sid, i) => doc(firebaseDb, "vaults", uid, "snapshots", sid, "chunks", String(i).padStart(4,"0")),
    photo: hash => doc(firebaseDb, "vaults", uid, "photos", hash)
  };
}
async function serverRead(getter) {
  try { return await getter(); }
  catch(e) { throw new CloudUnavailable(
    "Impossible de confirmer les données du serveur. Aucune donnée locale ne doit être remplacée : " +
    (e?.code || e?.message || "réseau indisponible"));
  }
}
function limitPhotoIntegrity(p, data) {
  if (!p.exists()) throw Error("Une photo est absente de Firebase.");
  if (typeof p.data().data !== "string") throw Error("Photo Firebase invalide.");
  data[p.id] = p.data().data;
}

export async function loadAuthoritativeState() {
  const uid = onlineAccount(), path = refs(uid);
  const head = await serverRead(()=>getDocFromServer(path.head));
  if (!head.exists()) return { status:"empty", revision:0, state:null };
  const { revision, snapshotId } = head.data();
  if (!Number.isSafeInteger(revision) || revision < 1 ||
    typeof snapshotId !== "string") throw Error("Référence cloud endommagée.");
  const metadata = await serverRead(()=>getDocFromServer(path.snap(snapshotId)));
  if (!metadata.exists()) throw Error("Version sauvegardée introuvable.");
  const info = metadata.data();
  const remoteChunks = await serverRead(()=>getDocsFromServer(path.chunks(snapshotId)));
  const parts = remoteChunks.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index);
  if (parts.length !== info.count || parts.some((v,i)=>v.index!==i || typeof v.part!=="string"))
    throw Error("La sauvegarde serveur est incomplète, chargement annulé.");
  const pack = { hash: info.hash, count: info.count, chunks: parts.map(x=>x.part) };
  const photos = {}, hashes = listPhotoRefs(pack);
  // Bounded concurrency keeps Safari responsive on large photo libraries.
  for (let offset=0;offset<hashes.length;offset+=6) {
    await Promise.all(hashes.slice(offset,offset+6).map(async hash=>{
      const image = await serverRead(()=>getDocFromServer(path.photo(hash)));
      limitPhotoIntegrity(image,photos);
    }));
  }
  const state = await unpackState(pack,photos); // integrity before replacing local state
  hashes.forEach(hash => knownPhotos(uid).add(hash));
  return { status:"ready", revision, state, updatedAt:head.data().updatedAt || null };
}

async function uploadPhotos(path, photos, uid) {
  // Reuse assets already verified or uploaded during this open session.
  const pending = photos.filter(image => !knownPhotos(uid).has(image.id));
  for (let offset=0; offset<pending.length; offset+=4) {
    await Promise.all(pending.slice(offset,offset+4).map(async image=>{
      const target=path.photo(image.id);
      const found=await serverRead(()=>getDocFromServer(target));
      if (found.exists()) {
        if (found.data()?.data !== image.data) throw Error("Collision de photo détectée.");
        knownPhotos(uid).add(image.id);
        return;
      }
      // Photo docs are immutable. Retry can encounter an already-created asset.
      await setDoc(target, {
        hash:image.id, data:image.data, createdAt:serverTimestamp()
      });
      knownPhotos(uid).add(image.id);
    }));
  }
}

export async function saveAuthoritativeState(nextState, expectedRevision, previousState,
  { allowInitialImport = false } = {}) {
  const uid = onlineAccount(), path = refs(uid);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw Error("Version serveur attendue invalide.");
  if (expectedRevision === 0 && !allowInitialImport)
    throw Error("Premier import : vérification et accord explicite nécessaires.");
  if (expectedRevision > 0 && !previousState)
    throw Error("La sauvegarde précédente est nécessaire pour vérifier les doublons.");
  const duplicateEntries=detectNewDuplicates(previousState,nextState);
  if (duplicateEntries.length && expectedRevision > 0) throw new CloudDuplicate(duplicateEntries);

  const pack=await packState(nextState), snapshotId=crypto.randomUUID();
  if (pack.count > 25) throw Error("Trop de blocs pour une sauvegarde atomique.");
  await uploadPhotos(path,pack.photos,uid);

  // Stage all chunks before changing head: partial uploads are not published.
  const batch = writeBatch(firebaseDb);
  batch.set(path.snap(snapshotId), {
    hash:pack.hash, count:pack.count, bytes:pack.bytes,
    createdAt:serverTimestamp(), ownerUid:uid
  });
  pack.chunks.forEach((part,index)=>batch.set(path.chunk(snapshotId,index),{
    index, part, createdAt:serverTimestamp()
  }));
  await batch.commit();

  // Compare-and-swap, so a stale iPhone can never replace a newer version.
  const revision=await runTransaction(firebaseDb, async tx=>{
    const head=await tx.get(path.head);
    const current=head.exists()?head.data().revision:0;
    if (current !== expectedRevision) throw new CloudStaleVersion(current);
    const next=current+1;
    tx.set(path.head,{
      revision:next, snapshotId, updatedAt:serverTimestamp(), ownerUid:uid
    });
    return next;
  });
  return { status:"saved", revision, snapshotId, bytes:pack.bytes, photoCount:pack.photos.length };
}
// No implicit writes on app launch or foreground. A future UI integration
// must explicitly show "Enregistrement..." until the returned status is saved.
// Failed saves leave the local draft untouched and require resolution.
