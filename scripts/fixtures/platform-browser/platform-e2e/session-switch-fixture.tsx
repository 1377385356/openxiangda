import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { OpenXiangdaUiProvider, RuntimeBoundary, useRuntime } from 'openxiangda/react';
import 'openxiangda/react/styles.css';

function ProtectedForm() {
  const { identity } = useRuntime();
  const [draft, setDraft] = useState('');
  return <main>
    <output data-testid="current-user">{identity.userId}</output>
    <input data-testid="draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <output data-testid="draft-value">{draft}</output>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <OpenXiangdaUiProvider>
    <MemoryRouter>
      <RuntimeBoundary><ProtectedForm /></RuntimeBoundary>
    </MemoryRouter>
  </OpenXiangdaUiProvider>,
);
