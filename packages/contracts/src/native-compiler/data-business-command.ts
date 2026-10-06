import type { DataTransactionRequest, DataTransactionResult } from '../types.js';

export const DATA_BUSINESS_COMMAND_SCHEMA = 'openxiangda.data-business-command/v1' as const;
export const DATA_BUSINESS_COMMAND_RESOLUTION_SCHEMA = 'openxiangda.data-business-command-resolution/v1' as const;
export const DATA_BUSINESS_COMMAND_INTENT_MAX_BYTES = 64 * 1024;

export interface DataBusinessCommandIdentity {
  idempotencyKey: string;
  /** 固定动作代码组装的原业务输入；包含目标、预期 revision 和修改原因。 */
  intent: Record<string, unknown>;
}

export interface DataBusinessCommandCommit extends DataBusinessCommandIdentity {
  data: Omit<DataTransactionRequest, 'schemaVersion' | 'idempotencyKey'> & {
    workflowStage?: import('./workflow-native-stage.js').WorkflowNativeStageGuard;
  };
}

export interface DataBusinessCommandReceipt {
  id: string;
  appVersionId: string;
  environmentHeadRevision: number;
  completedAt: string;
  transaction: DataTransactionResult;
}

export interface DataBusinessCommandResolution {
  schemaVersion: typeof DATA_BUSINESS_COMMAND_RESOLUTION_SCHEMA;
  appCode: string;
  environmentKey: 'preproduction' | 'production';
  operationCode: string;
  idempotencyKey: string;
  intentDigest: string;
  observedAt: string;
  /** not_observed 不是回滚证明，不能据此自动重放或更换操作键。 */
  outcome: 'committed' | 'not_observed';
  receipt: DataBusinessCommandReceipt | null;
}

/** 纯 JSON、顺序无关对象、顺序有关数组；不静默丢弃 undefined 或转换非 JSON 值。 */
export function canonicalDataBusinessIntent(value: unknown): string {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();
  const invalid = (): never => { throw new Error('OPENXIANGDA_DATA_COMMAND_INTENT_INVALID'); };
  const take = (text: string): string => {
    bytes += encoder.encode(text).byteLength;
    if (bytes > DATA_BUSINESS_COMMAND_INTENT_MAX_BYTES) invalid();
    return text;
  };
  const visit = (item: unknown, depth: number): string => {
    if (++nodes > 10000 || depth > 32) return invalid();
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return take(JSON.stringify(item));
    if (typeof item === 'number') return Number.isFinite(item) ? take(JSON.stringify(item)) : invalid();
    if (!item || typeof item !== 'object' || ancestors.has(item)) return invalid();
    if (Object.getOwnPropertySymbols(item).length) return invalid();
    ancestors.add(item);
    let result: string;
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length) return invalid();
      result = take('[') + item.map((entry, index) =>
        (index ? take(',') : '') + visit(entry, depth + 1)
      ).join('') + take(']');
      ancestors.delete(item);
      return result;
    }
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    result = take('{') + Object.keys(item).sort().map((key, index) =>
      (index ? take(',') : '') + take(JSON.stringify(key)) + take(':') + visit((item as Record<string, unknown>)[key], depth + 1)
    ).join('') + take('}');
    ancestors.delete(item);
    return result;
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return visit(value, 0);
}

/** 返回值必须关联同一动作和原输入，收到不完整或错位响应时保留原操作。 */
export function parseDataBusinessCommandResolution(value: unknown, expected: {
  appCode: string; environmentKey: string; operationCode: string; idempotencyKey: string; intentDigest: string;
}, requireCommitted = false): DataBusinessCommandResolution {
  const result = value as DataBusinessCommandResolution | null;
  const invalid = (): never => { throw new Error('OPENXIANGDA_DATA_COMMAND_RESPONSE_INVALID'); };
  if (!result || typeof result !== 'object' || result.schemaVersion !== DATA_BUSINESS_COMMAND_RESOLUTION_SCHEMA) return invalid();
  for (const key of ['appCode', 'environmentKey', 'operationCode', 'idempotencyKey', 'intentDigest'] as const) {
    if (result[key] !== expected[key]) return invalid();
  }
  if (typeof result.observedAt !== 'string' || !Number.isFinite(Date.parse(result.observedAt))) return invalid();
  if (result.outcome === 'not_observed' && result.receipt === null && !requireCommitted) return result;
  if (result.outcome !== 'committed' || !result.receipt) return invalid();
  const receipt = result.receipt;
  const uuid = (input: unknown) => typeof input === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input);
  if (!uuid(receipt.id) || !uuid(receipt.appVersionId) || !Number.isSafeInteger(receipt.environmentHeadRevision)
    || receipt.environmentHeadRevision < 1 || typeof receipt.completedAt !== 'string' || !Number.isFinite(Date.parse(receipt.completedAt))) return invalid();
  const transaction = receipt.transaction;
  if (!transaction || transaction.schemaVersion !== 'openxiangda.data-transaction-result/v2'
    || transaction.idempotencyKey !== expected.idempotencyKey || typeof transaction.replayed !== 'boolean'
    || !Array.isArray(transaction.items) || !transaction.items.length || transaction.items.length > 1000) return invalid();
  for (const [index, item] of transaction.items.entries()) {
    if (!item || item.index !== index) return invalid();
    if (item.operation === 'emitEvent') {
      if (!uuid(item.eventId) || typeof item.eventType !== 'string' || !item.eventType) return invalid();
    } else if (!['create', 'update', 'delete', 'increment'].includes(item.operation)
      || !uuid(item.id) || typeof item.resourceCode !== 'string' || !item.resourceCode
      || !Number.isSafeInteger(item.revision) || item.revision < 1) return invalid();
  }
  return result;
}
