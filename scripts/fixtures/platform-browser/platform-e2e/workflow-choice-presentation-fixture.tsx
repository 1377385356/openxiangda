import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { WorkflowDiagram } from 'openxiangda/react';
import type { WorkflowGraphProjection } from 'openxiangda/core';
import 'openxiangda/react/styles.css';
// Synthetic display-only graph; no identity, model provider or business requests.
const graph: WorkflowGraphProjection = {
  schemaVersion: 'openxiangda.workflow-graph/v2', workflowCode: 'choice-display-fixture', definitionDigest: 'display-only',
  fixedTopology: true, branchStrategy: 'first_match', startAt: 'route', diagnostics: [], logic: [],
  variables: [{ path: 'major.value', label: '是否重大合同', type: 'string', required: true, source: { kind: 'input' }, usedBy: ['route'] }],
  nodes: [{ id: 'route', kind: 'condition', title: '合同条件分流' }, { id: 'known', kind: 'end', title: '重大合同结束', outcome: 'approved' }, { id: 'legacy', kind: 'end', title: '历史条件结束', outcome: 'rejected' }],
  edges: [
    { id: 'known-choice', kind: 'branch', from: 'route', to: 'known', label: '自定义重大分支', priority: 1, variablePaths: ['major.value'], expression: { op: 'eq', left: { op: 'path', path: 'major.value' }, right: { op: 'literal', value: 'yes' } } },
    { id: 'legacy-choice', kind: 'branch', from: 'route', to: 'legacy', label: '历史条件分支', priority: 2, variablePaths: ['major.value'], expression: { op: 'eq', left: { op: 'path', path: 'major.value' }, right: { op: 'literal', value: 'legacy' } } },
  ],
};
function Fixture() {
  const [selected, setSelected] = useState('route');
  const invalid = new URLSearchParams(location.search).get('choices') === 'invalid';
  const choices = { 'major.value': invalid ? [{ label: '错误布尔选项', value: true }] : [{ label: '重大', value: 'yes' }, { label: '一般', value: 'no' }] };
  return <ConfigProvider><App><main style={{ height: '100dvh' }}><output aria-label="原始条件值">{JSON.stringify(graph.edges[0]!.expression)}</output><WorkflowDiagram graph={graph} variableChoices={choices} selectedNodeId={selected} onSelectNode={setSelected} presentation="canvas" /></main></App></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
