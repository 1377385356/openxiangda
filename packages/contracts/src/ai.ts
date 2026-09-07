import {
  SCHEMA_VERSIONS,
  type DataFieldDefinition,
  type Diagnostic,
} from "./types.js";
import { fieldValueSchemaForDefinition } from "./field-value-schemas.js";

export type AiJsonSchema = Record<string, unknown>;

export type AiCapabilityKind = "generatedCrud" | "customAction";

export type AiCapabilityOperation =
  | "query"
  | "get"
  | "create"
  | "update"
  | "delete"
  | "custom";

export type AiCapabilityRisk =
  | "read"
  | "write"
  | "destructive"
  | "external";

export type AiConfirmationPolicy = "none" | "required";
export type AiIdempotencyPolicy = "none" | "required";
export type AiConcurrencyPolicy = "none" | "revision";

export interface AiCapabilityLimits {
  maxRows?: number;
  timeoutMs?: number;
}

export interface AiCapability {
  code: string;
  appCode: string;
  name: string;
  description: string;
  kind: AiCapabilityKind;
  operation: AiCapabilityOperation;
  resources: string[];
  inputSchema: AiJsonSchema;
  outputSchema: AiJsonSchema;
  authorization: {
    capabilities: string[];
  };
  risk: AiCapabilityRisk;
  confirmation: AiConfirmationPolicy;
  idempotency: AiIdempotencyPolicy;
  concurrency: AiConcurrencyPolicy;
  limits: AiCapabilityLimits;
  sideEffects: string[];
  generatedFrom?: {
    resourceCode: string;
    operation: Exclude<AiCapabilityOperation, "custom">;
  };
  binding?: {
    kind: "app-api";
    operationCode: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
  };
}

export interface AiCapabilityCatalog {
  schemaVersion: typeof SCHEMA_VERSIONS.aiCapabilityCatalog;
  appCode: string;
  appName: string;
  sourceConfigDigest?: string;
  capabilities: AiCapability[];
}

const DIAGNOSTIC_SCHEMA = SCHEMA_VERSIONS.diagnostic;

function diagnostic(code: string, message: string, path: string): Diagnostic {
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA,
    code,
    severity: "error",
    message,
    path,
    source: "ai-capability-catalog",
    retryable: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validCapabilityCode(value: unknown): value is string {
  return (
    nonEmptyString(value) &&
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*){2,}$/.test(value)
  );
}

function validResourceCode(value: unknown): value is string {
  return (
    nonEmptyString(value) && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
  );
}

export function validateAiCapabilityCatalog(value: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic(
        "AI_CATALOG_INVALID",
        "AI Capability Catalog 必须是对象",
        "$"
      ),
    ];
  }
  if (value.schemaVersion !== SCHEMA_VERSIONS.aiCapabilityCatalog) {
    diagnostics.push(
      diagnostic(
        "AI_CATALOG_SCHEMA_UNSUPPORTED",
        `schemaVersion 必须是 ${SCHEMA_VERSIONS.aiCapabilityCatalog}`,
        "schemaVersion"
      )
    );
  }
  for (const field of ["appCode", "appName"] as const) {
    if (!nonEmptyString(value[field])) {
      diagnostics.push(
        diagnostic("AI_CATALOG_REQUIRED_STRING", `${field} 必须是非空字符串`, field)
      );
    }
  }
  if (
    value.sourceConfigDigest !== undefined &&
    (!nonEmptyString(value.sourceConfigDigest) ||
      !/^[0-9a-f]{64}$/.test(value.sourceConfigDigest))
  ) {
    diagnostics.push(
      diagnostic(
        "AI_CATALOG_SOURCE_DIGEST_INVALID",
        "sourceConfigDigest 必须是小写 64 位 SHA-256",
        "sourceConfigDigest"
      )
    );
  }
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities
    : [];
  if (!Array.isArray(value.capabilities) || capabilities.length > 500) {
    diagnostics.push(
      diagnostic(
        "AI_CATALOG_CAPABILITIES_INVALID",
        "capabilities 必须是最多 500 项的数组",
        "capabilities"
      )
    );
  }
  const codes = new Set<string>();
  capabilities.forEach((raw, index) => {
    const path = `capabilities[${index}]`;
    if (!isRecord(raw)) {
      diagnostics.push(diagnostic("AI_CAPABILITY_INVALID", `${path} 必须是对象`, path));
      return;
    }
    if (!validCapabilityCode(raw.code) || codes.has(String(raw.code))) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_CODE_INVALID",
          `${path}.code 必须是唯一的应用作用域能力编码`,
          `${path}.code`
        )
      );
    }
    codes.add(String(raw.code || ""));
    if (raw.appCode !== value.appCode) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_APP_MISMATCH",
          `${path}.appCode 必须与 Catalog.appCode 一致`,
          `${path}.appCode`
        )
      );
    }
    if (!nonEmptyString(raw.name) || !nonEmptyString(raw.description)) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_DESCRIPTION_REQUIRED",
          `${path} 必须声明 name 和 description`,
          path
        )
      );
    }
    if (!["generatedCrud", "customAction"].includes(String(raw.kind))) {
      diagnostics.push(
        diagnostic("AI_CAPABILITY_KIND_INVALID", `${path}.kind 不受支持`, `${path}.kind`)
      );
    }
    if (
      !["query", "get", "create", "update", "delete", "custom"].includes(
        String(raw.operation)
      )
    ) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_OPERATION_INVALID",
          `${path}.operation 不受支持`,
          `${path}.operation`
        )
      );
    }
    if (
      !Array.isArray(raw.resources) ||
      raw.resources.length === 0 ||
      raw.resources.length > 16 ||
      new Set(raw.resources).size !== raw.resources.length ||
      raw.resources.some(item => !validResourceCode(item))
    ) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_RESOURCES_INVALID",
          `${path}.resources 必须至少包含一个资源编码`,
          `${path}.resources`
        )
      );
    }
    for (const schemaField of ["inputSchema", "outputSchema"] as const) {
      if (!isRecord(raw[schemaField]) || raw[schemaField].type !== "object") {
        diagnostics.push(
          diagnostic(
            "AI_CAPABILITY_SCHEMA_INVALID",
            `${path}.${schemaField} 必须是 object JSON Schema`,
            `${path}.${schemaField}`
          )
        );
      }
    }
    const authorization = isRecord(raw.authorization)
      ? raw.authorization
      : {};
    if (
      !Array.isArray(authorization.capabilities) ||
      authorization.capabilities.length === 0 ||
      authorization.capabilities.some(item => !nonEmptyString(item))
    ) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_AUTHORIZATION_INVALID",
          `${path}.authorization.capabilities 必须至少包含一项已有 capability`,
          `${path}.authorization.capabilities`
        )
      );
    }
    const risk = String(raw.risk);
    const confirmation = String(raw.confirmation);
    const idempotency = String(raw.idempotency);
    const concurrency = String(raw.concurrency);
    const validExecutionPolicy =
      ["read", "write", "destructive", "external"].includes(risk) &&
      ["none", "required"].includes(confirmation) &&
      ["none", "required"].includes(idempotency) &&
      ["none", "revision"].includes(concurrency) &&
      (risk === "read"
        ? confirmation === "none" && idempotency === "none" && concurrency === "none"
        : confirmation === "required" && idempotency === "required");
    if (!validExecutionPolicy) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_EXECUTION_POLICY_INVALID",
          `${path} 的 risk、confirmation、idempotency、concurrency 组合无效`,
          path
        )
      );
    }
    const limits = isRecord(raw.limits) ? raw.limits : {};
    const maxRows = limits.maxRows;
    const timeoutMs = limits.timeoutMs;
    if (
      (maxRows !== undefined &&
        (!Number.isSafeInteger(maxRows) ||
          typeof maxRows !== "number" ||
          maxRows < 1 ||
          maxRows > 100)) ||
      (timeoutMs !== undefined &&
        (!Number.isSafeInteger(timeoutMs) ||
          typeof timeoutMs !== "number" ||
          timeoutMs < 100 ||
          timeoutMs > 30000))
    ) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_LIMITS_INVALID",
          `${path}.limits 必须保持在平台上限内`,
          `${path}.limits`
        )
      );
    }
    if (
      !Array.isArray(raw.sideEffects) ||
      raw.sideEffects.length > 20 ||
      new Set(raw.sideEffects).size !== raw.sideEffects.length ||
      raw.sideEffects.some(item => !nonEmptyString(item)) ||
      (risk === "read" && raw.sideEffects.length !== 0) ||
      (risk !== "read" && raw.sideEffects.length === 0)
    ) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_SIDE_EFFECTS_INVALID",
          `${path}.sideEffects 必须是数组`,
          `${path}.sideEffects`
        )
      );
    }
    if (raw.kind === "generatedCrud") {
      const generatedFrom = isRecord(raw.generatedFrom)
        ? raw.generatedFrom
        : {};
      if (
        !validResourceCode(generatedFrom.resourceCode) ||
        !(
          Array.isArray(raw.resources) &&
          raw.resources.includes(generatedFrom.resourceCode)
        ) ||
        generatedFrom.operation !== raw.operation ||
        !["query", "get", "create", "update", "delete"].includes(
          String(generatedFrom.operation)
        )
      ) {
        diagnostics.push(
          diagnostic(
            "AI_CAPABILITY_GENERATED_SOURCE_MISSING",
            `${path}.generatedFrom 必须精确绑定自动 CRUD 来源`,
            `${path}.generatedFrom`
          )
        );
      }
    }
    if (raw.kind === "generatedCrud" && raw.binding !== undefined) {
      diagnostics.push(
        diagnostic(
          "AI_CAPABILITY_GENERATED_BINDING_FORBIDDEN",
          `${path}.binding 不能用于自动 CRUD 能力`,
          `${path}.binding`
        )
      );
    }
    if (raw.kind === "customAction") {
      const binding = isRecord(raw.binding) ? raw.binding : {};
      if (
        binding.kind !== "app-api" ||
        !nonEmptyString(binding.operationCode) ||
        !/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(
          String(binding.operationCode)
        ) ||
        !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(
          String(binding.method)
        ) ||
        !nonEmptyString(binding.path) ||
        !/^\/[A-Za-z0-9/_-]+$/.test(String(binding.path)) ||
        String(binding.path).split("/").includes("..") ||
        (risk === "read") !== (binding.method === "GET") ||
        raw.generatedFrom !== undefined
      ) {
        diagnostics.push(
          diagnostic(
            "AI_CAPABILITY_CUSTOM_BINDING_INVALID",
            `${path}.binding 必须绑定一个静态 app-api 操作`,
            `${path}.binding`
          )
        );
      }
    }
  });
  return diagnostics;
}

export function assertAiCapabilityCatalog(
  value: unknown
): asserts value is AiCapabilityCatalog {
  const diagnostics = validateAiCapabilityCatalog(value);
  if (diagnostics.length > 0) {
    throw new Error(
      diagnostics.map(item => `${item.path}: ${item.message}`).join("; ")
    );
  }
}

export function aiJsonSchemaForField(
  field: Pick<DataFieldDefinition, "type" | "rangeBoundary">
): AiJsonSchema {
  const type = field.type;
  const labeledValue = {
    type: "object",
    additionalProperties: true,
    required: ["label", "value"],
    properties: {
      label: { type: "string" },
      value: { type: "string" },
    },
  };
  const labeledValues = { type: "array", items: labeledValue };
  const fileValue = {
    type: "object",
    additionalProperties: true,
    required: ["schemaVersion", "id", "name", "size", "contentType"],
    properties: {
      schemaVersion: { const: SCHEMA_VERSIONS.dataFileRef },
      id: { type: "string" },
      name: { type: "string" },
      size: { type: "integer" },
      contentType: { type: "string" },
    },
  };
  switch (type) {
    case "number.integer":
      return { type: "integer" };
    case "number.decimal":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "date":
      return { type: "string", format: "date" };
    case "time":
      return { type: "string", format: "time" };
    case "datetime":
      return { type: "string", format: "date-time" };
    case "date-range":
    case "datetime-range":
      return fieldValueSchemaForDefinition(field);
    case "option.single":
    case "user.single":
    case "department.single":
    case "resource-ref.single":
      return labeledValue;
    case "option.multiple":
    case "user.multiple":
    case "department.multiple":
    case "resource-ref.multiple":
      return labeledValues;
    case "cascade.single":
      return labeledValues;
    case "cascade.multiple":
      return { type: "array", items: labeledValues };
    case "file":
    case "image":
      return { type: "array", items: fileValue };
    case "signature":
    case "address":
    case "location":
      return { type: "object" };
    case "subtable":
      return { type: "array", items: { type: "object" } };
    case "uuid":
      return { type: "string", format: "uuid" };
    case "json":
      return {};
    case "text.short":
    case "text.long":
    case "text.rich":
    case "serial-number":
    default:
      return { type: "string" };
  }
}

export const aiCapabilityCatalogSchema = {
  $id: SCHEMA_VERSIONS.aiCapabilityCatalog,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "appCode", "appName", "capabilities"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.aiCapabilityCatalog },
    appCode: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    appName: { type: "string", minLength: 1 },
    sourceConfigDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    capabilities: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "code",
          "appCode",
          "name",
          "description",
          "kind",
          "operation",
          "resources",
          "inputSchema",
          "outputSchema",
          "authorization",
          "risk",
          "confirmation",
          "idempotency",
          "concurrency",
          "limits",
          "sideEffects",
        ],
        properties: {
          code: {
            type: "string",
            pattern:
              "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*){2,}$",
          },
          appCode: { type: "string" },
          name: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          kind: { enum: ["generatedCrud", "customAction"] },
          operation: {
            enum: ["query", "get", "create", "update", "delete", "custom"],
          },
          resources: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            uniqueItems: true,
            items: {
              type: "string",
              pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
            },
          },
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          authorization: {
            type: "object",
            additionalProperties: false,
            required: ["capabilities"],
            properties: {
              capabilities: {
                type: "array",
                minItems: 1,
                items: { type: "string" },
              },
            },
          },
          risk: { enum: ["read", "write", "destructive", "external"] },
          confirmation: { enum: ["none", "required"] },
          idempotency: { enum: ["none", "required"] },
          concurrency: { enum: ["none", "revision"] },
          limits: {
            type: "object",
            additionalProperties: false,
            properties: {
              maxRows: { type: "integer", minimum: 1, maximum: 100 },
              timeoutMs: { type: "integer", minimum: 100, maximum: 30000 },
            },
          },
          sideEffects: { type: "array", items: { type: "string" } },
          generatedFrom: {
            type: "object",
            additionalProperties: false,
            required: ["resourceCode", "operation"],
            properties: {
              resourceCode: { type: "string" },
              operation: {
                enum: ["query", "get", "create", "update", "delete"],
              },
            },
          },
          binding: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "operationCode", "method", "path"],
            properties: {
              kind: { const: "app-api" },
              operationCode: { type: "string", minLength: 1 },
              method: { enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
              path: { type: "string", pattern: "^/[A-Za-z0-9/_-]+$" },
            },
          },
        },
      },
    },
  },
} as const;
