import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Modal, Space, Typography } from 'antd';
import type { WorkflowTaskDraft, WorkflowTaskDraftList, WorkflowTaskDraftReference, WorkflowTaskDraftSave } from 'openxiangda-contracts/browser';
import { workflowTaskPageFieldState } from 'openxiangda-contracts/browser';
import { loadWorkflowTaskDrafts, removeWorkflowTaskDraft, saveWorkflowTaskDraft } from '../../platform-client';
import { workflowLaunchContractJsonEqual } from '../../workflow-launch';
import { SurfaceFieldValue } from '../resource/SurfaceFields';
import type { useWorkflowTaskForm } from './WorkflowTaskForm';

type DraftWire = { kind: 'save'; input: WorkflowTaskDraftSave } | { kind: 'delete'; input: WorkflowTaskDraftReference };
const failureMessage = (error: unknown) => error instanceof Error ? error.message : '请稍后重试';

/** Only a known platform refusal releases the pending write; transport errors stay unknown. */
export function workflowTaskDraftWasRejected(error: unknown) {
  const value = error as { status?: number; code?: string };
  return Boolean(value?.status && value.status >= 400 && value.status < 500 && ![408, 429].includes(value.status) &&
    /^(OPENXIANGDA_(TASK_DRAFT|FORM_DRAFT|NATIVE_|CURRENT_USER_)|WORKFLOW_(TASK_|V2_))/.test(value.code || ''));
}

export function workflowTaskDraftConfirmsSave(saved: WorkflowTaskDraft, input: WorkflowTaskDraftSave) {
  return saved.id === input.id && saved.revision === input.expectedRevision + 1 &&
    saved.recordRevision === input.recordRevision && workflowLaunchContractJsonEqual(saved.values, input.values);
}

/** Presentation state only. The platform owns qualification, storage, CAS and consumption. */
export function WorkflowTaskDraftPanel({ controller, taskId, disabled, variant, resourceCode, recordId, onBusyChange, onRefresh }: {
  controller: ReturnType<typeof useWorkflowTaskForm>;
  taskId: string;
  disabled: boolean;
  variant: 'desktop' | 'mobile';
  resourceCode?: string;
  recordId?: string;
  onBusyChange?: (busy: boolean) => void;
  onRefresh?: () => Promise<void>;
}) {
  const { modal, message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<WorkflowTaskDraftList | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<DraftWire | null>(null);
  const [failure, setFailure] = useState('');
  const inFlight = useRef(false);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    busyCallback.current?.(busy || Boolean(pending));
    return () => busyCallback.current?.(false);
  }, [busy, pending]);

  const settled = (wire: DraftWire, receipt?: WorkflowTaskDraft) => {
    if (wire.kind === 'save' && receipt) controller.savedDraft(receipt);
    else if (wire.kind === 'delete') controller.removedDraft(wire.input.id);
    setPending(null);
    setFailure('');
    setList(null);
    message.success(wire.kind === 'save' ? '已保存私有草稿，仅本人可见' : '私有草稿已删除，当前输入仍保留');
  };
  const send = async (wire: DraftWire) => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setFailure(''); setPending(wire);
    try {
      if (wire.kind === 'save') settled(wire, await saveWorkflowTaskDraft(taskId, wire.input));
      else { await removeWorkflowTaskDraft(taskId, wire.input); settled(wire); }
    } catch (error) {
      const rejected = workflowTaskDraftWasRejected(error);
      setFailure(rejected ? `草稿操作被拒绝，当前输入已保留。${failureMessage(error)}` : `草稿操作结果待确认，已保留原请求。${failureMessage(error)}`);
      if (rejected) {
        setPending(null);
        if ((error as { code?: string }).code === 'OPENXIANGDA_TASK_DRAFT_RECORD_REVISION_CONFLICT')
          await onRefresh?.().catch(() => undefined);
      }
    } finally { inFlight.current = false; setBusy(false); }
  };
  const save = async (createNew = false) => {
    if (inFlight.current || disabled || pending || controller.stale) return;
    try {
      const form = await controller.build(false);
      if (!form) return;
      const saved = !createNew && controller.draft;
      await send({ kind: 'save', input: {
        id: saved ? saved.id : crypto.randomUUID(), expectedRevision: saved ? saved.revision : 0,
        recordRevision: form.expectedRevision, values: JSON.parse(JSON.stringify(form.values)),
      } });
    } catch (error) { setFailure(failureMessage(error)); }
  };
  const read = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setFailure('');
    try {
      const result = await loadWorkflowTaskDrafts(taskId);
      setList(result);
      if (pending?.kind === 'save') {
        const saved = result.items.find(item => workflowTaskDraftConfirmsSave(item, pending.input));
        if (saved) { settled(pending, saved); setList(result); }
        else setFailure('尚未核对到原保存结果。当前输入已保留，可重试原请求；不会自动采用其他修订。');
      } else if (pending?.kind === 'delete' && ![...result.items, ...result.incompatibleItems].some(item => item.id === pending.input.id)) {
        settled(pending); setList(result);
      }
    } catch (error) { setFailure(`我的草稿读取失败，当前输入已保留。${failureMessage(error)}`); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const adopt = (saved: WorkflowTaskDraft) => {
    const source = controller.latest;
    if (!source || pending || disabled) return;
    const changed = saved.recordRevision !== source.expectedRevision;
    const values = { ...source.values, ...saved.values };
    const fields = workflowTaskPageFieldState(source.page, values).filter(field => field.visible && !field.readonly && Object.hasOwn(saved.values, field.code));
    modal.confirm({ title: '采用这份私有草稿？', okText: '确认采用', cancelText: '保留当前输入',
      content: <div className="oxa-workflow-draft-review">
        <p>采用后会替换当前填写的输入。{changed ? '业务资料已更新，采用后请核对并再次保存草稿。' : '正式提交时仍会重新校验业务资料和任务资格。'}</p>
        {fields.map(field => <div className="oxa-workflow-task-value-review" key={field.code}>
          <strong>{source.fields[field.code]?.label || field.code}</strong>
          <div><span>当前业务资料</span><SurfaceFieldValue field={{ ...source.fields[field.code]!, key: field.code }} value={source.values[field.code]} resourceCode={resourceCode} workflowFileBinding={resourceCode && recordId ? { taskId, resourceCode, recordId, fieldCode: field.code } : undefined} mobile={variant === 'mobile'} /></div>
          <div><span>本人草稿</span><SurfaceFieldValue field={{ ...source.fields[field.code]!, key: field.code }} value={saved.values[field.code]} resourceCode={resourceCode} workflowFileBinding={resourceCode && recordId ? { taskId, resourceCode, recordId, fieldCode: field.code } : undefined} mobile={variant === 'mobile'} /></div>
        </div>)}
      </div>,
      onOk: () => { controller.adoptDraft(saved); setOpen(false); setFailure(''); },
    });
  };
  return <div className="oxa-workflow-task-drafts" aria-label="任务私有草稿">
    <Typography.Paragraph type="secondary">私有草稿仅本人可见，暂存不会更新业务资料或推进流程。</Typography.Paragraph>
    <Space wrap>
      <Button disabled={disabled || busy || Boolean(pending) || controller.stale} loading={busy && pending?.kind === 'save'} onClick={() => void save()}>保存私有草稿</Button>
      <Button disabled={disabled || busy} onClick={() => { setOpen(true); void read(); }}>我的草稿</Button>
      {controller.draft && <Button type="text" disabled={disabled || busy || Boolean(pending) || controller.stale} onClick={() => void save(true)}>另存草稿</Button>}
    </Space>
    {controller.draft && !pending && <Typography.Paragraph type="secondary">
      已采用本人草稿 · {new Date(controller.draft.updatedAt).toLocaleString()} · {controller.unsaved ? '当前有新输入，尚未暂存' : '当前输入已暂存'}
    </Typography.Paragraph>}
    {controller.draftNeedsSave && <Alert showIcon type="warning" title="草稿的业务基线已变化" description="请核对当前资料并再次保存私有草稿，再提交任务。" />}
    {failure && <Alert showIcon type={pending ? 'warning' : 'error'} title={pending ? '草稿结果待确认' : '草稿操作未完成'} description={failure}
      action={pending && <Space wrap><Button disabled={disabled || busy} onClick={() => void read()}>核对原草稿</Button>
        <Button disabled={disabled || busy} onClick={() => void send(pending)}>重试原草稿请求</Button></Space>} />}
    <Modal open={open} title="我的任务私有草稿" footer={<Button disabled={busy} onClick={() => setOpen(false)}>关闭</Button>}
      onCancel={() => setOpen(false)} width={600}>
      <Typography.Paragraph type="secondary">仅显示本人在当前任务保存的草稿；采用前会核对。最多{list?.limit || 20}份，保留{list?.retentionDays || 90}天。</Typography.Paragraph>
      <Button loading={busy} disabled={disabled || busy} onClick={() => void read()}>重新读取草稿</Button>
      {list && !list.items.length && !list.incompatibleItems.length && <Empty description="当前任务还没有私有草稿" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      {list?.items.map(saved => <div key={saved.id} className="oxa-workflow-draft-row">
        <div><strong>{new Date(saved.updatedAt).toLocaleString()}</strong><Typography.Paragraph type="secondary">
          草稿修订 {saved.revision} · {saved.recordRevision === controller.latest?.expectedRevision ? '业务基线一致' : '业务资料已更新，需核对'}
        </Typography.Paragraph></div>
        <Space wrap><Button disabled={disabled || busy || Boolean(pending)} onClick={() => adopt(saved)}>查看并采用</Button>
          <Button danger type="text" disabled={disabled || busy || Boolean(pending)} onClick={() => modal.confirm({ title: '删除这份私有草稿？',
            content: '当前填写的输入仍会保留。', okText: '删除草稿', cancelText: '保留草稿',
            onOk: () => send({ kind: 'delete', input: { id: saved.id, expectedRevision: saved.revision } }) })}>删除</Button></Space>
      </div>)}
      {list?.incompatibleItems.map(saved => <Alert key={saved.id} type="warning" title={`草稿修订 ${saved.revision} 与当前页面不兼容`} description={saved.errorCode} />)}
    </Modal>
  </div>;
}
