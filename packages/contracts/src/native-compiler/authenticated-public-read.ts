import { DATA_AUDIT_METADATA_FIELDS } from './data-audit-access.js';
import { OPENXIANGDA_NATIVE_SYSTEM_FIELD_MAP_V2 } from './data-field.js';

type ObjectValue = Record<string, any>;
export class AuthenticatedPublicReadContractError extends Error {
  constructor(readonly code: string, readonly pointer: string) {
    super(code);
  }
}
const object = (value: unknown): ObjectValue =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as ObjectValue : {};
const matches = (granted: string, required: string) =>
  granted === required || granted === '*' ||
  granted.endsWith(':*') && required.startsWith(granted.slice(0, -1));

/** Prove a closed public business-field projection. Native's existing
 * same-member field eligibility and RLS remain the runtime authority. */
export function validateAuthenticatedPublicRead(input: {
  policy: ObjectValue;
  resource: ObjectValue | undefined;
  baselineRoleCode: string;
  baselineCapabilities: readonly string[];
  baselineDeniedCapabilities?: readonly string[];
  pointer: string;
}): void {
  const { policy, resource, baselineRoleCode, baselineCapabilities, pointer } = input;
  const canRead = (requirements: unknown): boolean =>
    requirements === undefined || requirements === true ||
    Array.isArray(requirements) && requirements.length > 0 &&
    requirements.every(required => typeof required === 'string' && required.length > 0 &&
      !input.baselineDeniedCapabilities?.some(denied => matches(denied, required)) &&
      baselineCapabilities.some(granted => matches(granted, required)));
  const fail = (code: string, suffix = ''): never => {
    throw new AuthenticatedPublicReadContractError(code, `${pointer}/publicRead${suffix}`);
  };
  const projection = object(policy.publicRead);
  if (!policy.publicRead || Object.keys(projection).length !== 1 ||
      !Object.hasOwn(projection, 'fields') || !Array.isArray(projection.fields) ||
      projection.fields.length < 1 || projection.fields.length > 1000 ||
      projection.fields.some((field: unknown) => typeof field !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(field)) ||
      new Set(projection.fields).size !== projection.fields.length) {
    fail('AUTHENTICATED_PUBLIC_READ_FIELDS_INVALID', '/fields');
  }
  if (!Array.isArray(policy.operations) || policy.operations.length !== 1 ||
      policy.operations[0] !== 'read' || policy.readExpression !== undefined ||
      policy.writeBoundary !== undefined) {
    fail('AUTHENTICATED_PUBLIC_READ_POLICY_NOT_READ_ONLY');
  }
  if (!baselineRoleCode || !resource || resource.code !== policy.resourceCode ||
      resource.dataPolicyCode !== policy.code ||
      !canRead([object(resource.capabilities).read])) {
    fail('AUTHENTICATED_PUBLIC_READ_BASELINE_OR_RESOURCE_INVALID');
  }
  const boundResource = object(resource);
  const fields = object(boundResource.schema).fields;
  if (!Array.isArray(fields) || !fields.length) {
    fail('AUTHENTICATED_PUBLIC_READ_RESOURCE_FIELDS_MISSING');
  }
  const declarations = new Map<string, ObjectValue>(fields.map((field: unknown) =>
    [String(object(field).code), object(field)]));
  const publicFields = new Set<string>(projection.fields);
  const policies = object(boundResource.fieldPolicies);
  for (const field of publicFields) {
    const declared = object(declarations.get(field));
    if (!declarations.has(field) || declared.system === true ||
        object(object(boundResource.surface).fields)[field]?.system === true ||
        OPENXIANGDA_NATIVE_SYSTEM_FIELD_MAP_V2.has(field)) {
      fail('AUTHENTICATED_PUBLIC_READ_FIELD_NOT_DECLARED', `/fields/${field}`);
    }
    if (declared.type === 'subtable' || declared.subtable !== undefined) {
      fail('AUTHENTICATED_PUBLIC_READ_SUBTABLE_UNSUPPORTED', `/fields/${field}`);
    }
    if (!canRead(object(policies[field]).read)) {
      fail('AUTHENTICATED_PUBLIC_READ_FIELD_NOT_BASELINE_READABLE', `/fields/${field}`);
    }
  }
  const privateFields = [...declarations.keys()].filter(field => !publicFields.has(field));
  for (const field of privateFields) {
    if (canRead(object(policies[field]).read)) {
      fail('AUTHENTICATED_PUBLIC_READ_PRIVATE_FIELD_ACCESSIBLE', `/fields/${field}`);
    }
  }
  if (privateFields.length && DATA_AUDIT_METADATA_FIELDS.some(field =>
    canRead(object(policies[field]).read))) {
    fail('AUTHENTICATED_PUBLIC_READ_PRIVATE_HISTORY_ACCESSIBLE');
  }
}
