import type { DataDecimalReservationLifecycle } from '../types.js';

export class NativeDecimalLifecycleContractError extends Error {
  readonly code = 'NATIVE_DECIMAL_LIFECYCLE_INVALID';
  constructor(readonly pointer: string, readonly reason: string) {
    super(`金额生命周期声明无效：${reason}（${pointer}）`);
  }
}

const KEYS = ['parentTransitions', 'childTransitions', 'fulfilledChildStatuses', 'lockedParentStatuses'] as const;
const MAPPING = ['amountFieldCode', 'currencyFieldCode', 'relationFieldCode', 'parentFieldCode',
  'rootFieldCode', 'statusFieldCode', 'parentRelationValue', 'childRelationValue'] as const;
const record = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value.filter(record) : [];
const fail = (pointer: string, reason: string): never => { throw new NativeDecimalLifecycleContractError(pointer, reason); };
const status = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/** Shared shape validation and canonical ordering; no authorization is granted. */
export function parseDecimalReservationLifecycle(
  value: unknown,
  pointer = '/decimalReservationLifecycle'
): DataDecimalReservationLifecycle | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || Object.keys(value).some(key => !KEYS.includes(key as typeof KEYS[number])) ||
      KEYS.some(key => !Object.prototype.hasOwnProperty.call(value, key)))
    return fail(pointer, '必须完整声明四项规则，不能包含未知属性');
  const edges = (key: 'parentTransitions' | 'childTransitions') => {
    const values = value[key];
    if (!Array.isArray(values) || values.length > 64) return fail(`${pointer}/${key}`, '状态边最多 64 条');
    const seen = new Set<string>();
    return values.map((edge, index) => {
      const path = `${pointer}/${key}/${index}`;
      if (!record(edge) || Object.keys(edge).some(k => k !== 'from' && k !== 'to') ||
          !status(edge.from) || !status(edge.to) || edge.from === edge.to)
        return fail(path, '状态边必须包含不同的有效 from/to');
      const id = JSON.stringify([edge.from, edge.to]);
      if (seen.has(id)) return fail(path, '状态边不能重复');
      seen.add(id);
      return { from: edge.from, to: edge.to };
    }).sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));
  };
  const statuses = (key: 'fulfilledChildStatuses' | 'lockedParentStatuses') => {
    const values = value[key];
    if (!Array.isArray(values) || values.length < 1 || values.length > 16 ||
        values.some(item => !status(item)) || new Set(values).size !== values.length)
      return fail(`${pointer}/${key}`, '状态集合必须包含 1 到 16 个不重复的有效状态');
    return [...values as string[]].sort(compare);
  };
  return { parentTransitions: edges('parentTransitions'), childTransitions: edges('childTransitions'),
    fulfilledChildStatuses: statuses('fulfilledChildStatuses'), lockedParentStatuses: statuses('lockedParentStatuses') };
}

/** Both compilers provide canonical resources and their same-resource operation grants. */
export function validateDecimalReservationLifecycles(
  resources: unknown,
  operations: unknown,
  pointer = '/config/data/resources'
): void {
  list(resources).forEach((resource, index) => {
    const path = `${pointer}/${index}/decimalReservationLifecycle`;
    const lifecycle = parseDecimalReservationLifecycle(resource.decimalReservationLifecycle, path);
    if (!lifecycle) return;
    const grants = list(operations).map(operation => operation.platformAccess?.decimalReservation)
      .filter(grant => record(grant) && grant.resourceCode === resource.code);
    const reserve = grants.find(grant => grant.mode === 'reserve');
    if (!reserve) return fail(path, '需要同资源已声明的 reserve 动作映射');
    if (MAPPING.some(key => typeof reserve[key] !== 'string') ||
        grants.some(grant => MAPPING.some(key => grant[key] !== reserve[key])))
      return fail(path, '同资源额度动作的字段映射必须一致');
    const field = list(resource.schema?.fields).find(item => item.code === reserve.statusFieldCode);
    if (field?.type !== 'option.single') return fail(path, '额度状态字段必须为 option.single');
    const allowed = new Set(list(field.options).map(option => option.value));
    for (const key of KEYS) {
      const values = key === 'parentTransitions' || key === 'childTransitions'
        ? lifecycle[key].flatMap(edge => [edge.from, edge.to]) : lifecycle[key];
      if (values.some(value => !allowed.has(value))) return fail(`${path}/${key}`, '状态必须来自额度状态字段的选项');
    }
    if (grants.some(grant => grant.mode === 'reserve' && Array.isArray(grant.eligibleParentStatuses) &&
        grant.eligibleParentStatuses.some((value: unknown) => lifecycle.lockedParentStatuses.includes(String(value)))))
      return fail(`${path}/lockedParentStatuses`, '锁定父状态不能允许新预留');
  });
}
