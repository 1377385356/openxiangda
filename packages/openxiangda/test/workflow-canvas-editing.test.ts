import assert from 'node:assert/strict';
import test from 'node:test';
import { reconnectWorkflowCanvasEdge, moveWorkflowCanvasNode } from '../src/browser/components/workflow/workflow-canvas-editing.js';
function fixture():any {
  const approval=(id:string,next:string)=>({id,kind:'approval',title:id,mode:'single',binding:id,onApprove:next,onReject:'rejected',returnPolicy:{targets:[]}});
  return {schemaVersion:'openxiangda.workflow-definition/v2',code:'canvas-test',title:'Canvas',startAt:'a',nodes:{a:approval('a','b'),b:approval('b','c'),c:approval('c','end'),end:{id:'end',kind:'end',title:'Done',outcome:'approved'},rejected:{id:'rejected',kind:'end',title:'Rejected',outcome:'rejected'}}};
}
test('moving a node preserves identity, binding, settings and both successors',()=>{
  const before=fixture(),snapshot=structuredClone(before),next=moveWorkflowCanvasNode(before,'b','c:approve');
  assert.deepEqual(before,snapshot);assert.equal(next.nodes.a.onApprove,'c');assert.equal(next.nodes.c.onApprove,'b');
  assert.equal(next.nodes.b.onApprove,'end');assert.equal(next.nodes.b.onReject,'rejected');assert.equal(next.nodes.b.binding,'b');assert.deepEqual(next.nodes.b.returnPolicy,before.nodes.b.returnPolicy);
});
test('canvas reconnect supports an explicit reject outlet without editing approval',()=>{
  const next=reconnectWorkflowCanvasEdge(fixture(),'a:reject','end');
  assert.equal(next.nodes.a.onApprove,'b');assert.equal(next.nodes.a.onReject,'end');
});
test('invalid cycle and disconnected nodes leave the original graph intact',()=>{
  const before=fixture(),snapshot=structuredClone(before);
  assert.throws(()=>reconnectWorkflowCanvasEdge(before,'c:approve','a'));
  assert.throws(()=>reconnectWorkflowCanvasEdge(before,'a:approve','c'));
  assert.deepEqual(before,snapshot);
});
test('return paths and drops onto the moving node cannot become ordinary moves',()=>{
  assert.throws(()=>reconnectWorkflowCanvasEdge(fixture(),'a:return:b','c'));
  assert.throws(()=>moveWorkflowCanvasNode(fixture(),'b','a:approve'));
  assert.throws(()=>moveWorkflowCanvasNode(fixture(),'b','a:reject'));
});
