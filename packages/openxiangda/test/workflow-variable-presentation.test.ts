import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowGraphWithChoices, workflowVariablesWithChoices, formatWorkflowCondition } from '../src/browser/components/workflow/workflow-variable-presentation.js';

const variable = (path: string, type = 'string'): any => ({ path, label: path === 'major.value' ? '是否重大合同' : '测试字段', type, required: true, source: { kind: 'input' }, usedBy: [] });
const choices = { 'major.value': [{ value: 'yes', label: '重大' }, { value: 'no', label: '一般' }] };
test('choice projection clones valid metadata without changing facts, inputs or authority', () => {
  const source = [variable('major.value')], before = structuredClone(choices);
  const [result] = workflowVariablesWithChoices(source, choices);
  assert.deepEqual(result?.choices, choices['major.value']);
  assert.notEqual(result?.choices, choices['major.value']);
  assert.equal(source[0].choices, undefined); assert.deepEqual(choices, before);
});
test('unknown variable metadata does not add new facts', () => assert.deepEqual(workflowVariablesWithChoices([variable('a')], choices), [variable('a')]));
test('Chinese condition description preserves original expression', () => {
  const expression: any = { op: 'eq', left: { op: 'path', path: 'major.value' }, right: { op: 'literal', value: 'yes' } };
  const before = structuredClone(expression);
  assert.equal(formatWorkflowCondition(expression, workflowVariablesWithChoices([variable('major.value')], choices)), '是否重大合同 等于 重大');
  assert.deepEqual(expression, before);
});
test('zero and false are not treated as missing or converted to text', () => {
  for (const [type, value] of [['integer', 0], ['boolean', false]] as const) {
    const result = workflowVariablesWithChoices([variable('value', type)], { value: [{ value, label: '已知选项' }] });
    assert.equal(result[0]?.choices?.[0]?.value, value);
    assert.equal(formatWorkflowCondition({ op: 'eq', left: { op: 'path', path: 'value' }, right: { op: 'literal', value } }, result), '测试字段 等于 已知选项');
  }
});
test('multiple matches keep known Chinese names and do not guess unknown values', () => {
  assert.equal(formatWorkflowCondition({ op: 'in', left: { op: 'path', path: 'major.value' }, right: { op: 'literal', value: ['yes', 'legacy'] } }, workflowVariablesWithChoices([variable('major.value')], choices)), '是否重大合同 属于 重大、"legacy"');
});
test('unknown raw value remains visible rather than being mapped to a wrong choice', () => assert.match(formatWorkflowCondition({ op: 'neq', left: { op: 'path', path: 'major.value' }, right: { op: 'literal', value: 'legacy' } }, workflowVariablesWithChoices([variable('major.value')], choices)), /"legacy"/));
test('numeric units and nested comparison descriptions remain readable', () => {
  const vars = [{ ...variable('amount', 'number'), unit: '元' }];
  assert.equal(formatWorkflowCondition({ op: 'gte', left: { op: 'path', path: 'amount' }, right: { op: 'literal', value: 100 } }, vars), '测试字段 大于等于 100 元');
  assert.match(formatWorkflowCondition({ op: 'not', value: { op: 'literal', value: true } }, vars), /^不满足/);
});
test('invalid or mismatched metadata falls back without silently changing choices', () => {
  for (const list of [[{value: 'yes', label: ''}], [{value: 'yes', label: '是'}, {value: 'yes', label: '重复'}], [{value: 1, label: '不匹配'}], [{value: 'yes', label: 'x'.repeat(161)}], Array.from({length:65},(_,i)=>({value:String(i),label:String(i) }))]) assert.equal(workflowVariablesWithChoices([variable('major.value')], {'major.value': list})[0]?.choices, undefined);
});
test('unsafe integers and nonfinite values are not advertised', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.2, Number.MAX_SAFE_INTEGER + 1]) assert.equal(workflowVariablesWithChoices([variable('n', 'integer')], {n:[{value,label:'不安全'}]})[0]?.choices, undefined);
});
test('overlarge dictionaries and inherited entries cannot advertise new metadata', () => {
  const supplied = Object.fromEntries(Array.from({length:129},(_,i)=>[String(i),choices['major.value']])); supplied['major.value']=choices['major.value'];
  assert.equal(workflowVariablesWithChoices([variable('major.value')], supplied)[0]?.choices, undefined);
  assert.equal(workflowVariablesWithChoices([variable('major.value')], Object.create(choices))[0]?.choices, undefined);
});

test('graph choices translate generated labels while preserving custom branch labels and canonical values', () => {
  const expression: any = { op: 'eq', left: { op: 'path', path: 'major.value' }, right: { op: 'literal', value: 'yes' } };
  const graph: any = { variables: [variable('major.value')], nodes: [{ id: 'route' }], definitionDigest: 'immutable', edges: [
    { id: 'automatic', expression, label: '是否重大合同 = "yes"', from: 'route', to: 'end' },
    { id: 'named', expression, label: '管理员自定义分支', from: 'route', to: 'end' },
  ] };
  const before = structuredClone(graph), sourceChoices = structuredClone(choices);
  const result = workflowGraphWithChoices(graph, choices);
  assert.equal(result.edges[0]?.label, '是否重大合同 等于 重大');
  assert.equal(result.edges[1]?.label, '管理员自定义分支');
  assert.equal(formatWorkflowCondition(result.edges[1]!.expression!, result.variables), '是否重大合同 等于 重大');
  assert.equal(result.nodes, graph.nodes); assert.equal(result.definitionDigest, 'immutable');
  assert.deepEqual(graph, before); assert.deepEqual(choices, sourceChoices);
});
test('a second diagram projection retains already validated choices from the parent editor', () => {
  const graph: any = { variables: [variable('major.value')], nodes: [], edges: [] };
  const parent = workflowGraphWithChoices(graph, choices), child = workflowGraphWithChoices(parent);
  assert.deepEqual(child.variables[0]?.choices, choices['major.value']);
  assert.equal(graph.variables[0].choices, undefined);
});
test('graph projection does not invent a translation for an unknown stored value', () => {
  const expression: any = { op: 'eq', left: { op: 'path', path: 'major.value' }, right: { op: 'literal', value: 'legacy' } };
  const graph: any = { variables: [variable('major.value')], nodes: [], edges: [{ expression, label: '未知历史条件' }] };
  const result = workflowGraphWithChoices(graph, choices);
  assert.equal(result.edges[0]?.label, '未知历史条件');
  assert.equal(formatWorkflowCondition(result.edges[0]!.expression!, result.variables), '是否重大合同 等于 "legacy"');
  assert.equal(graph.edges[0].expression.right.value, 'legacy');
});
