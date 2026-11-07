import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
function take(from,to){
 const a=src.indexOf('function '+from+'('),b=src.indexOf('function '+to+'(',a);
 assert.ok(a>=0&&b>a,from+' → '+to+' introuvable');
 return src.slice(a,b)
}
const sample={v:1,url:'https://www.carrefour.fr/p/cordons-bleus-3270000012345',
 name:'CORDONS BLEUS MARQUE 500G',brand:'MARQUE',packaging:'500g',ean:'3270000012345'};
function importedFixture({ingredient=null,product=null,existing=null}={}){
 const state={products:[product,existing].filter(Boolean),ingredientCatalog:ingredient?[ingredient]:[],recipes:[]};
 const inputUrl={value:''},inputEan={value:''},notes=[],editors=[],modals=[],calls=[];
 const ctx={state,URL,location:{},currentTab:'produits',catalogueModalScrollV413:null,
  tabScrollV33:{produits:619},
  pendingCarrefourDailyIdV413:product?.id||null,
  pendingIngredientLinkId:ingredient?.id||null,
  validCarrefourLink:x=>x,ingredientById:id=>state.ingredientCatalog.find(x=>x.id===id),
  productById:id=>state.products.find(x=>x.id===id),
  switchTabV33:x=>calls.push('tab:'+x),
  productEditor:(...args)=>editors.push(args),
  showCatalogueModalV413:(...args)=>modals.push(args),
  html:String,
  $:selector=>selector==='#catalogueUrl'?inputUrl:
   selector==='#catalogueEan'?inputEan:
   selector==='#catalogueEditorForm'?{
    insertAdjacentHTML:(where,body)=>notes.push(body),
    querySelector:()=>({setAttribute:(name)=>calls.push('open:'+name)})
   }:null
 };
 const open=runInNewContext(take('openImportedCarrefourProduct','importCarrefourProductFromHash')+
  ';openImportedCarrefourProduct',ctx);
 return {state,ctx,open,editors,modals,calls,inputUrl,inputEan,notes};
}

test('V41.13 : charger Carrefour sur un produit existant ne modifie jamais son nom',()=>{
 const product={id:'daily1',name:'Cordon bleu',url:'',ean:'',brand:'Mon repère',packaging:'2 pièces'};
 const fx=importedFixture({product});
 fx.open(sample);
 assert.equal(product.name,'Cordon bleu');
 assert.equal(product.brand,'Mon repère');
 assert.equal(product.packaging,'2 pièces');
 assert.equal(product.url,'');
 assert.equal(fx.editors.length,1);
 assert.equal(fx.editors[0][0],'daily1','réutilise la fiche existante');
 assert.equal(fx.inputUrl.value,sample.url,'nouveau lien dans le formulaire uniquement');
 assert.equal(fx.inputEan.value,sample.ean);
 assert.match(fx.notes[0],/Le nom « Cordon bleu » est conservé/);
 assert.equal(fx.ctx.pendingCarrefourDailyIdV413,null);
});

test('V41.13 : un ingrédient existant garde son nom lors de la création de sa référence',()=>{
 const ing={id:'ing1',name:'Mes cordons bleus',productId:null};
 const fx=importedFixture({ingredient:ing});
 fx.open(sample);
 assert.equal(fx.editors.length,1);
 assert.equal(fx.editors[0][0],null);
 assert.equal(fx.editors[0][1].name,'Mes cordons bleus');
 assert.equal(fx.editors[0][1].brand,'MARQUE');
 assert.equal(fx.editors[0][2],'ing1');
 assert.equal(ing.name,'Mes cordons bleus');
});

test('V41.13 : refuser une référence déjà liée à une autre fiche sans renommer ni modifier',()=>{
 const product={id:'d1',name:'Mon produit',url:'',ean:''};
 const other={id:'d2',name:'Autre produit',url:sample.url,ean:sample.ean};
 const fx=importedFixture({product,existing:other});fx.open(sample);
 assert.equal(fx.editors.length,0);
 assert.match(fx.modals[0][0],/déjà associée/);
 assert.equal(product.name,'Mon produit');
 assert.equal(product.url,'');
 assert.equal(other.url,sample.url);
});

function removalFixture(){
 const ing={id:'ingredient',name:'Ma fondue',productId:'product1'};
 const p1={id:'product1',name:'Poireaux Carrefour',url:sample.url,ean:sample.ean,brand:'M',packaging:'500 g',
  category:'Légumes',qty:1,unit:'boîte'};
 const p2={id:'product2',name:'Sopalin',url:'https://www.carrefour.fr/p/sopalin',ean:''};
 const state={products:[p1,p2],ingredientCatalog:[ing],recipes:[
  {id:'recipe1',ingredients:[{ingredientId:'ingredient',name:'Ma fondue',productId:'product1'},
   {ingredientId:'other',name:'Carottes',productId:'product2'}]}
 ],weeks:{'2026-11-07':{extras:[{name:'Poireaux',productId:'product1'}]}}};
 const actions=[],ctx={state,ingredientById:id=>state.ingredientCatalog.find(x=>x.id===id),
  productById:id=>state.products.find(x=>x.id===id),
  checkpoint:label=>actions.push(['checkpoint',label]),
  persist:()=>actions.push(['persist']),closeModal:()=>actions.push(['close']),
  render:keep=>actions.push(['render',keep]),toast:msg=>actions.push(['toast',msg]),confirm:()=>true
 };
 const code=take('carrefourReferenceLinkedV4133','productBadge');
 const fun=runInNewContext(code+';({unlinkIngredientCarrefourV413,clearDailyCarrefourV413})',ctx);
 return {state,ing,p1,p2,actions,...fun};
}

test('V41.13 : détacher Carrefour d’un ingrédient conserve les deux catalogues et les achats',()=>{
 const f=removalFixture();const initialOther=JSON.stringify(f.p2);
 const initialWeeks=JSON.stringify(f.state.weeks);
 assert.equal(f.unlinkIngredientCarrefourV413('ingredient'),true);
 assert.equal(f.ing.productId,null);
 assert.equal(f.state.recipes[0].ingredients[0].productId,null);
 assert.equal(f.state.recipes[0].ingredients[0].name,'Ma fondue');
 assert.equal(f.state.recipes[0].ingredients[1].productId,'product2');
 assert.equal(f.state.products.length,1,'la référence orpheline est réellement supprimée');
 assert.equal(JSON.stringify(f.state.products[0]),initialOther,'le second produit est conservé');
 assert.equal(f.state.weeks['2026-11-07'].extras[0].productId,null);
 assert.equal(f.state.weeks['2026-11-07'].extras[0].name,'Poireaux');
 assert.notEqual(JSON.stringify(f.state.weeks),initialWeeks,'seul le lien supprimé est nettoyé');
 assert.ok(f.actions.some(x=>x[0]==='persist'));
 assert.ok(f.actions.some(x=>x[0]==='render'&&x[1]===true));
});

test('V41.13 : détacher le lien d’un produit conserve son nom, sa fiche et ses paramètres',()=>{
 const f=removalFixture();const before=JSON.stringify({...f.p1,url:'',ean:''});
 assert.equal(f.clearDailyCarrefourV413('product1'),true);
 assert.equal(f.p1.url,'');
 assert.equal(f.p1.ean,'');
 assert.equal(JSON.stringify(f.p1),before);
 assert.equal(f.state.products.length,2);
 assert.equal(f.ing.productId,'product1');
 assert.equal(f.state.weeks['2026-11-07'].extras[0].productId,'product1');
 assert.ok(f.actions.some(x=>x[0]==='persist'));
});

test('V41.13 : détacher deux fois n’écrase aucune donnée et ne génère pas de sauvegarde supplémentaire',()=>{
 const f=removalFixture();assert.equal(f.clearDailyCarrefourV413('product1'),true);
 const count=f.actions.filter(x=>x[0]==='persist').length;
 assert.equal(f.clearDailyCarrefourV413('product1'),false);
 assert.equal(f.actions.filter(x=>x[0]==='persist').length,count);
});

test('V41.13 : ouvrir et fermer une fiche préserve la hauteur du catalogue',()=>{
 const target={innerHTML:''},calls=[],ctx={
  catalogueModalScrollV413:null,uxModalPositionV4115:null,pendingCarrefourDailyIdV413:null,pendingIngredientLinkId:null,
  currentTab:'produits',window:{scrollY:730,scrollTo:args=>calls.push(args)},
  modalRoot:target,showModal:(title,body,focus)=>calls.push({title,focus}),
  requestAnimationFrame:callback=>callback()
 };
 const open=runInNewContext(take('showCatalogueModalV413','productById')+
  ';showCatalogueModalV413',ctx);
 const close=runInNewContext(take('closeModal','selectOptions')+';closeModal',ctx);
 open('Gérer le produit','form');
 assert.equal(ctx.catalogueModalScrollV413,730);
 assert.ok(calls.some(x=>x.focus===false),'aucun focus automatique sur le champ nom');
 close();
 assert.equal(ctx.catalogueModalScrollV413,null);
 assert.ok(calls.filter(x=>typeof x.top==='number').every(x=>x.top===730));
});

test('V41.13 : les trois actions sont proposées et la sauvegarde ne remonte plus en haut',()=>{
 assert.match(src,/data-action="v413-unlink-ingredient-carrefour"/);
 assert.match(src,/data-action="v413-clear-daily-carrefour"/);
 assert.match(src,/data-action="v413-import-daily-carrefour"/);
 assert.match(src,/function carrefourClipboardModal\(ingredientId=null,dailyId=null\)/);
 assert.match(src,/persist\(\);closeModal\(\);render\(true\);\s*restoreCatalogueRayonUiV4115\('produits',rayonUiV4115\);\s*toast\('Produit enregistré !'\)/);
 assert.match(src,/function showModal\(title,body,autoFocus=true\)/);
 assert.match(css,/\.v413-clear-reference/);
});

function inlineCarrefourFixture(id='product1'){
 const product={id:'product1',name:'Nom enregistré',url:'',ean:'',brand:'Marque actuelle'};
 const state={products:[product]};
 const inputs={
  '#catalogueName':{value:'Nom personnalisé en cours de saisie'},
  '#catalogueUrl':{value:''},
  '#catalogueEan':{value:'9999999999999'},
  '#catalogueEditorForm':{dataset:{kind:'daily',id}},
  '#v413ReferenceStatus':{textContent:''}
 };
 const ctx={
  CARREFOUR_CLIP_PREFIX:'MD-CARREFOUR-V1:',URL,state,
  validCarrefourLink:raw=>{
   const u=new URL(raw);
   if(u.protocol!=='https:'||!(u.hostname==='carrefour.fr'||u.hostname.endsWith('.carrefour.fr')))
    throw Error('Lien non Carrefour');
   return u.href
  },
  $:query=>inputs[query]||null
 };
 const parser=take('function parseCarrefourClipboardV41152(raw,allowDirectUrl=false){','function openImportedCarrefourProduct(data){');
 const apply=runInNewContext(parser+take('applyCarrefourToOpenProductV413','carrefourClipboardModal')+
  ';applyCarrefourToOpenProductV413',ctx);
 return {apply,inputs,product,state}
}

test('V41.13 : coller une référence dans une fiche garde le nom tapé même non enregistré',()=>{
 const f=inlineCarrefourFixture();
 const parsed='MD-CARREFOUR-V1:'+JSON.stringify(sample);
 const output=f.apply(parsed);
 assert.equal(output.url,sample.url);
 assert.equal(f.inputs['#catalogueName'].value,'Nom personnalisé en cours de saisie');
 assert.equal(f.product.name,'Nom enregistré');
 assert.equal(f.inputs['#catalogueUrl'].value,sample.url);
 assert.equal(f.inputs['#catalogueEan'].value,sample.ean);
 assert.match(f.inputs['#v413ReferenceStatus'].textContent,/Le nom du produit est inchangé/);
});

test('V41.13 : une fiche non encore créée peut recevoir un lien sans modifier son nom',()=>{
 const f=inlineCarrefourFixture('');
 f.apply(sample.url);
 assert.equal(f.inputs['#catalogueName'].value,'Nom personnalisé en cours de saisie');
 assert.equal(f.inputs['#catalogueEan'].value,'','un lien sans EAN efface l’ancien code-barres du formulaire');
 assert.equal(f.inputs['#catalogueUrl'].value,sample.url);
});

test('V41.13 : un lien déjà utilisé n’écrase ni la fiche ni le formulaire',()=>{
 const f=inlineCarrefourFixture();
 f.state.products.push({id:'other',name:'Déjà associé',url:sample.url,ean:sample.ean});
 assert.throws(()=>f.apply('MD-CARREFOUR-V1:'+JSON.stringify(sample)),/déjà liée/);
 assert.equal(f.inputs['#catalogueName'].value,'Nom personnalisé en cours de saisie');
 assert.equal(f.inputs['#catalogueUrl'].value,'');
 assert.equal(f.product.url,'');
});

test('V41.13 : une référence non Carrefour est refusée avant de remplir la fiche',()=>{
 const f=inlineCarrefourFixture();
 assert.throws(()=>f.apply('https://example.com/p/123'),/non Carrefour/);
 assert.equal(f.inputs['#catalogueName'].value,'Nom personnalisé en cours de saisie');
 assert.equal(f.inputs['#catalogueUrl'].value,'');
});

test('V41.13 : collage direct, pas de changement de fenêtre ni de réinitialisation de nom',()=>{
 assert.match(src,/function applyCarrefourToOpenProductV413\(raw\)/);
 assert.match(src,/function importCarrefourIntoOpenProductV413\(\)/);
 assert.match(src,/data-action="v413-use-pasted-reference"/);
 assert.match(src,/else if\(mode==='v413-import-daily-carrefour'\)void importCarrefourIntoOpenProductV413\(\)/);
 assert.match(src,/data-action="v413-clear-daily-carrefour"/);
 assert.match(css,/\.v413-reference-paste\[hidden\]/);
});
