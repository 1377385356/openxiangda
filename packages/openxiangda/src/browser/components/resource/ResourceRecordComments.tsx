import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Space } from 'antd';
import type { DataRecordCommentPage } from 'openxiangda-contracts/browser';
import { useRuntime } from '../../runtime';
import { useUnsavedChangesGuard } from '../../navigation-guard';
import { createNativeRecordComment, loadNativeRecordCommentReceipt, loadNativeRecordComments, OpenXiangdaPlatformRequestError } from '../../platform-client';
import { usePresentationTimeZone } from '../../presentation-time';
import { detailTime } from './RecordDetailFrame';
import { createRecordCommentSession, type RecordCommentState } from './record-comment-session';

export function RecordCommentList({ data, timeZone }: { data: DataRecordCommentPage; timeZone?: string }) {
  return data.items.length ? <ol className="oxa-record-comments-list">{data.items.map(comment => <li key={comment.id}>
    <div><strong>{comment.isOwn ? '我' : comment.authorUserId}</strong><time dateTime={comment.createdAt}>{detailTime(comment.createdAt, timeZone)}</time></div>
    <p>{comment.body}</p>
  </li>)}</ol> : <p className="oxa-record-comments-empty">暂无评论</p>;
}

/** The key remount drops late responses and drafts across record or authority changes. */
export function ResourceRecordComments(props: { resourceCode: string; recordId: string; canRead?: boolean; canCreate?: boolean }) {
  const { identity, identityEpoch, perspective } = useRuntime();
  const key = JSON.stringify([props.resourceCode, props.recordId, identityEpoch, identity.userId,
    identity.environment.headRevision, identity.environment.authzRevisionId, identity.environment.authzVersion,
    identity.environment.scopeDataVersion, perspective?.code, props.canRead, props.canCreate]);
  return <RecordCommentsBody key={key} {...props} />;
}

function RecordCommentsBody({ resourceCode, recordId, canRead = true, canCreate = false }: {
  resourceCode: string; recordId: string; canRead?: boolean; canCreate?: boolean;
}) {
  const inputId = useId();
  const timeZone = usePresentationTimeZone();
  const [draft, setDraft] = useState('');
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState<{ key: string; data?: DataRecordCommentPage; error?: unknown }>({ key: '' });
  const pageKey = JSON.stringify([cursor, reload]);
  const [mutation, setMutation] = useState<RecordCommentState>({ busy: false });
  const session = useRef<ReturnType<typeof createRecordCommentSession> | null>(null);
  useUnsavedChangesGuard({ when: Boolean(draft || mutation.pending), preventNavigation: mutation.busy || Boolean(mutation.pending),
    message: mutation.pending ? '评论提交结果尚待确认，请先核对原请求。' : '评论尚未提交，离开后将丢失。' });
  useLayoutEffect(() => {
    const current = createRecordCommentSession(
      input => createNativeRecordComment(resourceCode, recordId, input),
      key => loadNativeRecordCommentReceipt(resourceCode, recordId, key),
      state => {
        setMutation(state);
        if (state.receipt) { setDraft(''); setCursors([undefined]); setReload(value => value + 1); }
      });
    session.current = current;
    return () => { current.close(); if (session.current === current) session.current = null; };
  }, [resourceCode, recordId]);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setPage({ key: pageKey });
    void loadNativeRecordComments(resourceCode, recordId, { limit: 20, cursor })
      .then(data => { if (active) setPage({ key: pageKey, data }); })
      .catch(error => { if (active) setPage({ key: pageKey, error }); });
    return () => { active = false; };
  }, [resourceCode, recordId, cursor, pageKey, canRead]);
  useEffect(() => {
    if (!draft && !mutation.pending) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [draft, mutation.pending]);
  const data = page.key === pageKey ? page.data : undefined;
  const error = page.key === pageKey ? page.error : undefined;
  const status = error instanceof OpenXiangdaPlatformRequestError ? error.status : 0;
  const errorText = status === 403 ? '当前用户无权查看此申请的评论。' : status === 404
    ? '申请不存在或不在可查看范围内。' : '评论读取失败，请重新读取。';
  return <section className="oxa-record-comments" aria-label="资料评论">
    {canRead && <div aria-busy={!data && !error}>
      {error ? <Alert type="error" title={errorText} action={<Button onClick={() => setReload(value => value + 1)}>重新读取</Button>} />
        : data ? <RecordCommentList data={data} timeZone={timeZone} /> : <p role="status">正在读取评论…</p>}
      {data && <nav aria-label="评论分页"><Button disabled={cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>上一页</Button>
        <span>第 {cursors.length} 页</span><Button disabled={!data.nextCursor} onClick={() => setCursors(value => [...value, data.nextCursor!])}>下一页</Button>
        <Button onClick={() => { setCursors([undefined]); setReload(value => value + 1); }}>刷新</Button></nav>}
    </div>}
    {canCreate && <form onSubmit={event => { event.preventDefault(); void session.current?.send(draft); }}>
      <label htmlFor={inputId}>添加评论</label>
      <Input.TextArea id={inputId} value={draft} onChange={event => setDraft(event.target.value)}
        maxLength={4000} showCount autoSize={{ minRows: 3, maxRows: 8 }} disabled={mutation.busy || Boolean(mutation.pending)} />
      {mutation.unknown ? <Alert type="warning" title="提交结果尚未确认" description={<>
        <p>先核对原请求，再继续评论。离开后可保留下面的请求编号和正文，用于恢复结果。</p>
        <details><summary>原请求</summary><code>{mutation.pending?.idempotencyKey}</code><p className="oxa-record-comments-pending">{mutation.pending?.body}</p></details>
        <Space wrap><Button loading={mutation.busy} disabled={mutation.busy} onClick={() => void session.current?.recover()}>核对提交结果</Button>
          {mutation.retryAllowed && <Button disabled={mutation.busy} onClick={() => void session.current?.retry()}>用原请求重试</Button>}</Space>
      </>} /> : mutation.error ? <Alert type="error" title="评论未提交" description={mutation.error instanceof Error ? mutation.error.message : '请重新读取申请与权限后再试。'} />
        : mutation.receipt ? <p role="status">评论已提交</p> : null}
      <Button htmlType="submit" type="primary" loading={mutation.busy} disabled={!draft.trim() || Boolean(mutation.pending)}>发表评论</Button>
    </form>}
  </section>;
}
