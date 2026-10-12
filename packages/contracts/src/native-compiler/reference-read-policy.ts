import { nativeDataPolicyExpressionLeavesV2 } from './data-policy-expression.js';
import { resolveNativeParentReadBinding } from './parent-read-policy.js';

type JsonObject = Record<string, any>;
const resourcePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const fieldPattern = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const auditFields = new Set([
  'id',
  'revision',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
]);
export const NATIVE_REFERENCE_READ_MAX_DEPTH = 2;

export class NativeReferenceReadPolicyError extends Error {
  constructor(readonly code: string, readonly pointer: string) {
    super(`${code}: ${pointer}`);
  }
}
export function parseNativeReferenceReadPolicy(
  value: unknown,
  pointer: string
): {
  resourceCode: string;
  referenceFieldCode: string;
  readFields: string[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NativeReferenceReadPolicyError('NATIVE_REFERENCE_READ_INVALID', pointer);
  const source = value as JsonObject;
  if (
    Object.keys(source).some(
      (key) => !['resourceCode', 'referenceFieldCode', 'readFields'].includes(key)
    ) ||
    typeof source.resourceCode !== 'string' ||
    source.resourceCode.length > 64 ||
    !resourcePattern.test(source.resourceCode) ||
    typeof source.referenceFieldCode !== 'string' ||
    !fieldPattern.test(source.referenceFieldCode) ||
    !Array.isArray(source.readFields) ||
    source.readFields.length === 0 ||
    source.readFields.length > 64 ||
    source.readFields.some(
      (field: unknown) => typeof field !== 'string' || !fieldPattern.test(field)
    ) ||
    new Set(source.readFields).size !== source.readFields.length
  )
    throw new NativeReferenceReadPolicyError('NATIVE_REFERENCE_READ_INVALID', pointer);
  return {
    resourceCode: source.resourceCode,
    referenceFieldCode: source.referenceFieldCode,
    readFields: [...source.readFields],
  };
}
function leaves(policy: JsonObject, pointer: string) {
  return [
    ...(Array.isArray(policy.rules) ? policy.rules : []).map((rule: JsonObject, index: number) => ({
      rule,
      pointer: `${pointer}/rules/${index}`,
      base: true,
    })),
    ...(policy.readExpression === undefined
      ? []
      : nativeDataPolicyExpressionLeavesV2(policy.readExpression, `${pointer}/readExpression`).map(
          (entry) => ({ ...entry, base: false })
        )),
  ];
}
export function hasNativeReferenceReadPolicy(policy: JsonObject): boolean {
  return leaves(policy, '/dataPolicy').some((entry) => entry.rule.referenceRead !== undefined);
}
export function resolveNativeReferenceReadBinding(
  resources: JsonObject[],
  childCode: string,
  value: unknown,
  pointer: string
) {
  const reference = parseNativeReferenceReadPolicy(value, pointer);
  const parent = resources.find((resource) => resource.code === reference.resourceCode);
  const child = resources.find((resource) => resource.code === childCode);
  const fields: JsonObject[] = Array.isArray(child?.schema?.fields) ? child.schema.fields : [];
  const field = fields.find((field) => field.code === reference.referenceFieldCode);
  if (
    !parent ||
    !child ||
    parent.code === child.code ||
    field?.type !== 'resource-ref.single' ||
    field.source?.kind !== 'resource' ||
    field.source?.resourceCode !== parent.code
  )
    throw new NativeReferenceReadPolicyError('NATIVE_REFERENCE_READ_BINDING_INVALID', pointer);
  const parentFields = new Set(
    (Array.isArray(parent.schema?.fields) ? parent.schema.fields : []).map(
      (field: JsonObject) => field.code
    )
  );
  if (reference.readFields.some((field) => !parentFields.has(field) && !auditFields.has(field)))
    throw new NativeReferenceReadPolicyError(
      'NATIVE_REFERENCE_READ_PROJECTION_INVALID',
      `${pointer}/readFields`
    );
  return { ...reference, childResourceCode: childCode };
}
/** Opt-in reference capability seals the complete mixed dependency graph. */
export function validateNativeReferenceReadPolicies(
  resources: JsonObject[],
  policies: JsonObject[],
  pointer = '/config/authz/dataPolicies'
) {
  if (!policies.some(hasNativeReferenceReadPolicy)) return;
  const dependencies = new Map<string, string>();
  for (const [index, policy] of policies.entries()) {
    for (const entry of leaves(policy, `${pointer}/${index}`)) {
      let parent: string | undefined;
      if (entry.rule.referenceRead !== undefined) {
        if (Object.keys(entry.rule).some((key) => !['referenceRead', 'roleCodes'].includes(key)))
          throw new NativeReferenceReadPolicyError(
            'NATIVE_REFERENCE_READ_RULE_KEYS_INVALID',
            entry.pointer
          );
        if (entry.base && (policy.operations?.length !== 1 || policy.operations[0] !== 'read'))
          throw new NativeReferenceReadPolicyError(
            'NATIVE_REFERENCE_READ_READ_ONLY',
            entry.pointer
          );
        const child = resources.find((resource) => resource.code === policy.resourceCode);
        if (child?.dataPolicyCode !== policy.code)
          throw new NativeReferenceReadPolicyError(
            'NATIVE_REFERENCE_READ_POLICY_BINDING_INVALID',
            entry.pointer
          );
        const binding = resolveNativeReferenceReadBinding(
          resources,
          policy.resourceCode,
          entry.rule.referenceRead,
          `${entry.pointer}/referenceRead`
        );
        const parentResource = resources.find(
          (resource) => resource.code === binding.resourceCode
        )!;
        const parentPolicy = policies.find(
          (policy) =>
            policy.code === parentResource.dataPolicyCode &&
            policy.resourceCode === binding.resourceCode
        );
        if (!parentPolicy)
          throw new NativeReferenceReadPolicyError(
            'NATIVE_REFERENCE_READ_PARENT_POLICY_MISSING',
            entry.pointer
          );
        const requiredFields = leaves(parentPolicy, '/parentPolicy')
          .map(({ rule }) =>
            rule.referenceRead !== undefined
              ? parseNativeReferenceReadPolicy(rule.referenceRead, '/parentPolicy/referenceRead')
                  .referenceFieldCode
              : rule.parentRead !== undefined
              ? resolveNativeParentReadBinding(
                  resources,
                  binding.resourceCode,
                  rule.parentRead,
                  '/parentPolicy/parentRead'
                ).foreignKey
              : rule.field
          )
          .filter((field): field is string => typeof field === 'string');
        if (requiredFields.some((field) => !binding.readFields.includes(field)))
          throw new NativeReferenceReadPolicyError(
            'NATIVE_REFERENCE_READ_AUTHORIZATION_PROJECTION_MISSING',
            `${entry.pointer}/referenceRead/readFields`
          );
        parent = binding.resourceCode;
      } else if (entry.rule.parentRead !== undefined) {
        parent = resolveNativeParentReadBinding(
          resources,
          policy.resourceCode,
          entry.rule.parentRead,
          `${entry.pointer}/parentRead`
        ).resourceCode;
      }
      if (!parent) continue;
      const previous = dependencies.get(policy.resourceCode);
      if (previous && previous !== parent)
        throw new NativeReferenceReadPolicyError(
          'NATIVE_REFERENCE_READ_PARENT_AMBIGUOUS',
          entry.pointer
        );
      dependencies.set(policy.resourceCode, parent);
    }
  }
  for (const start of dependencies.keys()) {
    const visited = new Set([start]);
    let current = start,
      depth = 0;
    while (dependencies.has(current)) {
      current = dependencies.get(current)!;
      if (visited.has(current))
        throw new NativeReferenceReadPolicyError('NATIVE_REFERENCE_READ_CYCLE', pointer);
      visited.add(current);
      if (++depth > NATIVE_REFERENCE_READ_MAX_DEPTH)
        throw new NativeReferenceReadPolicyError('NATIVE_REFERENCE_READ_DEPTH_EXCEEDED', pointer);
    }
  }
}
