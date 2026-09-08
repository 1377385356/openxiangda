import { formatPresentationTime, usePresentationTimeZone } from '../../presentation-time';
import { Alert, Button, type FormInstance } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createResourceFormDraftClient, type ResourceFormDraft } from '../../platform-client';
import { FormConfirmation, ResourceFormDrafts } from './ResourceFormDrafts';
import type { SurfaceField } from './SurfaceFields';

function createDraftId() {
  // getRandomValues also works on private HTTP deployments where randomUUID is absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useResourceFormDrafts({ code, viewCode, mode, recordId, mobile, fields, ready, form, encode, restore, recordRevision, onSaved }: {
  code: string; viewCode?: string; mode: 'create' | 'edit'; recordId?: string; mobile: boolean; fields: SurfaceField[]; ready: boolean;
  form: FormInstance; encode(values: Record<string, unknown>): Record<string, unknown>;
  restore(draft: ResourceFormDraft): void; recordRevision?: number; onSaved(): void;
}) {
  const timeZone = usePresentationTimeZone();
  const client = useMemo(() => createResourceFormDraftClient(code, mode === 'edit' ? 'update' : 'create', recordId, viewCode), [code, mode, recordId, viewCode]);
  const [items, setItems] = useState<ResourceFormDraft[]>([]);
  const [limit, setLimit] = useState(20);
  const [days, setDays] = useState(90);
  const [current, setCurrent] = useState<ResourceFormDraft>();
  const [boxOpen, setBoxOpen] = useState(false);
  const [prompt, setPrompt] = useState<ResourceFormDraft>();
  const [deleting, setDeleting] = useState<ResourceFormDraft>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const newId = useRef('');
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const resume = (draft: ResourceFormDraft) => { restoreRef.current(draft); setCurrent(draft); setBoxOpen(false); setPrompt(undefined); setError(''); setSaved(false); };
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void client.list().then(result => {
      if (!active) return;
      setItems(result.items); setLimit(result.limit); setDays(result.retentionDays);
      const requested = new URLSearchParams(window.location.search).get('draft');
      if (requested) {
        const draft = result.items.find(item => item.id === requested);
        if (draft) resume(draft); else setError('指定草稿不存在、已提交或已过期，请从草稿箱重新选择。');
      } else if (mode === 'create' && result.items[0]) setPrompt(result.items[0]);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : '草稿读取失败'); });
    return () => { active = false; };
  }, [client, ready, mode]);
  const save = async () => {
    if (busyRef.current) return undefined;
    busyRef.current = true; setBusy(true); setError(''); setSaved(false);
    try {
      const result = await client.save({ id: current?.id || (newId.current ||= createDraftId()), expectedRevision: current?.revision || 0,
        recordRevision, values: encode(form.getFieldsValue(true)) });
      setCurrent(result); setItems(previous => [result, ...previous.filter(item => item.id !== result.id)]); setSaved(true); onSaved();
      return result;
    } catch (error) { setError(error instanceof Error ? error.message : '暂存失败，请重试'); return undefined; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const remove = async (draft: ResourceFormDraft) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setDeleting(undefined); setError('');
    try {
      await client.remove(draft); setItems(previous => previous.filter(item => item.id !== draft.id));
      if (current?.id === draft.id) { setCurrent(undefined); newId.current = ''; }
    } catch (error) { setError(error instanceof Error ? error.message : '删除草稿失败'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return { current, busy, save, client, count: items.length, showBox: () => setBoxOpen(true), clearSaved: () => setSaved(false),
    feedback: <>{error && <Alert className="oxa-draft-error" type="warning" showIcon title="草稿操作未完成" description={error}
      action={<Button size="small" onClick={() => { void client.list().then(result => { setItems(result.items); setError(''); setBoxOpen(true); }).catch(error => setError(error.message)); }}>重试</Button>} />}
      {saved && <Alert type="success" showIcon title="已暂存，可从草稿箱继续编辑" />}</>,
    overlays: <><ResourceFormDrafts mobile={mobile} open={boxOpen} fields={fields} resourceCode={code} items={items} limit={limit} retentionDays={days} busy={busy}
      onClose={() => setBoxOpen(false)} onResume={draft => { setBoxOpen(false); setPrompt(draft); }} onDelete={setDeleting} />
      {prompt && <FormConfirmation mobile={mobile} title="载入暂存数据" content={`当前表单存在 ${formatPresentationTime(prompt.updatedAt, timeZone)} 暂存但未提交的数据。载入后将替换当前填写内容。`}
        confirmText="载入草稿" onClose={() => setPrompt(undefined)} onConfirm={() => resume(prompt)} />}
      {deleting && <FormConfirmation mobile={mobile} title="删除草稿" content="删除后无法恢复这份草稿。" confirmText="删除草稿" onClose={() => setDeleting(undefined)} onConfirm={() => void remove(deleting)} />}
    </>,
  };
}
