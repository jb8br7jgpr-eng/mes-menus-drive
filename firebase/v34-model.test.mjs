import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLabel, productFingerprint, detectPotentialDuplicates, previewLocalMigration } from "./v34-model.js";

test("accent / case insensitive fingerprints", () => {
  assert.equal(normalizeLabel("  Crème fraîche  "), "creme fraiche");
  assert.equal(productFingerprint({ean:"3 276 123456789",name:"A"}),
    productFingerprint({ean:"3276123456789",name:"B"}));
});

test("duplicates are reported rather than deleted", () => {
  const input = [{id:"one",name:"Crème fraîche"},{id:"two",name:"creme fraiche"}];
  const findings = detectPotentialDuplicates(input, x => normalizeLabel(x.name));
  assert.equal(findings.length, 1);
  assert.equal(input.length, 2);
});

test("preview leaves V33 intact and splits week slots", () => {
  const state = {schema:1,recipes:[{id:"r1",name:"Salade",ingredients:[],image:"data:image/jpeg;base64,ABC"}],
    products:[{id:"p1",name:"Pomme"}],ingredientCatalog:[],staples:[],
    weeks:{"2026-10-26":{meals:[{recipeId:"r1"},null],extras:[{id:"e1",name:"Lait"}],
      checked:["ingredient:x"],excluded:[],pantry:{x:2},pantryUnits:{x:"kg"},generatedSignature:"abc"}},
    storePreferences:{"ingredient:x":"grandfrais"},settings:{people:2}};
  const before = JSON.stringify(state);
  const preview = previewLocalMigration(state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(preview.count, 10);
  assert.ok(preview.records.some(r => r.kind==="weekMeal" && r.payload.slot===0));
  assert.ok(preview.records.some(r => r.kind==="recipePhoto"));
  assert.ok(preview.records.some(r => r.kind==="weekChecked"));
  assert.ok(preview.records.some(r => r.kind==="weekPantryUnit"));
});
