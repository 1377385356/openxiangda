import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {canonicalJson,sha256Digest} from '../src/canonical.js';
import * as esm from '../dist/native-compiler/index.js';
const cjs=createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;
const corpus=JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json',import.meta.url),'utf8'));
test('event task capability is negotiated only for explicit task subscriptions in both compiler formats',()=>{for(const impl of[esm,cjs]){const config=JSON.parse(corpus.configuration.canonical);assert(!impl.compileRequiredPlatformCapabilitiesV3(config).some(x=>x.code==='notification-hub-v2.event-tasks'));config.events.subscriptions.push({code:'pending-tasks',eventTypes:['test.task.v1'],platformAccess:{notification:{mode:'business-task',taskCodes:['machine-approval']}}});assert.equal(impl.compileRequiredPlatformCapabilitiesV3(config).find(x=>x.code==='notification-hub-v2.event-tasks')?.contractVersion,'1.0.0');}});

test('sealed configuration rejects missing, duplicate and malformed task allowlists in ESM/CJS',()=>{
 for(const impl of[esm,cjs]) for(const taskCodes of[undefined,[],['same','same'],['illegal task'],['not_allowed'],Array.from({length:17},(_,i)=>`task-${i}`)]){
  const config=JSON.parse(corpus.configuration.canonical);
  config.events.subscriptions[0]={...(config.events.subscriptions[0]||{code:'task-events',eventTypes:['test.task.v1'],endpointPath:'/events'}),platformAccess:{notification:{mode:'business-task',...(taskCodes?{taskCodes}:{})}}};
  assert.throws(()=>impl.compileNativeApplicationConfiguration({appCode:corpus.appCode,configBytes:canonicalJson(config),contractBytes:corpus.contract.canonical,expectedConfigDigest:sha256Digest(config),expectedContractDigest:corpus.contract.digest}),/NATIVE_|CONFIGURATION_SCHEMA_INVALID/);
 }
});
