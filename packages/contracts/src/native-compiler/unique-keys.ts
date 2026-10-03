import type { DataUniqueKey, DataUniqueKeyCondition, DataUniqueKeyNormalizer } from '../types.js';

export const NATIVE_UNIQUE_KEY_NORMALIZERS = ['exact-v1', 'nfkc-space-v1', 'nfkc-upper-ascii-v1'] as const;
export const NATIVE_UNIQUE_KEY_MAX_BYTES = 256;

export class NativeUniqueKeyContractError extends Error {
  readonly code = 'NATIVE_UNIQUE_KEY_INVALID';
  constructor(readonly pointer: string, readonly reason: string) {
    super(`条件唯一键声明无效：${reason}（${pointer}）`);
  }
}

type Field = { code: string; type: string; options?: readonly { value: string }[] };
const record = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const fail = (pointer: string, reason: string): never => { throw new NativeUniqueKeyContractError(pointer, reason); };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const exactKeys = (value: Record<string, any>, keys: string[], path: string) => {
  if (Object.keys(value).some(key => !keys.includes(key))) fail(path, '不支持未知属性');
};

/** Pure, shared declaration validation. Database expressions own enforcement. */
export function parseNativeUniqueKeys(
  value: unknown,
  fields: readonly Field[],
  pointer = '/uniqueKeys'
): DataUniqueKey[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) return fail(pointer, '每资源最多 8 条规则');
  const byCode = new Map(fields.map(field => [field.code, field]));
  const codes = new Set<string>();
  return value.map((rule, index): DataUniqueKey => {
    const path = `${pointer}/${index}`;
    if (!record(rule)) return fail(path, '规则必须是对象');
    exactKeys(rule, ['code', 'fields', 'when'], path);
    if (typeof rule.code !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(rule.code) ||
        rule.code.length > 20 || codes.has(rule.code)) return fail(`${path}/code`, '需要不重复且不超过 20 字符的 lower-kebab-case 标识');
    codes.add(rule.code);
    if (!Array.isArray(rule.fields) || rule.fields.length < 1 || rule.fields.length > 4)
      return fail(`${path}/fields`, '必须选择 1 到 4 个字段');
    const seenFields = new Set<string>();
    const keys = rule.fields.map((key: unknown, keyIndex: number) => {
      const keyPath = `${path}/fields/${keyIndex}`;
      if (!record(key)) return fail(keyPath, '字段必须是对象');
      exactKeys(key, ['fieldCode', 'normalizer'], keyPath);
      const field = byCode.get(key.fieldCode);
      if (!field || !['text.short', 'uuid', 'option.single', 'resource-ref.single', 'user.single'].includes(field.type) || seenFields.has(key.fieldCode))
        return fail(`${keyPath}/fieldCode`, '需要不重复的短文本、UUID、单选、单记录引用或单人字段');
      seenFields.add(key.fieldCode);
      const normalizer: DataUniqueKeyNormalizer = key.normalizer === undefined ? 'exact-v1' : key.normalizer;
      if (!NATIVE_UNIQUE_KEY_NORMALIZERS.includes(normalizer) ||
          (field.type !== 'text.short' && normalizer !== 'exact-v1'))
        return fail(`${keyPath}/normalizer`, '归一化方式不支持或与字段类型不符');
      return { fieldCode: field.code, normalizer };
    }).sort((a, b) => compare(a.fieldCode, b.fieldCode));
    const predicates = rule.when === undefined ? [] : rule.when;
    if (!Array.isArray(predicates) || predicates.length > 4)
      return fail(`${path}/when`, '最多 4 个合取条件');
    const seenConditions = new Set<string>();
    const when = predicates.map((raw: unknown, conditionIndex: number): DataUniqueKeyCondition => {
      const conditionPath = `${path}/when/${conditionIndex}`;
      if (!record(raw)) return fail(conditionPath, '条件必须是对象');
      const field = byCode.get(raw.fieldCode);
      if (!field) return fail(`${conditionPath}/fieldCode`, '字段不存在');
      let condition: DataUniqueKeyCondition;
      if (raw.operator === 'empty' || raw.operator === 'nonempty') {
        exactKeys(raw, ['fieldCode', 'operator'], conditionPath);
        if (field.type !== 'text.short') return fail(conditionPath, '空值条件仅支持短文本');
        condition = { fieldCode: field.code, operator: raw.operator };
      } else if (raw.operator === 'in' || raw.operator === 'notIn') {
        exactKeys(raw, ['fieldCode', 'operator', 'values'], conditionPath);
        const allowed = new Set((field.options ?? []).map(option => option.value));
        if (field.type !== 'option.single' || !Array.isArray(raw.values) || raw.values.length < 1 || raw.values.length > 16 ||
            raw.values.some((item: unknown) => typeof item !== 'string' || item.length < 1 || item.length > 128 || !allowed.has(item)) || new Set(raw.values).size !== raw.values.length)
          return fail(conditionPath, '集合条件需要 1 到 16 个不重复的已声明单选值');
        condition = { fieldCode: field.code, operator: raw.operator, values: [...raw.values].sort(compare) };
      } else if (raw.operator === 'eq' || raw.operator === 'ne') {
        exactKeys(raw, ['fieldCode', 'operator', 'value'], conditionPath);
        if (field.type !== 'boolean' || typeof raw.value !== 'boolean')
          return fail(conditionPath, '等值条件仅支持布尔字段和布尔值');
        condition = { fieldCode: field.code, operator: raw.operator, value: raw.value };
      } else return fail(`${conditionPath}/operator`, '只支持 empty、nonempty、in、notIn 和布尔 eq、ne');
      const identity = JSON.stringify(condition);
      if (seenConditions.has(identity)) return fail(conditionPath, '条件不能重复');
      seenConditions.add(identity);
      return condition;
    }).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
    return { code: rule.code, fields: keys, when };
  }).sort((a, b) => compare(a.code, b.code));
}

/** Existing declarations retain their canonical v1.0 capability requirement. */
export function nativeUniqueKeysContractVersion(fields: readonly Field[], rules?: readonly DataUniqueKey[]): '1.0.0' | '1.1.0' {
  const userFields = new Set(fields.filter(field => field.type === 'user.single').map(field => field.code));
  return rules?.some(rule => rule.fields.some(key => userFields.has(key.fieldCode)) ||
    rule.when?.some(condition => condition.operator === 'eq' || condition.operator === 'ne')) ? '1.1.0' : '1.0.0';
}

const fieldCode = { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]{0,62}$' };
export const nativeUniqueKeysJsonSchema = {
  type: 'array', maxItems: 8,
  items: {
    type: 'object', additionalProperties: false, required: ['code', 'fields'],
    properties: {
      code: { type: 'string', maxLength: 20, pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' },
      fields: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
        items: { type: 'object', additionalProperties: false, required: ['fieldCode'],
          properties: { fieldCode, normalizer: { enum: [...NATIVE_UNIQUE_KEY_NORMALIZERS] } } } },
      when: { type: 'array', maxItems: 4, uniqueItems: true, items: { oneOf: [
        { type: 'object', additionalProperties: false, required: ['fieldCode', 'operator'],
          properties: { fieldCode, operator: { enum: ['empty', 'nonempty'] } } },
        { type: 'object', additionalProperties: false, required: ['fieldCode', 'operator', 'values'],
          properties: { fieldCode, operator: { enum: ['in', 'notIn'] },
            values: { type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 128 } } } },
        { type: 'object', additionalProperties: false, required: ['fieldCode', 'operator', 'value'],
          properties: { fieldCode, operator: { enum: ['eq', 'ne'] }, value: { type: 'boolean' } } },
      ] } },
    },
  },
};
