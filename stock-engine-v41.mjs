// Speedrive V41 — noyau d'inventaire pur, indépendant de l'interface et de Firebase.
// Aucune migration ni écriture automatique. Les transactions sont immuables et idempotentes.

export const INVENTORY_VERSION_V41 = 1;

const copy = v => JSON.parse(JSON.stringify(v));
const finite = n => typeof n === "number" && Number.isFinite(n);
const positive = n => finite(n) && n > 0;
const rounded = n => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function emptyStockV41() {
  return { version: INVENTORY_VERSION_V41, items: {}, freezer: {}, applied: {}, history: [] };
}

export function normalizeStockV41(value) {
  if (value == null) return emptyStockV41();
  if (value?.version !== 1 || !value.items || Array.isArray(value.items) ||
    !value.freezer || Array.isArray(value.freezer) ||
    !value.applied || Array.isArray(value.applied) ||
    !Array.isArray(value.history)) throw Error("Inventaire V41 non reconnu.");
  return copy(value);
}

// Conserve les identifiants de catalogue pour éviter le doublon "ingrédient / produit lié".
// Ne fusionne jamais deux articles simplement parce que leurs noms se ressemblent.
export function stockIdentityV41({ingredientId=null,productId=null}={},ingredients=[]) {
  if (ingredientId) return "ingredient:"+String(ingredientId);
  if (productId) {
    const matches=(ingredients||[]).filter(i=>i?.productId===productId && i.id);
    if(matches.length===1)return "ingredient:"+String(matches[0].id);
    return "product:"+String(productId);
  }
  throw Error("L'article doit être lié à une fiche de Produits avant son entrée en stock.");
}

// N'additionne que les quantités réellement compatibles.
// Si le contenu d'un emballage n'est pas renseigné, 1 boîte reste 1 boîte,
// et ne devient surtout pas 1 pièce.
export function stockMeasureV41(amount,unit,product=null) {
  if (!positive(amount)) throw Error("La quantité doit être positive.");
  const initialUnit=String(unit||"").trim();
  if (!initialUnit) throw Error("L'unité est nécessaire.");
  let value=amount,measuredIn=initialUnit;
  if(product && initialUnit===product.unit && positive(Number(product.packAmount)) &&
    typeof product.packUnit==="string" && product.packUnit.trim() &&
    product.packUnit!==initialUnit) {
    value=amount*Number(product.packAmount);
    measuredIn=product.packUnit;
  }
  if(measuredIn==="kg"){value*=1000;measuredIn="g"}
  else if(measuredIn==="l"){value*=1000;measuredIn="ml"}
  else if(measuredIn==="cl"){value*=10;measuredIn="ml"}
  if(!positive(value)||!Number.isFinite(value))throw Error("Contenu du produit invalide.");
  return {amount:rounded(value),unit:measuredIn};
}

function safeId(value,label){
 if(typeof value!=="string"||!value.trim()||value.length>200)throw Error(label+" invalide.");
 return value.trim()
}
function validateStockUnit(unit){
 return safeId(unit,"Unité").length<40?unit.trim():(()=>{throw Error("Unité trop longue.")})()
}
function entryKey(identity,unit){return safeId(identity,"Article")+"|"+validateStockUnit(unit)}
function stockDelta(items, movement){
 const identity=safeId(movement.identity,"Article");
 const {amount,unit}=stockMeasureV41(movement.amount,movement.unit,movement.product||null);
 const side=movement.direction;
 if(side!=="add"&&side!=="consume")throw Error("Type de mouvement invalide.");
 const key=entryKey(identity,unit),old=items[key];
 const prev=Number(old?.quantity||0);
 const next=rounded(prev+(side==="add"?amount:-amount));
 if(next < -0.00001)throw Error("Stock insuffisant pour "+(movement.name||identity)+".");
 if(old && old.identity!==identity)throw Error("Identité du stock incohérente.");
 items[key]={
  identity,unit,quantity:Math.max(0,next),
  name:String(movement.name||old?.name||identity).slice(0,120),
  category:String(movement.category||old?.category||"Autres").slice(0,100),
  store:movement.store||old?.store||null
 };
}
function freezerDelta(freezer,movement){
 const lotId=safeId(movement.lotId,"Lot congélateur");
 const recipeId=safeId(movement.recipeId,"Recette congélateur");
 const amount=movement.portions;
 if(!Number.isInteger(amount)||amount<=0||amount>1000)throw Error("Portions invalides.");
 if(movement.direction!=="add"&&movement.direction!=="consume")throw Error("Type de mouvement invalide.");
 const old=freezer[lotId];
 if(old && old.recipeId!==recipeId)throw Error("Un lot de congélateur ne peut pas changer de recette.");
 const next=(old?.portions||0)+(movement.direction==="add"?amount:-amount);
 if(next<0)throw Error("Il n'y a pas assez de portions congelées.");
 freezer[lotId]={
  lotId,recipeId,name:String(movement.name||old?.name||recipeId).slice(0,120),
  portions:next,preparedAt:old?.preparedAt||movement.preparedAt||null
 };
}

// Un même identifiant de transaction ne peut jamais créditer les achats ou débiter une recette deux fois.
// Une transaction mixte (ingrédients et portions congelées) est tout-ou-rien.
export function applyStockTransactionV41(stock, transaction){
 const next=normalizeStockV41(stock);
 const id=safeId(transaction?.id,"Transaction");
 if(Object.prototype.hasOwnProperty.call(next.applied,id))
  return {stock:next,changed:false};
 const moves=transaction?.movements;
 if(!Array.isArray(moves)||!moves.length||moves.length>500)throw Error("Transaction vide ou trop longue.");
 for(const movement of moves){
  if(movement?.type==="inventory")stockDelta(next.items,movement);
  else if(movement?.type==="freezer")freezerDelta(next.freezer,movement);
  else throw Error("Mouvement de stock inconnu.");
 }
 const at=transaction.at||new Date().toISOString();
 next.applied[id]=at;
 next.history.push({id,at,label:String(transaction.label||"Mouvement").slice(0,120),count:moves.length});
 if(next.history.length>120)next.history=next.history.slice(-120);
 return {stock:next,changed:true}
}

// Quantité disponible pour un ingrédient; la recherche est stricte sur l'identité et sur l'unité.
export function availableStockV41(stock,identity,unit){
 const s=normalizeStockV41(stock);
 const wanted=stockMeasureV41(1,unit),key=entryKey(identity,wanted.unit);
 return Number(s.items[key]?.quantity||0)
}
export function availableFreezerV41(stock,recipeId){
 const s=normalizeStockV41(stock);
 return Object.values(s.freezer).filter(l=>l.recipeId===recipeId).reduce((n,l)=>n+l.portions,0)
}


// Lecture SEULE : prépare la reprise éventuelle d'une semaine historique.
// Ne cumule jamais plusieurs semaines et ne décide pas à la place de l'utilisateur.
export function previewLegacyPantryV41(week,ingredientCatalog=[],products=[]) {
 const entries=[],warnings=[],byTarget=new Map();
 const pantry=week?.pantry;
 if(!pantry||typeof pantry!=="object"||Array.isArray(pantry))
  return {entries,warnings,requiresReview:false};
 for(const [sourceKey,rawQty] of Object.entries(pantry)){
  const qty=Number(rawQty);
  if(!positive(qty))continue;
  const separator=sourceKey.lastIndexOf("|");
  if(separator<1){warnings.push("Unité inconnue : "+sourceKey);continue}
  const left=sourceKey.slice(0,separator),unit=sourceKey.slice(separator+1);
  let identity,name,category,store;
  if(left.startsWith("ingredient:")){
   const id=left.slice("ingredient:".length);
   const ing=ingredientCatalog.find(x=>x.id===id);
   if(!ing){warnings.push("Ingrédient absent du catalogue : "+sourceKey);continue}
   identity=stockIdentityV41({ingredientId:id},ingredientCatalog);
   name=ing.name;category=ing.category;store=ing.store;
  } else if(left.startsWith("produit:")){
   const id=left.slice("produit:".length);
   const product=products.find(x=>x.id===id);
   if(!product){warnings.push("Produit absent du catalogue : "+sourceKey);continue}
   identity=stockIdentityV41({productId:id},ingredientCatalog);
   const linked=ingredientCatalog.find(x=>identity==="ingredient:"+x.id);
   name=linked?.name||product.name;
   category=linked?.category||product.category;
   store=linked?.store||product.store;
  }else{
   warnings.push("Article sans référence de catalogue : "+sourceKey);
   continue
  }
  let amount,canonical;
  try{({amount,unit:canonical}=stockMeasureV41(qty,unit))}
  catch(e){warnings.push("Quantité ou unité invalide : "+sourceKey);continue}
  const target=identity+"|"+canonical;
  const row={sourceKey,identity,name,category:category||"Autres",store:store||null,
   amount,unit:canonical,requiresReview:false};
  if(byTarget.has(target)){
   row.requiresReview=true;
   byTarget.get(target).requiresReview=true;
   warnings.push("Plusieurs anciennes lignes pour "+name+" : vérifier avant de transférer, ne pas additionner automatiquement.")
  }else byTarget.set(target,row);
  entries.push(row)
 }
 return {entries,warnings,requiresReview:entries.some(x=>x.requiresReview)||warnings.length>0}
}
