// V41.7 — Composition par copie d'ingrédients, jamais par lien vivant.
// Pur : aucune modification de recette, d'inventaire, de menu ou de Firebase.
const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');
const metrics={g:['mass',1],kg:['mass',1000],ml:['volume',1],cl:['volume',10],l:['volume',1000]};
const rounded=n=>Math.round((n+Number.EPSILON)*10000)/10000;

export function prepareRecipeImportV417(recipe,targetPortions,{scale=true}={}){
 if(!recipe||!Array.isArray(recipe.ingredients)||!recipe.ingredients.length)
  throw Error('Ce plat ne contient aucun ingrédient à importer.');
 const sourcePortions=Number(recipe.people),destPortions=Number(targetPortions);
 if(!Number.isInteger(sourcePortions)||sourcePortions<1||sourcePortions>30||
    !Number.isInteger(destPortions)||destPortions<1||destPortions>30)
  throw Error('Les portions des deux recettes doivent être comprises entre 1 et 30.');
 const factor=scale?destPortions/sourcePortions:1;
 return recipe.ingredients.map(line=>{
  const value=Number(line?.qty);
  if(!Number.isFinite(value)||value<=0||!String(line?.unit||'').trim()||
     !(String(line?.name||'').trim()||line?.ingredientId))
   throw Error('Un ingrédient de la recette source est incomplet.');
  const qty=rounded(value*factor);
  if(qty<=0||!Number.isFinite(qty))
   throw Error('Quantité trop faible après adaptation des portions.');
  return {ingredientId:line.ingredientId||null,productId:line.productId||null,
   name:String(line.name||'').trim(),qty,unit:line.unit,
   store:line.store||null};
 });
}

export function mergeRecipeIngredientsV417(current,imported){
 if(!Array.isArray(current)||!Array.isArray(imported))throw Error('Liste d’ingrédients incorrecte.');
 const rows=current.map(x=>({...x}));let added=0,merged=0,separateUnits=0;
 for(const raw of imported){
  const line={...raw},name=clean(line.name),qty=Number(line.qty);
  if(!name||!Number.isFinite(qty)||qty<=0)throw Error('Un ingrédient à importer est incomplet.');
  const same=rows.filter(row=>clean(row.name)===name||
   (line.ingredientId&&row.ingredientId===line.ingredientId));
  const compatible=same.find(row=>{
   if(!Number.isFinite(Number(row.qty))||Number(row.qty)<=0)return false;
   if(row.unit===line.unit)return true;
   return metrics[row.unit]&&metrics[line.unit]&&metrics[row.unit][0]===metrics[line.unit][0];
  });
  if(compatible){
   const value=compatible.unit===line.unit?qty:
    qty*metrics[line.unit][1]/metrics[compatible.unit][1];
   const total=rounded(Number(compatible.qty)+value);
   if(!Number.isFinite(total)||total<=0)throw Error('Quantité fusionnée incorrecte.');
   compatible.qty=total;merged++;continue;
  }
  if(same.length)separateUnits++;
  const emptyIndex=rows.findIndex(row=>!String(row.name||'').trim()&&!String(row.qty??'').trim());
  if(emptyIndex>=0)rows[emptyIndex]={...line};
  else rows.push(line);
  added++;
 }
 return {rows,added,merged,separateUnits};
}
