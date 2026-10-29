// V34 cloud-first : IndexedDB durable for local recovery; separate from V33 data.
// Never clears the current V33 "menus-drive-v1" database.
const NAME = "speedrive-v34-cloud-recovery";
const VERSION = 1;
const STORE = "records";
let opening;
function open() {
  if (opening) return opening;
  opening = new Promise((resolve,reject)=>{
    if (typeof indexedDB === "undefined") { reject(Error("IndexedDB indisponible.")); return; }
    const req=indexedDB.open(NAME,VERSION);
    req.onupgradeneeded=()=>{
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{opening=null;reject(req.error||Error("Stockage indisponible."));};
    req.onblocked=()=>{opening=null;reject(Error("Base de récupération bloquée."));};
  });
  return opening;
}
function key(uid,kind) {
  if(typeof uid!=="string"||!uid||uid.length>200)throw Error("Compte invalide.");
  return uid+":"+kind;
}
async function read(uid,kind) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).get(key(uid,kind));
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||Error("Lecture locale impossible."));
  });
}
async function put(uid,kind,data) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(structuredClone(data),key(uid,kind));
    tx.oncomplete=()=>resolve(true);
    tx.onabort=()=>reject(tx.error||Error("Stockage local refusé."));
    tx.onerror=()=>reject(tx.error||Error("Sauvegarde locale échouée."));
  });
}
async function remove(uid,kind) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(key(uid,kind));
    tx.oncomplete=()=>resolve(true);
    tx.onabort=()=>reject(tx.error||Error("Effacement local échoué."));
    tx.onerror=()=>reject(tx.error||Error("Effacement local échoué."));
  });
}
export const cloudRecoveryStore = {
  readDraft(uid) { return read(uid,"draft"); },
  saveDraft(uid,draft) { return put(uid,"draft",draft); },
  clearDraft(uid) { return remove(uid,"draft"); },
  readConfirmed(uid) { return read(uid,"confirmed"); },
  saveConfirmed(uid,state,revision) {
    return put(uid,"confirmed",{state,revision,confirmedAt:Date.now()});
  },
  async preserveV33Once(uid,state) {
    if (await read(uid,"v33-before-cloud")) return false;
    await put(uid,"v33-before-cloud",{
      state, savedAt:Date.now(), reason:"Avant migration Speedrive V34"
    });
    return true;
  },
  readPreservedV33(uid) { return read(uid,"v33-before-cloud"); }
};
