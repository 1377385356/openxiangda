import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson,sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import {compileApplicationSources,defineOpenXiangdaApp} from '../src/index.js';
const source=():any=>({app:{code:'task-app',name:'Business tasks'},frontend:{root:'apps/web'},
 data:{resources:[{code:'orders',name:'Orders',fields:[{code:'title',type:'text.short',label:'Title'}]}]},
 backend:{enabled:true,root:'apps/server',operations:[]},authz:{capabilities:[],roles:[]},
 events:{schemas:[{eventType:'task-app.pending.v1',dataSchemaVersion:'1.0.0',jsonSchema:{type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false}}],
 subscriptions:[{code:'task-pending',name:'Pending task',eventTypes:['task-app.pending.v1'],platformAccess:{notification:{mode:'business-task',taskCodes:['sample-review','machine-review']}}}]}});
function compileTarget(config:any,contracts:any) {return compileNativeApplicationConfiguration({appCode:'task-app',configBytes:canonicalJson(config),expectedConfigDigest:sha256Digest(config),contractBytes:canonicalJson({...contracts,configDigest:sha256Digest(config)}),expectedContractDigest:sha256Digest({...contracts,configDigest:sha256Digest(config)})});}
test('bundle seals the complete sorted task allowlist and the platform accepts that exact declaration',()=>{
 const built=compileApplicationSources(defineOpenXiangdaApp(source()));
 assert.deepEqual(built.contracts.value.eventConsumers[0]!.platformAccess!.notification,{mode:'business-task',taskCodes:['machine-review','sample-review']});
 const target=compileTarget(built.config.value,built.contracts.value);
 assert(target.requiredPlatformCapabilities.some(c=>c.code==='notification-hub-v2.event-tasks'));
});
test('missing and malformed task codes are rejected by the source before contract generation',()=>{
 for(const codes of[undefined,[],['same','same'],['illegal task'],['not_allowed']]){const decl=source();decl.events.subscriptions[0].platformAccess.notification.taskCodes=codes;assert.throws(()=>defineOpenXiangdaApp(decl));}
});
