import assert from 'node:assert/strict';
import test from 'node:test';
import { reconnectWorkflowCanvasEdge, moveWorkflowCanvasNode, reorderWorkflowCanvasBranch, workflowCanvasMoveRegion } from '../src/browser/components/workflow/workflow-canvas-editing.js';
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

test('condition group moves with both branch bodies and retains shared continuation',()=>{
  const source=fixture();source.inputSchema={type:'object',properties:{major:{type:'boolean'}}};source.nodes.a.onApprove='route';source.nodes.route={id:'route',kind:'condition',title:'重大合同判断',branches:[{label:'重大',when:{op:'eq',left:{op:'path',path:'major'},right:{op:'literal',value:true}},target:'b'}],otherwise:'c'};source.nodes.b.onApprove='continuation';source.nodes.c.onApprove='continuation';source.nodes.continuation={...source.nodes.a,id:'continuation',binding:'continuation',onApprove:'end'};
  const region=workflowCanvasMoveRegion(source,'route');assert.deepEqual([...region.members].sort(),['b','c','route']);assert.equal(region.exit,'continuation');
  const next=moveWorkflowCanvasNode(source,'route','continuation:approve');
  assert.equal(next.nodes.a.onApprove,'continuation');assert.equal(next.nodes.continuation.onApprove,'route');assert.equal(next.nodes.b.onApprove,'end');assert.equal(next.nodes.c.onApprove,'end');assert.equal(next.nodes.route.otherwise,'c');assert.equal(source.nodes.b.onApprove,'continuation');
  assert.throws(()=>moveWorkflowCanvasNode(source,'route','b:approve'));
});
test('move before first node uses the visual start edge without persisting a synthetic node',()=>{
  const source=fixture(),next=moveWorkflowCanvasNode(source,'c','__oxa_designer_start_edge__');
  assert.equal(next.startAt,'c');assert.equal(next.nodes.c.onApprove,'a');assert.equal(next.nodes.b.onApprove,'end');assert.equal(Object.keys(next.nodes).length,Object.keys(source.nodes).length);
});
test('branch ordering is atomic and default cannot enter priority ordering',()=>{
  const source=fixture();source.inputSchema={type:'object',properties:{major:{type:'boolean'}}};source.nodes.a.onApprove='route';source.nodes.route={id:'route',kind:'condition',title:'Route',branches:[{label:'One',when:{op:'eq',left:{op:'path',path:'major'},right:{op:'literal',value:true}},target:'b'},{label:'Two',when:{op:'eq',left:{op:'path',path:'major'},right:{op:'literal',value:false}},target:'c'}],otherwise:'c'};
  const next=reorderWorkflowCanvasBranch(source,'route',0,1);assert.equal(next.nodes.route.branches[0].label,'Two');assert.equal(next.nodes.route.otherwise,'c');assert.equal(source.nodes.route.branches[0].label,'One');assert.throws(()=>reorderWorkflowCanvasBranch(source,'route',0,2));
});

test('parallel group moves atomically while branch nodes cannot cross the fork boundary',()=>{
  const source=fixture();source.nodes.a.onApprove='fork';source.nodes.fork={id:'fork',kind:'parallel',title:'并行审核',join:'join',branches:[{id:'left',title:'Left',target:'b'},{id:'right',title:'Right',target:'c'}]};source.nodes.b.onApprove='join';source.nodes.c.onApprove='join';source.nodes.join={id:'join',kind:'join',title:'汇合',parallel:'fork',next:'after'};source.nodes.after={...source.nodes.a,id:'after',binding:'after',onApprove:'end'};
  const snapshot=structuredClone(source);
  const region=workflowCanvasMoveRegion(source,'fork');assert.deepEqual([...region.members].sort(),['b','c','fork','join']);assert.equal(region.exit,'after');
  const moved=moveWorkflowCanvasNode(source,'fork','after:approve');assert.equal(moved.nodes.a.onApprove,'after');assert.equal(moved.nodes.after.onApprove,'fork');assert.equal(moved.nodes.join.next,'end');assert.equal(moved.nodes.b.onApprove,'join');assert.deepEqual(source,snapshot);
  assert.throws(()=>moveWorkflowCanvasNode(source,'b','after:approve'));assert.throws(()=>moveWorkflowCanvasNode(source,'fork','b:approve'));
});
