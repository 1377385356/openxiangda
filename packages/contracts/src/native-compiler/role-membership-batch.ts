import type { NativeRoleMembership, NativeRoleMembershipMutationResult, NativeScopeGrant, Sha256Digest } from '../types.js';

export const NATIVE_ROLE_MEMBERSHIP_BATCH_MAX_ITEMS = 50;
export const NATIVE_ROLE_MEMBERSHIP_BATCH_MAX_BYTES = 128 * 1024;
export type NativeRoleMembershipBatchOperation = 'create' | 'update' | 'revoke';
type Mutation = { operationId: string; reason: string };
type Changes = { scopeGrants?: NativeScopeGrant[]; validFrom?: string | null; validTo?: string | null };
export type NativeRoleMembershipBatchItem =
  | (Mutation & Changes & { operation: 'create'; userId: string; roleCode: string })
  | (Mutation & Changes & { operation: 'update'; membershipId: string; expectedRevision: number })
  | (Mutation & { operation: 'revoke'; membershipId: string; expectedRevision: number });
export interface NativeRoleMembershipBatchInput {
  schemaVersion: 'openxiangda.native-role-membership-batch-request/v2';
  environmentKey?: 'preproduction' | 'production';
  items: NativeRoleMembershipBatchItem[];
}
export type NativeRoleMembershipChange = Pick<NativeRoleMembership,
  'userId' | 'roleCode' | 'roleSource' | 'sourceCode' | 'scopeGrants' | 'status' | 'validFrom' | 'validTo'>;
type ItemIdentity = { index: number; operationId: string; operation: NativeRoleMembershipBatchOperation };
export type NativeRoleMembershipBatchItemResult = ItemIdentity & (
  | { status: 'ready' | 'already_committed'; before: NativeRoleMembershipChange | null; after: NativeRoleMembershipChange }
  | { status: 'committed' | 'replayed'; result: NativeRoleMembershipMutationResult }
  | { status: 'failed' | 'unconfirmed'; error: { code: string; status: number; pointer: string; retryable: boolean } }
);
export interface NativeRoleMembershipBatchResult {
  schemaVersion: 'openxiangda.native-role-membership-batch-result/v2';
  mode: 'preview' | 'execute';
  requestDigest: Sha256Digest;
  items: NativeRoleMembershipBatchItemResult[];
  succeeded: number;
  failed: number;
  unconfirmed: number;
  effect: 'future_assignment_keep_existing_tasks';
}

export class NativeRoleMembershipBatchInputError extends Error {
  readonly code = 'OPENXIANGDA_NATIVE_AUTHZ_BATCH_INPUT_INVALID';
  readonly status = 400;
  constructor(readonly pointer: string) { super('OPENXIANGDA_NATIVE_AUTHZ_BATCH_INPUT_INVALID'); }
}

/** Shared structural bounds. Semantic authorization, scope and CAS remain in the Native kernel. */
export function assertNativeRoleMembershipBatchInput(input: unknown): asserts input is NativeRoleMembershipBatchInput {
  const fail = (path: string): never => { throw new NativeRoleMembershipBatchInputError(path); };
  const record = (value: unknown, path: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
    return value as Record<string, unknown>;
  };
  const keys = (value: Record<string, unknown>, allowed: string[], path: string) => {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}/${key}`);
  };
  const text = (value: unknown, max: number, path: string): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(path);
    return value as string;
  };
  const uuid = (value: unknown, path: string) => {
    const id = text(value, 36, path);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) fail(path);
    return id.toLowerCase();
  };
  const value = record(input, '');
  let bytes: number;
  try { bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { fail(''); }
  if (bytes! > NATIVE_ROLE_MEMBERSHIP_BATCH_MAX_BYTES) fail('');
  keys(value, ['schemaVersion', 'environmentKey', 'items'], '');
  if (value.schemaVersion !== 'openxiangda.native-role-membership-batch-request/v2') fail('/schemaVersion');
  if (value.environmentKey !== undefined && !['preproduction', 'production'].includes(String(value.environmentKey))) fail('/environmentKey');
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > NATIVE_ROLE_MEMBERSHIP_BATCH_MAX_ITEMS) fail('/items');
  const operationIds = new Set<string>(), targets = new Set<string>();
  let operation: unknown;
  for (const [index, raw] of (value.items as unknown[]).entries()) {
    const path = `/items/${index}`, item = record(raw, path);
    if (!['create', 'update', 'revoke'].includes(String(item.operation))) fail(`${path}/operation`);
    operation ??= item.operation;
    if (operation !== item.operation) fail(`${path}/operation`);
    keys(item, ['operation', 'operationId', 'reason', ...(operation === 'create' ? ['userId', 'roleCode'] : ['membershipId', 'expectedRevision']), ...(operation !== 'revoke' ? ['scopeGrants', 'validFrom', 'validTo'] : [])], path);
    const id = uuid(item.operationId, `${path}/operationId`);
    if (operationIds.has(id)) fail(`${path}/operationId`);
    operationIds.add(id);
    text(item.reason, 1000, `${path}/reason`);
    let target: string;
    if (operation === 'create') {
      const userId = text(item.userId, 255, `${path}/userId`), roleCode = text(item.roleCode, 128, `${path}/roleCode`);
      if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(roleCode)) fail(`${path}/roleCode`);
      target = JSON.stringify([userId, roleCode]);
    } else {
      target = uuid(item.membershipId, `${path}/membershipId`);
      if (!Number.isSafeInteger(item.expectedRevision) || Number(item.expectedRevision) < 1) fail(`${path}/expectedRevision`);
    }
    if (targets.has(target)) fail(path);
    targets.add(target);
    // Scope/date semantics are validated by the same kernel as single mutations.
    if (item.scopeGrants !== undefined && (!Array.isArray(item.scopeGrants) || item.scopeGrants.length > 100)) fail(`${path}/scopeGrants`);
    for (const field of ['validFrom', 'validTo']) if (item[field] !== undefined && item[field] !== null) text(item[field], 64, `${path}/${field}`);
  }
}
