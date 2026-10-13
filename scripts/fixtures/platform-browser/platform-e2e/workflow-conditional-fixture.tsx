import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { WorkflowNodeConfigurationEditor } from 'openxiangda/react';
import 'openxiangda/react/styles.css';
import { configurations } from './workflow-conditional-data';
function Fixture() {
  const [state, setState] = useState({ dirty: false, busy: false, unknown: false });
  const [receipt, setReceipt] = useState<unknown>();
  return <ConfigProvider><App><main style={{ width: 540, margin: '24px auto' }}><output aria-label="配置状态">{JSON.stringify(state)}</output><output aria-label="保存回执">{JSON.stringify(receipt)}</output><WorkflowNodeConfigurationEditor workflowCode="review" node={configurations.nodes[0]} principals={configurations.principals} conditionalAssignment={new URLSearchParams(location.search).has('old') ? undefined : configurations.conditionalAssignment} expectedHeadRevision={1} presentation="inline" readOnly={new URLSearchParams(location.search).has('readonly')} onClose={() => {}} onStateChange={setState} onSaved={setReceipt} /></main></App></ConfigProvider>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
