import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowNodeCard } from '../src/browser/components/workflow/WorkflowNodeCard.js';
function card(node:any,visit?:any) {return renderToStaticMarkup(createElement(WorkflowNodeCard,{node,title:node.title,selected:false,start:false,visit,onClick:()=>{},onNavigate:()=>false}));}
test('handling cards describe completion and never invent an approval vote',()=>{
 const html=card({id:'work',kind:'handle',title:'办理资料',mode:'any'});
 assert.match(html,/办理/);assert.match(html,/任一人完成/);assert.doesNotMatch(html,/或签|任一人通过|>handle</);
});
test('proved return resume is distinct from an empty approval skip',()=>{
 const node={id:'review',kind:'approval',title:'复审'};
 const resumed=card(node,{id:'visit',nodeId:'review',status:'skipped',skipped:true,enteredAt:null,leftAt:null});
 assert.match(resumed,/已办过，本次略过/);assert.doesNotMatch(resumed,/无审批人|无人/);
 const empty=card(node,{id:'empty',nodeId:'review',status:'completed',skipped:true,enteredAt:null,leftAt:null});assert.match(empty,/无审批人，已跳过/);
});
test('notification cards present the platform delivery purpose without a backend receipt',()=>{
 const html=card({id:'notice',kind:'action',presentation:'notification',title:'发送通知'});
 assert.match(html,/通过通知中心发送/);assert.doesNotMatch(html,/业务步骤|成功回执|platform-notify/);
});
