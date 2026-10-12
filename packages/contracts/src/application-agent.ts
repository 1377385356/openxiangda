import { DATA_FIELD_TYPES } from './types.js';
import type { AiJsonSchema, AiConfirmationPolicy } from './ai.js';
import type { DataFieldType } from './types.js';

export interface ApplicationAgentTaskBaseV2 {
  code: string;
  name?: string;
  description?: string;
  resource: string;
  view: string;
  examples?: string[];
}

export type ApplicationAgentTaskDeclarationV2 =
  | (ApplicationAgentTaskBaseV2 & {
      kind: 'view';
      filters?: string[];
    })
  | (ApplicationAgentTaskBaseV2 & {
      kind: 'form';
      action: 'create' | 'update';
      fields: string[];
      confirmation?: AiConfirmationPolicy;
    });

/** Authoring only. File references are inlined by the bounded workspace loader. */
export interface ApplicationAgentDeclarationV2 {
  code: string;
  name: string;
  purpose: string;
  instructions: string | { file: string };
  starters?: string[];
  tasks: ApplicationAgentTaskDeclarationV2[];
}

export interface ApplicationAgentDefinitionV2 {
  code: string;
  name: string;
  purpose: string;
  instructions: string;
  starters: string[];
  tasks: Array<{ code: string; capabilityCode: string }>;
  digest: string;
}

export interface ApplicationAgentDefinitionsV2 {
  schemaVersion: 'openxiangda.application-agent-definitions/v2';
  appCode: string;
  agents: ApplicationAgentDefinitionV2[];
}

/** Routing only. The selected owner still authorizes the ordinary field value. */
export type NativeAgentSelectorV2 =
  | { owner: 'directory' | 'user-candidates' | 'field-source' | 'options' }
  | { owner: 'scope'; dimensionCode: string };

export interface NativeAgentFieldCoverageV2 {
  field: string;
  selector?: NativeAgentSelectorV2;
  create: boolean;
  update: boolean;
  filter: boolean;
  output: 'label' | 'value' | 'page';
  reason?: 'multiple-scope-dimensions' | 'saved-scope-required';
}

/** The command owns field value schemas; this descriptor never redescribes them. */
export interface NativeAgentFormDescriptorV2 {
  contractVersion: 2;
  action: 'create' | 'update';
  title: string;
  submitLabel: string;
  resource: string;
  view: string;
  fields: Array<{
    path: string;
    label: string;
    fieldType: DataFieldType;
    required: boolean;
    source: { resource: string; field: string };
    selector?: NativeAgentSelectorV2;
  }>;
}

export interface NativeAgentTaskMetadataV2 {
  contractVersion: 2;
  agentCode: string;
  taskCode: string;
  /** Input assistance only. It cannot be sent to the command owner. */
  hintSchema: AiJsonSchema;
  coverage?: NativeAgentFieldCoverageV2[];
  form?: NativeAgentFormDescriptorV2;
}

export type NativeAgentTaskBindingV2 =
  | { kind: 'native-view'; resourceCode: string; viewCode: string; filterFields: string[] }
  | { kind: 'native-form'; resourceCode: string; viewCode: string; action: 'create' | 'update'; fields: string[] };

const stableCode = { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$' };
const fieldNames = { type: 'array', maxItems: 20, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 100 } };
const selectorSchema = { oneOf: [
  { type: 'object', additionalProperties: false, required: ['owner'], properties: { owner: { enum: ['directory', 'user-candidates', 'field-source', 'options'] } } },
  { type: 'object', additionalProperties: false, required: ['owner', 'dimensionCode'], properties: { owner: { const: 'scope' }, dimensionCode: stableCode } },
] };
const coverageSchema = { type: 'array', maxItems: 500, items: {
  type: 'object', additionalProperties: false, required: ['field', 'create', 'update', 'filter', 'output'],
  properties: { field: { type: 'string', minLength: 1, maxLength: 100 }, selector: selectorSchema,
    create: { type: 'boolean' }, update: { type: 'boolean' }, filter: { type: 'boolean' },
    output: { enum: ['label', 'value', 'page'] }, reason: { enum: ['multiple-scope-dimensions', 'saved-scope-required'] } },
} };
const taskBase = { code: stableCode, name: { type: 'string', minLength: 1, maxLength: 80 },
  description: { type: 'string', minLength: 1, maxLength: 1000 }, resource: stableCode, view: stableCode,
  examples: { type: 'array', maxItems: 12, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 160 } } };
export const applicationAgentDeclarationSchemaV2 = {
  type: 'object', additionalProperties: false, required: ['code', 'name', 'purpose', 'instructions', 'tasks'],
  properties: {
    code: stableCode, name: { type: 'string', minLength: 1, maxLength: 80 },
    purpose: { type: 'string', minLength: 1, maxLength: 1000 }, instructions: { type: 'string', minLength: 1, maxLength: 16000 },
    starters: { type: 'array', maxItems: 12, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 160 } },
    tasks: { type: 'array', minItems: 1, maxItems: 20, items: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['code', 'kind', 'resource', 'view'],
        properties: { ...taskBase, kind: { const: 'view' }, filters: fieldNames } },
      { type: 'object', additionalProperties: false, required: ['code', 'kind', 'resource', 'view', 'action', 'fields'],
        properties: { ...taskBase, kind: { const: 'form' }, action: { enum: ['create', 'update'] },
          fields: { ...fieldNames, minItems: 1 }, confirmation: { enum: ['none', 'required'] } } },
    ] } },
  },
} as const;
export const nativeAgentTaskBindingSchemaV2 = { oneOf: [
  { type: 'object', additionalProperties: false, required: ['kind', 'resourceCode', 'viewCode', 'filterFields'],
    properties: { kind: { const: 'native-view' }, resourceCode: stableCode, viewCode: stableCode, filterFields: fieldNames } },
  { type: 'object', additionalProperties: false, required: ['kind', 'resourceCode', 'viewCode', 'action', 'fields'],
    properties: { kind: { const: 'native-form' }, resourceCode: stableCode, viewCode: stableCode,
      action: { enum: ['create', 'update'] }, fields: { ...fieldNames, minItems: 1 } } },
] } as const;
export const nativeAgentTaskMetadataSchemaV2 = {
  type: 'object', additionalProperties: false, required: ['contractVersion', 'agentCode', 'taskCode', 'hintSchema'],
  properties: { contractVersion: { const: 2 }, agentCode: stableCode, taskCode: stableCode, hintSchema: { type: 'object' },
    coverage: coverageSchema,
    form: { type: 'object', additionalProperties: false,
      required: ['contractVersion', 'action', 'title', 'submitLabel', 'resource', 'view', 'fields'],
      properties: { contractVersion: { const: 2 }, action: { enum: ['create', 'update'] },
        title: { type: 'string', minLength: 1, maxLength: 80 }, submitLabel: { type: 'string', minLength: 1, maxLength: 40 },
        resource: stableCode, view: stableCode, fields: { type: 'array', minItems: 1, maxItems: 20,
          items: { type: 'object', additionalProperties: false, required: ['path', 'label', 'fieldType', 'required', 'source'],
            properties: { path: { type: 'string', minLength: 1, maxLength: 100 }, label: { type: 'string', minLength: 1, maxLength: 500 },
              fieldType: { enum: DATA_FIELD_TYPES }, required: { type: 'boolean' },
              selector: selectorSchema,
              source: { type: 'object', additionalProperties: false, required: ['resource', 'field'],
                properties: { resource: stableCode, field: { type: 'string', minLength: 1, maxLength: 100 } } } } } } },
    },
  },
} as const;

/** Structural validation only. The native compiler additionally reproduces bindings from the sealed resource/view graph. */
export function validNativeAgentCapabilityV2(raw: Record<string, any>): boolean {
  const isObject = (v: any): v is Record<string, any> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const exact = (v: Record<string, any>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
  const nonEmpty = (v: any, max = 100) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const names = (v: any, min = 0) => Array.isArray(v) && v.length >= min && v.length <= 20 && new Set(v).size === v.length && v.every(k => nonEmpty(k));
  const binding = raw.binding, meta = raw.agent?.nativeTask;
  if (!isObject(binding) || !isObject(meta) || !isObject(raw.agent) || raw.agent.visibility !== 'task' ||
    !exact(raw.agent, ['visibility', 'examples', 'nativeTask']) ||
    (raw.agent.examples !== undefined && (!Array.isArray(raw.agent.examples) || raw.agent.examples.length > 12 ||
      new Set(raw.agent.examples).size !== raw.agent.examples.length || raw.agent.examples.some((example: any) => !nonEmpty(example, 160)))) ||
    !exact(meta, ['contractVersion', 'agentCode', 'taskCode', 'hintSchema', 'coverage', 'form']) || meta.contractVersion !== 2 ||
    !nonEmpty(meta.agentCode) || !nonEmpty(meta.taskCode) || !isObject(meta.hintSchema) || meta.hintSchema.type !== 'object' ||
    !nonEmpty(binding.resourceCode) || !nonEmpty(binding.viewCode) || raw.resources?.length !== 1 || raw.resources[0] !== binding.resourceCode ||
    raw.generatedFrom !== undefined || raw.code !== `${raw.appCode}.agent.${meta.agentCode}.${meta.taskCode}`) return false;
  const validSelector = (v: any) => isObject(v) && (v.owner === 'scope'
    ? exact(v, ['owner', 'dimensionCode']) && nonEmpty(v.dimensionCode)
    : exact(v, ['owner']) && ['directory', 'user-candidates', 'field-source', 'options'].includes(v.owner));
  if (meta.coverage !== undefined && (!Array.isArray(meta.coverage) || meta.coverage.length > 500 ||
    new Set(meta.coverage.map((entry: any) => entry?.field)).size !== meta.coverage.length || meta.coverage.some((entry: any) =>
      !isObject(entry) || !exact(entry, ['field', 'selector', 'create', 'update', 'filter', 'output', 'reason']) || !nonEmpty(entry.field) ||
      ['create', 'update', 'filter'].some(key => typeof entry[key] !== 'boolean') || !['label', 'value', 'page'].includes(entry.output) ||
      (entry.selector !== undefined && !validSelector(entry.selector)) ||
      (entry.reason !== undefined && !['multiple-scope-dimensions', 'saved-scope-required'].includes(entry.reason))))) return false;
  if (binding.kind === 'native-view') return exact(binding, ['kind', 'resourceCode', 'viewCode', 'filterFields']) && names(binding.filterFields) &&
    meta.form === undefined && raw.operation === 'query' && raw.risk === 'read' && raw.confirmation === 'none' && raw.idempotency === 'none' && raw.concurrency === 'none';
  if (binding.kind !== 'native-form' || !exact(binding, ['kind', 'resourceCode', 'viewCode', 'action', 'fields']) || !names(binding.fields, 1) ||
    !['create', 'update'].includes(binding.action) || raw.operation !== binding.action || raw.risk !== 'write' || raw.idempotency !== 'required' ||
    raw.concurrency !== (binding.action === 'update' ? 'revision' : 'none')) return false;
  const form = meta.form;
  return isObject(form) && exact(form, ['contractVersion', 'action', 'title', 'submitLabel', 'resource', 'view', 'fields']) &&
    form.contractVersion === 2 && form.action === binding.action && form.resource === binding.resourceCode && form.view === binding.viewCode &&
    nonEmpty(form.title, 80) && nonEmpty(form.submitLabel, 40) && Array.isArray(form.fields) && form.fields.length === binding.fields.length &&
    form.fields.every((field: any, i: number) => isObject(field) && exact(field, ['path', 'label', 'fieldType', 'required', 'source', 'selector']) &&
      (field.selector === undefined || validSelector(field.selector)) &&
      field.path === binding.fields[i] && nonEmpty(field.label, 500) && DATA_FIELD_TYPES.includes(field.fieldType) && typeof field.required === 'boolean' &&
      isObject(field.source) && exact(field.source, ['resource', 'field']) && field.source.resource === binding.resourceCode && field.source.field === field.path);
}
