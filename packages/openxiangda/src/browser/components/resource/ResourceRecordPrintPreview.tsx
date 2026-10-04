import { Alert, Button, Modal, Spin } from 'antd';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DataRecordPrint } from 'openxiangda-contracts/browser';
import { loadNativeRecordPrint, OpenXiangdaPlatformRequestError } from '../../platform-client';
import { useRuntime } from '../../runtime';
import { usePresentationTimeZone } from '../../presentation-time';
import { detailTime } from './RecordDetailFrame';
import { createRecordPrintSession, type RecordPrintState } from './record-print-session';

type PrintField = DataRecordPrint['fields'][number];

/** Print plain data. Files stay names, and rich text never becomes executable markup. */
export function recordPrintFieldText(field: PrintField, value: unknown, timeZone?: string): string {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '—';
  if (Array.isArray(value)) return value.map(item => recordPrintFieldText(field, item, timeZone)).join('、');
  if (field.type === 'boolean') return value === true ? '是' : value === false ? '否' : String(value);
  if (field.type === 'datetime') return detailTime(value, timeZone) || String(value);
  if (field.type === 'text.rich' && typeof value === 'string' && typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(value, 'text/html');
    document.querySelectorAll('script,style,template').forEach(node => node.remove());
    document.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    document.querySelectorAll('p,div,li,h1,h2,h3,blockquote').forEach(node => node.append('\n'));
    return document.body.textContent?.trim() || '—';
  }
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if (field.type === 'option.single' || field.type === 'option.multiple')
      return field.options?.find(option => option.value === item.value)?.label || String(item.label || item.value || '—');
    if (field.type === 'file' || field.type === 'image') {
      const bytes = typeof item.size === 'number' ? item.size : typeof item.fileSize === 'number' ? item.fileSize : null;
      return `${String(item.name || item.fileName || '附件')}${bytes != null ? `（${bytes} 字节）` : ''}`;
    }
    if (field.type === 'signature') return `签名记录${item.signedAt ? ` · ${detailTime(item.signedAt, timeZone)}` : ''}`;
    if (field.type === 'date-range' || field.type === 'datetime-range')
      return [item.start, item.end].map(value => field.type === 'datetime-range' ? detailTime(value, timeZone) : String(value || '')).join(' 至 ');
    if (field.type === 'address') return String(item.fullAddress || [item.country, item.province, item.city, item.district, item.street, item.detail]
      .map(part => part && typeof part === 'object' ? (part as Record<string, unknown>).label || '' : part || '').join(''));
    if (field.type === 'location') return String(item.name || item.address || `${item.longitude}, ${item.latitude}`);
    if ('label' in item || 'displayName' in item) return String(item.label || item.displayName || item.value || '—');
    return JSON.stringify(value);
  }
  const option = field.options?.find(item => String(item.value) === String(value));
  return option?.label || String(value);
}

export function ResourceRecordPrintDocument({ snapshot, timeZone }: { snapshot: DataRecordPrint; timeZone?: string }) {
  const groups = new Map<string, PrintField[]>();
  snapshot.fields.forEach(field => { const title = field.section || '基本信息'; groups.set(title, [...(groups.get(title) || []), field]); });
  return <article className="oxa-record-print-document" aria-label={`${snapshot.resourceName}打印资料`}>
    <header><h1>{snapshot.viewName || snapshot.resourceName}</h1><p>资料读取于 {detailTime(snapshot.preparedAt, timeZone)}</p></header>
    {[...groups].map(([title, fields]) => <section key={title}><h2>{title}</h2><dl>{fields.map(field => <div key={field.code}
      className={['text.long', 'text.rich', 'file', 'image', 'json.object', 'json.array'].includes(field.type) ? 'is-wide' : undefined}>
      <dt>{field.label}</dt><dd>{recordPrintFieldText(field, snapshot.data[field.code], timeZone)}</dd>
    </div>)}</dl></section>)}
  </article>;
}

export function ResourceRecordPrintPreview({ resourceCode, recordId, viewCode, onClose }: {
  resourceCode: string; recordId: string; viewCode?: string; onClose: () => void;
}) {
  const { identity, identityEpoch, perspective } = useRuntime();
  const timeZone = usePresentationTimeZone();
  const key = JSON.stringify([resourceCode, recordId, viewCode, identityEpoch, identity.userId,
    identity.environment.headRevision, identity.environment.authzRevisionId, identity.environment.authzVersion, identity.environment.scopeDataVersion, perspective?.code]);
  const [state, setState] = useState<RecordPrintState & { key: string }>({ busy: true, key: '' });
  const [host, setHost] = useState<HTMLDivElement>();
  useEffect(() => {
    const element = document.createElement('div');
    element.className = 'oxa-record-print-host';
    document.body.append(element); setHost(element);
    return () => { element.remove(); };
  }, []);
  const session = useRef<ReturnType<typeof createRecordPrintSession>>(undefined);
  useLayoutEffect(() => {
    const current = createRecordPrintSession(
      () => loadNativeRecordPrint(resourceCode, recordId, { viewCode }),
      next => setState({ ...next, key }),
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      () => window.print(),
    );
    session.current = current;
    void current.read();
    return () => { current.close(); if (session.current === current) session.current = undefined; };
  }, [key, resourceCode, recordId, viewCode]);
  const close = () => { session.current?.close(); onClose(); };
  const data = state.key === key ? state.data : undefined;
  const error = state.key === key ? state.error : undefined;
  const busy = state.key !== key || state.busy;
  const status = error instanceof OpenXiangdaPlatformRequestError ? error.status : 0;
  const errorMessage = status === 403 ? '当前用户无权打印此资料。'
    : status === 404 ? '资料不存在或已无法访问。'
    : status === 409 ? '此详情包含暂不支持打印的内容，请联系应用管理员。'
    : status === 413 ? '资料超过本页打印容量，请联系应用管理员。'
    : '打印资料读取失败，请重试。';
  if (!host) return null;
  return <Modal open title="打印预览" getContainer={host} width="min(900px, calc(100vw - 24px))" onCancel={close}
    footer={<><Button disabled={busy} onClick={() => void session.current?.read()}>重新读取</Button><Button onClick={close}>关闭</Button>
      <Button type="primary" disabled={!data || busy} loading={busy && Boolean(data)} onClick={() => void session.current?.read(true)}>打印</Button></>}>
    <div className="oxa-record-print" aria-busy={busy}>
      {error ? <Alert type="error" showIcon title={errorMessage} action={<Button onClick={() => void session.current?.read()}>重试</Button>} />
        : data ? <ResourceRecordPrintDocument snapshot={data} timeZone={timeZone} /> : <div className="oxa-record-print-loading"><Spin /><p>正在读取可打印资料…</p></div>}
    </div>
  </Modal>;
}
