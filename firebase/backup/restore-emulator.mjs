// RESTORE TEST ONLY. This CLI refuses any real Firestore project.
// Example:
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 SPEEDRIVE_ALLOW_TEST_RESTORE=YES \
// SPEEDRIVE_BACKUP_KEY_B64=... node backup/restore-emulator.mjs /private/archive.sdrive test-uid
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { buildRestorePlan, writeRestoreToEmptyVault } from "./v34-restore.mjs";

async function main() {
  const host=process.env.FIRESTORE_EMULATOR_HOST;
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
      process.env.SPEEDRIVE_ALLOW_TEST_RESTORE!=="YES") {
    throw Error("Restauration refusée : émulateur local et autorisation explicite requis.");
  }
  const [archivePath,targetUid]=process.argv.slice(2);
  if(!archivePath||!targetUid)throw Error("Archive et UID cible de test requis.");
  const key=process.env.SPEEDRIVE_BACKUP_KEY_B64;
  if(!key)throw Error("Clé de sauvegarde absente.");
  const bytes=await readFile(archivePath);
  const plan=buildRestorePlan(bytes,key,targetUid);
  console.log("Archive vérifiée : recettes",plan.summary.recipes,"produits",
    plan.summary.products,"photos",plan.summary.photos,"semaines",plan.summary.weeks);
  const app=initializeApp({projectId:"demo-speedrive-v34-restore"});
  const db=getFirestore(app);
  const restored=await writeRestoreToEmptyVault(db,plan,()=>FieldValue.serverTimestamp());
  const head=await db.doc("vaults/"+targetUid+"/head/current").get();
  if(!head.exists || head.data().revision!==restored.revision)
    throw Error("Restauration incomplète : en-tête non retrouvé.");
  console.log("Test de restauration validé dans l'émulateur :",restored.revision);
}
main().catch(error=>{
  console.error("ÉCHEC RESTAURATION TEST :",error.message);
  process.exitCode=1;
});
