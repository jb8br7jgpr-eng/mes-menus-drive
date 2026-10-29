import test from "node:test";
import assert from "node:assert/strict";
import { isReadOnlySafeAction } from "./v34-readonly-actions.js";

test("backup export and local history remain accessible without Firebase",()=>{
  for(const action of ["export-data","refresh-backups","close-modal"])
    assert.equal(isReadOnlySafeAction(action),true,action);
});
test("mutating settings and app actions stay blocked while offline",()=>{
  for(const action of [
    "clear-all","restore-backup","generate-week-courses",
    "delete-product","save-home-stock","import-data","save-recipe",
    "generate-week","first-import",null,undefined
  ])assert.equal(isReadOnlySafeAction(action),false,String(action));
});
