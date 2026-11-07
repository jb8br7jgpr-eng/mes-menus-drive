import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function code(from,to){
 const a=source.indexOf('function '+from+'('),b=source.indexOf('function '+to+'(',a);
 assert.ok(a>=0&&b>a,from+'/'+to);
 return source.slice(a,b)
}
const fn=code('deleteCarrefourProductFromStateV41153','showCarrefourExistingReferenceV41153');
const orphan=code('removeOrphanCarrefourReferenceOnImportV41153','continueCarrefourExistingReferenceV41153');
const baseProduct=()=>({id:'p1',name:'Beurre salé',store:'carrefour',ean:'3451790988813',
 url:'https://www.carrefour.fr/p/beurre-tendre-demi-sel-elle-vire-3451790988813',
 qty:1,unit:'paquet'});
const baseIngredient=()=>({id:'ing1',name:'Beurre salé',productId:'p1',store:'carrefour'});
function fixture(opts={}){
 const state={
  products:structuredClone(opts.products??[baseProduct()]),
  ingredientCatalog:structuredClone(opts.ingredients??[baseIngredient()]),
  recipes:structuredClone(opts.recipes??[]),
  weeks:structuredClone(opts.weeks??{}),
  storePreferences:structuredClone(opts.storePreferences??{'product:p1':'carrefour','ingredient:ing1':'carrefour'}),
  stockV41:structuredClone(opts.stockV41??{items:{}})
 };
 const events=[],saved=[];
 const copy='MD-CARREFOUR-V1:'+JSON.stringify({
  v:1,url:baseProduct().url,ean:baseProduct().ean,name:'Beurre demi-sel'
 });
 const fields={
  '#catalogueEditorForm':{dataset:{kind:'daily',id:opts.formId??''}},
  '#v413ReferencePaste':{value:copy},
  '#catalogueName':{value:'Beurre demi-sel'},
  '#catalogueUrl':{value:''},
  '#catalogueEan':{value:''},
  '#v413ReferenceStatus':{textContent:'',dataset:{}}
 };
 const ctx={
  state,
  $:key=>fields[key]||null,
  URL,
  ingredientById:id=>state.ingredientCatalog.find(x=>x.id===id),
  productById:id=>state.products.find(x=>x.id===id),
  norm:s=>String(s||'').normalize('NFD').toLowerCase().trim(),
  confirm:s=>{events.push(['confirm',s]);return opts.confirmResult!==false},
  checkpoint:s=>events.push(['checkpoint',s]),
  persist:()=>{events.push(['persist']);saved.push(structuredClone(state))},
  closeModal:()=>events.push(['close']),
  render:()=>events.push(['render']),
  toast:s=>events.push(['toast',s]),
  parseCarrefourClipboardV41152:x=>JSON.parse(x.slice('MD-CARREFOUR-V1:'.length)),
  validCarrefourLink:x=>{
   const url=new URL(x);if(url.hostname!=='www.carrefour.fr')throw Error('Domaine invalide');return url.href
  },
  applyCarrefourToOpenProductV413:raw=>{
   const parsed=JSON.parse(raw.slice('MD-CARREFOUR-V1:'.length));
   fields['#catalogueUrl'].value=parsed.url;
   fields['#catalogueEan'].value=parsed.ean;
   events.push(['apply'])
  },
  carrefourPasteFeedbackV41151:(target,message)=>{fields[target].textContent=message},
 };
 const api=runInNewContext(fn+orphan+
  ';({deleteCarrefourProductFromStateV41153,deleteCatalogIngredientV41153,deleteCatalogProductV41153,removeOrphanCarrefourReferenceOnImportV41153})',ctx);
 return {state,api,fields,events,saved}
}

test('V41.15.3 : supprimer un ingrédient supprime bien son EAN et son lien du catalogue synchronisé',()=>{
 const f=fixture({
  weeks:{w1:{
   extras:[{id:'e1',name:'Beurre salé',ingredientId:'ing1',productId:'p1',qty:2,unit:'paquet'}],
   generatedIngredients:[{name:'Beurre salé',ingredientId:'ing1',productId:'p1',qty:150,unit:'g'}],
   meals:[{type:'products',products:[{productId:'p1',qty:1,unit:'paquet'}]},
    {type:'recipe',recipeId:'rec2',products:[{productId:'p1',qty:1,unit:'paquet'}]}]
  }},
  stockV41:{items:{
    'ingredient:ing1|g':{identity:'ingredient:ing1',unit:'g',quantity:250},
    'product:p1|paquet':{identity:'product:p1',unit:'paquet',quantity:1},
    'ingredient:other|g':{identity:'ingredient:other',unit:'g',quantity:100}
  }}
 });
 assert.equal(f.api.deleteCatalogIngredientV41153('ing1'),true);
 assert.equal(f.state.ingredientCatalog.length,0);
 assert.equal(f.state.products.length,0);
 const week=f.state.weeks.w1;
 assert.equal(week.extras[0].qty,2,'achats manuels conservés');
 assert.equal(week.extras[0].ingredientId,null);
 assert.equal(week.extras[0].productId,null);
 assert.equal(week.generatedIngredients[0].productId,null);
 assert.equal(week.meals[0],null,'article exclusivement produit supprimé du menu');
 assert.equal(week.meals[1].recipeId,'rec2','autre recette conservée');
 assert.equal(week.meals[1].products,undefined,'ancienne référence retirée de la recette programmée');
 assert.equal(f.state.stockV41.items['ingredient:ing1|g'],undefined);
 assert.equal(f.state.stockV41.items['product:p1|paquet'],undefined);
 assert.equal(f.state.stockV41.items['ingredient:other|g'].quantity,100);
 assert.equal(f.state.storePreferences['product:p1'],undefined);
 assert.equal(f.state.storePreferences['ingredient:ing1'],undefined);
 assert.equal(f.saved.length,1);
 assert.equal(f.saved[0].products.length,0);
 assert.ok(!JSON.stringify(f.saved[0]).includes('3451790988813'),'aucun EAN de la fiche dans la version active envoyée');
 assert.ok(!JSON.stringify(f.saved[0]).includes('beurre-tendre-demi-sel-elle-vire'),'aucun lien de la fiche dans la version active envoyée');
 assert.ok(f.events.find(x=>x[0]==='confirm'&&/supprimés/.test(x[1])));
});

test('V41.15.3 : refuser la suppression ne modifie ni le serveur ni le catalogue',()=>{
 const f=fixture({confirmResult:false});
 const before=JSON.stringify(f.state);
 assert.equal(f.api.deleteCatalogIngredientV41153('ing1'),false);
 assert.equal(JSON.stringify(f.state),before);
 assert.equal(f.saved.length,0);
 assert.ok(!f.events.some(x=>x[0]==='checkpoint'))
});

test('V41.15.3 : référence partagée encore nécessaire à un autre ingrédient = conservée uniquement pour lui',()=>{
 const f=fixture({ingredients:[
  baseIngredient(),{id:'ing2',name:'Beurre pâtisserie',productId:'p1',store:'carrefour'}
 ]});
 assert.equal(f.api.deleteCatalogIngredientV41153('ing1'),true);
 assert.equal(f.state.ingredientCatalog.length,1);
 assert.equal(f.state.ingredientCatalog[0].id,'ing2');
 assert.equal(f.state.products.length,1);
 assert.equal(f.state.products[0].ean,'3451790988813');
 assert.match(f.events.find(x=>x[0]==='confirm')[1],/UNIQUEMENT/);
});

test('V41.15.3 : ingrédient encore dans une recette = suppression refusée sans rien changer',()=>{
 const f=fixture({recipes:[{id:'rec1',ingredients:[{ingredientId:'ing1',name:'Beurre salé',productId:'p1'}]}]});
 const before=JSON.stringify(f.state);
 assert.equal(f.api.deleteCatalogIngredientV41153('ing1'),false);
 assert.equal(JSON.stringify(f.state),before);
 assert.equal(f.saved.length,0)
});

test('V41.15.3 : supprimer directement un produit efface aussi EAN et associations orphelines',()=>{
 const f=fixture({weeks:{w1:{extras:[{id:'e1',productId:'p1',qty:3,unit:'paquet'}],
  meals:[{type:'products',products:[{productId:'p1',qty:1,unit:'paquet'}]}]}},
  stockV41:{items:{'product:p1|paquet':{identity:'product:p1',unit:'paquet',quantity:2}}}
 });
 assert.equal(f.api.deleteCatalogProductV41153('p1'),true);
 assert.equal(f.state.products.length,0);
 assert.equal(f.state.ingredientCatalog[0].productId,null);
 assert.equal(f.state.weeks.w1.extras[0].name,'Beurre salé');
 assert.equal(f.state.weeks.w1.extras[0].productId,null);
 assert.equal(f.state.weeks.w1.meals[0],null);
 assert.equal(f.state.stockV41.items['product:p1|paquet'],undefined);
 assert.equal(f.saved.length,1);
 assert.equal(f.saved[0].products.length,0)
});

test('V41.15.3 : ancienne référence non liée supprimée sur confirmation, formulaire nouveau préservé',()=>{
 const f=fixture({ingredients:[]});
 assert.equal(f.api.removeOrphanCarrefourReferenceOnImportV41153('p1'),true);
 assert.equal(f.state.products.length,0);
 assert.equal(f.fields['#catalogueName'].value,'Beurre demi-sel');
 assert.equal(f.fields['#catalogueUrl'].value,baseProduct().url);
 assert.equal(f.fields['#catalogueEan'].value,baseProduct().ean);
 assert.equal(f.saved.length,1);
 assert.equal(f.saved[0].products.length,0);
 assert.ok(!f.events.some(x=>x[0]==='close'));
 assert.match(f.fields['#v413ReferenceStatus'].textContent,/Ancienne fiche retirée/)
});

test('V41.15.3 : ancienne référence partagée ou permission refusée = aucune suppression',()=>{
 const shared=fixture();
 assert.equal(shared.api.removeOrphanCarrefourReferenceOnImportV41153('p1'),false);
 assert.equal(shared.state.products.length,1);
 assert.equal(shared.saved.length,0);
 const refused=fixture({ingredients:[],confirmResult:false});
 assert.equal(refused.api.removeOrphanCarrefourReferenceOnImportV41153('p1'),false);
 assert.equal(refused.state.products.length,1);
 assert.equal(refused.saved.length,0)
});

test('V41.15.3 : suppression serveur utilise la fonction de persistance cloud existante, sans migration cachée',()=>{
 assert.match(source,/function persist\(\)/);
 assert.match(source,/v34CloudRuntime\.commitLocalModification\(snapshot\)/);
 assert.match(source,/deleteCarrefourProductFromStateV41153\(pid\)/);
 assert.match(source,/function deleteCatalogProductV41153\(id\)/);
 assert.match(source,/else if\(mode==='delete-catalog-ingredient'\)deleteCatalogIngredientV41153\(id\)/);
 assert.match(source,/else if\(mode==='delete-product'\)deleteCatalogProductV41153\(id\)/);
});
