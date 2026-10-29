// Safe emulator-only tests. Project name "demo-" cannot write to production.
import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { packState, unpackState } from "../v34-cloud-codec.js";

let environment;
const alice = () => environment.authenticatedContext("alice",{email_verified:true}).firestore();
const bob = () => environment.authenticatedContext("bob",{email_verified:true}).firestore();
const unverified = () => environment.authenticatedContext("alice",{email_verified:false}).firestore();
const anonymous = () => environment.unauthenticatedContext().firestore();

const root = "vaults/alice";
const snap = id => root+"/snapshots/"+id;
const head = root+"/head/current";
const photo = id => root+"/photos/"+id;
const hash = "a".repeat(64);
const item = id => ({hash,count:1,bytes:101,createdAt:serverTimestamp(),ownerUid:"alice"});
async function seed() {
  await assertSucceeds(setDoc(doc(alice(),snap("s1")),item("s1")));
  await assertSucceeds(setDoc(doc(alice(),snap("s1")+"/chunks/0000"),{
    index:0,part:"texte",createdAt:serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(alice(),head),{
    ownerUid:"alice",revision:1,snapshotId:"s1",updatedAt:serverTimestamp()
  }));
}
before(async()=>{
  const rules=readFileSync(new URL("../firestore-cloud-first.rules",import.meta.url),"utf8");
  environment=await initializeTestEnvironment({
    projectId:"demo-speedrive-v34",
    firestore:{rules,host:"127.0.0.1",port:8080}
  });
});
after(async()=>{await environment?.cleanup();});
beforeEach(async()=>{await environment.clearFirestore();});

test("anonymous visitor cannot see a family backup", async()=>{
  await seed();
  await assertFails(getDoc(doc(anonymous(),head)));
  await assertFails(getDoc(doc(anonymous(),snap("s1"))));
});
test("a different signed-in account cannot read the family's data",async()=>{
  await seed();
  await assertFails(getDoc(doc(bob(),head)));
  await assertFails(getDoc(doc(bob(),snap("s1"))));
  await assertFails(getDoc(doc(bob(),snap("s1")+"/chunks/0000")));
  await assertFails(setDoc(doc(bob(),photo(hash)),{
    hash,data:"data:image/jpeg;base64,AQID",createdAt:serverTimestamp()
  }));
});
test("unverified e-mail is denied even for the correct UID",async()=>{
  await seed();
  await assertFails(getDoc(doc(unverified(),head)));
});
test("verified family owner may read the confirmed revision",async()=>{
  await seed();
  await assertSucceeds(getDoc(doc(alice(),head)));
  await assertSucceeds(getDoc(doc(alice(),snap("s1"))));
});
test("first head cannot point to a missing snapshot",async()=>{
  await assertFails(setDoc(doc(alice(),head),{
    ownerUid:"alice",revision:1,snapshotId:"missing",updatedAt:serverTimestamp()
  }));
});
test("head must advance exactly one version and point to an immutable snapshot",async()=>{
  await seed();
  await assertFails(updateDoc(doc(alice(),head),{
    revision:3,snapshotId:"s1",updatedAt:serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(alice(),snap("s2")),item("s2")));
  await assertSucceeds(updateDoc(doc(alice(),head),{
    revision:2,snapshotId:"s2",updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(doc(alice(),head),{
    revision:2,snapshotId:"s1",updatedAt:serverTimestamp()
  }));
});
test("snapshot and photos cannot be modified or deleted by client",async()=>{
  await seed();
  await assertFails(updateDoc(doc(alice(),snap("s1")),{bytes:999}));
  await assertFails(deleteDoc(doc(alice(),snap("s1"))));
  const d=doc(alice(),photo(hash));
  await assertSucceeds(setDoc(d,{
    hash,data:"data:image/jpeg;base64,AQID",createdAt:serverTimestamp()
  }));
  await assertFails(updateDoc(d,{data:"other"}));
  await assertFails(deleteDoc(d));
});
test("invalid snapshots and photos are rejected",async()=>{
  await assertFails(setDoc(doc(alice(),snap("wrong")),{
    hash:"not-hash",count:1,bytes:10,ownerUid:"alice",createdAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(alice(),photo("bad")),{
    hash:"bad",data:"x",createdAt:serverTimestamp()
  }));
});

test("full V34 snapshot roundtrip keeps 14 meals and images using the actual security rules",async()=>{
  const photoData="data:image/jpeg;base64,AQIDBA==";
  const meals=Array.from({length:14},(_,i)=>({
    recipeId:i%2?"r1":"r2",portions:i%2?2:3
  }));
  const source={
    schema:1,
    recipes:[
      {id:"r1",name:"Soupe",image:photoData,ingredients:[{name:"Carotte",qty:2}]},
      {id:"r2",name:"Pâtes",image:photoData,ingredients:[{name:"Tomate",qty:4}]}
    ],
    products:[{id:"p1",name:"Lait",ean:"1234567890123"}],
    ingredientCatalog:[{id:"i1",name:"Carotte",productId:"p1"}],
    staples:[],
    weeks:{"2026-10-26":{meals,checked:["i1"],excluded:[],pantry:{i1:1}}},
    settings:{people:2}
  };
  const pack=await packState(source),sid="complete-test";
  for(const entry of pack.photos) {
    await assertSucceeds(setDoc(doc(alice(),photo(entry.id)),{
      hash:entry.id,data:entry.data,createdAt:serverTimestamp()
    }));
  }
  await assertSucceeds(setDoc(doc(alice(),snap(sid)),{
    hash:pack.hash,count:pack.count,bytes:pack.bytes,createdAt:serverTimestamp(),ownerUid:"alice"
  }));
  for(let i=0;i<pack.count;i++){
    await assertSucceeds(setDoc(doc(alice(),snap(sid)+"/chunks/"+String(i).padStart(4,"0")),{
      index:i,part:pack.chunks[i],createdAt:serverTimestamp()
    }));
  }
  await assertSucceeds(setDoc(doc(alice(),head),{
    ownerUid:"alice",revision:1,snapshotId:sid,updatedAt:serverTimestamp()
  }));
  const serverHead=await getDoc(doc(alice(),head));
  assert.equal(serverHead.data().revision,1);
  const metadata=await getDoc(doc(alice(),snap(sid)));
  const serverChunks=await getDocs(collection(alice(),snap(sid)+"/chunks"));
  const chunks=serverChunks.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index).map(d=>d.part);
  const photos={};
  for(const entry of pack.photos){
    const saved=await getDoc(doc(alice(),photo(entry.id)));
    photos[entry.id]=saved.data().data;
  }
  const restored=await unpackState({
    hash:metadata.data().hash,
    count:metadata.data().count,
    chunks
  },photos);
  assert.deepEqual(restored,source);
  assert.equal(restored.weeks["2026-10-26"].meals.length,14);
  assert.equal(restored.weeks["2026-10-26"].checked[0],"i1");
  assert.equal(pack.photos.length,1,"photos de même contenu dédupliquées");
});
