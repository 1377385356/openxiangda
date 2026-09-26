/** Optional platform-owned concurrency. No application Redis, SQL or worker code. */
export type ConcurrencyParameter =
  | { type: 'uuid' }
  | { type: 'string'; values: string[] }
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
  permitSeconds: number;
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
  operations: Array<{
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
  result?: { items?: Array<{ id: string; revision?: number }>; allocation?: { id: string; state: string; units: number; expiresAt: string | null } };
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
