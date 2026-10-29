import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { encryptOffsiteBackup } from "./v34-backup-archive.mjs";
import { buildRestorePlan, writeRestoreToEmptyVault } from "./v34-restore.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex");
const key=randomBytes(32).toString("base64");
const photo="data:image/jpeg;base64,AQID";
const pid=hash(photo);
function archive() {
  const data=JSON.stringify({
    format:"speedrive-v34",schema:1,
    state:{schema:1,recipes:[{id:"r",name:"Soupe"}],
      products:[{id:"p",name:"Lait"}],
      weeks:{"2026-10-26":{meals:[null,null]}}},
    photoRefs:{r:pid}
  });
  const bundle={
    format:"speedrive-firestore-bundle-v1",
    head:{revision:7,snapshotId:"snapshot_test_7"},
    snapshot:{hash:hash(data),count:1},
    chunks:[data],photos:{[pid]:photo}
  };
  return encryptOffsiteBackup(bundle,key);
}
class MemoryFirestore {
  constructor(){this.data=new Map()}
  collection(name){return this.ref(name)}
  ref(path) {
    const db=this;
    return {
      path,
      doc(id){return db.ref(path+"/"+id)},
      collection(name){return db.ref(path+"/"+name)},
      async get(){return {exists:db.data.has(path),data:()=>db.data.get(path)}},
      async create(record){
        if(db.data.has(path))throw Error("Already exists");
        db.data.set(path,record);
      }
    };
  }
  batch(){
    const writes=[];const db=this;
    return {
      create(ref,data){writes.push([ref.path,data])},
      async commit(){
        for(const [path] of writes)if(db.data.has(path))throw Error("Already exists");
        for(const [path,data] of writes)db.data.set(path,data);
      }
    };
  }
}
test("restoration plan validates all encrypted photos",()=>{
  const plan=buildRestorePlan(archive(),key,"test_account");
  assert.equal(plan.summary.revision,7);
  assert.equal(plan.summary.recipes,1);
  assert.equal(plan.summary.products,1);
  assert.equal(plan.summary.photos,1);
  assert.equal(plan.summary.weeks,1);
  assert.throws(()=>buildRestorePlan(archive(),randomBytes(32).toString("base64"),"test_account"));
  assert.throws(()=>buildRestorePlan(archive(),key,"../unauthorized"),/destination invalide/);
});
test("restore is refused without strict local emulator guard",async()=>{
  const plan=buildRestorePlan(archive(),key,"test_account");
  const db=new MemoryFirestore();
  const oldHost=process.env.FIRESTORE_EMULATOR_HOST;
  const oldFlag=process.env.SPEEDRIVE_ALLOW_TEST_RESTORE;
  try {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.SPEEDRIVE_ALLOW_TEST_RESTORE="YES";
    await assert.rejects(()=>writeRestoreToEmptyVault(db,plan,()=>0),/interdite/);
    process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8080";
    delete process.env.SPEEDRIVE_ALLOW_TEST_RESTORE;
    await assert.rejects(()=>writeRestoreToEmptyVault(db,plan,()=>0),/non autorisée/);
    assert.equal(db.data.size,0);
  } finally {
    if(oldHost===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST=oldHost;
    if(oldFlag===undefined)delete process.env.SPEEDRIVE_ALLOW_TEST_RESTORE;
    else process.env.SPEEDRIVE_ALLOW_TEST_RESTORE=oldFlag;
  }
});
test("fresh isolated vault restores photos, chunks and head LAST",async()=>{
  const plan=buildRestorePlan(archive(),key,"test_account");
  const db=new MemoryFirestore(),oldHost=process.env.FIRESTORE_EMULATOR_HOST,
    oldFlag=process.env.SPEEDRIVE_ALLOW_TEST_RESTORE;
  try {
    process.env.FIRESTORE_EMULATOR_HOST="localhost:8080";
    process.env.SPEEDRIVE_ALLOW_TEST_RESTORE="YES";
    const outcome=await writeRestoreToEmptyVault(db,plan,()=>0);
    assert.equal(outcome.revision,7);
    const head=db.data.get("vaults/test_account/head/current");
    assert.equal(head.revision,7);
    assert.ok(db.data.has("vaults/test_account/snapshots/snapshot_test_7"));
    assert.ok(db.data.has("vaults/test_account/snapshots/snapshot_test_7/chunks/0000"));
    assert.ok(db.data.has("vaults/test_account/photos/"+pid));
    await assert.rejects(()=>writeRestoreToEmptyVault(db,plan,()=>0),/déjà/);
  } finally {
    if(oldHost===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST=oldHost;
    if(oldFlag===undefined)delete process.env.SPEEDRIVE_ALLOW_TEST_RESTORE;
    else process.env.SPEEDRIVE_ALLOW_TEST_RESTORE=oldFlag;
  }
});
