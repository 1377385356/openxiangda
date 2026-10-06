import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { WorkflowDelegationManager } from '../../../../packages/openxiangda/src/browser/components/workflow/WorkflowDelegationManager';
// The CSS bundle includes the generated, scoped upstream mobile stylesheet.
// Business components and clients still come directly from source.
import '../../../../packages/openxiangda/dist/browser/styles.css';

// Component fixture only. Its test intercepts every platform request; it is not
// an application, a real role session or evidence of business approval.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider><App><main style={{ padding: 16, maxWidth: 1100, margin: 'auto' }}>
    <h1>审批代理组件验证</h1><WorkflowDelegationManager />
  </main></App></ConfigProvider>,
);
