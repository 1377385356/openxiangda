import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowPeopleSourceEditor } from '../src/browser/components/workflow/WorkflowPeopleSourceEditor.js';

const variables = [{ path: 'dept.value', label: '承办部门' }, { path: 'ownerDept.value', label: '归口部门' }];
const principals = { users: [], roles: [{ code: 'owner_dept_head', name: '归口部门负责人' }] };
const sources: any = {
  handling_department_supervisor: { provider: 'department_supervisor', departmentIdFrom: 'dept.value', level: 1, fallbackToAncestorSupervisor: false, min: 1, max: 1 },
  owning_department_supervisor: { provider: 'department_supervisor', departmentIdFrom: 'ownerDept.value', level: 2, fallbackToAncestorSupervisor: true },
  owning_department_role: { provider: 'app_role_in_scope', roleCode: 'owner_dept_head', scope: { dimension: 'owner-department', valueFrom: 'ownerDept.value' } },
  budget_owner: { provider: 'form_field_users', inputPath: 'budgetOwnerUsers', min: 1, max: 10 },
};
function render(entry: any, directory: any = sources, disabled = false) {
  const before = structuredClone(directory);
  const html = renderToStaticMarkup(createElement(WorkflowPeopleSourceEditor, { entry, sources: directory, principals, variables, disabled, onChange: () => assert.fail('render must not change input') }));
  assert.deepEqual(directory, before);
  return html;
}
test('selected supervisor source shows its meaning and bounds without duplicate technical categories', () => {
  const html = render(sources.handling_department_supervisor);
  assert.doesNotMatch(html,/应用角色（已发布规则）/);
  for (const label of ['审批人来源', '部门主管', '承办部门', '本级无人时阻止办理', '必须解析到 1 人']) assert.match(html, new RegExp(label));
});
test('empty released directory does not advertise unavailable providers', () => {
  const html = render({ provider: 'fixed_users', users: [] }, {});
  assert.doesNotMatch(html, />部门主管<|>逐级主管<|>业务关系</);
});
test('unreleased current source is preserved and explained', () => {
  assert.match(render({ provider: 'department_supervisor', departmentIdFrom: 'unknown.value', level: 20 }), /原值仍被保留/);
});
test('disabled complex source keeps its correct bounds and disabled controls', () => {
  const html = render(sources.budget_owner, sources, true);
  assert.match(html, /disabled/);
  assert.match(html, /至少 1 人，最多 10 人/);
});

test('one authorized initiating-unit source exposes levels without a redundant source picker', () => {
  const entry: any = { provider: 'department_supervisor', departmentIdFrom: 'organizationContext.departmentId', level: 1, fallbackToAncestorSupervisor: false, min: 1, max: 1 };
  const template: any = { code: 'initiating-unit', title: 'Initiating unit', entry, parameters: { level: { values: [1, 2, 3] } } };
  const html = renderToStaticMarkup(createElement(WorkflowPeopleSourceEditor, { entry, sources: { head: entry }, templates: [template], principals, disabled: false, onChange: () => assert.fail('render mutated binding') }));
  assert.match(html, /人员来源参数/);
  assert.match(html, /主管级别/);
  assert.doesNotMatch(html, /aria-label="其他人员来源"/);
});

test('department supervisor exposes authorized basis and owner field without changing original constraints',()=>{
  const entry:any={provider:'department_supervisor',departmentIdFrom:'ownerDept.value',level:1,fallbackToAncestorSupervisor:false,min:1,max:1};
  const before=structuredClone(entry);
  const template:any={code:'department-head',title:'部门主管',entry,parameters:{departmentIdFrom:{values:['organizationContext.departmentId','ownerDept.value']},level:{values:[1,2,3]}}};
  const html=renderToStaticMarkup(createElement(WorkflowPeopleSourceEditor,{entry,sources:{head:entry},templates:[template],variables,principals,disabled:false,onChange:()=>assert.fail('render changed binding')}));
  for(const text of ['部门依据','表单中的部门字段','部门字段','归口部门','主管级别'])assert.match(html,new RegExp(text));
  assert.deepEqual(entry,before);
});
