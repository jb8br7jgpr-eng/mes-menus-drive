// V34 — conservative offsite-verified Firestore snapshot retention PLAN.
// Pure function, ZERO database writes. A future privileged maintenance job
// may consume its output only after real backup/restore validation.
const assert = (ok,msg) => {if(!ok)throw Error(msg)};
const DAY=86400000;
const goodId=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,120}$/.test(x);
export function planSnapshotRetention(snapshots, options={}) {
  const {
    currentSnapshotId, verifiedArchive, now=Date.now(),
    keepNewest=60, minimumDays=14
  }=options;
  assert(Array.isArray(snapshots),"Historique manquant.");
  assert(goodId(currentSnapshotId),"Révision en cours inconnue.");
  assert(Number.isInteger(keepNewest)&&keepNewest>=20,"Protection minimum 20 versions.");
  assert(Number.isInteger(minimumDays)&&minimumDays>=7,"Protection minimum 7 jours.");
  assert(verifiedArchive?.head && verifiedArchive?.snapshot,
    "Sauvegarde externe chiffrée non vérifiée.");
  const archivedId=verifiedArchive.head.snapshotId;
  const archivedAt=verifiedArchive.snapshot.createdAtMillis;
  assert(goodId(archivedId) && Number.isSafeInteger(archivedAt) && archivedAt>0,
    "L'archive doit contenir la date fiable du snapshot sauvegardé.");
  assert(Number.isSafeInteger(now) && archivedAt<=now+300000,
    "Horodatage de sauvegarde incohérent.");
  const unique=new Set();
  const rows=snapshots.map(s=>{
    assert(goodId(s?.id)&&!unique.has(s.id),"Identifiant absent ou dupliqué.");
    unique.add(s.id);
    assert(Number.isSafeInteger(s.createdAtMillis)&&s.createdAtMillis>0&&
      s.createdAtMillis<=now+300000,"Horodatage Firestore invalide.");
    assert(typeof s.hash==="string"&&/^[a-f0-9]{64}$/.test(s.hash),
      "Empreinte de snapshot invalide.");
    return {id:s.id,createdAtMillis:s.createdAtMillis,hash:s.hash};
  }).sort((a,b)=>b.createdAtMillis-a.createdAtMillis);
  const saved=rows.find(x=>x.id===archivedId);
  assert(saved && saved.hash===verifiedArchive.snapshot.hash &&
    saved.createdAtMillis===archivedAt,
    "Archive non reliée à une photographie vérifiée de Firestore.");
  assert(rows.some(x=>x.id===currentSnapshotId),
    "Révision courante introuvable : aucun nettoyage possible.");
  const protectedIds=new Set(rows.slice(0,keepNewest).map(x=>x.id));
  protectedIds.add(currentSnapshotId);
  protectedIds.add(archivedId);
  const threshold=now-minimumDays*DAY;
  const candidates=[], kept=[];
  for (const snap of rows) {
    const reason=protectedIds.has(snap.id)?"révision protégée":
      snap.createdAtMillis>=threshold?"trop récente":
      snap.createdAtMillis>=archivedAt?"plus récente que l'archive vérifiée":
      null;
    if(reason) kept.push({...snap,reason});
    else candidates.push(snap);
  }
  return {total:rows.length,kept, candidates, archiveId:archivedId,
    protectedCount:protectedIds.size, minimumDays,keepNewest};
}
