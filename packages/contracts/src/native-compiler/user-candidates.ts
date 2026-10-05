/** Code-owned membership constraint, separate from resource display sources. */
export interface DataFieldUserCandidates {
  kind: 'app-role';
  roleCode: string;
  scope?: { dimensionCode: string; operation: string } & (
    | { value: string; field?: never; creation?: never }
    | { field: string; value?: never; creation?: 'prospective' }
  );
  pageSize?: number;
}

export const USER_CANDIDATE_MAX_SELECTIONS = 200;
export const USER_CANDIDATE_SCOPE_FIELD_TYPES = [
  'text.short',
  'uuid',
  'option.single',
  'resource-ref.single',
] as const;

type Field = {
  code: string;
  type: string;
  userCandidates?: DataFieldUserCandidates;
  subtable?: { resourceCode: string };
};
type TaskField = {
  code: string;
  readonly?: boolean;
  subtable?: { fields: TaskField[] };
};
type Definition = {
  subject: { resourceCode: string; factProjection: Record<string, string> };
  taskPages?: Record<string, { fields: TaskField[] }>;
};
type Entry = {
  provider: string;
  inputPath?: string;
  candidateField?: string;
  roleCode?: string;
  scope?: unknown;
  routing?: unknown;
};
const code = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const fieldCode = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.trim() === value &&
  value.length <= max;

export class UserCandidateContractError extends Error {
  constructor(readonly code: string, readonly pointer: string) {
    super(`${code}: ${pointer}`);
  }
}
function fail(code: string, pointer: string): never {
  throw new UserCandidateContractError(code, pointer);
}

/** Shared by application diagnostics and the server's native compiler. */
export function parseDataFieldUserCandidates(
  value: unknown,
  type: string,
  pointer: string
): DataFieldUserCandidates | undefined {
  if (value === undefined) return undefined;
  if (!['user.single', 'user.multiple'].includes(type))
    fail('DATA_USER_CANDIDATES_FIELD_TYPE_INVALID', pointer);
  if (
    !record(value) ||
    !exact(value, ['kind', 'roleCode', 'scope', 'pageSize']) ||
    value.kind !== 'app-role' ||
    !text(value.roleCode, 128) ||
    !code.test(String(value.roleCode))
  )
    fail('DATA_USER_CANDIDATES_SOURCE_INVALID', pointer);
  if (
    value.pageSize !== undefined &&
    (!Number.isSafeInteger(value.pageSize) ||
      Number(value.pageSize) < 1 ||
      Number(value.pageSize) > 50)
  )
    fail('DATA_USER_CANDIDATES_PAGE_SIZE_INVALID', `${pointer}/pageSize`);
  let scope: DataFieldUserCandidates['scope'];
  if (value.scope !== undefined) {
    const raw = value.scope;
    if (
      !record(raw) ||
      !exact(raw, ['dimensionCode', 'operation', 'field', 'value', 'creation']) ||
      !text(raw.dimensionCode, 128) ||
      !code.test(String(raw.dimensionCode)) ||
      !text(raw.operation, 64) ||
      !code.test(String(raw.operation)) ||
      Object.hasOwn(raw, 'field') === Object.hasOwn(raw, 'value')
    )
      fail('DATA_USER_CANDIDATES_SCOPE_INVALID', `${pointer}/scope`);
    if (raw.creation !== undefined &&
        (raw.creation !== 'prospective' || !Object.hasOwn(raw, 'field')))
      fail('DATA_USER_CANDIDATES_SCOPE_INVALID', `${pointer}/scope/creation`);
    if (Object.hasOwn(raw, 'field')) {
      if (
        !text(raw.field, 63) ||
        !fieldCode.test(String(raw.field)) ||
        forbidden.has(String(raw.field))
      )
        fail(
          'DATA_USER_CANDIDATES_SCOPE_FIELD_INVALID',
          `${pointer}/scope/field`
        );
      scope = {
        dimensionCode: String(raw.dimensionCode),
        operation: String(raw.operation),
        field: String(raw.field),
        ...(raw.creation === 'prospective' ? { creation: 'prospective' as const } : {}),
      };
    } else {
      if (!text(raw.value, 255))
        fail(
          'DATA_USER_CANDIDATES_SCOPE_VALUE_INVALID',
          `${pointer}/scope/value`
        );
      scope = {
        dimensionCode: String(raw.dimensionCode),
        operation: String(raw.operation),
        value: String(raw.value),
      };
    }
  }
  return {
    kind: 'app-role',
    roleCode: String(value.roleCode),
    ...(scope ? { scope } : {}),
    ...(value.pageSize === undefined
      ? {}
      : { pageSize: Number(value.pageSize) }),
  };
}

/** Additive runtime negotiation for pre-save scopes and resource identities. */
export function requiresUserCandidateLaunchScope(resources: readonly {
  schema: { fields: readonly Field[] };
}[]): boolean {
  return resources.some(resource => resource.schema.fields.some(field => {
    const scope = field.userCandidates?.scope;
    return scope?.creation === 'prospective' || Boolean(scope?.field &&
      resource.schema.fields.find(dependency => dependency.code === scope.field)?.type === 'resource-ref.single');
  }));
}

export function validateUserCandidateReferences(
  fields: readonly Field[],
  roleCodes: ReadonlySet<string>,
  dimensionCodes: ReadonlySet<string>,
  pointer: string
): void {
  for (const [index, field] of fields.entries()) {
    const path = `${pointer}/${index}/userCandidates`;
    const source = parseDataFieldUserCandidates(
      field.userCandidates,
      field.type,
      path
    );
    if (!source) continue;
    if (!roleCodes.has(source.roleCode))
      fail('DATA_USER_CANDIDATES_ROLE_UNDECLARED', `${path}/roleCode`);
    if (source.scope && !dimensionCodes.has(source.scope.dimensionCode))
      fail(
        'DATA_USER_CANDIDATES_DIMENSION_UNDECLARED',
        `${path}/scope/dimensionCode`
      );
    if (source.scope?.field) {
      const dependency = fields.find(
        (item) => item.code === source.scope!.field
      );
      if (
        !dependency ||
        !USER_CANDIDATE_SCOPE_FIELD_TYPES.some(
          (type) => type === dependency.type
        )
      )
        fail('DATA_USER_CANDIDATES_SCOPE_FIELD_INVALID', `${path}/scope/field`);
    }
  }
}

/** Resolve fixed fact paths, never caller-supplied scope bindings. */
export function resolveWorkflowUserCandidates(
  definition: Definition,
  entry: Entry,
  fields: ReadonlyMap<string, Field>,
  pointer: string
) {
  const projection = definition.subject.factProjection;
  // A path into a constrained value (including a nested projected fact) must not
  // downgrade to the unrestricted input_users/form_field_users path.
  const constrained =
    typeof entry.inputPath === 'string' &&
    Object.entries(projection).some(
      ([path, field]) =>
        (entry.inputPath === path || entry.inputPath!.startsWith(`${path}.`)) &&
        fields.get(field)?.userCandidates !== undefined
    );
  if (entry.candidateField === undefined && !constrained) return undefined;
  if (
    entry.provider !== 'form_field_users' ||
    !entry.candidateField ||
    !fieldCode.test(entry.candidateField) ||
    forbidden.has(entry.candidateField) ||
    !entry.inputPath ||
    projection[entry.inputPath] !== entry.candidateField
  )
    fail('WORKFLOW_USER_CANDIDATES_FIELD_BINDING_REQUIRED', pointer);
  if (
    entry.roleCode !== undefined ||
    entry.scope !== undefined ||
    entry.routing !== undefined
  )
    fail('WORKFLOW_USER_CANDIDATES_SOURCE_OVERRIDE_FORBIDDEN', pointer);
  const field = fields.get(entry.candidateField);
  const source =
    field &&
    parseDataFieldUserCandidates(
      field.userCandidates,
      field.type,
      `${pointer}/candidateField`
    );
  if (!source)
    fail(
      'WORKFLOW_USER_CANDIDATES_FIELD_UNDECLARED',
      `${pointer}/candidateField`
    );
  let scopeInputPath: string | undefined;
  if (source.scope?.field) {
    const paths = Object.entries(projection)
      .filter(([, code]) => code === source.scope!.field)
      .map(([path]) => path);
    if (paths.length !== 1)
      fail('WORKFLOW_USER_CANDIDATES_SCOPE_PROJECTION_REQUIRED', pointer);
    scopeInputPath = paths[0]!;
  }
  return {
    fieldCode: field!.code,
    inputPath: entry.inputPath,
    source,
    ...(scopeInputPath ? { scopeInputPath } : {}),
  };
}

export function validateWorkflowUserCandidateBindings(
  definition: Definition,
  binding: { bindings: Record<string, Entry> },
  fields: ReadonlyMap<string, Field>,
  pointer: string,
  resourceFields: ReadonlyMap<string, ReadonlyMap<string, Field>> = new Map()
): void {
  for (const [code, entry] of Object.entries(binding.bindings))
    resolveWorkflowUserCandidates(
      definition,
      entry,
      fields,
      `${pointer}/${code}`
    );
  for (const [pageCode, page] of Object.entries(definition.taskPages || {})) {
    const writable = new Set(
      page.fields
        .filter((field) => field.readonly !== true)
        .map((field) => field.code)
    );
    for (const field of page.fields) {
      const scope = fields.get(field.code)?.userCandidates?.scope;
      if (writable.has(field.code) && scope?.field && writable.has(scope.field))
        fail(
          'WORKFLOW_USER_CANDIDATES_SCOPE_WRITE_FORBIDDEN',
          `${pointer}/taskPages/${pageCode}/${field.code}`
        );
      if (!writable.has(field.code) || !field.subtable) continue;
      const childResource = fields.get(field.code)?.subtable?.resourceCode;
      const childFields = childResource
        ? resourceFields.get(childResource)
        : undefined;
      if (
        field.subtable.fields.some(
          (child) =>
            child.readonly !== true &&
            childFields?.get(child.code)?.userCandidates
        )
      )
        fail(
          'WORKFLOW_USER_CANDIDATES_OWNED_FIELD_UNSUPPORTED',
          `${pointer}/taskPages/${pageCode}/${field.code}`
        );
    }
  }
}

/** Single options store a stable value/label envelope; identity uses its value. */
export function userCandidateScopeValue(
  source: DataFieldUserCandidates,
  recordValues: Record<string, unknown>
): string | undefined {
  if (!source.scope) return undefined;
  const raw = source.scope.field
    ? recordValues[source.scope.field]
    : source.scope.value;
  const value = record(raw) ? raw.value : raw;
  if (!text(value, 255))
    fail(
      'DATA_USER_CANDIDATES_SCOPE_VALUE_REQUIRED',
      source.scope.field || 'scope'
    );
  return String(value);
}
