import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { OpenXiangdaUiProvider, RuntimeBoundary, useRuntime } from 'openxiangda/react';
import { createManagedConcurrencyClient } from 'openxiangda/core';
import 'openxiangda/react/styles.css';

function ProtectedForm() {
  const { identity } = useRuntime();
  const [draft, setDraft] = useState('');
  const [client] = useState(createManagedConcurrencyClient);
  const [recovery, setRecovery] = useState('');
  return <main>
    <output data-testid="current-user">{identity.userId}</output>
    <input data-testid="draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <output data-testid="draft-value">{draft}</output>
    <button onClick={() => {
      setRecovery('正在查询');
      void client.result({ command: 'claim', requestKey: 'original-request-key' }).then(
        () => setRecovery('已恢复原申请'), () => setRecovery('恢复失败'),
      );
    }}>查询原申请</button>
    <output data-testid="recovery">{recovery}</output>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <OpenXiangdaUiProvider>
    <MemoryRouter>
      <RuntimeBoundary><ProtectedForm /></RuntimeBoundary>
    </MemoryRouter>
  </OpenXiangdaUiProvider>,
);
