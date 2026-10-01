import type {
  NativeRoleMembership,
  NativeScopeGrant,
  NativeRoleMembershipBatchItem,
  NativeRoleMembershipBatchItemResult,
  NativeAuthorizationMutationReceipt,
} from 'openxiangda-contracts/browser';

export type MembershipBatchSettings = {
  reason: string;
  scopeMode: 'keep' | 'replace_dimension' | 'clear_all';
  dimensionCode?: string;
  scopeValues: string[];
  fromMode: 'keep' | 'set' | 'clear';
  toMode: 'keep' | 'set' | 'clear';
  validFrom?: string;
  validTo?: string;
};

export function membershipBatchItems(
  operation: 'create' | 'update' | 'revoke',
  rows: NativeRoleMembership[],
  users: string[],
  roleCode: string,
  settings: MembershipBatchSettings,
  newKey: () => string = () => crypto.randomUUID()
): NativeRoleMembershipBatchItem[] {
  const grants = (original: NativeScopeGrant[]): NativeScopeGrant[] => {
    if (settings.scopeMode === 'keep') return structuredClone(original);
    if (settings.scopeMode === 'clear_all') return [];
    if (!settings.dimensionCode) throw new Error('请选择需要调整的范围维度');
    const existing = original.find(
      (grant) => grant.dimensionCode === settings.dimensionCode
    );
    return [
      ...structuredClone(
        original.filter(
          (grant) => grant.dimensionCode !== settings.dimensionCode
        )
      ),
      ...(settings.scopeValues.length
        ? [
            {
              dimensionCode: settings.dimensionCode,
              values: [...settings.scopeValues],
              operations: [...(existing?.operations || ['*'])],
            },
          ]
        : []),
    ];
  };
  const time = (
    mode: 'keep' | 'set' | 'clear',
    value: string | undefined,
    original: string | null | undefined
  ) => {
    if (mode === 'keep') return original || null;
    if (mode === 'clear') return null;
    if (!value || !Number.isFinite(Date.parse(value)))
      throw new Error('请填写有效的开始或到期时间');
    return value;
  };
  const changes = (row?: NativeRoleMembership) => {
    const validFrom = time(
      settings.fromMode,
      settings.validFrom,
      row?.validFrom
    );
    const validTo = time(settings.toMode, settings.validTo, row?.validTo);
    if (validFrom && validTo && Date.parse(validTo) <= Date.parse(validFrom))
      throw new Error(
        `成员 ${row?.userName || row?.userId || ''} 的到期时间必须晚于开始时间`
      );
    return { scopeGrants: grants(row?.scopeGrants || []), validFrom, validTo };
  };
  const mutation = () => ({
    operationId: newKey(),
    reason: settings.reason.trim(),
  });
  if (operation === 'create')
    return users.map((userId) => ({
      ...mutation(),
      ...changes(),
      operation,
      userId,
      roleCode,
    }));
  return rows.map((row) =>
    operation === 'revoke'
      ? {
          ...mutation(),
          operation,
          membershipId: row.id,
          expectedRevision: row.revision,
        }
      : {
          ...mutation(),
          ...changes(row),
          operation,
          membershipId: row.id,
          expectedRevision: row.revision,
        }
  );
}

/** Only confirmed failures can acquire a new intent; all unknown operations retain their keys. */
export function membershipBatchPending(
  items: NativeRoleMembershipBatchItem[],
  outcomes: Record<string, NativeRoleMembershipBatchItemResult>,
  receipts: Record<string, NativeAuthorizationMutationReceipt>
): NativeRoleMembershipBatchItem[] {
  return items.filter(
    (item) =>
      !receipts[item.operationId] &&
      !['committed', 'replayed', 'already_committed'].includes(
        outcomes[item.operationId]?.status || ''
      )
  );
}

export function membershipBatchReceiptMatches(
  item: NativeRoleMembershipBatchItem,
  receipt: NativeAuthorizationMutationReceipt
): boolean {
  if (
    receipt.operationId !== item.operationId ||
    receipt.operationKind !== `membership.${item.operation}`
  )
    return false;
  const member = receipt.result.membership as NativeRoleMembership | undefined;
  if (
    !member ||
    receipt.reason !== item.reason ||
    !(item.operation === 'create'
      ? member.userId === item.userId && member.roleCode === item.roleCode
      : member.id === item.membershipId)
  )
    return false;
  if (item.operation === 'revoke') return member.status === 'revoked';
  const equalTime = (
    left: string | null | undefined,
    right: string | null | undefined
  ) =>
    (!left && !right) ||
    Boolean(left && right && Date.parse(left) === Date.parse(right));
  const normalized = (grants: NativeScopeGrant[]) =>
    JSON.stringify(
      grants
        .map((grant) => ({
          dimensionCode: grant.dimensionCode,
          values: [...grant.values].sort(),
          operations: [...grant.operations].sort(),
        }))
        .sort((left, right) =>
          left.dimensionCode.localeCompare(right.dimensionCode)
        )
    );
  return (
    (item.validFrom === undefined ||
      equalTime(member.validFrom, item.validFrom)) &&
    (item.validTo === undefined || equalTime(member.validTo, item.validTo)) &&
    (item.scopeGrants === undefined ||
      normalized(member.scopeGrants) === normalized(item.scopeGrants))
  );
}

export function membershipBatchMerge(
  items: NativeRoleMembershipBatchItem[],
  outcomes: Record<string, NativeRoleMembershipBatchItemResult>,
  received: NativeRoleMembershipBatchItemResult[]
): Record<string, NativeRoleMembershipBatchItemResult> {
  if (
    received.length !== items.length ||
    new Set(received.map((item) => item.operationId)).size !==
      received.length ||
    received.some((result) => {
      const item = items[result.index];
      return (
        !item ||
        item.operationId !== result.operationId ||
        item.operation !== result.operation ||
        ((result.status === 'committed' || result.status === 'replayed') &&
          !membershipBatchReceiptMatches(item, result.result.receipt))
      );
    })
  )
    throw new Error('回执与原操作不一致，请核对原操作编号');
  return {
    ...outcomes,
    ...Object.fromEntries(
      received.map((result) => [result.operationId, result])
    ),
  };
}
