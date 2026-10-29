// Server-side snapshot export — intended ONLY for a separate private scheduled job.
// It does not run in Speedrive's public web app and is not scheduled yet.
// Requires environment configuration, read-only Firebase service credentials
// stored in a CI secret and a private encrypted backup destination.
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
// Official Google Cloud Firestore client supports external Workload Identity
// Federation credentials via Application Default Credentials (ADC).
import { Firestore } from "@google-cloud/firestore";
import { encryptOffsiteBackup, decryptOffsiteBackup } from "./v34-backup-archive.mjs";

const required = name => {
  const value=process.env[name];
  if(!value)throw Error("Configuration absente : "+name);
  return value;
};
function sanitizeName(s) {
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(s)) throw Error("Identifiant interdit.");
  return s;
}
async function main() {
  const uid=sanitizeName(required("SPEEDRIVE_ACCOUNT_UID"));
  const aesKey=required("SPEEDRIVE_BACKUP_KEY_B64");
  const directory=resolve(required("SPEEDRIVE_BACKUP_OUTPUT_DIR"));
  // Credentials are short-lived and generated from GitHub OIDC.
  // NO long-lived service-account JSON key is loaded or accepted.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw Error("Identité fédérée Google Cloud non configurée.");
  }
  const db=new Firestore({projectId:"speedrive-7e77c"});
  const prefix="vaults/"+uid;
  const head=(await db.doc(prefix+"/head/current").get());
  if(!head.exists)throw Error("Speedrive non initialisé : pas de base à sauvegarder.");
  const reference=head.data();
  const sid=sanitizeName(reference.snapshotId);
  const source=db.doc(prefix+"/snapshots/"+sid);
  const snap=await source.get();
  if(!snap.exists)throw Error("Snapshot Firestore manquant.");
  const parts=await source.collection("chunks").get();
  const ordered=parts.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index);
  if(ordered.length!==snap.data().count ||
     ordered.some((c,i)=>c.index!==i || typeof c.part!=="string"))
    throw Error("Photographie Firestore incomplète.");
  const chunks=ordered.map(c=>c.part);
  const json=JSON.parse(chunks.join(""));
  const ids=[...new Set(Object.values(json.photoRefs||{}))];
  const photos={};
  for(let i=0;i<ids.length;i+=6){
    await Promise.all(ids.slice(i,i+6).map(async id=>{
      sanitizeName(id);
      const found=await db.doc(prefix+"/photos/"+id).get();
      if(!found.exists)throw Error("Photo liée manquante : "+id);
      photos[id]=found.data().data;
    }));
  }
  if(!Number.isSafeInteger(snap.data().createdAt?.toMillis?.()))
    throw Error("Date de photographie absente : nettoyage sécurisé impossible.");
  const bundle={
    format:"speedrive-firestore-bundle-v1",
    projectId:"speedrive-7e77c",uid,
    head:{revision:reference.revision,snapshotId:sid},
    snapshot:{
      hash:snap.data().hash,count:snap.data().count,
      createdAtMillis:snap.data().createdAt?.toMillis?.()
    },
    chunks,photos
  };
  const archive=encryptOffsiteBackup(bundle,aesKey);
  // Verify decryption BEFORE a destination considers the file a backup.
  decryptOffsiteBackup(archive,aesKey);
  await mkdir(directory,{recursive:true,mode:0o700});
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const file=join(directory,"speedrive-"+stamp+"-r"+reference.revision+".sdrive");
  await writeFile(file,archive,{mode:0o600,flag:"wx"});
  console.log("Encrypted backup verified. Bytes:",archive.length,"revision:",reference.revision);
  console.log("Output file:",file);
}
main().catch(e=>{console.error("Speedrive backup failed:",e.message);process.exitCode=1});
