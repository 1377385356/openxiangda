import type { DataTransactionGuard, DataTransactionOperation, DataTransactionRecordAssertion } from './types.js';

/** Optional platform-owned concurrency. No application Redis, SQL or worker code. */
export type ConcurrencyParameter =
  | { type: 'uuid' }
  | { type: 'string'; values: string[] }
  | { type: 'string'; minLength?: number; maxLength: number }
  | { type: 'boolean' }
  | { type: 'integer'; minimum: number; maximum: number };

export type ConcurrencyBinding =
  | { from: 'input'; key: string }
  | { from: 'actor' }
  | { from: 'literal'; value: string | number | boolean | null }
  | { from: 'allocation' };

export interface ManagedReadDeclaration {
  code: string;
  resourceCode: string;
  parameters: Record<string, ConcurrencyParameter>;
  select: string[];
  where?: Array<{ field: string; value: ConcurrencyBinding }>;
  limit: number;
  scope: 'subject' | 'application';
  freshSeconds: number;
  staleSeconds: number;
  maxKeys: number;
  sourcePerSecond: number;
  /** Fields whose changes invalidate the snapshot; select/filter fields are mandatory. */
  dependencies: string[];
}

export interface AdmissionPolicy {
  perSecond: number;
  burst: number;
  maxInFlight: number;
  maxQueue: number;
  maxWaitSeconds: number;
  permitSeconds?: number;
}

export interface IntegerQuotaDeclaration {
  code: string;
  sourceResource: string;
  capacityField: string;
  allocationResource: string;
  allocationField: string;
  /** Omit to allow immediate committed allocations only. */
  reservationSeconds?: number;
}

export interface QueuedCommandDeclaration {
  code: string;
  mode?: 'permit' | 'durable';
  intake?: { perSecond: number; burst: number; maxInFlight: number };
  execution?: ManagedCommandExecution;
  capability: string;
  parameters: Record<string, ConcurrencyParameter>;
  resourceKey: ConcurrencyBinding;
  admission: AdmissionPolicy;
  deadlineSeconds: number;
  guards?: Array<{
    resourceCode: string;
    id: ConcurrencyBinding;
    conditions: Array<{ kind?: 'value'; field: string; operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; value: ConcurrencyBinding } | { kind: 'database-now'; field: string; operator: 'lt' | 'lte' | 'gt' | 'gte' }>;
  }>;
  operations?: Array<{
    operation: 'create' | 'update';
    resourceCode: string;
    id?: ConcurrencyBinding;
    expectedRevision?: ConcurrencyBinding;
    data: Record<string, ConcurrencyBinding>;
  }>;
  quota?: {
    pool: string;
    action: 'allocate' | 'confirm' | 'release';
    units?: number;
    mode?: 'reserved' | 'committed';
    allocation?: ConcurrencyBinding;
  };
}

export interface ManagedConcurrencyDeclaration {
  version: 1;
  /** Shared by all command/resource queues in this application and environment. */
  admission: { perSecond: number; burst: number; maxInFlight: number };
  reads: ManagedReadDeclaration[];
  quotas: IntegerQuotaDeclaration[];
  commands: QueuedCommandDeclaration[];
}

export interface ManagedReadResult<T = Record<string, unknown>> {
  items: T[];
  generatedAt: string;
  freshUntil: string;
  staleUntil: string;
  version: string;
  freshness: 'fresh' | 'stale';
}

export type CommandState = 'accepted' | 'executing' | 'retry_wait' | 'succeeded' | 'rejected' | 'expired' | 'cancelled';
export interface CommandReceipt {
  operationId: string;
  command: string;
  requestKey: string;
  state: CommandState;
  acceptedAt: string;
  retryAfterMs: number;
  resourceKey?: string;
  updatedAt?: string;
  queue?: { position: number | null; observedAt: string };
  result?: { [key: string]: unknown; items?: Array<{ id: string; revision?: number }>; allocation?: { id: string; state: string; units: number; expiresAt: string | null } };
  errorCode?: string;
}

export interface WaitingReceipt {
  state: 'waiting' | 'admitted' | 'expired';
  ticket: string;
  requestKey: string;
  retryAfterMs: number;
  position?: number;
  permit?: string;
  expiresAt: string;
}


export interface ManagedCommandExecution {
  kind: 'backend-plan';
  handlerCode: string;
  timeoutMs: number;
  resources: Array<{ resourceCode: string; readFields: string[]; writeOperations: Array<'create' | 'update' | 'increment'>; writeFields: string[] }>;
  directory?: { mode: 'current-initiator'; fields: Array<'displayName' | 'employeeNumber' | 'primaryDepartment' | 'departments' | 'phone'> };
}

export type ManagedCommandAssertion = DataTransactionRecordAssertion | {
  /** Queue only: compare the declared field to the original database acceptance time. */
  kind: 'command-accepted-at'; field: string; operator: 'lt' | 'lte' | 'gt' | 'gte';
};
export type ManagedCommandPlanGuard = Exclude<DataTransactionGuard, { kind: 'record-assert' | 'record-match' | 'role-member' }> |
  (Omit<Extract<DataTransactionGuard, { kind: 'record-assert' | 'record-match' }>, 'assertions'> & { assertions: ManagedCommandAssertion[] });
export interface ManagedCommandPlan {
  schemaVersion: 'openxiangda.managed-command-plan/v1';
  guards: ManagedCommandPlanGuard[];
  operations: Extract<DataTransactionOperation, { operation: 'create' | 'update' | 'increment' }>[];
  /** Bounded JSON; {operationIndex,field:'id'} references a create in this plan. */
  result: Record<string, unknown>;
}
export interface ManagedCommandMinePage { items: CommandReceipt[]; nextCursor?: string }
export interface ManagedCommandExecutionVerification {
  commandId: string; commandCode: string; handlerCode: string; generation: number;
  actorId: string; acceptedAt: string; deadlineAt: string; input: Record<string, unknown>;
  declarationDigest: string; inputDigest: string;
  runtime: { tenantId: string; appCode: string; environmentKey: string; environmentId: string; versionId: string; deploymentId: string; headRevision: number; backendCode: string };
}
export type ReadonlyManagedCommandExecution = Omit<ManagedCommandExecution,'resources'|'directory'> & {
  readonly resources: readonly {readonly resourceCode:string;readonly readFields:readonly string[];readonly writeOperations:readonly ('create'|'update'|'increment')[];readonly writeFields:readonly string[]}[];
  readonly directory?: {readonly mode:'current-initiator';readonly fields:readonly ('displayName'|'employeeNumber'|'primaryDepartment'|'departments'|'phone')[]};
};
export interface ManagedCommandHandlerManifest {
  readonly schemaVersion: 'openxiangda.managed-command-handler-manifest/v1';
  readonly appCode: string;
  readonly handlers: readonly {
    readonly commandCode: string; readonly handlerCode: string; readonly declarationDigest: string;
    readonly endpointPath: string;
    readonly execution: ReadonlyManagedCommandExecution;
  }[];
}
