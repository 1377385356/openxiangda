import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import type { WorkflowCommandResult } from 'openxiangda-contracts/browser';
import { loadWorkflowTaskCommandReceipt } from '../../platform-client';
import { useUnsavedChangesGuard } from '../../navigation-guard';
import type { PendingWorkflowTaskCommand } from '../../workflow-task-command-recovery';

export function WorkflowPendingCommandGuard() {
  useUnsavedChangesGuard({ when: true, preventNavigation: true,
    message: '任务提交结果尚待确认，请先查询原结果或重试原请求。' });
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  return null;
}

/** Works even when the original task is now completed and its Surface cannot load. */
export function WorkflowTaskCommandReceipt({ locator, busy: writing, onSettled }: {
  locator: PendingWorkflowTaskCommand;
  busy: boolean;
  onSettled: (result: WorkflowCommandResult | null, message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState('正在确认原提交结果。刷新页面后请查询原结果，再继续办理。');
  const current = useRef(locator);
  const mounted = useRef(false);
  current.current = locator;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const query = async () => {
    if (busy || writing) return;
    const request = locator;
    setBusy(true);
    try {
      const receipt = await loadWorkflowTaskCommandReceipt(request.taskId, request.idempotencyKey, request.tokenDigest);
      if (!mounted.current || current.current !== request) return;
      if (receipt.taskId !== request.taskId || receipt.idempotencyKey !== request.idempotencyKey) throw new Error('WORKFLOW_RECEIPT_SCOPE_MISMATCH');
      if (receipt.status === 'succeeded' && receipt.result && receipt.command === request.command) {
        await onSettled(receipt.result, '原任务操作已成功');
      } else if (receipt.status === 'failed') {
        await onSettled(null, `原任务操作被拒绝：${receipt.errorCode || '请刷新后重新确认'}`);
      } else if (receipt.status === 'expired_unconsumed') {
        await onSettled(null, '原提交凭证已过期且未使用。请核对最新资料后重新确认操作。');
      } else {
        setDescription('尚未查到确定结果。请保留原操作；稍后再次查询，或在原页面重试原请求。');
      }
    } catch (error) {
      if (mounted.current && current.current === request) setDescription(error instanceof Error ? error.message : '原结果查询失败，请再次查询');
    } finally { if (mounted.current && current.current === request) setBusy(false); }
  };
  return <><WorkflowPendingCommandGuard /><Alert showIcon type="warning" title={writing ? '任务操作正在提交' : '任务提交结果待确认'}
    description={description} action={<Space wrap><Button loading={busy} disabled={writing || busy} onClick={() => void query()}>查询原结果</Button></Space>} /></>;
}
