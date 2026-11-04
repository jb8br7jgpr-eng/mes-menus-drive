import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createCloudSession} from "../firebase/v34-session-core.js";
import {restoreLatestServerSafely} from "../firebase/v4121-recovery-guard.js";

function fixture({failArchive=false,remoteRevision=2}={}){
 const localDraft={state:{recipes:[{id:"anc",name:"Ancienne recette"}],products:[]},expectedRevision:1,createdAt:1};
 const remoteState={recipes:[{id:"new",name:"Nouvelle recette du premier iPhone"}],products:[{id:"p1"}]};
 const archived=[],events=[],uploads=[];
 let draft=structuredClone(localDraft),confirmed=null,installed=null;
 const storage={
  async readDraft(){return draft?structuredClone(draft):null;},
  async saveDraft(uid,value){draft=structuredClone(value);},
  async clearDraft(){draft=null;},
  async saveConfirmed(uid,value,revision){confirmed={state:structuredClone(value),revision};},
  async saveRecoveryArchive(uid,value){
   if(failArchive)throw Error("Quota IndexedDB insuffisant");
   archived.push(structuredClone(value));
  }
 };
 const cloud={
  async loadAuthoritativeState(){return {status:"ready",state:structuredClone(remoteState),revision:remoteRevision};},
  async saveAuthoritativeState(state){uploads.push(state);throw Error("Aucune sauvegarde serveur autorisée durant le test");}
 };
 const session=createCloudSession({cloud,storage,applyServerState:async state=>{installed=state;},onStatus:status=>events.push(status)});
 return {storage,cloud,session,archived,events,uploads,localDraft,remoteState,get draft(){return draft;},get installed(){return installed;},get confirmed(){return confirmed;}};
}

test("V41.12.1 : une version plus récente du serveur conserve le brouillon et bloque la tentative de sauvegarde",async()=>{
 const f=fixture();
 await f.session.open("family");
 assert.equal(f.session.status().phase,"recovery");
 const result=await f.session.retryDraft();
 assert.equal(result.stale,true);
 assert.equal(f.session.status().phase,"recovery");
 assert.deepEqual(f.draft.state,f.localDraft.state);
 assert.equal(f.uploads.length,0);
});

test("V41.12.1 : l'utilisateur récupère explicitement la dernière version, et le brouillon reste archivé",async()=>{
 const f=fixture();
 await f.session.open("family");
 await f.session.retryDraft();
 const result=await restoreLatestServerSafely({
  storage:f.storage,session:f.session,userId:"family",confirmation:"ABANDONNER_LE_BROUILLON"
 });
 assert.equal(result.phase,"ready");
 assert.deepEqual(f.installed,f.remoteState);
 assert.deepEqual(f.confirmed.state,f.remoteState);
 assert.equal(f.draft,null);
 assert.equal(f.archived.length,1);
 assert.deepEqual(f.archived[0].state,f.localDraft.state);
 assert.equal(f.uploads.length,0,"La récupération du serveur ne doit jamais écrire dans Firebase");
});

test("V41.12.1 : aucune récupération automatique sans confirmation explicite",async()=>{
 const f=fixture();await f.session.open("family");
 await assert.rejects(restoreLatestServerSafely({storage:f.storage,session:f.session,userId:"family",confirmation:"oui"}),/Confirmation/);
 assert.equal(f.session.status().phase,"recovery");
 assert.deepEqual(f.draft.state,f.localDraft.state);
 assert.equal(f.archived.length,0);
});

test("V41.12.1 : impossible de remplacer le brouillon si son archivage échoue",async()=>{
 const f=fixture({failArchive:true});await f.session.open("family");
 await assert.rejects(restoreLatestServerSafely({
  storage:f.storage,session:f.session,userId:"family",confirmation:"ABANDONNER_LE_BROUILLON"
 }),/Quota/);
 assert.equal(f.session.status().phase,"recovery");
 assert.deepEqual(f.draft.state,f.localDraft.state);
 assert.equal(f.installed,null);
 assert.equal(f.uploads.length,0);
});

test("V41.12.1 : restauration refusée s'il n'y a pas de brouillon à préserver",async()=>{
 const f=fixture();await f.session.open("family");await f.storage.clearDraft("family");
 await assert.rejects(restoreLatestServerSafely({
  storage:f.storage,session:f.session,userId:"family",confirmation:"ABANDONNER_LE_BROUILLON"
 }),/Brouillon local introuvable/);
 assert.equal(f.installed,null);
});

test("V41.12.1 : la récupération est accessible et n'est jamais déclenchée sans confirmation",()=>{
 const ui=readFileSync(new URL("../firebase/v34-ui.js",import.meta.url),"utf8");
 const runtime=readFileSync(new URL("../firebase/v34-cloud-runtime.js",import.meta.url),"utf8");
 const recovery=readFileSync(new URL("../firebase/v34-cloud-recovery-store.js",import.meta.url),"utf8");
 assert.match(ui,/Récupérer la version du serveur sur cet iPhone/);
 assert.match(ui,/action==="restore-server"/);
 assert.match(ui,/if \(!confirm\(/);
 assert.match(ui,/loadServerDiscardingLocalDraft\("ABANDONNER_LE_BROUILLON"\)/);
 assert.match(runtime,/restoreLatestServerSafely/);
 assert.match(recovery,/recovery-archives/);
 assert.match(ui,/export-recovery-archive/);
});
