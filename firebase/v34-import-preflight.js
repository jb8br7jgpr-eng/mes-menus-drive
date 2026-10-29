// Speedrive V34 — first-import safety check (pure/local, NO Firebase calls).
// Can inspect V33 state without changing it or transmitting personal data.
import { packState, SnapshotLimitError } from "./v34-cloud-codec.js";

const encode=new TextEncoder();
const bytes=text=>encode.encode(text).length;
function normalized(value) {
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr-FR").trim().replace(/[^a-z0-9]+/g," ").trim();
}
function duplicatedIds(items,label) {
  const seen=new Set(),dupes=new Set();
  for(const item of items) {
    const id=item?.id;
    if(typeof id!=="string" || !id) continue;
    if(seen.has(id))dupes.add(id);
    seen.add(id);
  }
  return [...dupes].map(id=>`${label} : identifiant répété ${id.slice(0,48)}`);
}
function duplicateNames(items,label,field="name") {
  const seen=new Map(),warnings=[];
  for(const item of items){
    const name=normalized(item?.[field]);
    if(!name)continue;
    const earlier=seen.get(name);
    if(earlier && earlier!==item?.id)warnings.push(`${label} : même nom « ${String(item[field]).slice(0,45)} »`);
    else seen.set(name,item?.id||"-");
  }
  return warnings;
}
function structuralWarnings(state, errors, warnings) {
  for(const [key,label] of [["products","Produits"],["ingredientCatalog","Ingrédients"]]) {
    const entries=state[key];
    if(entries!==undefined && !Array.isArray(entries)) {
      errors.push(label+" : liste invalide.");
      continue;
    }
    for(const item of entries||[]) {
      if(!item || typeof item.id!=="string" || !item.id.trim())
        errors.push(label+" : élément sans identifiant stable.");
    }
  }
  if(state.staples!==undefined && !Array.isArray(state.staples))
    errors.push("Achats habituels : liste invalide.");
  const products=new Set((state.products||[]).map(item=>item?.id).filter(Boolean));
  for(const ingredient of Array.isArray(state.ingredientCatalog)?state.ingredientCatalog:[]) {
    if(ingredient?.productId && !products.has(ingredient.productId))
      warnings.push("Ingrédient « "+String(ingredient.name||ingredient.id).slice(0,45)+" » : référence produit manquante.");
  }
  for(const [weekId,week] of Object.entries(state.weeks)) {
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(weekId) || !week ||
      typeof week!=="object" || Array.isArray(week)) {
      errors.push("Semaine invalide : "+weekId.slice(0,30));
      continue;
    }
    if(week.meals!==undefined &&
       (!Array.isArray(week.meals) || week.meals.length>14))
      errors.push("Semaine "+weekId+" : le planning dépasse 14 repas ou est illisible.");
    for(const prop of ["extras","checked","excluded"]) {
      if(week[prop]!==undefined && !Array.isArray(week[prop]))
        errors.push("Semaine "+weekId+" : champ "+prop+" invalide.");
    }
  }
}
function countWeekMeals(weeks) {
  return Object.values(weeks||{}).reduce((total,week)=>
    total+(Array.isArray(week?.meals)?week.meals.filter(Boolean).length:0),0);
}
/** Read-only preflight; returns counts and warnings, never the actual user data. */
export async function inspectFirstCloudImport(state) {
  if(!state||state.schema!==1||!Array.isArray(state.recipes)||
     !Array.isArray(state.products)||!state.weeks||
     typeof state.weeks!=="object"||Array.isArray(state.weeks))
    throw Error("Bibliothèque V33 incompatible : aucun transfert autorisé.");
  const errors=[],warnings=[];
  errors.push(...duplicatedIds(state.recipes,"Recettes"));
  errors.push(...duplicatedIds(state.products,"Produits"));
  errors.push(...duplicatedIds(state.ingredientCatalog||[],"Ingrédients"));
  errors.push(...duplicatedIds(state.staples||[],"Produits habituels"));
  warnings.push(...duplicateNames(state.recipes,"Recettes"));
  warnings.push(...duplicateNames(state.products,"Produits"));
  structuralWarnings(state,errors,warnings);
  let packed=null;
  try{packed=await packState(state);}
  catch(error){
    if(error instanceof SnapshotLimitError || /Recette sans identifiant/.test(error.message||""))
      errors.push(error.message);
    else throw error;
  }
  const photos=state.recipes.filter(recipe=>typeof recipe?.image==="string"&&!!recipe.image);
  const photoBytes=photos.reduce((sum,recipe)=>sum+bytes(recipe.image),0);
  const result={
    canImport:errors.length===0&&packed!==null,
    recipes:state.recipes.length,
    products:state.products.length,
    ingredients:Array.isArray(state.ingredientCatalog)?state.ingredientCatalog.length:0,
    weeks:Object.keys(state.weeks).length,
    meals:countWeekMeals(state.weeks),
    photos:photos.length,
    photoBytes,
    snapshotBytes:packed?.bytes??null,
    chunkCount:packed?.count??null,
    errors,warnings
  };
  // packState() is read-only and includes photos in its return. Do not
  // return that package to any UI or logs: only aggregate measurements.
  return result;
}

/** Mandatory just-in-time gate before the very first real server write.
 * A previous UI preview must never substitute for inspecting the actual state.
 */
export async function assertFirstCloudImportReady(state) {
  const report=await inspectFirstCloudImport(state);
  if(!report.canImport) {
    throw Error("Premier transfert bloqué : " +
      (report.errors[0]||"contrôle de sécurité incomplet."));
  }
  if(!report.recipes && !report.products)
    throw Error("Premier transfert bloqué : bibliothèque vide ou appareil incorrect.");
  return report;
}
