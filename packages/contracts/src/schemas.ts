import { DATA_AUDIT_METADATA_FIELDS } from './native-compiler/data-audit-access.js';
import {
  CONFIGURATION_COMPATIBILITY_CAPABILITY,
  OPENXIANGDA_COMPILER_CONTRACT_VERSION,
  DEPLOYMENT_ENVIRONMENTS,
  LOCAL_RUNTIME_MODE,
  OPENXIANGDA_CONTRACT_VERSION,
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
  SCHEMA_VERSIONS,
  RUNTIME_CAPACITY_PREFLIGHT_SCHEMA,
  DATA_FIELD_TYPES,
} from "./types.js";
import {
  STUDIO_APPLICATION_AUTHORITY,
  STUDIO_CAPABILITIES_SCHEMA_VERSION,
  STUDIO_CLI_EVENT_SCHEMA_VERSION,
  STUDIO_CLI_EVENT_TYPES,
  STUDIO_CLI_RESULT_SCHEMA_VERSION,
  STUDIO_PLATFORM_CONTRACT_VERSION,
  STUDIO_SITE_PROFILE_ENDPOINT,
  STUDIO_SITE_PROFILE_SCHEMA_VERSION,
  STUDIO_SITE_PROFILE_UNAVAILABLE_CODES,
  STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION,
  STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
  STUDIO_WORKSPACE_PROTOCOL_VERSION,
  WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
} from "./studio.js";
import { aiCapabilityCatalogSchema } from "./ai.js";
import {
  departmentReferenceValueSchema,
  resourceReferenceValueSchema,
  userReferenceValueSchema,
} from "./field-value-schemas.js";
import {
  WORKFLOW_SUMMARY_ENVELOPE_MAX_BYTES,
  WORKFLOW_SUMMARY_MAX_FIELDS,
  WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES,
} from "./workflow-summary.js";
import {
  WORKFLOW_DETAIL_ENVELOPE_MAX_BYTES,
  WORKFLOW_DETAIL_MAX_FIELDS,
  WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES,
  WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS,
} from "./workflow-detail.js";

const digest = { type: "string", pattern: "^[0-9a-f]{64}$" } as const;
const prefixedDigest = {
  type: "string",
  pattern: "^sha256:[0-9a-f]{64}$",
} as const;
const dateTime = { type: "string", format: "date-time" } as const;
const nonEmptyString = { type: "string", minLength: 1 } as const;
const studioSiteBaseUrl = {
  type: "string",
  format: "uri",
  pattern: "^https://[^/?#@]+(?:/[^?#]*)?$",
  maxLength: 2048,
} as const;

export const diagnosticSchema = {
  $id: SCHEMA_VERSIONS.diagnostic,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "code", "severity", "message", "retryable"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.diagnostic },
    code: nonEmptyString,
    severity: { enum: ["info", "warning", "error"] },
    message: nonEmptyString,
    path: { type: "string" },
    source: { type: "string" },
    retryable: { type: "boolean" },
    remediation: { type: "string" },
    details: { type: "object" },
  },
} as const;

export const studioCliEventSchema = {
  $id: STUDIO_CLI_EVENT_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "eventId",
    "runId",
    "seq",
    "type",
    "timestamp",
    "payload",
  ],
  properties: {
    schemaVersion: { const: STUDIO_CLI_EVENT_SCHEMA_VERSION },
    eventId: nonEmptyString,
    runId: { type: "string", minLength: 1, maxLength: 256 },
    seq: { type: "integer", minimum: 1 },
    type: { enum: STUDIO_CLI_EVENT_TYPES },
    timestamp: dateTime,
    payload: { type: "object" },
  },
} as const;

export const workspaceTemplateBindingSchema = {
  $id: WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "ref", "digest"],
  properties: {
    schemaVersion: { const: WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION },
    ref: nonEmptyString,
    digest: prefixedDigest,
  },
} as const;

const studioWorkspaceCompilerSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "toolchainVersion",
    "contractVersion",
    "compilerContractVersion",
    "configurationDigest",
    "contractDigest",
    "aiCatalogDigest",
  ],
  properties: {
    toolchainVersion: nonEmptyString,
    contractVersion: nonEmptyString,
    compilerContractVersion: nonEmptyString,
    configurationDigest: digest,
    contractDigest: digest,
    aiCatalogDigest: digest,
  },
} as const;

export const studioWorkspaceBindingSchema = {
  $id: STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "applicationAuthority",
    "siteBaseUrl",
    "projectId",
    "provisioningRunId",
    "appType",
    "appName",
    "template",
    "state",
    "compiler",
  ],
  properties: {
    schemaVersion: { const: STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION },
    applicationAuthority: { const: STUDIO_APPLICATION_AUTHORITY },
    siteBaseUrl: studioSiteBaseUrl,
    projectId: { type: "string", format: "uuid" },
    provisioningRunId: { type: "string", format: "uuid" },
    appType: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    appName: { type: "string", minLength: 1, maxLength: 256 },
    template: workspaceTemplateBindingSchema,
    state: { enum: ["prepared", "compiled"] },
    compiler: {
      anyOf: [{ type: "null" }, studioWorkspaceCompilerSummarySchema],
    },
  },
} as const;

export const studioWorkspaceInitializationSchema = {
  $id: STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "applicationAuthority",
    "siteBaseUrl",
    "projectId",
    "provisioningRunId",
    "appType",
    "appName",
    "workspace",
    "cliVersion",
    "protocolVersion",
    "template",
    "compiler",
    "bindingDigest",
    "workspaceDigest",
  ],
  properties: {
    schemaVersion: { const: STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION },
    applicationAuthority: { const: STUDIO_APPLICATION_AUTHORITY },
    siteBaseUrl: studioSiteBaseUrl,
    projectId: { type: "string", format: "uuid" },
    provisioningRunId: { type: "string", format: "uuid" },
    appType: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    appName: { type: "string", minLength: 1, maxLength: 256 },
    workspace: {
      type: "object",
      additionalProperties: false,
      required: ["reused"],
      properties: {
        reused: { type: "boolean" },
      },
    },
    cliVersion: nonEmptyString,
    protocolVersion: { const: STUDIO_WORKSPACE_PROTOCOL_VERSION },
    template: workspaceTemplateBindingSchema,
    compiler: studioWorkspaceCompilerSummarySchema,
    bindingDigest: prefixedDigest,
    workspaceDigest: prefixedDigest,
  },
} as const;

export const workspaceContextSchema = {
  $id: SCHEMA_VERSIONS.workspaceContext,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "workspace",
    "roots",
    "toolchain",
    "environments",
    "changedDomains",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workspaceContext },
    development: {
      type: 'object', additionalProperties: false,
      required: ['schemaVersion', 'stage', 'readyForImplementation', 'design', 'readyForTest', 'changeId', 'acceptanceIds', 'currentSpecDigest', 'diagnostics', 'nextCommand', 'application', 'records'],
      properties: {
        schemaVersion: { const: 'openxiangda.development-lifecycle/v2' },
        stage: { enum: ['design-incomplete', 'ready-for-implementation', 'ready-for-test'] },
        readyForImplementation: { type: 'boolean' },
        design: {
          type: 'object', additionalProperties: false,
          required: ['readyForImplementation', 'reviewId', 'scope', 'baselineDigest', 'documentIds', 'diagnostics'],
          properties: {
            readyForImplementation: { type: 'boolean' }, reviewId: { type: ['string', 'null'] },
            scope: { enum: ['initial', 'change', null] }, baselineDigest: { type: ['string', 'null'] },
            documentIds: { type: 'array', maxItems: 128, items: nonEmptyString },
            diagnostics: { type: 'array', items: { $ref: SCHEMA_VERSIONS.diagnostic } },
          },
        },
        readyForTest: { type: 'boolean' },
        changeId: { type: ['string', 'null'] },
        acceptanceIds: { type: 'array', maxItems: 4096, items: nonEmptyString },
        currentSpecDigest: { type: ['string', 'null'] },
        diagnostics: { type: 'array', items: diagnosticSchema },
        nextCommand: nonEmptyString,
        application: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['path', 'content'], properties: { path: nonEmptyString, content: { type: 'string', maxLength: 262144 } } }] },
        records: { type: 'array', maxItems: 256, items: {
          type: 'object', additionalProperties: false, required: ['id', 'title', 'status', 'path', 'kind'],
          properties: { id: nonEmptyString, title: nonEmptyString, status: nonEmptyString, path: nonEmptyString, kind: { enum: ['app', 'capability', 'change', 'decision', 'design'] } },
        } },
      },
    },
    workspace: {
      type: "object",
      additionalProperties: false,
      required: ["appCode", "root"],
      properties: {
        appCode: nonEmptyString,
        name: { type: "string" },
        root: nonEmptyString,
        repository: { type: "string" },
        revision: { type: "string" },
        dirty: { type: "boolean" },
      },
    },
    roots: {
      type: "object",
      additionalProperties: false,
      required: ["frontend", "backend", "platform"],
      properties: {
        frontend: nonEmptyString,
        backend: nonEmptyString,
        platform: nonEmptyString,
      },
    },
    toolchain: {
      type: "object",
      additionalProperties: false,
      required: [
        "version",
        "contractVersion",
        "nodeVersion",
        "packageManager",
      ],
      properties: {
        packageName: { const: "openxiangda-devkit-core" },
        version: nonEmptyString,
        contractVersion: { const: OPENXIANGDA_CONTRACT_VERSION },
        nodeVersion: nonEmptyString,
        packageManager: nonEmptyString,
        studio: {
          type: "object",
          additionalProperties: false,
          required: [
            "schemaVersion",
            "cliResultSchemaVersion",
            "cliEvents",
            "templates",
            "initialization",
          ],
          properties: {
            schemaVersion: { const: STUDIO_WORKSPACE_PROTOCOL_VERSION },
            cliResultSchemaVersion: {
              const: STUDIO_CLI_RESULT_SCHEMA_VERSION,
            },
            cliEvents: {
              type: "object",
              additionalProperties: false,
              required: ["schemaVersion", "commands"],
              properties: {
                schemaVersion: { const: STUDIO_CLI_EVENT_SCHEMA_VERSION },
                commands: {
                  type: "array",
                  maxItems: 32,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "operation", "risk"],
                    properties: {
                      id: nonEmptyString,
                      operation: nonEmptyString,
                      risk: { enum: ["read", "write-local", "deploy"] },
                    },
                  },
                },
              },
            },
            templates: {
              type: "object",
              additionalProperties: false,
              required: [
                "schemaVersion",
                "digestAlgorithm",
                "supportedReferences",
              ],
              properties: {
                schemaVersion: {
                  const: WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
                },
                digestAlgorithm: { const: "sha256" },
                supportedReferences: {
                  type: "array",
                  prefixItems: [
                    { const: "builtin:application" },
                    { const: "file" },
                  ],
                  minItems: 2,
                  maxItems: 2,
                },
              },
            },
            initialization: {
              type: "object",
              additionalProperties: false,
              required: [
                "schemaVersion",
                "bindingSchemaVersion",
                "applicationAuthority",
                "applicationKey",
                "requiredCreateFlags",
                "repositoryAuthority",
              ],
              properties: {
                schemaVersion: {
                  const: STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
                },
                bindingSchemaVersion: {
                  const: STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION,
                },
                applicationAuthority: { const: STUDIO_APPLICATION_AUTHORITY },
                applicationKey: { const: "appType" },
                requiredCreateFlags: {
                  type: "array",
                  prefixItems: [
                    { const: "app-code" },
                    { const: "name" },
                    { const: "template-ref" },
                    { const: "template-digest" },
                    { const: "studio-project-id" },
                    { const: "provisioning-run-id" },
                    { const: "json-events" },
                    { const: "run-id" },
                  ],
                  minItems: 8,
                  maxItems: 8,
                },
                repositoryAuthority: { const: "site-git-broker" },
              },
            },
          },
        },
      },
    },
    environments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "kind"],
        properties: {
          id: { type: "string" },
          name: nonEmptyString,
          kind: {
            enum: DEPLOYMENT_ENVIRONMENTS,
          },
        },
      },
    },
    changedDomains: {
      type: "array",
      uniqueItems: true,
      items: {
        enum: [
          "frontend",
          "backend",
          "data",
          "authz",
          "events",
          "workflow",
          "config",
        ],
      },
    },
  },
} as const;

export const runtimeEnvironmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tenantId",
    "appCode",
    "environmentKey",
    "environmentKind",
    "displayName",
    "status",
    "runtimeState",
    "sideEffectPolicy",
    "revision",
    "createdBy",
    "updatedBy",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: nonEmptyString,
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: { enum: DEPLOYMENT_ENVIRONMENTS },
    environmentKind: { enum: DEPLOYMENT_ENVIRONMENTS },
    displayName: nonEmptyString,
    status: { enum: ["active", "decommissioned"] },
    runtimeState: { enum: ["running", "stopped"] },
    sideEffectPolicy: { type: "object" },
    revision: { type: "integer", minimum: 1 },
    createdBy: nonEmptyString,
    updatedBy: nonEmptyString,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const applicationSchema = {
  $id: SCHEMA_VERSIONS.application,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "created",
    "application",
    "environments",
    "bootstrapSuperAdminGrant",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.application },
    created: { type: "boolean" },
    application: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "id",
        "appCode",
        "name",
        "runtimeMode",
        "activeRuntimeReleaseId",
        "activeRuntimeBuildId",
      ],
      properties: {
        schemaVersion: { const: SCHEMA_VERSIONS.application },
        id: nonEmptyString,
        appCode: nonEmptyString,
        name: nonEmptyString,
        description: { type: ["string", "null"] },
        runtimeMode: { const: "react-spa" },
        activeRuntimeReleaseId: { type: ["string", "null"] },
        activeRuntimeBuildId: { type: ["string", "null"] },
        createdAt: { anyOf: [dateTime, { type: "null" }] },
        updatedAt: { anyOf: [dateTime, { type: "null" }] },
      },
    },
    environments: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: runtimeEnvironmentSchema,
    },
    bootstrapSuperAdminGrant: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "tenantId",
        "appCode",
        "userId",
        "status",
        "revision",
      ],
      properties: {
        id: nonEmptyString,
        tenantId: nonEmptyString,
        appCode: nonEmptyString,
        userId: nonEmptyString,
        userName: { type: ["string", "null"] },
        userAvatar: { type: ["string", "null"] },
        status: { enum: ["active", "revoked"] },
        revision: { type: "integer", minimum: 1 },
        createdAt: { anyOf: [dateTime, { type: "null" }] },
        updatedAt: { anyOf: [dateTime, { type: "null" }] },
      },
    },
  },
} as const;

export const principalSchema = {
  $id: SCHEMA_VERSIONS.principal,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "tenantId",
    "appCode",
    "environmentKey",
    "principalType",
    "subjectId",
    "authzVersion",
    "isAppSuperAdmin",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.principal },
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: nonEmptyString,
    principalType: { enum: ["user", "service", "public"] },
    subjectId: nonEmptyString,
    userId: { type: "string" },
    loginSessionId: { type: "string" },
    platformRoleCodes: {
      type: "array",
      maxItems: 32,
      uniqueItems: true,
      items: nonEmptyString,
    },
    clientRecordId: { type: "string" },
    clientId: { type: "string" },
    credentialVersion: { type: "integer", minimum: 1 },
    scopes: { type: "array", items: nonEmptyString },
    rateLimitPerMinute: { type: "integer", minimum: 1 },
    tokenId: { type: "string" },
    authzVersion: { type: "integer", minimum: 0 },
    isAppSuperAdmin: { type: "boolean" },
  },
} as const;

export const nativePrincipalSchema = {
  $id: SCHEMA_VERSIONS.nativePrincipal,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "tenantId", "appCode", "environmentId", "environmentKey",
    "activeAppVersionId", "environmentHeadRevision", "principalType", "subjectId",
    "userId", "displayName", "loginSessionId", "subjectKind", "roleCodes",
    "authzRevisionId", "authzVersion", "scopeDataVersion", "isAppSuperAdmin",
    "authorizationDigest", "capabilities", "expiresAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativePrincipal },
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    environmentId: nonEmptyString,
    environmentKey: { enum: [LOCAL_RUNTIME_MODE, ...DEPLOYMENT_ENVIRONMENTS] },
    activeAppVersionId: nonEmptyString,
    environmentHeadRevision: { type: "integer", minimum: 1 },
    principalType: { const: "user" },
    subjectId: nonEmptyString,
    userId: nonEmptyString,
    displayName: nonEmptyString,
    loginSessionId: nonEmptyString,
    subjectKind: { enum: ["super_admin", "role_union"] },
    roleCodes: {
      type: "array",
      maxItems: 32,
      uniqueItems: true,
      items: nonEmptyString,
    },
    platformRoleCodes: {
      type: "array",
      maxItems: 32,
      uniqueItems: true,
      items: nonEmptyString,
    },
    authzRevisionId: nonEmptyString,
    authzVersion: { type: "integer", minimum: 1 },
    scopeDataVersion: nonEmptyString,
    authorizationDigest: nonEmptyString,
    isAppSuperAdmin: { type: "boolean" },
    capabilities: {
      type: "array",
      maxItems: 2000,
      uniqueItems: true,
      items: nonEmptyString,
    },
    expiresAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

const gatewayInvocationTargetSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "tenantId",
    "appCode",
    "environmentId",
    "environmentKey",
    "appVersionId",
    "deploymentRunId",
    "headRevision",
    "backendRevisionId",
  ],
  properties: {
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    environmentId: nonEmptyString,
    environmentKey: { enum: [LOCAL_RUNTIME_MODE, ...DEPLOYMENT_ENVIRONMENTS] },
    appVersionId: nonEmptyString,
    deploymentRunId: nonEmptyString,
    headRevision: { type: "integer", minimum: 1 },
    backendRevisionId: nonEmptyString,
  },
} as const;

const gatewayApplicationPrincipalSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "principalType",
    "clientRecordId",
    "clientId",
    "credentialVersion",
    "tenantId",
    "appCode",
    "environmentId",
    "environmentKey",
    "appVersionId",
    "deploymentRunId",
    "headRevision",
    "scopes",
    "rateLimitPerMinute",
    "tokenId",
  ],
  properties: {
    principalType: { const: "application" },
    clientRecordId: nonEmptyString,
    clientId: nonEmptyString,
    credentialVersion: { type: "integer", minimum: 1 },
    runtimeContract: { const: "native-2" },
    runtimeCredentialId: nonEmptyString,
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    environmentId: nonEmptyString,
    environmentKey: { enum: [LOCAL_RUNTIME_MODE, ...DEPLOYMENT_ENVIRONMENTS] },
    appVersionId: nonEmptyString,
    deploymentRunId: nonEmptyString,
    headRevision: { type: "integer", minimum: 1 },
    scopes: {
      type: "array",
      maxItems: 2000,
      uniqueItems: true,
      items: nonEmptyString,
    },
    rateLimitPerMinute: { type: "integer", minimum: 1 },
    tokenId: nonEmptyString,
    issuedAt: { type: "integer", minimum: 0 },
    expiresAt: { type: "integer", minimum: 0 },
  },
} as const;

export const gatewayAssertionJwksSchema = {
  $id: SCHEMA_VERSIONS.gatewayAssertionJwks,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "keys"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.gatewayAssertionJwks },
    keys: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kty", "crv", "x", "use", "alg", "kid"],
        properties: {
          kty: { const: "OKP" },
          crv: { const: "Ed25519" },
          x: nonEmptyString,
          use: { const: "sig" },
          alg: { const: "EdDSA" },
          kid: {
            type: "string",
            minLength: 1,
            maxLength: 128,
            pattern: "^[A-Za-z0-9._-]+$",
          },
        },
      },
    },
  },
} as const;

export const gatewayInvocationPrincipalSchema = {
  $id: SCHEMA_VERSIONS.gatewayInvocationPrincipal,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "target",
    "principal",
    "invocationTokenId",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.gatewayInvocationPrincipal },
    target: gatewayInvocationTargetSchema,
    principal: {
      anyOf: [
        { $ref: SCHEMA_VERSIONS.nativePrincipal },
        gatewayApplicationPrincipalSchema,
      ],
    },
    invocationTokenId: nonEmptyString,
  },
} as const;

const runtimeTargetSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "environmentId",
    "appVersionId",
    "deploymentRunId",
    "headRevision",
  ],
  properties: {
    environmentId: nonEmptyString,
    appVersionId: nonEmptyString,
    deploymentRunId: nonEmptyString,
    headRevision: { type: "integer", minimum: 1 },
  },
} as const;

export const runtimeLeaseResultSchema = {
  $id: SCHEMA_VERSIONS.runtimeLeaseResult,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "granted",
    "released",
    "leaseToken",
    "expiresAt",
    "retryAfterMs",
    "target",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.runtimeLeaseResult },
    granted: { type: "boolean" },
    released: { type: "boolean" },
    leaseToken: { anyOf: [nonEmptyString, { type: "null" }] },
    expiresAt: { anyOf: [dateTime, { type: "null" }] },
    retryAfterMs: { type: "integer", minimum: 0, maximum: 20000 },
    target: runtimeTargetSchema,
  },
} as const;

export const runtimeSecretValuesSchema = {
  $id: SCHEMA_VERSIONS.runtimeSecretValues,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "target"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.runtimeSecretValues },
    items: {
      type: "array",
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "env", "value", "version", "revision"],
        properties: {
          name: nonEmptyString,
          env: {
            type: "string",
            pattern: "^[A-Z][A-Z0-9_]{0,127}$",
          },
          value: { type: "string" },
          version: { type: "integer", minimum: 1 },
          revision: { type: "integer", minimum: 1 },
        },
      },
    },
    target: runtimeTargetSchema,
  },
} as const;

export const subjectProfileSchema = {
  $id: SCHEMA_VERSIONS.subjectProfile,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "userId", "displayName", "avatarUrl", "jobNumber",
    "affiliatedDepartment",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.subjectProfile },
    userId: nonEmptyString,
    displayName: nonEmptyString,
    avatarUrl: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 2048 },
        { type: "null" },
      ],
    },
    jobNumber: { anyOf: [nonEmptyString, { type: "null" }] },
    affiliatedDepartment: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "name"],
          properties: { id: nonEmptyString, name: nonEmptyString },
        },
        { type: "null" },
      ],
    },
  },
} as const;

export const currentInitiatorDirectoryRequestSchema = {
  $id: SCHEMA_VERSIONS.currentInitiatorDirectoryRequest,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion"],
  properties: {
    schemaVersion: {
      const: SCHEMA_VERSIONS.currentInitiatorDirectoryRequest,
    },
  },
} as const;

const directorySnapshotValueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["value", "label"],
  properties: { value: nonEmptyString, label: nonEmptyString },
} as const;

export const currentInitiatorDirectorySnapshotSchema = {
  $id: SCHEMA_VERSIONS.currentInitiatorDirectorySnapshot,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "userId",
    "snapshotRevision",
    "resolvedAt",
  ],
  properties: {
    schemaVersion: {
      const: SCHEMA_VERSIONS.currentInitiatorDirectorySnapshot,
    },
    userId: nonEmptyString,
    displayName: nonEmptyString,
    employeeNumber: { anyOf: [nonEmptyString, { type: "null" }] },
    primaryDepartment: {
      anyOf: [directorySnapshotValueSchema, { type: "null" }],
    },
    departments: {
      type: "array",
      maxItems: 100,
      items: directorySnapshotValueSchema,
    },
    snapshotRevision: digest,
    resolvedAt: dateTime,
  },
} as const;

const roleSubjectChoiceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "subjectKey", "subjectKind", "role", "revision", "scopeDimensionCount",
    "scopeSummary", "scopeSummaryTruncated", "validFrom", "validTo",
  ],
  properties: {
    subjectKey: nonEmptyString,
    subjectKind: {
      enum: ["membership", "super_admin", "workflow_participant"],
    },
    role: {
      type: "object",
      additionalProperties: false,
      required: ["code", "name", "source", "description"],
      properties: {
        code: nonEmptyString,
        name: nonEmptyString,
        source: { enum: ["package", "manual", "reserved"] },
        description: {
          anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }],
        },
      },
    },
    revision: { type: "integer", minimum: 1 },
    scopeDimensionCount: { type: "integer", minimum: 0 },
    scopeSummary: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "dimensionCode", "valueCount", "previewValues", "operationCount",
          "truncated",
        ],
        properties: {
          dimensionCode: nonEmptyString,
          valueCount: { type: "integer", minimum: 0 },
          previewValues: {
            type: "array",
            maxItems: 3,
            items: { type: "string", maxLength: 64 },
          },
          operationCount: { type: "integer", minimum: 0 },
          truncated: { type: "boolean" },
        },
      },
    },
    scopeSummaryTruncated: { type: "boolean" },
    validFrom: { anyOf: [dateTime, { type: "null" }] },
    validTo: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const roleSubjectPageSchema = {
  $id: SCHEMA_VERSIONS.roleSubjectPage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "total", "nextCursor", "roleSubjectSetVersion"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.roleSubjectPage },
    items: { type: "array", maxItems: 50, items: roleSubjectChoiceSchema },
    total: { type: "integer", minimum: 0 },
    nextCursor: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 4096 },
        { type: "null" },
      ],
    },
    roleSubjectSetVersion: nonEmptyString,
  },
} as const;

const nativeStableCode = {
  type: "string",
  minLength: 1,
  maxLength: 255,
  pattern: "^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$",
} as const;

const nativeScopeGrantSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dimensionCode", "values", "operations"],
  properties: {
    dimensionCode: nativeStableCode,
    values: {
      type: "array",
      minItems: 1,
      maxItems: 1000,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 255 },
    },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: nonEmptyString,
    },
  },
} as const;

const nativeRoleMembershipSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "environmentId", "userId", "roleCode", "roleSource", "sourceCode",
    "maintainable", "immutableReason", "scopeGrants", "status", "revision",
    "validFrom", "validTo",
  ],
  properties: {
    id: nonEmptyString,
    environmentId: nonEmptyString,
    userId: nonEmptyString,
    userName: { type: ["string", "null"] },
    userAvatar: { type: ["string", "null"] },
    roleCode: nativeStableCode,
    roleName: { type: ["string", "null"] },
    roleSource: { enum: ["package", "manual"] },
    sourceCode: nativeStableCode,
    maintainable: { type: "boolean" },
    immutableReason: {
      enum: ["authenticated_user_role", "authorization_projection", null],
    },
    scopeGrants: {
      type: "array",
      maxItems: 100,
      items: nativeScopeGrantSchema,
    },
    status: { enum: ["active", "revoked", "expired"] },
    revision: { type: "integer", minimum: 1 },
    validFrom: { anyOf: [dateTime, { type: "null" }] },
    validTo: { anyOf: [dateTime, { type: "null" }] },
    createdAt: { anyOf: [dateTime, { type: "null" }] },
    updatedAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const nativeRoleMembershipPageSchema = {
  $id: SCHEMA_VERSIONS.nativeRoleMembershipPage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "total", "limit", "offset"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeRoleMembershipPage },
    items: { type: "array", maxItems: 100, items: nativeRoleMembershipSchema },
    total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
  },
} as const;

const nativeRoleManagementActionSchema = {
  enum: [
    "membership.read",
    "membership.assign",
    "membership.update",
    "membership.revoke",
    "management.delegate",
  ],
} as const;

const nativeRoleManagementAuthoritySchema = {
  type: "object",
  additionalProperties: false,
  required: ["unrestricted", "wildcardActions", "roles"],
  properties: {
    unrestricted: { type: "boolean" },
    wildcardActions: {
      type: "array",
      maxItems: 5,
      uniqueItems: true,
      items: nativeRoleManagementActionSchema,
    },
    roles: {
      type: "array",
      maxItems: 2000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["roleCode", "actions"],
        properties: {
          roleCode: nativeStableCode,
          actions: {
            type: "array",
            maxItems: 5,
            uniqueItems: true,
            items: nativeRoleManagementActionSchema,
          },
        },
      },
    },
  },
} as const;

const nativeRoleManagementGrantSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "environmentId", "subjectRoleCode", "manageAllRoles",
    "managedRoleCodes", "actions", "status", "revision", "reason",
    "createdBy", "updatedBy", "createdAt", "updatedAt",
  ],
  properties: {
    id: nonEmptyString,
    environmentId: nonEmptyString,
    subjectRoleCode: nativeStableCode,
    manageAllRoles: { type: "boolean" },
    managedRoleCodes: {
      type: "array",
      maxItems: 1000,
      uniqueItems: true,
      items: nativeStableCode,
    },
    actions: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: nativeRoleManagementActionSchema,
    },
    status: { enum: ["active", "revoked"] },
    revision: { type: "integer", minimum: 1 },
    reason: { type: "string", minLength: 1, maxLength: 1000 },
    createdBy: nonEmptyString,
    updatedBy: nonEmptyString,
    createdAt: { anyOf: [dateTime, { type: "null" }] },
    updatedAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const nativeRoleManagementGrantPageSchema = {
  $id: SCHEMA_VERSIONS.nativeRoleManagementGrantPage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "total", "limit", "offset"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeRoleManagementGrantPage },
    items: {
      type: "array",
      maxItems: 100,
      items: nativeRoleManagementGrantSchema,
    },
    total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
  },
} as const;

export const nativeAuthorizationMutationReceiptSchema = {
  $id: SCHEMA_VERSIONS.nativeAuthorizationMutationReceipt,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "operationId", "operationKind", "requestDigest",
    "actorUserId", "reason", "result", "replayed", "createdAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeAuthorizationMutationReceipt },
    operationId: nonEmptyString,
    operationKind: nonEmptyString,
    requestDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    actorUserId: nonEmptyString,
    reason: { type: ["string", "null"], maxLength: 1000 },
    result: { type: "object" },
    replayed: { type: "boolean" },
    createdAt: dateTime,
  },
} as const;

export const nativeAuthorizationManagementCatalogSchema = {
  $id: SCHEMA_VERSIONS.nativeAuthorizationManagementCatalog,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "environment", "roles", "roleManagement",
    "scopeDimensions",
  ],
  properties: {
    schemaVersion: {
      const: SCHEMA_VERSIONS.nativeAuthorizationManagementCatalog,
    },
    environment: {
      type: "object",
      additionalProperties: false,
      required: [
        "id", "key", "activeAppVersionId", "headRevision",
        "dataLogicalRevisionId", "authzRevisionId", "authzVersion",
        "scopeDataVersion",
      ],
      properties: {
        id: nonEmptyString,
        key: { enum: ["preproduction", "production"] },
        activeAppVersionId: nonEmptyString,
        headRevision: { type: "integer", minimum: 1 },
        dataLogicalRevisionId: nonEmptyString,
        authzRevisionId: nonEmptyString,
        authzVersion: { type: "integer", minimum: 1 },
        scopeDataVersion: nonEmptyString,
      },
    },
    roles: {
      type: "array",
      maxItems: 2000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "name", "description", "capabilityCodes", "source"],
        properties: {
          code: nativeStableCode,
          name: nonEmptyString,
          description: { type: ["string", "null"] },
          capabilityCodes: {
            type: "array",
            maxItems: 2000,
            uniqueItems: true,
            items: nonEmptyString,
          },
          source: { enum: ["package", "manual"] },
        },
      },
    },
    roleManagement: nativeRoleManagementAuthoritySchema,
    scopeDimensions: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "code", "name", "resourceCode", "valueType", "hierarchyMode",
          "valueSource", "applicability",
        ],
        properties: {
          code: nativeStableCode,
          name: nonEmptyString,
          resourceCode: { anyOf: [nativeStableCode, { type: "null" }] },
          valueType: { type: ["string", "null"] },
          hierarchyMode: { type: ["string", "null"] },
          valueSource: { anyOf: [{ type: "object" }, { type: "null" }] },
          applicability: {
            type: "object",
            additionalProperties: false,
            required: [
              "dimensionCode", "allRoles", "roleCodes",
              "unrestrictedRoleCodes", "rules",
            ],
            properties: {
              dimensionCode: nativeStableCode,
              allRoles: { type: "boolean" },
              roleCodes: {
                type: "array",
                maxItems: 2000,
                uniqueItems: true,
                items: nativeStableCode,
              },
              unrestrictedRoleCodes: {
                type: "array",
                maxItems: 2000,
                uniqueItems: true,
                items: nativeStableCode,
              },
              rules: {
                type: "array",
                maxItems: 200,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "policyCode", "allRoles", "roleCodes",
                    "unrestrictedRoleCodes",
                  ],
                  properties: {
                    policyCode: nativeStableCode,
                    allRoles: { type: "boolean" },
                    roleCodes: {
                      type: "array",
                      maxItems: 2000,
                      uniqueItems: true,
                      items: nativeStableCode,
                    },
                    unrestrictedRoleCodes: {
                      type: "array",
                      maxItems: 2000,
                      uniqueItems: true,
                      items: nativeStableCode,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const nativeSuperAdminGrantSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "tenantId", "appCode", "userId", "status", "revision",
  ],
  properties: {
    id: nonEmptyString,
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    userId: nonEmptyString,
    userName: { type: ["string", "null"] },
    userAvatar: { type: ["string", "null"] },
    status: { enum: ["active", "revoked"] },
    revision: { type: "integer", minimum: 1 },
    createdAt: { anyOf: [dateTime, { type: "null" }] },
    updatedAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const nativeSuperAdminGrantPageSchema = {
  $id: SCHEMA_VERSIONS.nativeSuperAdminGrantPage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "total", "limit", "offset"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeSuperAdminGrantPage },
    items: { type: "array", maxItems: 100, items: nativeSuperAdminGrantSchema },
    total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
  },
} as const;

const nativeRelationshipGrantSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "environmentId", "relationCode", "subjectType", "subjectKey",
    "resourceCode", "resourceId", "operations", "sourceCode", "status",
    "revision", "validFrom", "validTo",
  ],
  properties: {
    id: nonEmptyString,
    environmentId: nonEmptyString,
    relationCode: nativeStableCode,
    subjectType: { enum: ["user", "role_membership"] },
    subjectKey: nonEmptyString,
    resourceCode: nativeStableCode,
    resourceId: nonEmptyString,
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: nonEmptyString,
    },
    sourceCode: nativeStableCode,
    status: { enum: ["active", "revoked", "expired"] },
    revision: { type: "integer", minimum: 1 },
    validFrom: { anyOf: [dateTime, { type: "null" }] },
    validTo: { anyOf: [dateTime, { type: "null" }] },
    createdAt: { anyOf: [dateTime, { type: "null" }] },
    updatedAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const nativeRelationshipGrantPageSchema = {
  $id: SCHEMA_VERSIONS.nativeRelationshipGrantPage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "total", "limit", "offset"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeRelationshipGrantPage },
    items: {
      type: "array",
      maxItems: 100,
      items: nativeRelationshipGrantSchema,
    },
    total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
  },
} as const;

export const nativeAuthorizationProjectionHealthSchema = {
  $id: SCHEMA_VERSIONS.nativeAuthorizationProjectionHealth,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "ready",
    "environmentId",
    "authzRevisionId",
    "activeAuthzRevisionId",
    "sourceCount",
    "sources",
  ],
  properties: {
    schemaVersion: {
      const: SCHEMA_VERSIONS.nativeAuthorizationProjectionHealth,
    },
    ready: { type: "boolean" },
    environmentId: nonEmptyString,
    authzRevisionId: nonEmptyString,
    activeAuthzRevisionId: { anyOf: [nonEmptyString, { type: "null" }] },
    sourceCount: { type: "integer", minimum: 0, maximum: 200 },
    sources: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "sourceCode",
          "desiredPresent",
          "status",
          "sourceRevision",
          "projectedRevision",
          "jobId",
          "jobStatus",
          "errorCode",
        ],
        properties: {
          kind: { enum: ["role_membership", "relationship_grant"] },
          sourceCode: nativeStableCode,
          desiredPresent: { type: "boolean" },
          status: {
            anyOf: [
              { enum: ["stale", "processing", "healthy", "retired", "failed"] },
              { type: "null" },
            ],
          },
          sourceRevision: {
            anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
          },
          projectedRevision: {
            anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
          },
          jobId: { anyOf: [nonEmptyString, { type: "null" }] },
          jobStatus: {
            anyOf: [
              {
                enum: [
                  "pending",
                  "processing",
                  "retry_wait",
                  "succeeded",
                  "dead_letter",
                  "superseded",
                ],
              },
              { type: "null" },
            ],
          },
          errorCode: { anyOf: [nonEmptyString, { type: "null" }] },
        },
      },
    },
  },
} as const;

export const runtimeAuthorizationSchema = {
  $id: SCHEMA_VERSIONS.runtimeAuthorization,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "state", "environment", "subjectProfile", "roles",
    "principal",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.runtimeAuthorization },
    state: { enum: ["active", "unassigned"] },
    environment: {
      type: "object",
      additionalProperties: false,
      required: ["id", "key", "activeAppVersionId", "headRevision"],
      properties: {
        id: nonEmptyString,
        key: { enum: [...DEPLOYMENT_ENVIRONMENTS] },
        activeAppVersionId: nonEmptyString,
        headRevision: { type: "integer", minimum: 1 },
        authzRevisionId: nonEmptyString,
        authzVersion: { type: "integer", minimum: 1 },
        scopeDataVersion: nonEmptyString,
      },
    },
    subjectProfile: { $ref: SCHEMA_VERSIONS.subjectProfile },
    roles: {
      type: "array",
      maxItems: 128,
      uniqueItems: true,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "name", "source"],
        properties: {
          code: nonEmptyString,
          name: nonEmptyString,
          source: { enum: ["package", "manual", "reserved"] },
        },
      },
    },
    principal: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "type", "userId", "roleCodes", "capabilityCodes",
            "isAppSuperAdmin", "identityScope",
          ],
          properties: {
            type: { enum: ["user_union", "developer"] },
            userId: nonEmptyString,
            roleCodes: {
              type: "array",
              maxItems: 128,
              uniqueItems: true,
              items: nonEmptyString,
            },
            capabilityCodes: {
              type: "array",
              maxItems: 2048,
              uniqueItems: true,
              items: nonEmptyString,
            },
            isAppSuperAdmin: { type: "boolean" },
            identityScope: nonEmptyString,
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;

export const roleAssignmentSchema = {
  $id: SCHEMA_VERSIONS.roleAssignment,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "tenantId",
    "appCode",
    "userId",
    "role",
    "status",
    "revision",
    "scopeGrants",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.roleAssignment },
    id: nonEmptyString,
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    userId: nonEmptyString,
    role: {
      type: "object",
      additionalProperties: false,
      required: ["id", "code", "name", "isAppSuperAdmin"],
      properties: {
        id: nonEmptyString,
        code: nonEmptyString,
        name: nonEmptyString,
        isAppSuperAdmin: { type: "boolean" },
      },
    },
    status: { enum: ["active", "revoked", "expired"] },
    revision: { type: "integer", minimum: 1 },
    scopeGrants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimensionCode", "values", "operations"],
        properties: {
          dimensionCode: nonEmptyString,
          values: {
            type: "array",
            uniqueItems: true,
            minItems: 1,
            items: nonEmptyString,
          },
          operations: {
            type: "array",
            uniqueItems: true,
            minItems: 1,
            items: nonEmptyString,
          },
        },
      },
    },
    validFrom: { anyOf: [dateTime, { type: "null" }] },
    validTo: { anyOf: [dateTime, { type: "null" }] },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const relationshipGrantSchema = {
  $id: SCHEMA_VERSIONS.relationshipGrant,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "tenantId",
    "appCode",
    "relationCode",
    "subjectType",
    "subjectKey",
    "resourceCode",
    "resourceId",
    "operations",
    "sourceCode",
    "status",
    "revision",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.relationshipGrant },
    id: nonEmptyString,
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    relationCode: nonEmptyString,
    subjectType: { enum: ["user", "role_assignment"] },
    subjectKey: nonEmptyString,
    resourceCode: nonEmptyString,
    resourceId: nonEmptyString,
    operations: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: nonEmptyString,
    },
    sourceCode: nonEmptyString,
    status: { enum: ["active", "revoked", "expired"] },
    revision: { type: "integer", minimum: 1 },
    validFrom: { anyOf: [dateTime, { type: "null" }] },
    validTo: { anyOf: [dateTime, { type: "null" }] },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

const authorizationDecisionLayerSchema = {
  type: "object",
  required: ["layer", "allowed"],
  properties: {
    layer: {
      enum: ["app_super_admin", "rbac", "data_policy", "field_policy"],
    },
    allowed: { type: "boolean" },
    reason: { type: "string" },
    detail: { type: "object" },
  },
} as const;

export const authorizationDecisionSchema = {
  $id: SCHEMA_VERSIONS.authorizationDecision,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "explainId",
    "allowed",
    "principal",
    "decisions",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.authorizationDecision },
    explainId: nonEmptyString,
    allowed: { type: "boolean" },
    principal: { $ref: SCHEMA_VERSIONS.principal },
    decisions: {
      type: "array",
      minItems: 1,
      items: authorizationDecisionLayerSchema,
    },
  },
} as const;

const authorizationExplainRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "capability"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 128 },
    capability: { type: "string", minLength: 1, maxLength: 255 },
    dataPolicyCode: { type: "string", minLength: 1, maxLength: 128 },
    operation: { type: "string", minLength: 1, maxLength: 64 },
    data: { type: "object" },
  },
} as const;

export const authorizationBatchRequestSchema = {
  $id: SCHEMA_VERSIONS.authorizationBatchRequest,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "requests"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.authorizationBatchRequest },
    requests: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: authorizationExplainRequestSchema,
    },
  },
} as const;

export const authorizationBatchResultSchema = {
  $id: SCHEMA_VERSIONS.authorizationBatchResult,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "principal", "items"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.authorizationBatchResult },
    principal: { $ref: SCHEMA_VERSIONS.principal },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "decision"],
        properties: {
          key: authorizationExplainRequestSchema.properties.key,
          decision: { $ref: SCHEMA_VERSIONS.authorizationDecision },
        },
      },
    },
  },
} as const;

const nativeAuthorizationIdentitySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "environmentId",
    "environmentKey",
    "authzRevisionId",
    "authzVersion",
    "scopeDataVersion",
  ],
  properties: {
    environmentId: nonEmptyString,
    environmentKey: { enum: [LOCAL_RUNTIME_MODE, ...DEPLOYMENT_ENVIRONMENTS] },
    authzRevisionId: nonEmptyString,
    authzVersion: { type: "integer", minimum: 1 },
    scopeDataVersion: nonEmptyString,
  },
} as const;

const nativeAuthorizationDecisionLayerSchema = {
  ...authorizationDecisionLayerSchema,
  additionalProperties: false,
  properties: {
    ...authorizationDecisionLayerSchema.properties,
    reason: { type: "string", maxLength: 255 },
    detail: { type: "object", maxProperties: 20 },
  },
} as const;

export const nativeAuthorizationDecisionSchema = {
  $id: SCHEMA_VERSIONS.nativeAuthorizationDecision,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "explainId", "allowed", "identity", "decisions"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeAuthorizationDecision },
    explainId: nonEmptyString,
    allowed: { type: "boolean" },
    identity: nativeAuthorizationIdentitySchema,
    decisions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: nativeAuthorizationDecisionLayerSchema,
    },
  },
} as const;

const nativeAuthorizationExplainRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "capability"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 128 },
    capability: { type: "string", minLength: 1, maxLength: 255 },
    dataPolicyCode: { type: "string", minLength: 1, maxLength: 128 },
    operation: { type: "string", minLength: 1, maxLength: 64 },
    data: { type: "object", maxProperties: 100 },
  },
} as const;

export const nativeAuthorizationBatchRequestSchema = {
  $id: SCHEMA_VERSIONS.nativeAuthorizationBatchRequest,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "requests"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeAuthorizationBatchRequest },
    requests: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: nativeAuthorizationExplainRequestSchema,
    },
  },
} as const;

export const nativeAuthorizationBatchResultSchema = {
  $id: SCHEMA_VERSIONS.nativeAuthorizationBatchResult,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "identity", "items"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeAuthorizationBatchResult },
    identity: nativeAuthorizationIdentitySchema,
    items: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "decision"],
        properties: {
          key: nativeAuthorizationExplainRequestSchema.properties.key,
          decision: { $ref: SCHEMA_VERSIONS.nativeAuthorizationDecision },
        },
      },
    },
  },
} as const;

const directoryKindSchema = { enum: ["department", "user"] } as const;

const directoryEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "id", "label", "snapshot"],
  properties: {
    kind: directoryKindSchema,
    id: nonEmptyString,
    label: nonEmptyString,
    snapshot: {
      anyOf: [userReferenceValueSchema, departmentReferenceValueSchema],
    },
    description: { type: "string" },
    selectable: { type: "boolean" },
    path: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label"],
        properties: { id: nonEmptyString, label: nonEmptyString },
      },
    },
  },
} as const;

const selectableDirectoryEntrySchema = {
  ...directoryEntrySchema,
  required: [...directoryEntrySchema.required, "selectable"],
} as const;

export const directoryResolveRequestSchema = {
  $id: SCHEMA_VERSIONS.directoryResolveRequest,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "kind", "ids"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.directoryResolveRequest },
    kind: directoryKindSchema,
    ids: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      uniqueItems: true,
      items: nonEmptyString,
    },
  },
} as const;

export const directorySearchResultSchema = {
  $id: SCHEMA_VERSIONS.directorySearchResult,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "kind", "items", "total"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.directorySearchResult },
    kind: directoryKindSchema,
    items: {
      type: "array",
      maxItems: 50,
      items: directoryEntrySchema,
    },
    total: { type: "integer", minimum: 0 },
  },
} as const;

export const directoryEntryPageSchema = {
  $id: SCHEMA_VERSIONS.directoryEntryPage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "kind", "items", "nextCursor"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.directoryEntryPage },
    kind: directoryKindSchema,
    items: {
      type: "array",
      maxItems: 50,
      items: selectableDirectoryEntrySchema,
    },
    nextCursor: { type: ["string", "null"] },
  },
} as const;

export const nativeScopeValueResolveRequestSchema = {
  $id: SCHEMA_VERSIONS.nativeScopeValueResolveRequest,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "dimensionCode", "operation", "values"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeScopeValueResolveRequest },
    dimensionCode: nativeStableCode,
    operation: { enum: ["create", "update"] },
    values: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      uniqueItems: true,
      items: nonEmptyString,
    },
  },
} as const;

const nativeSelectorEnvironmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "key",
    "activeAppVersionId",
    "headRevision",
    "authzRevisionId",
    "authzVersion",
    "scopeDataVersion",
  ],
  properties: {
    id: nonEmptyString,
    key: { enum: DEPLOYMENT_ENVIRONMENTS },
    activeAppVersionId: nonEmptyString,
    headRevision: { type: "integer", minimum: 1 },
    authzRevisionId: nonEmptyString,
    authzVersion: { type: "integer", minimum: 1 },
    scopeDataVersion: nonEmptyString,
  },
} as const;

export const nativeScopeValuePageSchema = {
  $id: SCHEMA_VERSIONS.nativeScopeValuePage,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "environment",
    "resourceCode",
    "fieldCode",
    "dimensionCode",
    "operation",
    "items",
    "nextCursor",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.nativeScopeValuePage },
    environment: nativeSelectorEnvironmentSchema,
    resourceCode: nativeStableCode,
    fieldCode: {
      type: "string",
      pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
    },
    dimensionCode: nativeStableCode,
    operation: { enum: ["create", "update"] },
    items: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["value", "label", "selectable"],
        properties: {
          value: nonEmptyString,
          label: nonEmptyString,
          selectable: { type: "boolean" },
        },
      },
    },
    nextCursor: { type: ["string", "null"] },
  },
} as const;

export const dataFieldSourceQuerySchema = {
  $id: SCHEMA_VERSIONS.dataFieldSourceQuery,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "operation"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataFieldSourceQuery },
    operation: { enum: ["create", "update"] },
    launch: {
      type: "object", additionalProperties: false,
      required: ["workflowCode", "operationCode"],
      properties: {
        workflowCode: { type: "string", minLength: 1, maxLength: 128 },
        operationCode: { type: "string", minLength: 1, maxLength: 255 },
      },
    },
    keyword: { type: "string", maxLength: 500 },
    cursor: { type: "string", minLength: 1, maxLength: 4096 },
    bindings: {
      type: "object",
      maxProperties: 20,
      propertyNames: {
        pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
      },
      additionalProperties: true,
    },
  },
} as const;

export const dataFieldSourcePageSchema = {
  $id: SCHEMA_VERSIONS.dataFieldSourcePage,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "environment",
    "resourceCode",
    "fieldCode",
    "sourceResourceCode",
    "operation",
    "items",
    "nextCursor",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataFieldSourcePage },
    environment: nativeSelectorEnvironmentSchema,
    resourceCode: nativeStableCode,
    fieldCode: {
      type: "string",
      pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
    },
    sourceResourceCode: nativeStableCode,
    operation: { enum: ["create", "update"] },
    items: {
      type: "array",
      maxItems: 100,
      items: resourceReferenceValueSchema,
    },
    nextCursor: { type: ["string", "null"] },
  },
} as const;

export const dataRefSchema = {
  $id: SCHEMA_VERSIONS.dataRef,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "appCode", "resource", "recordId", "revision"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataRef },
    appCode: nonEmptyString,
    resource: nonEmptyString,
    recordId: nonEmptyString,
    revision: { type: "integer", minimum: 0 },
    environmentKey: nonEmptyString,
  },
} as const;

const dataFieldCode = {
  type: "string",
  pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
} as const;

const dataResourceCode = {
  type: "string",
  pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
} as const;

const labeledValueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value"],
  properties: {
    label: { type: "string", minLength: 1, maxLength: 500 },
    value: { type: "string", minLength: 1, maxLength: 500 },
    description: { type: "string", maxLength: 2000 },
    color: { type: "string", maxLength: 64 },
  },
} as const;

const dataFieldOptionSchema = {
  ...labeledValueSchema,
  properties: {
    ...labeledValueSchema.properties,
    children: {
      type: "array",
      maxItems: 100,
      items: { $ref: "#/$defs/dataFieldOption" },
    },
  },
} as const;

const dataFieldResourceSourceFilterSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "operator", "value"],
      properties: {
        field: dataFieldCode,
        operator: { enum: ["eq", "in"] },
        value: {},
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "operator", "binding"],
      properties: {
        field: dataFieldCode,
        operator: { enum: ["eq", "in"] },
        binding: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "field"],
          properties: {
            kind: { const: "field" },
            field: dataFieldCode,
          },
        },
      },
    },
  ],
} as const;

const dataFieldResourceSourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "resourceCode", "labelField"],
  properties: {
    kind: { const: "resource" },
    resourceCode: dataResourceCode,
    labelField: dataFieldCode,
    searchFields: {
      type: "array",
      uniqueItems: true,
      maxItems: 10,
      items: dataFieldCode,
    },
    descriptionFields: {
      type: "array",
      uniqueItems: true,
      maxItems: 10,
      items: dataFieldCode,
    },
    snapshotFields: {
      type: "array",
      uniqueItems: true,
      maxItems: 50,
      items: dataFieldCode,
    },
    filters: {
      type: "array",
      maxItems: 20,
      items: dataFieldResourceSourceFilterSchema,
    },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
    loadMode: { enum: ["search", "all"] },
  },
} as const;

const dataCapabilities = {
  type: "object",
  additionalProperties: false,
  required: ["read", "create", "update", "delete"],
  properties: {
    read: nonEmptyString,
    create: nonEmptyString,
    update: nonEmptyString,
    delete: nonEmptyString,
  },
} as const;

const dataFieldSurfaceSchema = {
  type: "object",
  additionalProperties: false,
  allOf: [
    {
      if: {
        properties: { type: { enum: ["date-range", "datetime-range"] } },
        required: ["type"],
      },
      then: { required: ["rangeBoundary"] },
    },
    {
      if: {
        properties: {
          type: { not: { enum: ["date-range", "datetime-range"] } },
        },
        required: ["type"],
      },
      then: { not: { required: ["rangeBoundary"] } },
    },
  ],
  required: [
    "label",
    "type",
    "widget",
    "readCapabilities",
    "createCapabilities",
    "updateCapabilities",
  ],
  properties: {
    label: nonEmptyString,
    type: { enum: DATA_FIELD_TYPES },
    widget: {
      enum: [
        "text", "textarea", "number", "money", "percent", "rating", "date",
        "time", "datetime", "date-range", "datetime-range", "switch",
        "select", "multi-select", "radio", "checkbox", "cascade",
        "email", "phone", "attachment", "image", "rich-text", "address",
        "location", "signature", "subtable", "scope", "directory-user",
        "directory-department", "resource", "json", "readonly",
      ],
    },
    section: { type: "string", maxLength: 200 },
    requiredHint: { type: "boolean" },
    system: { type: "boolean" },
    hidden: { type: "boolean" },
    readCapabilities: {
      type: "array",
      uniqueItems: true,
      maxItems: 20,
      items: nonEmptyString,
    },
    createCapabilities: {
      type: "array",
      uniqueItems: true,
      maxItems: 20,
      items: nonEmptyString,
    },
    updateCapabilities: {
      type: "array",
      uniqueItems: true,
      maxItems: 20,
      items: nonEmptyString,
    },
    maxLength: { type: "integer", minimum: 1, maximum: 1000000 },
    precision: { type: "integer", minimum: 1, maximum: 1000 },
    scale: { type: "integer", minimum: 0, maximum: 1000 },
    min: { type: "number" },
    max: { type: "number" },
    rangeBoundary: { enum: ["closed", "half-open"] },
    maxCount: { type: "integer", minimum: 1, maximum: 100 },
    maxSizeMb: { type: "integer", minimum: 1, maximum: 1024 },
    accept: {
      oneOf: [
        nonEmptyString,
        {
          type: "array",
          uniqueItems: true,
          maxItems: 50,
          items: nonEmptyString,
        },
      ],
    },
    options: {
      type: "array",
      maxItems: 100,
      items: { $ref: "#/$defs/dataFieldOption" },
    },
    list: { type: "boolean" },
    searchable: { type: "boolean" },
    sortable: { type: "boolean" },
    source: dataFieldResourceSourceSchema,
    timePrecision: { enum: ["minute", "second"] },
    serial: {
      type: "object",
      additionalProperties: false,
      properties: {
        prefix: { type: "string", maxLength: 64 },
        digits: { type: "integer", minimum: 1, maximum: 32 },
        start: { type: "integer", minimum: 0 },
      },
    },
    subtable: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "foreignKey", "orderField"],
      properties: {
        resourceCode: dataResourceCode,
        foreignKey: dataFieldCode,
        orderField: dataFieldCode,
        maxRows: { type: "integer", minimum: 1, maximum: 49 },
      },
    },
  },
} as const;

const dataResourceBaseSurfaceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fields"],
  properties: {
    mutationOwner: { enum: ["native", "action", "readonly", "workflow"] },
    generated: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        ["list", "detail", "create", "update", "delete"].map(key => [
          key,
          { type: "boolean" },
        ])
      ),
    },
    fields: {
      type: "object",
      additionalProperties: dataFieldSurfaceSchema,
    },
    list: {
      type: "object",
      additionalProperties: false,
      properties: {
        actions: {
          type: "object",
          additionalProperties: false,
          properties: { import: { type: "boolean" }, export: { type: "boolean" } },
        },
        fieldOrder: {
          type: "array",
          uniqueItems: true,
          maxItems: 500,
          items: dataFieldCode,
        },
        defaultPageSize: { type: "integer", minimum: 1, maximum: 200 },
        searchableFields: {
          type: "array",
          uniqueItems: true,
          maxItems: 20,
          items: dataFieldCode,
        },
        filterFields: {
          type: "array",
          uniqueItems: true,
          maxItems: 50,
          items: dataFieldCode,
        },
        defaultSort: {
          type: "object",
          additionalProperties: false,
          required: ["field"],
          properties: {
            field: dataFieldCode,
            order: { enum: ["asc", "desc"] },
          },
        },
      },
    },
    form: {
      type: "object",
      additionalProperties: false,
      properties: {
        layout: { enum: ["flat", "sections"] },
        fieldOrder: {
          type: "array",
          uniqueItems: true,
          maxItems: 500,
          items: dataFieldCode,
        },
      },
    },
    detail: {
      type: "object",
      additionalProperties: false,
      properties: {
        layout: { enum: ["flat", "sections"] },
        fieldOrder: {
          type: "array",
          uniqueItems: true,
          maxItems: 500,
          items: dataFieldCode,
        },
      },
    },
    mobile: {
      type: "object",
      additionalProperties: false,
      properties: { enabled: { type: "boolean" } },
    },
  },
} as const;


const dataResourceSurfaceSchema = {
  ...dataResourceBaseSurfaceSchema,
  properties: {
    ...dataResourceBaseSurfaceSchema.properties,
    views: {
      type: "array", maxItems: 20,
      items: {
        type: "object", additionalProperties: false,
        required: ["code", "name", "generated", "list", "form", "detail", "mobile"],
        properties: {
          code: dataResourceCode, name: { type: "string", minLength: 1, maxLength: 255 },
          generated: { ...dataResourceBaseSurfaceSchema.properties.generated, required: ['list', 'detail', 'create', 'update', 'delete'] },
          list: { ...dataResourceBaseSurfaceSchema.properties.list, required: ['fieldOrder'] },
          form: { ...dataResourceBaseSurfaceSchema.properties.form, required: ['fieldOrder'] },
          detail: { ...dataResourceBaseSurfaceSchema.properties.detail, required: ['fieldOrder'] },
          mobile: { ...dataResourceBaseSurfaceSchema.properties.mobile, required: ['enabled'] },
          sections: { type: "array", maxItems: 100, items: {
            type: "object", additionalProperties: false, required: ["title", "fields"],
            properties: {
              title: { type: "string", minLength: 1, maxLength: 255 },
              fields: { type: "array", maxItems: 100, uniqueItems: true, items: dataFieldCode },
            },
          } },
        },
      },
    },
  },
} as const;

export const dataResourceSchema = {
  $id: SCHEMA_VERSIONS.dataResource,
  $defs: { dataFieldOption: dataFieldOptionSchema },
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "appCode",
    "code",
    "name",
    "schema",
    "capabilities",
    "fieldPolicies",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataResource },
    id: { type: "string" },
    tenantId: { type: "string" },
    appCode: nonEmptyString,
    code: dataResourceCode,
    name: nonEmptyString,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["fields"],
      properties: {
        fields: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            additionalProperties: false,
            allOf: [
              {
                if: {
                  properties: {
                    type: { enum: ["date-range", "datetime-range"] },
                  },
                  required: ["type"],
                },
                then: { required: ["rangeBoundary"] },
              },
              {
                if: {
                  properties: {
                    type: {
                      not: { enum: ["date-range", "datetime-range"] },
                    },
                  },
                  required: ["type"],
                },
                then: { not: { required: ["rangeBoundary"] } },
              },
            ],
            required: ["code", "type"],
            properties: {
              code: dataFieldCode,
              type: {
                enum: [
                  "text.short",
                  "text.long",
                  "text.rich",
                  "number.integer",
                  "number.decimal",
                  "boolean",
                  "date",
                  "time",
                  "datetime",
                  "date-range",
                  "datetime-range",
                  "option.single",
                  "option.multiple",
                  "cascade.single",
                  "cascade.multiple",
                  "user.single",
                  "user.multiple",
                  "department.single",
                  "department.multiple",
                  "resource-ref.single",
                  "resource-ref.multiple",
                  "image",
                  "signature",
                  "address",
                  "location",
                  "uuid",
                  "json",
                  "file",
                  "serial-number",
                  "subtable",
                ],
              },
              nullable: { type: "boolean" },
              indexed: { type: "boolean" },
              options: {
                type: "array",
                minItems: 1,
                maxItems: 100,
                items: { $ref: "#/$defs/dataFieldOption" },
              },
              source: dataFieldResourceSourceSchema,
              maxLength: { type: "integer", minimum: 1, maximum: 1000000 },
              precision: { type: "integer", minimum: 1, maximum: 1000 },
              scale: { type: "integer", minimum: 0, maximum: 1000 },
              min: { type: "number" },
              max: { type: "number" },
              rangeBoundary: { enum: ["closed", "half-open"] },
              timePrecision: { enum: ["minute", "second"] },
              file: {
                type: "object",
                additionalProperties: false,
                properties: {
                  maxCount: { type: "integer", minimum: 1, maximum: 100 },
                  maxSizeMb: { type: "integer", minimum: 1, maximum: 1024 },
                  accept: {
                    type: "array",
                    uniqueItems: true,
                    maxItems: 50,
                    items: nonEmptyString,
                  },
                },
              },
              serial: {
                type: "object",
                additionalProperties: false,
                properties: {
                  prefix: { type: "string", maxLength: 64 },
                  digits: { type: "integer", minimum: 1, maximum: 32 },
                  start: { type: "integer", minimum: 0 },
                },
              },
              subtable: {
                type: "object",
                additionalProperties: false,
                required: ["resourceCode", "foreignKey", "orderField"],
                properties: {
                  resourceCode: dataResourceCode,
                  foreignKey: dataFieldCode,
                  orderField: dataFieldCode,
                  maxRows: { type: "integer", minimum: 1, maximum: 49 },
                },
              },
            },
          },
        },
      },
    },
    invariants: {
      type: "array",
      uniqueItems: true,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "expression"],
        properties: {
          code: {
            type: "string",
            pattern: "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$",
            maxLength: 128,
          },
          message: { type: "string", minLength: 1, maxLength: 500 },
          expression: {
            type: "object",
            additionalProperties: false,
            required: ["leftField", "operator", "rightField"],
            properties: {
              leftField: dataFieldCode,
              operator: { enum: ["eq", "neq", "gt", "gte", "lt", "lte"] },
              rightField: dataFieldCode,
            },
          },
        },
      },
    },
    capabilities: dataCapabilities,
    dataPolicyCode: {
      anyOf: [dataResourceCode, { type: "null" }],
    },
    fieldPolicies: {
      type: "object",
      properties: Object.fromEntries(DATA_AUDIT_METADATA_FIELDS.map(code => [code, {
        type: 'object', additionalProperties: false, required: ['read'],
        properties: { read: { type: 'array', uniqueItems: true, maxItems: 20, items: nonEmptyString } },
      }])),
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          read: {
            type: "array",
            uniqueItems: true,
            maxItems: 20,
            items: nonEmptyString,
          },
          create: {
            type: "array",
            uniqueItems: true,
            maxItems: 20,
            items: nonEmptyString,
          },
          update: {
            type: "array",
            uniqueItems: true,
            maxItems: 20,
            items: nonEmptyString,
          },
          mask: { enum: ["omit", "null"] },
        },
      },
    },
    surface: dataResourceSurfaceSchema,
    status: { enum: ["active", "retired"] },
    revision: { type: "integer", minimum: 1 },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

const dataQueryOperators = [
  "eq", "neq", "gt", "gte", "lt", "lte", "contains", "startsWith",
  "endsWith", "in", "between", "has", "hasAny", "hasAll", "overlaps",
  "containedBy", "jsonContains", "isEmpty", "isNotEmpty",
] as const;

const dataBatchQueryKey = {
  type: "string",
  minLength: 1,
  maxLength: 64,
  pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$",
} as const;

const dataWhereSchema = {
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
          items: { $ref: "#/$defs/dataWhere" },
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
          items: { $ref: "#/$defs/dataWhere" },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["not"],
      properties: { not: { $ref: "#/$defs/dataWhere" } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "operator"],
      properties: {
        field: dataFieldCode,
        operator: { enum: dataQueryOperators },
        value: {},
        path: {
          type: "string",
          pattern: "^(value|label|snapshot\\.[A-Za-z][A-Za-z0-9_]{0,62}|[A-Za-z][A-Za-z0-9_]{0,62})$",
        },
      },
    },
  ],
} as const;

export const dataQuerySchema = {
  $id: SCHEMA_VERSIONS.dataQuery,
  $defs: { dataWhere: dataWhereSchema },
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataQuery },
    select: {
      type: "array",
      uniqueItems: true,
      maxItems: 100,
      items: dataFieldCode,
    },
    where: { $ref: "#/$defs/dataWhere" },
    order: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field"],
        properties: {
          field: dataFieldCode,
          direction: { enum: ["asc", "desc"] },
          nulls: { enum: ["first", "last"] },
        },
      },
    },
    limit: { type: "integer", minimum: 1, maximum: 200 },
    offset: { type: "integer", minimum: 0, maximum: 1000000 },
  },
} as const;

export const dataBatchQuerySchema = {
  $id: SCHEMA_VERSIONS.dataBatchQuery,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "operations"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataBatchQuery },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["key", "resourceCode", "query"],
            properties: {
              key: dataBatchQueryKey,
              resourceCode: dataResourceCode,
              query: { $ref: SCHEMA_VERSIONS.dataQuery },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["key", "resourceCode", "aggregate"],
            properties: {
              key: dataBatchQueryKey,
              resourceCode: dataResourceCode,
              aggregate: { $ref: SCHEMA_VERSIONS.dataAggregateQuery },
            },
          },
        ],
      },
    },
  },
} as const;

export const dataExportRequestSchema = {
  $id: SCHEMA_VERSIONS.dataExportRequest,
  $defs: { dataWhere: dataWhereSchema },
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataExportRequest },
    select: {
      type: "array",
      uniqueItems: true,
      maxItems: 100,
      items: dataFieldCode,
    },
    where: { $ref: "#/$defs/dataWhere" },
    order: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field"],
        properties: {
          field: dataFieldCode,
          direction: { enum: ["asc", "desc"] },
          nulls: { enum: ["first", "last"] },
        },
      },
    },
  },
} as const;

export const dataPageSchema = {
  $id: SCHEMA_VERSIONS.dataPage,
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
    resourceCode: dataResourceCode,
    items: { type: "array", items: { type: "object" } },
    total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 200 },
    offset: { type: "integer", minimum: 0 },
  },
} as const;

export const dataBatchQueryResultSchema = {
  $id: SCHEMA_VERSIONS.dataBatchQueryResult,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "results"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataBatchQueryResult },
    results: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["key", "resourceCode", "ok", "data"],
            properties: {
              key: dataBatchQueryKey,
              resourceCode: dataResourceCode,
              ok: { const: true },
              data: {
                oneOf: [
                  { $ref: SCHEMA_VERSIONS.dataPage },
                  { $ref: SCHEMA_VERSIONS.dataAggregatePage },
                ],
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["key", "resourceCode", "ok", "error"],
            properties: {
              key: dataBatchQueryKey,
              resourceCode: dataResourceCode,
              ok: { const: false },
              error: {
                type: "object",
                additionalProperties: false,
                required: ["code", "status", "retryable"],
                properties: {
                  code: nonEmptyString,
                  status: { type: "integer", minimum: 400, maximum: 599 },
                  retryable: { type: "boolean" },
                },
              },
            },
          },
        ],
      },
    },
  },
} as const;

export const dataRecordSchema = {
  $id: SCHEMA_VERSIONS.dataRecord,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "resourceCode", "data"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataRecord },
    resourceCode: dataResourceCode,
    data: { type: "object" },
  },
} as const;

const dataAggregateAlias = {
  type: "string",
  pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
} as const;

export const dataAggregateQuerySchema = {
  $id: SCHEMA_VERSIONS.dataAggregateQuery,
  $defs: { dataWhere: dataWhereSchema },
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "measures"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataAggregateQuery },
    dimensions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "as"],
        properties: {
          field: dataFieldCode,
          as: dataAggregateAlias,
          bucket: { enum: ["day", "week", "month", "quarter", "year"] },
        },
      },
    },
    measures: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "as"],
        properties: {
          type: { enum: ["count", "countDistinct", "sum", "avg", "min", "max"] },
          field: dataFieldCode,
          as: dataAggregateAlias,
        },
      },
    },
    where: { $ref: "#/$defs/dataWhere" },
    order: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field"],
        properties: {
          field: dataAggregateAlias,
          direction: { enum: ["asc", "desc"] },
          nulls: { enum: ["first", "last"] },
        },
      },
    },
    timeZone: { type: "string", minLength: 1, maxLength: 64 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0, maximum: 1000000 },
  },
} as const;

export const dataAggregatePageSchema = {
  $id: SCHEMA_VERSIONS.dataAggregatePage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "resourceCode", "items", "total", "limit", "offset"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataAggregatePage },
    resourceCode: dataResourceCode,
    items: { type: "array", items: { type: "object" } },
    total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
  },
} as const;

export const dataAuditPageSchema = {
  $id: SCHEMA_VERSIONS.dataAuditPage,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "resourceCode", "recordId", "items", "total", "limit", "offset"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataAuditPage },
    resourceCode: dataResourceCode,
    recordId: nonEmptyString,
    items: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "operation",
          "recordId",
          "revision",
          "actor",
          "correlation",
          "changes",
          "projection",
          "occurredAt",
        ],
        properties: {
          id: nonEmptyString,
          operation: { enum: ["created", "updated", "deleted"] },
          recordId: nonEmptyString,
          revision: { type: "integer", minimum: 1 },
          actor: {
            type: "object",
            additionalProperties: false,
            required: ["principalType", "subjectId"],
            properties: {
              principalType: {
                enum: [
                  "user",
                  "application",
                  "developer",
                  "workflow",
                  "timer",
                  "system",
                ],
              },
              subjectId: nonEmptyString,
            },
          },
          actorDisplay: {
            type: "object",
            additionalProperties: false,
            required: ["displayName"],
            properties: {
              displayName: nonEmptyString,
              avatarUrl: nonEmptyString,
            },
          },
          correlation: {
            type: "object",
            additionalProperties: false,
            required: [
              "eventId",
              "requestId",
              "traceId",
              "environmentKey",
              "appVersionId",
              "environmentHeadRevision",
              "capturePlanRevision",
              "cause",
            ],
            properties: {
              eventId: nonEmptyString,
              requestId: { anyOf: [nonEmptyString, { type: "null" }] },
              traceId: { anyOf: [nonEmptyString, { type: "null" }] },
              environmentKey: { enum: ["preproduction", "production"] },
              appVersionId: { anyOf: [nonEmptyString, { type: "null" }] },
              environmentHeadRevision: {
                anyOf: [
                  { type: "integer", minimum: 1 },
                  { type: "null" },
                ],
              },
              capturePlanRevision: {
                anyOf: [
                  { type: "integer", minimum: 1 },
                  { type: "null" },
                ],
              },
              cause: {
                type: "object",
                additionalProperties: false,
                required: ["eventId", "subscriptionCode", "depth"],
                properties: {
                  eventId: { anyOf: [nonEmptyString, { type: "null" }] },
                  subscriptionCode: {
                    anyOf: [nonEmptyString, { type: "null" }],
                  },
                  depth: { type: "integer", minimum: 0, maximum: 8 },
                },
              },
            },
          },
          changes: {
            type: "object",
            maxProperties: 32,
            additionalProperties: {
              type: "object",
              additionalProperties: false,
              minProperties: 1,
              maxProperties: 2,
              properties: { before: {}, after: {} },
            },
          },
          projection: { type: "object", maxProperties: 32 },
          occurredAt: dateTime,
        },
      },
    },
    total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
  },
} as const;

export const dataFileRefSchema = {
  $id: SCHEMA_VERSIONS.dataFileRef,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "name", "size", "contentType"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataFileRef },
    id: nonEmptyString,
    name: nonEmptyString,
    size: { type: "integer", minimum: 0 },
    contentType: { type: "string" },
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    thumbnailUrl: { type: "string", minLength: 1, maxLength: 4000 },
    previewUrl: { type: "string", minLength: 1, maxLength: 4000 },
  },
} as const;

export const dataFileUploadPlanSchema = {
  $id: SCHEMA_VERSIONS.dataFileUploadPlan,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "resourceCode", "fieldCode", "file", "uploadMethod", "uploadUrl", "headers", "expiresAt"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataFileUploadPlan },
    resourceCode: dataResourceCode,
    fieldCode: dataFieldCode,
    file: { $ref: SCHEMA_VERSIONS.dataFileRef },
    uploadMethod: { const: "PUT" },
    uploadUrl: nonEmptyString,
    headers: { type: "object", additionalProperties: { type: "string" } },
    expiresAt: dateTime,
  },
} as const;

export const dataFileCopyRequestSchema = {
  $id: SCHEMA_VERSIONS.dataFileCopyRequest,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "idempotencyKey", "source", "target"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataFileCopyRequest },
    idempotencyKey: nonEmptyString,
    source: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "fieldCode", "fileId", "recordId"],
      properties: {
        resourceCode: dataResourceCode,
        fieldCode: dataFieldCode,
        fileId: nonEmptyString,
        recordId: nonEmptyString,
      },
    },
    target: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "fieldCode"],
      properties: {
        resourceCode: dataResourceCode,
        fieldCode: dataFieldCode,
      },
    },
  },
} as const;

export const dataFileCopyReceiptSchema = {
  $id: SCHEMA_VERSIONS.dataFileCopyReceipt,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "receiptId",
    "status",
    "idempotencyKey",
    "source",
    "target",
    "attempt",
    "createdAt",
    "updatedAt",
    "completedAt",
    "errorCode",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataFileCopyReceipt },
    receiptId: nonEmptyString,
    status: { enum: ["succeeded", "retryable"] },
    idempotencyKey: nonEmptyString,
    source: { $ref: SCHEMA_VERSIONS.dataFileCopyRequest + "#/properties/source" },
    target: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "fieldCode", "fileId", "file"],
      properties: {
        resourceCode: dataResourceCode,
        fieldCode: dataFieldCode,
        fileId: { type: ["string", "null"] },
        file: { anyOf: [{ $ref: SCHEMA_VERSIONS.dataFileRef }, { type: "null" }] },
      },
    },
    attempt: { type: "integer", minimum: 0 },
    createdAt: { anyOf: [dateTime, { type: "null" }] },
    updatedAt: { anyOf: [dateTime, { type: "null" }] },
    completedAt: { anyOf: [dateTime, { type: "null" }] },
    errorCode: { type: ["string", "null"] },
  },
} as const;

export const dataFilePreviewSchema = {
  $id: SCHEMA_VERSIONS.dataFilePreview,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "resourceCode",
    "file",
    "extension",
    "previewType",
    "renderMode",
    "previewSurface",
    "previewProvider",
    "canPreview",
    "canDownload",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataFilePreview },
    resourceCode: dataResourceCode,
    file: { $ref: SCHEMA_VERSIONS.dataFileRef },
    extension: { type: "string" },
    previewType: {
      enum: [
        "image",
        "video",
        "audio",
        "pdf",
        "spreadsheet",
        "text",
        "office",
        "download",
      ],
    },
    renderMode: {
      enum: [
        "inline",
        "image-transcode",
        "image-heic",
        "pdfjs",
        "excel-basic",
        "excel-client",
        "text",
        "docx-html",
        "download",
      ],
    },
    previewSurface: { enum: ["media", "document", "download"] },
    previewProvider: { enum: ["browser", "platform", "none"] },
    canPreview: { type: "boolean" },
    canDownload: { const: true },
    unsupportedReason: { type: "string" },
  },
} as const;

const dataTransactionOperationReference = {
  type: "object",
  additionalProperties: false,
  required: ["operationIndex", "field"],
  properties: {
    operationIndex: { type: "integer", minimum: 0, maximum: 99 },
    field: { const: "id" },
  },
} as const;

const dataTransactionOperationValue = {
  oneOf: [
    dataTransactionOperationReference,
    {
      not: {
        type: "object",
        required: ["operationIndex", "field"],
      },
    },
  ],
} as const;

const dataTransactionOperation = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["operation", "resourceCode", "data"],
      properties: {
        operation: { const: "create" },
        resourceCode: dataResourceCode,
        data: {
          type: "object",
          additionalProperties: dataTransactionOperationValue,
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["operation", "resourceCode", "id", "expectedRevision", "data"],
      properties: {
        operation: { const: "update" },
        resourceCode: dataResourceCode,
        id: nonEmptyString,
        expectedRevision: { type: "integer", minimum: 1 },
        data: {
          type: "object",
          additionalProperties: dataTransactionOperationValue,
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["operation", "resourceCode", "id", "expectedRevision"],
      properties: {
        operation: { const: "delete" },
        resourceCode: dataResourceCode,
        id: nonEmptyString,
        expectedRevision: { type: "integer", minimum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["operation", "resourceCode", "id", "field", "amount"],
      properties: {
        operation: { const: "increment" },
        resourceCode: dataResourceCode,
        id: nonEmptyString,
        field: dataFieldCode,
        amount: {
          type: "integer",
          minimum: -1000000,
          maximum: 1000000,
          not: { const: 0 },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["operation", "eventType", "data"],
      properties: {
        operation: { const: "emitEvent" },
        eventType: {
          type: "string",
          minLength: 1,
          maxLength: 255,
          pattern: "^(?!openxiangda\\.)[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9_-]*)+\\.v[1-9][0-9]*$",
        },
        subject: { type: "string", minLength: 1, maxLength: 512 },
        data: { type: "object", maxProperties: 100 },
      },
    },
  ],
} as const;

const dataTransactionGuard = {
  oneOf: [
    {
      type: "object", additionalProperties: false,
      required: ["kind", "operationIndex", "field", "operator", "offsetMilliseconds", "errorCode"],
      properties: {
        kind: { const: "operation-time" },
        operationIndex: { type: "integer", minimum: 0, maximum: 99 },
        field: dataFieldCode,
        operator: { enum: ["eq", "neq", "gt", "gte", "lt", "lte"] },
        offsetMilliseconds: { type: "integer", minimum: -31622400000, maximum: 31622400000 },
        errorCode: { type: "string", pattern: "^OPENXIANGDA_[A-Z0-9_]{1,96}$" },
      },
    },
    {
      type: "object", additionalProperties: false,
      required: ["kind", "userId", "roleCode", "errorCode"],
      properties: {
        kind: { const: "role-member" },
        userId: { type: "string", minLength: 1, maxLength: 255 },
        roleCode: { type: "string", pattern: "^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$", maxLength: 100 },
        errorCode: { type: "string", pattern: "^OPENXIANGDA_[A-Z0-9_]{1,96}$" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "resourceCode", "lockKey", "errorCode", "where"],
      properties: {
        kind: { const: "query-empty" },
        resourceCode: dataResourceCode,
        lockKey: { type: "string", minLength: 1, maxLength: 128 },
        errorCode: {
          type: "string",
          pattern: "^OPENXIANGDA_[A-Z0-9_]{1,96}$",
        },
        where: { $ref: "#/$defs/dataWhere" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "resourceCode",
        "lockKey",
        "errorCode",
        "id",
        "assertions",
      ],
      properties: {
        kind: { const: "record-assert" },
        resourceCode: dataResourceCode,
        lockKey: { type: "string", minLength: 1, maxLength: 128 },
        errorCode: {
          type: "string",
          pattern: "^OPENXIANGDA_[A-Z0-9_]{1,96}$",
        },
        id: nonEmptyString,
        assertions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "field", "operator"],
                properties: {
                  kind: { const: "value" },
                  field: dataFieldCode,
                  operator: {
                    enum: [
                      "eq", "neq", "gt", "gte", "lt", "lte", "contains",
                      "startsWith", "endsWith", "in", "between", "has",
                      "hasAny", "hasAll", "overlaps", "containedBy",
                      "jsonContains", "isEmpty", "isNotEmpty",
                    ],
                  },
                  value: {},
                  path: { type: "string", minLength: 1, maxLength: 128 },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: [
                  "kind",
                  "leftField",
                  "operator",
                  "rightField",
                ],
                properties: {
                  kind: { const: "field" },
                  leftField: dataFieldCode,
                  operator: { enum: ["eq", "neq", "gt", "gte", "lt", "lte"] },
                  rightField: dataFieldCode,
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "field", "operator"],
                properties: {
                  kind: { const: "database-now" },
                  field: dataFieldCode,
                  operator: { enum: ["eq", "neq", "gt", "gte", "lt", "lte"] },
                },
              },
            ],
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "resourceCode", "lockKey", "errorCode", "id"],
      properties: {
        kind: { const: "record-exists" },
        resourceCode: dataResourceCode,
        lockKey: { type: "string", minLength: 1, maxLength: 128 },
        errorCode: {
          type: "string",
          pattern: "^OPENXIANGDA_[A-Z0-9_]{1,96}$",
        },
        id: nonEmptyString,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "resourceCode",
        "lockKey",
        "errorCode",
        "id",
        "assertions",
      ],
      properties: {
        kind: { const: "record-match" },
        resourceCode: dataResourceCode,
        lockKey: { type: "string", minLength: 1, maxLength: 128 },
        errorCode: {
          type: "string",
          pattern: "^OPENXIANGDA_[A-Z0-9_]{1,96}$",
        },
        id: nonEmptyString,
        assertions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "field", "operator"],
                properties: {
                  kind: { const: "value" },
                  field: dataFieldCode,
                  operator: {
                    enum: [
                      "eq", "neq", "gt", "gte", "lt", "lte", "contains",
                      "startsWith", "endsWith", "in", "between", "has",
                      "hasAny", "hasAll", "overlaps", "containedBy",
                      "jsonContains", "isEmpty", "isNotEmpty",
                    ],
                  },
                  value: {},
                  path: { type: "string", minLength: 1, maxLength: 128 },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: [
                  "kind",
                  "leftField",
                  "operator",
                  "rightField",
                ],
                properties: {
                  kind: { const: "field" },
                  leftField: dataFieldCode,
                  operator: { enum: ["eq", "neq", "gt", "gte", "lt", "lte"] },
                  rightField: dataFieldCode,
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "field", "operator"],
                properties: {
                  kind: { const: "database-now" },
                  field: dataFieldCode,
                  operator: { enum: ["eq", "neq", "gt", "gte", "lt", "lte"] },
                },
              },
            ],
          },
        },
      },
    },
  ],
} as const;

export const dataTransactionRequestSchema = {
  $id: SCHEMA_VERSIONS.dataTransactionRequest,
  $defs: { dataWhere: dataWhereSchema },
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "idempotencyKey", "operations"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataTransactionRequest },
    idempotencyKey: nonEmptyString,
    guards: {
      type: "array",
      maxItems: 20,
      items: dataTransactionGuard,
    },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: dataTransactionOperation,
    },
  },
} as const;

export const dataTransactionResultSchema = {
  $id: SCHEMA_VERSIONS.dataTransactionResult,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "idempotencyKey", "replayed", "items"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dataTransactionResult },
    idempotencyKey: nonEmptyString,
    evaluatedAt: dateTime,
    replayed: { type: "boolean" },
    items: {
      type: "array",
      maxItems: 100,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["index", "resourceCode", "operation", "id", "revision"],
            properties: {
              index: { type: "integer", minimum: 0 },
              resourceCode: dataResourceCode,
              operation: { enum: ["create", "update", "delete", "increment"] },
              id: nonEmptyString,
              revision: { type: "integer", minimum: 1 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["index", "operation", "eventType", "eventId"],
            properties: {
              index: { type: "integer", minimum: 0 },
              operation: { const: "emitEvent" },
              eventType: nonEmptyString,
              eventId: nonEmptyString,
            },
          },
        ],
      },
    },
  },
} as const;

export const applicationContractCompatibilitySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "appPackageSchemaVersion",
    "configurationBundleSchemaVersion",
    "contractBundleSchemaVersion",
    "compilerContractVersion",
  ],
  properties: {
    appPackageSchemaVersion: nonEmptyString,
    configurationBundleSchemaVersion: nonEmptyString,
    contractBundleSchemaVersion: nonEmptyString,
    compilerContractVersion: nonEmptyString,
  },
} as const;

export const requiredPlatformCapabilityContractSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "contractVersion", "usageDigest"],
  properties: {
    code: { enum: Object.keys(PLATFORM_CAPABILITY_CONTRACT_VERSIONS) },
    contractVersion: nonEmptyString,
    usageDigest: prefixedDigest,
  },
} as const;

export const platformFeatureCapabilityContractSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "status"],
  properties: {
    contractVersion: nonEmptyString,
    status: { enum: ["available", "preview", "planned"] },
    limits: {
      type: "object",
      maxProperties: 64,
      propertyNames: {
        pattern: "^[a-z][a-zA-Z0-9]*(?:[.-][a-zA-Z0-9]+)*$",
      },
      additionalProperties: { type: "number", minimum: 0 },
    },
  },
} as const;

export const configurationCompatibilitySchema = {
  $id: SCHEMA_VERSIONS.configurationCompatibility,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "validatorDigest",
    "capability",
    "requestSchemaVersion",
    "resultSchemaVersion",
    "endpointTemplate",
    "limits",
    "supportedApplicationContracts",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.configurationCompatibility },
    validatorDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    capability: {
      type: "object",
      additionalProperties: false,
      required: ["code", "version", "status"],
      properties: {
        code: { const: CONFIGURATION_COMPATIBILITY_CAPABILITY },
        version: nonEmptyString,
        status: { const: "available" },
      },
    },
    requestSchemaVersion: {
      const: SCHEMA_VERSIONS.configurationValidationRequest,
    },
    resultSchemaVersion: {
      const: SCHEMA_VERSIONS.configurationValidationResult,
    },
    endpointTemplate: {
      const:
        "/openxiangda-api/v2/applications/{appCode}/configuration-compatibility",
    },
    limits: {
      type: "object",
      additionalProperties: false,
      required: [
        "configurationCanonicalBytes",
        "contractCanonicalBytes",
        "requestBytes",
      ],
      properties: {
        configurationCanonicalBytes: { const: 4 * 1024 * 1024 },
        contractCanonicalBytes: { const: 8 * 1024 * 1024 },
        requestBytes: { const: 10 * 1024 * 1024 },
      },
    },
    supportedApplicationContracts: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      uniqueItems: true,
      items: applicationContractCompatibilitySchema,
    },
  },
} as const;

export const configurationValidationRequestSchema = {
  $id: SCHEMA_VERSIONS.configurationValidationRequest,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "environmentKey",
    "clientContractVersion",
    "required",
    "configuration",
    "contract",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.configurationValidationRequest },
    environmentKey: { enum: DEPLOYMENT_ENVIRONMENTS },
    clientContractVersion: { const: OPENXIANGDA_CONTRACT_VERSION },
    required: applicationContractCompatibilitySchema,
    configuration: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "digest", "canonical"],
      properties: {
        schemaVersion: nonEmptyString,
        digest,
        canonical: { type: "string", minLength: 1, maxLength: 4 * 1024 * 1024 },
      },
    },
    contract: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "digest", "canonical"],
      properties: {
        schemaVersion: nonEmptyString,
        digest,
        canonical: { type: "string", minLength: 1, maxLength: 8 * 1024 * 1024 },
      },
    },
  },
} as const;

export const configurationValidationResultSchema = {
  $id: SCHEMA_VERSIONS.configurationValidationResult,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "compatible",
    "environmentKey",
    "clientContractVersion",
    "platformVersion",
    "capability",
    "required",
    "supported",
    "source",
    "projectionDigest",
    "requiredPlatformCapabilities",
    "counts",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.configurationValidationResult },
    compatible: { const: true },
    environmentKey: { enum: DEPLOYMENT_ENVIRONMENTS },
    clientContractVersion: { const: OPENXIANGDA_CONTRACT_VERSION },
    platformVersion: nonEmptyString,
    capability: configurationCompatibilitySchema.properties.capability,
    required: applicationContractCompatibilitySchema,
    supported: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      uniqueItems: true,
      items: applicationContractCompatibilitySchema,
    },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["configurationDigest", "contractDigest"],
      properties: { configurationDigest: digest, contractDigest: digest },
    },
    projectionDigest: digest,
    requiredPlatformCapabilities: {
      type: "array",
      minItems: 1,
      maxItems: 64,
      uniqueItems: true,
      items: requiredPlatformCapabilityContractSchema,
    },
    counts: {
      type: "object",
      additionalProperties: false,
      required: [
        "resources",
        "perspectives",
        "capabilities",
        "eventProducers",
        "workflowDefinitions",
      ],
      properties: Object.fromEntries(
        [
          "resources",
          "perspectives",
          "capabilities",
          "eventProducers",
          "workflowDefinitions",
        ].map(key => [key, { type: "integer", minimum: 0 }])
      ),
    },
  },
} as const;

export const appPackageSchema = {
  $id: SCHEMA_VERSIONS.appPackage,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "appCode",
    "version",
    "createdAt",
    "source",
    "toolchain",
    "artifacts",
    "manifests",
    "compatibility",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.appPackage },
    appCode: nonEmptyString,
    version: nonEmptyString,
    createdAt: dateTime,
    source: {
      type: "object",
      additionalProperties: false,
      required: ["repository", "commit", "dirty"],
      properties: {
        repository: nonEmptyString,
        commit: nonEmptyString,
        dirty: { type: "boolean" },
      },
    },
    toolchain: {
      type: "object",
      additionalProperties: false,
      required: ["version", "contractVersion"],
      properties: {
        version: nonEmptyString,
        contractVersion: { const: OPENXIANGDA_CONTRACT_VERSION },
      },
    },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "digest", "mediaType"],
        properties: {
          kind: {
            enum: ["frontend", "backend", "config", "contracts"],
          },
          digest,
          mediaType: nonEmptyString,
          size: { type: "integer", minimum: 0 },
          entrypoint: { type: "string" },
          metadata: { type: "object" },
        },
      },
    },
    manifests: {
      type: "object",
      additionalProperties: false,
      properties: {
        frontend: digest,
        backend: digest,
        config: digest,
        dataContract: digest,
      },
    },
    compatibility: {
      type: "object",
      additionalProperties: false,
      required: [
        "minimumPlatformVersion",
        "requiredPlatformCapabilities",
        "applicationContract",
      ],
      properties: {
        minimumPlatformVersion: nonEmptyString,
        requiredPlatformCapabilities: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          uniqueItems: true,
          items: requiredPlatformCapabilityContractSchema,
        },
        applicationContract: applicationContractCompatibilitySchema,
      },
    },
    metadata: { type: "object" },
  },
} as const;

const componentRevisions = {
  type: "object",
  additionalProperties: false,
  required: ["frontend", "backend", "config", "dataContract"],
  properties: {
    frontend: { type: ["string", "null"] },
    backend: { type: ["string", "null"] },
    config: { type: ["string", "null"] },
    dataContract: { type: ["string", "null"] },
  },
} as const;

export const appVersionSchema = {
  $id: SCHEMA_VERSIONS.appVersion,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "version",
    "packageDigest",
    "source",
    "toolchain",
    "revisions",
    "metadata",
    "createdBy",
    "createdAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.appVersion },
    id: nonEmptyString,
    appCode: nonEmptyString,
    version: nonEmptyString,
    packageDigest: digest,
    source: appPackageSchema.properties.source,
    toolchain: appPackageSchema.properties.toolchain,
    revisions: componentRevisions,
    metadata: { type: "object" },
    createdBy: nonEmptyString,
    createdAt: dateTime,
  },
} as const;

export const environmentHeadSchema = {
  $id: SCHEMA_VERSIONS.environmentHead,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "environmentKey",
    "environmentId",
    "environmentKind",
    "activeAppVersionId",
    "revisions",
    "revision",
    "activatedByDeploymentId",
    "activatedBy",
    "activatedAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.environmentHead },
    id: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: nonEmptyString,
    environmentId: { type: ["string", "null"] },
    environmentKind: {
      enum: DEPLOYMENT_ENVIRONMENTS,
    },
    activeAppVersionId: nonEmptyString,
    revisions: componentRevisions,
    revision: { type: "integer", minimum: 1 },
    activatedByDeploymentId: nonEmptyString,
    activatedBy: nonEmptyString,
    activatedAt: dateTime,
    updatedAt: dateTime,
    activeAppVersion: {
      anyOf: [appVersionSchema, { type: "null" }],
    },
  },
} as const;

export const applicationEnvironmentsSchema = {
  $id: SCHEMA_VERSIONS.applicationEnvironments,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "total"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.applicationEnvironments },
    items: {
      type: "array",
      maxItems: 2,
      items: {
        ...runtimeEnvironmentSchema,
        required: [...runtimeEnvironmentSchema.required, "activeHead"],
        properties: {
          ...runtimeEnvironmentSchema.properties,
          activeHead: {
            anyOf: [environmentHeadSchema, { type: "null" }],
          },
        },
      },
    },
    total: { type: "integer", minimum: 0, maximum: 2 },
  },
} as const;

const deploymentStatus = {
  enum: [
    "queued",
    "preparing",
    "deploying",
    "activating",
    "verifying",
    "succeeded",
    "failed",
    "cancelled",
  ],
} as const;

const deploymentFailureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "retryable"],
  properties: {
    code: nonEmptyString,
    message: nonEmptyString,
    retryable: { type: "boolean" },
    stage: { type: "string" },
    component: { type: "string" },
    details: { type: "object" },
    failedAt: dateTime,
  },
} as const;

const deploymentRecoveryAction = {
  enum: ["rollback", "replace", "reuse", "cleanup"],
} as const;

const deploymentCandidateState = {
  enum: ["none", "created", "ready", "failed", "retired"],
} as const;

const deploymentCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["identity", "state", "recoveryAction"],
  properties: {
    identity: { anyOf: [nonEmptyString, { type: "null" }] },
    state: deploymentCandidateState,
    recoveryAction: {
      anyOf: [deploymentRecoveryAction, { type: "null" }],
    },
  },
} as const;

export const promotionPreflightSchema = {
  $id: SCHEMA_VERSIONS.promotionPreflight,
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'appCode', 'sourceDeploymentId', 'appVersionId', 'packageDigest', 'environmentKey', 'source', 'validatorDigest', 'projectionDigest'],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.promotionPreflight },
    appCode: nonEmptyString, sourceDeploymentId: nonEmptyString, appVersionId: nonEmptyString,
    packageDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    environmentKey: { const: 'production' },
    source: appPackageSchema.properties.source,
    validatorDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    projectionDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
} as const;

export const deploymentRunSchema = {
  $id: SCHEMA_VERSIONS.deploymentRun,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "environment",
    "kind",
    "packageDigest",
    "idempotencyKey",
    "status",
    "stage",
    "attempt",
    "progress",
    "checkpoints",
    "rootFailure",
    "latestFailure",
    "candidate",
    "recovery",
    "attempts",
    "result",
    "requestedBy",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.deploymentRun },
    id: nonEmptyString,
    appCode: nonEmptyString,
    environment: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        kind: {
          enum: DEPLOYMENT_ENVIRONMENTS,
        },
      },
    },
    kind: {
      enum: ["deploy", "promotion", "rollback", "redeploy", "start", "stop"],
    },
    packageDigest: digest,
    idempotencyKey: nonEmptyString,
    status: deploymentStatus,
    stage: nonEmptyString,
    attempt: { type: "integer", minimum: 1 },
    progress: { type: "object" },
    checkpoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stage", "status", "at", "attempt"],
        properties: {
          stage: nonEmptyString,
          status: deploymentStatus,
          at: dateTime,
          attempt: { type: "integer", minimum: 1 },
          component: { type: "string" },
          result: { type: "object" },
        },
      },
    },
    failure: deploymentFailureSchema,
    rootFailure: {
      anyOf: [deploymentFailureSchema, { type: "null" }],
    },
    latestFailure: {
      anyOf: [deploymentFailureSchema, { type: "null" }],
    },
    candidate: deploymentCandidateSchema,
    recovery: {
      type: "object",
      additionalProperties: false,
      required: [
        "mode",
        "retryable",
        "replacementAllowed",
        "cancelAllowed",
        "action",
        "expectedAttempt",
        "nextCommand",
      ],
      properties: {
        mode: {
          enum: ["none", "same_run_attempt", "platform_upgrade_replacement"],
        },
        retryable: { type: "boolean" },
        replacementAllowed: { type: "boolean" },
        cancelAllowed: { type: "boolean" },
        action: { anyOf: [deploymentRecoveryAction, { type: "null" }] },
        expectedAttempt: { type: "integer", minimum: 1 },
        nextCommand: { anyOf: [nonEmptyString, { type: "null" }] },
        rootDeploymentId: nonEmptyString,
        replacesDeploymentId: nonEmptyString,
        candidateApplicationVersionId: nonEmptyString,
        sourceExecutorVersion: nonEmptyString,
        replacementExecutorVersion: nonEmptyString,
        sourceAttempt: { type: "integer", minimum: 1 },
        sourceFailure: {
          anyOf: [deploymentFailureSchema, { type: "null" }],
        },
        sourceRootFailure: {
          anyOf: [deploymentFailureSchema, { type: "null" }],
        },
        sourceLatestFailure: {
          anyOf: [deploymentFailureSchema, { type: "null" }],
        },
        sourceCandidate: deploymentCandidateSchema,
      },
    },
    attempts: {
      type: "array",
      maxItems: 1000,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "attempt",
          "stage",
          "candidateIdentity",
          "startedAt",
          "finishedAt",
          "outcome",
          "failure",
          "candidateState",
          "recoveryAction",
        ],
        properties: {
          attempt: { type: "integer", minimum: 1 },
          stage: nonEmptyString,
          candidateIdentity: {
            anyOf: [nonEmptyString, { type: "null" }],
          },
          startedAt: dateTime,
          finishedAt: dateTime,
          outcome: { enum: ["succeeded", "failed", "interrupted"] },
          failure: {
            anyOf: [deploymentFailureSchema, { type: "null" }],
          },
          candidateState: deploymentCandidateState,
          recoveryAction: {
            anyOf: [deploymentRecoveryAction, { type: "null" }],
          },
        },
      },
    },
    result: { type: "object" },
    requestedBy: nonEmptyString,
    startedAt: dateTime,
    finishedAt: dateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

const studioPlatformDiscoveryCapabilitiesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "profile", "compatibility"],
  properties: {
    contractVersion: { const: STUDIO_PLATFORM_CONTRACT_VERSION },
    profile: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "schemaVersion",
            "endpoint",
            "status",
            "signatureAlgorithm",
            "verificationOwner",
          ],
          properties: {
            schemaVersion: { const: STUDIO_SITE_PROFILE_SCHEMA_VERSION },
            endpoint: { const: STUDIO_SITE_PROFILE_ENDPOINT },
            status: { const: "available" },
            signatureAlgorithm: { const: "Ed25519" },
            verificationOwner: { const: "studio-client-trust-store" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "schemaVersion",
            "endpoint",
            "status",
            "unavailableCode",
            "signatureAlgorithm",
            "verificationOwner",
          ],
          properties: {
            schemaVersion: { const: STUDIO_SITE_PROFILE_SCHEMA_VERSION },
            endpoint: { const: STUDIO_SITE_PROFILE_ENDPOINT },
            status: { const: "unavailable" },
            unavailableCode: {
              enum: STUDIO_SITE_PROFILE_UNAVAILABLE_CODES,
            },
            signatureAlgorithm: { const: "Ed25519" },
            verificationOwner: { const: "studio-client-trust-store" },
          },
        },
      ],
    },
    compatibility: {
      type: "object",
      additionalProperties: false,
      required: ["studioContractRange", "cliContractRange"],
      properties: {
        studioContractRange: {
          type: ["string", "null"],
          minLength: 1,
          maxLength: 128,
        },
        cliContractRange: {
          type: ["string", "null"],
          minLength: 1,
          maxLength: 128,
        },
      },
    },
  },
  allOf: [
    {
      if: {
        properties: {
          profile: {
            properties: { status: { const: "available" } },
            required: ["status"],
          },
        },
        required: ["profile"],
      },
      then: {
        properties: {
          compatibility: {
            properties: {
              studioContractRange: {
                type: "string",
                minLength: 1,
                maxLength: 128,
              },
              cliContractRange: {
                type: "string",
                minLength: 1,
                maxLength: 128,
              },
            },
          },
        },
      },
      else: {
        properties: {
          compatibility: {
            properties: {
              studioContractRange: { const: null },
              cliContractRange: { const: null },
            },
          },
        },
      },
    },
  ],
} as const;

export const studioCapabilitiesSchema = {
  $id: STUDIO_CAPABILITIES_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "studioContractVersion", "studio"],
  properties: {
    schemaVersion: { const: STUDIO_CAPABILITIES_SCHEMA_VERSION },
    studioContractVersion: { const: STUDIO_PLATFORM_CONTRACT_VERSION },
    studio: studioPlatformDiscoveryCapabilitiesSchema,
  },
} as const;

export const platformCapabilitiesSchema = {
  $id: SCHEMA_VERSIONS.platformCapabilities,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "apiVersion",
    "contractVersion",
    "platformVersion",
    "features",
    "configurationCompatibility",
    "deployment",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.platformCapabilities },
    apiVersion: { const: "v2" },
    contractVersion: { const: OPENXIANGDA_CONTRACT_VERSION },
    platformVersion: nonEmptyString,
    sourceHosting: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'enabled'],
      properties: {
        provider: { const: 'forgejo' },
        enabled: { type: 'boolean' },
      },
    },
    features: {
      type: "object",
      maxProperties: 256,
      propertyNames: {
        pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$",
      },
      additionalProperties: platformFeatureCapabilityContractSchema,
    },
    configurationCompatibility: configurationCompatibilitySchema,
    deployment: {
      type: "object",
      additionalProperties: false,
      required: [
        "executionOwner",
        "durableRuns",
        "clientCanCheckpoint",
        "backendImageBuild",
      ],
      properties: {
        executionOwner: { const: "platform" },
        durableRuns: { const: true },
        clientCanCheckpoint: { const: false },
        runtimeCapacityPreflight: {
          type: 'object', additionalProperties: false, required: ['schemaVersion', 'endpointTemplate'],
          properties: {
            schemaVersion: { const: RUNTIME_CAPACITY_PREFLIGHT_SCHEMA },
            strategies: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: ['rolling', 'maintenance-replace'] } },
            endpointTemplate: { const: '/openxiangda-api/v2/applications/{appCode}/runtime-capacity-preflight' },
          },
        },
        backendImageUpload: {
          type: 'object', additionalProperties: false,
          required: ['schemaVersion', 'owner', 'available', 'platform', 'format', 'maxChunkBytes', 'maxImageBytes', 'endpointTemplate'],
          properties: {
            schemaVersion: { const: 'openxiangda.backend-image-upload/v2' },
            owner: { const: 'platform' }, available: { type: 'boolean' },
            platform: { const: 'linux/amd64' }, format: { const: 'oci-layout' },
            maxChunkBytes: { const: 8388608 },
            maxImageBytes: { type: 'integer', minimum: 1 },
            endpointTemplate: { const: '/openxiangda-api/v2/applications/{appCode}/backend-images' },
          },
        },
        backendImageBuild: {
          type: "object",
          additionalProperties: false,
          required: ["owner", "available", "repositoryPrefix", "platform"],
          properties: {
            owner: { const: "developer-cli" },
            available: { type: "boolean" },
            repositoryPrefix: { type: ["string", "null"] },
            platform: { const: "linux/amd64" },
          },
        },
      },
    },
    oauth2: {
      type: "object",
      additionalProperties: false,
      required: [
        "tokenEndpoint",
        "grantTypes",
        "clientAuthenticationMethods",
        "accessTokenTtlSeconds",
        "supportedScopes",
        "environmentBoundClients",
        "dualSecretRotation",
        "defaultRotationGracePeriodSeconds",
        "clientRateLimit",
        "auditEvents",
      ],
      properties: {
        tokenEndpoint: nonEmptyString,
        grantTypes: {
          type: "array",
          items: { const: "client_credentials" },
        },
        clientAuthenticationMethods: {
          type: "array",
          items: { const: "client_secret_basic" },
        },
        accessTokenTtlSeconds: { type: "integer", minimum: 1 },
        supportedScopes: { type: "array", items: nonEmptyString },
        environmentBoundClients: { type: "boolean" },
        platformManagedRuntimeClients: { type: "boolean" },
        dualSecretRotation: { type: "boolean" },
        stagedRuntimeRotation: { type: "boolean" },
        runtimeRotationUsesSameVersionRedeploy: { type: "boolean" },
        defaultRotationGracePeriodSeconds: { type: "integer", minimum: 0 },
        clientRateLimit: { type: "boolean" },
        auditEvents: { type: "boolean" },
      },
    },
  },
} as const;

export const cloudEventSchema = {
  $id: SCHEMA_VERSIONS.cloudEvent,
  type: "object",
  additionalProperties: false,
  required: [
    "specversion",
    "id",
    "source",
    "type",
    "time",
    "datacontenttype",
    "data",
    "tenantid",
    "appcode",
    "environment",
    "schemaversion",
  ],
  properties: {
    specversion: { const: "1.0" },
    id: nonEmptyString,
    source: nonEmptyString,
    type: {
      type: "string",
      pattern: "^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)+$",
    },
    subject: { type: "string" },
    time: dateTime,
    datacontenttype: { const: "application/json" },
    dataschema: { type: "string" },
    data: { type: "object" },
    tenantid: nonEmptyString,
    appcode: nonEmptyString,
    environment: nonEmptyString,
    traceid: { type: "string" },
    schemaversion: nonEmptyString,
  },
} as const;

export const eventCatalogSchema = {
  $id: SCHEMA_VERSIONS.eventCatalog,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "eventType",
    "owner",
    "dataSchemaVersion",
    "producerKinds",
    "subjectPattern",
    "orderingKey",
    "replayable",
    "maxDataBytes",
    "sensitiveFields",
    "status",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventCatalog },
    eventType: nonEmptyString,
    owner: { enum: ["platform", "application"] },
    dataSchemaVersion: nonEmptyString,
    producerKinds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["data", "app", "workflow", "timer", "date", "system"] },
    },
    subjectPattern: nonEmptyString,
    orderingKey: { enum: ["none", "record", "workflow_instance"] },
    replayable: { type: "boolean" },
    maxDataBytes: { type: "integer", minimum: 1, maximum: 65536 },
    sensitiveFields: {
      type: "array",
      maxItems: 100,
      uniqueItems: true,
      items: nonEmptyString,
    },
    status: { enum: ["active", "deprecated"] },
  },
} as const;

export const eventSchemaDefinitionSchema = {
  $id: SCHEMA_VERSIONS.eventSchema,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "eventType",
    "dataSchemaVersion",
    "jsonSchema",
    "schemaDigest",
    "sensitiveFields",
    "owner",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventSchema },
    eventType: nonEmptyString,
    dataSchemaVersion: nonEmptyString,
    jsonSchema: { type: "object" },
    schemaDigest: digest,
    sensitiveFields: {
      type: "array",
      maxItems: 100,
      uniqueItems: true,
      items: {
        type: "string",
        pattern:
          "^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*){0,7}$",
      },
    },
    owner: { enum: ["platform", "application"] },
  },
} as const;

const eventValuePredicateSchema = {
  type: "object",
  additionalProperties: false,
  maxProperties: 1,
  properties: {
    eq: {},
    ne: {},
    in: { type: "array", minItems: 1, maxItems: 20 },
    notIn: { type: "array", minItems: 1, maxItems: 20 },
    exists: { type: "boolean" },
  },
} as const;

const eventChangeFilterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["field"],
  properties: {
    field: nonEmptyString,
    before: eventValuePredicateSchema,
    after: eventValuePredicateSchema,
  },
} as const;

const eventSubscriptionFilterSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    resourceCodes: {
      type: "array",
      maxItems: 20,
      uniqueItems: true,
      items: nonEmptyString,
    },
    subject: {
      type: "object",
      additionalProperties: false,
      maxProperties: 1,
      properties: { equals: { type: "string" }, prefix: { type: "string" } },
    },
    changedFields: {
      type: "object",
      additionalProperties: false,
      properties: {
        anyOf: { type: "array", maxItems: 32, uniqueItems: true, items: nonEmptyString },
        allOf: { type: "array", maxItems: 32, uniqueItems: true, items: nonEmptyString },
        noneOf: { type: "array", maxItems: 32, uniqueItems: true, items: nonEmptyString },
      },
    },
    changes: { type: "array", maxItems: 16, items: eventChangeFilterSchema },
    where: { type: "object" },
  },
} as const;

const managedFileCopiesSchema = {
  type: "array",
  minItems: 1,
  maxItems: 16,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "mode",
      "sourceResourceCode",
      "sourceFieldCodes",
      "targetResourceCode",
      "targetFieldCodes",
    ],
    properties: {
      mode: { const: "copy" },
      sourceResourceCode: dataResourceCode,
      sourceFieldCodes: {
        type: "array",
        minItems: 1,
        maxItems: 16,
        uniqueItems: true,
        items: nonEmptyString,
      },
      targetResourceCode: dataResourceCode,
      targetFieldCodes: {
        type: "array",
        minItems: 1,
        maxItems: 16,
        uniqueItems: true,
        items: nonEmptyString,
      },
    },
  },
} as const;

const eventSubscriptionPlatformAccessSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    notification: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: { mode: { const: "business-standard" } },
    },
    managedFileCopies: managedFileCopiesSchema,
  },
} as const;

export const eventSubscriptionSchema = {
  $id: SCHEMA_VERSIONS.eventSubscription,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "code",
    "description",
    "eventTypes",
    "filter",
    "payload",
    "environmentKey",
    "endpointPath",
    "delivery",
    "status",
    "revision",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventSubscription },
    id: nonEmptyString,
    appCode: nonEmptyString,
    code: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
    description: { type: ["string", "null"] },
    eventTypes: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: nonEmptyString,
    },
    filter: eventSubscriptionFilterSchema,
    platformAccess: eventSubscriptionPlatformAccessSchema,
    payload: {
      type: "object",
      additionalProperties: false,
      required: ["includeChanges", "fields"],
      properties: {
        includeChanges: { type: "boolean" },
        fields: {
          type: "array",
          maxItems: 32,
          uniqueItems: true,
          items: nonEmptyString,
        },
      },
    },
    environmentKey: nonEmptyString,
    endpointPath: { type: "string", pattern: "^/(?!/)(?!.*\\.\\.).+" },
    delivery: {
      type: "object",
      additionalProperties: false,
      required: [
        "timeoutMs",
        "maxAttempts",
        "initialBackoffMs",
        "maxBackoffMs",
        "ordering",
        "concurrency",
      ],
      properties: {
        timeoutMs: { type: "integer", minimum: 1000, maximum: 30000 },
        maxAttempts: { type: "integer", minimum: 1, maximum: 12 },
        initialBackoffMs: {
          type: "integer",
          minimum: 1000,
          maximum: 1800000,
        },
        maxBackoffMs: {
          type: "integer",
          minimum: 1000,
          maximum: 1800000,
        },
        ordering: { enum: ["none", "record", "workflow-instance"] },
        concurrency: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
    status: { enum: ["active", "paused"] },
    revision: { type: "integer", minimum: 1 },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const eventDeliverySchema = {
  $id: SCHEMA_VERSIONS.eventDelivery,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "eventId",
    "eventType",
    "subject",
    "subscriptionId",
    "subscriptionCode",
    "status",
    "attempt",
    "nextAttemptAt",
    "deliveredAt",
    "responseStatus",
    "responseBodyPreview",
    "lastError",
    "replayOfDeliveryId",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventDelivery },
    id: nonEmptyString,
    eventId: nonEmptyString,
    eventType: nonEmptyString,
    subject: { type: ["string", "null"] },
    subscriptionId: nonEmptyString,
    subscriptionCode: nonEmptyString,
    status: {
      enum: [
        "pending",
        "delivering",
        "retry_wait",
        "succeeded",
        "dead_lettered",
      ],
    },
    attempt: { type: "integer", minimum: 0 },
    nextAttemptAt: { anyOf: [dateTime, { type: "null" }] },
    deliveredAt: { anyOf: [dateTime, { type: "null" }] },
    responseStatus: { type: ["integer", "null"] },
    responseBodyPreview: { type: ["string", "null"] },
    lastError: { type: ["string", "null"] },
    replayOfDeliveryId: { type: ["string", "null"] },
    correlation: {
      type: "object",
      additionalProperties: false,
      required: [
        "eventId",
        "requestId",
        "traceId",
        "environmentKey",
        "eventOccurredAt",
        "outboxStatus",
        "outboxAttempts",
        "outboxError",
      ],
      properties: {
        eventId: nonEmptyString,
        requestId: { type: ["string", "null"] },
        traceId: { type: ["string", "null"] },
        environmentKey: nonEmptyString,
        eventOccurredAt: { anyOf: [dateTime, { type: "null" }] },
        outboxStatus: { type: ["string", "null"] },
        outboxAttempts: { type: "integer", minimum: 0 },
        outboxError: { type: ["string", "null"] },
      },
    },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const eventReceiptCommandSchema = {
  $id: SCHEMA_VERSIONS.eventReceiptCommand,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "action",
    "tenantId",
    "appCode",
    "environmentKey",
    "subscriptionCode",
    "eventId",
    "deliveryId",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventReceiptCommand },
    action: { enum: ["claim", "complete", "release"] },
    tenantId: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: nonEmptyString,
    subscriptionCode: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$",
    },
    eventId: nonEmptyString,
    deliveryId: {
      type: "string",
      format: "uuid",
    },
    claimToken: {
      type: "string",
      format: "uuid",
    },
  },
} as const;

export const eventReceiptResultSchema = {
  $id: SCHEMA_VERSIONS.eventReceiptResult,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "outcome",
    "eventId",
    "deliveryId",
    "status",
    "claimToken",
    "attempts",
    "leaseExpiresAt",
    "completedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventReceiptResult },
    outcome: { enum: ["claimed", "duplicate", "completed", "released"] },
    eventId: nonEmptyString,
    deliveryId: {
      type: "string",
      format: "uuid",
    },
    status: { enum: ["processing", "succeeded", "released"] },
    claimToken: { type: ["string", "null"], format: "uuid" },
    attempts: { type: "integer", minimum: 1 },
    leaseExpiresAt: dateTime,
    completedAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const applicationSecretSchema = {
  $id: SCHEMA_VERSIONS.applicationSecret,
  type: "object",
  additionalProperties: true,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "environmentKey",
    "name",
    "description",
    "status",
    "revision",
    "hasValue",
    "expiresAt",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.applicationSecret },
    id: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: nonEmptyString,
    name: { type: "string", pattern: "^[a-z][a-z0-9]*([-_][a-z0-9]+)*$" },
    description: { type: ["string", "null"] },
    status: { enum: ["active", "disabled", "deleted"] },
    revision: { type: "integer", minimum: 1 },
    hasValue: { type: "boolean" },
    expiresAt: { anyOf: [dateTime, { type: "null" }] },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const timerSubscriptionSchema = {
  $id: SCHEMA_VERSIONS.timerSubscription,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "code",
    "eventType",
    "cronExpression",
    "timezone",
    "payload",
    "misfirePolicy",
    "environmentKey",
    "status",
    "revision",
    "nextDueAt",
    "lastFiredAt",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.timerSubscription },
    id: nonEmptyString,
    appCode: nonEmptyString,
    code: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
    eventType: nonEmptyString,
    cronExpression: nonEmptyString,
    timezone: nonEmptyString,
    payload: { type: "object" },
    misfirePolicy: { const: "coalesce_one" },
    environmentKey: nonEmptyString,
    status: { enum: ["active", "paused"] },
    revision: { type: "integer", minimum: 1 },
    nextDueAt: { anyOf: [dateTime, { type: "null" }] },
    lastFiredAt: { anyOf: [dateTime, { type: "null" }] },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const dateTriggerSchema = {
  $id: SCHEMA_VERSIONS.dateTrigger,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "code",
    "resourceCode",
    "field",
    "offset",
    "eventType",
    "payload",
    "environmentKey",
    "status",
    "revision",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.dateTrigger },
    id: nonEmptyString,
    appCode: nonEmptyString,
    code: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
    resourceCode: nonEmptyString,
    field: nonEmptyString,
    offset: { type: "string", pattern: "^[+-]?P" },
    eventType: nonEmptyString,
    payload: { type: "object" },
    environmentKey: nonEmptyString,
    status: { enum: ["active", "paused"] },
    revision: { type: "integer", minimum: 1 },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const eventHandlerManifestSchema = {
  $id: SCHEMA_VERSIONS.eventHandlerManifest,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "appCode", "handlers"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventHandlerManifest },
    appCode: nonEmptyString,
    handlers: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "code",
          "endpointPath",
          "eventTypes",
          "dataSchemaVersions",
          "maxBodyBytes",
          "receiptProtocolVersion",
        ],
        properties: {
          code: nonEmptyString,
          endpointPath: { type: "string", pattern: "^/(?!/)(?!.*\\.\\.).+" },
          eventTypes: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            items: nonEmptyString,
          },
          dataSchemaVersions: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            items: nonEmptyString,
          },
          maxBodyBytes: { type: "integer", const: 65536 },
          receiptProtocolVersion: { const: 2 },
        },
      },
    },
  },
} as const;

export const eventDeliveryAckSchema = {
  $id: SCHEMA_VERSIONS.eventDeliveryAck,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "accepted",
    "duplicate",
    "eventId",
    "deliveryId",
    "receiptStatus",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.eventDeliveryAck },
    accepted: { const: true },
    duplicate: { type: "boolean" },
    eventId: nonEmptyString,
    deliveryId: nonEmptyString,
    receiptStatus: { const: "succeeded" },
  },
} as const;

const workflowExpressionSchema = {
  type: "object",
  required: ["op"],
  properties: {
    op: {
      enum: [
        "literal",
        "path",
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "contains",
        "and",
        "or",
        "not",
        "exists",
      ],
    },
    value: {},
    path: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_.]{0,254}$" },
    left: { type: "object" },
    right: { type: "object" },
    values: { type: "array", minItems: 1, items: { type: "object" } },
  },
} as const;

const workflowNodeSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "title",
        "binding",
        "mode",
        "onApprove",
        "onReject",
      ],
      properties: {
        id: nonEmptyString,
        kind: { const: "approval" },
        title: nonEmptyString,
        binding: nonEmptyString,
        mode: { enum: ["single", "any", "all", "sequence"] },
        onApprove: nonEmptyString,
        onReject: nonEmptyString,
        allowedOperations: {
          type: "array",
          uniqueItems: true,
          items: {
            enum: [
              "approve",
              "reject",
              "return",
              "transfer",
              "delegate",
              "add_assignee",
              "resubmit",
              "admin_reassign",
              "admin_override",
            ],
          },
        },
        returnTargets: {
          type: "array",
          uniqueItems: true,
          items: nonEmptyString,
        },
        fieldPolicy: {
          type: "object",
          additionalProperties: false,
          properties: {
            default: {
              enum: ["hidden", "readonly", "edit", "edit_required"],
            },
            fields: {
              type: "object",
              additionalProperties: {
                enum: ["hidden", "readonly", "edit", "edit_required"],
              },
            },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "branches", "otherwise"],
      properties: {
        id: nonEmptyString,
        kind: { const: "condition" },
        title: { type: "string" },
        branches: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["when", "target"],
            properties: {
              when: workflowExpressionSchema,
              target: nonEmptyString,
              label: { type: "string" },
            },
          },
        },
        otherwise: nonEmptyString,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "title", "outcome"],
      properties: {
        id: nonEmptyString,
        kind: { const: "end" },
        title: nonEmptyString,
        outcome: nonEmptyString,
      },
    },
  ],
} as const;

export const workflowDefinitionSchema = {
  $id: SCHEMA_VERSIONS.workflowDefinition,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "code",
    "title",
    "acceptedCommandDeactivationPolicy",
    "subject",
    "startAt",
    "inputSchema",
    "nodes",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowDefinition },
    code: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,127}$" },
    title: nonEmptyString,
    acceptedCommandDeactivationPolicy: {
      enum: ["finish-pinned", "cancel-on-deactivate"],
    },
    instanceCommands: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: {
        withdraw: {
          type: "object",
          additionalProperties: false,
          required: ["beforeFact"],
          properties: {
            beforeFact: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$" },
          },
        },
        terminate: {
          type: "object",
          additionalProperties: false,
          required: ["capability"],
          properties: {
            capability: { type: "string", maxLength: 255, pattern: "^app:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[A-Za-z0-9:._-]+$" },
            beforeFact: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$" },
          },
        },
      },
    },
    subject: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "factProjection", "summaryFields"],
      properties: {
        resourceCode: {
          type: "string",
          pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
        },
        factProjection: {
          type: "object",
          minProperties: 1,
          maxProperties: 64,
          propertyNames: {
            pattern: "^[A-Za-z][A-Za-z0-9_.]{0,127}$",
          },
          additionalProperties: {
            type: "string",
            pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
          },
        },
        summaryFields: {
          type: "array",
          maxItems: WORKFLOW_SUMMARY_MAX_FIELDS,
          uniqueItems: true,
          items: dataFieldCode,
        },
      },
    },
    startAt: nonEmptyString,
    inputSchema: {
      type: "object",
      required: ["type", "additionalProperties"],
      properties: {
        type: { const: "object" },
        additionalProperties: { const: false },
      },
    },
    organizationContext: {
      type: "object",
      additionalProperties: false,
      properties: {
        department: {
          type: "object",
          additionalProperties: false,
          required: ["source"],
          properties: {
            source: {
              enum: [
                "none",
                "user_primary_department",
                "choose_if_multiple",
                "always_choose",
                "fixed",
                "from_input",
                "from_role_scope",
              ],
            },
            required: { type: "boolean" },
            value: { type: "string" },
            path: { type: "string" },
            dimension: { type: "string" },
          },
        },
      },
    },
    nodes: {
      type: "object",
      minProperties: 1,
      maxProperties: 200,
      additionalProperties: workflowNodeSchema,
    },
  },
} as const;

export const workflowBindingSchema = {
  $id: SCHEMA_VERSIONS.workflowBinding,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "workflowCode", "bindings"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowBinding },
    workflowCode: nonEmptyString,
    bindings: {
      type: "object",
      maxProperties: 200,
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["provider"],
        properties: {
          provider: {
            enum: [
              "fixed_users",
              "initiator",
              "input_users",
              "form_field_users",
              "department_supervisor",
              "app_role",
              "app_role_in_scope",
              "business_relation",
              "previous_node_actor",
              "initiator_select",
              "application_provider",
            ],
          },
          users: { type: "array", uniqueItems: true, items: nonEmptyString },
          inputPath: { type: "string" },
          departmentIdFrom: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 20 },
          fallbackToAncestorSupervisor: { type: "boolean" },
          roleCode: { type: "string" },
          scope: {
            type: "object",
            additionalProperties: false,
            required: ["dimension"],
            properties: {
              dimension: nonEmptyString,
              valueFrom: { type: "string" },
              value: { type: "string" },
            },
          },
          relationCode: { type: "string" },
          resourceCode: { type: "string" },
          resourceIdFrom: { type: "string" },
          providerCode: { type: "string" },
          min: { type: "integer", minimum: 1, maximum: 200 },
          max: { type: "integer", minimum: 1, maximum: 200 },
          delegatable: { type: "boolean" },
        },
      },
    },
  },
} as const;

export const workflowPreparationSchema = {
  $id: SCHEMA_VERSIONS.workflowPreparation,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "preparationId",
    "status",
    "requirements",
    "preparationToken",
    "preview",
    "expiresAt",
    "definitionVersion",
    "bindingVersion",
    "dataRevision",
    "factDigest",
    "inputHash",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowPreparation },
    preparationId: nonEmptyString,
    status: { enum: ["needs_input", "ready"] },
    requirements: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "kind", "title"],
        properties: {
          id: nonEmptyString,
          kind: nonEmptyString,
          title: nonEmptyString,
          required: { type: "boolean" },
          min: { type: "integer", minimum: 1 },
          max: { type: "integer", minimum: 1 },
          candidates: { type: "array", items: { type: "object" } },
          inputSchema: { type: "object" },
          uiSchema: { type: "object" },
        },
      },
    },
    preparationToken: { type: ["string", "null"] },
    preview: { type: "object" },
    expiresAt: dateTime,
    definitionVersion: { type: "integer", minimum: 1 },
    bindingVersion: { type: "integer", minimum: 1 },
    dataRevision: { type: "integer", minimum: 1 },
    factDigest: digest,
    inputHash: digest,
  },
} as const;

const businessProcessCode = {
  type: "string",
  pattern: "^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$",
  minLength: 3,
  maxLength: 128,
} as const;
const businessProcessUuid = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
} as const;
const businessProcessAnswers = {
  type: "object",
  maxProperties: 64,
  propertyNames: { type: "string", minLength: 1, maxLength: 128 },
} as const;
const businessProcessRequirement = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "title", "required", "candidates"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 },
        kind: { const: "choose_department" },
        title: { type: "string", minLength: 1, maxLength: 200 },
        required: { type: "boolean" },
        candidates: {
          type: "array",
          maxItems: 200,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["value", "label"],
            properties: {
              value: { type: "string", minLength: 1, maxLength: 255 },
              label: { type: "string", minLength: 1, maxLength: 255 },
              description: { type: "string", maxLength: 500 },
            },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "title",
        "required",
        "min",
        "max",
        "candidates",
      ],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 },
        kind: { const: "choose_approvers" },
        title: { type: "string", minLength: 1, maxLength: 200 },
        required: { type: "boolean" },
        min: { type: "integer", minimum: 1, maximum: 200 },
        max: { type: "integer", minimum: 1, maximum: 200 },
        candidates: {
          type: "array",
          maxItems: 200,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["userId", "source"],
            properties: {
              userId: { type: "string", minLength: 1, maxLength: 255 },
              roleSubjectKey: { type: "string", minLength: 1, maxLength: 255 },
              roleSubjectKind: { enum: ["membership", "super_admin"] },
              roleSubjectRevision: { type: "integer", minimum: 1 },
              roleCode: { type: "string", minLength: 1, maxLength: 128 },
              roleName: { type: "string", minLength: 1, maxLength: 255 },
              displayName: { type: "string", maxLength: 255 },
              source: { type: "string", minLength: 1, maxLength: 128 },
              delegationId: { type: "string", minLength: 1, maxLength: 255 },
              delegatedFromUserId: { type: "string", minLength: 1, maxLength: 255 },
              delegatedFromRoleSubjectKey: { type: "string", minLength: 1, maxLength: 255 },
              delegatedFromRoleSubjectRevision: { type: "integer", minimum: 1 },
              delegationValidFrom: dateTime,
              delegationValidTo: dateTime,
            },
          },
        },
      },
    },
  ],
} as const;
const businessProcessDataOperation = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["key", "kind", "resourceCode", "data"],
      properties: {
        key: { type: "string", minLength: 1, maxLength: 128 },
        kind: { const: "create" },
        resourceCode: dataResourceCode,
        data: { type: "object", maxProperties: 200 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["key", "kind", "resourceCode", "id", "expectedRevision", "data"],
      properties: {
        key: { type: "string", minLength: 1, maxLength: 128 },
        kind: { const: "update" },
        resourceCode: dataResourceCode,
        id: businessProcessUuid,
        expectedRevision: { type: "integer", minimum: 1 },
        data: { type: "object", maxProperties: 200 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["key", "kind", "resourceCode", "id", "expectedRevision"],
      properties: {
        key: { type: "string", minLength: 1, maxLength: 128 },
        kind: { const: "delete" },
        resourceCode: dataResourceCode,
        id: businessProcessUuid,
        expectedRevision: { type: "integer", minimum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["key", "kind", "resourceCode", "id", "field", "amount"],
      properties: {
        key: { type: "string", minLength: 1, maxLength: 128 },
        kind: { const: "increment" },
        resourceCode: dataResourceCode,
        id: businessProcessUuid,
        field: dataFieldCode,
        amount: { type: "number", exclusiveMinimum: -1000000000000, exclusiveMaximum: 1000000000000 },
      },
    },
  ],
} as const;

export const businessProcessCommitSchema = {
  $id: SCHEMA_VERSIONS.businessProcessCommit,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "environmentKey", "idempotencyKey", "data", "workflow"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.businessProcessCommit },
    environmentKey: { enum: DEPLOYMENT_ENVIRONMENTS },
    idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
    data: {
      type: "object",
      additionalProperties: false,
      required: ["operations"],
      properties: {
        guards: { type: "array", maxItems: 20, items: dataTransactionGuard },
        operations: { type: "array", minItems: 1, maxItems: 16, items: businessProcessDataOperation },
      },
    },
    workflow: {
      type: "object",
      additionalProperties: false,
      required: ["workflowCode", "subject"],
      properties: {
        workflowCode: businessProcessCode,
        subject: {
          type: "object",
          additionalProperties: false,
          required: ["fromOperation"],
          properties: { fromOperation: { type: "string", minLength: 1, maxLength: 128 } },
        },
        answers: businessProcessAnswers,
      },
    },
  },
} as const;

export const standardProcessCommitSchema = {
  $id: SCHEMA_VERSIONS.standardProcessCommit,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "environmentKey", "workflowCode", "idempotencyKey", "mutation"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.standardProcessCommit },
    environmentKey: { enum: DEPLOYMENT_ENVIRONMENTS },
    workflowCode: businessProcessCode,
    idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
    mutation: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "data"],
          properties: { kind: { const: "create" }, data: { type: "object", maxProperties: 200 } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "id", "expectedRevision", "data"],
          properties: {
            kind: { const: "update" },
            id: businessProcessUuid,
            expectedRevision: { type: "integer", minimum: 1 },
            data: { type: "object", maxProperties: 200 },
          },
        },
      ],
    },
    answers: businessProcessAnswers,
  },
} as const;

export const businessProcessCommandSchema = {
  $id: SCHEMA_VERSIONS.businessProcessCommand,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "id", "appCode", "environmentKey", "operationCode",
    "idempotencyKey", "workflowCode", "status", "revision", "subject",
    "definitionVersion", "bindingVersion", "requirements", "answers", "preview",
    "workflowInstanceId", "attemptCount", "lastError", "replayed", "createdAt", "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.businessProcessCommand },
    id: businessProcessUuid,
    appCode: businessProcessCode,
    environmentKey: { enum: DEPLOYMENT_ENVIRONMENTS },
    operationCode: { type: "string", minLength: 1, maxLength: 255 },
    idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
    workflowCode: businessProcessCode,
    status: { enum: ["accepted", "resolving", "awaiting_input", "ready", "starting", "started", "retry_wait", "dead_letter", "cancelled"] },
    revision: { type: "integer", minimum: 1 },
    subject: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "id", "dataRevision", "factDigest"],
      properties: {
        resourceCode: dataResourceCode,
        id: businessProcessUuid,
        dataRevision: { type: "integer", minimum: 1 },
        factDigest: digest,
      },
    },
    definitionVersion: { type: "integer", minimum: 1 },
    bindingVersion: { type: "integer", minimum: 1 },
    requirements: { type: "array", maxItems: 64, items: businessProcessRequirement },
    answers: businessProcessAnswers,
    preview: { type: "object", maxProperties: 64 },
    workflowInstanceId: { anyOf: [businessProcessUuid, { type: "null" }] },
    attemptCount: { type: "integer", minimum: 0, maximum: 1000 },
    lastError: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["code", "preview"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 128 },
            preview: { type: "string", maxLength: 2000 },
          },
        },
        { type: "null" },
      ],
    },
    replayed: { type: "boolean" },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const businessProcessCommandListSchema = {
  $id: SCHEMA_VERSIONS.businessProcessCommandList,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "items", "nextCursor"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.businessProcessCommandList },
    items: { type: "array", maxItems: 50, items: { $ref: SCHEMA_VERSIONS.businessProcessCommand } },
    nextCursor: { anyOf: [businessProcessUuid, { type: "null" }] },
  },
} as const;

export const businessProcessReceiptSchema = {
  $id: SCHEMA_VERSIONS.businessProcessReceipt,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "receiptId", "commandId", "operationCode",
    "idempotencyKey", "requestDigest", "command", "createdAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.businessProcessReceipt },
    receiptId: businessProcessUuid,
    commandId: businessProcessUuid,
    operationCode: { type: "string", minLength: 1, maxLength: 255 },
    idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
    requestDigest: digest,
    command: { $ref: SCHEMA_VERSIONS.businessProcessCommand },
    createdAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const businessProcessPollSchema = {
  $id: SCHEMA_VERSIONS.businessProcessPoll,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "command", "changed", "terminal", "retryable",
    "cursor", "nextPoll",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.businessProcessPoll },
    command: { $ref: SCHEMA_VERSIONS.businessProcessCommand },
    changed: { type: "boolean" },
    terminal: { type: "boolean" },
    retryable: { type: "boolean" },
    cursor: {
      type: "object",
      additionalProperties: false,
      required: ["afterRevision", "revision"],
      properties: {
        afterRevision: { type: "integer", minimum: 0 },
        revision: { type: "integer", minimum: 1 },
      },
    },
    nextPoll: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["afterRevision", "retryAfterMs"],
          properties: {
            afterRevision: { type: "integer", minimum: 0 },
            retryAfterMs: { type: "integer", minimum: 250, maximum: 30000 },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;

export const businessProcessAnswerSchema = {
  $id: SCHEMA_VERSIONS.businessProcessAnswer,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "expectedRevision", "answers"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.businessProcessAnswer },
    expectedRevision: { type: "integer", minimum: 1 },
    answers: { ...businessProcessAnswers, minProperties: 1 },
  },
} as const;

export const businessProcessRetrySchema = {
  $id: SCHEMA_VERSIONS.businessProcessRetry,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "expectedRevision"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.businessProcessRetry },
    expectedRevision: { type: "integer", minimum: 1 },
  },
} as const;

const processCommandPointer = {
  type: "object",
  additionalProperties: false,
  required: ["method", "href"],
  properties: {
    method: { enum: ["GET", "POST"] },
    href: { type: "string", pattern: "^/(?!/)(?!.*\\.\\.)[^\\s]{0,511}$", maxLength: 512 },
    expectedRevision: { type: "integer", minimum: 1 },
  },
} as const;

export const processCommandSurfaceSchema = {
  $id: SCHEMA_VERSIONS.processCommandSurface,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "surfaceRevision", "command", "subject", "requirements", "resume"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.processCommandSurface },
    surfaceRevision: digest,
    command: { $ref: SCHEMA_VERSIONS.businessProcessCommand },
    subject: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "recordId", "dataRevision", "form"],
      properties: {
        resourceCode: dataResourceCode,
        recordId: businessProcessUuid,
        dataRevision: { type: "integer", minimum: 1 },
        form: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "resourceCode", "recordId"],
          properties: {
            kind: { const: "native-resource-form" },
            resourceCode: dataResourceCode,
            recordId: businessProcessUuid,
          },
        },
      },
    },
    requirements: { type: "array", maxItems: 64, items: businessProcessRequirement },
    resume: {
      type: "object",
      additionalProperties: false,
      required: ["status", "surface", "answer", "retry", "navigationTarget", "desktop", "mobile"],
      properties: {
        status: processCommandPointer,
        surface: processCommandPointer,
        answer: { anyOf: [processCommandPointer, { type: "null" }] },
        retry: { anyOf: [processCommandPointer, { type: "null" }] },
        navigationTarget: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "routeCode", "appCode", "pathParams", "query", "access"],
          properties: {
            kind: { const: "PLATFORM_ROUTE" },
            routeCode: { const: "resource.record" },
            appCode: businessProcessCode,
            pathParams: {
              type: "object",
              additionalProperties: false,
              required: ["resourceCode", "recordId"],
              properties: { resourceCode: dataResourceCode, recordId: businessProcessUuid },
            },
            query: {
              type: "object",
              additionalProperties: false,
              required: ["processCommandId"],
              properties: { processCommandId: businessProcessUuid },
            },
            access: { const: "AUTHENTICATED" },
          },
        },
        desktop: { type: "string", pattern: "^/(?!/)(?!.*\\.\\.)[^\\s]{0,511}$", maxLength: 512 },
        mobile: { type: "string", pattern: "^/(?!/)(?!.*\\.\\.)[^\\s]{0,511}$", maxLength: 512 },
      },
    },
  },
} as const;

export const workflowInstanceSchema = {
  $id: SCHEMA_VERSIONS.workflowInstance,
  type: "object",
  required: [
    "engineVersion",
    "id",
    "appCode",
    "environmentId",
    "environmentKey",
    "workflowCode",
    "status",
    "initiatorUserId",
    "initiatorAuthorizationDigest",
    "version",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowInstance },
    engineVersion: { const: "2.0" },
    id: nonEmptyString,
    appCode: nonEmptyString,
    environmentId: nonEmptyString,
    environmentKey: nonEmptyString,
    workflowCode: nonEmptyString,
    status: {
      enum: [
        "running",
        "returned",
        "approved",
        "rejected",
        "withdrawn",
        "terminated",
        "error",
      ],
    },
    initiatorUserId: nonEmptyString,
    initiatorAuthorizationDigest: { anyOf: [digest, { type: "null" }] },
    version: { type: "integer", minimum: 1 },
  },
} as const;

export const workflowTaskSchema = {
  $id: SCHEMA_VERSIONS.workflowTask,
  type: "object",
  required: [
    "engineVersion",
    "id",
    "instanceId",
    "nodeId",
    "status",
    "taskKind",
    "assignedRoleSubjectKey",
    "activeParticipantId",
    "participants",
    "originTaskId",
    "returnSessionId",
    "version",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowTask },
    engineVersion: { const: "2.0" },
    id: nonEmptyString,
    instanceId: nonEmptyString,
    nodeId: nonEmptyString,
    status: {
      enum: [
        "assignment_pending",
        "assigned",
        "completed",
        "rejected",
        "returned",
        "cancelled",
        "expired",
      ],
    },
    taskKind: { enum: ["normal", "return_review", "resume"] },
    assignedRoleSubjectKey: { type: ["string", "null"] },
    activeParticipantId: { type: ["string", "null"] },
    participants: {
      type: "array",
      minItems: 0,
      items: {
        type: "object",
        required: [
          "id",
          "userId",
          "roleSubjectKey",
          "roleSubjectKind",
          "roleSubjectRevision",
          "role",
          "kind",
          "status",
          "required",
          "outcome",
          "sourceParticipantId",
          "delegationId",
          "delegationValidFrom",
          "delegationValidTo",
          "createdByRoleSubjectKey",
          "completedByRoleSubjectKey",
          "createdAt",
          "completedAt",
        ],
        properties: {
          id: nonEmptyString,
          userId: nonEmptyString,
          roleSubjectKey: { type: ["string", "null"] },
          roleSubjectKind: {
            anyOf: [
              { enum: ["membership", "super_admin"] },
              { type: "null" },
            ],
          },
          roleSubjectRevision: { type: ["integer", "null"], minimum: 1 },
          role: {
            anyOf: [
              {
                type: "object",
                required: ["code", "name"],
                properties: { code: nonEmptyString, name: nonEmptyString },
              },
              { type: "null" },
            ],
          },
          kind: { enum: ["primary", "add_sign", "transfer", "delegate"] },
          status: { enum: ["pending", "active", "approved", "rejected", "cancelled"] },
          required: { type: "boolean" },
          outcome: {
            enum: [
              "approved",
              "rejected",
              "returned",
              "resubmitted",
              "transferred",
              "delegated",
              null,
            ],
          },
          sourceParticipantId: { type: ["string", "null"] },
          delegationId: { type: ["string", "null"] },
          delegationValidFrom: { anyOf: [dateTime, { type: "null" }] },
          delegationValidTo: { anyOf: [dateTime, { type: "null" }] },
          createdByRoleSubjectKey: { type: ["string", "null"] },
          completedByRoleSubjectKey: { type: ["string", "null"] },
          createdAt: dateTime,
          completedAt: { anyOf: [dateTime, { type: "null" }] },
        },
      },
    },
    originTaskId: { type: ["string", "null"] },
    returnSessionId: { type: ["string", "null"] },
    version: { type: "integer", minimum: 1 },
  },
} as const;

export const workflowBusinessDataSchema = {
  $id: SCHEMA_VERSIONS.workflowBusinessData,
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "resourceCode",
    "recordId",
    "requestedRevision",
    "sourceRevision",
    "fields",
    "projectionDigest",
  ],
  properties: {
    status: {
      enum: ["none", "fresh", "stale", "missing", "unavailable"],
    },
    resourceCode: { anyOf: [dataResourceCode, { type: "null" }] },
    recordId: { anyOf: [nonEmptyString, { type: "null" }] },
    requestedRevision: {
      anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
    },
    sourceRevision: {
      anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
    },
    fields: {
      type: "object",
      maxProperties: WORKFLOW_SUMMARY_MAX_FIELDS,
      additionalProperties: true,
    },
    projectionDigest: { anyOf: [digest, { type: "null" }] },
  },
  "x-openxiangda-max-bytes": WORKFLOW_SUMMARY_ENVELOPE_MAX_BYTES,
  "x-openxiangda-text-long-max-bytes": WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES,
} as const;

export const workflowBusinessDetailSchema = {
  $id: SCHEMA_VERSIONS.workflowBusinessDetail,
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "resourceCode",
    "resourceName",
    "recordId",
    "requestedRevision",
    "sourceRevision",
    "surface",
    "record",
    "subtables",
    "projectionDigest",
  ],
  properties: {
    status: {
      enum: ["ready", "stale", "missing", "forbidden", "unavailable"],
    },
    resourceCode: { anyOf: [dataResourceCode, { type: "null" }] },
    resourceName: { anyOf: [nonEmptyString, { type: "null" }] },
    recordId: { anyOf: [nonEmptyString, { type: "null" }] },
    requestedRevision: {
      anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
    },
    sourceRevision: {
      anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
    },
    surface: { anyOf: [{ type: "object" }, { type: "null" }] },
    record: {
      type: "object",
      maxProperties: WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES,
      additionalProperties: true,
    },
    subtables: {
      type: "object",
      maxProperties: WORKFLOW_DETAIL_MAX_FIELDS,
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["resourceCode", "surface", "rows", "total"],
        properties: {
          resourceCode: dataResourceCode,
          surface: { type: "object" },
          rows: {
            type: "array",
            maxItems: WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS,
            items: {
              type: "object",
              maxProperties: WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES,
            },
          },
          total: {
            type: "integer",
            minimum: 0,
            maximum: WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS,
          },
        },
      },
    },
    projectionDigest: { anyOf: [digest, { type: "null" }] },
    errorCode: { type: "string", minLength: 1, maxLength: 128 },
  },
  "x-openxiangda-max-bytes": WORKFLOW_DETAIL_ENVELOPE_MAX_BYTES,
} as const;

export const workflowSurfaceSchema = {
  $id: SCHEMA_VERSIONS.workflowSurface,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "protocolVersion",
    "surfaceRevision",
    "engineVersion",
    "commandToken",
    "commandTokenExpiresAt",
    "instanceSequence",
    "detailNavigation",
    "navigationTarget",
    "instance",
    "task",
    "presentation",
    "fieldPolicy",
    "operations",
    "extensions",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowSurface },
    protocolVersion: { const: "workflow_surface_v2" },
    surfaceRevision: digest,
    engineVersion: { const: "2.0" },
    commandToken: {
      anyOf: [
        { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
        { type: "null" },
      ],
    },
    commandTokenExpiresAt: { anyOf: [dateTime, { type: "null" }] },
    instanceSequence: { type: "integer", minimum: 0 },
    detailNavigation: {
      type: "object",
      additionalProperties: false,
      required: ["custom", "desktopPath", "mobilePath"],
      properties: {
        custom: { type: "boolean" },
        desktopPath: { type: "string", minLength: 1, maxLength: 512 },
        mobilePath: { type: "string", minLength: 1, maxLength: 512 },
      },
    },
    navigationTarget: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "appCode",
            "environmentKey",
            "resourceCode",
            "recordId",
            "desktopPath",
            "mobilePath",
          ],
          properties: {
            kind: { const: "resource_record" },
            appCode: nonEmptyString,
            environmentKey: { enum: ["preproduction", "production"] },
            resourceCode: nonEmptyString,
            recordId: nonEmptyString,
            desktopPath: nonEmptyString,
            mobilePath: nonEmptyString,
          },
        },
        { type: "null" },
      ],
    },
    instance: { type: "object" },
    task: { anyOf: [{ type: "object" }, { type: "null" }] },
    presentation: {
      type: "object",
      required: ["businessData", "businessDetail", "summary"],
      properties: {
        businessData: workflowBusinessDataSchema,
        businessDetail: workflowBusinessDetailSchema,
        summary: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "initiatorDisplayName",
            "departmentDisplayName",
            "submittedAt",
            "businessNumber",
          ],
          properties: {
            title: nonEmptyString,
            initiatorDisplayName: nonEmptyString,
            departmentDisplayName: {
              anyOf: [nonEmptyString, { type: "null" }],
            },
            submittedAt: dateTime,
            businessNumber: { anyOf: [nonEmptyString, { type: "null" }] },
            initiator: {
              type: "object",
              additionalProperties: false,
              required: [
                "userId",
                "displayName",
                "avatarUrl",
                "departmentDisplayName",
              ],
              properties: {
                userId: { anyOf: [nonEmptyString, { type: "null" }] },
                displayName: nonEmptyString,
                avatarUrl: { anyOf: [nonEmptyString, { type: "null" }] },
                departmentDisplayName: {
                  anyOf: [nonEmptyString, { type: "null" }],
                },
              },
            },
          },
        },
      },
    },
    fieldPolicy: { type: "object" },
    operations: { type: "array", items: { type: "object" } },
    extensions: { type: "object" },
  },
} as const;

export const workflowDetailSurfaceSchema = {
  $id: SCHEMA_VERSIONS.workflowDetailSurface,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "protocolVersion",
    "detailRevision",
    "instanceSequence",
    "timelineRevision",
    "surface",
    "timeline",
    "currentStatus",
    "nodes",
    "handlingRecords",
    "operations",
    "navigationContext",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowDetailSurface },
    protocolVersion: { const: "workflow_detail_surface_v2" },
    detailRevision: digest,
    instanceSequence: { type: "integer", minimum: 0 },
    timelineRevision: digest,
    surface: workflowSurfaceSchema,
    timeline: {
      type: "object",
      required: [
        "engineVersion",
        "instanceId",
        "instanceSequence",
        "timelineRevision",
        "flow",
        "items",
        "display",
      ],
      properties: {
        engineVersion: { const: "2.0" },
        instanceId: nonEmptyString,
        instanceSequence: { type: "integer", minimum: 0 },
        timelineRevision: digest,
        flow: { type: "array", items: { type: "object" } },
        items: { type: "array", items: { type: "object" } },
        display: {
          type: "object",
          additionalProperties: false,
          required: ["entries"],
          properties: {
            entries: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
    currentStatus: {
      type: "object",
      additionalProperties: false,
      required: ["code", "label", "tone"],
      properties: {
        code: nonEmptyString,
        label: nonEmptyString,
        tone: nonEmptyString,
      },
    },
    nodes: { type: "array", items: { type: "object" } },
    handlingRecords: { type: "array", items: { type: "object" } },
    operations: { type: "array", items: { type: "object" } },
    navigationContext: {
      type: "object",
      additionalProperties: false,
      required: ["desktopReturnPath", "mobileReturnPath"],
      properties: {
        desktopReturnPath: nonEmptyString,
        mobileReturnPath: nonEmptyString,
      },
    },
  },
} as const;

export const workflowCommandInputSchema = {
  $id: SCHEMA_VERSIONS.workflowCommandInput,
  type: "object",
  additionalProperties: false,
  required: ["commandToken", "idempotencyKey"],
  properties: {
    commandToken: {
      type: "string",
      pattern: "^[A-Za-z0-9_-]{43}$",
    },
    idempotencyKey: {
      type: "string",
      minLength: 1,
      maxLength: 255,
    },
    input: {
      type: "object",
      maxProperties: 200,
    },
  },
} as const;

const workflowLaunchInputBindingSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["source", "fieldCode"],
      properties: {
        source: { const: "field" },
        fieldCode: dataFieldCode,
      },
    },
    ...[
      "idempotency-key",
      "current-user-reference",
      "subject-id",
      "subject-revision",
      "requested-at",
    ].map(source => ({
      type: "object",
      additionalProperties: false,
      required: ["source"],
      properties: { source: { const: source } },
    })),
  ],
} as const;

const workflowNamedOperationLaunchIntentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "operationCode",
    "method",
    "href",
    "requiredCapability",
    "requestSchemaDigest",
    "responseSchemaDigest",
    "inputs",
    "output",
  ],
  properties: {
    operationCode: {
      type: "string",
      pattern: "^[A-Za-z][A-Za-z0-9_.:-]{0,254}$",
    },
    method: { const: "POST" },
    href: {
      type: "string",
      pattern: "^/(?!/)(?!.*\\.\\.)(?:[A-Za-z0-9_:.{}-]+/?)*$",
      maxLength: 512,
    },
    requiredCapability: nonEmptyString,
    requestSchemaDigest: digest,
    responseSchemaDigest: digest,
    inputs: {
      type: "object",
      minProperties: 1,
      maxProperties: 64,
      propertyNames: {
        type: "string",
        pattern: "^[A-Za-z][A-Za-z0-9_.:-]{0,254}$",
      },
      additionalProperties: workflowLaunchInputBindingSchema,
    },
    output: {
      type: "object",
      additionalProperties: false,
      required: ["subjectId"],
      properties: {
        subjectId: dataFieldCode,
        subjectRevision: dataFieldCode,
        processCommand: dataFieldCode,
      },
    },
  },
} as const;

const workflowLaunchCommitSchema = {
  type: "object",
  additionalProperties: false,
  required: ["method", "href", "idempotencyRequired"],
  properties: {
    method: { const: "POST" },
    href: {
      type: "string",
      pattern: "^/(?!/)(?!.*\\.\\.)(?:[A-Za-z0-9_:.{}-]+/?)*$",
      maxLength: 512,
    },
    idempotencyRequired: { const: true },
  },
} as const;

const workflowLaunchSubmissionSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "processOperationCode", "commit"],
      properties: {
        kind: { const: "standard-process" },
        processOperationCode: {
          type: "string",
          pattern: "^openxiangda\\.workflow\\.[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*\\.submit$",
          maxLength: 255,
        },
        commit: workflowLaunchCommitSchema,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "context"],
      anyOf: [{ required: ["create"] }, { required: ["existing"] }],
      properties: {
        kind: { const: "named-operation" },
        create: workflowNamedOperationLaunchIntentSchema,
        existing: workflowNamedOperationLaunchIntentSchema,
        context: {
          type: "array",
          maxItems: 16,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["queryParameter", "fieldCode"],
            properties: {
              queryParameter: {
                type: "string",
                pattern: "^[A-Za-z][A-Za-z0-9]{0,63}$",
              },
              fieldCode: dataFieldCode,
            },
          },
        },
      },
    },
  ],
} as const;

export const workflowLaunchSurfaceSchema = {
  $id: SCHEMA_VERSIONS.workflowLaunchSurface,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "protocolVersion",
    "surfaceRevision",
    "engineVersion",
    "appCode",
    "environmentKey",
    "environmentId",
    "workflowCode",
    "title",
    "launchMode",
    "subject",
    "inputSchema",
    "head",
    "paths",
    "submission",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowLaunchSurface },
    protocolVersion: { const: "workflow_launch_surface_v3" },
    surfaceRevision: digest,
    engineVersion: { const: "2.0" },
    appCode: nonEmptyString,
    environmentKey: { enum: DEPLOYMENT_ENVIRONMENTS },
    environmentId: nonEmptyString,
    workflowCode: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$",
      maxLength: 128,
    },
    title: nonEmptyString,
    launchMode: { enum: ["standalone", "hidden-handoff"] },
    processOperationCode: {
      type: "string",
      pattern: "^openxiangda\\.workflow\\.[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*\\.submit$",
      maxLength: 255,
    },
    subject: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "factProjection", "summaryFields"],
      properties: {
        resourceCode: dataResourceCode,
        factProjection: {
          type: "object",
          minProperties: 1,
          maxProperties: 64,
          propertyNames: {
            type: "string",
            pattern: "^[A-Za-z][A-Za-z0-9_.]{0,127}$",
          },
          additionalProperties: dataFieldCode,
        },
        summaryFields: {
          type: "array",
          maxItems: WORKFLOW_SUMMARY_MAX_FIELDS,
          uniqueItems: true,
          items: dataFieldCode,
        },
      },
    },
    inputSchema: { type: "object" },
    head: {
      type: "object",
      additionalProperties: false,
      required: [
        "workflowRevision",
        "definitionVersion",
        "bindingVersion",
        "nativeRevision",
        "contractRevisionId",
      ],
      properties: {
        workflowRevision: { type: "integer", minimum: 1 },
        definitionVersion: { type: "integer", minimum: 1 },
        bindingVersion: { type: "integer", minimum: 1 },
        nativeRevision: { type: "integer", minimum: 1 },
        contractRevisionId: nonEmptyString,
      },
    },
    paths: {
      type: "object",
      additionalProperties: false,
      required: ["desktop", "mobile"],
      properties: {
        desktop: {
          type: "string",
          pattern: "^/(?!/)(?!.*\\.\\.)(?:[A-Za-z0-9_:.{}-]+/?)*$",
          maxLength: 512,
        },
        mobile: {
          type: "string",
          pattern: "^/(?!/)(?!.*\\.\\.)(?:[A-Za-z0-9_:.{}-]+/?)*$",
          maxLength: 512,
        },
      },
    },
    commit: workflowLaunchCommitSchema,
    submission: workflowLaunchSubmissionSchema,
  },
} as const;

export const workflowDelegationSchema = {
  $id: SCHEMA_VERSIONS.workflowDelegation,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "environmentKey",
    "workflowCode",
    "delegatorUserId",
    "delegateUserId",
    "delegatorRoleSubjectKey",
    "delegateRoleSubjectKey",
    "validFrom",
    "validTo",
    "status",
    "reason",
    "createdBy",
    "createdAt",
    "revokedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowDelegation },
    id: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: nonEmptyString,
    workflowCode: { type: ["string", "null"] },
    delegatorUserId: nonEmptyString,
    delegateUserId: nonEmptyString,
    delegatorRoleSubjectKey: nonEmptyString,
    delegateRoleSubjectKey: nonEmptyString,
    validFrom: dateTime,
    validTo: dateTime,
    status: { enum: ["active", "revoked", "expired"] },
    reason: nonEmptyString,
    createdBy: nonEmptyString,
    createdAt: dateTime,
    revokedAt: { anyOf: [dateTime, { type: "null" }] },
  },
} as const;

export const workflowAssigneeProviderSchema = {
  $id: SCHEMA_VERSIONS.workflowAssigneeProvider,
  type: "object",
  required: [
    "schemaVersion",
    "id",
    "appCode",
    "environmentKey",
    "code",
    "endpointPath",
    "timeoutMs",
    "status",
    "signingSecretVersion",
    "pendingSigningSecretVersion",
    "rotationPending",
    "revision",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowAssigneeProvider },
    id: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: nonEmptyString,
    code: nonEmptyString,
    endpointPath: nonEmptyString,
    timeoutMs: { type: "integer", minimum: 100, maximum: 10000 },
    status: { enum: ["active", "paused"] },
    signingSecretVersion: { type: "integer", minimum: 1 },
    pendingSigningSecretVersion: {
      type: ["integer", "null"],
      minimum: 2,
    },
    rotationPending: { type: "boolean" },
    revision: { type: "integer", minimum: 1 },
    signingSecret: { type: ["string", "null"] },
    signingSecretReturnedOnce: { type: "boolean" },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const workflowAssigneeRequestSchema = {
  $id: SCHEMA_VERSIONS.workflowAssigneeRequest,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "requestId",
    "providerCode",
    "appCode",
    "environmentKey",
    "workflowCode",
    "nodeId",
    "businessKey",
    "dataRef",
    "dataRevision",
    "definitionVersion",
    "bindingVersion",
    "factDigest",
    "facts",
    "organizationContext",
    "initiator",
    "authzVersion",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowAssigneeRequest },
    requestId: nonEmptyString,
    providerCode: nonEmptyString,
    appCode: nonEmptyString,
    environmentKey: nonEmptyString,
    workflowCode: nonEmptyString,
    nodeId: nonEmptyString,
    businessKey: { type: "string", minLength: 1, maxLength: 255 },
    dataRef: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "id"],
      properties: {
        resourceCode: {
          type: "string",
          pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
          maxLength: 64,
        },
        id: { type: "string", minLength: 1, maxLength: 255 },
      },
    },
    dataRevision: { type: "integer", minimum: 1 },
    definitionVersion: { type: "integer", minimum: 1 },
    bindingVersion: { type: "integer", minimum: 1 },
    factDigest: digest,
    facts: { type: "object" },
    organizationContext: { type: "object" },
    initiator: { type: "object" },
    authzVersion: { type: "integer", minimum: 1 },
  },
} as const;

export const workflowAssigneeResponseSchema = {
  $id: SCHEMA_VERSIONS.workflowAssigneeResponse,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "requestId", "candidates"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.workflowAssigneeResponse },
    requestId: nonEmptyString,
    candidates: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        required: ["userId", "source"],
        properties: {
          userId: nonEmptyString,
          roleSubjectKey: nonEmptyString,
          roleSubjectKind: { enum: ["membership", "super_admin"] },
          roleSubjectRevision: { type: "integer", minimum: 1 },
          roleCode: nonEmptyString,
          roleName: nonEmptyString,
          displayName: nonEmptyString,
          source: nonEmptyString,
        },
      },
    },
  },
} as const;

const nativeCapabilityCode = {
  type: "string",
  pattern: "^app:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[A-Za-z0-9:._*-]+$",
  maxLength: 255,
} as const;
const stableCode = {
  type: "string",
  pattern: "^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$",
  maxLength: 128,
} as const;
const absoluteAppPath = {
  type: "string",
  pattern: "^/(?!/)(?!.*\\.\\.)(?:[A-Za-z0-9_:.{}-]+/?)*$",
  maxLength: 2048,
} as const;
const staticAppPath = {
  type: "string",
  pattern: "^/(?!/)(?!.*\\.\\.)(?!.*[:*?#\\\\])(?:[A-Za-z0-9_.{}-]+/?)*$",
  maxLength: 2048,
} as const;
const jsonObjectSchema = { type: "object" } as const;

const appCapabilityDeclarationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "kind", "name"],
  properties: {
    code: nativeCapabilityCode,
    kind: { enum: ["backend", "ui"] },
    name: nonEmptyString,
    description: { type: "string", maxLength: 2000 },
  },
} as const;

const appRoleDeclarationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "name", "capabilities"],
  properties: {
    code: stableCode,
    name: nonEmptyString,
    description: { type: "string", maxLength: 2000 },
    capabilities: {
      type: "array",
      uniqueItems: true,
      maxItems: 2000,
      items: nativeCapabilityCode,
    },
  },
} as const;

const appAuthorizationTransitionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fromAuthzDigest", "reason"],
  properties: {
    fromAuthzDigest: digest,
    removeRoleCodes: {
      type: "array",
      maxItems: 2000,
      uniqueItems: true,
      items: stableCode,
    },
    removeCapabilityCodes: {
      type: "array",
      maxItems: 2000,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: "^[A-Za-z*][A-Za-z0-9:._*-]{0,254}$",
        maxLength: 255,
      },
    },
    reason: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
      pattern: "\\S",
    },
  },
} as const;

const appPerspectiveContractSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "name", "roleCodes", "capabilityCodes"],
  properties: {
    code: stableCode,
    name: nonEmptyString,
    description: { type: "string", maxLength: 2000 },
    roleCodes: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: stableCode,
    },
    capabilityCodes: {
      type: "array",
      maxItems: 2000,
      uniqueItems: true,
      items: nativeCapabilityCode,
    },
    default: { type: "boolean" },
  },
} as const;

const appOperationPlatformAccessSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    roleAssertions: {
      type: "object", additionalProperties: false, required: ["roleCodes"],
      properties: { roleCodes: {
        type: "array", minItems: 1, maxItems: 20, uniqueItems: true,
        items: { type: "string", pattern: "^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$", maxLength: 100 },
      } },
    },
    directory: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "fields"],
      properties: {
        mode: { const: "current-initiator" },
        fields: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
          items: {
            enum: [
              "displayName",
              "employeeNumber",
              "primaryDepartment",
              "departments",
            ],
          },
        },
      },
    },
    managedFiles: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["resourceCode", "fieldCodes", "intents"],
        properties: {
          resourceCode: dataResourceCode,
          fieldCodes: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            uniqueItems: true,
            items: stableCode,
          },
          intents: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            uniqueItems: true,
            items: { enum: ["create", "update"] },
          },
        },
      },
    },
    managedFileCopies: managedFileCopiesSchema,
    notification: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: { mode: { const: "business-standard" } },
    },
    workflow: {
      type: "object",
      additionalProperties: false,
      required: ["codes"],
      properties: {
        codes: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          uniqueItems: true,
          items: stableCode,
        },
      },
    },
  },
} as const;

const appApiOperationDeclarationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "code",
    "method",
    "path",
    "capability",
    "requestSchema",
    "responseSchema",
  ],
  properties: {
    code: stableCode,
    method: { enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
    path: absoluteAppPath,
    capability: nativeCapabilityCode,
    requestSchema: jsonObjectSchema,
    responseSchema: jsonObjectSchema,
    description: { type: "string", maxLength: 2000 },
    platformAccess: appOperationPlatformAccessSchema,
    ai: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "description",
        "risk",
        "resources",
        "sideEffects",
      ],
      properties: {
        name: nonEmptyString,
        description: nonEmptyString,
        risk: { enum: ["read", "write", "destructive", "external"] },
        resources: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          uniqueItems: true,
          items: dataResourceCode,
        },
        sideEffects: {
          type: "array",
          maxItems: 20,
          uniqueItems: true,
          items: nonEmptyString,
        },
        concurrency: { enum: ["none", "revision"] },
        timeoutMs: { type: "integer", minimum: 100, maximum: 30000 },
      },
    },
  },
} as const;

const appRouteAccessSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  anyOf: [{ required: ["allOf"] }, { required: ["anyOf"] }],
  properties: {
    allOf: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      uniqueItems: true,
      items: nativeCapabilityCode,
    },
    anyOf: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      uniqueItems: true,
      items: nativeCapabilityCode,
    },
  },
} as const;

const appResourceDetailRouteDeclarationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resourceCode", "desktop", "mobile"],
  properties: {
    resourceCode: stableCode,
    desktop: stableCode,
    mobile: stableCode,
  },
} as const;

const appRouteDeclarationSchema = {
  type: "object",
  additionalProperties: false,
  not: { required: ["capability", "access"] },
  required: ["code", "path", "label", "surface"],
  properties: {
    code: stableCode,
    path: absoluteAppPath,
    label: nonEmptyString,
    surface: { enum: ["admin", "user"] },
    parentCode: stableCode,
    capability: nativeCapabilityCode,
    access: appRouteAccessSchema,
    pinned: { type: "boolean" },
    tabPersistence: { enum: ["session", "none"] },
    keepAlive: { enum: ["none", "memory"] },
  },
} as const;

const appAdminIconSchema = {
  enum: [
    "overview",
    "database",
    "operations",
    "workflow",
    "members",
    "calendar",
    "document",
    "folder",
    "settings",
  ],
} as const;

const appAdminPageReferenceSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "resourceCode"],
      properties: { kind: { const: "resource" }, resourceCode: stableCode, viewCode: stableCode },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "routeCode"],
      properties: { kind: { const: "operation" }, routeCode: stableCode },
    },
  ],
} as const;

const appAdminNavigationDeclarationSchema = {
  type: "array",
  maxItems: 100,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["code", "label", "items"],
    properties: {
      code: stableCode,
      label: nonEmptyString,
      icon: appAdminIconSchema,
      order: { type: "integer", minimum: -10000, maximum: 10000 },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["page"],
          properties: {
            page: appAdminPageReferenceSchema,
            label: nonEmptyString,
            icon: appAdminIconSchema,
            order: { type: "integer", minimum: -10000, maximum: 10000 },
          },
        },
      },
    },
  },
} as const;

const appAdminPageContractSchema = {
  type: "object",
  additionalProperties: false,
  not: { required: ["capability", "access"] },
  required: ["code", "kind", "path", "label", "navigationEligible"],
  properties: {
    code: nonEmptyString,
    kind: {
      enum: [
        "resource-list",
        "resource-detail",
        "resource-create",
        "resource-update",
        "operation",
      ],
    },
    path: absoluteAppPath,
    label: nonEmptyString,
    navigationEligible: { type: "boolean" },
    capability: nativeCapabilityCode,
    access: appRouteAccessSchema,
    resourceCode: stableCode,
    viewCode: stableCode,
    routeCode: stableCode,
  },
} as const;

const appAdminNavigationContractSchema = {
  type: "array",
  maxItems: 100,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["code", "label", "order", "items"],
    properties: {
      code: stableCode,
      label: nonEmptyString,
      icon: appAdminIconSchema,
      order: { type: "integer", minimum: -10000, maximum: 10000 },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["pageCode", "order"],
          properties: {
            pageCode: nonEmptyString,
            label: nonEmptyString,
            icon: appAdminIconSchema,
            order: { type: "integer", minimum: -10000, maximum: 10000 },
          },
        },
      },
    },
  },
} as const;

const appRouteContractSchema = {
  ...appRouteDeclarationSchema,
  required: [
    ...appRouteDeclarationSchema.required,
    "tabPersistence",
    "keepAlive",
  ],
} as const;

const applicationAuthenticationMethodSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["code", "type", "label", "presentation", "required", "provider"],
      properties: {
        code: stableCode,
        type: { const: "sso" },
        label: nonEmptyString,
        presentation: { enum: ["primary", "secondary"] },
        required: { type: "boolean" },
        provider: { const: "tenant-default" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["code", "type", "label", "presentation", "required"],
      properties: {
        code: stableCode,
        type: { const: "password" },
        label: nonEmptyString,
        presentation: { enum: ["primary", "secondary"] },
        required: { type: "boolean" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["code", "type", "label", "presentation", "required", "flow"],
      properties: {
        code: stableCode,
        type: { const: "dingtalk" },
        label: nonEmptyString,
        presentation: { enum: ["primary", "secondary"] },
        required: { type: "boolean" },
        flow: { enum: ["auto", "jsapi", "oauth"] },
      },
    },
  ],
} as const;

const applicationAuthenticationSurfaceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["routeCode", "path", "defaultRouteCode"],
  properties: {
    routeCode: stableCode,
    path: absoluteAppPath,
    defaultRouteCode: stableCode,
  },
} as const;

const applicationAuthenticationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["accountMode", "registration", "methods", "surfaces"],
  properties: {
    accountMode: { const: "existing-platform-users-only" },
    registration: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: { mode: { const: "reject" } },
    },
    methods: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: applicationAuthenticationMethodSchema,
    },
    surfaces: {
      type: "object",
      additionalProperties: false,
      required: ["desktop", "mobile"],
      properties: {
        desktop: applicationAuthenticationSurfaceSchema,
        mobile: applicationAuthenticationSurfaceSchema,
      },
    },
  },
} as const;

const anonymousPublicAccessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["policies"],
  properties: {
    policies: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "code",
          "routeCode",
          "mode",
          "resourceCode",
          "operations",
          "fields",
        ],
        properties: {
          code: stableCode,
          routeCode: stableCode,
          mode: { const: "anonymous" },
          resourceCode: stableCode,
          operations: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            uniqueItems: true,
            items: {
              enum: [
                "draft.read",
                "draft.update",
                "validate",
                "create",
                "own.list",
                "own.read",
              ],
            },
          },
          fields: {
            type: "array",
            minItems: 1,
            maxItems: 64,
            uniqueItems: true,
            items: stableCode,
          },
          requiredFields: {
            type: "array",
            maxItems: 64,
            uniqueItems: true,
            items: stableCode,
          },
          ownRecordFields: {
            type: "array",
            maxItems: 64,
            uniqueItems: true,
            items: stableCode,
          },
          draft: {
            type: "object",
            additionalProperties: false,
            required: ["enabled"],
            properties: {
              enabled: { const: true },
              inactivityTtlSeconds: {
                type: "integer",
                minimum: 3600,
                maximum: 7776000,
              },
              maxBytes: {
                type: "integer",
                minimum: 4096,
                maximum: 262144,
              },
            },
          },
          validations: {
            type: "array",
            maxItems: 16,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["code", "kind", "fields", "result"],
              properties: {
                code: stableCode,
                kind: { const: "duplicate" },
                fields: {
                  type: "array",
                  minItems: 1,
                  maxItems: 8,
                  uniqueItems: true,
                  items: stableCode,
                },
                result: { const: "availability" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const appScopeDimensionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "name"],
  properties: {
    code: stableCode,
    name: nonEmptyString,
    resourceCode: stableCode,
    valueType: { enum: ["string", "uuid"] },
    hierarchyMode: { enum: ["flat", "self_parent"] },
    valueSource: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "resourceCode", "labelField"],
      properties: {
        kind: { const: "native_resource" },
        resourceCode: stableCode,
        labelField: {
          type: "string",
          pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
        },
        enabledField: {
          type: "string",
          pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
        },
      },
    },
  },
  allOf: [
    {
      if: { required: ["valueSource"] },
      then: {
        required: ["valueType"],
        properties: { valueType: { const: "uuid" } },
      },
    },
  ],
} as const;

const semanticFieldPath = {
  type: "string",
  pattern:
    "^[A-Za-z_][A-Za-z0-9_]{0,127}(?:\\.(?:value|snapshot\\.[A-Za-z_][A-Za-z0-9_]{0,127}))?$",
} as const;

const appScopeSourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "code",
    "name",
    "resourceCode",
    "subject",
    "grants",
    "failureMode",
  ],
  properties: {
    code: stableCode,
    name: nonEmptyString,
    resourceCode: stableCode,
    subject: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "userIdField"],
          properties: {
            type: { const: "user" },
            userIdField: semanticFieldPath,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "userIdField", "roleCode"],
          properties: {
            type: { const: "role_membership" },
            userIdField: semanticFieldPath,
            roleCode: stableCode,
          },
        },
      ],
    },
    grants: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimensionCode", "valueField"],
        properties: {
          dimensionCode: stableCode,
          valueField: semanticFieldPath,
          parentValueField: semanticFieldPath,
        },
      },
    },
    operationField: {
      type: "string",
      pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
    },
    enabledField: {
      type: "string",
      pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
    },
    effectiveFromField: {
      type: "string",
      pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
    },
    effectiveToField: {
      type: "string",
      pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
    },
    failureMode: { enum: ["strict", "last_known_good"] },
  },
} as const;

const authorizationProjectionControlProperties = {
  enabledField: {
    type: "string",
    pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
  },
  effectiveFromField: {
    type: "string",
    pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
  },
  effectiveToField: {
    type: "string",
    pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
  },
  failureMode: { const: "strict" },
} as const;

const authorizationProjectionSourceCode = {
  ...stableCode,
  maxLength: 100,
} as const;

const appRoleMembershipSourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "code",
    "name",
    "resourceCode",
    "userIdField",
    "roleCode",
    "failureMode",
  ],
  properties: {
    code: authorizationProjectionSourceCode,
    name: nonEmptyString,
    resourceCode: stableCode,
    userIdField: semanticFieldPath,
    roleCode: stableCode,
    ...authorizationProjectionControlProperties,
  },
} as const;

const appRelationshipGrantSourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "code",
    "name",
    "resourceCode",
    "subject",
    "relationCode",
    "targetResourceCode",
    "resourceIdField",
    "operations",
    "failureMode",
  ],
  properties: {
    code: authorizationProjectionSourceCode,
    name: nonEmptyString,
    resourceCode: stableCode,
    subject: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "userIdField"],
          properties: {
            type: { const: "user" },
            userIdField: semanticFieldPath,
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "userIdField", "roleCode"],
          properties: {
            type: { const: "role_membership" },
            userIdField: semanticFieldPath,
            roleCode: stableCode,
          },
        },
      ],
    },
    relationCode: stableCode,
    targetResourceCode: stableCode,
    resourceIdField: semanticFieldPath,
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 64,
        pattern: "^[A-Za-z0-9][A-Za-z0-9:._*-]{0,63}$",
      },
    },
    ...authorizationProjectionControlProperties,
  },
} as const;

const dataPolicyField = {
  type: "string",
  pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
} as const;
const dataPolicyRoleCodes = {
  type: "array",
  minItems: 1,
  maxItems: 100,
  uniqueItems: true,
  items: stableCode,
} as const;
const appDataPolicyRuleSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "operator", "value"],
      properties: {
        field: dataPolicyField,
        operator: { enum: ["eq", "not_eq"] },
        value: nonEmptyString,
        roleCodes: dataPolicyRoleCodes,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "operator", "value"],
      properties: {
        field: dataPolicyField,
        operator: { enum: ["in", "not_in"] },
        value: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: nonEmptyString,
        },
        roleCodes: dataPolicyRoleCodes,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "operator"],
      properties: {
        field: dataPolicyField,
        operator: { enum: ["is_null", "is_not_null"] },
        roleCodes: dataPolicyRoleCodes,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["field", "operator", "operand"],
      properties: {
        field: dataPolicyField,
        operator: { enum: ["lt", "lte", "gt", "gte"] },
        operand: { const: "db_now" },
        roleCodes: dataPolicyRoleCodes,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["subject", "field"],
      properties: {
        subject: { const: "current_user" },
        field: dataPolicyField,
        roleCodes: dataPolicyRoleCodes,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["dimensionCode", "field"],
      properties: {
        dimensionCode: stableCode,
        field: dataPolicyField,
        roleCodes: dataPolicyRoleCodes,
        operation: nonEmptyString,
        valuePath: nonEmptyString,
        emptyMatchesAll: { type: "boolean" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["relationCode", "resourceCode", "field"],
      properties: {
        relationCode: stableCode,
        resourceCode: stableCode,
        field: dataPolicyField,
        roleCodes: dataPolicyRoleCodes,
        operation: nonEmptyString,
        valuePath: nonEmptyString,
      },
    },
  ],
} as const;
const appDataPolicyExpressionSchema = {
  oneOf: [
    appDataPolicyRuleSchema,
    {
      type: "object",
      additionalProperties: false,
      required: ["allOf"],
      properties: {
        allOf: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { $ref: "#/$defs/appDataPolicyExpression" },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["anyOf"],
      properties: {
        anyOf: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { $ref: "#/$defs/appDataPolicyExpression" },
        },
      },
    },
  ],
} as const;
const appDataPolicyDeclarationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "name", "resourceCode", "matchMode", "rules"],
  properties: {
    code: stableCode,
    name: nonEmptyString,
    resourceCode: stableCode,
    unrestrictedRoleCodes: dataPolicyRoleCodes,
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      uniqueItems: true,
      items: { enum: ["read", "create", "update", "delete"] },
    },
    matchMode: { enum: ["AND", "OR"] },
    rules: {
      type: "array",
      maxItems: 100,
      items: appDataPolicyRuleSchema,
    },
    readExpression: { $ref: "#/$defs/appDataPolicyExpression" },
    writeBoundary: { const: "capability_only" },
  },
  allOf: [
    {
      oneOf: [
        {
          properties: { rules: { minItems: 1 } },
          not: { required: ["writeBoundary"] },
        },
        {
          required: ["readExpression", "writeBoundary"],
          properties: {
            matchMode: { const: "AND" },
            rules: { maxItems: 0 },
            writeBoundary: { const: "capability_only" },
          },
        },
      ],
    },
    { not: { required: ["operations", "readExpression"] } },
  ],
} as const;

export const configurationBundleSchema = {
  $id: SCHEMA_VERSIONS.configurationBundle,
  $defs: { appDataPolicyExpression: appDataPolicyExpressionSchema },
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "compilerContractVersion",
    "appCode",
    "perspectives",
    "authz",
    "backend",
    "data",
    "events",
    "workflows",
    "frontend",
    "runtime",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.configurationBundle },
    compilerContractVersion: {
      const: OPENXIANGDA_COMPILER_CONTRACT_VERSION,
    },
    appCode: stableCode,
    perspectives: {
      type: "array",
      maxItems: 100,
      items: appPerspectiveContractSchema,
    },
    authz: {
      type: "object",
      additionalProperties: false,
      required: [
        "capabilities",
        "roles",
        "scopeDimensions",
        "scopeSources",
        "roleMembershipSources",
        "relationshipGrantSources",
        "dataPolicies",
        "authorizationTransitions",
      ],
      properties: {
        authenticatedUserRoleCode: stableCode,
        capabilities: {
          type: "array",
          maxItems: 2000,
          items: appCapabilityDeclarationSchema,
        },
        roles: { type: "array", maxItems: 100, items: appRoleDeclarationSchema },
        scopeDimensions: {
          type: "array",
          maxItems: 100,
          items: appScopeDimensionSchema,
        },
        scopeSources: {
          type: "array",
          maxItems: 100,
          items: appScopeSourceSchema,
        },
        roleMembershipSources: {
          type: "array",
          maxItems: 100,
          items: appRoleMembershipSourceSchema,
        },
        relationshipGrantSources: {
          type: "array",
          maxItems: 100,
          items: appRelationshipGrantSourceSchema,
        },
        dataPolicies: {
          type: "array",
          maxItems: 100,
          items: appDataPolicyDeclarationSchema,
        },
        authorizationTransitions: {
          type: "array",
          maxItems: 100,
          items: appAuthorizationTransitionSchema,
        },
      },
    },
    backend: {
      type: "object",
      additionalProperties: false,
      required: ["secrets", "operations"],
      properties: {
        secrets: { type: "array", maxItems: 100, items: { type: "object" } },
        operations: {
          type: "array",
          maxItems: 500,
          items: appApiOperationDeclarationSchema,
        },
      },
    },
    data: {
      type: "object",
      additionalProperties: false,
      required: ["resources"],
      properties: {
        resources: {
          type: "array",
          maxItems: 100,
          items: { $ref: SCHEMA_VERSIONS.dataResource },
        },
        resourceDetailRoutes: {
          type: "array",
          maxItems: 100,
          items: appResourceDetailRouteDeclarationSchema,
        },
      },
    },
    events: {
      type: "object",
      additionalProperties: false,
      required: ["schemas", "subscriptions", "timers", "dateTriggers"],
      properties: {
        capturePolicies: {
          type: "array", maxItems: 100,
          items: {
            type: "object", additionalProperties: false,
            required: ["resourceCode", "mode"],
            properties: { resourceCode: { type: "string" }, mode: { enum: ["all", "subscribed"] } },
          },
        },
        schemas: {
          type: "array",
          maxItems: 100,
          items: eventSchemaDefinitionSchema,
        },
        subscriptions: { type: "array", maxItems: 100, items: { type: "object" } },
        timers: { type: "array", maxItems: 100, items: { type: "object" } },
        dateTriggers: { type: "array", maxItems: 100, items: { type: "object" } },
      },
    },
    workflows: {
      type: "object",
      additionalProperties: false,
      required: [
        "definitions",
        "bindings",
        "activations",
        "providers",
        "editableParameters",
      ],
      properties: {
        definitions: { type: "array", maxItems: 100, items: { type: "object" } },
        bindings: { type: "array", maxItems: 100, items: { type: "object" } },
        activations: { type: "array", maxItems: 100, items: { type: "object" } },
        providers: { type: "array", maxItems: 100, items: { type: "object" } },
        editableParameters: {
          type: "array",
          maxItems: 100,
          items: { type: "object" },
        },
      },
    },
    frontend: {
      type: "object",
      additionalProperties: false,
      required: ["routes", "user", "admin", "devicePolicy"],
      properties: {
        routes: { type: "array", maxItems: 500, items: appRouteDeclarationSchema },
        user: {
          type: "object",
          additionalProperties: false,
          required: ["applicationTodoCenter"],
          properties: { applicationTodoCenter: { type: "boolean" } },
        },
        devicePolicy: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "mobileMaxWidthPx", "desktopMinWidthPx"],
          properties: {
            kind: { const: "viewport-family" },
            mobileMaxWidthPx: { type: "integer", minimum: 320, maximum: 1600 },
            desktopMinWidthPx: { type: "integer", minimum: 320, maximum: 1600 },
          },
        },
        authentication: {
          anyOf: [{ type: "null" }, applicationAuthenticationSchema],
        },
        publicAccess: {
          anyOf: [{ type: "null" }, anonymousPublicAccessSchema],
        },
        admin: {
          type: "object",
          additionalProperties: false,
          required: ["navigation"],
          properties: {
            access: appRouteAccessSchema,
            navigation: appAdminNavigationDeclarationSchema,
          },
        },
      },
    },
    runtime: {
      type: "object",
      additionalProperties: false,
      required: ["protocolCapabilities", "health"],
      properties: {
        protocolCapabilities: {
          type: "array",
          uniqueItems: true,
          maxItems: 100,
          items: nonEmptyString,
        },
        health: {
          type: "object",
          additionalProperties: false,
          required: ["livePath", "readyPath", "versionPath"],
          properties: {
            livePath: { const: "/__platform/health" },
            readyPath: { const: "/__platform/ready" },
            versionPath: { const: "/__platform/version" },
          },
        },
      },
    },
  },
} as const;

const appRouteManifestRouteSchema = {
  type: "object",
  additionalProperties: false,
  not: { required: ["capability", "access"] },
  required: [
    "routeCode",
    "path",
    "surface",
    "pathParams",
    "requiresAuthentication",
  ],
  properties: {
    routeCode: stableCode,
    path: absoluteAppPath,
    surface: { enum: ["admin", "user"] },
    pathParams: {
      type: "array",
      maxItems: 32,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: "^[A-Za-z][A-Za-z0-9_]*$",
        maxLength: 64,
      },
    },
    capability: nativeCapabilityCode,
    access: appRouteAccessSchema,
    requiresAuthentication: { const: true },
  },
} as const;

const appRouteManifestEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "kind", "desktop", "mobile"],
  properties: {
    code: nonEmptyString,
    kind: {
      enum: [
        "application-todo-center",
        "workflow-work-center",
        "workflow-launch",
        "workflow-task",
        "workflow-instance",
      ],
    },
    workflowCode: stableCode,
    desktop: appRouteManifestRouteSchema,
    mobile: appRouteManifestRouteSchema,
  },
} as const;

export const applicationRouteManifestSchema = {
  $id: SCHEMA_VERSIONS.applicationRouteManifest,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "appCode",
    "devicePolicy",
    "rootEntry",
    "authentication",
    "routes",
    "digest",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.applicationRouteManifest },
    appCode: stableCode,
    devicePolicy: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "mobileMaxWidthPx", "desktopMinWidthPx"],
      properties: {
        kind: { const: "viewport-family" },
        mobileMaxWidthPx: { type: "integer", minimum: 320, maximum: 1600 },
        desktopMinWidthPx: { type: "integer", minimum: 320, maximum: 1600 },
      },
    },
    rootEntry: {
      type: "object",
      additionalProperties: false,
      required: ["code", "desktop", "mobile"],
      properties: {
        code: stableCode,
        desktop: staticAppPath,
        mobile: staticAppPath,
      },
    },
    authentication: {
      type: "object",
      additionalProperties: false,
      required: ["desktop", "mobile"],
      properties: {
        desktop: {
          type: "object",
          additionalProperties: false,
          required: ["routeCode", "path"],
          properties: { routeCode: stableCode, path: staticAppPath },
        },
        mobile: {
          type: "object",
          additionalProperties: false,
          required: ["routeCode", "path"],
          properties: { routeCode: stableCode, path: staticAppPath },
        },
      },
    },
    routes: {
      type: "array",
      maxItems: 512,
      items: appRouteManifestEntrySchema,
    },
    digest,
  },
} as const;

export const contractBundleSchema = {
  $id: SCHEMA_VERSIONS.contractBundle,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "compilerContractVersion",
    "generatorVersion",
    "appCode",
    "configDigest",
    "perspectives",
    "resources",
    "capabilities",
    "operations",
    "eventConsumers",
    "eventProducers",
    "eventSchemas",
    "eventHandlerManifest",
    "eventTypes",
    "workflows",
    "routes",
    "routeManifest",
    "adminPages",
    "adminNavigation",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSIONS.contractBundle },
    compilerContractVersion: {
      const: OPENXIANGDA_COMPILER_CONTRACT_VERSION,
    },
    generatorVersion: nonEmptyString,
    appCode: stableCode,
    configDigest: digest,
    perspectives: {
      type: "array",
      maxItems: 100,
      items: appPerspectiveContractSchema,
    },
    resources: { type: "array", maxItems: 100, items: { type: "object" } },
    capabilities: { type: "array", maxItems: 2000, items: { type: "object" } },
    operations: { type: "array", maxItems: 500, items: { type: "object" } },
    eventConsumers: { type: "array", maxItems: 100, items: { type: "object" } },
    eventProducers: { type: "array", maxItems: 1000, items: { type: "object" } },
    eventSchemas: {
      type: "array",
      maxItems: 100,
      items: eventSchemaDefinitionSchema,
    },
    eventHandlerManifest: eventHandlerManifestSchema,
    eventTypes: { type: "array", maxItems: 500, items: nonEmptyString },
    workflows: { type: "array", maxItems: 100, items: { type: "object" } },
    routes: { type: "array", maxItems: 500, items: appRouteContractSchema },
    authentication: {
      anyOf: [{ type: "null" }, applicationAuthenticationSchema],
    },
    publicAccess: {
      anyOf: [{ type: "null" }, anonymousPublicAccessSchema],
    },
    routeManifest: applicationRouteManifestSchema,
    adminAccess: appRouteAccessSchema,
    adminPages: {
      type: "array",
      maxItems: 500,
      items: appAdminPageContractSchema,
    },
    adminNavigation: appAdminNavigationContractSchema,
  },
} as const;

export const runtimeCapacityPreflightSchema = {
  $id: SCHEMA_VERSIONS.runtimeCapacityPreflight,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'observedAt', 'environmentKey', 'environmentId', 'basis', 'existingRun', 'sufficient', 'capacity'],
  properties: {
    schemaVersion: { const: RUNTIME_CAPACITY_PREFLIGHT_SCHEMA },
    deploymentStrategy: { enum: ['rolling', 'maintenance-replace'] },
    maintenance: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['downtime', 'estimatedAfterStop', 'previousAppVersionId', 'previousDeploymentId', 'headRevision'], properties: { downtime: { const: true }, estimatedAfterStop: { const: true }, previousAppVersionId: nonEmptyString, previousDeploymentId: nonEmptyString, headRevision: { type: 'integer', minimum: 1 } } }] },
    observedAt: { type: 'string', minLength: 1 },
    environmentKey: { const: 'preproduction' }, environmentId: nonEmptyString,
    basis: { enum: ['new-candidate', 'existing-run', 'frontend-only'] },
    existingRun: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['id', 'status'], properties: { id: nonEmptyString, status: nonEmptyString } }] },
    sufficient: { type: ['boolean', 'null'] },
    capacity: { anyOf: [{ type: 'null' }, {
      type: 'object', additionalProperties: false, required: ['checked', 'namespace', 'additionalReplicas', 'required', 'quotas', 'shortages'],
      properties: {
        checked: { type: 'boolean' }, namespace: nonEmptyString,
        additionalReplicas: { type: 'integer', minimum: 0, maximum: 1 },
        profile: { enum: ['light', 'standard'] },
        required: { type: 'object', maxProperties: 10, additionalProperties: nonEmptyString },
        quotas: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['name', 'available'], properties: { name: nonEmptyString, available: { type: 'object', maxProperties: 10, additionalProperties: nonEmptyString } } } },
        shortages: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['quota', 'resource', 'required', 'available'], properties: { quota: nonEmptyString, resource: nonEmptyString, required: nonEmptyString, available: nonEmptyString } } },
      },
    }] },
  },
  allOf: [{ if: { properties: { basis: { const: 'existing-run' } } }, then: { properties: { sufficient: { type: 'null' }, capacity: { type: 'null' }, existingRun: { type: 'object' } } }, else: { properties: { capacity: { type: 'object' }, existingRun: { type: 'null' } } } }],
} as const;

export const contractSchemas = {
  runtimeCapacityPreflight: runtimeCapacityPreflightSchema,
  diagnostic: diagnosticSchema,
  studioCapabilities: studioCapabilitiesSchema,
  studioCliEvent: studioCliEventSchema,
  studioWorkspaceBinding: studioWorkspaceBindingSchema,
  studioWorkspaceInitialization: studioWorkspaceInitializationSchema,
  workspaceTemplateBinding: workspaceTemplateBindingSchema,
  workspaceContext: workspaceContextSchema,
  application: applicationSchema,
  principal: principalSchema,
  nativePrincipal: nativePrincipalSchema,
  gatewayAssertionJwks: gatewayAssertionJwksSchema,
  gatewayInvocationPrincipal: gatewayInvocationPrincipalSchema,
  runtimeLeaseResult: runtimeLeaseResultSchema,
  runtimeSecretValues: runtimeSecretValuesSchema,
  subjectProfile: subjectProfileSchema,
  currentInitiatorDirectoryRequest: currentInitiatorDirectoryRequestSchema,
  currentInitiatorDirectorySnapshot: currentInitiatorDirectorySnapshotSchema,
  roleSubjectPage: roleSubjectPageSchema,
  runtimeAuthorization: runtimeAuthorizationSchema,
  nativeAuthorizationManagementCatalog:
    nativeAuthorizationManagementCatalogSchema,
  nativeRoleMembershipPage: nativeRoleMembershipPageSchema,
  nativeRoleManagementGrantPage: nativeRoleManagementGrantPageSchema,
  nativeAuthorizationMutationReceipt:
    nativeAuthorizationMutationReceiptSchema,
  nativeSuperAdminGrantPage: nativeSuperAdminGrantPageSchema,
  nativeRelationshipGrantPage: nativeRelationshipGrantPageSchema,
  nativeAuthorizationProjectionHealth:
    nativeAuthorizationProjectionHealthSchema,
  roleAssignment: roleAssignmentSchema,
  relationshipGrant: relationshipGrantSchema,
  authorizationDecision: authorizationDecisionSchema,
  authorizationBatchRequest: authorizationBatchRequestSchema,
  authorizationBatchResult: authorizationBatchResultSchema,
  nativeAuthorizationDecision: nativeAuthorizationDecisionSchema,
  nativeAuthorizationBatchRequest: nativeAuthorizationBatchRequestSchema,
  nativeAuthorizationBatchResult: nativeAuthorizationBatchResultSchema,
  directoryResolveRequest: directoryResolveRequestSchema,
  directorySearchResult: directorySearchResultSchema,
  directoryEntryPage: directoryEntryPageSchema,
  nativeScopeValueResolveRequest: nativeScopeValueResolveRequestSchema,
  nativeScopeValuePage: nativeScopeValuePageSchema,
  dataFieldSourceQuery: dataFieldSourceQuerySchema,
  dataFieldSourcePage: dataFieldSourcePageSchema,
  dataRef: dataRefSchema,
  dataResource: dataResourceSchema,
  dataQuery: dataQuerySchema,
  dataBatchQuery: dataBatchQuerySchema,
  dataBatchQueryResult: dataBatchQueryResultSchema,
  dataExportRequest: dataExportRequestSchema,
  dataPage: dataPageSchema,
  dataRecord: dataRecordSchema,
  dataAggregateQuery: dataAggregateQuerySchema,
  dataAggregatePage: dataAggregatePageSchema,
  dataAuditPage: dataAuditPageSchema,
  dataFileRef: dataFileRefSchema,
  dataFileUploadPlan: dataFileUploadPlanSchema,
  dataFileCopyRequest: dataFileCopyRequestSchema,
  dataFileCopyReceipt: dataFileCopyReceiptSchema,
  dataFilePreview: dataFilePreviewSchema,
  dataTransactionRequest: dataTransactionRequestSchema,
  dataTransactionResult: dataTransactionResultSchema,
  cloudEvent: cloudEventSchema,
  eventCatalog: eventCatalogSchema,
  eventSchema: eventSchemaDefinitionSchema,
  eventHandlerManifest: eventHandlerManifestSchema,
  eventDeliveryAck: eventDeliveryAckSchema,
  eventSubscription: eventSubscriptionSchema,
  eventDelivery: eventDeliverySchema,
  eventReceiptCommand: eventReceiptCommandSchema,
  eventReceiptResult: eventReceiptResultSchema,
  applicationSecret: applicationSecretSchema,
  timerSubscription: timerSubscriptionSchema,
  dateTrigger: dateTriggerSchema,
  workflowDefinition: workflowDefinitionSchema,
  workflowBinding: workflowBindingSchema,
  workflowPreparation: workflowPreparationSchema,
  workflowInstance: workflowInstanceSchema,
  workflowTask: workflowTaskSchema,
  workflowBusinessData: workflowBusinessDataSchema,
  workflowBusinessDetail: workflowBusinessDetailSchema,
  workflowSurface: workflowSurfaceSchema,
  workflowDetailSurface: workflowDetailSurfaceSchema,
  workflowCommandInput: workflowCommandInputSchema,
  workflowLaunchSurface: workflowLaunchSurfaceSchema,
  workflowDelegation: workflowDelegationSchema,
  workflowAssigneeProvider: workflowAssigneeProviderSchema,
  workflowAssigneeRequest: workflowAssigneeRequestSchema,
  workflowAssigneeResponse: workflowAssigneeResponseSchema,
  businessProcessCommit: businessProcessCommitSchema,
  standardProcessCommit: standardProcessCommitSchema,
  businessProcessCommand: businessProcessCommandSchema,
  businessProcessReceipt: businessProcessReceiptSchema,
  businessProcessPoll: businessProcessPollSchema,
  businessProcessCommandList: businessProcessCommandListSchema,
  processCommandSurface: processCommandSurfaceSchema,
  businessProcessAnswer: businessProcessAnswerSchema,
  businessProcessRetry: businessProcessRetrySchema,
  appPackage: appPackageSchema,
  appVersion: appVersionSchema,
  promotionPreflight: promotionPreflightSchema,
  environmentHead: environmentHeadSchema,
  applicationEnvironments: applicationEnvironmentsSchema,
  deploymentRun: deploymentRunSchema,
  platformCapabilities: platformCapabilitiesSchema,
  configurationCompatibility: configurationCompatibilitySchema,
  configurationValidationRequest: configurationValidationRequestSchema,
  configurationValidationResult: configurationValidationResultSchema,
  configurationBundle: configurationBundleSchema,
  applicationRouteManifest: applicationRouteManifestSchema,
  contractBundle: contractBundleSchema,
  aiCapabilityCatalog: aiCapabilityCatalogSchema,
} as const;
