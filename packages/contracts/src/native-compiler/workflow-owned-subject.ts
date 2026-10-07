import { DATA_SUBTABLE_MAX_ROWS, DATA_SUBTABLE_MAX_TOTAL_ROWS } from './data-capacity.js';

/** Immutable create-only closure. It never grants ordinary child CRUD. */
export interface WorkflowOwnedSubjectCreate {
  mode: 'create';
  resourceCode: string;
  subtables: readonly { fieldCode: string; fieldCodes: readonly string[] }[];
}

const fieldPattern = '^[A-Za-z][A-Za-z0-9_]{0,62}$';
const resourcePattern = '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$';
export const workflowOwnedSubjectCreateSchema = {
  type: 'object', additionalProperties: false, required: ['mode', 'resourceCode', 'subtables'],
  properties: {
    mode: { const: 'create' },
    resourceCode: { type: 'string', maxLength: 64, pattern: resourcePattern },
    subtables: { type: 'array', minItems: 1, maxItems: 16, items: {
      type: 'object', additionalProperties: false, required: ['fieldCode', 'fieldCodes'],
      properties: {
        fieldCode: { type: 'string', pattern: fieldPattern },
        fieldCodes: { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: { type: 'string', pattern: fieldPattern } },
      },
    } },
  },
} as const;

/** Also used for sealed server contracts; callers cannot supply this grant. */
export function assertWorkflowOwnedSubjectCreate(value: unknown): asserts value is WorkflowOwnedSubjectCreate {
  const record = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item));
  const code = (item: unknown) => typeof item === 'string' && new RegExp(fieldPattern).test(item) && !['__proto__', 'prototype', 'constructor'].includes(item);
  if (!record(value) || Object.keys(value).some(key => !['mode', 'resourceCode', 'subtables'].includes(key)) ||
      value.mode !== 'create' || typeof value.resourceCode !== 'string' || value.resourceCode.length > 64 || !new RegExp(resourcePattern).test(value.resourceCode) ||
      !Array.isArray(value.subtables) || value.subtables.length < 1 || value.subtables.length > 16 ||
      value.subtables.some(item => !record(item) || Object.keys(item).some(key => !['fieldCode', 'fieldCodes'].includes(key)) ||
        !code(item.fieldCode) || !Array.isArray(item.fieldCodes) || item.fieldCodes.length < 1 || item.fieldCodes.length > 200 ||
        new Set(item.fieldCodes).size !== item.fieldCodes.length || item.fieldCodes.some(field => !code(field))) ||
      new Set(value.subtables.map(item => item.fieldCode)).size !== value.subtables.length) {
    throw new Error('WORKFLOW_OWNED_SUBJECT_CREATE_INVALID');
  }
}

export function normalizeWorkflowOwnedSubjectCreate(value: WorkflowOwnedSubjectCreate): WorkflowOwnedSubjectCreate {
  assertWorkflowOwnedSubjectCreate(value);
  return { mode: 'create', resourceCode: value.resourceCode, subtables: value.subtables.map(table => ({
    fieldCode: table.fieldCode, fieldCodes: [...table.fieldCodes].sort(),
  })).sort((a, b) => a.fieldCode.localeCompare(b.fieldCode)) };
}

/** One validator for published compilation and authenticated connected development. */
export function assertWorkflowOwnedSubjectCreateResources(
  grant: WorkflowOwnedSubjectCreate,
  resourceFields: ReadonlyMap<string, ReadonlyMap<string, Record<string, any>>>,
  managedFiles: readonly { resourceCode: string; fieldCodes: readonly string[]; intents: readonly string[] }[],
): void {
  assertWorkflowOwnedSubjectCreate(grant);
  const fail = (reason: string): never => { throw new Error(`WORKFLOW_OWNED_SUBJECT_${reason}`); };
  const fields = resourceFields.get(grant.resourceCode);
  if (!fields) fail('RESOURCE_MISSING');
  const children = new Set<string>();
  let budget = 0;
  for (const table of grant.subtables) {
    const field = fields!.get(table.fieldCode);
    const relation = field?.subtable;
    const child = resourceFields.get(relation?.resourceCode);
    if (field?.type !== 'subtable' || !child || relation.resourceCode === grant.resourceCode || children.has(relation.resourceCode))
      fail('RELATION_INVALID');
    children.add(relation.resourceCode);
    const maximum = relation.maxRows ?? 20;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > DATA_SUBTABLE_MAX_ROWS) fail('BUDGET_EXCEEDED');
    budget += maximum;
    for (const code of table.fieldCodes) {
      const definition = child!.get(code);
      if (!definition || ['serial-number', 'subtable'].includes(definition.type) || [relation.foreignKey, relation.orderField].includes(code))
        fail('FIELD_INVALID');
      if (['file', 'image', 'signature', 'text.rich'].includes(definition!.type) && !managedFiles.some(file =>
        file.resourceCode === relation.resourceCode && file.fieldCodes.includes(code) && file.intents.includes('create')))
        fail('FILE_ACCESS_REQUIRED');
    }
  }
  if (budget > DATA_SUBTABLE_MAX_TOTAL_ROWS) fail('BUDGET_EXCEEDED');
}
