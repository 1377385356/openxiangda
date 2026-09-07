import { useCallback, useEffect, useRef, useState } from 'react';

type Page<T> = { items: T[]; nextCursor: string | null };

/** Read lifecycle only: selections remain owned by the calling popup session. */
export function useMobilePickerPage<T>({ loadPage, enabled = true, delay = 0 }: {
  loadPage: (cursor?: string) => Promise<Page<T>>;
  enabled?: boolean;
  delay?: number;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  const failedCursor = useRef<string | undefined>(undefined);
  const read = useCallback((cursor?: string) => {
    if (busy.current) return;
    busy.current = true;
    const current = generation.current;
    setLoading(true);
    setError('');
    void loadPage(cursor).then(page => {
      if (generation.current !== current) return;
      setItems(previous => cursor ? [...previous, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    }).catch(reason => {
      if (generation.current !== current) return;
      failedCursor.current = cursor;
      setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (generation.current !== current) return;
      busy.current = false;
      setLoading(false);
    });
  }, [loadPage]);
  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setItems([]); setNextCursor(null); setError(''); setLoading(enabled);
    const timer = enabled ? window.setTimeout(() => read(), delay) : undefined;
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [delay, enabled, read]);
  return {
    items, nextCursor, loading, error,
    loadMore: () => { if (enabled && nextCursor) read(nextCursor); },
    retry: () => { if (enabled) read(failedCursor.current); },
  };
}
