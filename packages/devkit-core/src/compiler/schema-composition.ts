import {
  fieldValueSchemaForDefinition,
  type AppApiOperationDeclaration,
  type OpenXiangdaJsonSchema,
} from 'openxiangda-contracts';
import type {
  AppDataFieldDeclaration,
  AppDataResourceDeclaration,
} from './config.js';

const DEFINITION_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_DEFINITIONS = 64;
const MAX_RESOURCE_FIELDS = 200;
const MAX_SCHEMA_NODES = 10_000;
const MAX_SCHEMA_DEPTH = 32;

export type JsonSchemaDefinitions = Readonly<
  Record<string, OpenXiangdaJsonSchema>
>;

export interface ResourceRecordSchemaOptions {
  /** Defaults to every declared field, in declaration order. */
  fields?: readonly string[];
  /** Defaults to fields declared with `required: true`. */
  required?: 'declared' | 'none' | readonly string[];
  /** Defaults to false so operation payloads cannot smuggle undeclared fields. */
  additionalProperties?: boolean;
}

export interface AppOperationSchemasInput {
  request: OpenXiangdaJsonSchema;
  response: OpenXiangdaJsonSchema;
  definitions?: JsonSchemaDefinitions;
}

export function schemaRef(definitionName: string): OpenXiangdaJsonSchema {
  assertDefinitionName(definitionName);
  return { $ref: `#/$defs/${definitionName}` };
}

export function composeJsonSchema(
  schema: OpenXiangdaJsonSchema,
  definitions: JsonSchemaDefinitions = {}
): OpenXiangdaJsonSchema {
  const root = cloneSchema(schema);
  const authoredDefinitions = root.$defs;
  if (
    authoredDefinitions !== undefined &&
    (!isRecord(authoredDefinitions) || Array.isArray(authoredDefinitions))
  ) {
    throw schemaCompositionError('$defs 必须是 JSON Schema 对象字典');
  }
  delete root.$defs;
  const combined = new Map<string, OpenXiangdaJsonSchema>();
  for (const [name, value] of Object.entries(
    (authoredDefinitions || {}) as Record<string, unknown>
  )) {
    addDefinition(combined, name, value);
  }
  for (const [name, value] of Object.entries(definitions)) {
    addDefinition(combined, name, value);
  }
  if (combined.size > MAX_DEFINITIONS) {
    throw schemaCompositionError(
      `JSON Schema definitions 不能超过 ${MAX_DEFINITIONS} 个`
    );
  }
  const sortedDefinitions = Object.fromEntries(
    [...combined.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
  const composed =
    combined.size > 0 ? { ...root, $defs: sortedDefinitions } : root;
  validateLocalReferences(composed, new Set(combined.keys()));
  return composed;
}

export function composeAppOperationSchemas(
  input: AppOperationSchemasInput
): Pick<AppApiOperationDeclaration, 'requestSchema' | 'responseSchema'> {
  return {
    requestSchema: composeJsonSchema(input.request, input.definitions),
    responseSchema: composeJsonSchema(input.response, input.definitions),
  };
}

export function resourceRecordSchema(
  resource: AppDataResourceDeclaration,
  options: ResourceRecordSchemaOptions = {}
): OpenXiangdaJsonSchema {
  const fieldsByCode = new Map(
    resource.fields.map(field => [field.code, field] as const)
  );
  if (fieldsByCode.size !== resource.fields.length) {
    throw schemaCompositionError(
      `资源 ${resource.code} 包含重复字段 code`
    );
  }
  const selectedCodes = options.fields
    ? [...options.fields]
    : resource.fields.map(field => field.code);
  if (selectedCodes.length > MAX_RESOURCE_FIELDS) {
    throw schemaCompositionError(
      `Resource schema fields 不能超过 ${MAX_RESOURCE_FIELDS} 个`
    );
  }
  assertUniqueSelectedFields(selectedCodes);
  const selectedFields = selectedCodes.map(code => {
    const field = fieldsByCode.get(code);
    if (!field) {
      throw schemaCompositionError(
        `资源 ${resource.code} 未声明字段 ${code}`
      );
    }
    return field;
  });
  const required = resolveRequiredFields(options.required, selectedFields);
  const schema: OpenXiangdaJsonSchema = {
    type: 'object',
    title: resource.name,
    additionalProperties: options.additionalProperties === true,
    properties: Object.fromEntries(
      selectedFields.map(field => [
        field.code,
        projectFieldValueSchema(field),
      ])
    ),
    ...(required.length > 0 ? { required } : {}),
  };
  return schema;
}

function projectFieldValueSchema(
  field: AppDataFieldDeclaration
): OpenXiangdaJsonSchema {
  const schema = fieldValueSchemaForDefinition(field) as OpenXiangdaJsonSchema;
  schema.title = field.label;
  if (
    field.min !== undefined &&
    (field.type === 'number.integer' || field.type === 'number.decimal')
  ) {
    schema.minimum = field.min;
  }
  if (
    field.max !== undefined &&
    (field.type === 'number.integer' || field.type === 'number.decimal')
  ) {
    schema.maximum = field.max;
  }
  if (
    field.maxLength !== undefined &&
    (field.type === 'text.short' ||
      field.type === 'text.long' ||
      field.type === 'text.rich')
  ) {
    schema.maxLength = Math.min(
      typeof schema.maxLength === 'number'
        ? schema.maxLength
        : field.maxLength,
      field.maxLength
    );
  }
  if (field.file?.maxCount !== undefined && isArraySchema(schema)) {
    schema.maxItems = Math.min(
      typeof schema.maxItems === 'number' ? schema.maxItems : field.file.maxCount,
      field.file.maxCount
    );
  }
  if (
    field.subtable?.maxRows !== undefined &&
    field.type === 'subtable' &&
    isArraySchema(schema)
  ) {
    schema.maxItems = Math.min(
      typeof schema.maxItems === 'number'
        ? schema.maxItems
        : field.subtable.maxRows,
      field.subtable.maxRows
    );
  }
  if (field.type === 'resource-ref.single' && field.source) {
    constrainResourceCode(schema, field.source.resourceCode);
  }
  if (field.type === 'resource-ref.multiple' && field.source) {
    const items = isRecord(schema.items) ? schema.items : undefined;
    if (items) constrainResourceCode(items, field.source.resourceCode);
  }
  return schema;
}

function constrainResourceCode(
  schema: OpenXiangdaJsonSchema,
  resourceCode: string
) {
  const properties = isRecord(schema.properties)
    ? schema.properties
    : undefined;
  if (properties) {
    properties.resourceCode = { const: resourceCode };
  }
}

function resolveRequiredFields(
  required: ResourceRecordSchemaOptions['required'],
  selectedFields: AppDataFieldDeclaration[]
) {
  if (required === 'none') return [];
  if (required === undefined || required === 'declared') {
    return selectedFields
      .filter(field => field.required === true)
      .map(field => field.code);
  }
  const selected = new Set(selectedFields.map(field => field.code));
  assertUniqueSelectedFields(required);
  for (const code of required) {
    if (!selected.has(code)) {
      throw schemaCompositionError(`required 引用了未选择字段 ${code}`);
    }
  }
  return [...required];
}

function assertUniqueSelectedFields(fields: readonly string[]) {
  if (new Set(fields).size !== fields.length) {
    throw schemaCompositionError('Resource schema fields 不能重复');
  }
}

function addDefinition(
  definitions: Map<string, OpenXiangdaJsonSchema>,
  name: string,
  value: unknown
) {
  assertDefinitionName(name);
  if (!isRecord(value) || Array.isArray(value)) {
    throw schemaCompositionError(`definition ${name} 必须是 JSON Schema 对象`);
  }
  if (definitions.has(name)) {
    throw schemaCompositionError(`definition ${name} 重复`);
  }
  definitions.set(name, cloneSchema(value));
}

function assertDefinitionName(name: string) {
  if (!DEFINITION_NAME.test(name)) {
    throw schemaCompositionError(`非法 JSON Schema definition 名称: ${name}`);
  }
}

function validateLocalReferences(
  root: OpenXiangdaJsonSchema,
  definitions: Set<string>
) {
  let nodes = 0;
  const visit = (value: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_SCHEMA_NODES || depth > MAX_SCHEMA_DEPTH) {
      throw schemaCompositionError('JSON Schema 超出组合深度或节点上限');
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    if ('$ref' in value) {
      const match = /^#\/\$defs\/([A-Za-z][A-Za-z0-9_-]{0,63})$/.exec(
        String(value.$ref)
      );
      if (!match || !definitions.has(match[1]!)) {
        throw schemaCompositionError(`只允许引用已声明的本地 $defs: ${value.$ref}`);
      }
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  visit(root, 0);
}

function cloneSchema<T extends OpenXiangdaJsonSchema>(schema: T): T {
  return structuredClone(schema);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function schemaCompositionError(message: string) {
  return new Error(`OPENXIANGDA_SCHEMA_COMPOSITION_INVALID: ${message}`);
}

function isArraySchema(schema: OpenXiangdaJsonSchema) {
  return schema.type === 'array';
}
