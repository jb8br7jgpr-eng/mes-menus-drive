// Speedrive — pure restore plan + guarded write routine.
// This code NEVER writes to the real production Firebase project.
import { decryptOffsiteBackup } from "./v34-backup-archive.mjs";

const validName = name => typeof name === "string" &&
  /^[A-Za-z0-9_-]{1,120}$/.test(name);
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function requireValid(condition,message) { if (!condition) throw Error(message); }

export function buildRestorePlan(archive,key,targetUid) {
  requireValid(validName(targetUid),"Identifiant de destination invalide.");
  const bundle=decryptOffsiteBackup(archive,key);
  const {head,snapshot,chunks,photos}=bundle;
  requireValid(validName(head.snapshotId),"Identifiant de sauvegarde invalide.");
  const parsed=JSON.parse(chunks.join(""));
  const requiredPhotos=[...new Set(Object.values(parsed.photoRefs||{}))];
  requiredPhotos.forEach(id=>requireValid(validHash(id),"Empreinte de photo invalide."));
  const photoRows=requiredPhotos.map(id=>({hash:id,data:photos[id]}));
  const data=parsed.state;
  requireValid(data?.schema===1 && Array.isArray(data.recipes) &&
    Array.isArray(data.products) && data.weeks && typeof data.weeks==="object",
    "Données Speedrive incomplètes.");
  return {
    ownerUid:targetUid,
    revision:head.revision,
    snapshotId:head.snapshotId,
    hash:snapshot.hash,
    count:chunks.length,
    bytes:Buffer.byteLength(chunks.join(""),"utf8"),
    chunks,
    photoRows,
    summary:{
      recipes:data.recipes.length,
      products:data.products.length,
      photos:photoRows.length,
      weeks:Object.keys(data.weeks).length,
      revision:head.revision
    }
  };
}

/** Non-production restore only. Caller must supply a Firestore Admin DB emulator. */
export async function writeRestoreToEmptyVault(db,plan,serverTimestamp) {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIRESTORE_EMULATOR_HOST.startsWith("127.0.0.1:") &&
      !process.env.FIRESTORE_EMULATOR_HOST.startsWith("localhost:"))
    throw Error("Restauration interdite hors de l'émulateur Firestore local.");
  if (process.env.SPEEDRIVE_ALLOW_TEST_RESTORE !== "YES")
    throw Error("Restauration de test non autorisée.");
  if (!validName(plan.ownerUid)||!validName(plan.snapshotId))
    throw Error("Identifiants invalides.");
  const root=db.collection("vaults").doc(plan.ownerUid);
  const head=root.collection("head").doc("current");
  const existing=await head.get();
  if (existing.exists) throw Error("Le coffre de destination contient déjà des données.");
  const snap=root.collection("snapshots").doc(plan.snapshotId);
  const snapDoc=await snap.get();
  if (snapDoc.exists) throw Error("L'identifiant du snapshot existe déjà.");
  // Create photos and blocks first; publish the restored head ONLY at the end.
  for(let pos=0;pos<plan.photoRows.length;pos+=100) {
    const batch=db.batch();
    for(const photo of plan.photoRows.slice(pos,pos+100)) {
      batch.create(root.collection("photos").doc(photo.hash),{
        hash:photo.hash,data:photo.data,createdAt:serverTimestamp()
      });
    }
    await batch.commit();
  }
  const batch=db.batch();
  batch.create(snap,{
    hash:plan.hash,count:plan.count,bytes:plan.bytes,
    ownerUid:plan.ownerUid,createdAt:serverTimestamp()
  });
  plan.chunks.forEach((part,index)=>batch.create(
    snap.collection("chunks").doc(String(index).padStart(4,"0")),
    {index,part,createdAt:serverTimestamp()}
  ));
  await batch.commit();
  // Recheck before exposing the new head; retain immutable docs if interrupted.
  if((await head.get()).exists)throw Error("Une version vient d'être créée simultanément.");
  await head.create({
    revision:plan.revision,snapshotId:plan.snapshotId,
    ownerUid:plan.ownerUid,updatedAt:serverTimestamp()
  });
  return plan.summary;
}
