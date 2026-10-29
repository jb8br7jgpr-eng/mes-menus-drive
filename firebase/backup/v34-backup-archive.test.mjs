import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { encryptOffsiteBackup, decryptOffsiteBackup } from "./v34-backup-archive.mjs";

const hash=s=>createHash("sha256").update(s).digest("hex");
function sample() {
  const photo="data:image/jpeg;base64,AQIDBA==",photoId=hash(photo);
  const state={format:"speedrive-v34",schema:1,
    state:{schema:1,recipes:[{id:"r1",name:"Soupe"}],products:[],weeks:{}},
    photoRefs:{r1:photoId}};
  const body=JSON.stringify(state);
  return {
    format:"speedrive-firestore-bundle-v1",
    projectId:"speedrive-7e77c",uid:"uid",
    head:{revision:3,snapshotId:"snapshot-3"},
    snapshot:{hash:hash(body),count:1},
    chunks:[body],photos:{[photoId]:photo}
  };
}
const key=randomBytes(32).toString("base64");
test("backup encryption is round-trippable with exact photos",()=>{
  const bundle=sample();
  const encrypted=encryptOffsiteBackup(bundle,key);
  assert.deepEqual(decryptOffsiteBackup(encrypted,key),bundle);
  assert.equal(encrypted.includes(Buffer.from("Soupe")),false);
});
test("wrong key or modified ciphertext fails authentication",()=>{
  const encrypted=encryptOffsiteBackup(sample(),key);
  assert.throws(()=>decryptOffsiteBackup(encrypted,randomBytes(32).toString("base64")));
  const corrupted=JSON.parse(encrypted.toString("utf8"));
  const bytes=Buffer.from(corrupted.data,"base64");
  bytes[0]^=1;
  corrupted.data=bytes.toString("base64");
  assert.throws(()=>decryptOffsiteBackup(Buffer.from(JSON.stringify(corrupted)),key));
});
test("no backup of partially missing photo data",()=>{
  const invalid=sample();
  invalid.photos={};
  assert.throws(()=>encryptOffsiteBackup(invalid,key),/Photo absente/);
});
test("no backup with invalid content checksum",()=>{
  const invalid=sample();
  invalid.chunks[0]=invalid.chunks[0].replace("Soupe","Pizza");
  assert.throws(()=>encryptOffsiteBackup(invalid,key),/Somme de contrôle/);
});
