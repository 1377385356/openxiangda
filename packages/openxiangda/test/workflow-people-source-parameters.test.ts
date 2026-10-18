import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowPeopleSourceParametersEditor,workflowPeopleParameterOptionLabel as label } from '../src/browser/components/workflow/WorkflowPeopleSourceParametersEditor.js';
const variables=[{path:'dept.value',label:'承办部门'},{path:'ownerDept.value',label:'归口部门'},{path:'people',label:'经办成员'}];
const principals={users:[],roles:[{code:'leader',name:'分管院领导'}]};
test('every supervisor and department parameter has a Chinese option description, not a code',()=>{
 for(const [field,value,expected] of [['departmentIdFrom','dept.value','承办部门'],['inputPath','people','经办成员'],['from','initiator','本申请发起人'],['from',{field:'people'},'经办成员'],['until','top','最上级主管'],['until',{level:3},'第 3 级主管'],['until',{roleCode:'leader'},'分管院领导'],['continuous',true,'从起点逐级依次办理'],['missing','skip_level','跳过无人层级，继续向上'],['roleCode','leader','分管院领导'],['scope',{dimension:'owner-department',valueFrom:'ownerDept.value'},'按归口部门的授权范围']]) assert.equal(label(field as string,value,variables,principals),expected);
});
test('full parameter editor shows only released numeric/enum fields and does not change input on render',()=>{
 const entry:any={provider:'department_supervisor',departmentIdFrom:'dept.value',level:1,fallbackToAncestorSupervisor:false,min:1,max:1};const template:any={code:'dept',title:'部门主管设置',entry,parameters:{departmentIdFrom:{values:['dept.value','ownerDept.value']},level:{minimum:1,maximum:5},fallbackToAncestorSupervisor:{values:[false,true]}}};const before=structuredClone(entry);
 const html=renderToStaticMarkup(createElement(WorkflowPeopleSourceParametersEditor,{entry,template,variables,principals,disabled:false,onChange:()=>assert.fail('render must not change entry')}));for(const text of ['部门依据','部门字段','主管级别','本级无人时','部门主管设置','承办部门','阻止办理并提示配置'])assert.match(html,new RegExp(text));assert.doesNotMatch(html,/dept\.value|fallbackToAncestorSupervisor/);assert.deepEqual(entry,before);
});
test('disabled parameter controls remain disabled and unknown choices are kept repairable',()=>{
 const entry:any={provider:'supervisor_chain',from:'initiator',until:{level:99},continuous:true,missing:'block'};const template:any={code:'chain',title:'逐级主管',entry:{...entry,until:'top'},parameters:{until:{values:['top',{level:2}]}}};const html=renderToStaticMarkup(createElement(WorkflowPeopleSourceParametersEditor,{entry,template,principals,disabled:true,onChange:()=>assert.fail('must not emit on render')}));assert.match(html,/disabled/);assert.match(html,/当前值不在已发布范围/);assert.equal(entry.until.level,99);
});
