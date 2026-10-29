import test from "node:test";
import assert from "node:assert/strict";
import { inspectFirstCloudImport } from "./v34-import-preflight.js";

const basic=()=>({
  schema:1,
  recipes:[{id:"r1",name:"Soupe",image:"data:image/jpeg;base64,AQID"}],
  products:[{id:"p1",name:"Lait"}],
  ingredientCatalog:[{id:"i1",name:"Pommes de terre"}],
  staples:[],
  weeks:{"2026-10-26":{meals:[{recipeId:"r1"},null,{recipeId:"r1"}]}},
  settings:{people:2}
});
test("first-import preflight reports counts and never mutates recipes or photos",async()=>{
  const state=basic(),original=JSON.stringify(state);
  const preview=await inspectFirstCloudImport(state);
  assert.equal(JSON.stringify(state),original);
  assert.equal(preview.canImport,true);
  assert.equal(preview.recipes,1);
  assert.equal(preview.products,1);
  assert.equal(preview.photos,1);
  assert.equal(preview.weeks,1);
  assert.equal(preview.meals,2);
  assert.equal(preview.chunkCount,1);
  assert.equal(preview.errors.length,0);
  assert.equal("state" in preview,false);
  assert.equal("photoData" in preview,false);
});
test("duplicate IDs prevent import without deleting data",async()=>{
  const state=basic();
  state.products.push({id:"p1",name:"Autre lait"});
  const result=await inspectFirstCloudImport(state);
  assert.equal(result.canImport,false);
  assert.match(result.errors.join(" "),/identifiant répété/);
});
test("duplicate recipe names produce warnings without destroying recipes",async()=>{
  const state=basic();
  state.recipes.push({id:"r2",name:"soupé"});
  const result=await inspectFirstCloudImport(state);
  assert.equal(result.canImport,true);
  assert.equal(result.warnings.length,1);
  assert.equal(state.recipes.length,2);
});
test("too-large photo blocks import before any cloud call",async()=>{
  const state=basic();
  state.recipes[0].image="data:image/jpeg;base64,"+"A".repeat(750000);
  const result=await inspectFirstCloudImport(state);
  assert.equal(result.canImport,false);
  assert.match(result.errors.join(" "),/Photo trop volumineuse/);
});
test("invalid local library cannot be imported",async()=>{
  await assert.rejects(()=>inspectFirstCloudImport({schema:1,recipes:[],products:[]}),/incompatible/);
});
