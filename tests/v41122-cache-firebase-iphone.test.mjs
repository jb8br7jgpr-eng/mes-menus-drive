import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.js'),ui=read('firebase/v34-ui.js'),
 runtime=read('firebase/v34-cloud-runtime.js'),recovery=read('firebase/v34-cloud-recovery-store.js'),
 index=read('index.html'),sw=read('sw.js');
const v='20261104-41-12-2';
test('V41.12.2 : l’app et le panneau chargent une unique instance du runtime Firebase',()=>{
 const appImport=app.match(/import\(['"]\.\/firebase\/v34-cloud-runtime\.js\?v=([^'"]+)['"]\)/);
 const uiImport=ui.match(/from ["']\.\/v34-cloud-runtime\.js\?v=([^'"]+)["']/);
 assert.ok(appImport,'l’application doit forcer la nouvelle version Firebase');
 assert.ok(uiImport,'le panneau doit forcer la même version Firebase');
 assert.equal(appImport[1],v);
 assert.equal(uiImport[1],appImport[1],'ne jamais créer deux sessions Firebase différentes');
 assert.equal((app.match(/v34-cloud-runtime\.js\?v=/g)||[]).length,1);
 assert.equal((ui.match(/v34-cloud-runtime\.js\?v=/g)||[]).length,1);
});
test('V41.12.2 : le stockage local des brouillons charge lui aussi sa nouvelle version',()=>{
 assert.match(runtime,/from ["']\.\/v34-cloud-recovery-store\.js\?v=20261104-41-12-2["']/);
 assert.match(runtime,/export async function readSavedRecoveryArchivesV4121\(/);
 assert.match(recovery,/async saveRecoveryArchive\(uid,draft\)/);
 assert.match(recovery,/readRecoveryArchives\(uid\)/);
});
test('V41.12.2 : le bouton Compte et sauvegardes garde un gestionnaire quand le module charge',()=>{
 assert.match(ui,/if\(e\.target\.closest\("\[data-v34-open\]"\)\)openPanel\(\)/);
 assert.match(ui,/const root = document\.getElementById\("v34SyncRoot"\)/);
 assert.match(ui,/Récupérer la version du serveur sur cet iPhone/);
 assert.match(ui,/loadServerDiscardingLocalDraft\("ABANDONNER_LE_BROUILLON"\)/);
});
test('V41.15.4 : ressources préparées et même session Firebase',()=>{
 assert.match(index,/styles\.css\?v=20261111-41-22-four-sources/);
 assert.match(index,/app\.js\?v=20261111-41-22-four-sources/);
 assert.match(index,/firebase\/v34-ui\.js\?v=20261104-41-12-2-release/);
 assert.match(sw,/CACHE='menus-drive-v41-22-four-sources-20261111'/);
 assert.match(sw,/styles\.css\?v=20261111-41-22-four-sources/);
 assert.match(sw,/app\.js\?v=20261111-41-22-four-sources/);
 assert.match(index,/rayon-filters-v4114\.js\?v=20261106-41-14-1-stage/);
 assert.match(index,/ux-v4115\.js\?v=20261106-41-15-ux-stage/);
 assert.match(sw,/ux-v4115\.js\?v=20261106-41-15-ux-stage/);
 assert.match(sw,/rayon-filters-v4114\.js\?v=20261106-41-14-1-stage/);
 assert.doesNotMatch(index,/app\.js\?v=20261105-41-13-2-release/);
 assert.doesNotMatch(index,/v34-ui\.js\?v=20261104-41-12-1-release/);
});
test('V41.12.2 : le compte Firebase et les catalogues ne sont pas modifiés par le correctif',()=>{
 assert.match(app,/readLocalState:\(\)=>JSON\.parse\(JSON\.stringify\(state\)\)/);
 assert.match(read('firebase/v4121-recovery-guard.js'),/await storage\.saveRecoveryArchive\(userId,draft\)/);
 assert.match(recovery,/reason:"Avant récupération explicite de la dernière version Firebase"/);
});
