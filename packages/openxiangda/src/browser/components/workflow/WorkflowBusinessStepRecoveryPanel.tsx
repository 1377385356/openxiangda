import { createBrowserUuid } from '../../uuid';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Input, Select, Space, Spin } from 'antd';
import type { WorkflowBusinessStepRecoveryOptions, WorkflowBusinessStepRecoveryPreview } from 'openxiangda-contracts/browser';
import { loadWorkflowBusinessStepRecovery, previewWorkflowBusinessStepRecovery, executeWorkflowBusinessStepRecovery, OpenXiangdaPlatformRequestError } from '../../platform-client';

export interface WorkflowBusinessStepRecoveryDraftState { dirty: boolean; busy: boolean; unknown: boolean }
export interface WorkflowBusinessStepRecoveryPanelProps {
  instanceId: string;
  onCompleted?: () => void | Promise<void>;
  /** Keep the panel mounted during an uncertain write using the host's navigation owner. */
  onDraftStateChange?: (state: WorkflowBusinessStepRecoveryDraftState) => void;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Shared administrator repair; the server owns authority, CAS, state and audit. */
export function WorkflowBusinessStepRecoveryPanel({ instanceId, onCompleted, onDraftStateChange }: WorkflowBusinessStepRecoveryPanelProps) {
  const [options, setOptions] = useState<WorkflowBusinessStepRecoveryOptions>();
  const [preview, setPreview] = useState<WorkflowBusinessStepRecoveryPreview>();
  const [reason, setReason] = useState('');
  const [selectedExecution,setSelectedExecution] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [reload, setReload] = useState(0);
  const request = useRef<{ commandToken: string; idempotencyKey: string; input: { reason: string } } | undefined>(undefined);
  const generation = useRef(0);
  const steps = options?.businessSteps || (options?.businessStep ? [options.businessStep] : []);
  const selectedStep = steps.find(step => step.executionId === selectedExecution) || steps[0];
  const recovery = selectedStep?.status === 'result_stale_inputs' ? selectedStep.mode === 'pure' ? 'recompute' : 'apply_stored' : 'continue';
  const recoverable = ['result_ready','result_stale_inputs'].includes(selectedStep?.status || '');
  const dirty = Boolean(reason.trim() || preview || unknown);
  useEffect(() => {
    onDraftStateChange?.({ dirty, busy, unknown });
    return () => onDraftStateChange?.({ dirty: false, busy: false, unknown: false });
  }, [dirty, busy, unknown, onDraftStateChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy]);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setBusy(false); setOptions(undefined); setPreview(undefined); request.current = undefined; setError('');
    loadWorkflowBusinessStepRecovery(instanceId).then(value => { if (current === generation.current) setOptions(value); }).catch(e => { if (current === generation.current) setError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [instanceId, reload]);
  const prepare = async () => {
    if (busy || unknown || !reason.trim()) return;
    const current = generation.current;
    setBusy(true); setError(''); setRefreshError('');
    try {
      const value = await previewWorkflowBusinessStepRecovery(instanceId,selectedStep ? { executionId: selectedStep.executionId,recovery } : {});
      if (current !== generation.current) return;
      setPreview(value);
      request.current = value.commandToken ? { commandToken: value.commandToken, idempotencyKey: `step-recovery:${createBrowserUuid()}`, input: { reason: reason.trim() } } : undefined;
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const commit = async () => {
    if (busy || !request.current || !preview?.canCommit) return;
    const current = generation.current, recovering = unknown;
    setBusy(true); setError('');
    try {
      await executeWorkflowBusinessStepRecovery(instanceId, request.current);
    } catch (e) {
      if (current !== generation.current) return;
      setError(errorText(e));
      if (!recovering && e instanceof OpenXiangdaPlatformRequestError && e.status >= 400 && e.status < 500) {
        setPreview(undefined); request.current = undefined;
      } else setUnknown(true);
      setBusy(false);
      return;
    }
    if (current !== generation.current) return;
    setUnknown(false); setPreview(undefined); request.current = undefined; setReason('');
    // A host refresh failure must not turn a confirmed command into an unknown write.
    try { await onCompleted?.(); }
    catch (e) { if (current === generation.current) setRefreshError(errorText(e)); }
    finally { if (current === generation.current) { setBusy(false); setReload(value => value + 1); } }
  };
  return <section aria-label="业务步骤恢复"><Space orientation="vertical" style={{ width: '100%' }}>
    {loading && <span aria-label="读取业务步骤状态"><Spin /></span>}
    {steps.length > 1 && <label>选择业务步骤<Select aria-label="选择要恢复的业务步骤" value={selectedStep?.executionId} disabled={busy || unknown || !!preview} options={steps.map(step => ({ value: step.executionId,label: `${step.nodeId || step.handlerCode} · ${step.status === 'result_stale_inputs' ? '输入已变化' : step.status === 'waiting' ? '等待结果' : '待继续'}` }))} onChange={setSelectedExecution} /></label>}
    {options && <><Descriptions column={1} size="small" items={[
      { label: '当前步骤', children: selectedStep ? `${selectedStep.handlerCode} · v${selectedStep.handlerVersion}` : '当前没有等待中的业务步骤' },
      { label: '状态', children: selectedStep?.status === 'result_stale_inputs' ? '步骤输入在执行期间已变化' : selectedStep?.status === 'result_ready' ? '结果已收到，后续推进受阻' : selectedStep?.status === 'waiting' ? '等待处理器结果' : options.status },
      ...(selectedStep?.lastErrorCode ? [{ label: '阻塞原因', children: selectedStep.lastErrorCode }] : []),
    ]} />{!recoverable && <Alert type="info" title={selectedStep?.status === 'waiting' ? '尚未收到可用结果' : '当前无需恢复步骤'} description={selectedStep?.status === 'waiting' ? '先在事件管理中核对原投递及处理器回执，再按原请求恢复。' : '刷新后查看最新状态。'} />}</>}
    {recoverable && !preview && <><Alert type="info" title={recovery === 'recompute' ? '按当前输入重新计算' : recovery === 'apply_stored' ? '确认使用已收到的业务结果' : '使用已保存结果继续流程'} description={recovery === 'recompute' ? '平台会建立新的计算记录和执行键，保留原结果用于核对。' : recovery === 'apply_stored' ? '输入已变化。请核对原业务结果仍然适用；确认后平台会记录原因，并使用原结果继续流程。' : '请先修复后续审批人或节点配置。执行键、计算结果和既有轨迹保持可追溯。'} />
      <label>操作原因<Input.TextArea aria-label="业务步骤恢复原因" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={1000} disabled={busy || unknown} /></label>
      <Button type="primary" disabled={busy || unknown || !reason.trim()} loading={busy} onClick={() => void prepare()}>预览步骤恢复</Button></>}
    {preview && <><Alert type="info" title={`继续 ${preview.target.title}`} description={preview.target.reexecutesBusinessHandler ? '为当前输入建立新的计算记录，然后继续此分支。' : '按已保存结果和当前合法配置推进；后续仍可能因配置问题受阻，请查看最新状态。'} />
      <p style={{ overflowWrap: 'anywhere' }}>原执行键：{preview.target.executionId}</p><p>操作原因：{reason}</p>
      <Space wrap><Button disabled={busy || unknown} onClick={() => setReload(value => value + 1)}>重新读取并预览</Button><Button type="primary" loading={busy} disabled={busy || !preview.canCommit || !request.current} onClick={() => void commit()}>{unknown ? '重试原恢复请求' : preview.target.reexecutesBusinessHandler ? '重新计算' : '使用已收结果继续'}</Button></Space></>}
    {error && <Alert type={unknown ? 'warning' : 'error'} showIcon title={unknown ? '提交结果待确认' : '操作未完成'} description={error} />}
    {refreshError && <Alert type="warning" showIcon title="恢复操作已成功，但页面刷新失败" description={refreshError} />}
    {unknown && <p>请保留当前页面并重试原请求，平台会核对原操作结果。</p>}
    {!preview && <Button disabled={busy || loading || unknown} onClick={() => setReload(value => value + 1)}>刷新步骤状态</Button>}
  </Space></section>;
}
