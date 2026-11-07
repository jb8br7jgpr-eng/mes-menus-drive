import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
function take(start,end){
 const i=src.indexOf('function '+start+'('),j=src.indexOf('function '+end+'(',i);
 assert.ok(i>=0&&j>i,start+' / '+end+' absents');
 return src.slice(i,j)
}
const makeNode=(tag='div')=>({
 tag,type:'',className:'',textContent:'',hidden:false,dataset:{},
 children:[],replaceChildren(...nodes){this.children=nodes},append(node){this.children.push(node)},
 insertAdjacentElement(pos,node){this.inserted={pos,node}}
});
function fixture({accepted=true,missing=false}={}){
 const product={id:'p1',name:'Beurre salé',url:'https://www.carrefour.fr/p/beurre-tendre-3451790988813',
  ean:'3451790988813',brand:'ELLE & VIRE',packaging:'250 g'};
 const state={products:missing?[]:[product],ingredientCatalog:[],weeks:{},recipes:[],storePreferences:{}};
 let editorId='',writes=0,confirmText='',persistCalls=0;
 const box=makeNode(),panel={hidden:true};
 const input=(value)=>({value});
 let nodes={
  '#v41153ReferenceConflict':box,
  '#v413ReferencePastePanel':panel,
  '#catalogueEditorForm':{dataset:{kind:'daily',id:''}},
  '#catalogueName':input('Beurre demi-sel'),
  '#catalogueBrand':input('ELLE & VIRE'),
  '#cataloguePackaging':input(''),
  '#cataloguePackAmount':input('250'),
  '#cataloguePackUnit':input('g'),
 };
 const toasts=[];
 const ctx={
  state,$:k=>nodes[k]||null,document:{createElement:makeNode},
  productById:id=>state.products.find(p=>p.id===id),
  confirm:message=>{confirmText=message;return accepted},
  toast:x=>toasts.push(x),
  productEditor:id=>{
   editorId=id;
   nodes={
    ...nodes,
    '#catalogueEditorForm':{dataset:{kind:'daily',id},insertAdjacentElement(pos,node){this.inserted={pos,node}}},
    '#catalogueName':input(product.name),
    '#catalogueBrand':input(product.brand),
    '#cataloguePackaging':input(product.packaging),
    '#cataloguePackAmount':input(''),
    '#cataloguePackUnit':input('pièce')
   }
  },
  persist:()=>{persistCalls++;writes++}
 };
 const api=runInNewContext(
  take('showCarrefourExistingReferenceV41153','applyCarrefourToOpenProductV413')+
  ';({showCarrefourExistingReferenceV41153,continueCarrefourExistingReferenceV41153})',ctx);
 return {state,product,box,panel,toasts,api,getNodes:()=>nodes,get editorId(){return editorId},
  get confirmText(){return confirmText},get persistCalls(){return persistCalls}}
}

test('V41.15.3 : une référence conservée après suppression de l’ingrédient est retrouvée',()=>{
 const f=fixture();
 assert.equal(f.api.showCarrefourExistingReferenceV41153(f.product),true);
 assert.equal(f.box.hidden,false);
 assert.equal(f.panel.hidden,false);
 assert.match(f.box.children[0].textContent,/Beurre salé/);
 const button=f.box.children[1];
 assert.equal(button.dataset.action,'v41153-reuse-carrefour');
 assert.equal(button.dataset.id,'p1');
 assert.match(button.textContent,/Réutiliser/);
 assert.equal(f.persistCalls,0);
});

test('V41.15.3 : réutiliser l’ID existant reprend le nom et le conditionnement sans enregistrer',()=>{
 const f=fixture();
 assert.equal(f.api.continueCarrefourExistingReferenceV41153('p1'),true);
 assert.equal(f.editorId,'p1');
 assert.equal(f.getNodes()['#catalogueName'].value,'Beurre demi-sel');
 assert.equal(f.getNodes()['#catalogueBrand'].value,'ELLE & VIRE');
 assert.equal(f.getNodes()['#cataloguePackAmount'].value,'250');
 assert.equal(f.getNodes()['#cataloguePackUnit'].value,'g');
 assert.match(f.getNodes()['#catalogueEditorForm'].inserted.node.textContent,/l’EAN sont conservés/);
 assert.equal(f.state.products.length,1);
 assert.equal(f.state.products[0].name,'Beurre salé','l’ancien nom enregistré n’est pas modifié avant validation');
 assert.equal(f.persistCalls,0);
});

test('V41.15.3 : refuser la confirmation conserve le formulaire et la fiche',()=>{
 const f=fixture({accepted:false});
 assert.equal(f.api.continueCarrefourExistingReferenceV41153('p1'),false);
 assert.equal(f.editorId,'');
 assert.equal(f.getNodes()['#catalogueName'].value,'Beurre demi-sel');
 assert.equal(f.state.products[0].name,'Beurre salé');
 assert.equal(f.persistCalls,0);
});

test('V41.15.3 : ancienne référence disparue entre-temps ne crée aucun doublon',()=>{
 const f=fixture({missing:true});
 assert.equal(f.api.continueCarrefourExistingReferenceV41153('p1'),false);
 assert.equal(f.editorId,'');
 assert.equal(f.state.products.length,0);
 assert.match(f.toasts[0],/plus disponible/);
});

test('V41.15.3 : champ EAN et lien ne sont jamais écrasés par une réutilisation pré-confirmation',()=>{
 const f=fixture();
 f.api.continueCarrefourExistingReferenceV41153('p1');
 assert.equal(f.state.products[0].ean,'3451790988813');
 assert.equal(f.state.products[0].url,'https://www.carrefour.fr/p/beurre-tendre-3451790988813');
 assert.equal(f.state.products.length,1);
});

test('V41.15.3 : le blocage affiche l’action depuis une fiche nouvelle ou déjà existante',()=>{
 assert.match(src,/function showCarrefourExistingReferenceV41153\(duplicate\)/);
 assert.match(src,/showCarrefourExistingReferenceV41153\(duplicate\)/);
 assert.match(src,/data-action='v41153-reuse-carrefour'|button\.dataset\.action='v41153-reuse-carrefour'/);
 assert.match(src,/else if\(mode==='v41153-reuse-carrefour'\)continueCarrefourExistingReferenceV41153\(id\)/);
 assert.match(src,/id="v41153ReferenceConflict"/);
 assert.match(src,/function continueCarrefourExistingReferenceV41153\(id\)/);
 assert.match(css,/\.v41153-conflict\[hidden\]\{display:none!important\}/);
});

test('V41.15.3 : supprimer une fiche supprime aussi sa référence non partagée',()=>{
 assert.match(src,/Sa référence Carrefour/);
 assert.match(src,/son lien et son EAN seront aussi supprimés/);
 assert.match(src,/function deleteCatalogIngredientV41153\(id\)/);
 assert.match(src,/deleteCarrefourProductFromStateV41153\(pid\)/);
 assert.match(src,/function removeOrphanCarrefourReferenceV4133/);
});

test('V41.15.3 : la protection contre les doublons et les liens externes ne disparaît pas',()=>{
 assert.match(src,/function validCarrefourLink\(raw\)/);
 assert.match(src,/u\.protocol!=='https:'/);
 assert.match(src,/function parseCarrefourClipboardV41152\(raw,allowDirectUrl=false\)/);
 assert.match(src,/if\(duplicate\)\{\s*showCarrefourExistingReferenceV41153\(duplicate\)/);
 assert.match(src,/if\(duplicate\)\{\s*if\(\(ean&&duplicate\.ean===ean\)/);
});
