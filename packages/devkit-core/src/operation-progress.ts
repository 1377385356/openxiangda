import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface OperationStage {
  stage: string;
  label: string;
  state: 'running' | 'passed' | 'failed' | 'skipped';
  startedAt: string;
  durationMs: number;
  details?: Record<string, unknown>;
}
export interface OperationProgress extends OperationStage {
  schemaVersion: 'openxiangda.operation-progress/v1';
  operationId: string;
  operation: string;
  sequence: number;
  elapsedMs: number;
  heartbeat: boolean;
}
export type OperationProgressListener = (event: OperationProgress) => void | Promise<void>;
interface ProgressContext {
  operationId: string;
  operation: string;
  started: number;
  sequence: number;
  stages: OperationStage[];
  listener?: OperationProgressListener;
  heartbeatMs: number;
}
const storage = new AsyncLocalStorage<ProgressContext>();

/** 每次调用独立；并发 MCP 请求不会共享当前阶段或监听器。 */
export async function withOperationProgress<T extends { data?: unknown }>(
  operation: string,
  listener: OperationProgressListener | undefined,
  execute: () => Promise<T>,
  heartbeatMs = 10_000
): Promise<T> {
  const context: ProgressContext = {
    operationId: randomUUID(), operation, started: Date.now(), sequence: 0,
    stages: [], heartbeatMs, ...(listener ? { listener } : {}),
  };
  return storage.run(context, async () => {
    const execution = () => ({
      operationId: context.operationId,
      elapsedMs: Date.now() - context.started,
      stages: context.stages.map(stage => ({ ...stage })),
    });
    try {
      const result = await execute();
      const data = result.data && typeof result.data === 'object' ? result.data : {};
      return { ...result, data: { ...data, execution: execution() } };
    } catch (error) {
      if (error && typeof error === 'object') {
        const value = error as { data?: Record<string, unknown> };
        try { value.data = { ...value.data, execution: execution() }; } catch { /* 保留不可扩展的原始异常。 */ }
      }
      throw error;
    }
  });
}

function emit(context: ProgressContext, stage: OperationStage, heartbeat = false) {
  const event: OperationProgress = {
    ...stage, schemaVersion: 'openxiangda.operation-progress/v1',
    operationId: context.operationId, operation: context.operation,
    sequence: ++context.sequence, elapsedMs: Date.now() - context.started, heartbeat,
  };
  // 可观测性传输失败不能改变已提交操作的结果；最终结果仍带阶段摘要。
  try { void Promise.resolve(context.listener?.(event)).catch(() => undefined); } catch { /* 观察者不能改变执行。 */ }
}

export async function operationStage<T>(stage: string, label: string, execute: () => Promise<T>): Promise<T> {
  const context = storage.getStore();
  if (!context) return execute();
  const started = Date.now();
  const record: OperationStage = { stage, label, state: 'running', startedAt: new Date(started).toISOString(), durationMs: 0 };
  context.stages.push(record);
  emit(context, record);
  const heartbeat = setInterval(() => {
    record.durationMs = Date.now() - started;
    emit(context, record, true);
  }, context.heartbeatMs);
  heartbeat.unref();
  try {
    const result = await execute();
    record.state = result && typeof result === 'object' && 'ok' in result && result.ok === false ? 'failed' : 'passed';
    return result;
  } catch (error) {
    record.state = 'failed';
    throw error;
  } finally {
    clearInterval(heartbeat);
    record.durationMs = Date.now() - started;
    emit(context, record);
  }
}

export function skippedOperationStage(stage: string, label: string) {
  const context = storage.getStore();
  if (!context) return;
  const record: OperationStage = { stage, label, state: 'skipped', startedAt: new Date().toISOString(), durationMs: 0 };
  context.stages.push(record); emit(context, record);
}

/** 平台仍是运行状态权威；此处只刷新本次观察的标题和运行指针。 */
export function updateOperationStage(stage: string, label: string, details: Record<string, unknown>) {
  const context = storage.getStore();
  const record = context?.stages.slice().reverse().find(item => item.stage === stage && item.state === 'running');
  if (!context || !record) return;
  record.label = label;
  record.details = details;
  record.durationMs = Date.now() - Date.parse(record.startedAt);
  emit(context, record);
}
