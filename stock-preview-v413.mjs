// V41.3 — aperçu purement local des mouvements AVANT validation.
// Même moteur et mêmes conversions que la transaction réelle ; aucune écriture.
import {emptyStockV41,normalizeStockV41,stockMeasureV41,
 applyStockTransactionV41} from './stock-engine-v41.mjs';

const quant = n => Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:3});
const round = n => Math.round((n+Number.EPSILON)*1000)/1000;

export function previewStockMovementsV413(stock,movements) {
 const before=normalizeStockV41(stock||emptyStockV41());
 const preview=applyStockTransactionV41(before,{
  id:'v413:preview:never-persisted',label:'Aperçu local',movements
 });
 const after=preview.stock;
 if(!preview.changed)throw Error('Aperçu de stock non disponible.');
 const grouped=new Map();
 for(const m of movements) {
  if(m.type==='inventory') {
   const measured=stockMeasureV41(m.amount,m.unit,m.product||null);
   const key='item:'+m.identity+'|'+measured.unit;
   if(!grouped.has(key))grouped.set(key,{kind:'inventory',key:m.identity+'|'+measured.unit,
    name:String(m.name||before.items[m.identity+'|'+measured.unit]?.name||m.identity),
    unit:measured.unit});
  } else if(m.type==='freezer') {
   const key='freezer:'+m.lotId;
   if(!grouped.has(key))grouped.set(key,{kind:'freezer',key:m.lotId,
    name:String(m.name||before.freezer[m.lotId]?.name||m.recipeId),
    unit:'portion'});
  }
 }
 const lines=[...grouped.values()].map(entry=>{
  const isFreezer=entry.kind==='freezer';
  const old=isFreezer?Number(before.freezer[entry.key]?.portions||0):
   Number(before.items[entry.key]?.quantity||0);
  const next=isFreezer?Number(after.freezer[entry.key]?.portions||0):
   Number(after.items[entry.key]?.quantity||0);
  const delta=round(next-old);
  const unit=isFreezer&&(Math.max(old,next)!==1)?'portions':entry.unit;
  return {...entry,before:round(old),after:round(next),delta,
   text:(isFreezer?'❄️ ':'')+entry.name+' : '+quant(old)+' → '+quant(next)+' '+unit+
    ' ('+(delta>=0?'+':'−')+quant(Math.abs(delta))+' '+unit+')'};
 });
 return {lines,after:after,changed:lines.length>0};
}
export function stockConfirmationTextV413(stock,movements,title) {
 const preview=previewStockMovementsV413(stock,movements);
 return String(title||'Confirmer les modifications du Stock maison ?')+'\n\n'+
  preview.lines.map(row=>row.text).join('\n')+
  '\n\nValider ces mouvements de stock ?';
}
