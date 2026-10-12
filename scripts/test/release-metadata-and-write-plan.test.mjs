import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {queryReleaseMetadata, readReleaseMetadataSnapshot} from '../lib/release-metadata-snapshot.mjs';
import {orderReleaseCandidates, pendingReleaseDistTags, releaseDistTagPlan} from '../lib/release-write-plan.mjs';

const registry='https://registry.npmjs.org';
test('read-only metadata refills bounded slots and preserves package identity order', async () => {
  const events=[]; let active=0, peak=0;
  const names=['openxiangda','openxiangda-cli','openxiangda-contracts'];
  const result=await queryReleaseMetadata({registry,names,concurrency:2,query:async name => {
    active++; peak=Math.max(peak,active); events.push('start:'+name);
    await new Promise(resolve=>setTimeout(resolve,name==='openxiangda'?80:10));
    active--; events.push('end:'+name); return {versions:['2.0.0'], 'dist-tags':{latest:'2.0.0'}};
  }});
  assert.equal(peak,2); assert.equal(result.peakActive,2);
  assert.deepEqual(result.entries.map(e=>e.name),names);
  assert.ok(events.indexOf('start:openxiangda-contracts')<events.indexOf('end:openxiangda'));
  assert.ok(result.elapsedMs>=70); assert.ok(result.entries.every(e=>e.observedAt));
});

test('actual npm subprocess metadata distinguishes 404, authentication and output/deadline', async t => {
  const root=mkdtempSync(join(tmpdir(),'release-metadata-'));
  const executable=join(root,'npm');
  const oldPath=process.env.PATH;
  t.after(()=>{process.env.PATH=oldPath;rmSync(root,{recursive:true,force:true});});
  process.env.PATH=root+':'+oldPath;
  const body=(code)=>writeFileSync(executable,'#!'+process.execPath+'\n'+code,{mode:0o700});
  const options={cwd:root,registry,names:['openxiangda'],concurrency:1};
  body('process.stdout.write(JSON.stringify({versions:["2.0.0"],"dist-tags":{latest:"2.0.0"}}));');
  assert.equal(readReleaseMetadataSnapshot(root,registry,['openxiangda']).entries[0].distTags.latest,'2.0.0');
  body('process.stderr.write("E404 package missing");process.exit(1);');
  assert.deepEqual((await queryReleaseMetadata(options)).entries[0].versions,[]);
  body('process.stderr.write("E401 token=private-do-not-print");process.exit(1);');
  await assert.rejects(queryReleaseMetadata(options),error=>/QUERY_FAILED/.test(error.message)&&!error.message.includes('private-do-not-print'));
  body('setTimeout(()=>{},1000);');
  await assert.rejects(queryReleaseMetadata({...options,timeoutMs:20}),/timeout-or-output-budget/);
  body('process.stdout.write("x".repeat(2*1024*1024));');
  await assert.rejects(queryReleaseMetadata(options),/QUERY_FAILED/);
});

test('invalid metadata inputs and failed reads never produce a successful snapshot', async () => {
  await assert.rejects(queryReleaseMetadata({registry,names:['another-package']}),/INVENTORY_INVALID/);
  await assert.rejects(queryReleaseMetadata({registry:'https://secret@registry.npmjs.org',names:['openxiangda']}),/REGISTRY_INVALID/);
  let started=0;
  await assert.rejects(queryReleaseMetadata({registry,names:['openxiangda','openxiangda-cli','openxiangda-contracts'],concurrency:1,query:async()=>{started++;throw new Error('known-failure');}}),/known-failure/);
  assert.equal(started,1);
  await assert.rejects(queryReleaseMetadata({registry,names:['openxiangda'],query:async()=>({versions:[], 'dist-tags':[]})}),/SHAPE_INVALID/);
});

test('writes follow real dependency closure and root is last without changing receipt order', () => {
  const candidates=[{name:'openxiangda'},{name:'openxiangda-cli'},{name:'openxiangda-contracts'},{name:'openxiangda-devkit-core'}];
  const manifests=[{name:'openxiangda',dependencies:{'openxiangda-cli':'2','openxiangda-contracts':'2'}},
    {name:'openxiangda-cli',dependencies:{'openxiangda-devkit-core':'2'}},
    {name:'openxiangda-devkit-core',dependencies:{'openxiangda-contracts':'2'}}, {name:'openxiangda-contracts'}];
  assert.deepEqual(orderReleaseCandidates(candidates,manifests).map(e=>e.name),['openxiangda-contracts','openxiangda-devkit-core','openxiangda-cli','openxiangda']);
  assert.equal(candidates[0].name,'openxiangda');
  manifests[3].dependencies={'openxiangda-cli':'2'};
  assert.throws(()=>orderReleaseCandidates(candidates,manifests),/DEPENDENCY_CYCLE/);
});

test('frozen tag plan supports original/target recovery, skips target and rejects drift', () => {
  const candidate={name:'openxiangda',priorTags:{latest:'2.0.0','stable-v2':'2.0.0'},channelPolicy:{latest:'2.0.1',stable:{tag:'stable-v2',version:'2.0.1'},prerelease:null}};
  candidate.channelPlan=releaseDistTagPlan(candidate);
  assert.deepEqual(pendingReleaseDistTags(candidate,{latest:'2.0.1','stable-v2':'2.0.0'}).map(e=>e.tag),['stable-v2']);
  assert.deepEqual(pendingReleaseDistTags(candidate,{latest:'2.0.1','stable-v2':'2.0.1'}),[]);
  assert.throws(()=>pendingReleaseDistTags(candidate,{latest:'2.0.2'}),/CHANNEL_DRIFT/);
  candidate.channelPlan[0].targetVersion='2.0.3';
  assert.throws(()=>pendingReleaseDistTags(candidate,{}),/CHANNEL_PLAN_MISMATCH/);
  delete candidate.channelPlan;
  assert.equal(pendingReleaseDistTags(candidate,candidate.priorTags).length,2);
});
