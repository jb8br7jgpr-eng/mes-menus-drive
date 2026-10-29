// Speedrive V34 - codec pur pour une base cloud prioritaire (inactif en V33).
// Une sauvegarde est une photographie cohérente de l'état local V33.
// Les photos sont stockées séparément par empreinte : on ne les réenvoie pas
// à chaque modification d'un menu ou d'une liste de courses.
const TEXT_BYTES = 360000;
const MAX_TEXT_BYTES = 8_000_000;
const MAX_PHOTO_BYTES = 750000;
const encoder = new TextEncoder();

export class SnapshotLimitError extends Error {
  constructor(message) { super(message); this.name = "SnapshotLimitError"; }
}

const byteSize = str => encoder.encode(str).length;
const deepClone = value => JSON.parse(JSON.stringify(value));
export async function sha256Hex(text) {
  const bytes = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export function splitUtf8(text, maxBytes = TEXT_BYTES) {
  if (!(maxBytes > 0 && maxBytes <= 800000)) throw Error("Limite de bloc invalide.");
  const chunks = [];
  let part = "", count = 0;
  for (const symbol of text) {
    const bytes = byteSize(symbol);
    if (count + bytes > maxBytes && part) {
      chunks.push(part); part = ""; count = 0;
    }
    part += symbol; count += bytes;
  }
  if (part || !chunks.length) chunks.push(part);
  return chunks;
}
export function detectNewDuplicates(previousState, nextState) {
  const duplicates = [];
  function normalName(name) {
    return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim().toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g," ").trim();
  }
  function keyProduct(product) {
    const ean = String(product.ean || "").replace(/\D/g, "");
    if ([8,12,13,14].includes(ean.length)) return "ean:" + ean;
    const key = normalName(product.name);
    return key ? "product:" + normalName(product.store || "carrefour") + ":" + key : null;
  }
  function keyIngredient(ingredient) {
    const key = normalName(ingredient.name);
    return key ? "ingredient:" + key : null;
  }
  for (const [field,keyFn] of [["products",keyProduct],["ingredientCatalog",keyIngredient]]) {
    const prev = new Map(), latest = new Map();
    for (const item of previousState?.[field] || []) {
      const key = keyFn(item);
      if (key) {
        const ids = prev.get(key) || new Set();
        ids.add(item.id);prev.set(key,ids);
      }
    }
    for (const item of nextState?.[field] || []) {
      const key = keyFn(item);
      if (!key) continue;
      const ids = latest.get(key) || new Set();ids.add(item.id);latest.set(key,ids);
    }
    for (const [key,ids] of latest) {
      if (ids.size > 1 && ids.size > (prev.get(key)?.size || 0)) {
        duplicates.push({ collection:field, key, ids:[...ids] });
      }
    }
  }
  return duplicates;
}
export async function packState(state) {
  if (!state || state.schema !== 1 || !Array.isArray(state.recipes))
    throw Error("Format de données Speedrive incompatible.");
  const copy = deepClone(state), photos = new Map(), photoRefs = {};
  for (const recipe of copy.recipes) {
    if (!recipe?.id) throw Error("Recette sans identifiant : import à contrôler.");
    if (recipe.image && typeof recipe.image === "string") {
      const bytes = byteSize(recipe.image);
      if (bytes > MAX_PHOTO_BYTES) throw new SnapshotLimitError(
        "Photo trop volumineuse : " + (recipe.name || recipe.id));
      const hash = await sha256Hex(recipe.image);
      photos.set(hash, recipe.image);
      photoRefs[recipe.id] = hash;
      delete recipe.image;
    }
  }
  const snapshot = { format: "speedrive-v34", schema: 1, state: copy, photoRefs };
  const json = JSON.stringify(snapshot);
  const totalBytes = byteSize(json);
  if (totalBytes > MAX_TEXT_BYTES) throw new SnapshotLimitError(
    "Bibliothèque trop volumineuse pour une seule transaction.");
  const hash = await sha256Hex(json);
  const chunks = splitUtf8(json);
  return { hash, chunks, photos: [...photos].map(([id,data])=>({id,data})),
    bytes: totalBytes, count: chunks.length };
}
export async function unpackState(pack, photoData = {}) {
  if (!pack?.chunks?.length || pack.chunks.length !== pack.count)
    throw Error("Sauvegarde serveur incomplète.");
  const json = pack.chunks.join("");
  if (await sha256Hex(json) !== pack.hash) throw Error("Contrôle d'intégrité échoué.");
  const snapshot = JSON.parse(json);
  if (snapshot.format !== "speedrive-v34" || snapshot.schema !== 1 ||
    !snapshot.state || snapshot.state.schema !== 1 ||
    !Array.isArray(snapshot.state.recipes) || !Array.isArray(snapshot.state.products) ||
    !snapshot.state.weeks) throw Error("Sauvegarde Speedrive illisible.");
  for (const recipe of snapshot.state.recipes) {
    const ref = snapshot.photoRefs?.[recipe.id];
    if (ref) {
      if (typeof photoData[ref] !== "string" || !photoData[ref])
        throw Error("Photo manquante pour : " + (recipe.name || recipe.id));
      if (await sha256Hex(photoData[ref]) !== ref)
        throw Error("Une photo serveur est endommagée.");
      recipe.image = photoData[ref];
    }
  }
  return snapshot.state;
}
export function listPhotoRefs(pack) {
  const data = JSON.parse(pack.chunks.join(""));
  return [...new Set(Object.values(data.photoRefs || {}))];
}
