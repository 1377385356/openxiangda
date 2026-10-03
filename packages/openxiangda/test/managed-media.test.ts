import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {DataFilePreview} from 'openxiangda-contracts/browser';
import {startManagedMediaRead} from '../src/browser/components/platform-fields/managed-media-read';
import {ManagedMediaElement} from '../src/browser/components/platform-fields/ManagedMediaPlayer';
const preview={file:{id:'media',size:3,name:'学习.mp4'},canPreview:true,previewType:'video',renderMode:'inline'} as DataFilePreview;
function fixture(overrides:Partial<Parameters<typeof startManagedMediaRead>[0]>={}){
  const urls:string[]=[],revoked:string[]=[],ready:unknown[]=[],failed:unknown[]=[];
  const read=startManagedMediaRead({preview:async()=>preview,content:async()=>new Blob(['abc']),maxBytes:100,
    createUrl:()=>{const url=`blob:${urls.length}`;urls.push(url);return url;},revokeUrl:url=>revoked.push(url),ready:value=>ready.push(value),failed:error=>failed.push(error),...overrides});
  return {read,urls,revoked,ready,failed};
}
test('standard media renders video/audio controls without autoplay or external URLs',()=>{
  for(const kind of ['video','audio'] as const){const html=renderToStaticMarkup(createElement(ManagedMediaElement,{kind,src:'blob:managed',name:'学习'}));
    assert.match(html,new RegExp(`<${kind}`));assert.match(html,/controls=""/);assert.match(html,/src="blob:managed"/);assert.doesNotMatch(html,/autoplay/);}
});
test('successful read has one URL, canceled twice revokes only once',async()=>{
  const f=fixture();await f.read.completion;assert.equal(f.ready.length,1);assert.equal(f.urls.length,1);f.read.dispose();f.read.dispose();assert.deepEqual(f.revoked,f.urls);
});
test('late metadata and late content cannot resurrect an unmounted or changed identity player',async()=>{
  for(const phase of ['metadata','content']){let release:(value:any)=>void=()=>{};const pending=new Promise<any>(resolve=>{release=resolve;});
    const f=fixture(phase==='metadata'?{preview:()=>pending}:{content:()=>pending});
    await Promise.resolve();f.read.dispose();release(phase==='metadata'?preview:new Blob(['abc']));await f.read.completion;
    assert.deepEqual(f.urls,[]);assert.deepEqual(f.ready,[]);assert.deepEqual(f.failed,[]);}
});
test('denial, unsupported type, oversize and mismatched bytes never create a playable URL',async()=>{
  for(const overrides of [{preview:async()=>{throw Error('403 denied');}},{preview:async()=>({...preview,previewType:'download' as const})},{maxBytes:2},{content:async()=>new Blob(['wrong'])}]){
    const f=fixture(overrides);await f.read.completion;assert.equal(f.failed.length,1);assert.deepEqual(f.urls,[]);assert.deepEqual(f.ready,[]);}
});
