import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudSession} from '../firebase/v34-session-core.js';
import {emptyStockV41,applyStockTransactionV41,availableStockV41} from '../stock-engine-v41.mjs';
import {planFrozenMealV41,freezerReservationsV41} from '../stock-week-v41.mjs';

const clone=x=>JSON.parse(JSON.stringify(x));
const weekId='2026-10-26';
const initial=()=>{
 const frozen=applyStockTransactionV41(emptyStockV41(),{id:'starter',movements:[
  {type:'freezer',direction:'add',lotId:'chili-1',recipeId:'chili',portions:4,name:'Chili'}
 ]}).stock;
 return {schema:1,recipes:[{id:'chili',name:'Chili',ingredients:[]}],products:[],ingredientCatalog:[],
  weeks:{[weekId]:{meals:Array(14).fill(null),extras:[],checked:[],excluded:[]}},
  stockV41:frozen,staples:[],settings:{people:2}};
};
function mockServer(seed){
 let state=clone(seed),revision=5;
 return {
  async loadAuthoritativeState(){return {status:'ready',state:clone(state),revision}},
  async saveAuthoritativeState(next,expected){
   if(expected!==revision){
    const error=new Error('État serveur plus récent');
    error.name='CloudStaleVersion';throw error;
   }
   state=clone(next);revision++;return {status:'saved',revision}
  },
  read(){return {state:clone(state),revision}}
 };
}
function mockStorage(){
 const drafts=new Map(),confirmed=new Map();
 return {
  async readDraft(uid){return clone(drafts.get(uid)||null)},
  async saveDraft(uid,data){drafts.set(uid,clone(data))},
  async clearDraft(uid){drafts.delete(uid)},
  async saveConfirmed(uid,state,revision){confirmed.set(uid,{state:clone(state),revision})},
  getDraft(uid){return drafts.get(uid)||null}
 };
}
function newPhone(cloud){
 let local=null;const storage=mockStorage(),states=[];
 const session=createCloudSession({cloud,storage,
  applyServerState:async state=>{local=clone(state)},
  onStatus:status=>states.push(status)});
 return {session,storage,states,read:()=>clone(local)};
}

test('Deux iPhone successifs : les achats et portions planifiées sont retrouvés à l’identique',async()=>{
 const server=mockServer(initial()),a=newPhone(server),b=newPhone(server);
 await a.session.open('compte-familial');
 let changed=a.read();
 changed.stockV41=applyStockTransactionV41(changed.stockV41,{id:'courses-achetees',movements:[
  {type:'inventory',direction:'add',identity:'ingredient:pasta',amount:500,unit:'g',name:'Pâtes'}
 ]}).stock;
 changed.weeks=planFrozenMealV41(changed.weeks,changed.stockV41,weekId,2,'chili-1',2);
 await a.session.save(changed);
 assert.equal(a.session.status().phase,'ready');
 assert.equal(server.read().revision,6);
 assert.equal(availableStockV41(server.read().state.stockV41,'ingredient:pasta','g'),500);
 await b.session.open('compte-familial');
 assert.equal(b.session.status().phase,'ready');
 assert.deepEqual(b.read(),changed,'le second iPhone télécharge exactement le nouvel état serveur');
 assert.equal(freezerReservationsV41(b.read().weeks)['chili-1'],2);
 assert.equal(b.storage.getDraft('compte-familial'),null);
});

test('Deux iPhone en édition simultanée : la version périmée ne peut pas écraser les stocks',async()=>{
 const server=mockServer(initial()),a=newPhone(server),b=newPhone(server);
 await a.session.open('compte-familial');
 await b.session.open('compte-familial');
 const aData=a.read();
 aData.stockV41=applyStockTransactionV41(aData.stockV41,{id:'phone-a-purchase',movements:[
  {type:'inventory',direction:'add',identity:'product:soap',amount:2,unit:'pièce',name:'Savon'}
 ]}).stock;
 await a.session.save(aData);
 const bData=b.read();
 bData.stockV41=applyStockTransactionV41(bData.stockV41,{id:'phone-b-purchase',movements:[
  {type:'inventory',direction:'add',identity:'product:soap',amount:10,unit:'pièce',name:'Savon'}
 ]}).stock;
 await assert.rejects(()=>b.session.save(bData),/serveur plus récent/);
 assert.equal(b.session.status().phase,'recovery');
 assert.ok(b.storage.getDraft('compte-familial'),'le brouillon non envoyé reste récupérable');
 const retry=await b.session.retryDraft();
 assert.equal(retry.stale,true,'une tentative de reprise ne force jamais la version obsolète');
 assert.equal(availableStockV41(server.read().state.stockV41,'product:soap','pièce'),2);
 assert.equal(b.session.status().phase,'recovery');
 await b.session.resolveWithServer({confirmation:'ABANDONNER_LE_BROUILLON'});
 assert.deepEqual(b.read(),aData,'retour au serveur uniquement après confirmation explicite');
 assert.equal(b.session.status().phase,'ready');
});
