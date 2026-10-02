import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Space } from 'antd';
import type { DataFileRef } from 'openxiangda-contracts/browser';
import { completeWorkflowTaskFileUpload, initiateWorkflowTaskFileUpload, loadWorkflowTaskFileUploadPlan } from '../../platform-client';
import { assertWorkflowTaskFileUploadPlan, runWorkflowTaskFileUpload, type WorkflowTaskFileUploadIntent, type WorkflowTaskFileUploadTransport } from '../../workflow-task-file-upload';
import type { SurfaceField } from '../resource/SurfaceFields';
import type { useWorkflowTaskForm } from './WorkflowTaskForm';
import { workflowTaskDraftWasRejected } from './WorkflowTaskDraftPanel';

const transport: WorkflowTaskFileUploadTransport = {
  initiate: initiateWorkflowTaskFileUpload, read: loadWorkflowTaskFileUploadPlan, complete: completeWorkflowTaskFileUpload,
  put: async (plan, file) => {
    const response = await fetch(plan.uploadUrl, { method: plan.uploadMethod, headers: plan.headers, body: file, credentials: 'omit' });
    if (!response.ok) throw new Error(`文件字节上传未确认（HTTP ${response.status}），可恢复原上传。`);
  },
};

/** One active upload per task form; only transient presentation state is held here. */
export function useWorkflowTaskFiles({ taskId, controller, onBusyChange }: {
  taskId?: string;
  controller: ReturnType<typeof useWorkflowTaskForm>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { message } = App.useApp();
  type FieldUploadIntent = WorkflowTaskFileUploadIntent & { onRecovered?: (file: DataFileRef) => void };
  const intent = useRef<FieldUploadIntent | null>(null);
  const completed = useRef(new WeakMap<File, DataFileRef>());
  const inFlight = useRef<FieldUploadIntent | null>(null);
  const active = useRef(true);
  const currentTask = useRef(taskId); currentTask.current = taskId;
  const [pending, setPending] = useState<FieldUploadIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const callback = useRef(onBusyChange); callback.current = onBusyChange;
  useEffect(() => { callback.current?.(Boolean(pending)); return () => callback.current?.(false); }, [pending]);
  useEffect(() => { active.current = true; return () => { active.current = false; intent.current = null; }; }, []);
  useEffect(() => {
    intent.current = null; completed.current = new WeakMap(); inFlight.current = null;
    setPending(null); setBusy(false); setFailure('');
  }, [taskId]);
  const settle = (wire: FieldUploadIntent, file: DataFileRef, adopt: boolean) => {
    if (!active.current || currentTask.current !== wire.taskId || intent.current !== wire) return false;
    if (adopt) {
      if (wire.onRecovered) wire.onRecovered(file);
      else {
        const code = wire.input.fieldCode;
        const refs = controller.form.getFieldValue(code);
        controller.form.setFieldValue(code, [...(Array.isArray(refs) ? refs.filter((ref: DataFileRef) => ref.id !== file.id) : []), file]);
      }
    }
    completed.current.set(wire.file, file);
    intent.current = null; setPending(null); setFailure('');
    return true;
  };
  const run = async (wire: FieldUploadIntent, recovery: boolean) => {
    if (inFlight.current) throw new Error('请等待原文件上传结果。');
    inFlight.current = wire; setBusy(true); setFailure('');
    try {
      const file = await runWorkflowTaskFileUpload(wire, transport, recovery);
      settle(wire, file, recovery);
      return file;
    } catch (error) {
      const rejected = workflowTaskDraftWasRejected(error);
      if (active.current && currentTask.current === wire.taskId && intent.current === wire) {
        setFailure(`${rejected ? '文件上传被拒绝，已有输入保留。' : '文件上传结果待确认，原文件与请求已保留。'}${error instanceof Error ? error.message : String(error)}`);
        if (rejected) { intent.current = null; setPending(null); }
      }
      throw error;
    } finally {
      if (inFlight.current === wire) { inFlight.current = null; if (active.current && currentTask.current === wire.taskId) setBusy(false); }
    }
  };
  const upload = async (field: SurfaceField, file: File, _recordId?: string, onRecovered?: (file: DataFileRef) => void): Promise<DataFileRef> => {
    if (!taskId) throw new Error('当前任务尚未就绪。');
    const ready = completed.current.get(file); if (ready) return ready;
    if (intent.current) throw new Error('请先确认原文件上传结果，再选择下一个文件。');
    if (!['file', 'image'].includes(field.type) && !onRecovered) throw new Error('该字段需要保留完整值的上传恢复回调。');
    const current = controller.form.getFieldValue(field.key);
    if (['file', 'image'].includes(field.type) && Array.isArray(current) && current.length >= (field.maxCount ?? 1)) {
      const text = `最多 ${field.maxCount ?? 1} 个文件，请先移除已有引用。`;
      setFailure(text);
      throw new Error(text);
    }
    const wire: FieldUploadIntent = { taskId, file, phase: 'initiate', onRecovered, input: {
      id: crypto.randomUUID(), fieldCode: field.key, fileName: file.name, fileSize: file.size, contentType: file.type,
    } };
    intent.current = wire; setPending(wire);
    return run(wire, false);
  };
  const recover = async (readOnly: boolean) => {
    const wire = intent.current; if (!wire || inFlight.current) return;
    if (!readOnly) { await run(wire, true).catch(() => undefined); return; }
    inFlight.current = wire; setBusy(true);
    try {
      const plan = await transport.read(wire.taskId, wire.input.id);
      assertWorkflowTaskFileUploadPlan(wire, plan);
      if (plan.state === 'ready') { if (settle(wire, plan.file, true)) message.success('原文件已完成，已加入当前输入。'); }
      else if (active.current && currentTask.current === wire.taskId && intent.current === wire) setFailure('原文件尚未完成。当前输入与文件已保留，可重试原上传。');
    } catch (error) {
      if (active.current && currentTask.current === wire.taskId && intent.current === wire) setFailure(`原上传核对未完成。${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
      if (inFlight.current === wire) { inFlight.current = null; if (active.current && currentTask.current === wire.taskId) setBusy(false); }
    }
  };
  return { upload, pending, busy, failure, recover };
}

export function WorkflowTaskFileRecovery({ files }: { files: ReturnType<typeof useWorkflowTaskFiles> }) {
  if (!files.pending && !files.failure) return null;
  return <Alert showIcon type={files.pending ? 'warning' : 'error'}
    title={files.busy ? '文件上传中' : files.pending ? '文件上传结果待确认' : '文件未上传'}
    description={files.failure || '文件完成前，暂不能提交任务或保存草稿。'}
    action={files.pending && <Space wrap>
      <Button disabled={files.busy} onClick={() => void files.recover(true)}>核对原上传</Button>
      <Button disabled={files.busy} onClick={() => void files.recover(false)}>重试原上传</Button>
    </Space>} />;
}
