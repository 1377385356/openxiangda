import {
  SCHEMA_VERSIONS,
  aiJsonSchemaForField,
  assertAiCapabilityCatalog,
  type AiCapability,
  type AiCapabilityCatalog,
  type AiJsonSchema,
  type AppApiOperationDeclaration,
  type DataFieldDefinition,
  type DataResource,
} from "openxiangda-contracts";
import type { OpenXiangdaAppConfig } from "./config.js";
import { nativeFieldRequiresCreateInputV2 } from 'openxiangda-contracts/native-compiler';
import { supportsGeneratedMutation } from "./field-codec.js";

const QUERY_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "startsWith",
  "endsWith",
  "in",
  "between",
  "has",
  "hasAny",
  "hasAll",
  "overlaps",
  "containedBy",
  "jsonContains",
  "isEmpty",
  "isNotEmpty",
] as const;

const MAX_ROWS = 100;
const DEFAULT_TIMEOUT_MS = 10000;

function fieldProperties(fields: DataFieldDefinition[]) {
  return Object.fromEntries(
    fields.map(field => {
      const schema = aiJsonSchemaForField(field);
      if (field.min !== undefined) schema.minimum = field.min;
      if (field.max !== undefined) schema.maximum = field.max;
      return [field.code, schema];
    })
  );
}

function fieldNames(fields: DataFieldDefinition[]) {
  return fields.map(field => field.code);
}

function objectSchema(
  fields: DataFieldDefinition[],
  required: string[] = []
): AiJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties: fieldProperties(fields),
    ...(required.length > 0 ? { required } : {}),
  };
}

function queryInputSchema(resource: DataResource): AiJsonSchema {
  const fields = resource.schema.fields;
  const names = fieldNames(fields);
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion"],
    $defs: {
      where: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["and"],
            properties: {
              and: {
                type: "array",
                minItems: 1,
                maxItems: 50,
                items: { $ref: "#/$defs/where" },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["or"],
            properties: {
              or: {
                type: "array",
                minItems: 1,
                maxItems: 50,
                items: { $ref: "#/$defs/where" },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["not"],
            properties: { not: { $ref: "#/$defs/where" } },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["field", "operator"],
            properties: {
              field: { enum: names },
              operator: { enum: QUERY_OPERATORS },
              value: {},
              path: { type: "string" },
            },
          },
        ],
      },
    },
    properties: {
      schemaVersion: { const: SCHEMA_VERSIONS.dataQuery },
      where: { $ref: "#/$defs/where" },
      select: {
        type: "array",
        maxItems: names.length,
        uniqueItems: true,
        items: { enum: names },
      },
      order: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field"],
          properties: {
            field: { enum: names },
            direction: { enum: ["asc", "desc"] },
            nulls: { enum: ["first", "last"] },
          },
        },
      },
      limit: { type: "integer", minimum: 1, maximum: MAX_ROWS },
      offset: { type: "integer", minimum: 0, maximum: 100000 },
    },
  };
}

function queryOutputSchema(resource: DataResource): AiJsonSchema {
  const fields = resource.schema.fields;
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "resourceCode",
      "items",
      "total",
      "limit",
      "offset",
    ],
    properties: {
      schemaVersion: { const: SCHEMA_VERSIONS.dataPage },
      resourceCode: { const: resource.code },
      items: {
        type: "array",
        items: objectSchema(fields),
      },
      total: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: MAX_ROWS },
      offset: { type: "integer", minimum: 0 },
    },
  };
}

function recordOutputSchema(resource: DataResource): AiJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["resourceCode", "data"],
    properties: {
      resourceCode: { const: resource.code },
      data: objectSchema(resource.schema.fields),
    },
  };
}

function createInputSchema(resource: DataResource): AiJsonSchema {
  const fields = resource.schema.fields.filter(
    field => {
      const surface = resource.surface?.fields[field.code];
      return (
        supportsGeneratedMutation({
          type: field.type,
          system: surface?.system,
        }) &&
        (surface?.createCapabilities === undefined ||
          surface.createCapabilities.length > 0)
      );
    }
  );
  return objectSchema(
    fields,
    fields.filter(field => nativeFieldRequiresCreateInputV2(field, resource.surface?.fields[field.code])).map(field => field.code)
  );
}

function updateInputSchema(resource: DataResource): AiJsonSchema {
  const fields = resource.schema.fields.filter(
    field => {
      const surface = resource.surface?.fields[field.code];
      return (
        supportsGeneratedMutation({
          type: field.type,
          system: surface?.system,
        }) &&
        (surface?.updateCapabilities === undefined ||
          surface.updateCapabilities.length > 0)
      );
    }
  );
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "expectedRevision", "data"],
    properties: {
      id: { type: "string", minLength: 1 },
      expectedRevision: { type: "integer", minimum: 1 },
      data: objectSchema(fields),
    },
  };
}

function getInputSchema(): AiJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: { type: "string", minLength: 1 } },
  };
}

function deleteInputSchema(): AiJsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "expectedRevision"],
    properties: {
      id: { type: "string", minLength: 1 },
      expectedRevision: { type: "integer", minimum: 1 },
    },
  };
}

function generatedCapability(
  resource: DataResource,
  operation: "query" | "get" | "create" | "update" | "delete"
): AiCapability {
  const read = operation === "query" || operation === "get";
  const destructive = operation === "delete";
  const inputSchema =
    operation === "query"
      ? queryInputSchema(resource)
      : operation === "get"
        ? getInputSchema()
        : operation === "create"
          ? createInputSchema(resource)
          : operation === "update"
            ? updateInputSchema(resource)
            : deleteInputSchema();
  const outputSchema =
    operation === "query"
      ? queryOutputSchema(resource)
      : operation === "delete"
        ? {
            type: "object",
            additionalProperties: false,
            required: ["resourceCode", "deleted"],
            properties: {
              resourceCode: { const: resource.code },
              deleted: { type: "boolean", const: true },
            },
          }
        : recordOutputSchema(resource);
  const capability =
    operation === "query" || operation === "get"
      ? resource.capabilities.read
      : operation === "create"
        ? resource.capabilities.create
        : operation === "update"
          ? resource.capabilities.update
          : resource.capabilities.delete;
  return {
    code: `${resource.appCode}.${resource.code}.${operation}`,
    appCode: resource.appCode,
    name: `${resource.name}${
      operation === "query"
        ? "查询"
        : operation === "get"
          ? "详情"
          : operation === "create"
            ? "新增"
            : operation === "update"
              ? "修改"
              : "删除"
    }`,
    description: `对${resource.name}执行${
      operation === "query"
        ? "受权限控制的查询"
        : operation === "get"
          ? "受权限控制的详情读取"
          : operation === "create"
            ? "新增记录"
            : operation === "update"
              ? "修改记录"
              : "删除记录"
    }`,
    kind: "generatedCrud",
    operation,
    resources: [resource.code],
    inputSchema,
    outputSchema,
    authorization: { capabilities: [capability] },
    risk: read ? "read" : destructive ? "destructive" : "write",
    confirmation: read ? "none" : "required",
    idempotency: read ? "none" : "required",
    concurrency: operation === "update" || destructive ? "revision" : "none",
    limits: {
      ...(operation === "query" ? { maxRows: MAX_ROWS } : {}),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    sideEffects: read ? [] : [`${resource.code}:${operation}`],
    generatedFrom: { resourceCode: resource.code, operation },
  };
}

function customCapability(
  appCode: string,
  operation: AppApiOperationDeclaration & {
    ai: NonNullable<AppApiOperationDeclaration["ai"]>;
  }
): AiCapability {
  const read = operation.ai.risk === "read";
  const inputSchema =
    operation.requestSchema.type === "object"
      ? operation.requestSchema
      : { type: "object", additionalProperties: true };
  const outputSchema =
    operation.responseSchema.type === "object"
      ? operation.responseSchema
      : { type: "object", additionalProperties: true };
  return {
    code: `${appCode}.custom.${operation.code}`,
    appCode,
    name: operation.ai.name,
    description: operation.ai.description,
    kind: "customAction",
    operation: "custom",
    resources: operation.ai.resources,
    inputSchema,
    outputSchema,
    authorization: { capabilities: [operation.capability] },
    risk: operation.ai.risk,
    confirmation: read ? "none" : "required",
    idempotency: read ? "none" : "required",
    concurrency: operation.ai.concurrency || "none",
    limits: { timeoutMs: operation.ai.timeoutMs || DEFAULT_TIMEOUT_MS },
    sideEffects: operation.ai.sideEffects,
    binding: {
      kind: "app-api",
      operationCode: operation.code,
      method: operation.method,
      path: operation.path,
    },
  };
}

export function compileAiCapabilityCatalog(
  config: OpenXiangdaAppConfig,
  sourceConfigDigest?: string
): AiCapabilityCatalog {
  const resources = (config.data?.resources || []).filter(
    resource => resource.status !== "retired"
  );
  const capabilities = resources
    .filter(resource => resource.status !== "retired")
    .flatMap(resource =>
      (["query", "get", "create", "update", "delete"] as const)
        .filter(operation => {
          const generated = resource.surface?.generated;
          const native =
            (resource.surface?.mutationOwner || "native") === "native";
          if (operation === "query") return generated?.list ?? true;
          if (operation === "get") return generated?.detail ?? true;
          return generated?.[operation] ?? native;
        })
        .map(operation => generatedCapability(resource, operation))
    )
    .concat(
      (config.backend.operations || [])
        .filter(
          (
            operation
          ): operation is AppApiOperationDeclaration & {
            ai: NonNullable<AppApiOperationDeclaration["ai"]>;
          } => Boolean(operation.ai)
        )
        .map(operation => customCapability(config.app.code, operation))
    )
    .sort((left, right) =>
      left.code < right.code ? -1 : left.code > right.code ? 1 : 0
    );
  const catalog: AiCapabilityCatalog = {
    schemaVersion: SCHEMA_VERSIONS.aiCapabilityCatalog,
    appCode: config.app.code,
    appName: config.app.name,
    ...(sourceConfigDigest ? { sourceConfigDigest } : {}),
    capabilities,
  };
  assertAiCapabilityCatalog(catalog);
  return catalog;
}
