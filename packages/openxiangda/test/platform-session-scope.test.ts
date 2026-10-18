import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BroadcastChannel } from 'node:worker_threads';
import { platformSessionCoordination } from '../src/browser/platform-session-scope';
import { readRuntimeMount } from '../src/browser/runtime-meta';

test('default coordination remains byte-for-byte compatible; malformed mount scope fails', () => {
  assert.deepEqual(platformSessionCoordination(), {channel:'auth-session-v2',logout:'auth_session_v2:logout',organization:'auth_session_v2:organization'});
  const meta:Record<string,string>={'openxiangda-runtime-base':'/view/example/','openxiangda-app-code':'example','openxiangda-environment':'production'};
  assert.deepEqual(readRuntimeMount(name=>meta[name]), {runtimeBase:'/view/example/',appCode:'example',environmentKey:'production'});
  meta['openxiangda-platform-session-scope']='entry-'+ 'a'.repeat(24);
  assert.equal(readRuntimeMount(name=>meta[name])?.platformSessionScope, meta['openxiangda-platform-session-scope']);
  for (const value of ['default','entry-../../../','entry-'+ 'f'.repeat(25)]) {
    assert.throws(()=>platformSessionCoordination(value));
    meta['openxiangda-platform-session-scope']=value;
    assert.throws(()=>readRuntimeMount(name=>meta[name]));
  }
});

test('real channels deliver scoped logout to its peer without notifying default or another tenant', async () => {
  const scope='entry-'+ 'a'.repeat(24); const same=platformSessionCoordination(scope);
  const sender=new BroadcastChannel(same.channel); const peer=new BroadcastChannel(same.channel);
  const old=new BroadcastChannel(platformSessionCoordination().channel);
  const foreign=new BroadcastChannel(platformSessionCoordination('entry-'+ 'b'.repeat(24)).channel);
  let oldMessages=0, foreignMessages=0;
  old.onmessage=()=>oldMessages++; foreign.onmessage=()=>foreignMessages++;
  try {
    const received=new Promise(resolve=>{peer.onmessage=event=>resolve(event.data);});
    sender.postMessage({type:'logout'});
    assert.deepEqual(await received,{type:'logout'});
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(oldMessages,0); assert.equal(foreignMessages,0);
    assert.notEqual(same.logout,platformSessionCoordination().logout);
    assert.notEqual(same.organization,platformSessionCoordination().organization);
  } finally {sender.close();peer.close();old.close();foreign.close();}
});
