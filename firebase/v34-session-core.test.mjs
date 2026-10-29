import test from "node:test";
import assert from "node:assert/strict";
import { createCloudSession } from "./v34-session-core.js";

function fixture() {
  const db=new Map(), observed=[];
  let installed=null;
  const cloud={
    online:true,
    latest:{status:"empty",revision:0,state:null},
    async loadAuthoritativeState() {
      if(!this.online)throw Error("Connexion indisponible");
      return structuredClone(this.latest);
    },
    async saveAuthoritativeState(state,revision,previous,{allowInitialImport}={}) {
      if(!this.online)throw Error("Connexion indisponible");
      if(revision===0&&!allowInitialImport)throw Error("Import non validé");
      if(this.latest.revision!==revision) {
        const e=Error("Conflit de version");e.name="CloudStaleVersion";throw e;
      }
      this.latest={status:"ready",revision:revision+1,state:structuredClone(state)};
      return {status:"saved",revision:revision+1};
    }
  };
  const storage={
    async readDraft(uid){return db.get(uid+":draft")??null;},
    async saveDraft(uid,data){db.set(uid+":draft",structuredClone(data));},
    async clearDraft(uid){db.delete(uid+":draft");},
    async saveConfirmed(uid,state,revision){db.set(uid+":confirmed",{state:structuredClone(state),revision});}
  };
  const session=createCloudSession({
    cloud,storage,
    applyServerState:async state=>{installed=state;},
    onStatus:status=>observed.push(status)
  });
  const base={schema:1,recipes:[{id:"r1",name:"Soupe"}],products:[],weeks:{}};
  return {session,cloud,storage,db,observed,base,get installed(){return installed}};
}
test("an empty server never silently imports the phone",async()=>{
  const f=fixture();await f.session.open("uid");
  assert.equal(f.session.status().phase,"needs-import");
  assert.equal(f.cloud.latest.status,"empty");
  await assert.rejects(()=>f.session.save(f.base),/lecture seule/);
});
test("initial import requires explicit action and confirms revision",async()=>{
  const f=fixture();await f.session.open("uid");
  await f.session.initialImport(f.base);
  assert.equal(f.cloud.latest.revision,1);
  assert.equal(f.session.status().phase,"ready");
  assert.equal(f.db.has("uid:draft"),false);
});
test("offline error preserves an unsent draft across reopen",async()=>{
  const f=fixture();await f.session.open("uid");
  await f.session.initialImport(f.base);
  f.cloud.online=false;
  const edit={...f.base,recipes:[{id:"r1",name:"Soupe du soir"}]};
  await assert.rejects(()=>f.session.save(edit),/Connexion indisponible/);
  assert.equal(f.session.status().phase,"recovery");
  assert.deepEqual(f.db.get("uid:draft").state,edit);
  f.cloud.online=true;
  await f.session.open("uid");
  assert.equal(f.session.status().phase,"recovery");
  assert.equal(f.cloud.latest.state.recipes[0].name,"Soupe");
  await f.session.retryDraft();
  assert.equal(f.cloud.latest.state.recipes[0].name,"Soupe du soir");
});
test("an older phone can never overwrite a newer confirmed version",async()=>{
  const f=fixture();await f.session.open("uid");await f.session.initialImport(f.base);
  f.cloud.latest={status:"ready",revision:2,state:{...f.base,recipes:[{id:"r1",name:"Autre iPhone"}]}};
  await assert.rejects(()=>f.session.save({
    ...f.base,recipes:[{id:"r1",name:"Ancien iPhone"}]
  }),/Conflit de version/);
  assert.equal(f.session.status().phase,"recovery");
  assert.equal(f.cloud.latest.state.recipes[0].name,"Autre iPhone");
});
test("stale recovery never replays automatically",async()=>{
  const f=fixture();await f.session.open("uid");await f.session.initialImport(f.base);
  f.cloud.online=false;
  await assert.rejects(()=>f.session.save({...f.base,settings:{people:3}}));
  f.cloud.online=true;
  f.cloud.latest={status:"ready",revision:2,state:{...f.base,settings:{people:4}}};
  const result=await f.session.retryDraft();
  assert.equal(result.stale,true);
  assert.equal(f.session.status().phase,"recovery");
  assert.equal(f.cloud.latest.state.settings.people,4);
});
test("discarding local changes requires a deliberate confirmation",async()=>{
  const f=fixture();await f.session.open("uid");await f.session.initialImport(f.base);
  f.cloud.online=false;
  await assert.rejects(()=>f.session.save({...f.base,settings:{people:3}}));
  f.cloud.online=true;
  await assert.rejects(()=>f.session.resolveWithServer(),/confirmation/);
  await f.session.resolveWithServer({confirmation:"ABANDONNER_LE_BROUILLON"});
  assert.equal(f.session.status().phase,"ready");
  assert.equal(f.db.has("uid:draft"),false);
});
test("server outage at opening never replaces local state",async()=>{
  const f=fixture();f.cloud.online=false;
  await f.session.open("uid");
  assert.equal(f.session.status().phase,"readonly");
  assert.equal(f.installed,null);
});

test("lost acknowledgement is recovered if server already contains the exact draft",async()=>{
  const f=fixture();
  await f.session.open("uid");
  await f.session.initialImport(f.base);
  f.cloud.online=false;
  const edited={...f.base,settings:{people:3}};
  await assert.rejects(()=>f.session.save(edited),/Connexion indisponible/);
  f.cloud.online=true;
  // Another device view of the completed server commit, though the first
  // device never received the success acknowledgement.
  f.cloud.latest={status:"ready",revision:2,state:structuredClone(edited)};
  const result=await f.session.retryDraft();
  assert.equal(result.recovered,true);
  assert.equal(f.session.status().phase,"ready");
  assert.equal(f.db.has("uid:draft"),false);
});
