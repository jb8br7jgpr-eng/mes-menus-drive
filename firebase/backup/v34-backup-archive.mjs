// Speedrive V34 — encrypted offsite backup format for trusted server-side jobs.
// Node.js only. This file NEVER runs inside the public GitHub Pages frontend.
// NO secret keys, Firebase service credentials, or private recipes in the repository.
import { randomBytes, createCipheriv, createDecipheriv, createHash, scryptSync } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const FORMAT = "speedrive-offsite-backup-v1";
const MAX_JSON_BYTES = 256 * 1024 * 1024;
const sha256 = text => createHash("sha256").update(text).digest("hex");
const checkKey = key => {
  const bytes=Buffer.isBuffer(key)?key:Buffer.from(key||"","base64");
  if (bytes.length!==32) throw Error("Clé de sauvegarde AES-256 invalide (32 octets).");
  return bytes;
};
const SCRYPT = {N:32768,r:8,p:1,maxmem:64*1024*1024};
const minPassphrase = candidate => {
  if (typeof candidate!=="string" || candidate.length<48 ||
      candidate.length>1024 || candidate.trim()!==candidate)
    throw Error("Phrase secrète insuffisante : utilise une phrase aléatoire d'au moins 48 caractères.");
  return candidate;
};
const deriveKey = (passphrase,salt) =>
  scryptSync(minPassphrase(passphrase),salt,32,SCRYPT);
function secretForEncryption(secret) {
  if (secret && typeof secret==="object" && !Buffer.isBuffer(secret) &&
      typeof secret.passphrase==="string") {
    const salt=randomBytes(16);
    return {key:deriveKey(secret.passphrase,salt),
      header:{kdf:"scrypt-v1",salt:salt.toString("base64")}};
  }
  return {key:checkKey(secret),header:{}};
}
function secretForDecryption(header,secret) {
  if (header.kdf==="scrypt-v1") {
    if (!secret || typeof secret!=="object" || typeof secret.passphrase!=="string")
      throw Error("Cette archive exige la phrase secrète de sauvegarde.");
    const salt=Buffer.from(header.salt||"","base64");
    if(salt.length!==16)throw Error("Sel cryptographique invalide.");
    return deriveKey(secret.passphrase,salt);
  }
  if (header.kdf!==undefined)throw Error("Format cryptographique inconnu.");
  return checkKey(secret);
}
function validatedBundle(bundle) {
  if (!bundle || bundle.format!=="speedrive-firestore-bundle-v1")
    throw Error("Format d'archive Firestore invalide.");
  const {head,snapshot,chunks,photos}=bundle;
  if (!head || !snapshot || !Array.isArray(chunks) || !photos || typeof photos!=="object")
    throw Error("Sauvegarde Firestore incomplète.");
  if (typeof snapshot.hash!=="string" || snapshot.hash.length!==64 ||
      !Number.isInteger(snapshot.count) || snapshot.count!==chunks.length)
    throw Error("Métadonnées de sauvegarde invalides.");
  if(snapshot.createdAtMillis !== undefined &&
     (!Number.isSafeInteger(snapshot.createdAtMillis) ||
      snapshot.createdAtMillis <= 0 ||
      snapshot.createdAtMillis > Date.now() + 300000))
    throw Error("Date de photographie invalide.");
  const text=chunks.join("");
  if (sha256(text)!==snapshot.hash) throw Error("Somme de contrôle des données incorrecte.");
  const json=JSON.parse(text);
  if(json.format!=="speedrive-v34" || json.state?.schema!==1 ||
     !Array.isArray(json.state.recipes) || !Array.isArray(json.state.products))
    throw Error("La bibliothèque Speedrive est invalide.");
  for (const ref of Object.values(json.photoRefs||{})) {
    if (typeof ref!=="string" || typeof photos[ref]!=="string" ||
        sha256(photos[ref])!==ref) throw Error("Photo absente ou corrompue.");
  }
  if (!Number.isSafeInteger(head.revision)||head.revision<1 ||
      typeof head.snapshotId!=="string") throw Error("Révision cloud invalide.");
  return bundle;
}
export function encryptOffsiteBackup(bundle,encodedKey) {
  validatedBundle(bundle);
  const {key,header}=secretForEncryption(encodedKey);
  const data=Buffer.from(JSON.stringify({
    format:FORMAT,createdAt:new Date().toISOString(),bundle
  }),"utf8");
  if(data.length>MAX_JSON_BYTES)throw Error("Sauvegarde trop volumineuse.");
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  const encrypted=Buffer.concat([cipher.update(gzipSync(data)),cipher.final()]);
  const tag=cipher.getAuthTag();
  // Non-secret header, authenticated by AES-GCM associated data.
  return Buffer.from(JSON.stringify({
    format:FORMAT,alg:"AES-256-GCM",compression:"gzip",
    ...header,
    iv:iv.toString("base64"),tag:tag.toString("base64"),
    data:encrypted.toString("base64")
  }),"utf8");
}
export function decryptOffsiteBackup(archiveBytes,encodedKey) {
  const obj=JSON.parse(Buffer.from(archiveBytes).toString("utf8"));
  if(obj.format!==FORMAT || obj.alg!=="AES-256-GCM" ||
     obj.compression!=="gzip")throw Error("Format de sauvegarde chiffrée invalide.");
  const key=secretForDecryption(obj,encodedKey);
  const iv=Buffer.from(obj.iv,"base64"),tag=Buffer.from(obj.tag,"base64");
  if(iv.length!==12 || tag.length!==16)throw Error("En-tête chiffré invalide.");
  const decipher=createDecipheriv("aes-256-gcm",key,iv);
  decipher.setAuthTag(tag);
  const zipped=Buffer.concat([
    decipher.update(Buffer.from(obj.data,"base64")),decipher.final()
  ]);
  const plain=gunzipSync(zipped,{maxOutputLength:MAX_JSON_BYTES});
  const unwrapped=JSON.parse(plain.toString("utf8"));
  if(unwrapped.format!==FORMAT)throw Error("Archive Speedrive invalide.");
  return validatedBundle(unwrapped.bundle);
}
