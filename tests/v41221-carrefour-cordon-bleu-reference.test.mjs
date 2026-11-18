// V41.22.1 : cordons bleus, références Carrefour enregistrées mais non liées / EAN manquant.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
function section(from,to){
 const i=app.indexOf(from),j=app.indexOf(to,i+from.length);
 assert.ok(i>=0&&j>i,'bloc absent : '+from);
 return app.slice(i,j);
}
const helper=section('function carrefourEanV41221(', 'function catalogueReferenceV418(');
const catalogue=section('function catalogueReferenceV418(', 'function unifiedCatalogueRows(');
const drive=section('function driveTransferRows(', 'function driveTransferLines(');
const fakeEan='3560070123456';
function context(state={}){
 const store={products:[],ingredientCatalog:[],recipes:[],weeks:{},stockV41:{items:{}},...state};
 return {state:store,norm,html:x=>String(x),quantity:(n,u)=>n+' '+u,
  ingredientById:id=>store.ingredientCatalog.find(x=>x.id===id),
  productById:id=>store.products.find(x=>x.id===id)};
}
function api(ctx){
 return runInNewContext(helper+catalogue+
 ';({ean:carrefourEanV41221,candidates:carrefourReferenceCandidatesV41221,'+
 ' diagnosis:carrefourIngredientDiagnosisV41221,status:catalogueReferenceV418,'+
 ' associate:linkExistingCarrefourV41221})',ctx);
}
test('Une URL enregistrée sans code-barres ne devient pas faussement prête',()=>{
 const ctx=context();
 const fn=api(ctx);
 const p={id:'p',name:'Cordons bleus',unit:'boîte',url:'https://www.carrefour.fr/p/cordons-bleus',ean:''};
 assert.equal(fn.ean(p),'');
 const ingState=fn.status({type:'ingredient',store:'carrefour'},p);
 assert.equal(ingState.kind,'incomplete');
 assert.match(ingState.label,/Code-barres/);
 assert.equal(fn.status({type:'daily',store:'carrefour'},p).kind,'incomplete');
 assert.equal(fn.status({type:'ingredient',store:'carrefour'},null).kind,'missing');
 assert.equal(fn.status({type:'daily',store:'carrefour'},null).kind,'missing');
 assert.equal(fn.status({type:'daily',store:'grandfrais'},p).kind,'grandfrais');
 p.ean=fakeEan;
 assert.equal(fn.status({type:'ingredient',store:'carrefour'},p).kind,'linked');
 assert.equal(fn.status({type:'daily',store:'carrefour'},p).kind,'linked');
});
test('Le panier lit le même EAN que le catalogue, ou l’extrait du lien',()=>{
 const p={id:'p1',name:'Cordons bleus',url:'https://www.carrefour.fr/p/cordons-bleus-3560070123456',ean:'',unit:'boîte'};
 const ctx=context({products:[p]});Object.assign(ctx,{shopping:()=>[
  {id:'produit:p1|achat',name:'Cordons bleus',productId:'p1',qty:2,unit:'boîte',store:'carrefour'},
  {id:'ingredient:i2|pièce',name:'Sauce',ingredientId:'i2',productId:null,qty:1,unit:'pièce',store:'carrefour'}
 ]});
 const fn=api(ctx);
 const rows=runInNewContext(drive+';driveTransferRows',Object.assign(ctx,{carrefourEanV41221:fn.ean}))();
 assert.equal(rows[0].ean,fakeEan);
 assert.equal(rows[0].ready,true);
 assert.equal(rows[1].ready,false);
 assert.match(rows[1].reason,/Référence non liée/);
 p.url='https://www.carrefour.fr/p/cordons-bleus';
 const missing=runInNewContext(drive+';driveTransferRows',Object.assign(ctx,{carrefourEanV41221:fn.ean}))();
 assert.equal(missing[0].ready,false);
 assert.match(missing[0].reason,/EAN-13 absent/);
});
test('Une fiche Cordons bleus non visible séparément est suggérée à Cordon bleu',()=>{
 const hidden={id:'p1',name:'Cordons bleus de poulet',unit:'boîte',store:'carrefour',ean:fakeEan};
 const unrelated={id:'p2',name:'Tomates',unit:'pièce',store:'carrefour',ean:'1234567890123'};
 const ingredient={id:'i1',name:'Cordon bleu',productId:null};
 const ctx=context({products:[hidden,unrelated],ingredientCatalog:[ingredient]});
 const fn=api(ctx);
 assert.deepEqual(Array.from(fn.candidates(ingredient),p=>p.id),['p1']);
 const markup=fn.diagnosis(ingredient,null);
 assert.match(markup,/Cordons bleus de poulet/);
 assert.match(markup,/data-action="v41221-link-carrefour"/);
 assert.match(markup,/EAN disponible/);
 assert.doesNotMatch(markup,/Tomates/);
 assert.equal(ingredient.productId,null,'diagnostic sans mutation');
});
test('La réparation demande un accord, conserve les données et met à jour les liaisons des recettes',()=>{
 const product={id:'p1',name:'Cordons bleus',ean:fakeEan,store:'carrefour'};
 const ing={id:'i1',name:'Cordon bleu',productId:null,store:'carrefour'};
 const recipe={id:'r1',ingredients:[{ingredientId:'i1',productId:null,name:'Cordon bleu',qty:2,unit:'pièce'}]};
 const weeks={'2026-11-14':{meals:[{type:'recipe',recipeId:'r1'}],generatedIngredients:[{ingredientId:'i1',name:'Cordon bleu',qty:2,unit:'pièce'}]}};
 const stock={items:{'ingredient:i1|pièce':{identity:'ingredient:i1',quantity:3,unit:'pièce'}}};
 const ctx=context({products:[product],ingredientCatalog:[ing],recipes:[recipe],weeks,stockV41:stock});
 let writes=0,checkpoints=0,closed=0,rendered=0,confirmValue=false;
 Object.assign(ctx,{confirm:()=>confirmValue,checkpoint:()=>{checkpoints++},
  persist:()=>{writes++},closeModal:()=>{closed++},render:()=>{rendered++},toast:()=>{}});
 const fn=api(ctx);
 const before=JSON.stringify({weeks,stock});
 assert.equal(fn.associate('i1','p1'),false,'refus de confirmation');
 assert.equal(ing.productId,null);
 confirmValue=true;
 assert.equal(fn.associate('i1','p1'),true);
 assert.equal(ing.productId,'p1');
 assert.equal(recipe.ingredients[0].productId,'p1');
 assert.equal(JSON.stringify({weeks,stock}),before,'pas de suppression historique ou stock');
 assert.equal(writes,1);assert.equal(checkpoints,1);assert.equal(closed,1);assert.equal(rendered,1);
});
test('La réparation propose les anciennes fiches sans suppression automatique',()=>{
 assert.match(app,/carrefourIngredientDiagnosisV41221\(record,linked\)/);
 assert.match(app,/mode==='v41221-link-carrefour'/);
 const linkSource=section('function linkExistingCarrefourV41221(', 'function catalogueReferenceV418(');
 assert.doesNotMatch(linkSource,/deleteCarrefourProductFromStateV41153|removeOrphanCarrefourReferenceV4133|state\.products\s*=/);
 assert.match(css,/\.v41221-diagnosis/);
 assert.match(css,/\.v418-reference-badge--incomplete/);
 assert.doesNotThrow(()=>new Function(app));
});
