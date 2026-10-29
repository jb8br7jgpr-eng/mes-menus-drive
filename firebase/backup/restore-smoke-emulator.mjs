// Integration smoke test on a FAKE Firebase project only.
// Invoked by "firebase emulators:exec", never needs real credentials.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { encryptOffsiteBackup } from "./v34-backup-archive.mjs";
import { buildRestorePlan, writeRestoreToEmptyVault } from "./v34-restore.mjs";

async function main() {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||""))
    throw Error("Smoke test limited to the local emulator.");
  process.env.SPEEDRIVE_ALLOW_TEST_RESTORE="YES";
  const projectId="demo-speedrive-v34";
  const app=initializeApp({projectId});
  const db=getFirestore(app);
  const state={schema:1,
    recipes:[{id:"r1",name:"Soupe aux légumes",ingredients:[{name:"Carotte",qty:2,unit:"pièce"}]}],
    products:[{id:"p1",name:"Lait",ean:"12345678"}],
    weeks:{"2026-10-26":{meals:[{recipeId:"r1"},null],checked:["ingredient:p1"]}}};
  const photo="data:image/jpeg;base64,AQID";
  const hash=v=>createHash("sha256").update(v).digest("hex");
  const photoHash=hash(photo);
  const contents=JSON.stringify({
    format:"speedrive-v34",schema:1,state,photoRefs:{r1:photoHash}
  });
  const bundle={
    format:"speedrive-firestore-bundle-v1",projectId,uid:"test-user",
    head:{revision:4,snapshotId:"smoke_backup_4"},
    snapshot:{hash:hash(contents),count:1},
    chunks:[contents],photos:{[photoHash]:photo}
  };
  const key=randomBytes(32).toString("base64");
  const archive=encryptOffsiteBackup(bundle,key);
  const plan=buildRestorePlan(archive,key,"fresh-emulator-user");
  await writeRestoreToEmptyVault(db,plan,()=>FieldValue.serverTimestamp());
  const root=db.collection("vaults").doc("fresh-emulator-user");
  const [head,snapshot,chunk,restoredPhoto]=await Promise.all([
    root.collection("head").doc("current").get(),
    root.collection("snapshots").doc("smoke_backup_4").get(),
    root.collection("snapshots").doc("smoke_backup_4").collection("chunks").doc("0000").get(),
    root.collection("photos").doc(photoHash).get()
  ]);
  assert.equal(head.data().revision,4);
  assert.equal(snapshot.data().hash,hash(contents));
  assert.deepEqual(JSON.parse(chunk.data().part).state,state);
  assert.equal(restoredPhoto.data().data,photo);
  console.log("PASS emulator restore: menus, recipes, products and photo verified.");
}
main().catch(e=>{console.error("FAIL emulator restore:",e.message);process.exitCode=1});
