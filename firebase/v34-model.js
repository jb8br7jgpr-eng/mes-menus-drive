// V34 — Pure V33 -> V34 preview adapter; no network calls or mutation.
// An actual migration must require explicit preview and confirmation.
export const normalizeLabel = value => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, " ").trim();

export function productFingerprint(product) {
  const ean = String(product?.ean ?? "").replace(/[^0-9]/g, "");
  if ([8, 12, 13, 14].includes(ean.length)) return "ean:" + ean;
  const name = normalizeLabel(product?.name);
  return name ? "name:" + normalizeLabel(product?.store || "carrefour") + ":" + name : null;
}
export function ingredientFingerprint(ingredient) {
  const name = normalizeLabel(ingredient?.name);
  return name ? "ingredient:" + name + ":" + normalizeLabel(ingredient?.unit || "") : null;
}
export function detectPotentialDuplicates(entries, fingerprint) {
  const first = new Map(), warnings = [];
  for (const entry of entries || []) {
    const key = fingerprint(entry);
    if (!key) continue;
    if (first.has(key) && first.get(key)?.id !== entry?.id) {
      warnings.push({ key, firstId: first.get(key).id, secondId: entry.id });
    } else first.set(key, entry);
  }
  return warnings;
}
export function recordId(kind, id) {
  const raw = String(id ?? "");
  if (!raw || raw.length > 280 || raw.includes("\u0000")) {
    throw new Error("Identifiant de données invalide.");
  }
  return kind + ":" + encodeURIComponent(raw);
}
const requireItems = (state, key) => Array.isArray(state[key]) ? state[key] : [];
const copy = value => JSON.parse(JSON.stringify(value));
const add = (records, kind, id, payload) => {
  records.push({ id: recordId(kind, id), kind, payload: copy(payload) });
};

export function previewLocalMigration(oldState) {
  if (!oldState || oldState.schema !== 1) throw new Error("Fichier Speedrive V33 non reconnu.");
  const records = [], warnings = [];
  for (const r of requireItems(oldState, "recipes")) {
    if (!r?.id) { warnings.push("Une recette sans identifiant nécessite une vérification."); continue; }
    const { image, ...recipe } = r;
    add(records, "recipe", r.id, recipe);
    if (image) {
      add(records, "recipePhoto", r.id, { recipeId: r.id, image });
      if (new TextEncoder().encode(JSON.stringify(image)).length > 700000) {
        warnings.push("Photo trop lourde pour Firestore : " + (r.name || r.id));
      }
    }
  }
  for (const p of requireItems(oldState, "products")) {
    if (!p?.id) { warnings.push("Un produit sans identifiant nécessite une vérification."); continue; }
    add(records, "product", p.id, p);
  }
  for (const ing of requireItems(oldState, "ingredientCatalog")) {
    if (!ing?.id) { warnings.push("Un ingrédient sans identifiant nécessite une vérification."); continue; }
    add(records, "ingredient", ing.id, ing);
  }
  for (const staple of requireItems(oldState, "staples")) {
    if (!staple?.id) { warnings.push("Un favori sans identifiant nécessite une vérification."); continue; }
    add(records, "staple", staple.id, staple);
  }
  for (const [weekId, week] of Object.entries(oldState.weeks || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekId)) { warnings.push("Semaine non reconnue : " + weekId); continue; }
    const { meals, extras, checked, excluded, pantry, pantryUnits, ...metadata } = week;
    add(records, "weekMeta", weekId, { weekId, ...metadata });
    (meals || []).forEach((meal, slot) => {
      if (meal != null) add(records, "weekMeal", weekId + ":" + slot, { weekId, slot, meal });
    });
    (extras || []).forEach((extra, index) => {
      const id = extra?.id || "legacy:" + index;
      add(records, "weekExtra", weekId + ":" + id, { weekId, extra });
    });
    for (const key of checked || []) add(records, "weekChecked", weekId + ":" + key, { weekId, key, checked: true });
    for (const key of excluded || []) add(records, "weekExcluded", weekId + ":" + key, { weekId, key, excluded: true });
    for (const [key, value] of Object.entries(pantry || {})) add(records, "weekPantry", weekId + ":" + key, { weekId, key, value });
    for (const [key, value] of Object.entries(pantryUnits || {})) add(records, "weekPantryUnit", weekId + ":" + key, { weekId, key, value });
  }
  add(records, "settings", "general", oldState.settings || { people: 2 });
  add(records, "settings", "v33-flags", {
    favoritesUnifiedV29: Boolean(oldState.favoritesUnifiedV29),
    coursesExplicitGenerationV1: Boolean(oldState.coursesExplicitGenerationV1)
  });
  for (const [key, value] of Object.entries(oldState.storePreferences || {})) {
    add(records, "preference", key, { key, value });
  }
  const duplicates = {
    products: detectPotentialDuplicates(requireItems(oldState, "products"), productFingerprint),
    ingredients: detectPotentialDuplicates(requireItems(oldState, "ingredientCatalog"), ingredientFingerprint),
    recipes: detectPotentialDuplicates(requireItems(oldState, "recipes"),
      x => normalizeLabel(x?.name) || null)
  };
  // Warning only: never auto-merge products, recipes or ingredient IDs,
  // as they may be referenced from other records.
  return { records, duplicates, warnings, count: records.length };
}
