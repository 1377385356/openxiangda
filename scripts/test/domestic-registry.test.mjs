import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {migrationPlan,verifyIntegrity} from '../migrate-registry.mjs';
import {resolveReleaseRegistry} from '../lib/release-package-state.mjs';
import {defaultRegistry} from '../../packages/openxiangda/bin/distribution/registry.js';
test('V2 registry is fixed, legacy remains official, ambient npm mirror cannot change publishing',()=>{
 assert.equal(defaultRegistry('stable-v2'),'https://npm.syedu.tech');
 assert.equal(defaultRegistry('1.0.271'),'https://registry.npmjs.org');
 assert.equal(defaultRegistry('legacy-v1'),'https://registry.npmjs.org');
 const before=process.env.npm_config_registry;process.env.npm_config_registry='https://unrelated.example';
 try{if(!process.env.OPENXIANGDA_NPM_REGISTRY)assert.equal(resolveReleaseRegistry('.'),'https://npm.syedu.tech');}finally{if(before===undefined)delete process.env.npm_config_registry;else process.env.npm_config_registry=before;}
 assert.equal(resolveReleaseRegistry('.','http://127.0.0.1:4873/'),'http://127.0.0.1:4873');
 assert.throws(()=>resolveReleaseRegistry('.','https://user:secret@example.com'),/REGISTRY_INVALID/);
});
test('migration selects only latest stable with exact internal closure and leaves history out',()=>{
 const pack=(name,version,dependencies={})=>({name,version,dependencies});
 const meta={a:{'dist-tags':{'stable-v2':'2.0.2'},versions:{'2.0.1':pack('a','2.0.1'),'2.0.2':pack('a','2.0.2',{b:'2.0.1'})}},b:{'dist-tags':{latest:'2.0.2'},versions:{'2.0.1':pack('b','2.0.1'),'2.0.2':pack('b','2.0.2')}}};
 assert.deepEqual(migrationPlan(meta).map(m=>`${m.name}@${m.version}`),['a@2.0.2','b@2.0.1','b@2.0.2']);
 delete meta.b.versions['2.0.1'];assert.throws(()=>migrationPlan(meta),/SOURCE_MISSING/);
});
test('migration verifies original tarball bytes and rejects corruption',()=>{
 const bytes=Buffer.from('immutable package');const sri='sha512-'+createHash('sha512').update(bytes).digest('base64');
 verifyIntegrity(bytes,sri);assert.throws(()=>verifyIntegrity(Buffer.from('tampered'),sri),/INTEGRITY_MISMATCH/);
});

test('latest root includes exact legacy alias without selecting unrelated history',()=>{
 const m={openxiangda:{'dist-tags':{latest:'2.1.0'},versions:{'2.1.0':{name:'openxiangda',version:'2.1.0',dependencies:{'openxiangda-legacy':'npm:openxiangda@1.0.269'}},'1.0.269':{name:'openxiangda',version:'1.0.269'},'1.0.268':{name:'openxiangda',version:'1.0.268'}}}};
 assert.deepEqual(migrationPlan(m).map(x=>x.version),['1.0.269','2.1.0']);
});
