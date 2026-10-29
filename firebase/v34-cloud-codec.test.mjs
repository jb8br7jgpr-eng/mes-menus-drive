// V34 — tests sans Firebase des photographies cloud et des repas V33.
import test from "node:test";
import assert from "node:assert/strict";
import {
  packState, unpackState, listPhotoRefs, splitUtf8,
  sha256Hex, detectNewDuplicates, SnapshotLimitError
} from "./v34-cloud-codec.js";

const photo="data:image/jpeg;base64,AQIDBA==";
function example() {
  const meals=Array.from({length:14},(_,i)=>i%3===0?{recipeId:"rec-1",portions:2}:null);
  return {
    schema:1, recipes:[
      {id:"rec-1",name:"Soupe 🍲",image:photo,ingredients:[{ingredientId:"ing-1",name:"Carotte",qty:2,unit:"pièce"}]},
      {id:"rec-2",name:"Soupe du dimanche",image:photo,ingredients:[]}
    ], products:[{id:"p1",name:"Lait",ean:"1234567890123"}],
    ingredientCatalog:[{id:"ing-1",name:"Carotte",productId:"p1"}],
    staples:[{id:"s1",name:"Sel",qty:1,unit:"paquet"}],
    weeks:{"2026-10-26":{meals,extras:[{ingredientId:"ing-1",qty:3}],
      checked:["ing-1"],excluded:[],pantry:{"ing-1":true},pantryUnits:{"ing-1":2}}},
    settings:{people:2},favoritesUnifiedV29:true,coursesExplicitGenerationV1:true
  };
}
test("14 repas, produits, liens, cases cochees et photos survivent a un aller-retour cloud",async()=>{
  const state=example(),before=JSON.stringify(state);
  const packed=await packState(state);
  assert.equal(JSON.stringify(state),before,"l'export ne doit pas modifier l'etat V33");
  assert.equal(packed.photos.length,1,"meme photo partagee entre deux recettes");
  assert.equal(packed.count,packed.chunks.length);
  assert.deepEqual(listPhotoRefs(packed),[packed.photos[0].id]);
  const restored=await unpackState(packed,{[packed.photos[0].id]:packed.photos[0].data});
  assert.deepEqual(restored,state);
  assert.equal(restored.weeks["2026-10-26"].meals.length,14);
});
test("blocs Unicode decoupes sans casser les caracteres multi-octets",()=>{
  const raw="A🍲É🥕z".repeat(500);
  const pieces=splitUtf8(raw,6);
  assert.equal(pieces.join(""),raw);
  assert.ok(pieces.every(p=>new TextEncoder().encode(p).length<=6));
});
test("un bloc modifie est refuse avant toute restauration",async()=>{
  const packed=await packState(example());
  const damaged={...packed,chunks:[...packed.chunks]};
  damaged.chunks[0]=damaged.chunks[0].replace("Soupe","Soupo");
  await assert.rejects(()=>unpackState(damaged,{}),/intégrité/);
});
test("photos manquantes ou modifiees ne peuvent pas etre restaurees",async()=>{
  const packed=await packState(example());
  await assert.rejects(()=>unpackState(packed,{}),/Photo manquante/);
  const id=packed.photos[0].id;
  await assert.rejects(()=>unpackState(packed,{[id]:photo+"ALT"}),/endommagée/);
});
test("photo trop grosse rejetee sans alteration de la bibliotheque",async()=>{
  const state=example();
  state.recipes[0].image="data:image/jpeg;base64,"+"A".repeat(750000);
  const original=state.recipes[0].image;
  await assert.rejects(()=>packState(state),SnapshotLimitError);
  assert.equal(state.recipes[0].image,original);
});
test("doublons nouveaux detectes par code-barres et par nom normalise",()=>{
  const old=example(),next=example();
  next.products.push({id:"p2",name:"Marque bis",ean:"1234567890123"});
  next.ingredientCatalog.push({id:"ing-2",name:"Càrotte"});
  const duplicates=detectNewDuplicates(old,next);
  assert.deepEqual(new Set(duplicates.map(x=>x.collection)),
    new Set(["products","ingredientCatalog"]));
  assert.equal(detectNewDuplicates(old,old).length,0);
});
test("empreinte SHA-256 du contenu est deterministe",async()=>{
  assert.equal(await sha256Hex("Speedrive 🍲"),await sha256Hex("Speedrive 🍲"));
});
