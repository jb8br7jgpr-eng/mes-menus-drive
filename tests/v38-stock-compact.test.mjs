import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
function cut(start,end){
 const a=js.indexOf('function '+start+'('),b=js.indexOf('function '+end+'(',a);
 assert.ok(a>=0&&b>a,start+' to '+end);return js.slice(a,b)
}
const product={id:'box-6',name:'Boîte de six œufs',unit:'boîte',packAmount:6,packUnit:'pièce'};
const week={pantryUnits:{}};
const x={id:'produit:box-6|achat',productId:product.id,stockKey:'produit:box-6|pièce',stockUnit:'pièce',totalNeedAmount:8,
  totalNeedUnit:'pièce',stockAmount:4,qty:1,unit:'boîte',name:'Œufs',source:['Recettes'],checked:false,
  grossNeeded:'8 pièce',store:'carrefour',manualExtraIds:[]};
const ctx={
 productById:id=>id===product.id?product:null,getWeek:()=>week,
 converted:(q,u)=>[Number(q)||0,u||'pièce'],
 quantity:(q,u)=>q+' '+u,
 units:['g','kg','ml','cl','l','pièce','paquet','boîte'],
 html:s=>String(s),shopping:()=>[x],showModal:()=>{},
 $:()=>null
};
const stock=runInNewContext(cut('stockUnitChoices','manualEditControl')+';({stockUnitChoices,stockInputToBase,stockBaseToUnit,stockPreview,homeStockModal})',ctx);

test('Le stock est un bouton compact sur la ligne existante sans doubler les actions',()=>{
 const row=runInNewContext(cut('shoppingRow','editShoppingItemModal')+';shoppingRow',ctx);
 const initial=row({...x,stockAmount:0,grossNeeded:'8 pièce'});
 assert.match(initial,/data-action="home-stock"/);
 assert.match(initial,/🏠 Stock maison/);
 assert.match(initial,/data-action="edit-shopping-item"/);
 assert.doesNotMatch(initial,/shopping-store-chip/);
 assert.equal((initial.match(/data-action="home-stock"/g)||[]).length,1);
 const already=row(x);
 assert.match(already,/🏠 4 pièce/);
 assert.doesNotMatch(already,/Maison : 4 pièce/, 'Le stock ne doit pas être répété dans le sous-titre');
 const editor=cut('editShoppingItemModal','renderCourses');
 assert.doesNotMatch(editor,/data-action="home-stock"/,'Stock n’est plus caché sous Modifier');
 assert.match(editor,/data-action="exclude"/);
 assert.match(editor,/data-action="edit-manual-row"/);
 assert.match(css,/\.v38-stock-chip/);
 assert.match(css,/min-height:28px/);
});
test('Pour 8 œufs dont 4 à la maison, le résultat montre une seule boîte de 6',()=>{
 assert.deepEqual(Array.from(stock.stockUnitChoices(x)),['pièce','boîte']);
 assert.equal(stock.stockInputToBase(x,4,'pièce'),4);
 assert.equal(stock.stockInputToBase(x,1,'boîte'),6);
 assert.equal(stock.stockBaseToUnit(x,6,'boîte'),1);
 const result=stock.stockPreview(x,4,'pièce');
 assert.match(result,/À acheter : 1 boîte Carrefour/);
 assert.match(result,/besoin restant : 4 pièce/);
 assert.doesNotMatch(result,/paquet Carrefour/);
 assert.match(stock.stockPreview(x,8,'pièce'),/Rien à acheter/);
});
test('L’ancienne unité paquet reste compatible quand elle existe dans un stock historique',()=>{
 week.pantryUnits[x.stockKey]='paquet';
 assert.deepEqual(Array.from(stock.stockUnitChoices(x)),['pièce','boîte','paquet']);
 assert.equal(stock.stockInputToBase(x,1,'paquet'),6);
 assert.equal(stock.stockBaseToUnit(x,12,'paquet'),2);
});
test('Un seul éditeur de stock existant, avec réglage moins/plus et résultat',()=>{
 const modal=cut('homeStockModal','manualEditControl');
 assert.match(modal,/data-action="stock-decrease"/);
 assert.match(modal,/data-action="stock-increase"/);
 assert.match(modal,/data-action="stock-zero"/);
 assert.match(modal,/data-action="stock-all"/);
 assert.match(modal,/stockPreview\(x,Number\(amount\),selected\)/);
 assert.match(js,/else if\(mode==='stock-decrease'\|\|mode==='stock-increase'\)/);
 assert.match(js,/else if\(mode==='save-home-stock'\)/);
 assert.match(css,/\.v38-stock-stepper/);
});
test('Le modèle de stockage et le système de synchronisation n’ont pas changé',()=>{
 assert.match(js,/const V34_CLOUD_ACTIVE = true/);
 assert.match(js,/const baseState=\(\)=>\(\{schema:1/);
 assert.match(js,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
});
