import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { WorkflowNodeConfigurationEditor } from 'openxiangda/react';
import 'openxiangda/react/styles.css';
import { configurations } from './workflow-conditional-data';
const params = new URLSearchParams(location.search);
const fixture = structuredClone(configurations);
if (params.has('scoped') || params.has('flat-scoped')) {
  fixture.nodes[0].administration.assigneeProviders.push('app_role_in_scope');
  fixture.conditionalAssignment.scopeDimensionsByNode.review = ['department'];
  const scoped = { provider: 'app_role_in_scope', roleCode: 'finance', scope: { dimension: 'department', value: 'finance' } };
  if (params.has('flat-scoped')) {
    fixture.nodes[0].defaults.binding = scoped;
    fixture.nodes[0].effective.binding = structuredClone(scoped);
  } else {
    fixture.nodes[0].defaults.binding.cases[0].assignee = scoped;
  }
}
function Fixture() {
  const [state, setState] = useState({ dirty: false, busy: false, unknown: false });
  const [receipt, setReceipt] = useState<unknown>();
  return <ConfigProvider><App><main style={{ width: 540, margin: '24px auto' }}><output aria-label="配置状态">{JSON.stringify(state)}</output><output aria-label="保存回执">{JSON.stringify(receipt)}</output><WorkflowNodeConfigurationEditor workflowCode="review" node={fixture.nodes[0]} principals={fixture.principals} conditionalAssignment={params.has('old') ? undefined : fixture.conditionalAssignment} expectedHeadRevision={1} presentation="inline" readOnly={new URLSearchParams(location.search).has('readonly')} onClose={() => {}} onStateChange={setState} onSaved={setReceipt} /></main></App></ConfigProvider>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
