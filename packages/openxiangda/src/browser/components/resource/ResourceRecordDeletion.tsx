import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Space } from 'antd';
import { useRuntime } from '../../runtime';
import { useUnsavedChangesGuard } from '../../navigation-guard';
import { deleteNativeRecordWithPreview, previewNativeRecordDeletion, recoverNativeRecordDeletion } from '../../platform-client';
import { createRecordDeletionSession, type RecordDeletionState } from './record-deletion-session';

export function ResourceRecordDeletion(props: { resourceCode: string; recordId: string; onClose: () => void; onDeleted?: () => void }) {
  const { identity, identityEpoch } = useRuntime();
  const key = JSON.stringify([props.resourceCode, props.recordId, identityEpoch, identity.userId, identity.environment.headRevision,
    identity.environment.authzRevisionId, identity.environment.authzVersion, identity.environment.scopeDataVersion]);
  return <RecordDeletionBody key={key} {...props} />;
}

function RecordDeletionBody({ resourceCode, recordId, onClose, onDeleted }: {
  resourceCode: string; recordId: string; onClose: () => void; onDeleted?: () => void;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [state, setState] = useState<RecordDeletionState>({ busy: false });
  const session = useRef<ReturnType<typeof createRecordDeletionSession> | null>(null);
  const protectedRequest = state.busy || Boolean(state.pending);
  useUnsavedChangesGuard({ when: !state.receipt?.deleted && Boolean(reason || state.pending), preventNavigation: protectedRequest,
    message: state.pending ? '删除结果尚待确认，请先核对原请求。' : '删除尚未确认，离开后将丢失填写的原因。' });
  useLayoutEffect(() => {
    const current = createRecordDeletionSession(() => previewNativeRecordDeletion(resourceCode, recordId),
      input => deleteNativeRecordWithPreview(resourceCode, recordId, input), input => recoverNativeRecordDeletion(resourceCode, recordId, input), setState);
    session.current = current;
    return () => { current.close(); if (session.current === current) session.current = null; };
  }, [resourceCode, recordId]);
  const preview = state.preview;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!preview?.expiresAt) return;
    const remaining = Date.parse(preview.expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timeout = setTimeout(() => setNow(Date.now()), remaining + 1);
    return () => clearTimeout(timeout);
  }, [preview]);
  const expired = Boolean(preview?.expiresAt && Date.parse(preview.expiresAt) <= now);
  const blocked = preview?.blocker === 'pending_launch' ? '申请的流程正在启动或等待恢复，请先完成处理。'
    : preview?.blocker === 'multiple_workflows' ? '此申请关联多个流程，请由流程管理员核对后处理。'
    : '申请明细关联其他流程，请先核对这些流程。';
  const done = state.receipt?.deleted;
  const finish = () => { onClose(); onDeleted?.(); };
  return <Modal open title={done ? '资料已删除' : '删除资料'} width="min(560px, calc(100vw - 32px))"
    rootClassName="oxa-record-deletion-modal" mask={{ closable: !protectedRequest }} keyboard={!protectedRequest}
    closable={!protectedRequest} onCancel={done ? finish : onClose} footer={done
      ? <Button type="primary" onClick={finish}>返回列表</Button>
      : <Space wrap><Button disabled={protectedRequest} onClick={onClose}>取消</Button>
        {!state.pending && <Button disabled={!reason.trim() || state.busy} loading={state.busy} onClick={() => void session.current?.preview()}>预览删除影响</Button>}
        {preview?.canCommit && !state.pending && <Button danger type="primary" disabled={state.busy || !reason.trim() || expired}
          onClick={() => void session.current?.confirm(reason)}>确认删除</Button>}</Space>}>
    {done ? <Alert type="success" title="申请与关联明细已删除" description="如有关联流程，其待办已停止，流程入口已关闭。" /> : <>
      <p>删除后将无法通过申请和流程入口查看这些资料。请先填写原因并核对影响。</p>
      <label htmlFor={reasonId}>删除原因</label>
      <Input.TextArea id={reasonId} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000}
        showCount autoSize={{ minRows: 3, maxRows: 6 }} disabled={protectedRequest} />
      {preview && <section className="oxa-record-deletion-impact" aria-label="删除影响">
        <p>{preview.canCommit ? '将删除' : '涉及'} <strong>{preview.resourceName}</strong> 的这条资料及关联明细，共 <strong>{preview.affectedRecords}</strong> 条。</p>
        {preview.workflowCount > 0 && <p>涉及 <strong>{preview.workflowCount}</strong> 个流程{preview.canCommit
          ? <>，将停止 <strong>{preview.cancelledTaskCount}</strong> 个待办，办理历史入口也会关闭。</>
          : '，请先核对流程关联。'}</p>}
        {!preview.canCommit && <Alert type="warning" title="当前无法删除" description={blocked} />}
        {preview.canCommit && expired && <Alert type="warning" title="预览已到期，请重新预览" />}
      </section>}
      {state.unknown ? <Alert type="warning" title="删除结果尚待确认" description={<>
        <p>请先核对原请求，避免重复操作。请求编号：<code>{state.pending?.idempotencyKey}</code></p>
        <Space wrap><Button loading={state.busy} disabled={state.busy} onClick={() => void session.current?.recover()}>核对删除结果</Button>
          {state.retryAllowed && <Button disabled={state.busy || expired} onClick={() => void session.current?.retry()}>用原请求重试</Button>}</Space>
      </>} /> : state.error || state.receipt && !state.receipt.deleted
        ? <Alert type="error" title="资料未删除，请重新核对" description="权限、资料或流程可能已变化。重新预览后再进行删除。" /> : null}
    </>}
  </Modal>;
}
