import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const readFn=(start,end)=>{
 const i=src.indexOf('function '+start+'('),j=src.indexOf('function '+end+'(',i);
 assert.ok(i>=0&&j>i,'marqueurs '+start+' '+end);
 return src.slice(i,j)
};
const saveCode=readFn('saveUnifiedCatalogue','carrefourReferenceLinkedV4133');
const visibleCode=readFn('unifiedCatalogueSourceV4114','unifiedCatalogueItems');
const url='https://www.carrefour.fr/p/beurre-tendre-demi-sel-elle-vire-3451790988813';
const ean='3451790988813';
const product=()=>({id:'p1',name:'Beurre salé',store:'carrefour',category:'Autres',
 qty:1,unit:'paquet',ean,url,brand:'ELLE & VIRE',packaging:''});
const ingredient=()=>({id:'ing1',name:'Beurre',productId:'p1',store:'carrefour',category:'Autres'});
function fixture(options={}){
 const state={
  products:structuredClone(options.products??[product()]),
  ingredientCatalog:structuredClone(options.ingredients??[ingredient()]),
  recipes:structuredClone(options.recipes??[{id:'r1',ingredients:[{ingredientId:'ing1',productId:'p1'}]}]),
  weeks:structuredClone(options.weeks??{w1:{extras:[{id:'e1',name:'Beurre',productId:'p1',qty:2,unit:'paquet'}],
   meals:[{type:'products',products:[{productId:'p1',qty:1,unit:'paquet'}]}]}}),
  storePreferences:{},stockV41:{items:{'product:p1|paquet':{identity:'product:p1',quantity:2,unit:'paquet'}}}
 };
 const form={dataset:{
  kind:'daily',id:options.formId??'p1',ingredientId:'',
  ...(options.merged===false?{}:{
   v41154MergedDraft:'1',
   v41154MergeEan:ean,
   v41154MergeUrl:url
  })
 }};
 const data={
  '#catalogueName':{value:'Beurre tendre demi-sel'},
  '#catalogueStore':{value:'carrefour'},
  '#catalogueCategory':{value:'Beurre et crème'},
  '#catalogueQty':{value:'1'},
  '#catalogueUnit':{value:'paquet'},
  '#catalogueFrequent':{checked:false},
  '#catalogueBrand':{value:'ELLE & VIRE'},
  '#cataloguePackaging':{value:'250 g'},
  '#cataloguePackAmount':{value:'250'},
  '#cataloguePackUnit':{value:'g'},
  '#catalogueEan':{value:ean},
  '#catalogueUrl':{value:url}
 };
 const events=[],saved=[];
 const ctx={
  state,URL,
  $:selector=>data[selector]||null,
  productById:id=>state.products.find(p=>p.id===id),
  ingredientById:id=>state.ingredientCatalog.find(p=>p.id===id),
  ingredientByName:()=>null,
  uid:()=>{throw Error('Aucun nouvel identifiant ne doit être créé pour une fusion')},
  norm:v=>String(v||'').normalize('NFD').toLowerCase().trim(),
  contentUnits:['g','kg','ml','l','pièce','paquet','boîte'],
  units:['g','kg','ml','l','pièce','paquet','boîte'],
  productCategories:['Autres','Beurre et crème'],
  ingredientStoreTab:'carrefour',
  validCarrefourLink:raw=>{
   if(!raw)return '';
   const u=new URL(raw);
   if(u.protocol!=='https:'||u.hostname!=='www.carrefour.fr')throw Error('Lien non Carrefour');
   return u.href
  },
  toast:s=>events.push(['toast',s]),
  confirm:()=>true,
  captureCatalogueRayonUiV4115:()=>({}),
  persist:()=>{events.push(['persist']);saved.push(structuredClone(state))},
  closeModal:()=>events.push(['close']),
  render:()=>events.push(['render']),
  restoreCatalogueRayonUiV4115:()=>events.push(['restore']),
  showCatalogueModalV413:(title,body)=>events.push(['modal',title,body]),
  carrefourPasteFeedbackV41151:(id,msg)=>events.push(['feedback',id,msg]),
  showCarrefourExistingReferenceV41153:dup=>events.push(['duplicate',dup.id]),
  ingredientStore:i=>i.store||'carrefour',
  catalogueCategoryV40:p=>p.category||'Autres',
  html:input=>String(input)
 };
 const api=runInNewContext(saveCode+visibleCode+
  ';({saveUnifiedCatalogue,unifiedCatalogueSourceV4114})',ctx);
 const submit=()=>api.saveUnifiedCatalogue({target:form,preventDefault:()=>events.push(['preventDefault'])});
 return {state,form,data,events,saved,api,submit}
}

test('V41.15.4 : fusion dans la fiche créée : même ID de référence, nom du brouillon, un seul produit enregistré',()=>{
 const f=fixture();
 f.submit();
 assert.equal(f.state.products.length,1);
 assert.equal(f.state.products[0].id,'p1');
 assert.equal(f.state.products[0].name,'Beurre tendre demi-sel');
 assert.equal(f.state.products[0].ean,ean);
 assert.equal(f.state.products[0].url,url);
 assert.equal(f.state.products[0].showInCatalogue,true);
 assert.equal(f.state.ingredientCatalog[0].productId,'p1');
 assert.equal(f.state.recipes[0].ingredients[0].productId,'p1');
 assert.equal(f.state.weeks.w1.extras[0].productId,'p1');
 assert.equal(f.state.weeks.w1.meals[0].products[0].productId,'p1');
 assert.equal(f.state.stockV41.items['product:p1|paquet'].quantity,2);
 assert.equal(f.saved.length,1);
 assert.equal(f.saved[0].products[0].name,'Beurre tendre demi-sel');
 assert.equal(f.events.filter(e=>e[0]==='modal').length,1,'confirmation visible après enregistrement');
 assert.match(f.events.find(e=>e[0]==='modal')[1],/Fusion enregistrée/);
 assert.match(f.events.find(e=>e[0]==='modal')[2],/Voir ma fiche enregistrée/);
});

test('V41.15.4 : même si la référence est liée à un ingrédient, la fiche fusionnée reste visible comme produit',()=>{
 const f=fixture();f.submit();
 const items=Array.from(f.api.unifiedCatalogueSourceV4114());
 assert.equal(items.filter(x=>x.type==='daily'&&x.id==='p1').length,1);
 assert.equal(items.filter(x=>x.type==='ingredient'&&x.id==='ing1').length,1);
 assert.equal(items.find(x=>x.type==='daily').name,'Beurre tendre demi-sel');
});

test('V41.15.4 : les achats fréquents associés à la référence ne sont pas perdus',()=>{
 const p=product();p.frequent=true;
 const f=fixture({products:[p]});
 f.submit();
 assert.equal(f.state.products[0].frequent,true);
 assert.equal(f.saved[0].products[0].frequent,true)
});

test('V41.15.4 : changer l’EAN après la fusion bloque la sauvegarde sans écraser la référence',()=>{
 const f=fixture();f.data['#catalogueEan'].value='3270190010000';
 const before=JSON.stringify(f.state);f.submit();
 assert.equal(JSON.stringify(f.state),before);
 assert.equal(f.saved.length,0);
 assert.match(f.events.find(x=>x[0]==='toast')[1],/lien ou l’EAN a changé/i);
});

test('V41.15.4 : changer l’URL après la fusion bloque la sauvegarde',()=>{
 const f=fixture();f.data['#catalogueUrl'].value='https://www.carrefour.fr/p/autre-produit-3451790988813';
 f.submit();
 assert.equal(f.saved.length,0);
 assert.equal(f.state.products[0].name,'Beurre salé')
});

test('V41.15.4 : une référence supprimée entre confirmation et enregistrement ne recrée aucune fiche',()=>{
 const f=fixture({products:[]});f.submit();
 assert.equal(f.state.products.length,0);
 assert.equal(f.saved.length,0);
 assert.ok(f.events.some(x=>x[0]==='toast'&&/n’existe plus/.test(x[1])));
});

test('V41.15.4 : une troisième fiche avec le même EAN continue à bloquer le doublon',()=>{
 const f=fixture({products:[product(),{...product(),id:'p2',name:'Autre beurre'}]});
 f.submit();
 assert.equal(f.saved.length,0);
 assert.deepEqual(Array.from(f.state.products,x=>x.name),['Beurre salé','Autre beurre']);
 assert.ok(f.events.some(x=>x[0]==='duplicate'&&x[1]==='p2'));
});

test('V41.15.4 : une modification normale sans fusion ne crée pas de fiche visible en double',()=>{
 const f=fixture({merged:false});f.submit();
 assert.equal(f.state.products.length,1);
 assert.equal(f.state.products[0].showInCatalogue,false);
 assert.equal(f.events.filter(x=>x[0]==='modal').length,0);
 assert.equal(f.events.filter(x=>x[0]==='persist').length,1)
});

test('V41.15.4 : sauvegarder une fiche fusionnée une seconde fois conserve sa visibilité',()=>{
 const f=fixture();f.submit();
 const follow=fixture({merged:false,products:structuredClone(f.state.products)});
 follow.submit();
 assert.equal(follow.state.products[0].showInCatalogue,true);
 assert.equal(follow.state.products.length,1)
});

test('V41.15.4 : conserve le modèle complet de sauvegarde Firebase sans modifier Userscript',()=>{
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(src,/function continueCarrefourExistingReferenceV41153\(id\)/);
 assert.doesNotMatch(readFn('continueCarrefourExistingReferenceV41153','applyCarrefourToOpenProductV413'),/productEditor\(/,'aucun basculement dans une autre fiche');
 assert.match(src,/showInCatalogue:Boolean\(old\?\.showInCatalogue\|\|mergedInDraft\)/);
 assert.match(src,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(index,/app\.js\?v=20261111-41-16-ui/);
 assert.match(sw,/menus-drive-v41-16-ui-20261111/);
});
