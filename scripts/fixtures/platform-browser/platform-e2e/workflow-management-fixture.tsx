import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { WorkflowDesigner } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowDesigner';
import '../../../../packages/openxiangda/dist/browser/styles.css';
// Real SDK, intercepted test HTTP only; never a live role or application.
function Fixture() {
  const [state,setState] = useState({dirty:false,busy:false,unknown:false});
  return <ConfigProvider><App><output aria-label="宿主离开保护状态">{JSON.stringify(state)}</output><WorkflowDesigner workflowCode="approval" onStateChange={setState} onBack={() => {}} /></App></ConfigProvider>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
