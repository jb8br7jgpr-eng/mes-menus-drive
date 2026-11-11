import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('app.js'),script=read('scripts/carrefour-diagnostic.user.js');
const index=read('index.html'),sw=read('sw.js'),styles=read('styles.css');
const original='MD-CARREFOUR-V1:';
const sample={v:1,name:'Moutarde',url:'https://www.carrefour.fr/p/moutarde-3270190010000',ean:'3270190010000',brand:'Marque',packaging:'250 g'};
const sampleText=original+JSON.stringify(sample);
const take=(start,end)=>{
 const i=app.indexOf(start),j=app.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i, 'marqueurs '+start+' / '+end);
 return app.slice(i,j)
};

function fixture(options={}){
 const toastMessages=[],imported=[],references=[],data={
  '#carrefourPasteStatus':{textContent:'',dataset:{}},
  '#carrefourPaste':{value:''},
  '#v413ReferenceStatus':{textContent:'',dataset:{}},
  '#v413ReferencePastePanel':{hidden:true},
  '#v413ReferencePaste':{value:'mon texte et mon produit ne sont pas effacés'}
 };
 const fullButton={disabled:false,isConnected:true};
 const refButton={disabled:false,isConnected:true};
 const buttons={
  '[data-action="read-carrefour-clipboard"]':fullButton,
  '[data-action="v41151-read-daily-carrefour"]':refButton
 };
 const context={
  CARREFOUR_CLIP_PREFIX:original,
  $:key=>data[key]||null,
  toast:x=>toastMessages.push(x),
  openImportedCarrefourProduct:d=>{
   if(options.importError)throw Error(options.importError);
   imported.push(d)
  },
  applyCarrefourToOpenProductV413:t=>{
   if(options.referenceError)throw Error(options.referenceError);
   references.push(t)
  },
  navigator:{clipboard:options.clipboard===null?null:{
   readText:options.readText|| (async()=>sampleText)
  }},
  modalRoot:{querySelector:key=>buttons[key]||null}
 };
 const code=take('function parseCarrefourClipboardV41152(raw,allowDirectUrl=false){','function openImportedCarrefourProduct(data){')+
  take('function carrefourPasteFeedbackV41151(target,message,isError=false){','function ingredientRowsCatalogue(){');
 const api=runInNewContext(code+';({importCopiedCarrefourProduct,readCarrefourClipboard,importCarrefourIntoOpenProductV413,readCarrefourReferenceClipboardV41151})',context);
 return {api,data,toastMessages,imported,references,buttons}
}

test('V41.15.2 : le texte de la capture en variante iPhone encodée est reconnu',()=>{
 const f=fixture();
 const product={v:1,name:'Beurre   tendre demi-sel ELLE & VIRE',brand:'ELLE & VIRE',
  packaging:'',ean:'3451790988813',
  url:'https://www.carrefour.fr/p/beurre-tendre-demi-sel-elle-vire-3451790988813'};
 const json=JSON.stringify(product);
 // Variante URL/clipboard iOS : %7B et %22, mais virgules, deux-points et & bruts.
 const encoded='md-carrefour-v1:'+encodeURIComponent(json)
  .replaceAll('%3A',':').replaceAll('%2C',',').replaceAll('%26','&');
 assert.equal(f.api.importCopiedCarrefourProduct(encoded),true);
 assert.equal(f.imported.length,1);
 assert.equal(f.imported[0].ean,product.ean);
 assert.equal(f.imported[0].name,product.name);
 assert.equal(f.imported[0].url,product.url);
});

test('V41.15.2 : les copies originales Userscripts continuent de fonctionner',()=>{
 const f=fixture();
 assert.equal(f.api.importCopiedCarrefourProduct(sampleText),true);
 assert.equal(f.imported[0].ean,sample.ean);
});

test('V41.15.2 : copie encodée tronquée ou pourcentage final inachevé refusé clairement',()=>{
 const f=fixture();
 for(const incomplete of ['md-carrefour-v1:%7B%22v%22:1%','md-carrefour-v1:%7B%22v%22:1']){
  assert.equal(f.api.importCopiedCarrefourProduct(incomplete),false);
  assert.equal(f.imported.length,0);
  assert.match(f.data['#carrefourPasteStatus'].textContent,/incomplet|tronqué/i);
 }
});

test('V41.15.2 : les URLs non Carrefour restent strictement rejetées dans les fiches',()=>{
 const f=fixture();
 const parser=runInNewContext(
  take('function parseCarrefourClipboardV41152(raw,allowDirectUrl=false){','function openImportedCarrefourProduct(data){')+
  ';parseCarrefourClipboardV41152',{});
 assert.equal(parser('https://www.carrefour.fr/p/beurre-3451790988813',true).v,1);
 assert.throws(()=>parser('https://example.com/p/3451790988813'),/Copie le produit/);
 // Une URL externe est acceptée uniquement comme texte brut en amont de validCarrefourLink.
 assert.equal(parser('https://example.com/p/3451790988813',true).url,'https://example.com/p/3451790988813');
 assert.equal(f.api.importCopiedCarrefourProduct('md-carrefour-v1:%7B%22v%22:1'),false);
});

test('V41.15.1 : importer le texte Userscripts par collage natif prépare la fiche sans nouvelle permission',()=>{
 const f=fixture({readText:async()=>{throw Error('Accès impossible')}});
 assert.equal(f.api.importCopiedCarrefourProduct(sampleText),true);
 assert.equal(f.imported.length,1);
 assert.equal(f.imported[0].url,sample.url);
 assert.match(f.toastMessages.at(-1),/Produit Carrefour récupéré/);
});

test('V41.15.1 : texte vide, lien seul et JSON incomplet donnent une explication persistante',()=>{
 const f=fixture();
 for(const value of ['', 'https://www.carrefour.fr/p/moutarde-3270190010000',original+'{'])assert.equal(f.api.importCopiedCarrefourProduct(value),false);
 assert.equal(f.imported.length,0);
 assert.equal(f.data['#carrefourPasteStatus'].dataset.state,'error');
 assert.match(f.data['#carrefourPasteStatus'].textContent,/incomplet/);
});

test('V41.15.1 : échec métier ne crée pas de fiche et montre le détail sans perdre la copie',()=>{
 const f=fixture({importError:'Cette référence existe déjà'});
 assert.equal(f.api.importCopiedCarrefourProduct(sampleText),false);
 assert.equal(f.imported.length,0);
 assert.match(f.data['#carrefourPasteStatus'].textContent,/existe déjà/);
});

test('V41.15.1 : autorisation de collage refusée, bouton réactivé et secours manuel disponible',async()=>{
 const f=fixture({readText:async()=>{const err=Error('refusé');err.name='NotAllowedError';throw err}});
 assert.equal(await f.api.readCarrefourClipboard(),false);
 assert.equal(f.buttons['[data-action="read-carrefour-clipboard"]'].disabled,false);
 assert.match(f.data['#carrefourPasteStatus'].textContent,/Colle le texte manuellement/);
 assert.equal(f.imported.length,0)
});

test('V41.15.1 : collage automatique reste possible lorsque Safari donne accès',async()=>{
 const f=fixture();
 assert.equal(await f.api.readCarrefourClipboard(),true);
 assert.equal(f.imported.length,1);
 assert.equal(f.buttons['[data-action="read-carrefour-clipboard"]'].disabled,false);
});

test('V41.15.1 : ouvrir les zones de collage ne déclenche pas de demande iOS',async()=>{
 let calls=0;
 const f=fixture({readText:async()=>{calls++;return sampleText}});
 f.data['#v413ReferencePaste'].value='';
 await f.api.importCarrefourIntoOpenProductV413();
 assert.equal(calls,0);
 assert.equal(f.data['#v413ReferencePastePanel'].hidden,false);
 assert.match(f.data['#v413ReferenceStatus'].textContent,/Appuie longtemps/);
});

test('V41.15.1 : collage automatique de la référence ne remplace pas les champs en cas d’erreur',async()=>{
 const f=fixture({referenceError:'Référence déjà associée à un autre produit'});
 const before=f.data['#v413ReferencePaste'].value;
 assert.equal(await f.api.readCarrefourReferenceClipboardV41151(),false);
 assert.equal(f.data['#v413ReferencePaste'].value,before);
 assert.equal(f.references.length,0);
 assert.match(f.data['#v413ReferenceStatus'].textContent,/déjà associée/);
 assert.equal(f.buttons['[data-action="v41151-read-daily-carrefour"]'].disabled,false)
});

test('V41.15.1 : collage automatique de la référence charge seulement les champs nécessaires',async()=>{
 const f=fixture();
 assert.equal(await f.api.readCarrefourReferenceClipboardV41151(),true);
 assert.equal(f.references.length,1);
 assert.equal(f.references[0],sampleText);
 assert.match(f.toastMessages.at(-1),/Nom conservé/)
});

test('V41.15.1 : une permission iOS tardive ne remplace pas un collage manuel',async()=>{
 let done;const pending=new Promise(resolve=>{done=resolve});
 const f=fixture({readText:()=>pending});
 const running=f.api.readCarrefourClipboard();
 f.data['#carrefourPaste'].value=sampleText;
 done(sampleText);
 assert.equal(await running,false);
 assert.equal(f.imported.length,0);
 assert.match(f.data['#carrefourPasteStatus'].textContent,/Texte collé manuellement/);
});

test('V41.15.1 : une réponse iOS tardive n’ouvre pas une fiche après fermeture',async()=>{
 let done;const pending=new Promise(resolve=>{done=resolve});
 const f=fixture({readText:()=>pending});
 const running=f.api.readCarrefourClipboard();
 f.buttons['[data-action="read-carrefour-clipboard"]'].isConnected=false;
 done(sampleText);
 assert.equal(await running,false);
 assert.equal(f.imported.length,0)
});

test('V41.15.1 : la réponse automatique n’écrase jamais la saisie manuelle en édition',async()=>{
 let done;const pending=new Promise(resolve=>{done=resolve});
 const f=fixture({readText:()=>pending});
 const running=f.api.readCarrefourReferenceClipboardV41151();
 f.data['#v413ReferencePaste'].value='https://www.carrefour.fr/p/autre-3270190010000';
 done(sampleText);
 assert.equal(await running,false);
 assert.equal(f.references.length,0);
 assert.match(f.data['#v413ReferenceStatus'].textContent,/Texte collé manuellement/)
});

test('V41.15.1 : une fiche refermée ignore les anciennes autorisations iOS',async()=>{
 let done;const pending=new Promise(resolve=>{done=resolve});
 const f=fixture({readText:()=>pending});
 const running=f.api.readCarrefourReferenceClipboardV41151();
 f.buttons['[data-action="v41151-read-daily-carrefour"]'].isConnected=false;
 done(sampleText);
 assert.equal(await running,false);
 assert.equal(f.references.length,0)
});

test('V41.15.1 : l’import complet présente le champ natif avant le bouton automatique',()=>{
 let html='',reads=0;
 const context={
  pendingIngredientLinkId:null,pendingCarrefourDailyIdV413:null,
  ingredientById:()=>null,productById:()=>null,
  showCatalogueModalV413:(title,body)=>{html=body},
  navigator:{clipboard:{readText:()=>{reads++;return sampleText}}}
 };
 const fn=runInNewContext(take('function carrefourClipboardModal(ingredientId=null,dailyId=null){','// V41.15.1 : les échecs du presse-papiers restent visibles')+';carrefourClipboardModal',context);
 fn();
 assert.equal(reads,0);
 assert.ok(html.includes('id="carrefourPaste"'));
 assert.ok(html.indexOf('data-action="import-pasted-carrefour"')<html.indexOf('data-action="read-carrefour-clipboard"'));
 assert.match(html,/id="carrefourPasteStatus" role="status" aria-live="polite"/);
 assert.match(html,/Copier pour mon appli/)
});

test('V41.15.1 : la fiche Produit conserve son nom et montre la saisie manuelle',()=>{
 assert.match(app,/data-action="v41151-read-daily-carrefour"/);
 assert.match(app,/else if\(mode==='v41151-read-daily-carrefour'\)void readCarrefourReferenceClipboardV41151\(\)/);
 assert.match(app,/id="v413ReferencePaste"/);
 assert.match(app,/data-action="v413-use-pasted-reference"/);
 assert.match(app,/function applyCarrefourToOpenProductV413\(raw\)/);
 assert.match(app,/Le nom du produit est inchangé/);
 assert.match(app,/carrefourPasteFeedbackV41151\('#v413ReferenceStatus','⚠️ '/)
});

test('V41.15.1 : iPhone, cache, Userscript et Firebase restent séparés',()=>{
 assert.match(index,/styles\.css\?v=20261111-41-17-1-choice/);
 assert.match(index,/app\.js\?v=20261111-41-17-2-label/);
 assert.match(sw,/CACHE='menus-drive-v41-17-2-label-20261111'/);
 assert.match(sw,/styles\.css\?v=20261111-41-17-1-choice/);
 assert.match(sw,/app\.js\?v=20261111-41-17-2-label/);
 assert.match(index,/firebase\/v34-ui\.js\?v=20261104-41-12-2-release/);
 assert.match(styles,/#carrefourPaste,#v413ReferencePaste\{font-size:16px/);
 assert.match(script,/@version\s+0\.10\.0/);
 assert.match(script,/@updateURL\s+https:\/\/raw\.githubusercontent\.com\/jb8br7jgpr-eng\/mes-menus-drive\/developpement-v1\/scripts\/carrefour-diagnostic\.user\.js/);
 assert.match(app,/v34CloudRuntime\.commitLocalModification\(snapshot\)/)
});
