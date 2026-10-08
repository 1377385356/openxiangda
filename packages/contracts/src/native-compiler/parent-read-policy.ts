import { nativeDataPolicyExpressionLeavesV2 } from './data-policy-expression.js';

type JsonObject = Record<string, any>;

export class NativeParentReadPolicyError extends Error {
  constructor(readonly code: string, readonly pointer: string) {
    super(`${code}: ${pointer}`);
  }
}

const resourcePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const fieldPattern = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** Application input names a sealed subtable, never a table name or foreign key. */
export function parseNativeParentReadPolicy(value: unknown, pointer: string): {
  resourceCode: string; subtableFieldCode: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_INVALID', pointer);
  const source = value as JsonObject;
  if (Object.keys(source).some(key => !['resourceCode', 'subtableFieldCode'].includes(key)) ||
      typeof source.resourceCode !== 'string' || source.resourceCode.length > 64 ||
      !resourcePattern.test(source.resourceCode) ||
      typeof source.subtableFieldCode !== 'string' || !fieldPattern.test(source.subtableFieldCode))
    throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_INVALID', pointer);
  return { resourceCode: source.resourceCode, subtableFieldCode: source.subtableFieldCode };
}

function leaves(policy: JsonObject, pointer: string) {
  return [
    ...(Array.isArray(policy.rules) ? policy.rules : []).map((rule: JsonObject, index: number) => ({ rule, pointer: `${pointer}/rules/${index}`, base: true })),
    ...(policy.readExpression === undefined ? [] : nativeDataPolicyExpressionLeavesV2(policy.readExpression, `${pointer}/readExpression`)
      .map(entry => ({ ...entry, base: false }))),
  ];
}

export function resolveNativeParentReadBinding(resources: JsonObject[], childCode: string, value: unknown, pointer: string) {
  const parentRead = parseNativeParentReadPolicy(value, pointer);
  const parent = resources.find(resource => resource.code === parentRead.resourceCode);
  const child = resources.find(resource => resource.code === childCode);
  const parentFields: JsonObject[] = Array.isArray(parent?.schema?.fields) ? parent.schema.fields : [];
  const field = parentFields.find((field: JsonObject) => field.code === parentRead.subtableFieldCode);
  if (!parent || !child || parent.code === child.code || field?.type !== 'subtable' ||
      field.subtable?.resourceCode !== childCode)
    throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_BINDING_INVALID', pointer);
  const owners = resources.flatMap(resource => (Array.isArray(resource.schema?.fields) ? resource.schema.fields : [])
    .filter((candidate: JsonObject) => candidate.type === 'subtable' && candidate.subtable?.resourceCode === childCode)
    .map((candidate: JsonObject) => ({ resource, field: candidate })));
  if (owners.length !== 1)
    throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_PARENT_AMBIGUOUS', pointer);
  const foreignKey = field.subtable.foreignKey;
  const childFields: JsonObject[] = Array.isArray(child.schema?.fields) ? child.schema.fields : [];
  const childField = childFields.find((candidate: JsonObject) => candidate.code === foreignKey);
  if (typeof foreignKey !== 'string' || !fieldPattern.test(foreignKey) || childField?.type !== 'uuid')
    throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_FOREIGN_KEY_INVALID', pointer);
  return { ...parentRead, childResourceCode: childCode, foreignKey,
    ...(field.subtable.orderField ? { orderField: field.subtable.orderField } : {}) };
}

/** First version is one level. A parent cannot itself inherit another parent. */
export function validateNativeParentReadPolicies(resources: JsonObject[], policies: JsonObject[], pointer = '/config/authz/dataPolicies') {
  const dependencies = new Map<string, string>();
  for (const [index, policy] of policies.entries()) {
    for (const entry of leaves(policy, `${pointer}/${index}`)) {
      if (entry.rule.parentRead === undefined) continue;
      if (Object.keys(entry.rule).some(key => !['parentRead', 'roleCodes'].includes(key)))
        throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_RULE_KEYS_INVALID', entry.pointer);
      if (entry.base && (policy.operations?.length !== 1 || policy.operations[0] !== 'read'))
        throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_READ_ONLY', entry.pointer);
      const child = resources.find(resource => resource.code === policy.resourceCode);
      if (child?.dataPolicyCode !== policy.code)
        throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_POLICY_BINDING_INVALID', entry.pointer);
      const binding = resolveNativeParentReadBinding(resources, policy.resourceCode, entry.rule.parentRead, `${entry.pointer}/parentRead`);
      const existing = dependencies.get(policy.resourceCode);
      if (existing && existing !== binding.resourceCode)
        throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_PARENT_AMBIGUOUS', entry.pointer);
      dependencies.set(policy.resourceCode, binding.resourceCode);
    }
  }
  for (const [child, parent] of dependencies) {
    if (dependencies.has(parent))
      throw new NativeParentReadPolicyError('NATIVE_PARENT_READ_MULTI_HOP_FORBIDDEN', `${pointer}/${policies.findIndex(policy => policy.resourceCode === child)}`);
  }
}

export function hasNativeParentReadPolicy(policy: JsonObject): boolean {
  return leaves(policy, '/dataPolicy').some(entry => entry.rule.parentRead !== undefined);
}
