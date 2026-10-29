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
