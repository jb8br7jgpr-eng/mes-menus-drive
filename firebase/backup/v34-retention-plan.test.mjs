import test from "node:test";
import assert from "node:assert/strict";
import { planSnapshotRetention } from "./v34-retention-plan.mjs";

const DAY=86400000;
const now=Date.UTC(2026,9,29,11,0,0);
const snapshots=Array.from({length:100},(_,i)=>({
  id:"s"+String(i).padStart(3,"0"),
  createdAtMillis:now-(99-i)*DAY,
  hash:(i%10).toString().repeat(64)
}));
const backupAt=80;
const archive={
  head:{snapshotId:snapshots[backupAt].id,revision:backupAt+1},
  snapshot:{hash:snapshots[backupAt].hash,
    createdAtMillis:snapshots[backupAt].createdAtMillis}
};
const options={
  currentSnapshotId:snapshots[99].id,
  verifiedArchive:archive,now,keepNewest:30,minimumDays:14
};
test("retention refuses to proceed without verified external archive",()=>{
  assert.throws(()=>planSnapshotRetention(snapshots,{
    ...options,verifiedArchive:null
  }),/non vérifiée/);
});
test("all newer-than-backup and recent snapshots are retained",()=>{
  const report=planSnapshotRetention(snapshots,options);
  assert.equal(report.total,100);
  assert.ok(report.candidates.length>0);
  assert.ok(!report.candidates.some(s=>s.id===snapshots[99].id));
  assert.ok(!report.candidates.some(s=>s.id===snapshots[backupAt].id));
  assert.ok(!report.candidates.some(s=>s.createdAtMillis>=archive.snapshot.createdAtMillis));
  assert.ok(!report.candidates.some(s=>s.createdAtMillis>=now-14*DAY));
});
test("tampering with the backup fingerprint blocks all deletion",()=>{
  assert.throws(()=>planSnapshotRetention(snapshots,{
    ...options,verifiedArchive:{...archive,
      snapshot:{...archive.snapshot,hash:"f".repeat(64)}}
  }),/non reliée/);
});
test("recent fewer-than-protected snapshots never cause deletion",()=>{
  const report=planSnapshotRetention(snapshots.slice(70),{
    ...options,verifiedArchive:archive,keepNewest:30
  });
  assert.equal(report.candidates.length,0);
});
test("invalid current head and invalid timestamps block cleanup",()=>{
  assert.throws(()=>planSnapshotRetention(snapshots,{
    ...options,currentSnapshotId:"does-not-exist"
  }),/introuvable/);
  assert.throws(()=>planSnapshotRetention(
    [...snapshots.slice(0,99),{...snapshots[99],createdAtMillis:NaN}],options
  ),/Horodatage/);
});
