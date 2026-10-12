import { sha256Digest } from '../canonical.js';
import { fieldValueSchemaForDefinition } from './field-value-schemas.js';
import type { AiCapability, AiJsonSchema } from '../ai.js';
import type { DataFieldDefinition, DataResource } from '../types.js';
import type { ApplicationAgentDefinitionsV2,
  ApplicationAgentTaskDeclarationV2, NativeAgentTaskBindingV2 } from '../application-agent.js';
import { projectDataResourceView } from './resource-view.js';
import { nativeFieldRequiresCreateInputV2, parseNativeDataFieldsV2, NativeDataFieldContractV2Error } from './data-field.js';
import { isDataAuditMetadataField, isDataSystemSortField } from './data-audit-access.js';

export const APPLICATION_AGENT_LIMITS_V2 = Object.freeze({ agents: 20, tasks: 20,
  fields: 20, instructions: 16000, instructionBytes: 64000, arrayItems: 50, pages: 10 });

export class NativeApplicationAgentContractError extends Error {
  constructor(readonly code: string, readonly pointer: string, detail: string) {
    super(`${code}: ${pointer}: ${detail}`);
    this.name = 'NativeApplicationAgentContractError';
  }
}
function fail(code: string, pointer: string, detail: string): never {
  throw new NativeApplicationAgentContractError(`NATIVE_APPLICATION_AGENT_${code}`, pointer, detail);
}
function object(value: unknown, pointer: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('OBJECT_REQUIRED', pointer, '需要对象');
  return value as Record<string, any>;
}
function keys(value: Record<string, any>, allowed: string[], pointer: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('PROPERTY_UNSUPPORTED', `${pointer}/${key}`, '未知属性');
}
function text(value: unknown, max: number, pointer: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('TEXT_INVALID', pointer, `需要非空字符串，最多 ${max} 字符`);
  return value as string;
}
function code(value: unknown, pointer: string) {
  const result = text(value, 100, pointer);
  if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(result)) fail('CODE_INVALID', pointer, '需要稳定编码');
  return result;
}
function strings(value: unknown, max: number, length: number, pointer: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) fail('ARRAY_LIMIT', pointer, `最多 ${max} 项`);
  const result = (value as unknown[]).map((item, i) => text(item, length, `${pointer}/${i}`));
  if (new Set(result).size !== result.length) fail('DUPLICATE', pointer, '不能重复');
  return result;
}

/** The loader enforces realpath containment as well; this pure check also guards direct compile callers. */
export function assertApplicationAgentInstructionPathV2(value: unknown, pointer = '/agents/instructions/file'): string {
  const file = text(value, 500, pointer);
  const parts = file.split('/');
  if (!/\.(md|txt)$/i.test(file) || parts.some(part => !part || part.startsWith('.') || /[\\:\p{Cc}]/u.test(part) ||
    /^(?:\.\.?|AGENTS\.md|CLAUDE\.md|SKILL\.md|credentials.*|secrets?.*|.*\.pem|.*\.key)$/i.test(part)))
    fail('INSTRUCTION_PATH_INVALID', pointer, '需要工作区内的普通 md/txt 文件，不能引用协作说明或凭据');
  return file;
}
function instructions(value: unknown, pointer: string, allowFile: boolean): string | { file: string } {
  if (typeof value === 'string') return text(value, APPLICATION_AGENT_LIMITS_V2.instructions, pointer);
  const ref = object(value, pointer);
  keys(ref, ['file'], pointer);
  const file = assertApplicationAgentInstructionPathV2(ref.file, `${pointer}/file`);
  if (!allowFile) fail('INSTRUCTIONS_NOT_INLINED', pointer, '文件指令必须先由工作区加载器内联');
  return { file };
}
const labelHint: AiJsonSchema = { type: 'object', additionalProperties: false, required: ['label'],
  properties: { label: { type: 'string', minLength: 1, maxLength: 500 } } };
const references = /^(option|user|department|resource-ref)\.(single|multiple)$/;
const unavailable = new Set(['file', 'image', 'signature', 'subtable', 'text.rich', 'json', 'serial-number']);

/** A projection for assistance only; ordinary field schemas remain the command's only value contract. */
export function nativeAgentFieldHintSchemaV2(field: DataFieldDefinition, filter = false): AiJsonSchema | undefined {
  if (references.test(field.type)) {
    const schema = field.type.endsWith('.multiple') ? { type: 'array', minItems: filter ? 1 : 0, maxItems: 50, items: labelHint } : labelHint;
    return !filter && field.nullable !== false ? { anyOf: [schema, { type: 'null' }] } : schema;
  }
  if (!['text.short', 'text.long', 'number.integer', 'number.decimal', 'boolean', 'date', 'time', 'datetime'].includes(field.type)) return undefined;
  let schema = fieldValueSchemaForDefinition(field);
  if (field.type === 'datetime') schema = { ...schema, pattern: '(?:Z|[+-]\\d{2}:\\d{2})$' };
  if (filter && ['number.integer', 'number.decimal', 'date', 'datetime'].includes(field.type))
    return { oneOf: [schema, { type: 'object', additionalProperties: false, minProperties: 1,
      properties: { from: schema, to: schema } }] };
  if (!filter && field.nullable !== false) return { anyOf: [schema, { type: 'null' }] };
  return schema;
}
function objectSchema(properties: Record<string, AiJsonSchema>, required: string[] = []): AiJsonSchema {
  return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}
function formBindings(resource: DataResource, field: DataFieldDefinition): string[] {
  const source = field.source || resource.surface?.fields[field.code]?.source;
  return (source?.filters || []).flatMap(filter => 'binding' in filter ? [filter.binding.field] : []);
}
const handleSchema = { type: 'object', additionalProperties: false, required: ['handle'],
  properties: { handle: { type: 'string', minLength: 1, maxLength: 80 } } };
const resultSchema = { type: 'object', additionalProperties: false, properties: {
  columns: { type: 'array', maxItems: 200, items: objectSchema({ code: { type: 'string' }, label: { type: 'string' } }, ['code', 'label']) },
  items: { type: 'array', maxItems: 100, items: objectSchema({ handle: { type: 'string' }, title: { type: 'string' },
    fields: { type: 'array', maxItems: 200, items: objectSchema({ code: { type: 'string' }, label: { type: 'string' }, value: { type: 'string' } }, ['code', 'label', 'value']) } }, ['handle', 'fields']) },
  more: { type: 'boolean' }, total: { type: 'integer', minimum: 0 },
  continuation: { type: 'string', maxLength: 80 }, summary: { type: 'string' },
} };

function compileTask(appCode: string, agentCode: string, task: ApplicationAgentTaskDeclarationV2,
  resources: DataResource[], pointer: string): AiCapability {
  const resource = resources.find(item => item && typeof item === 'object' && item.code === task.resource && item.status !== 'retired');
  if (!resource?.surface || !resource.surface.fields || !Array.isArray(resource.schema?.fields) ||
    resource.schema.fields.some(field => !field || typeof field.code !== 'string' || typeof field.type !== 'string')) fail('RESOURCE_UNAVAILABLE', `${pointer}/resource`, '需要当前模型及标准视图');
  try { parseNativeDataFieldsV2(resource.schema.fields, `${pointer}/resource/schema/fields`); }
  catch (error) {
    if (!(error instanceof NativeDataFieldContractV2Error)) throw error;
    fail('RESOURCE_SCHEMA_INVALID', `${pointer}/resource`, error.message);
  }
  if (resource.surface.views !== undefined && !Array.isArray(resource.surface.views)) fail('VIEW_UNKNOWN', `${pointer}/view`, '需要已验证的标准视图');
  if (!resource.surface.views?.some(view => view.code === task.view) &&
    !(task.view === 'default' && !resource.surface.views?.length)) fail('VIEW_UNKNOWN', `${pointer}/view`, '视图不存在');
  const view = task.view === 'default' && !resource.surface.views?.length ? resource.surface :
    projectDataResourceView(resource.surface, task.view);
  const byField = new Map(resource.schema.fields.map(field => [field.code, field]));
  const base = { code: `${appCode}.agent.${agentCode}.${task.code}`, appCode,
    name: task.name || `${resource.name}${task.kind === 'view' ? '查询' : task.action === 'create' ? '新增' : '修改'}`.slice(0, 80),
    description: task.description || `通过${resource.name}的${task.view}标准视图${task.kind === 'view' ? '查询' : '填写'}，遵守当前用户权限`,
    kind: 'nativeTask' as const, resources: [resource.code], limits: { timeoutMs: 10000 },
    agent: { visibility: 'task' as const, ...(task.examples?.length ? { examples: [...task.examples] } : {}) },
  };
  if (task.kind === 'view') {
    if (view.generated?.list === false) fail('LIST_DISABLED', pointer, '该视图未生成列表');
    const filterFields = task.filters ?? view.list?.filterFields ?? [];
    if (filterFields.some(field => !view.list?.filterFields?.includes(field))) fail('FILTER_WIDENING', `${pointer}/filters`, '任务只能缩小视图筛选字段');
    const filters = Object.fromEntries(filterFields.map(field => {
      const definition = byField.get(field);
      const hint = definition && nativeAgentFieldHintSchemaV2(definition, true);
      if (!hint) fail('FILTER_TYPE_UNSUPPORTED', `${pointer}/filters`, `字段 ${field} 暂不支持模型筛选提示`);
      return [field, hint];
    }));
    const sortable = (view.list?.fieldOrder || []).filter(field => resource.surface!.fields[field]?.sortable);
    if (view.list?.defaultSort && !sortable.includes(view.list.defaultSort.field)) sortable.push(view.list.defaultSort.field);
    const hintSchema = objectSchema({
      ...(view.list?.searchableFields?.length ? { keyword: { type: 'string', maxLength: 200 } } : {}),
      ...(filterFields.length ? { filters: objectSchema(filters) } : {}),
      ...(sortable.length ? { sort: objectSchema({ field: { enum: sortable }, order: { enum: ['asc', 'desc'] } }, ['field']) } : {}),
      limit: { type: 'integer', minimum: 1, maximum: 100 }, continue: { type: 'string', minLength: 1, maxLength: 80 }, record: handleSchema,
    });
    return { ...base, operation: 'query', inputSchema: { type: 'object' }, outputSchema: resultSchema,
      authorization: { capabilities: [resource.capabilities.read] }, risk: 'read', confirmation: 'none',
      idempotency: 'none', concurrency: 'none', sideEffects: [], limits: { ...base.limits, maxRows: 100 },
      binding: { kind: 'native-view', resourceCode: resource.code, viewCode: task.view, filterFields },
      agent: { ...base.agent, nativeTask: { contractVersion: 2, agentCode, taskCode: task.code, hintSchema } },
    };
  }
  if ((resource.surface.mutationOwner || 'native') !== 'native' || view.generated?.[task.action] === false)
    fail('MUTATION_NOT_NATIVE', pointer, '只能绑定已生成的普通原生 create/update');
  const fields = task.fields;
  if (!fields.length) fail('FIELDS_REQUIRED', `${pointer}/fields`, '需要至少一个表单字段');
  for (const field of fields) {
    const definition = byField.get(field);
    const display = resource.surface.fields[field];
    if (!definition || !view.form?.fieldOrder?.includes(field) || !display || display.system || display.hidden ||
      isDataAuditMetadataField(field) || isDataSystemSortField(field) || unavailable.has(definition.type))
      fail('FORM_FIELD_UNSUPPORTED', `${pointer}/fields`, `字段 ${field} 不属于可编辑的标准单控件表单`);
    if (!Array.isArray(display[`${task.action}Capabilities`]) || display[`${task.action}Capabilities`].length === 0)
      fail('FORM_FIELD_UNWRITABLE', `${pointer}/fields`, `字段 ${field} 未提供 ${task.action} 权限`);
  }
  const included = new Set(fields);
  if (task.action === 'create') {
    for (const field of resource.schema.fields) {
      if (nativeFieldRequiresCreateInputV2(field, resource.surface.fields[field.code]) && !included.has(field.code))
        fail('CREATE_FIELD_REQUIRED', `${pointer}/fields`, `必须包含新增必填字段 ${field.code}`);
    }
    for (const name of fields) for (const binding of formBindings(resource, byField.get(name)!))
      if (!included.has(binding)) fail('CREATE_BINDING_REQUIRED', `${pointer}/fields`, `${name} 依赖 ${binding}，必须包含绑定字段`);
  } else {
    // If a binding is changed, every dependent selector must be visible on the
    // card. A selector may still use an unchanged private saved binding.
    for (const field of resource.schema.fields) if (formBindings(resource, field).some(binding => included.has(binding)) && !included.has(field.code))
      fail('UPDATE_DEPENDENT_REQUIRED', `${pointer}/fields`, `修改绑定字段时必须包含依赖选择器 ${field.code}`);
  }
  const definitions = fields.map(field => byField.get(field)!);
  const required = task.action === 'create' ? definitions.filter(field =>
    nativeFieldRequiresCreateInputV2(field, resource.surface!.fields[field.code])).map(field => field.code) : [];
  const dataSchema = objectSchema(Object.fromEntries(definitions.map(field => [field.code, field.nullable === false ? fieldValueSchemaForDefinition(field) : { anyOf: [fieldValueSchemaForDefinition(field), { type: 'null' }] }])), required);
  const hints = Object.fromEntries(definitions.flatMap(field => {
    const hint = nativeAgentFieldHintSchemaV2(field);
    return hint ? [[field.code, hint]] : [];
  }));
  const binding: NativeAgentTaskBindingV2 = { kind: 'native-form', resourceCode: resource.code,
    viewCode: task.view, action: task.action, fields: [...fields] };
  const inputSchema = objectSchema({ data: dataSchema, ...(task.action === 'update' ? {
    target: objectSchema({ id: { type: 'string', format: 'uuid' }, expectedRevision: { type: 'integer', minimum: 1 } }, ['id', 'expectedRevision']),
  } : {}) }, ['data', ...(task.action === 'update' ? ['target'] : [])]);
  return { ...base, operation: task.action, inputSchema, outputSchema: resultSchema,
    authorization: { capabilities: [resource.capabilities[task.action]] }, risk: 'write',
    confirmation: task.confirmation || 'required', idempotency: 'required', concurrency: task.action === 'update' ? 'revision' : 'none',
    sideEffects: [`${resource.code}:${task.action}`], reconcile: { kind: 'platform-transaction' }, binding,
    agent: { ...base.agent, nativeTask: { contractVersion: 2, agentCode, taskCode: task.code,
      hintSchema: objectSchema({ data: objectSchema(hints), ...(task.action === 'update' ? { record: handleSchema } : {}) }),
      form: { contractVersion: 2, action: task.action, title: base.name, submitLabel: '提交', resource: resource.code, view: task.view,
        fields: definitions.map(field => ({ path: field.code, label: resource.surface!.fields[field.code]!.label,
          fieldType: field.type, required: required.includes(field.code), source: { resource: resource.code, field: field.code } })) },
    } },
  };
}

export function compileApplicationAgentsV2(appCode: string, input: unknown, resources: DataResource[],
  options: { allowInstructionFiles?: boolean } = {}): { definitions: ApplicationAgentDefinitionsV2; capabilities: AiCapability[] } {
  const definitions: ApplicationAgentDefinitionsV2 = { schemaVersion: 'openxiangda.application-agent-definitions/v2', appCode, agents: [] };
  const capabilities: AiCapability[] = [];
  if (input === undefined) return { definitions, capabilities };
  if (!Array.isArray(resources)) fail('RESOURCES_INVALID', '/data/resources', '需要已验证的模型列表');
  if (!Array.isArray(input) || input.length > APPLICATION_AGENT_LIMITS_V2.agents) fail('AGENT_LIMIT', '/agents', '最多 20 个助手');
  const agentCodes = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const pointer = `/agents/${i}`;
    const raw = object(input[i], pointer);
    keys(raw, ['code', 'name', 'purpose', 'instructions', 'starters', 'tasks'], pointer);
    const agentCode = code(raw.code, `${pointer}/code`);
    if (agentCodes.has(agentCode)) fail('CODE_DUPLICATE', `${pointer}/code`, '助手代码重复');
    agentCodes.add(agentCode);
    const name = text(raw.name, 80, `${pointer}/name`);
    const purpose = text(raw.purpose, 1000, `${pointer}/purpose`);
    const instruction = instructions(raw.instructions, `${pointer}/instructions`, options.allowInstructionFiles === true);
    const starters = strings(raw.starters, 12, 160, `${pointer}/starters`);
    if (!Array.isArray(raw.tasks) || raw.tasks.length < 1 || raw.tasks.length > 20) fail('TASK_LIMIT', `${pointer}/tasks`, '需要 1–20 个任务');
    const taskCodes = new Set<string>();
    const agentCapabilities = raw.tasks.map((value: unknown, j: number) => {
      const path = `${pointer}/tasks/${j}`;
      const task = object(value, path);
      if (!['view', 'form'].includes(task.kind)) fail('TASK_KIND_INVALID', `${path}/kind`, '只支持 view/form');
      keys(task, ['code', 'kind', 'name', 'description', 'resource', 'view', 'examples',
        ...(task.kind === 'view' ? ['filters'] : ['action', 'fields', 'confirmation'])], path);
      const taskCode = code(task.code, `${path}/code`);
      if (taskCodes.has(taskCode)) fail('TASK_CODE_DUPLICATE', `${path}/code`, '任务代码重复');
      taskCodes.add(taskCode);
      code(task.resource, `${path}/resource`); code(task.view, `${path}/view`);
      if (task.name !== undefined) text(task.name, 80, `${path}/name`);
      if (task.description !== undefined) text(task.description, 1000, `${path}/description`);
      strings(task.examples, 12, 160, `${path}/examples`);
      if (task.kind === 'view') strings(task.filters, 20, 100, `${path}/filters`);
      else {
        if (!['create', 'update'].includes(task.action)) fail('FORM_ACTION_INVALID', `${path}/action`, '只支持 create/update');
        if (task.confirmation !== undefined && !['none', 'required'].includes(task.confirmation)) fail('CONFIRMATION_INVALID', `${path}/confirmation`, '确认策略无效');
        if (!Array.isArray(task.fields)) fail('FIELDS_REQUIRED', `${path}/fields`, '需要字段列表');
        strings(task.fields, 20, 100, `${path}/fields`);
      }
      return compileTask(appCode, agentCode, task as ApplicationAgentTaskDeclarationV2, resources, path);
    });
    const definition = { code: agentCode, name, purpose, instructions: typeof instruction === 'string' ? instruction : '', starters,
      tasks: agentCapabilities.map(capability => ({ code: capability.agent!.nativeTask!.taskCode, capabilityCode: capability.code })) };
    definitions.agents.push({ ...definition, digest: sha256Digest({ ...definition, capabilities: agentCapabilities }) });
    capabilities.push(...agentCapabilities);
  }
  definitions.agents.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  capabilities.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  return { definitions, capabilities };
}
