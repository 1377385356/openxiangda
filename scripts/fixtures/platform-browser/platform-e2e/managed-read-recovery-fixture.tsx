import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createManagedConcurrencyClient, loadRuntimeAuthorization } from 'openxiangda/core';

function ReadRecovery() {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [title, setTitle] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        await loadRuntimeAuthorization({ refresh: true });
        const client = createManagedConcurrencyClient();
        const [detail] = await Promise.all([
          client.read<{ title: string }>('offer', { id: 'original' }, abort.signal),
          client.mine('claim', { resourceKey: 'original', limit: 1 }, abort.signal),
        ]);
        if (!abort.signal.aborted) { setTitle(detail.data.title); setState('loaded'); }
      } catch {
        if (!abort.signal.aborted) { setState('error'); abort.abort(); }
      }
    })();
    return () => abort.abort();
  }, []);
  return <main>
    {state === 'loading' && <p role="status">正在加载活动及本人申请</p>}
    {state === 'loaded' && <h1>{title}</h1>}
    {state === 'error' && <p role="alert">服务暂时不可用，请稍后重试</p>}
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<ReadRecovery />);
