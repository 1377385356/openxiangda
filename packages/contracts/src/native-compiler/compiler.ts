import { projectNativeDataResourceViewV2 } from './data-surface.js';
import { hasDataAuditReadPolicy, isDataAuditMetadataField } from './data-audit-access.js';
import { validateWorkflowInstanceCommandPolicies } from './workflow-instance-policy.js';
import * as crypto from 'crypto';
import {
  OPENXIANGDA_COMPILER_CONTRACT_VERSION as OPENXIANGDA_V2_COMPILER_CONTRACT_VERSION,
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS as OPENXIANGDA_V2_PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
} from '../native-version.js';
import { canonicalJson, sha256Digest as sha256Canonical } from '../canonical.js';
import {
  type PlatformCapabilityCode as OpenXiangdaPlatformCapabilityCode,
  type RequiredPlatformCapabilityContract as OpenXiangdaRequiredPlatformCapabilityV3,
} from '../types.js';
import {
  NativeDataFieldContractV2Error,
  NativeDataFieldV2,
  nativeFieldRequiresCreateInputV2,
  parseNativeDataFieldsV2,
  parseNativeDataResourceInvariantsV2,
  validateNativeDataResourceReferencesV2,
} from './data-field.js';
import { validateNativeDataResourceSurfaceV2 } from './data-surface.js';
import {
  NativeScopeSourceDimensionV2,
  nativeScopeSourceGrantPathSupportedV2,
  nativeScopeSourceSubjectPathSupportedV2,
  resolveNativeScopeSourceFieldPathV2,
} from './scope-source-field-path.js';
import {
  NativeDataPolicyExpressionV2Error,
  nativeDataPolicyExpressionLeavesV2,
  nativeDataPolicyExpressionToCnfV2,
} from './data-policy-expression.js';

const CONFIG_SCHEMA = 'openxiangda.config-bundle/v3';
const CONTRACT_SCHEMA = 'openxiangda.contract-bundle/v3';
const PROJECTION_SCHEMA = 'openxiangda.native-configuration-projection/v1';
const COMPILER_CONTRACT_VERSION = OPENXIANGDA_V2_COMPILER_CONTRACT_VERSION;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const APP_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CAPABILITY_PATTERN =
  /^app:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[A-Za-z0-9:._*-]+$/;
const STABLE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const AI_OPERATION_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/;
const RESOURCE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FIELD_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const PROPERTY_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const SECRET_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const SECRET_ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const WORKFLOW_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const WORKFLOW_BINDING_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const WORKFLOW_FACT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.]{0,127}$/;
const WORKFLOW_SUMMARY_MAX_FIELDS = 16;
const WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES = 2 * 1024;
const WORKFLOW_SUMMARY_FIELD_TYPES = new Set([
  'text.short',
  'text.long',
  'number.integer',
  'number.decimal',
  'boolean',
  'date',
  'time',
  'datetime',
  'option.single',
  'option.multiple',
  'cascade.single',
  'cascade.multiple',
  'user.single',
  'user.multiple',
  'department.single',
  'department.multiple',
  'resource-ref.single',
  'resource-ref.multiple',
  'uuid',
  'serial-number',
]);
const ADMIN_NAVIGATION_ICONS = new Set([
  'overview',
  'database',
  'operations',
  'workflow',
  'members',
  'calendar',
  'document',
  'folder',
  'settings',
]);
const WORKFLOW_OPERATIONS = new Set([
  'approve',
  'reject',
  'return',
  'transfer',
  'delegate',
  'add_assignee',
  'resubmit',
  'withdraw',
  'terminate',
  'admin_reassign',
  'admin_override',
  'retry_resolution',
]);
const MAX_CONFIG_BYTES = 4 * 1024 * 1024;
const MAX_CONTRACT_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 40;
const MAX_NODES = 100000;
const MAX_STRING_BYTES = 1024 * 1024;
const EVENT_HANDLER_MANIFEST_SCHEMA = 'openxiangda.event-handler-manifest/v2';
const ROUTE_MANIFEST_SCHEMA = 'openxiangda.application-route-manifest/v3';
const EVENT_CAPTURE_FIELD_LIMIT = 64;
const EVENT_AUTHORIZATION_SYSTEM_FIELDS = new Set([
  'id',
  'revision',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
]);
export const NATIVE_CONTRACT_CAPACITY_V2 = Object.freeze({
  perspectives: 100,
  resources: 100,
  capabilities: 2000,
  operations: 500,
  eventConsumers: 100,
  eventProducers: 1000,
  eventSchemas: 100,
  eventTypes: 500,
  workflows: 100,
  routes: 500,
  adminPages: 500,
  adminNavigationGroups: 100,
  adminNavigationItems: 500,
} as const);
export const DATA_EVENT_TYPES_V2 = [
  'openxiangda.data.record.created.v2',
  'openxiangda.data.record.updated.v2',
  'openxiangda.data.record.deleted.v2',
] as const;
export const WORKFLOW_EVENT_TYPES_V2 = [
  'openxiangda.workflow.instance.started.v2',
  'openxiangda.workflow.instance.cc_added.v2',
  'openxiangda.workflow.instance.completed.v2',
  'openxiangda.workflow.instance.rejected.v2',
  'openxiangda.workflow.instance.returned.v2',
  'openxiangda.workflow.instance.resumed.v2',
  'openxiangda.workflow.instance.withdrawn.v2',
  'openxiangda.workflow.instance.terminated.v2',
  'openxiangda.workflow.task.created.v2',
  'openxiangda.workflow.task.assigned.v2',
  'openxiangda.workflow.task.assignment_pending.v2',
  'openxiangda.workflow.task.assignment_resolution_failed.v2',
  'openxiangda.workflow.task.approved.v2',
  'openxiangda.workflow.task.completed.v2',
  'openxiangda.workflow.task.rejected.v2',
  'openxiangda.workflow.task.returned.v2',
  'openxiangda.workflow.task.resubmitted.v2',
  'openxiangda.workflow.task.transferred.v2',
  'openxiangda.workflow.task.reassigned.v2',
  'openxiangda.workflow.task.delegated.v2',
  'openxiangda.workflow.task.assignee_added.v2',
  'openxiangda.workflow.task.cancelled.v2',
  'openxiangda.workflow.participant.activated.v2',
  'openxiangda.workflow.participant.completed.v2',
  'openxiangda.workflow.participant.rejected.v2',
  'openxiangda.workflow.participant.returned.v2',
  'openxiangda.workflow.participant.transferred.v2',
  'openxiangda.workflow.participant.reassigned.v2',
  'openxiangda.workflow.participant.delegated.v2',
  'openxiangda.workflow.participant.added.v2',
  'openxiangda.workflow.participant.suspended.v2',
  'openxiangda.workflow.participant.resumed.v2',
  'openxiangda.workflow.participant.cancelled.v2',
] as const;
const WORKFLOW_EVENT_TYPE_SET_V2 = new Set<string>(WORKFLOW_EVENT_TYPES_V2);

type JsonObject = Record<string, any>;

export interface NativeConfigurationCompilerInput {
  appCode: string;
  configBytes: string | Buffer | Uint8Array;
  contractBytes: string | Buffer | Uint8Array;
  expectedConfigDigest: string;
  expectedContractDigest: string;
}

export interface NativeConfigurationProjection<T = JsonObject> {
  value: T;
  digest: string;
}

export interface NativeConfigurationCompilerResult {
  schemaVersion: typeof PROJECTION_SCHEMA;
  compilerContractVersion: typeof COMPILER_CONTRACT_VERSION;
  appCode: string;
  source: {
    configDigest: string;
    contractDigest: string;
    generatorVersion: string;
  };
  projections: {
    authz: NativeConfigurationProjection;
    data: NativeConfigurationProjection;
    events: NativeConfigurationProjection;
    workflows: NativeConfigurationProjection;
    runtime: NativeConfigurationProjection;
    contracts: NativeConfigurationProjection;
  };
  requiredPlatformCapabilities: OpenXiangdaRequiredPlatformCapabilityV3[];
  aggregateDigest: string;
}

export class NativeConfigurationCompilerError extends Error {
  readonly code: string;
  readonly pointer: string;
  readonly identifiers: Record<string, string>;

  constructor(
    code: string,
    pointer: string,
    identifiers: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = 'NativeConfigurationCompilerError';
    this.code = code;
    this.pointer = pointer;
    this.identifiers = Object.fromEntries(
      Object.entries(identifiers)
        .slice(0, 8)
        .map(([key, value]) => [key, String(value).slice(0, 128)])
    );
  }
}

export function compileNativeApplicationConfiguration(
  input: NativeConfigurationCompilerInput
): NativeConfigurationCompilerResult {
  const appCode = requiredString(input.appCode, '/appCode', 128);
  if (!APP_CODE_PATTERN.test(appCode)) {
    fail('NATIVE_CONFIG_APP_CODE_INVALID', '/appCode');
  }
  const expectedConfigDigest = digest(
    input.expectedConfigDigest,
    '/expectedConfigDigest'
  );
  const expectedContractDigest = digest(
    input.expectedContractDigest,
    '/expectedContractDigest'
  );
  const configSource = artifactBytes(
    input.configBytes,
    MAX_CONFIG_BYTES,
    '/configBytes',
    'NATIVE_CONFIG_ARTIFACT_TOO_LARGE'
  );
  const contractSource = artifactBytes(
    input.contractBytes,
    MAX_CONTRACT_BYTES,
    '/contractBytes',
    'NATIVE_CONTRACT_ARTIFACT_TOO_LARGE'
  );
  verifyArtifactDigest(
    configSource,
    expectedConfigDigest,
    '/configBytes',
    'NATIVE_CONFIG_DIGEST_MISMATCH'
  );
  verifyArtifactDigest(
    contractSource,
    expectedContractDigest,
    '/contractBytes',
    'NATIVE_CONTRACT_DIGEST_MISMATCH'
  );

  const parsedConfig = parseCanonicalArtifact(
    configSource,
    '/configBytes',
    'NATIVE_CONFIG_JSON_INVALID',
    'NATIVE_CONFIG_NOT_CANONICAL'
  );
  const parsedContract = parseCanonicalArtifact(
    contractSource,
    '/contractBytes',
    'NATIVE_CONTRACT_JSON_INVALID',
    'NATIVE_CONTRACT_NOT_CANONICAL'
  );
  inspectJsonBudget(parsedConfig, '/config');
  inspectJsonBudget(parsedContract, '/contracts');
  const config = parsedConfig;
  const contract = parsedContract;
  validateConfigurationEnvelope(config, appCode);
  validateContractEnvelope(contract, appCode, expectedConfigDigest);

  const expectedContract = compileExpectedContract(
    config,
    expectedConfigDigest,
    contract.generatorVersion
  );
  if (canonicalJson(expectedContract) !== canonicalJson(contract)) {
    fail(
      'NATIVE_CONTRACT_CLOSURE_MISMATCH',
      firstDifferencePointer(expectedContract, contract, '/contracts')
    );
  }

  const projectionValues = {
    authz: {
      appCode,
      ...config.authz,
      perspectives: config.perspectives,
      capabilityCatalog: expectedContract.capabilities,
    },
    data: {
      appCode,
      resources: config.data.resources,
      resourceContracts: expectedContract.resources,
    },
    events: {
      appCode,
      ...config.events,
      consumers: expectedContract.eventConsumers,
      producers: expectedContract.eventProducers,
      handlerManifest: expectedContract.eventHandlerManifest,
      eventTypes: expectedContract.eventTypes,
      capturePlans: compileNativeEventCapturePlansV2({
        resources: config.data.resources,
        dataPolicies: config.authz.dataPolicies,
        subscriptions: expectedContract.eventConsumers,
        capturePolicies: config.events.capturePolicies,
      }),
    },
    workflows: {
      appCode,
      ...config.workflows,
      contracts: expectedContract.workflows,
    },
    runtime: {
      appCode,
      requirements: config.runtime,
      backend: config.backend,
      frontend: config.frontend,
    },
    contracts: expectedContract,
  };
  const projections = {
    authz: projection(projectionValues.authz),
    data: projection(projectionValues.data),
    events: projection(projectionValues.events),
    workflows: projection(projectionValues.workflows),
    runtime: projection(projectionValues.runtime),
    contracts: projection(projectionValues.contracts),
  };
  const source = {
    configDigest: expectedConfigDigest,
    contractDigest: expectedContractDigest,
    generatorVersion: contract.generatorVersion,
  };
  const requiredPlatformCapabilities =
    compileRequiredPlatformCapabilitiesV3(config);
  const result: NativeConfigurationCompilerResult = {
    schemaVersion: PROJECTION_SCHEMA,
    compilerContractVersion: COMPILER_CONTRACT_VERSION,
    appCode,
    source,
    projections,
    requiredPlatformCapabilities,
    aggregateDigest: sha256Canonical({
      schemaVersion: PROJECTION_SCHEMA,
      compilerContractVersion: COMPILER_CONTRACT_VERSION,
      appCode,
      source,
      requiredPlatformCapabilities,
      projectionDigests: Object.fromEntries(
        Object.entries(projections).map(([key, value]) => [key, value.digest])
      ),
    }),
  };
  return deepFreeze(result);
}

/**
 * Derives the platform capability usage closure from the normalized, sealed
 * ConfigurationBundleV3. Manifest declarations are deliberately not an input.
 */
export function compileRequiredPlatformCapabilitiesV3(
  config: JsonObject
): OpenXiangdaRequiredPlatformCapabilityV3[] {
  const roles = config.authz.roles as JsonObject[];
  const resources = config.data.resources as JsonObject[];
  const operations = config.backend.operations as JsonObject[];
  const requiresDirectoryV2 =
    roles.some(role =>
      role.capabilities.some((capability: string) =>
        capability.endsWith(':directory:read')
      )
    ) ||
    resources.some(resource =>
      resource.schema.fields.some((field: JsonObject) =>
        [
          'user.single',
          'user.multiple',
          'department.single',
          'department.multiple',
        ].includes(field.type)
      )
    ) ||
    operations.some(operation => operation.platformAccess?.directory);
  const usesEvents = Boolean(
    config.events.subscriptions.length ||
      config.events.timers.length ||
      config.events.dateTriggers.length ||
      config.events.schemas.length
  );
  const usesManagedFiles =
    operations.some(
      operation =>
        operation.platformAccess?.managedFiles ||
        operation.platformAccess?.managedFileCopies
    ) ||
    config.events.subscriptions.some(
      (subscription: JsonObject) => subscription.platformAccess?.managedFileCopies
    );
  const usesNotification =
    operations.some(operation => operation.platformAccess?.notification) ||
    config.events.subscriptions.some(
      (subscription: JsonObject) => subscription.platformAccess?.notification
    );
  const standardProcessDefinitions = config.workflows.definitions.filter(
    (declaration: JsonObject) =>
      declaration.launch.mode === 'standalone' ||
      declaration.launch.mode === 'hidden-handoff'
  );
  const usesBusinessProcess =
    operations.some(operation => operation.platformAccess?.workflow) ||
    standardProcessDefinitions.length > 0;
  const dataUsage = { resources };
  const authzUsage = {
    perspectives: config.perspectives,
    authz: config.authz,
  };
  const runtimeUsage = {
    schemaVersion: config.schemaVersion,
    appCode: config.appCode,
    frontend: {
      routes: config.frontend.routes,
      user: config.frontend.user,
      admin: config.frontend.admin,
      devicePolicy: config.frontend.devicePolicy,
    },
    backend: {
      // Secret descriptors and request/response schema bodies are excluded.
      // Only routing, authorization and bounded platform dependencies affect
      // the platform capability usage closure.
      operations: operations.map(operation => ({
        code: operation.code,
        method: operation.method,
        path: operation.path,
        capability: operation.capability,
        platformAccess: operation.platformAccess || null,
        ai: operation.ai || null,
      })),
    },
  };
  const usages: Array<{
    code: OpenXiangdaPlatformCapabilityCode;
    declaration: unknown;
  }> = [
    { code: 'application-native-2', declaration: runtimeUsage },
    { code: 'authz.native-batch-explain', declaration: authzUsage },
    { code: 'authz.native-management', declaration: authzUsage },
    {
      code: 'deployment.durable-runs',
      declaration: runtimeUsage.backend,
    },
    {
      code: 'deployment.platform-executor',
      declaration: runtimeUsage.backend,
    },
    {
      code: 'environment.on-demand-production',
      declaration: { environments: ['preproduction', 'production'] },
    },
    {
      code: 'environment.runtime-lifecycle',
      declaration: { environments: ['preproduction', 'production'] },
    },
    ...(resources.length
      ? [
          { code: 'data-api-v2' as const, declaration: dataUsage },
          {
            code: 'data.native-golden-crud' as const,
            declaration: dataUsage,
          },
        ]
      : []),
    ...(resources.some(hasDataAuditReadPolicy)
      ? [{ code: 'data.audit-read-access' as const, declaration: dataUsage }]
      : []),
    ...(requiresDirectoryV2
      ? [
          {
            code: 'directory-v2' as const,
            declaration: {
              roles: roles.map(role => ({
                code: role.code,
                capabilities: role.capabilities.filter((capability: string) =>
                  capability.endsWith(':directory:read')
                ),
              })),
              resources: resources.map(resource => ({
                code: resource.code,
                fields: resource.schema.fields.filter((field: JsonObject) =>
                  [
                    'user.single',
                    'user.multiple',
                    'department.single',
                    'department.multiple',
                  ].includes(field.type)
                ),
              })),
              operations: operations
                .filter(operation => operation.platformAccess?.directory)
                .map(operation => ({
                  code: operation.code,
                  directory: operation.platformAccess.directory,
                })),
            },
          },
        ]
      : []),
    ...(usesManagedFiles
      ? [
          {
            code: 'data.managed-files' as const,
            declaration: {
              operations: operations
                .filter(
                  operation =>
                    operation.platformAccess?.managedFiles ||
                    operation.platformAccess?.managedFileCopies
                )
                .map(operation => ({
                  code: operation.code,
                  ...(operation.platformAccess?.managedFiles
                    ? { managedFiles: operation.platformAccess.managedFiles }
                    : {}),
                  ...(operation.platformAccess?.managedFileCopies
                    ? { managedFileCopies: operation.platformAccess.managedFileCopies }
                    : {}),
                })),
              subscriptions: config.events.subscriptions
                .filter(
                  (subscription: JsonObject) => subscription.platformAccess?.managedFileCopies
                )
                .map((subscription: JsonObject) => ({
                  code: subscription.code,
                  managedFileCopies: subscription.platformAccess.managedFileCopies,
                })),
            },
          },
        ]
      : []),
    ...(config.events.capturePolicies?.length
      ? [{ code: 'events.capture-policy' as const, declaration: config.events.capturePolicies }]
      : []),
    ...(usesEvents
      ? [
          { code: 'events-v2' as const, declaration: config.events },
          {
            code: 'events.durable-receipts' as const,
            declaration: config.events,
          },
        ]
      : []),
    ...(config.workflows.activations.length
      ? [
          {
            code: 'workflow-kernel-v2' as const,
            declaration: config.workflows,
          },
          {
            code: 'workflow.fresh-command-token' as const,
            declaration: config.workflows,
          },
        ]
      : []),
    ...(config.workflows.definitions.some((item: JsonObject) => item.definition.instanceCommands !== undefined)
      ? [{
          code: 'workflow.instance-cancellation-policy' as const,
          declaration: config.workflows.definitions.filter((item: JsonObject) => item.definition.instanceCommands !== undefined),
        }]
      : []),
    ...(usesBusinessProcess
      ? [
          {
            code: 'business-process.durable-command' as const,
            declaration: {
              operations: operations
                .filter(operation => operation.platformAccess?.workflow)
                .map(operation => ({
                  code: operation.code,
                  workflow: operation.platformAccess.workflow,
                })),
              definitions: standardProcessDefinitions,
              activations: config.workflows.activations.filter(
                (activation: JsonObject) =>
                  standardProcessDefinitions.some(
                    (declaration: JsonObject) =>
                      declaration.definition.code === activation.workflowCode
                  )
              ),
            },
          },
        ]
      : []),
    ...(usesNotification
      ? [
          {
            code: 'notification-hub-v2' as const,
            declaration: {
              operations: operations
                .filter(operation => operation.platformAccess?.notification)
                .map(operation => ({
                  code: operation.code,
                  notification: operation.platformAccess.notification,
                })),
              subscriptions: config.events.subscriptions
                .filter(
                  (subscription: JsonObject) =>
                    subscription.platformAccess?.notification
                )
                .map((subscription: JsonObject) => ({
                  code: subscription.code,
                  notification: subscription.platformAccess.notification,
                })),
            },
          },
        ]
      : []),
    ...(config.frontend.authentication
      ? [
          {
            code: 'authentication.application-login-surface' as const,
            declaration: config.frontend.authentication,
          },
        ]
      : []),
    ...(config.frontend.publicAccess
      ? [
          {
            code: 'public-access.anonymous-owner-records' as const,
            declaration: config.frontend.publicAccess,
          },
        ]
      : []),
  ];
  return usages
    .map(({ code, declaration }) => ({
      code,
      contractVersion:
        OPENXIANGDA_V2_PLATFORM_CAPABILITY_CONTRACT_VERSIONS[code],
      usageDigest: `sha256:${sha256Canonical(declaration)}` as const,
    }))
    .sort((left, right) =>
      left.code === right.code ? 0 : left.code < right.code ? -1 : 1
    );
}

export interface NativeEventCapturePlanV2 {
  resourceCode: string;
  filterFields: string[];
  projectionFields: string[];
  authorizationFields: string[];
  captureFields: string[];
  digest: string;
  capturedEventTypes?: string[];
}

/**
 * Compiles the immutable data-event capture closure. The result deliberately
 * depends on event, data, and authorization declarations and is therefore
 * selected at runtime by that same revision tuple.
 */
export function compileNativeEventCapturePlansV2(input: {
  resources: JsonObject[];
  dataPolicies: JsonObject[];
  subscriptions: JsonObject[];
  capturePolicies?: JsonObject[];
}): NativeEventCapturePlanV2[] {
  const capturePolicies = new Map<string, 'all' | 'subscribed'>();
  const resources = new Set(input.resources.map(resource => String(resource.code)));
  for (const [index, raw] of boundedArray(input.capturePolicies === undefined ? [] : input.capturePolicies, '/capturePlan/capturePolicies', 100).entries()) {
    const pointer = `/capturePlan/capturePolicies/${index}`;
    const policy = object(raw, pointer);
    exactKeys(policy, ['resourceCode', 'mode'], pointer);
    const code = resourceCode(policy.resourceCode, `${pointer}/resourceCode`);
    if (!resources.has(code)) fail('NATIVE_EVENT_CAPTURE_RESOURCE_NOT_FOUND', pointer, { resourceCode: code });
    if (capturePolicies.has(code)) fail('NATIVE_EVENT_CAPTURE_POLICY_DUPLICATE', pointer, { resourceCode: code });
    if (policy.mode !== 'all' && policy.mode !== 'subscribed') fail('NATIVE_EVENT_CAPTURE_MODE_INVALID', `${pointer}/mode`);
    capturePolicies.set(code, policy.mode);
  }
  const policies = new Map(
    input.dataPolicies.map((raw, index) => {
      const policy = object(raw, `/capturePlan/dataPolicies/${index}`);
      return [String(policy.code), policy];
    })
  );
  const subscriptions = input.subscriptions.map((raw, index) =>
    object(raw, `/capturePlan/subscriptions/${index}`)
  );
  return input.resources
    .map((raw, resourceIndex) => {
      const pointer = `/capturePlan/resources/${resourceIndex}`;
      const resource = object(raw, pointer);
      const code = resourceCode(resource.code, `${pointer}/code`);
      const schema = resource.schema
        ? object(resource.schema, `${pointer}/schema`)
        : resource;
      const fields = new Set(
        boundedArray(schema.fields || [], `${pointer}/schema/fields`, 500).map(
          (rawField, fieldIndex) =>
            fieldCodeValue(
              object(rawField, `${pointer}/schema/fields/${fieldIndex}`).code,
              `${pointer}/schema/fields/${fieldIndex}/code`
            )
        )
      );
      const policyCode = resource.dataPolicyCode
        ? stableCode(resource.dataPolicyCode, `${pointer}/dataPolicyCode`)
        : null;
      const policy = policyCode ? policies.get(policyCode) : undefined;
      if (policyCode && !policy) {
        fail('NATIVE_EVENT_CAPTURE_AUTHZ_POLICY_NOT_FOUND', pointer, {
          resourceCode: code,
          dataPolicyCode: policyCode,
        });
      }
      const authorizationFields = new Set<string>();
      for (const rule of policy?.rules || []) {
        authorizationFields.add(String(rule.field));
      }
      if (policy?.readExpression) {
        for (const entry of nativeDataPolicyExpressionLeavesV2(
          policy.readExpression,
          `${pointer}/readExpression`
        )) {
          authorizationFields.add(String(entry.rule.field));
        }
      }
      const filterFields = new Set<string>();
      const projectionFields = new Set<string>();
      const capturedEventTypes = new Set<string>();
      for (const [subscriptionIndex, subscription] of subscriptions.entries()) {
        const eventTypes = boundedArray(
          subscription.eventTypes,
          `/capturePlan/subscriptions/${subscriptionIndex}/eventTypes`,
          20
        ).map(String);
        if (!eventTypes.some(type => type.startsWith('openxiangda.data.'))) {
          continue;
        }
        const filter = object(
          subscription.filter || {},
          `/capturePlan/subscriptions/${subscriptionIndex}/filter`
        );
        const selectedResources = Array.isArray(filter.resourceCodes)
          ? filter.resourceCodes.map(String)
          : [];
        if (selectedResources.length && !selectedResources.includes(code)) {
          continue;
        }
        for (const type of eventTypes) {
          if ((DATA_EVENT_TYPES_V2 as readonly string[]).includes(type)) capturedEventTypes.add(type);
        }
        for (const field of eventCaptureFilterFieldsV2(
          filter,
          `/capturePlan/subscriptions/${subscriptionIndex}/filter`
        )) {
          filterFields.add(field);
        }
        const payload = object(
          subscription.payload || {},
          `/capturePlan/subscriptions/${subscriptionIndex}/payload`
        );
        for (const field of boundedArray(
          payload.fields || [],
          `/capturePlan/subscriptions/${subscriptionIndex}/payload/fields`,
          32
        )) {
          projectionFields.add(
            fieldCodeValue(
              field,
              `/capturePlan/subscriptions/${subscriptionIndex}/payload/fields`
            )
          );
        }
      }
      const publicFields = new Set([...filterFields, ...projectionFields]);
      const captureFields = new Set([...publicFields, ...authorizationFields]);
      if (captureFields.size > EVENT_CAPTURE_FIELD_LIMIT) {
        fail('NATIVE_EVENT_CAPTURE_FIELDS_LIMIT', pointer, {
          resourceCode: code,
          maximum: EVENT_CAPTURE_FIELD_LIMIT,
        });
      }
      for (const field of captureFields) {
        if (
          !fields.has(field) &&
          !(
            authorizationFields.has(field) &&
            EVENT_AUTHORIZATION_SYSTEM_FIELDS.has(field)
          )
        ) {
          fail('NATIVE_EVENT_CAPTURE_FIELD_NOT_FOUND', pointer, {
            resourceCode: code,
            field,
          });
        }
      }
      const fieldPolicies = object(
        resource.fieldPolicies || {},
        `${pointer}/fieldPolicies`
      );
      for (const field of publicFields) {
        if (fieldPolicies[field]?.mask === 'omit') {
          fail('NATIVE_EVENT_CAPTURE_FIELD_SENSITIVE', pointer, {
            resourceCode: code,
            field,
          });
        }
      }
      const plan = {
        resourceCode: code,
        ...(capturePolicies.get(code) === 'subscribed'
          ? { capturedEventTypes: [...capturedEventTypes].sort() }
          : {}),
        filterFields: [...filterFields].sort(),
        projectionFields: [...projectionFields].sort(),
        authorizationFields: [...authorizationFields].sort(),
        captureFields: [...captureFields].sort(),
      };
      return { ...plan, digest: sha256Canonical(plan) };
    })
    .sort((left, right) => left.resourceCode.localeCompare(right.resourceCode));
}

function eventCaptureFilterFieldsV2(filter: JsonObject, pointer: string) {
  const fields = new Set<string>();
  for (const [index, raw] of boundedArray(
    filter.changes || [],
    `${pointer}/changes`,
    16
  ).entries()) {
    const change = object(raw, `${pointer}/changes/${index}`);
    fields.add(
      fieldCodeValue(change.field, `${pointer}/changes/${index}/field`)
    );
  }
  const changedFields = object(
    filter.changedFields || {},
    `${pointer}/changedFields`
  );
  for (const key of ['anyOf', 'allOf', 'noneOf']) {
    for (const [index, field] of boundedArray(
      changedFields[key] || [],
      `${pointer}/changedFields/${key}`,
      32
    ).entries()) {
      fields.add(
        fieldCodeValue(field, `${pointer}/changedFields/${key}/${index}`)
      );
    }
  }
  let atoms = 0;
  const visit = (raw: unknown, path: string, depth: number) => {
    if (depth > 3) fail('NATIVE_EVENT_FILTER_DEPTH_LIMIT', path);
    const condition = object(raw, path);
    if (condition.change) {
      const change = object(condition.change, `${path}/change`);
      fields.add(fieldCodeValue(change.field, `${path}/change/field`));
      atoms += 1;
      return;
    }
    if (condition.not) {
      visit(condition.not, `${path}/not`, depth + 1);
      return;
    }
    const branchKey = condition.all ? 'all' : condition.any ? 'any' : null;
    if (!branchKey) fail('NATIVE_EVENT_FILTER_CONDITION_INVALID', path);
    for (const [index, child] of boundedArray(
      condition[branchKey],
      `${path}/${branchKey}`,
      16
    ).entries()) {
      visit(child, `${path}/${branchKey}/${index}`, depth + 1);
    }
  };
  if (filter.where) visit(filter.where, `${pointer}/where`, 1);
  atoms += Array.isArray(filter.changes) ? filter.changes.length : 0;
  if (atoms > 16) fail('NATIVE_EVENT_FILTER_ATOM_LIMIT', pointer);
  return [...fields].sort();
}

function validateConfigurationEnvelope(config: JsonObject, appCode: string) {
  exactKeys(
    config,
    [
      'schemaVersion',
      'compilerContractVersion',
      'appCode',
      'perspectives',
      'authz',
      'backend',
      'data',
      'events',
      'workflows',
      'frontend',
      'runtime',
    ],
    '/config'
  );
  equal(config.schemaVersion, CONFIG_SCHEMA, '/config/schemaVersion');
  equal(
    config.compilerContractVersion,
    COMPILER_CONTRACT_VERSION,
    '/config/compilerContractVersion'
  );
  equal(config.appCode, appCode, '/config/appCode');
  boundedArray(config.perspectives, '/config/perspectives', 100);
  const authz = object(config.authz, '/config/authz');
  exactKeys(
    authz,
    [
      'capabilities',
      'roles',
      'scopeDimensions',
      'scopeSources',
      'roleMembershipSources',
      'relationshipGrantSources',
      'dataPolicies',
      'authorizationTransitions',
    ],
    '/config/authz',
    ['authenticatedUserRoleCode']
  );
  boundedArray(authz.capabilities, '/config/authz/capabilities', 2000);
  boundedArray(authz.roles, '/config/authz/roles', 100);
  boundedArray(authz.scopeDimensions, '/config/authz/scopeDimensions', 100);
  boundedArray(authz.scopeSources, '/config/authz/scopeSources', 100);
  boundedArray(
    authz.roleMembershipSources,
    '/config/authz/roleMembershipSources',
    100
  );
  boundedArray(
    authz.relationshipGrantSources,
    '/config/authz/relationshipGrantSources',
    100
  );
  boundedArray(authz.dataPolicies, '/config/authz/dataPolicies', 100);
  boundedArray(
    authz.authorizationTransitions,
    '/config/authz/authorizationTransitions',
    100
  );

  const backend = object(config.backend, '/config/backend');
  exactKeys(backend, ['secrets', 'operations'], '/config/backend');
  boundedArray(backend.secrets, '/config/backend/secrets', 100);
  boundedArray(backend.operations, '/config/backend/operations', 500);
  validateBackendSecrets(backend.secrets);

  const data = object(config.data, '/config/data');
  exactKeys(data, ['resources'], '/config/data', ['resourceDetailRoutes']);
  boundedArray(data.resources, '/config/data/resources', 100);
  if (data.resourceDetailRoutes !== undefined) {
    boundedArray(
      data.resourceDetailRoutes,
      '/config/data/resourceDetailRoutes',
      100
    );
  }

  const events = object(config.events, '/config/events');
  exactKeys(
    events,
    ['schemas', 'subscriptions', 'timers', 'dateTriggers'],
    '/config/events',
    ['capturePolicies']
  );
  boundedArray(events.schemas, '/config/events/schemas', 100);
  boundedArray(events.subscriptions, '/config/events/subscriptions', 100);
  boundedArray(events.timers, '/config/events/timers', 100);
  boundedArray(events.dateTriggers, '/config/events/dateTriggers', 100);

  const workflows = object(config.workflows, '/config/workflows');
  exactKeys(
    workflows,
    [
      'definitions',
      'bindings',
      'activations',
      'providers',
      'editableParameters',
    ],
    '/config/workflows'
  );
  boundedArray(workflows.definitions, '/config/workflows/definitions', 100);
  boundedArray(workflows.bindings, '/config/workflows/bindings', 100);
  boundedArray(workflows.activations, '/config/workflows/activations', 100);
  boundedArray(workflows.providers, '/config/workflows/providers', 100);
  boundedArray(
    workflows.editableParameters,
    '/config/workflows/editableParameters',
    100
  );

  const frontend = object(config.frontend, '/config/frontend');
  exactKeys(
    frontend,
    ['routes', 'user', 'admin', 'devicePolicy'],
    '/config/frontend',
    ['authentication', 'publicAccess']
  );
  boundedArray(frontend.routes, '/config/frontend/routes', 500);
  const user = object(frontend.user, '/config/frontend/user');
  exactKeys(user, ['applicationTodoCenter'], '/config/frontend/user');
  boolean(
    user.applicationTodoCenter,
    '/config/frontend/user/applicationTodoCenter'
  );
  validateDevicePolicy(frontend.devicePolicy, '/config/frontend/devicePolicy');
  if (Object.prototype.hasOwnProperty.call(frontend, 'authentication')) {
    validateApplicationAuthentication(
      frontend.authentication,
      frontend.routes,
      config,
      '/config/frontend/authentication'
    );
  }
  if (Object.prototype.hasOwnProperty.call(frontend, 'publicAccess')) {
    validateAnonymousPublicAccess(
      frontend.publicAccess,
      config,
      '/config/frontend/publicAccess'
    );
  }
  const admin = object(frontend.admin, '/config/frontend/admin');
  exactKeys(admin, ['navigation'], '/config/frontend/admin', ['access']);
  if (admin.access !== undefined) {
    normalizeAccessExpression(
      admin.access,
      '/config/frontend/admin/access',
      config.appCode
    );
  }
  validateAdminNavigationDeclaration(
    admin.navigation,
    '/config/frontend/admin/navigation'
  );

  const runtime = object(config.runtime, '/config/runtime');
  exactKeys(runtime, ['protocolCapabilities', 'health'], '/config/runtime');
  uniqueStrings(
    runtime.protocolCapabilities,
    '/config/runtime/protocolCapabilities',
    100
  );
  exactKeys(
    object(runtime.health, '/config/runtime/health'),
    ['livePath', 'readyPath', 'versionPath'],
    '/config/runtime/health'
  );
  equal(
    runtime.health.livePath,
    '/__platform/health',
    '/config/runtime/health/livePath'
  );
  equal(
    runtime.health.readyPath,
    '/__platform/ready',
    '/config/runtime/health/readyPath'
  );
  equal(
    runtime.health.versionPath,
    '/__platform/version',
    '/config/runtime/health/versionPath'
  );
}

function validateContractEnvelope(
  contract: JsonObject,
  appCode: string,
  configDigest: string
) {
  exactKeys(
    contract,
    [
      'schemaVersion',
      'compilerContractVersion',
      'generatorVersion',
      'appCode',
      'configDigest',
      'perspectives',
      'resources',
      'capabilities',
      'operations',
      'eventConsumers',
      'eventProducers',
      'eventSchemas',
      'eventHandlerManifest',
      'eventTypes',
      'workflows',
      'routes',
      'routeManifest',
      'adminPages',
      'adminNavigation',
    ],
    '/contracts',
    ['authentication', 'publicAccess', 'adminAccess']
  );
  equal(contract.schemaVersion, CONTRACT_SCHEMA, '/contracts/schemaVersion');
  equal(
    contract.compilerContractVersion,
    COMPILER_CONTRACT_VERSION,
    '/contracts/compilerContractVersion'
  );
  requiredString(contract.generatorVersion, '/contracts/generatorVersion', 128);
  equal(contract.appCode, appCode, '/contracts/appCode');
  equal(contract.configDigest, configDigest, '/contracts/configDigest');
  boundedArray(
    contract.perspectives,
    '/contracts/perspectives',
    NATIVE_CONTRACT_CAPACITY_V2.perspectives
  );
  boundedArray(
    contract.resources,
    '/contracts/resources',
    NATIVE_CONTRACT_CAPACITY_V2.resources
  );
  boundedArray(
    contract.capabilities,
    '/contracts/capabilities',
    NATIVE_CONTRACT_CAPACITY_V2.capabilities
  );
  boundedArray(
    contract.operations,
    '/contracts/operations',
    NATIVE_CONTRACT_CAPACITY_V2.operations
  );
  boundedArray(
    contract.eventConsumers,
    '/contracts/eventConsumers',
    NATIVE_CONTRACT_CAPACITY_V2.eventConsumers
  );
  boundedArray(
    contract.eventProducers,
    '/contracts/eventProducers',
    NATIVE_CONTRACT_CAPACITY_V2.eventProducers
  );
  boundedArray(
    contract.eventSchemas,
    '/contracts/eventSchemas',
    NATIVE_CONTRACT_CAPACITY_V2.eventSchemas
  );
  object(contract.eventHandlerManifest, '/contracts/eventHandlerManifest');
  uniqueStrings(
    contract.eventTypes,
    '/contracts/eventTypes',
    NATIVE_CONTRACT_CAPACITY_V2.eventTypes
  );
  boundedArray(
    contract.workflows,
    '/contracts/workflows',
    NATIVE_CONTRACT_CAPACITY_V2.workflows
  );
  boundedArray(
    contract.routes,
    '/contracts/routes',
    NATIVE_CONTRACT_CAPACITY_V2.routes
  );
  if (Object.prototype.hasOwnProperty.call(contract, 'authentication')) {
    validateApplicationAuthenticationContract(
      contract.authentication,
      '/contracts/authentication'
    );
  }
  if (Object.prototype.hasOwnProperty.call(contract, 'publicAccess')) {
    validateAnonymousPublicAccessContract(
      contract.publicAccess,
      '/contracts/publicAccess'
    );
  }
  if (Object.prototype.hasOwnProperty.call(contract, 'adminAccess')) {
    normalizeAccessExpression(
      contract.adminAccess,
      '/contracts/adminAccess',
      appCode
    );
  }
  validateRouteManifest(
    contract.routeManifest,
    '/contracts/routeManifest',
    appCode
  );
  validateAdminPageContracts(contract.adminPages, '/contracts/adminPages');
  validateAdminNavigationContracts(
    contract.adminNavigation,
    '/contracts/adminNavigation'
  );
}

function compileExpectedContract(
  config: JsonObject,
  configDigest: string,
  generatorVersion: string
) {
  const capabilities = compileCapabilities(config);
  validateAuthorizationReferences(config, capabilities);
  validateDataFieldReferences(config);
  validateDataPolicyReferences(config);
  validateWorkflowReferences(config);
  const eventSchemas = config.events.schemas.map((item: any, index: number) => {
    const pointer = `/config/events/schemas/${index}`;
    const schema = object(item, pointer);
    const eventType = requiredString(
      schema.eventType,
      `${pointer}/eventType`,
      255
    );
    if (eventType.startsWith('openxiangda.')) {
      fail('NATIVE_EVENT_SCHEMA_RESERVED', `${pointer}/eventType`, {
        eventType,
      });
    }
    equal(
      schema.schemaDigest,
      sha256Canonical(object(schema.jsonSchema, `${pointer}/jsonSchema`)),
      `${pointer}/schemaDigest`
    );
    return schema;
  });
  const allowedEventTypes = new Set<string>([
    ...DATA_EVENT_TYPES_V2,
    ...WORKFLOW_EVENT_TYPES_V2,
    ...eventSchemas.map((schema: JsonObject) => String(schema.eventType)),
  ]);
  const eventResourceFields = new Map<string, Map<string, string>>(
    (config.data.resources as JsonObject[]).map(resource => [
      String(resource.code),
      new Map(
        ((resource.schema as JsonObject).fields as JsonObject[]).map(field => [
          String(field.code),
          String(field.type),
        ])
      ),
    ])
  );
  const eventConsumers = sorted(
    config.events.subscriptions.map((item: any, index: number) => {
      const pointer = `/config/events/subscriptions/${index}`;
      const subscription = object(item, pointer);
      const eventTypes = uniqueStrings(
        subscription.eventTypes,
        `${pointer}/eventTypes`,
        20
      );
      eventTypes.forEach((eventType, eventIndex) => {
        if (!allowedEventTypes.has(eventType)) {
          fail(
            'NATIVE_EVENT_TYPE_NOT_REGISTERED',
            `${pointer}/eventTypes/${eventIndex}`,
            { eventType }
          );
        }
      });
      const delivery = validateEventDeliveryPolicy(
        subscription.delivery,
        eventTypes,
        `${pointer}/delivery`
      );
      const platformAccess = validateEventSubscriptionPlatformAccess(
        subscription.platformAccess,
        `${pointer}/platformAccess`,
        eventResourceFields
      );
      return {
        code: stableCode(subscription.code, `${pointer}/code`),
        endpointPath: absolutePath(
          subscription.endpointPath,
          `${pointer}/endpointPath`
        ),
        eventTypes,
        filter: object(subscription.filter, `${pointer}/filter`),
        payload: object(subscription.payload, `${pointer}/payload`),
        ...(platformAccess ? { platformAccess } : {}),
        delivery,
      };
    }),
    (item: JsonObject) => item.code
  );
  const applicationSchemaVersions = new Map(
    eventSchemas.map((schema: JsonObject) => [
      String(schema.eventType),
      String(schema.dataSchemaVersion),
    ])
  );
  const eventProducers = sorted(
    [
      ...config.data.resources.flatMap((resource: JsonObject) =>
        DATA_EVENT_TYPES_V2.map(eventType => ({
          code: `data:${resource.code}:${eventType}`,
          source: 'data',
          eventType,
          dataSchemaVersion: '2.0.0',
          resourceCode: resource.code,
        }))
      ),
      ...eventSchemas.map((schema: JsonObject) => ({
        code: `app:${schema.eventType}`,
        source: 'app',
        eventType: schema.eventType,
        dataSchemaVersion: schema.dataSchemaVersion,
      })),
      ...config.events.timers.map((timer: JsonObject) => ({
        code: timer.code,
        source: 'timer',
        eventType: timer.eventType,
        dataSchemaVersion:
          applicationSchemaVersions.get(String(timer.eventType)) || '2.0.0',
      })),
      ...config.events.dateTriggers.map((trigger: JsonObject) => ({
        code: trigger.code,
        source: 'date',
        eventType: trigger.eventType,
        dataSchemaVersion:
          applicationSchemaVersions.get(String(trigger.eventType)) || '2.0.0',
        resourceCode: trigger.resourceCode,
        field: trigger.field,
      })),
      ...(config.workflows.activations.length
        ? WORKFLOW_EVENT_TYPES_V2.map(eventType => ({
            code: `workflow:${eventType}`,
            source: 'workflow',
            eventType,
            dataSchemaVersion: '2.0.0',
          }))
        : []),
    ],
    (item: JsonObject) => `${item.source}:${item.code}:${item.eventType}`
  );
  const eventTypes = uniqueSorted([
    ...eventConsumers.flatMap(item => item.eventTypes),
    ...eventProducers.map(item => String(item.eventType)),
  ]);
  validateAdminNavigationReferences(config);
  const adminPages = compileAdminPages(config);
  return {
    schemaVersion: CONTRACT_SCHEMA,
    compilerContractVersion: COMPILER_CONTRACT_VERSION,
    generatorVersion,
    appCode: config.appCode,
    configDigest,
    perspectives: config.perspectives,
    resources: compileResources(config),
    capabilities: sorted(capabilities, item => item.code),
    operations: compileOperations(config),
    eventConsumers,
    eventProducers,
    eventSchemas,
    eventHandlerManifest: {
      schemaVersion: EVENT_HANDLER_MANIFEST_SCHEMA,
      appCode: config.appCode,
      handlers: eventConsumers.map(consumer => ({
        code: consumer.code,
        endpointPath: consumer.endpointPath,
        eventTypes: consumer.eventTypes,
        dataSchemaVersions: uniqueSorted(
          consumer.eventTypes.map((eventType: string) =>
            eventType.startsWith('openxiangda.')
              ? '2.0.0'
              : applicationSchemaVersions.get(eventType) || '2.0.0'
          )
        ),
        maxBodyBytes: 65536,
        receiptProtocolVersion: 2,
      })),
    },
    eventTypes,
    workflows: compileWorkflows(config),
    routes: compileRoutes(config),
    ...(Object.prototype.hasOwnProperty.call(config.frontend, 'authentication')
      ? { authentication: compileApplicationAuthentication(config) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(config.frontend, 'publicAccess')
      ? { publicAccess: compileAnonymousPublicAccess(config) }
      : {}),
    ...(config.frontend.admin.access
      ? { adminAccess: config.frontend.admin.access }
      : {}),
    routeManifest: compileRouteManifest(config),
    adminPages,
    adminNavigation: compileAdminNavigation(config),
  };
}

function validateEventSubscriptionPlatformAccess(
  value: unknown,
  pointer: string,
  declaredResources: Map<string, Map<string, string>>
) {
  if (value === undefined) return undefined;
  const access = object(value, pointer);
  exactKeys(access, ['notification', 'managedFileCopies'], pointer, true);
  const result: JsonObject = {};
  if (access.notification !== undefined) {
    const notification = object(access.notification, `${pointer}/notification`);
    exactKeys(notification, ['mode'], `${pointer}/notification`);
    equal(notification.mode, 'business-standard', `${pointer}/notification/mode`);
    result.notification = { mode: 'business-standard' };
  }
  if (access.managedFileCopies !== undefined) {
    const entries = boundedArray(
      access.managedFileCopies,
      `${pointer}/managedFileCopies`,
      16
    );
    if (!entries.length) fail('NATIVE_EVENT_MANAGED_FILE_COPIES_REQUIRED', `${pointer}/managedFileCopies`);
    const keys = new Set<string>();
    result.managedFileCopies = sorted(
      entries.map((raw, index) => {
        const entryPointer = `${pointer}/managedFileCopies/${index}`;
        const entry = object(raw, entryPointer);
        exactKeys(
          entry,
          ['mode', 'sourceResourceCode', 'sourceFieldCodes', 'targetResourceCode', 'targetFieldCodes'],
          entryPointer
        );
        equal(entry.mode, 'copy', `${entryPointer}/mode`);
        const sourceCode = resourceCode(entry.sourceResourceCode, `${entryPointer}/sourceResourceCode`);
        const targetCode = resourceCode(entry.targetResourceCode, `${entryPointer}/targetResourceCode`);
        const source = declaredResources.get(sourceCode);
        const target = declaredResources.get(targetCode);
        if (!source || !target) fail('NATIVE_EVENT_MANAGED_FILE_COPY_RESOURCE_INVALID', entryPointer);
        const sourceFields = uniqueStrings(entry.sourceFieldCodes, `${entryPointer}/sourceFieldCodes`, 16);
        const targetFields = uniqueStrings(entry.targetFieldCodes, `${entryPointer}/targetFieldCodes`, 16);
        if (!sourceFields.length || sourceFields.length !== targetFields.length) {
          fail('NATIVE_EVENT_MANAGED_FILE_COPY_FIELDS_INVALID', entryPointer);
        }
        sourceFields.forEach((field, fieldIndex) => {
          const sourceType = source!.get(field);
          const targetType = target!.get(targetFields[fieldIndex]!);
          if (!['file', 'image'].includes(String(sourceType)) || sourceType !== targetType) {
            fail('NATIVE_EVENT_MANAGED_FILE_COPY_FIELD_INVALID', `${entryPointer}/sourceFieldCodes/${fieldIndex}`);
          }
        });
        const key = `${sourceCode}:${sourceFields.join(',')}=>${targetCode}:${targetFields.join(',')}`;
        if (keys.has(key)) fail('NATIVE_EVENT_MANAGED_FILE_COPY_DUPLICATE', entryPointer);
        keys.add(key);
        return {
          mode: 'copy',
          sourceResourceCode: sourceCode,
          sourceFieldCodes: uniqueSorted(sourceFields),
          targetResourceCode: targetCode,
          targetFieldCodes: uniqueSorted(targetFields),
        };
      }),
      item => `${item.sourceResourceCode}:${item.sourceFieldCodes.join(',')}=>${item.targetResourceCode}:${item.targetFieldCodes.join(',')}`
    );
  }
  if (!Object.keys(result).length) fail('NATIVE_EVENT_PLATFORM_ACCESS_EMPTY', pointer);
  return result;
}

function validateEventDeliveryPolicy(
  value: unknown,
  eventTypes: string[],
  pointer: string
) {
  const delivery = object(value, pointer);
  exactKeys(
    delivery,
    [
      'timeoutMs',
      'maxAttempts',
      'initialBackoffMs',
      'maxBackoffMs',
      'ordering',
      'concurrency',
    ],
    pointer
  );
  boundedInteger(delivery.timeoutMs, `${pointer}/timeoutMs`, 1000, 30000);
  boundedInteger(delivery.maxAttempts, `${pointer}/maxAttempts`, 1, 12);
  const initialBackoffMs = boundedInteger(
    delivery.initialBackoffMs,
    `${pointer}/initialBackoffMs`,
    1000,
    300000
  );
  boundedInteger(
    delivery.maxBackoffMs,
    `${pointer}/maxBackoffMs`,
    initialBackoffMs,
    1800000
  );
  boundedInteger(delivery.concurrency, `${pointer}/concurrency`, 1, 50);
  const ordering = requiredString(delivery.ordering, `${pointer}/ordering`, 32);
  if (!['none', 'record', 'workflow-instance'].includes(ordering)) {
    fail('NATIVE_EVENT_DELIVERY_ORDERING_INVALID', `${pointer}/ordering`);
  }
  if (
    ordering === 'workflow-instance' &&
    eventTypes.some(eventType => !WORKFLOW_EVENT_TYPE_SET_V2.has(eventType))
  ) {
    fail(
      'NATIVE_EVENT_WORKFLOW_ORDERING_REQUIRES_WORKFLOW_FACTS',
      `${pointer}/ordering`
    );
  }
  return delivery;
}

function compileCapabilities(config: JsonObject) {
  const catalog = new Map<string, JsonObject>();
  for (const capability of platformCapabilities(config.appCode)) {
    catalog.set(capability.code, capability);
  }
  for (const [index, raw] of config.authz.capabilities.entries()) {
    const pointer = `/config/authz/capabilities/${index}`;
    const item = object(raw, pointer);
    exactKeys(item, ['code', 'kind', 'name', 'description'], pointer, true);
    const code = capabilityCode(item.code, `${pointer}/code`, config.appCode);
    if (catalog.has(code))
      fail('NATIVE_CAPABILITY_DUPLICATE', `${pointer}/code`);
    if (!['backend', 'ui'].includes(item.kind)) {
      fail('NATIVE_CAPABILITY_KIND_INVALID', `${pointer}/kind`);
    }
    const capability = {
      code,
      kind: item.kind,
      name: requiredString(item.name, `${pointer}/name`, 255),
      source: 'explicit',
      ...(item.description === undefined
        ? {}
        : {
            description: optionalString(
              item.description,
              `${pointer}/description`,
              2000
            ),
          }),
    };
    catalog.set(code, capability);
  }
  for (const [resourceIndex, raw] of config.data.resources.entries()) {
    const pointer = `/config/data/resources/${resourceIndex}`;
    const resource = validateResource(raw, pointer, config.appCode);
    const operationNames: Record<string, string> = {
      read: `读取${resource.name}`,
      create: `新建${resource.name}`,
      update: `更新${resource.name}`,
      delete: `删除${resource.name}`,
    };
    for (const operation of ['read', 'create', 'update', 'delete']) {
      const code = capabilityCode(
        resource.capabilities[operation],
        `${pointer}/capabilities/${operation}`,
        config.appCode
      );
      if (catalog.has(code)) {
        fail(
          'NATIVE_CAPABILITY_DUPLICATE',
          `${pointer}/capabilities/${operation}`
        );
      }
      catalog.set(code, {
        code,
        kind: 'data',
        name: operationNames[operation],
        source: 'data',
      });
    }
    for (const [fieldCode, rawPolicy] of Object.entries(
      resource.fieldPolicies
    )) {
      if (isDataAuditMetadataField(fieldCode)) continue;
      const policy = object(rawPolicy, `${pointer}/fieldPolicies/${fieldCode}`);
      for (const operation of ['read', 'create', 'update']) {
        if (!Array.isArray(policy[operation])) continue;
        for (const code of uniqueStrings(
          policy[operation],
          `${pointer}/fieldPolicies/${fieldCode}/${operation}`,
          2000
        )) {
          capabilityCode(
            code,
            `${pointer}/fieldPolicies/${fieldCode}/${operation}`,
            config.appCode
          );
          if (catalog.has(code)) continue;
          catalog.set(code, {
            code,
            kind: 'data',
            name: `${resource.name}.${fieldCode}.${operation}`,
            source: 'data',
          });
        }
      }
    }
  }
  return [...catalog.values()];
}

function compileResources(config: JsonObject) {
  const detailRouteByResourceCode = compileResourceDetailRoutes(config);
  return sorted(
    config.data.resources.map((raw: any, index: number) => {
      const resource = validateResource(
        raw,
        `/config/data/resources/${index}`,
        config.appCode
      );
      const detailRouteCode = detailRouteByResourceCode.get(resource.code);
      return {
        code: resource.code,
        schemaDigest: sha256Canonical(resource.schema),
        fields: sorted(
          resource.schema.fields.map((field: JsonObject) => ({
            code: field.code,
            type: field.type,
          })),
          (field: { code: string; type: string }) => field.code
        ),
        ...(detailRouteCode ? { detailRouteCode } : {}),
      };
    }),
    (item: JsonObject) => item.code
  );
}

function compileResourceDetailRoutes(config: JsonObject) {
  const declarations =
    config.data.resourceDetailRoutes === undefined
      ? []
      : boundedArray(
          config.data.resourceDetailRoutes,
          '/config/data/resourceDetailRoutes',
          100
        );
  const resourcesByCode = new Map<string, JsonObject>(
    config.data.resources.map((raw: unknown, index: number) => {
      const pointer = `/config/data/resources/${index}`;
      const resource = validateResource(raw, pointer, config.appCode);
      return [resource.code, resource];
    })
  );
  const routesByCode = new Map<string, JsonObject>(
    compileRoutes(config).map((route: JsonObject) => [
      String(route.code),
      route,
    ])
  );
  const result = new Map<string, { desktop: string; mobile: string }>();
  for (const [index, raw] of declarations.entries()) {
    const pointer = `/config/data/resourceDetailRoutes/${index}`;
    const declaration = object(raw, pointer);
    exactKeys(declaration, ['resourceCode', 'desktop', 'mobile'], pointer);
    const resourceCodeValue = resourceCode(
      declaration.resourceCode,
      `${pointer}/resourceCode`
    );
    if (result.has(resourceCodeValue)) {
      fail(
        'NATIVE_DATA_RESOURCE_DETAIL_ROUTE_DUPLICATE',
        `${pointer}/resourceCode`
      );
    }
    const resource = resourcesByCode.get(resourceCodeValue);
    if (!resource) {
      fail(
        'NATIVE_DATA_RESOURCE_DETAIL_ROUTE_RESOURCE_MISSING',
        `${pointer}/resourceCode`
      );
    }
    const desktop = stableCode(declaration.desktop, `${pointer}/desktop`);
    const mobile = stableCode(declaration.mobile, `${pointer}/mobile`);
    if (desktop === mobile) {
      fail('NATIVE_DATA_RESOURCE_DETAIL_ROUTE_INVALID', pointer);
    }
    const readCapability = String(resource.capabilities.read);
    for (const [device, routeCode] of [
      ['desktop', desktop],
      ['mobile', mobile],
    ] as const) {
      const routePointer = `${pointer}/${device}`;
      const route = routesByCode.get(routeCode);
      if (!route) {
        fail(
          'NATIVE_DATA_RESOURCE_DETAIL_ROUTE_REFERENCE_MISSING',
          routePointer
        );
      }
      if (route.surface !== 'user') {
        fail('NATIVE_DATA_RESOURCE_DETAIL_ROUTE_SURFACE_INVALID', routePointer);
      }
      const routePath = absolutePath(route.path, `${routePointer}/path`);
      const parameters = [
        ...routePath.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g),
      ];
      const wrongDeviceFamily =
        device === 'mobile'
          ? !routePath.startsWith('/m/')
          : routePath === '/m' || routePath.startsWith('/m/');
      if (
        routePath.includes('*') ||
        routePath.includes('?') ||
        routePath.includes('#') ||
        routePath.split('/').includes('..') ||
        parameters.length !== 1 ||
        wrongDeviceFamily
      ) {
        fail('NATIVE_DATA_RESOURCE_DETAIL_ROUTE_PATH_INVALID', routePointer);
      }
      const allOf = Array.isArray(route.access?.allOf)
        ? route.access.allOf
        : [];
      if (
        route.capability !== readCapability &&
        !allOf.includes(readCapability)
      ) {
        fail(
          'NATIVE_DATA_RESOURCE_DETAIL_ROUTE_CAPABILITY_INVALID',
          routePointer
        );
      }
    }
    result.set(resourceCodeValue, { desktop, mobile });
  }
  return result;
}

function compileOperations(config: JsonObject) {
  const declaredResources = new Map<string, Map<string, string>>(
    config.data.resources.map((resource: JsonObject, resourceIndex: number) => {
      const pointer = `/config/data/resources/${resourceIndex}`;
      const declaration = validateResource(resource, pointer, config.appCode);
      return [
        declaration.code,
        new Map<string, string>(
          declaration.schema.fields.map((field: JsonObject) => [
            String(field.code),
            String(field.type),
          ])
        ),
      ];
    })
  );
  const declaredResourceCodes = new Set(declaredResources.keys());
  const declaredWorkflowCodes = new Set<string>(
    config.workflows.activations.map((entry: JsonObject, index: number) =>
      workflowCodeValue(
        object(entry, `/config/workflows/activations/${index}`).workflowCode,
        `/config/workflows/activations/${index}/workflowCode`
      )
    )
  );
  return sorted(
    config.backend.operations.map((raw: any, index: number) => {
      const pointer = `/config/backend/operations/${index}`;
      const operation = object(raw, pointer);
      exactKeys(
        operation,
        [
          'code',
          'method',
          'path',
          'capability',
          'requestSchema',
          'responseSchema',
          'description',
          'platformAccess',
          'ai',
        ],
        pointer,
        true
      );
      const method = requiredString(operation.method, `${pointer}/method`, 16);
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        fail('NATIVE_OPERATION_METHOD_INVALID', `${pointer}/method`);
      }
      const code = stableCode(operation.code, `${pointer}/code`);
      validateBackendOperationAi(
        operation.ai,
        pointer,
        code,
        method,
        declaredResourceCodes
      );
      const platformAccess = validateOperationPlatformAccess(
        operation.platformAccess,
        `${pointer}/platformAccess`,
        declaredResources,
        declaredWorkflowCodes,
        new Set<string>(config.authz.roles.map((role: JsonObject) => String(role.code)))
      );
      return {
        code,
        method,
        path: absolutePath(operation.path, `${pointer}/path`),
        requiredCapability: capabilityCode(
          operation.capability,
          `${pointer}/capability`,
          config.appCode
        ),
        requestSchemaDigest: sha256Canonical(
          object(operation.requestSchema, `${pointer}/requestSchema`)
        ),
        responseSchemaDigest: sha256Canonical(
          object(operation.responseSchema, `${pointer}/responseSchema`)
        ),
        ...(operation.description === undefined
          ? {}
          : {
              description: optionalString(
                operation.description,
                `${pointer}/description`,
                2000
              ),
            }),
        ...(platformAccess ? { platformAccess } : {}),
      };
    }),
    (item: JsonObject) => item.code
  );
}

function validateOperationPlatformAccess(
  value: unknown,
  pointer: string,
  declaredResources: Map<string, Map<string, string>>,
  declaredWorkflowCodes: Set<string>,
  declaredRoleCodes: Set<string>
) {
  if (value === undefined) return null;
  const access = object(value, pointer);
  exactKeys(
    access,
    ['directory', 'managedFiles', 'managedFileCopies', 'notification', 'workflow', 'roleAssertions'],
    pointer,
    true
  );
  if (Object.keys(access).length === 0) {
    fail('NATIVE_OPERATION_PLATFORM_ACCESS_EMPTY', pointer);
  }
  const result: JsonObject = {};
  if (access.roleAssertions !== undefined) {
    const assertions = object(access.roleAssertions, `${pointer}/roleAssertions`);
    exactKeys(assertions, ['roleCodes'], `${pointer}/roleAssertions`);
    const codes = uniqueStrings(assertions.roleCodes, `${pointer}/roleAssertions/roleCodes`, 20);
    if (!codes.length) fail('NATIVE_OPERATION_ROLE_ASSERTIONS_REQUIRED', `${pointer}/roleAssertions/roleCodes`);
    codes.forEach((code, index) => {
      if (!declaredRoleCodes.has(code)) fail('NATIVE_ROLE_REFERENCE_MISSING', `${pointer}/roleAssertions/roleCodes/${index}`);
    });
    result.roleAssertions = { roleCodes: uniqueSorted(codes) };
  }
  if (access.directory !== undefined) {
    const directory = object(access.directory, `${pointer}/directory`);
    exactKeys(directory, ['mode', 'fields'], `${pointer}/directory`);
    if (directory.mode !== 'current-initiator') {
      fail(
        'NATIVE_OPERATION_DIRECTORY_MODE_INVALID',
        `${pointer}/directory/mode`
      );
    }
    const allowed = new Set([
      'displayName',
      'employeeNumber',
      'primaryDepartment',
      'departments',
    ]);
    const fields = uniqueStrings(
      directory.fields,
      `${pointer}/directory/fields`,
      4
    );
    if (!fields.length || fields.some(field => !allowed.has(field))) {
      fail(
        'NATIVE_OPERATION_DIRECTORY_FIELDS_INVALID',
        `${pointer}/directory/fields`
      );
    }
    result.directory = {
      mode: 'current-initiator',
      fields: uniqueSorted(fields),
    };
  }
  if (access.managedFiles !== undefined) {
    const entries = boundedArray(
      access.managedFiles,
      `${pointer}/managedFiles`,
      16
    );
    if (!entries.length) {
      fail(
        'NATIVE_OPERATION_MANAGED_FILES_REQUIRED',
        `${pointer}/managedFiles`
      );
    }
    const resourceCodes = new Set<string>();
    result.managedFiles = sorted(
      entries.map((raw, index) => {
        const entryPointer = `${pointer}/managedFiles/${index}`;
        const entry = object(raw, entryPointer);
        exactKeys(
          entry,
          ['resourceCode', 'fieldCodes', 'intents'],
          entryPointer
        );
        const code = resourceCode(
          entry.resourceCode,
          `${entryPointer}/resourceCode`
        );
        if (resourceCodes.has(code) || !declaredResources.has(code)) {
          fail(
            'NATIVE_OPERATION_MANAGED_FILE_RESOURCE_INVALID',
            `${entryPointer}/resourceCode`
          );
        }
        resourceCodes.add(code);
        const fieldCodes = uniqueStrings(
          entry.fieldCodes,
          `${entryPointer}/fieldCodes`,
          16
        );
        if (
          !fieldCodes.length ||
          fieldCodes.some(
            fieldCode =>
              !['file', 'image', 'signature'].includes(
                String(declaredResources.get(code)?.get(fieldCode) || '')
              )
          )
        ) {
          fail(
            'NATIVE_OPERATION_MANAGED_FILE_FIELD_INVALID',
            `${entryPointer}/fieldCodes`
          );
        }
        const intents = uniqueStrings(
          entry.intents,
          `${entryPointer}/intents`,
          2
        );
        if (
          !intents.length ||
          intents.some(intent => !['create', 'update'].includes(intent))
        ) {
          fail(
            'NATIVE_OPERATION_MANAGED_FILE_INTENT_INVALID',
            `${entryPointer}/intents`
          );
        }
        return {
          resourceCode: code,
          fieldCodes: uniqueSorted(fieldCodes),
          intents: uniqueSorted(intents),
        };
      }),
      item => item.resourceCode
    );
  }
  if (access.managedFileCopies !== undefined) {
    const entries = boundedArray(
      access.managedFileCopies,
      `${pointer}/managedFileCopies`,
      16
    );
    if (!entries.length) {
      fail('NATIVE_OPERATION_MANAGED_FILE_COPIES_REQUIRED', `${pointer}/managedFileCopies`);
    }
    const keys = new Set<string>();
    result.managedFileCopies = sorted(
      entries.map((raw, index) => {
        const entryPointer = `${pointer}/managedFileCopies/${index}`;
        const entry = object(raw, entryPointer);
        exactKeys(
          entry,
          ['mode', 'sourceResourceCode', 'sourceFieldCodes', 'targetResourceCode', 'targetFieldCodes'],
          entryPointer
        );
        equal(entry.mode, 'copy', `${entryPointer}/mode`);
        const sourceCode = resourceCode(entry.sourceResourceCode, `${entryPointer}/sourceResourceCode`);
        const targetCode = resourceCode(entry.targetResourceCode, `${entryPointer}/targetResourceCode`);
        const source = declaredResources.get(sourceCode);
        const target = declaredResources.get(targetCode);
        if (!source || !target) fail('NATIVE_OPERATION_MANAGED_FILE_COPY_RESOURCE_INVALID', entryPointer);
        const sourceFields = uniqueStrings(entry.sourceFieldCodes, `${entryPointer}/sourceFieldCodes`, 16);
        const targetFields = uniqueStrings(entry.targetFieldCodes, `${entryPointer}/targetFieldCodes`, 16);
        if (!sourceFields.length || sourceFields.length !== targetFields.length) {
          fail('NATIVE_OPERATION_MANAGED_FILE_COPY_FIELDS_INVALID', entryPointer);
        }
        sourceFields.forEach((field, fieldIndex) => {
          const sourceType = source!.get(field);
          const targetType = target!.get(targetFields[fieldIndex]!);
          if (!['file', 'image'].includes(String(sourceType)) || sourceType !== targetType) {
            fail('NATIVE_OPERATION_MANAGED_FILE_COPY_FIELD_INVALID', `${entryPointer}/sourceFieldCodes/${fieldIndex}`);
          }
        });
        const key = `${sourceCode}:${sourceFields.join(',')}=>${targetCode}:${targetFields.join(',')}`;
        if (keys.has(key)) fail('NATIVE_OPERATION_MANAGED_FILE_COPY_DUPLICATE', entryPointer);
        keys.add(key);
        return {
          mode: 'copy',
          sourceResourceCode: sourceCode,
          sourceFieldCodes: uniqueSorted(sourceFields),
          targetResourceCode: targetCode,
          targetFieldCodes: uniqueSorted(targetFields),
        };
      }),
      item => `${item.sourceResourceCode}:${item.sourceFieldCodes.join(',')}=>${item.targetResourceCode}:${item.targetFieldCodes.join(',')}`
    );
  }
  if (access.notification !== undefined) {
    const notification = object(access.notification, `${pointer}/notification`);
    exactKeys(notification, ['mode'], `${pointer}/notification`);
    if (notification.mode !== 'business-standard') {
      fail(
        'NATIVE_OPERATION_NOTIFICATION_MODE_INVALID',
        `${pointer}/notification/mode`
      );
    }
    result.notification = { mode: 'business-standard' };
  }
  if (access.workflow !== undefined) {
    const workflow = object(access.workflow, `${pointer}/workflow`);
    exactKeys(workflow, ['codes'], `${pointer}/workflow`);
    const codes = uniqueStrings(
      workflow.codes,
      `${pointer}/workflow/codes`,
      16
    );
    if (!codes.length || codes.some(code => !declaredWorkflowCodes.has(code))) {
      fail(
        'NATIVE_OPERATION_WORKFLOW_CODE_INVALID',
        `${pointer}/workflow/codes`
      );
    }
    result.workflow = { codes: uniqueSorted(codes) };
  }
  return result;
}

function validateBackendOperationAi(
  value: unknown,
  operationPointer: string,
  operationCode: string,
  method: string,
  declaredResourceCodes: Set<string>
) {
  if (value === undefined) return;
  const pointer = `${operationPointer}/ai`;
  const ai = object(value, pointer);
  if (!AI_OPERATION_CODE_PATTERN.test(operationCode)) {
    fail('NATIVE_OPERATION_AI_CODE_INVALID', `${operationPointer}/code`);
  }
  exactKeys(
    ai,
    [
      'name',
      'description',
      'risk',
      'resources',
      'sideEffects',
      'concurrency',
      'timeoutMs',
    ],
    pointer,
    true
  );
  requiredString(ai.name, `${pointer}/name`, MAX_STRING_BYTES);
  requiredString(ai.description, `${pointer}/description`, MAX_STRING_BYTES);
  const risk = requiredString(ai.risk, `${pointer}/risk`, 16);
  if (!['read', 'write', 'destructive', 'external'].includes(risk)) {
    fail('NATIVE_OPERATION_AI_RISK_INVALID', `${pointer}/risk`);
  }
  if ((risk === 'read') !== (method === 'GET')) {
    fail('NATIVE_OPERATION_AI_METHOD_RISK_MISMATCH', `${pointer}/risk`);
  }
  if (method === 'DELETE' && !['destructive', 'external'].includes(risk)) {
    fail('NATIVE_OPERATION_AI_METHOD_RISK_MISMATCH', `${pointer}/risk`);
  }
  const resources = uniqueStrings(ai.resources, `${pointer}/resources`, 16);
  if (resources.length === 0) {
    fail('NATIVE_OPERATION_AI_RESOURCE_REQUIRED', `${pointer}/resources`);
  }
  resources.forEach((rawCode, index) => {
    const code = resourceCode(rawCode, `${pointer}/resources/${index}`);
    if (!declaredResourceCodes.has(code)) {
      fail(
        'NATIVE_OPERATION_AI_RESOURCE_MISSING',
        `${pointer}/resources/${index}`
      );
    }
  });
  const sideEffects = uniqueStrings(
    ai.sideEffects,
    `${pointer}/sideEffects`,
    20
  );
  if (
    (risk === 'read' && sideEffects.length !== 0) ||
    (risk !== 'read' && sideEffects.length === 0)
  ) {
    fail('NATIVE_OPERATION_AI_SIDE_EFFECT_INVALID', `${pointer}/sideEffects`);
  }
  if (
    ai.concurrency !== undefined &&
    !['none', 'revision'].includes(
      requiredString(ai.concurrency, `${pointer}/concurrency`, 16)
    )
  ) {
    fail('NATIVE_OPERATION_AI_CONCURRENCY_INVALID', `${pointer}/concurrency`);
  }
  if (ai.timeoutMs !== undefined) {
    boundedInteger(ai.timeoutMs, `${pointer}/timeoutMs`, 100, 30000);
  }
}

function canonicalFrontendRouteShape(path: string) {
  const normalized = path.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return normalized
    .split('/')
    .map(segment =>
      segment.startsWith(':') ? ':' : segment.includes('*') ? '*' : segment
    )
    .join('/');
}

function validateApplicationAuthenticationMethod(
  raw: unknown,
  pointer: string
) {
  const method = object(raw, pointer);
  const type = requiredString(method.type, `${pointer}/type`, 32);
  const commonKeys = ['code', 'type', 'label', 'presentation', 'required'];
  const allowedKeys =
    type === 'sso'
      ? [...commonKeys, 'provider']
      : type === 'dingtalk'
      ? [...commonKeys, 'flow']
      : commonKeys;
  exactKeys(method, allowedKeys, pointer);
  const code = stableCode(method.code, `${pointer}/code`);
  const label = requiredString(method.label, `${pointer}/label`, 255);
  const presentation = requiredString(
    method.presentation,
    `${pointer}/presentation`,
    16
  );
  if (!['primary', 'secondary'].includes(presentation)) {
    fail(
      'NATIVE_APPLICATION_AUTH_METHOD_PRESENTATION_INVALID',
      `${pointer}/presentation`
    );
  }
  const required = boolean(method.required, `${pointer}/required`);
  if (!['sso', 'password', 'dingtalk'].includes(type)) {
    fail('NATIVE_APPLICATION_AUTH_METHOD_TYPE_INVALID', `${pointer}/type`);
  }
  if (type === 'sso' && method.provider !== 'tenant-default') {
    fail('NATIVE_APPLICATION_AUTH_SSO_PROVIDER_INVALID', `${pointer}/provider`);
  }
  if (
    type === 'dingtalk' &&
    !['auto', 'jsapi', 'oauth'].includes(
      requiredString(method.flow, `${pointer}/flow`, 16)
    )
  ) {
    fail('NATIVE_APPLICATION_AUTH_DINGTALK_FLOW_INVALID', `${pointer}/flow`);
  }
  return {
    code,
    type,
    label,
    presentation,
    required,
    ...(type === 'sso' ? { provider: 'tenant-default' } : {}),
    ...(type === 'dingtalk' ? { flow: method.flow } : {}),
  };
}

function validateApplicationAuthenticationSurface(
  raw: unknown,
  device: 'desktop' | 'mobile',
  pointer: string
) {
  const surface = object(raw, pointer);
  exactKeys(surface, ['routeCode', 'path', 'defaultRouteCode'], pointer);
  const routeCode = stableCode(surface.routeCode, `${pointer}/routeCode`);
  const path = absolutePath(surface.path, `${pointer}/path`);
  const expectedPath = device === 'desktop' ? '/login' : '/m/login';
  if (path !== expectedPath || /[:*?#\\]/.test(path)) {
    fail('NATIVE_APPLICATION_AUTH_SURFACE_PATH_INVALID', `${pointer}/path`, {
      device,
      expectedPath,
    });
  }
  return {
    routeCode,
    path,
    defaultRouteCode: stableCode(
      surface.defaultRouteCode,
      `${pointer}/defaultRouteCode`
    ),
  };
}

function validateApplicationAuthentication(
  value: unknown,
  routeDeclarations: unknown,
  config: JsonObject,
  pointer: string
) {
  if (value === null) return;
  const authentication = object(value, pointer);
  exactKeys(
    authentication,
    ['accountMode', 'registration', 'methods', 'surfaces'],
    pointer
  );
  equal(
    authentication.accountMode,
    'existing-platform-users-only',
    `${pointer}/accountMode`
  );
  const registration = object(
    authentication.registration,
    `${pointer}/registration`
  );
  exactKeys(registration, ['mode'], `${pointer}/registration`);
  equal(registration.mode, 'reject', `${pointer}/registration/mode`);
  const methods = boundedArray(authentication.methods, `${pointer}/methods`, 8);
  if (methods.length === 0) {
    fail('NATIVE_APPLICATION_AUTH_METHOD_REQUIRED', `${pointer}/methods`);
  }
  const compiledMethods = methods.map((method, index) =>
    validateApplicationAuthenticationMethod(
      method,
      `${pointer}/methods/${index}`
    )
  );
  const methodCodes = new Set<string>();
  const methodTypes = new Set<string>();
  for (const [index, method] of compiledMethods.entries()) {
    if (methodCodes.has(method.code)) {
      fail(
        'NATIVE_APPLICATION_AUTH_METHOD_CODE_DUPLICATE',
        `${pointer}/methods/${index}/code`
      );
    }
    if (methodTypes.has(method.type)) {
      fail(
        'NATIVE_APPLICATION_AUTH_METHOD_TYPE_DUPLICATE',
        `${pointer}/methods/${index}/type`
      );
    }
    methodCodes.add(method.code);
    methodTypes.add(method.type);
  }
  if (
    compiledMethods.filter(method => method.presentation === 'primary')
      .length !== 1
  ) {
    fail(
      'NATIVE_APPLICATION_AUTH_PRIMARY_METHOD_INVALID',
      `${pointer}/methods`
    );
  }

  const surfaces = object(authentication.surfaces, `${pointer}/surfaces`);
  exactKeys(surfaces, ['desktop', 'mobile'], `${pointer}/surfaces`);
  const desktop = validateApplicationAuthenticationSurface(
    surfaces.desktop,
    'desktop',
    `${pointer}/surfaces/desktop`
  );
  const mobile = validateApplicationAuthenticationSurface(
    surfaces.mobile,
    'mobile',
    `${pointer}/surfaces/mobile`
  );
  if (desktop.routeCode === mobile.routeCode) {
    fail(
      'NATIVE_APPLICATION_AUTH_SURFACE_CODE_DUPLICATE',
      `${pointer}/surfaces/mobile/routeCode`
    );
  }

  const routes = boundedArray(
    routeDeclarations,
    '/config/frontend/routes',
    500
  );
  const routesByCode = new Map<string, JsonObject>();
  for (const [index, rawRoute] of routes.entries()) {
    const route = object(rawRoute, `/config/frontend/routes/${index}`);
    routesByCode.set(String(route.code || ''), route);
  }
  for (const [device, surface] of [
    ['desktop', desktop],
    ['mobile', mobile],
  ] as const) {
    if (routesByCode.has(surface.routeCode)) {
      fail(
        'NATIVE_APPLICATION_AUTH_SURFACE_CODE_CONFLICT',
        `${pointer}/surfaces/${device}/routeCode`
      );
    }
    const defaultRoute = routesByCode.get(surface.defaultRouteCode);
    const defaultPath = String(defaultRoute?.path || '');
    const deviceMismatch =
      device === 'desktop'
        ? defaultPath === '/m' || defaultPath.startsWith('/m/')
        : !(defaultPath === '/m' || defaultPath.startsWith('/m/'));
    if (
      !defaultRoute ||
      defaultRoute.surface !== 'user' ||
      /[:*]/.test(defaultPath) ||
      deviceMismatch
    ) {
      fail(
        'NATIVE_APPLICATION_AUTH_DEFAULT_ROUTE_INVALID',
        `${pointer}/surfaces/${device}/defaultRouteCode`
      );
    }
  }

  const reservedClaims = generatedPlatformRouteClaims(config).filter(
    claim => !claim.owner.startsWith('authentication:')
  );
  for (const [device, surface] of [
    ['desktop', desktop],
    ['mobile', mobile],
  ] as const) {
    const conflict = reservedClaims.find(
      claim =>
        canonicalFrontendRouteShape(claim.path) ===
        canonicalFrontendRouteShape(surface.path)
    );
    if (conflict) {
      fail(
        'NATIVE_APPLICATION_AUTH_SURFACE_PATH_CONFLICT',
        `${pointer}/surfaces/${device}/path`,
        {
          owner: conflict.owner,
        }
      );
    }
  }
}

function validateApplicationAuthenticationContract(
  value: unknown,
  pointer: string
) {
  if (value === null) return;
  const placeholderConfig = {
    data: { resources: [] },
    workflows: { definitions: [] },
    frontend: {
      routes: [
        {
          code: 'auth-desktop-default',
          path: '/auth-desktop-default',
          surface: 'user',
        },
        {
          code: 'auth-mobile-default',
          path: '/m/auth-mobile-default',
          surface: 'user',
        },
      ],
      user: { applicationTodoCenter: false },
      admin: { navigation: [] },
      authentication: value,
    },
  };
  const authentication = object(value, pointer);
  const surfaces = object(authentication.surfaces, `${pointer}/surfaces`);
  const adjusted = {
    ...authentication,
    surfaces: {
      ...surfaces,
      desktop: {
        ...object(surfaces.desktop, `${pointer}/surfaces/desktop`),
        defaultRouteCode: 'auth-desktop-default',
      },
      mobile: {
        ...object(surfaces.mobile, `${pointer}/surfaces/mobile`),
        defaultRouteCode: 'auth-mobile-default',
      },
    },
  };
  validateApplicationAuthentication(
    adjusted,
    placeholderConfig.frontend.routes,
    {
      ...placeholderConfig,
      frontend: { ...placeholderConfig.frontend, authentication: adjusted },
    },
    pointer
  );
}

function compileApplicationAuthentication(config: JsonObject) {
  const authentication = config.frontend.authentication;
  if (authentication === null) return null;
  return {
    accountMode: authentication.accountMode,
    registration: { mode: authentication.registration.mode },
    methods: authentication.methods.map((method: JsonObject) => ({
      ...method,
    })),
    surfaces: {
      desktop: { ...authentication.surfaces.desktop },
      mobile: { ...authentication.surfaces.mobile },
    },
  };
}

const ANONYMOUS_PUBLIC_OPERATIONS = new Set([
  'draft.read',
  'draft.update',
  'validate',
  'create',
  'own.list',
  'own.read',
]);

function validateAnonymousPublicAccess(
  value: unknown,
  config: JsonObject,
  pointer: string
) {
  const access = object(value, pointer);
  exactKeys(access, ['policies'], pointer);
  const policies = boundedArray(access.policies, `${pointer}/policies`, 16);
  if (policies.length < 1) fail('NATIVE_PUBLIC_POLICY_REQUIRED', pointer);
  const routes = new Map<string, JsonObject>(
    config.frontend.routes.map((route: JsonObject) => [route.code, route])
  );
  const resources = new Map<string, JsonObject>(
    config.data.resources.map((resource: JsonObject) => [
      resource.code,
      resource,
    ])
  );
  const policyCodes = new Set<string>();
  const routeCodes = new Set<string>();
  policies.forEach((rawPolicy, index) => {
    const policyPointer = `${pointer}/policies/${index}`;
    const policy = object(rawPolicy, policyPointer);
    exactKeys(
      policy,
      ['code', 'routeCode', 'mode', 'resourceCode', 'operations', 'fields'],
      policyPointer,
      ['requiredFields', 'ownRecordFields', 'draft', 'validations']
    );
    const code = stableCode(policy.code, `${policyPointer}/code`);
    if (policyCodes.has(code)) {
      fail('NATIVE_PUBLIC_POLICY_DUPLICATE', `${policyPointer}/code`);
    }
    const routeCode = stableCode(
      policy.routeCode,
      `${policyPointer}/routeCode`
    );
    if (routeCodes.has(routeCode)) {
      fail('NATIVE_PUBLIC_ROUTE_DUPLICATE', `${policyPointer}/routeCode`);
    }
    const route = routes.get(routeCode);
    if (
      !route ||
      route.surface !== 'user' ||
      route.capability !== undefined ||
      route.access !== undefined ||
      /[:*]/.test(String(route.path))
    ) {
      fail('NATIVE_PUBLIC_ROUTE_INVALID', `${policyPointer}/routeCode`);
    }
    equal(policy.mode, 'anonymous', `${policyPointer}/mode`);
    const declaredResourceCode = resourceCode(
      policy.resourceCode,
      `${policyPointer}/resourceCode`
    );
    const resource = resources.get(declaredResourceCode);
    if (!resource) {
      fail('NATIVE_PUBLIC_RESOURCE_MISSING', `${policyPointer}/resourceCode`);
    }
    const declaredFields = new Map<string, string>(
      resource.schema.fields.map((field: JsonObject) => [
        String(field.code),
        String(field.type),
      ])
    );
    const operations = uniqueStrings(
      policy.operations,
      `${policyPointer}/operations`,
      6
    );
    if (
      operations.length < 1 ||
      operations.some(operation => !ANONYMOUS_PUBLIC_OPERATIONS.has(operation))
    ) {
      fail('NATIVE_PUBLIC_OPERATION_INVALID', `${policyPointer}/operations`);
    }
    if (
      operations.includes('draft.read') !== operations.includes('draft.update')
    ) {
      fail(
        'NATIVE_PUBLIC_DRAFT_OPERATION_INCOMPLETE',
        `${policyPointer}/operations`
      );
    }
    const fields = uniqueStrings(policy.fields, `${policyPointer}/fields`, 64);
    if (fields.length < 1 || fields.some(field => !declaredFields.has(field))) {
      fail('NATIVE_PUBLIC_FIELD_INVALID', `${policyPointer}/fields`);
    }
    for (const optionalFieldSet of ['requiredFields', 'ownRecordFields']) {
      if (!Object.prototype.hasOwnProperty.call(policy, optionalFieldSet))
        continue;
      const selected = uniqueStrings(
        policy[optionalFieldSet],
        `${policyPointer}/${optionalFieldSet}`,
        64
      );
      if (selected.some(field => !fields.includes(field))) {
        fail(
          'NATIVE_PUBLIC_FIELD_SCOPE_INVALID',
          `${policyPointer}/${optionalFieldSet}`
        );
      }
    }
    const requiredFields = Object.prototype.hasOwnProperty.call(
      policy,
      'requiredFields'
    )
      ? uniqueStrings(
          policy.requiredFields,
          `${policyPointer}/requiredFields`,
          64
        )
      : [];
    const resourceSurface = resource.surface || {};
    const resourceSurfaceFields = resourceSurface.fields || {};
    const nativeCreate =
      String(resourceSurface.mutationOwner || 'native') === 'native' &&
      resourceSurface.generated?.create !== false;
    const requiredCreateFields = resource.schema.fields
      .filter(
        (field: NativeDataFieldV2) =>
          nativeFieldRequiresCreateInputV2(field, resourceSurfaceFields[field.code])
      )
      .map((field: JsonObject) => String(field.code));
    if (operations.includes('create') && !nativeCreate) {
      fail('NATIVE_PUBLIC_CREATE_FIELDS_INCOMPLETE', `${policyPointer}/fields`);
    }
    if (operations.includes('create')) {
      for (const fieldCode of requiredCreateFields) {
        const missingSet = !fields.includes(fieldCode)
          ? 'fields'
          : !requiredFields.includes(fieldCode) ? 'requiredFields' : null;
        if (missingSet) {
          fail('NATIVE_PUBLIC_CREATE_FIELDS_INCOMPLETE', `${policyPointer}/${missingSet}`, { resourceCode, fieldCode });
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(policy, 'draft')) {
      const draft = object(policy.draft, `${policyPointer}/draft`);
      exactKeys(
        draft,
        ['enabled', 'inactivityTtlSeconds', 'maxBytes'],
        `${policyPointer}/draft`
      );
      equal(draft.enabled, true, `${policyPointer}/draft/enabled`);
      boundedInteger(
        draft.inactivityTtlSeconds,
        `${policyPointer}/draft/inactivityTtlSeconds`,
        3600,
        7_776_000
      );
      boundedInteger(
        draft.maxBytes,
        `${policyPointer}/draft/maxBytes`,
        4096,
        262_144
      );
    } else if (operations.includes('draft.read')) {
      fail('NATIVE_PUBLIC_DRAFT_REQUIRED', `${policyPointer}/draft`);
    }
    const validations = Object.prototype.hasOwnProperty.call(
      policy,
      'validations'
    )
      ? boundedArray(policy.validations, `${policyPointer}/validations`, 16)
      : [];
    const validationCodes = new Set<string>();
    validations.forEach((rawValidation, validationIndex) => {
      const validationPointer = `${policyPointer}/validations/${validationIndex}`;
      const validation = object(rawValidation, validationPointer);
      exactKeys(
        validation,
        ['code', 'kind', 'fields', 'result'],
        validationPointer
      );
      const validationCode = stableCode(
        validation.code,
        `${validationPointer}/code`
      );
      if (validationCodes.has(validationCode)) {
        fail('NATIVE_PUBLIC_VALIDATION_DUPLICATE', `${validationPointer}/code`);
      }
      equal(validation.kind, 'duplicate', `${validationPointer}/kind`);
      equal(validation.result, 'availability', `${validationPointer}/result`);
      const validationFields = uniqueStrings(
        validation.fields,
        `${validationPointer}/fields`,
        8
      );
      if (
        validationFields.length < 1 ||
        validationFields.some(field => !fields.includes(field)) ||
        validationFields.some(field =>
          ['file', 'subtable'].includes(declaredFields.get(field) || '')
        )
      ) {
        fail(
          'NATIVE_PUBLIC_VALIDATION_FIELD_INVALID',
          `${validationPointer}/fields`
        );
      }
      validationCodes.add(validationCode);
    });
    policyCodes.add(code);
    routeCodes.add(routeCode);
  });
}

function validateAnonymousPublicAccessContract(
  value: unknown,
  pointer: string
) {
  const access = object(value, pointer);
  exactKeys(access, ['policies'], pointer);
  const policies = boundedArray(access.policies, `${pointer}/policies`, 16);
  if (policies.length < 1) fail('NATIVE_PUBLIC_POLICY_REQUIRED', pointer);
}

function compileAnonymousPublicAccess(config: JsonObject) {
  return {
    policies: sorted(
      config.frontend.publicAccess.policies.map((policy: JsonObject) => ({
        code: policy.code,
        routeCode: policy.routeCode,
        mode: policy.mode,
        resourceCode: policy.resourceCode,
        operations: uniqueSorted(policy.operations),
        fields: uniqueSorted(policy.fields),
        ...(policy.requiredFields
          ? { requiredFields: uniqueSorted(policy.requiredFields) }
          : {}),
        ...(policy.ownRecordFields
          ? { ownRecordFields: uniqueSorted(policy.ownRecordFields) }
          : {}),
        ...(policy.draft ? { draft: { ...policy.draft } } : {}),
        ...(policy.validations
          ? {
              validations: sorted(
                policy.validations.map((validation: JsonObject) => ({
                  code: validation.code,
                  kind: validation.kind,
                  fields: uniqueSorted(validation.fields),
                  result: validation.result,
                })),
                (validation: JsonObject) => validation.code
              ),
            }
          : {}),
      })),
      (policy: JsonObject) => policy.code
    ),
  };
}

function generatedPlatformRouteClaims(config: JsonObject) {
  const claims: Array<{ owner: string; path: string }> = [
    { owner: 'platform:admin-entry', path: '/' },
    { owner: 'platform:admin-entry', path: '/admin' },
    {
      owner: 'platform:file-preview',
      path: '/files/:resourceCode/:fileId/preview',
    },
  ];
  if (config.frontend.authentication) {
    claims.push(
      {
        owner: 'authentication:desktop',
        path: config.frontend.authentication.surfaces.desktop.path,
      },
      {
        owner: 'authentication:mobile',
        path: config.frontend.authentication.surfaces.mobile.path,
      }
    );
  }
  for (const resource of config.data.resources) {
    const generated = generatedResourceOperations(resource);
    const base = `/admin/resources/${resource.code}`;
    const candidates = [
      ['list', base],
      ['detail', `${base}/:id`],
      ['create', `${base}/new`],
      ['update', `${base}/:id/edit`],
    ] as const;
    for (const [operation, path] of candidates) {
      if (!generated[operation]) continue;
      claims.push(
        { owner: `resource:${resource.code}:${operation}`, path },
        {
          owner: `resource:${resource.code}:${operation}:mobile`,
          path: `/m${path}`,
        }
      );
    }
  }
  if (config.frontend.user.applicationTodoCenter === true) {
    claims.push(
      { owner: 'application:todo-center', path: '/todos' },
      { owner: 'application:todo-center:mobile', path: '/m/todos' }
    );
  }
  if (config.workflows.definitions.length > 0) {
    claims.push(
      { owner: 'workflow:work-center', path: '/work-center' },
      { owner: 'workflow:work-center:mobile', path: '/m/work-center' },
      { owner: 'workflow:task', path: '/tasks/:taskId' },
      { owner: 'workflow:task:mobile', path: '/m/tasks/:taskId' },
      { owner: 'workflow:instance', path: '/workflows/:instanceId' },
      {
        owner: 'workflow:instance:mobile',
        path: '/m/workflows/:instanceId',
      }
    );
    let hasStandardLaunch = false;
    for (const declaration of config.workflows.definitions) {
      if (
        ['standalone', 'hidden-handoff'].includes(declaration.launch.mode)
      ) {
        hasStandardLaunch = true;
      }
    }
    if (hasStandardLaunch) {
      claims.push(
        {
          owner: 'workflow:launch',
          path: '/workflows/:workflowCode/start',
        },
        {
          owner: 'workflow:launch:mobile',
          path: '/m/workflows/:workflowCode/start',
        }
      );
    }
  }
  return claims;
}

function compileRoutes(config: JsonObject) {
  const pathClaims = new Map(
    generatedPlatformRouteClaims(config).map(claim => [
      canonicalFrontendRouteShape(claim.path),
      claim,
    ])
  );
  return sorted(
    config.frontend.routes.map((raw: any, index: number) => {
      const pointer = `/config/frontend/routes/${index}`;
      const route = object(raw, pointer);
      exactKeys(
        route,
        [
          'code',
          'path',
          'label',
          'surface',
          'parentCode',
          'capability',
          'access',
          'pinned',
          'tabPersistence',
          'keepAlive',
        ],
        pointer,
        true
      );
      if (!['admin', 'user'].includes(route.surface)) {
        fail('NATIVE_ROUTE_SURFACE_INVALID', `${pointer}/surface`);
      }
      const path = absolutePath(route.path, `${pointer}/path`);
      if (
        route.surface === 'admin' &&
        path !== '/admin' &&
        !path.startsWith('/admin/')
      ) {
        fail('NATIVE_ADMIN_ROUTE_PATH_INVALID', `${pointer}/path`);
      }
      if (
        route.surface === 'user' &&
        (path === '/admin' || path.startsWith('/admin/'))
      ) {
        fail('NATIVE_USER_ROUTE_PATH_RESERVED', `${pointer}/path`);
      }
      const routeShape = canonicalFrontendRouteShape(path);
      const existingClaim = pathClaims.get(routeShape);
      if (existingClaim) {
        fail('NATIVE_ROUTE_PATH_CONFLICT', `${pointer}/path`, {
          path,
          owner: existingClaim.owner,
        });
      }
      pathClaims.set(routeShape, {
        owner: `frontend:${String(route.code || index)}`,
        path,
      });
      const dynamic = /[:*]/.test(path);
      const access = normalizeRouteAccess(route, pointer, config.appCode);
      const pinned =
        route.pinned === undefined
          ? undefined
          : boolean(route.pinned, `${pointer}/pinned`);
      const tabPersistence =
        route.tabPersistence === undefined
          ? dynamic
            ? 'none'
            : 'session'
          : requiredString(
              route.tabPersistence,
              `${pointer}/tabPersistence`,
              16
            );
      const keepAlive =
        route.keepAlive === undefined
          ? 'none'
          : requiredString(route.keepAlive, `${pointer}/keepAlive`, 16);
      if (!['session', 'none'].includes(tabPersistence)) {
        fail(
          'NATIVE_ROUTE_TAB_PERSISTENCE_INVALID',
          `${pointer}/tabPersistence`
        );
      }
      if (!['none', 'memory'].includes(keepAlive)) {
        fail('NATIVE_ROUTE_KEEP_ALIVE_INVALID', `${pointer}/keepAlive`);
      }
      if (dynamic && pinned === true) {
        fail('NATIVE_DYNAMIC_ROUTE_PINNED_FORBIDDEN', `${pointer}/pinned`);
      }
      if (dynamic && tabPersistence === 'session') {
        fail(
          'NATIVE_DYNAMIC_ROUTE_TAB_PERSISTENCE_FORBIDDEN',
          `${pointer}/tabPersistence`
        );
      }
      if (dynamic && keepAlive === 'memory') {
        fail(
          'NATIVE_DYNAMIC_ROUTE_KEEP_ALIVE_FORBIDDEN',
          `${pointer}/keepAlive`
        );
      }
      return {
        code: stableCode(route.code, `${pointer}/code`),
        path,
        label: requiredString(route.label, `${pointer}/label`, 255),
        surface: route.surface,
        ...(route.parentCode === undefined
          ? {}
          : {
              parentCode: stableCode(route.parentCode, `${pointer}/parentCode`),
            }),
        ...access,
        ...(pinned === undefined ? {} : { pinned }),
        tabPersistence,
        keepAlive,
      };
    }),
    (item: JsonObject) => item.code
  );
}

function generatedResourceOperations(resource: JsonObject) {
  const surface =
    resource.surface === undefined ? {} : object(resource.surface, '/surface');
  const mutationOwner = surface.mutationOwner || 'native';
  const generated =
    surface.generated === undefined
      ? {}
      : object(surface.generated, '/surface/generated');
  const nativeMutations = mutationOwner === 'native';
  return {
    list: generated.list ?? true,
    detail: generated.detail ?? true,
    create: generated.create ?? nativeMutations,
    update: generated.update ?? nativeMutations,
    delete: generated.delete ?? nativeMutations,
  };
}

function compileAdminPages(config: JsonObject) {
  const pages: JsonObject[] = [];
  for (const selection of sorted(
    config.data.resources,
    (item: JsonObject) => item.code
  ).flatMap((resource: JsonObject) => [
    { resource, viewCode: undefined },
    ...(resource.surface?.views || []).map((view: JsonObject) => ({
      viewCode: view.code,
      resource: {
        ...resource,
        name: view.name,
        surface: projectNativeDataResourceViewV2(resource.surface, view.code),
      },
    })),
  ])) {
    const { resource, viewCode } = selection;
    const base = `/admin/resources/${resource.code}${
      viewCode ? `/views/${viewCode}` : ''
    }`;
    const generated = generatedResourceOperations(resource);
    const candidates = [
      {
        operation: 'list',
        kind: 'resource-list',
        path: `${base}`,
        label: resource.name,
        capability: resource.capabilities.read,
        navigationEligible: true,
      },
      {
        operation: 'detail',
        kind: 'resource-detail',
        path: `${base}/:id`,
        label: `${resource.name}详情`,
        capability: resource.capabilities.read,
        navigationEligible: false,
      },
      {
        operation: 'create',
        kind: 'resource-create',
        path: `${base}/new`,
        label: `新增${resource.name}`,
        capability: resource.capabilities.create,
        navigationEligible: false,
      },
      {
        operation: 'update',
        kind: 'resource-update',
        path: `${base}/:id/edit`,
        label: `编辑${resource.name}`,
        capability: resource.capabilities.update,
        navigationEligible: false,
      },
    ] as const;
    for (const candidate of candidates) {
      if (!generated[candidate.operation]) continue;
      pages.push({
        code: `resource:${resource.code}${
          viewCode ? `:view:${viewCode}` : ''
        }:${candidate.operation}`,
        kind: candidate.kind,
        path: candidate.path,
        label: candidate.label,
        navigationEligible: candidate.navigationEligible,
        capability: candidate.capability,
        resourceCode: resource.code,
        ...(viewCode ? { viewCode } : {}),
      });
    }
  }
  for (const route of compileRoutes(config)) {
    if (route.surface !== 'admin') continue;
    pages.push({
      code: `operation:${route.code}`,
      kind: 'operation',
      path: route.path,
      label: route.label,
      navigationEligible: !/[:*]/.test(route.path),
      routeCode: route.code,
    });
  }
  return pages.sort((left, right) => compareText(left.code, right.code));
}

function pageCodeForReference(reference: JsonObject) {
  if (reference.kind === 'resource') {
    return `resource:${reference.resourceCode}${
      reference.viewCode ? `:view:${reference.viewCode}` : ''
    }:list`;
  }
  return `operation:${reference.routeCode}`;
}

function compileAdminNavigation(config: JsonObject) {
  return config.frontend.admin.navigation
    .map((group: JsonObject, groupIndex: number) => ({
      code: group.code,
      label: group.label,
      ...(group.icon === undefined ? {} : { icon: group.icon }),
      order: group.order ?? groupIndex,
      items: group.items
        .map((item: JsonObject, itemIndex: number) => ({
          pageCode: pageCodeForReference(item.page),
          ...(item.label === undefined ? {} : { label: item.label }),
          ...(item.icon === undefined ? {} : { icon: item.icon }),
          order: item.order ?? itemIndex,
        }))
        .sort(
          (left: JsonObject, right: JsonObject) =>
            left.order - right.order ||
            compareText(left.pageCode, right.pageCode)
        ),
    }))
    .sort(
      (left: JsonObject, right: JsonObject) =>
        left.order - right.order || compareText(left.code, right.code)
    );
}

function validateAdminNavigationDeclaration(value: unknown, pointer: string) {
  const groups = boundedArray(
    value,
    pointer,
    NATIVE_CONTRACT_CAPACITY_V2.adminNavigationGroups
  );
  let itemCount = 0;
  groups.forEach((rawGroup, groupIndex) => {
    const groupPointer = `${pointer}/${groupIndex}`;
    const group = object(rawGroup, groupPointer);
    exactKeys(
      group,
      ['code', 'label', 'icon', 'order', 'items'],
      groupPointer,
      true
    );
    stableCode(group.code, `${groupPointer}/code`);
    requiredString(group.label, `${groupPointer}/label`, 255);
    validateAdminIcon(group.icon, `${groupPointer}/icon`);
    validateAdminOrder(group.order, `${groupPointer}/order`);
    const items = boundedArray(group.items, `${groupPointer}/items`, 500);
    if (items.length === 0) {
      fail('NATIVE_ADMIN_GROUP_ORPHANED', `${groupPointer}/items`);
    }
    itemCount += items.length;
    if (itemCount > NATIVE_CONTRACT_CAPACITY_V2.adminNavigationItems) {
      fail('NATIVE_ARRAY_LIMIT_EXCEEDED', pointer);
    }
    items.forEach((rawItem, itemIndex) => {
      const itemPointer = `${groupPointer}/items/${itemIndex}`;
      const item = object(rawItem, itemPointer);
      exactKeys(item, ['page', 'label', 'icon', 'order'], itemPointer, true);
      validateAdminPageReference(item.page, `${itemPointer}/page`);
      if (item.label !== undefined) {
        requiredString(item.label, `${itemPointer}/label`, 255);
      }
      validateAdminIcon(item.icon, `${itemPointer}/icon`);
      validateAdminOrder(item.order, `${itemPointer}/order`);
    });
  });
}

function validateAdminPageReference(value: unknown, pointer: string) {
  const reference = object(value, pointer);
  const kind = requiredString(reference.kind, `${pointer}/kind`, 64);
  if (kind === 'resource') {
    exactKeys(reference, ['kind', 'resourceCode'], pointer, ['viewCode']);
    if (reference.viewCode !== undefined)
      stableCode(reference.viewCode, `${pointer}/viewCode`);
    resourceCode(reference.resourceCode, `${pointer}/resourceCode`);
    return;
  }
  if (kind === 'operation') {
    exactKeys(reference, ['kind', 'routeCode'], pointer);
    stableCode(reference.routeCode, `${pointer}/routeCode`);
    return;
  }
  fail('NATIVE_ADMIN_PAGE_REFERENCE_KIND_INVALID', `${pointer}/kind`);
}

function validateAdminNavigationReferences(config: JsonObject) {
  const pages = new Map(
    compileAdminPages(config).map(page => [String(page.code), page])
  );
  const groupCodes = new Set<string>();
  const pageCodes = new Set<string>();
  config.frontend.admin.navigation.forEach(
    (group: JsonObject, groupIndex: number) => {
      const groupPointer = `/config/frontend/admin/navigation/${groupIndex}`;
      if (groupCodes.has(group.code)) {
        fail('NATIVE_ADMIN_GROUP_DUPLICATE', `${groupPointer}/code`);
      }
      groupCodes.add(group.code);
      if (group.label === group.code) {
        fail('NATIVE_ADMIN_USER_LABEL_REQUIRED', `${groupPointer}/label`);
      }
      group.items.forEach((item: JsonObject, itemIndex: number) => {
        const itemPointer = `${groupPointer}/items/${itemIndex}`;
        const pageCode = pageCodeForReference(item.page);
        const page = pages.get(pageCode);
        if (!page || page.navigationEligible !== true) {
          fail('NATIVE_ADMIN_PAGE_NOT_FOUND', `${itemPointer}/page`);
        }
        if (pageCodes.has(pageCode)) {
          fail('NATIVE_ADMIN_PAGE_DUPLICATE', `${itemPointer}/page`);
        }
        pageCodes.add(pageCode);
        const referenceCode =
          item.page.resourceCode ||
          item.page.routeCode ||
          item.page.workflowCode ||
          pageCode;
        const label = item.label || page.label;
        if (!label || label === referenceCode || label === pageCode) {
          fail('NATIVE_ADMIN_USER_LABEL_REQUIRED', `${itemPointer}/label`);
        }
      });
    }
  );
}

function validateAdminPageContracts(value: unknown, pointer: string) {
  const pages = boundedArray(
    value,
    pointer,
    NATIVE_CONTRACT_CAPACITY_V2.adminPages
  );
  const codes = new Set<string>();
  pages.forEach((rawPage, index) => {
    const pagePointer = `${pointer}/${index}`;
    const page = object(rawPage, pagePointer);
    exactKeys(
      page,
      [
        'code',
        'kind',
        'path',
        'label',
        'navigationEligible',
        'capability',
        'access',
        'resourceCode',
        'viewCode',
        'routeCode',
      ],
      pagePointer,
      true
    );
    const code = requiredString(page.code, `${pagePointer}/code`, 255);
    if (codes.has(code))
      fail('NATIVE_ADMIN_PAGE_DUPLICATE', `${pagePointer}/code`);
    codes.add(code);
    const kind = requiredString(page.kind, `${pagePointer}/kind`, 64);
    if (
      ![
        'resource-list',
        'resource-detail',
        'resource-create',
        'resource-update',
        'operation',
      ].includes(kind)
    ) {
      fail('NATIVE_ADMIN_PAGE_KIND_INVALID', `${pagePointer}/kind`);
    }
    absolutePath(page.path, `${pagePointer}/path`);
    requiredString(page.label, `${pagePointer}/label`, 255);
    boolean(page.navigationEligible, `${pagePointer}/navigationEligible`);
    if (page.capability !== undefined && page.access !== undefined) {
      fail('NATIVE_ROUTE_ACCESS_CONFLICT', `${pagePointer}/access`);
    }
    if (page.capability !== undefined) {
      requiredString(page.capability, `${pagePointer}/capability`, 255);
    }
    if (page.access !== undefined) {
      const access = object(page.access, `${pagePointer}/access`);
      exactKeys(access, ['allOf', 'anyOf'], `${pagePointer}/access`, true);
      for (const key of ['allOf', 'anyOf']) {
        if (access[key] !== undefined) {
          uniqueStrings(access[key], `${pagePointer}/access/${key}`, 50);
        }
      }
    }
    for (const key of ['resourceCode', 'viewCode', 'routeCode']) {
      if (page[key] !== undefined)
        stableCode(page[key], `${pagePointer}/${key}`);
    }
  });
}

function validateAdminNavigationContracts(value: unknown, pointer: string) {
  const groups = boundedArray(
    value,
    pointer,
    NATIVE_CONTRACT_CAPACITY_V2.adminNavigationGroups
  );
  let itemCount = 0;
  groups.forEach((rawGroup, groupIndex) => {
    const groupPointer = `${pointer}/${groupIndex}`;
    const group = object(rawGroup, groupPointer);
    exactKeys(
      group,
      ['code', 'label', 'icon', 'order', 'items'],
      groupPointer,
      true
    );
    stableCode(group.code, `${groupPointer}/code`);
    requiredString(group.label, `${groupPointer}/label`, 255);
    validateAdminIcon(group.icon, `${groupPointer}/icon`);
    boundedInteger(group.order, `${groupPointer}/order`, -10000, 10000);
    const items = boundedArray(group.items, `${groupPointer}/items`, 500);
    if (items.length === 0)
      fail('NATIVE_ADMIN_GROUP_ORPHANED', `${groupPointer}/items`);
    itemCount += items.length;
    if (itemCount > NATIVE_CONTRACT_CAPACITY_V2.adminNavigationItems) {
      fail('NATIVE_ARRAY_LIMIT_EXCEEDED', pointer);
    }
    items.forEach((rawItem, itemIndex) => {
      const itemPointer = `${groupPointer}/items/${itemIndex}`;
      const item = object(rawItem, itemPointer);
      exactKeys(
        item,
        ['pageCode', 'label', 'icon', 'order'],
        itemPointer,
        true
      );
      requiredString(item.pageCode, `${itemPointer}/pageCode`, 255);
      if (item.label !== undefined)
        requiredString(item.label, `${itemPointer}/label`, 255);
      validateAdminIcon(item.icon, `${itemPointer}/icon`);
      boundedInteger(item.order, `${itemPointer}/order`, -10000, 10000);
    });
  });
}

const ROUTE_MANIFEST_KINDS = new Set([
  'application-todo-center',
  'workflow-work-center',
  'workflow-launch',
  'workflow-task',
  'workflow-instance',
]);

function validateRouteManifest(
  value: unknown,
  pointer: string,
  appCode: string
) {
  const manifest = object(value, pointer);
  exactKeys(
    manifest,
    [
      'schemaVersion',
      'appCode',
      'devicePolicy',
      'rootEntry',
      'authentication',
      'routes',
      'digest',
    ],
    pointer
  );
  equal(
    manifest.schemaVersion,
    ROUTE_MANIFEST_SCHEMA,
    `${pointer}/schemaVersion`
  );
  equal(manifest.appCode, appCode, `${pointer}/appCode`);
  validateDevicePolicy(manifest.devicePolicy, `${pointer}/devicePolicy`);
  validateRouteManifestRootEntry(manifest.rootEntry, `${pointer}/rootEntry`);
  validateRouteManifestAuthentication(
    manifest.authentication,
    `${pointer}/authentication`
  );
  digest(manifest.digest, `${pointer}/digest`);
  const routes = boundedArray(
    manifest.routes,
    `${pointer}/routes`,
    NATIVE_CONTRACT_CAPACITY_V2.routes
  );
  const codes = new Set<string>();
  routes.forEach((rawEntry, index) => {
    const entryPointer = `${pointer}/routes/${index}`;
    const entry = object(rawEntry, entryPointer);
    exactKeys(entry, ['code', 'kind', 'desktop', 'mobile'], entryPointer, [
      'workflowCode',
    ]);
    const code = requiredString(entry.code, `${entryPointer}/code`, 255);
    if (codes.has(code))
      fail('NATIVE_ROUTE_MANIFEST_DUPLICATE', `${entryPointer}/code`);
    codes.add(code);
    const kind = requiredString(entry.kind, `${entryPointer}/kind`, 64);
    if (!ROUTE_MANIFEST_KINDS.has(kind)) {
      fail('NATIVE_ROUTE_MANIFEST_KIND_INVALID', `${entryPointer}/kind`);
    }
    if (entry.workflowCode !== undefined) {
      stableCode(entry.workflowCode, `${entryPointer}/workflowCode`);
    }
    const desktop = validateRouteManifestRoute(
      entry.desktop,
      `${entryPointer}/desktop`,
      appCode
    );
    const mobile = validateRouteManifestRoute(
      entry.mobile,
      `${entryPointer}/mobile`,
      appCode
    );
    if (desktop.surface !== 'user') {
      fail(
        'NATIVE_ROUTE_MANIFEST_DESKTOP_SURFACE_INVALID',
        `${entryPointer}/desktop/surface`
      );
    }
    if (mobile.surface !== 'user') {
      fail(
        'NATIVE_ROUTE_MANIFEST_MOBILE_SURFACE_INVALID',
        `${entryPointer}/mobile/surface`
      );
    }
    if (desktop.routeCode === mobile.routeCode) {
      fail('NATIVE_ROUTE_MANIFEST_PAIR_DUPLICATE', entryPointer);
    }
  });
  equal(
    manifest.digest,
    sha256Canonical({
      schemaVersion: manifest.schemaVersion,
      appCode: manifest.appCode,
      devicePolicy: manifest.devicePolicy,
      rootEntry: manifest.rootEntry,
      authentication: manifest.authentication,
      routes: manifest.routes,
    }),
    `${pointer}/digest`
  );
}

function validateDevicePolicy(value: unknown, pointer: string) {
  const policy = object(value, pointer);
  exactKeys(policy, ['kind', 'mobileMaxWidthPx', 'desktopMinWidthPx'], pointer);
  equal(policy.kind, 'viewport-family', `${pointer}/kind`);
  const mobileMaxWidthPx = boundedInteger(
    policy.mobileMaxWidthPx,
    `${pointer}/mobileMaxWidthPx`,
    320,
    1600
  );
  const desktopMinWidthPx = boundedInteger(
    policy.desktopMinWidthPx,
    `${pointer}/desktopMinWidthPx`,
    320,
    1600
  );
  if (desktopMinWidthPx !== mobileMaxWidthPx + 1) {
    fail('NATIVE_FRONTEND_DEVICE_POLICY_INVALID', pointer);
  }
  return {
    kind: 'viewport-family' as const,
    mobileMaxWidthPx,
    desktopMinWidthPx,
  };
}

function validateRouteManifestRootEntry(value: unknown, pointer: string) {
  const rootEntry = object(value, pointer);
  exactKeys(rootEntry, ['code', 'desktop', 'mobile'], pointer);
  const code = stableCode(rootEntry.code, `${pointer}/code`);
  const desktop = staticRoutePath(rootEntry.desktop, `${pointer}/desktop`);
  const mobile = staticRoutePath(rootEntry.mobile, `${pointer}/mobile`);
  if (desktop === mobile || mobile === '/' || !mobile.startsWith('/m/')) {
    fail('NATIVE_ROUTE_MANIFEST_ROOT_ENTRY_INVALID', pointer);
  }
  if (desktop.startsWith('/m/')) {
    fail('NATIVE_ROUTE_MANIFEST_ROOT_ENTRY_INVALID', `${pointer}/desktop`);
  }
  return { code, desktop, mobile };
}

function validateRouteManifestAuthentication(value: unknown, pointer: string) {
  const authentication = object(value, pointer);
  exactKeys(authentication, ['desktop', 'mobile'], pointer);
  const desktop = validateRouteManifestAuthenticationSurface(
    authentication.desktop,
    `${pointer}/desktop`,
    false
  );
  const mobile = validateRouteManifestAuthenticationSurface(
    authentication.mobile,
    `${pointer}/mobile`,
    true
  );
  if (desktop.routeCode === mobile.routeCode || desktop.path === mobile.path) {
    fail('NATIVE_ROUTE_MANIFEST_AUTHENTICATION_DUPLICATE', pointer);
  }
  return { desktop, mobile };
}

function validateRouteManifestAuthenticationSurface(
  value: unknown,
  pointer: string,
  mobile: boolean
) {
  const surface = object(value, pointer);
  exactKeys(surface, ['routeCode', 'path'], pointer);
  const routeCode = stableCode(surface.routeCode, `${pointer}/routeCode`);
  const path = staticRoutePath(surface.path, `${pointer}/path`);
  if (mobile ? !path.startsWith('/m/') : path.startsWith('/m/')) {
    fail(
      'NATIVE_ROUTE_MANIFEST_AUTHENTICATION_PATH_INVALID',
      `${pointer}/path`
    );
  }
  return { routeCode, path };
}

function staticRoutePath(value: unknown, pointer: string) {
  const path = absolutePath(value, pointer);
  if (/[:*?#\\\\]/.test(path)) {
    fail('NATIVE_ROUTE_MANIFEST_STATIC_PATH_INVALID', pointer);
  }
  return path;
}

function validateRouteManifestRoute(
  value: unknown,
  pointer: string,
  appCode: string
) {
  const route = object(value, pointer);
  exactKeys(
    route,
    ['routeCode', 'path', 'surface', 'pathParams', 'requiresAuthentication'],
    pointer,
    ['capability', 'access']
  );
  stableCode(route.routeCode, `${pointer}/routeCode`);
  const path = absolutePath(route.path, `${pointer}/path`);
  const surface = requiredString(route.surface, `${pointer}/surface`, 16);
  if (!['admin', 'user'].includes(surface)) {
    fail('NATIVE_ROUTE_SURFACE_INVALID', `${pointer}/surface`);
  }
  const pathParams = uniqueStrings(
    route.pathParams,
    `${pointer}/pathParams`,
    8
  );
  pathParams.forEach((param, index) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(param) || param.length > 64) {
      fail('NATIVE_ROUTE_PATH_PARAM_INVALID', `${pointer}/pathParams/${index}`);
    }
  });
  if (canonicalJson(pathParams) !== canonicalJson(routePathParams(path))) {
    fail('NATIVE_ROUTE_PATH_PARAMS_MISMATCH', `${pointer}/pathParams`);
  }
  normalizeRouteAccess(route, pointer, appCode);
  if (route.requiresAuthentication !== true) {
    fail(
      'NATIVE_ROUTE_AUTHENTICATION_REQUIRED',
      `${pointer}/requiresAuthentication`
    );
  }
  return route;
}

function routePathParams(path: string): string[] {
  return uniqueSorted(
    [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(match => match[1]!)
  );
}

function compileRouteManifestRoute(
  routeCode: string,
  path: string,
  surface: 'admin' | 'user',
  page?: JsonObject
) {
  return {
    routeCode,
    path,
    surface,
    pathParams: routePathParams(path),
    ...(page?.capability ? { capability: page.capability } : {}),
    ...(page?.access ? { access: page.access } : {}),
    requiresAuthentication: true,
  };
}

function standardRouteCode(
  kind: string,
  device: 'desktop' | 'mobile',
  workflowCode?: string
) {
  if (kind === 'workflow-launch') {
    return `workflow.${workflowCode}.launch.${device}`;
  }
  if (kind === 'application-todo-center') {
    return `application.todo-center.${device}`;
  }
  return `${kind.replace(/-/g, '.')}.${device}`;
}

function compileRouteManifest(config: JsonObject) {
  const appCode = config.appCode;
  const routes: JsonObject[] = [];
  const addRoute = (
    code: string,
    kind: string,
    desktopPath: string,
    mobilePath: string,
    workflowCode?: string,
    access?: JsonObject
  ) => {
    routes.push({
      code,
      kind,
      ...(workflowCode ? { workflowCode } : {}),
      desktop: compileRouteManifestRoute(
        standardRouteCode(kind, 'desktop', workflowCode),
        desktopPath,
        'user',
        access
      ),
      mobile: compileRouteManifestRoute(
        standardRouteCode(kind, 'mobile', workflowCode),
        mobilePath,
        'user',
        access
      ),
    });
  };
  if (config.frontend.user.applicationTodoCenter === true) {
    addRoute(
      'application:todo-center',
      'application-todo-center',
      '/todos',
      '/m/todos'
    );
  }
  const workflows = compileWorkflows(config);
  if (workflows.length > 0) {
    addRoute(
      'workflow:work-center',
      'workflow-work-center',
      '/work-center',
      '/m/work-center'
    );
    addRoute(
      'workflow:task',
      'workflow-task',
      '/tasks/:taskId',
      '/m/tasks/:taskId'
    );
    addRoute(
      'workflow:instance',
      'workflow-instance',
      '/workflows/:instanceId',
      '/m/workflows/:instanceId'
    );
  }
  for (const workflow of workflows) {
    if (!['standalone', 'hidden-handoff'].includes(workflow.launch.mode)) {
      continue;
    }
    const namedCapabilities = uniqueSorted(
      [
        workflow.launch.submission?.create?.requiredCapability,
        workflow.launch.submission?.existing?.requiredCapability,
      ].filter((capability): capability is string => Boolean(capability))
    );
    addRoute(
      `workflow:${workflow.code}:launch`,
      'workflow-launch',
      '/workflows/:workflowCode/start',
      '/m/workflows/:workflowCode/start',
      workflow.code,
      namedCapabilities.length === 1
        ? { capability: namedCapabilities[0] }
        : namedCapabilities.length > 1
        ? { access: { anyOf: namedCapabilities } }
        : undefined
    );
  }
  const normalizedRoutes = routes.sort((left, right) =>
    compareText(String(left.code), String(right.code))
  );
  const normalizedFrontendRoutes = compileRoutes(config);
  const staticRoute = (device: 'desktop' | 'mobile') => {
    const expectedPath = device === 'mobile' ? '/m/' : '/';
    const declared = normalizedFrontendRoutes
      .filter(
        route =>
          route.surface === 'user' &&
          !/[:*?#\\\\]/.test(route.path) &&
          route.path === expectedPath
      )
      .sort((left, right) => compareText(left.code, right.code))[0];
    if (declared) {
      return { code: declared.code, path: declared.path };
    }
    const fallback = normalizedFrontendRoutes
      .filter(
        route =>
          route.surface === 'user' &&
          !/[:*?#\\\\]/.test(route.path) &&
          (device === 'mobile'
            ? route.path.startsWith('/m/')
            : !route.path.startsWith('/m/'))
      )
      .sort((left, right) => compareText(left.code, right.code))[0];
    return fallback
      ? { code: fallback.code, path: fallback.path }
      : {
          code:
            device === 'mobile'
              ? 'application-root-mobile'
              : 'application-root',
          path: expectedPath,
        };
  };
  const authentication = config.frontend.authentication
    ? {
        desktop: {
          routeCode: config.frontend.authentication.surfaces.desktop.routeCode,
          path: config.frontend.authentication.surfaces.desktop.path,
        },
        mobile: {
          routeCode: config.frontend.authentication.surfaces.mobile.routeCode,
          path: config.frontend.authentication.surfaces.mobile.path,
        },
      }
    : {
        desktop: { routeCode: 'application-login', path: '/login' },
        mobile: { routeCode: 'application-login-mobile', path: '/m/login' },
      };
  const devicePolicy = validateDevicePolicy(
    config.frontend.devicePolicy,
    '/config/frontend/devicePolicy'
  );
  const rootDesktop = staticRoute('desktop');
  const rootMobile = staticRoute('mobile');
  const payload = {
    schemaVersion: ROUTE_MANIFEST_SCHEMA,
    appCode,
    devicePolicy,
    rootEntry: {
      code: rootDesktop.code,
      desktop: rootDesktop.path,
      mobile: rootMobile.path,
    },
    authentication,
    routes: normalizedRoutes,
  };
  return { ...payload, digest: sha256Canonical(payload) };
}

function validateAdminIcon(value: unknown, pointer: string) {
  if (value === undefined) return;
  const icon = requiredString(value, pointer, 32);
  if (!ADMIN_NAVIGATION_ICONS.has(icon)) {
    fail('NATIVE_ADMIN_ICON_INVALID', pointer);
  }
}

function validateAdminOrder(value: unknown, pointer: string) {
  if (value === undefined) return;
  boundedInteger(value, pointer, -10000, 10000);
}

function normalizeRouteAccess(
  route: JsonObject,
  pointer: string,
  appCode: string
): {
  capability?: string;
  access?: { allOf?: string[]; anyOf?: string[] };
} {
  if (route.capability !== undefined && route.access !== undefined) {
    fail('NATIVE_ROUTE_ACCESS_CONFLICT', `${pointer}/access`);
  }
  if (route.capability !== undefined) {
    return {
      capability: capabilityCode(
        route.capability,
        `${pointer}/capability`,
        appCode
      ),
    };
  }
  if (route.access === undefined) return {};

  return {
    access: normalizeAccessExpression(
      route.access,
      `${pointer}/access`,
      appCode
    ),
  };
}

function normalizeAccessExpression(
  value: unknown,
  pointer: string,
  appCode: string
): { allOf?: string[]; anyOf?: string[] } {
  const access = object(value, pointer);
  exactKeys(access, ['allOf', 'anyOf'], pointer, true);
  const allOf =
    access.allOf === undefined
      ? undefined
      : uniqueSorted(
          uniqueStrings(access.allOf, `${pointer}/allOf`, 50).map(
            (code, index) =>
              capabilityCode(code, `${pointer}/allOf/${index}`, appCode)
          )
        );
  const anyOf =
    access.anyOf === undefined
      ? undefined
      : uniqueSorted(
          uniqueStrings(access.anyOf, `${pointer}/anyOf`, 50).map(
            (code, index) =>
              capabilityCode(code, `${pointer}/anyOf/${index}`, appCode)
          )
        );
  if ((allOf?.length || 0) + (anyOf?.length || 0) === 0) {
    fail('NATIVE_ROUTE_ACCESS_EMPTY', pointer);
  }
  return {
    ...(allOf === undefined ? {} : { allOf }),
    ...(anyOf === undefined ? {} : { anyOf }),
  };
}

function compileWorkflows(config: JsonObject) {
  const operationContracts = new Map<string, JsonObject>(
    compileOperations(config).map((operation: JsonObject) => [
      String(operation.code),
      operation,
    ])
  );
  const definitions: JsonObject[] = config.workflows.definitions.map(
    (raw: any, index: number) => {
      const pointer = `/config/workflows/definitions/${index}`;
      const declaration = object(raw, pointer);
      exactKeys(declaration, ['version', 'definition', 'launch'], pointer, [
        'detailRouteCode',
      ]);
      const definition = object(
        declaration.definition,
        `${pointer}/definition`
      );
      const detailRouteCode =
        declaration.detailRouteCode === undefined
          ? undefined
          : validateWorkflowDetailRouteCode(
              declaration.detailRouteCode,
              `${pointer}/detailRouteCode`
            );
      return {
        code: stableCode(definition.code, `${pointer}/definition/code`),
        title: requiredString(
          definition.title,
          `${pointer}/definition/title`,
          255
        ),
        version: positiveInteger(declaration.version, `${pointer}/version`),
        launch: compileWorkflowLaunchContract(
          config,
          definition,
          declaration.launch,
          `${pointer}/launch`,
          operationContracts
        ),
        ...(detailRouteCode ? { detailRouteCode } : {}),
        definition,
      };
    }
  );
  const workflowCodes = uniqueSorted(definitions.map(item => item.code));
  return workflowCodes.map(code => {
    const workflowDefinitions = definitions.filter(item => item.code === code);
    const activeVersion = config.workflows.activations.find(
      (item: JsonObject) => item.workflowCode === code
    )?.definitionVersion;
    const currentDefinition =
      workflowDefinitions.find(item => item.version === activeVersion) ||
      [...workflowDefinitions].sort(
        (left, right) => right.version - left.version
      )[0]!;
    const operations = new Set<string>();
    for (const item of workflowDefinitions) {
      const nodes = object(
        item.definition.nodes,
        '/config/workflows/definitions/nodes'
      );
      for (const nodeValue of Object.values(nodes)) {
        const node = object(nodeValue, '/config/workflows/definitions/nodes/*');
        if (node.kind !== 'approval') continue;
        for (const operation of uniqueStrings(
          node.allowedOperations || [],
          '/config/workflows/definitions/nodes/*/allowedOperations',
          20
        )) {
          operations.add(operation);
        }
      }
    }
    return {
      code,
      title: currentDefinition.title,
      acceptedCommandDeactivationPolicy:
        currentDefinition.definition.acceptedCommandDeactivationPolicy,
      subject: currentDefinition.definition.subject,
      launch: currentDefinition.launch,
      ...(['standalone', 'hidden-handoff'].includes(
        currentDefinition.launch.mode
      ) && !currentDefinition.launch.submission
        ? { processOperationCode: `openxiangda.workflow.${code}.submit` }
        : {}),
      ...(currentDefinition.detailRouteCode
        ? { detailRouteCode: currentDefinition.detailRouteCode }
        : {}),
      definitionVersions: uniqueSortedNumbers(
        workflowDefinitions.map(item => item.version)
      ),
      bindingVersions: uniqueSortedNumbers(
        config.workflows.bindings
          .map((raw: any, index: number) => {
            const pointer = `/config/workflows/bindings/${index}`;
            const declaration = object(raw, pointer);
            const binding = object(declaration.binding, `${pointer}/binding`);
            return {
              code: stableCode(
                binding.workflowCode,
                `${pointer}/binding/workflowCode`
              ),
              version: positiveInteger(
                declaration.version,
                `${pointer}/version`
              ),
            };
          })
          .filter((item: any) => item.code === code)
          .map((item: any) => item.version)
      ),
      providerCodes: uniqueSorted(
        config.workflows.providers.map((raw: any, index: number) =>
          stableCode(
            object(raw, `/config/workflows/providers/${index}`).code,
            `/config/workflows/providers/${index}/code`
          )
        )
      ),
      allowedOperations: [...operations].sort(compareText),
      editableParameterCodes: uniqueSorted(
        config.workflows.editableParameters
          .map((raw: any, index: number) => {
            const pointer = `/config/workflows/editableParameters/${index}`;
            const item = object(raw, pointer);
            return {
              code: stableCode(item.code, `${pointer}/code`),
              workflowCode: stableCode(
                item.workflowCode,
                `${pointer}/workflowCode`
              ),
            };
          })
          .filter((item: any) => item.workflowCode === code)
          .map((item: any) => item.code)
      ),
    };
  });
}

function validateWorkflowLaunch(value: unknown, pointer: string) {
  const launch = object(value, pointer);
  exactKeys(launch, ['mode'], pointer, ['submission']);
  const mode = requiredString(launch.mode, `${pointer}/mode`, 32);
  if (
    ![
      'standalone',
      'custom-page',
      'hidden-handoff',
      'work-center-only',
    ].includes(mode)
  ) {
    fail('NATIVE_WORKFLOW_LAUNCH_MODE_INVALID', `${pointer}/mode`);
  }
  return {
    mode,
    ...(launch.submission === undefined
      ? {}
      : { submission: object(launch.submission, `${pointer}/submission`) }),
  };
}

function compileWorkflowLaunchContract(
  config: JsonObject,
  definition: JsonObject,
  value: unknown,
  pointer: string,
  operationContracts: Map<string, JsonObject>
) {
  const launch = validateWorkflowLaunch(value, pointer);
  if (!launch.submission) return { mode: launch.mode };
  if (!['standalone', 'hidden-handoff'].includes(launch.mode)) {
    fail(
      'NATIVE_WORKFLOW_NAMED_OPERATION_SUBMISSION_INVALID',
      `${pointer}/submission`
    );
  }
  const submission = object(launch.submission, `${pointer}/submission`);
  exactKeys(submission, ['kind'], `${pointer}/submission`, [
    'create',
    'existing',
    'context',
  ]);
  equal(submission.kind, 'named-operation', `${pointer}/submission/kind`);

  const declarationPointer = pointer.endsWith('/launch')
    ? pointer.slice(0, -'/launch'.length)
    : pointer;
  const subject = object(
    definition.subject,
    `${declarationPointer}/definition/subject`
  );
  const subjectResourceCode = resourceCode(
    subject.resourceCode,
    `${declarationPointer}/definition/subject/resourceCode`
  );
  const subjectResourceIndex = config.data.resources.findIndex(
    (resource: JsonObject) => resource.code === subjectResourceCode
  );
  const subjectResource = config.data.resources[subjectResourceIndex];
  if (subjectResourceIndex < 0 || !subjectResource) {
    fail(
      'NATIVE_WORKFLOW_SUBJECT_RESOURCE_MISSING',
      `${declarationPointer}/definition/subject/resourceCode`
    );
  }
  const subjectFields = new Set<string>(
    object(
      subjectResource.schema,
      `/config/data/resources/${subjectResourceIndex}/schema`
    ).fields.map((field: JsonObject) => String(field.code))
  );
  const rawOperations = new Map<string, JsonObject>(
    config.backend.operations.map((operation: JsonObject) => [
      String(operation.code),
      operation,
    ])
  );

  const compileIntent = (
    rawIntent: unknown,
    intentKind: 'create' | 'existing'
  ) => {
    const intentPointer = `${pointer}/submission/${intentKind}`;
    const intent = object(rawIntent, intentPointer);
    exactKeys(intent, ['operationCode', 'inputs', 'output'], intentPointer);
    const operationCode = stableCode(
      intent.operationCode,
      `${intentPointer}/operationCode`
    );
    const operation = rawOperations.get(operationCode);
    const operationContract = operationContracts.get(operationCode);
    const workflowCodes = operationContract?.platformAccess?.workflow?.codes;
    if (
      !operation ||
      !operationContract ||
      operationContract.method !== 'POST' ||
      !Array.isArray(workflowCodes) ||
      !workflowCodes.includes(definition.code)
    ) {
      fail('NATIVE_WORKFLOW_NAMED_OPERATION_INVALID', intentPointer);
    }

    const requestSchema = object(
      operation.requestSchema,
      `${intentPointer}/operation/requestSchema`
    );
    const requestProperties = object(
      requestSchema.properties,
      `${intentPointer}/operation/requestSchema/properties`
    );
    const requestRequired = new Set<string>(
      requestSchema.required === undefined
        ? []
        : uniqueStrings(
            requestSchema.required,
            `${intentPointer}/operation/requestSchema/required`,
            64
          )
    );
    const inputs = object(intent.inputs, `${intentPointer}/inputs`);
    const inputEntries = Object.entries(inputs);
    if (!inputEntries.length || inputEntries.length > 64) {
      fail(
        'NATIVE_WORKFLOW_NAMED_OPERATION_INPUT_INVALID',
        `${intentPointer}/inputs`
      );
    }
    const fieldCodes = new Set<string>();
    const sourceCounts = new Map<string, number>();
    const normalizedInputs: JsonObject = {};
    for (const [inputCode, rawBinding] of inputEntries) {
      if (
        !PROPERTY_CODE_PATTERN.test(inputCode) ||
        !Object.prototype.hasOwnProperty.call(requestProperties, inputCode)
      ) {
        fail(
          'NATIVE_WORKFLOW_NAMED_OPERATION_INPUT_INVALID',
          `${intentPointer}/inputs/${inputCode}`
        );
      }
      const bindingPointer = `${intentPointer}/inputs/${inputCode}`;
      const binding = object(rawBinding, bindingPointer);
      const source = requiredString(
        binding.source,
        `${bindingPointer}/source`,
        32
      );
      if (
        ![
          'field',
          'idempotency-key',
          'current-user-reference',
          'subject-id',
          'subject-revision',
          'requested-at',
        ].includes(source)
      ) {
        fail('NATIVE_WORKFLOW_NAMED_OPERATION_INPUT_INVALID', bindingPointer);
      }
      exactKeys(
        binding,
        ['source'],
        bindingPointer,
        source === 'field' ? ['fieldCode'] : false
      );
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
      if (source === 'field') {
        const fieldCode = fieldCodeValue(
          binding.fieldCode,
          `${bindingPointer}/fieldCode`
        );
        if (fieldCodes.has(fieldCode) || !subjectFields.has(fieldCode)) {
          fail(
            'NATIVE_WORKFLOW_NAMED_OPERATION_INPUT_INVALID',
            `${bindingPointer}/fieldCode`
          );
        }
        fieldCodes.add(fieldCode);
        normalizedInputs[inputCode] = { source, fieldCode };
      } else {
        normalizedInputs[inputCode] = { source };
      }
    }
    if (
      [...requestRequired].some(inputCode => !(inputCode in inputs)) ||
      (sourceCounts.get('idempotency-key') || 0) !== 1 ||
      !inputEntries.some(
        ([inputCode, rawBinding]) =>
          object(rawBinding, `${intentPointer}/inputs/${inputCode}`).source ===
            'idempotency-key' && requestRequired.has(inputCode)
      ) ||
      (intentKind === 'create' &&
        ((sourceCounts.get('subject-id') || 0) > 0 ||
          (sourceCounts.get('subject-revision') || 0) > 0)) ||
      (intentKind === 'existing' &&
        ((sourceCounts.get('subject-id') || 0) !== 1 ||
          (sourceCounts.get('subject-revision') || 0) !== 1))
    ) {
      fail(
        'NATIVE_WORKFLOW_NAMED_OPERATION_INPUT_INVALID',
        `${intentPointer}/inputs`
      );
    }

    const output = object(intent.output, `${intentPointer}/output`);
    exactKeys(output, ['subjectId'], `${intentPointer}/output`, [
      'subjectRevision',
      'processCommand',
    ]);
    const responseProperties = object(
      object(
        operation.responseSchema,
        `${intentPointer}/operation/responseSchema`
      ).properties,
      `${intentPointer}/operation/responseSchema/properties`
    );
    for (const outputKey of [
      'subjectId',
      'subjectRevision',
      'processCommand',
    ]) {
      if (output[outputKey] === undefined) continue;
      const propertyCode = requiredString(
        output[outputKey],
        `${intentPointer}/output/${outputKey}`,
        128
      );
      if (
        !PROPERTY_CODE_PATTERN.test(propertyCode) ||
        !Object.prototype.hasOwnProperty.call(responseProperties, propertyCode)
      ) {
        fail(
          'NATIVE_WORKFLOW_NAMED_OPERATION_OUTPUT_INVALID',
          `${intentPointer}/output/${outputKey}`
        );
      }
    }
    return {
      operationCode,
      method: 'POST',
      path: operationContract.path,
      requiredCapability: operationContract.requiredCapability,
      requestSchemaDigest: operationContract.requestSchemaDigest,
      responseSchemaDigest: operationContract.responseSchemaDigest,
      inputs: normalizedInputs,
      output: { ...output },
      fieldCodes,
    };
  };

  const create =
    submission.create === undefined
      ? undefined
      : compileIntent(submission.create, 'create');
  const existing =
    submission.existing === undefined
      ? undefined
      : compileIntent(submission.existing, 'existing');
  if (!create && !existing) {
    fail(
      'NATIVE_WORKFLOW_NAMED_OPERATION_SUBMISSION_INVALID',
      `${pointer}/submission`
    );
  }
  const boundFields = new Set<string>([
    ...(create?.fieldCodes || []),
    ...(existing?.fieldCodes || []),
  ]);
  const contexts =
    submission.context === undefined
      ? []
      : boundedArray(submission.context, `${pointer}/submission/context`, 16);
  const queryParameters = new Set<string>();
  const context = contexts.map((rawContext, index) => {
    const contextPointer = `${pointer}/submission/context/${index}`;
    const item = object(rawContext, contextPointer);
    exactKeys(item, ['queryParameter', 'fieldCode'], contextPointer);
    const queryParameter = requiredString(
      item.queryParameter,
      `${contextPointer}/queryParameter`,
      64
    );
    const fieldCode = fieldCodeValue(
      item.fieldCode,
      `${contextPointer}/fieldCode`
    );
    if (
      !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(queryParameter) ||
      queryParameters.has(queryParameter) ||
      !boundFields.has(fieldCode)
    ) {
      fail('NATIVE_WORKFLOW_LAUNCH_CONTEXT_INVALID', contextPointer);
    }
    queryParameters.add(queryParameter);
    return { queryParameter, fieldCode };
  });
  const contractIntent = (intent: ReturnType<typeof compileIntent>) => {
    const { fieldCodes: _fieldCodes, ...contract } = intent;
    return contract;
  };
  return {
    mode: launch.mode,
    submission: {
      kind: 'named-operation',
      ...(create ? { create: contractIntent(create) } : {}),
      ...(existing ? { existing: contractIntent(existing) } : {}),
      context,
    },
  };
}

function validateWorkflowDetailRouteCode(value: unknown, pointer: string) {
  const detailRouteCode = object(value, pointer);
  exactKeys(detailRouteCode, ['desktop', 'mobile'], pointer);
  const desktop = stableCode(detailRouteCode.desktop, `${pointer}/desktop`);
  const mobile = stableCode(detailRouteCode.mobile, `${pointer}/mobile`);
  if (desktop === mobile) {
    fail('NATIVE_WORKFLOW_DETAIL_ROUTE_DUPLICATE', pointer);
  }
  return { desktop, mobile };
}

function validateAuthorizationReferences(
  config: JsonObject,
  capabilities: JsonObject[]
) {
  const capabilityCodes = new Set(capabilities.map(item => item.code));
  const forbiddenNativeMutationCapabilities = new Map<string, string>();
  config.data.resources.forEach((rawResource: unknown, index: number) => {
    const resourcePointer = `/config/data/resources/${index}`;
    const resource = object(rawResource, resourcePointer);
    for (const [fieldCode, rawPolicy] of Object.entries(resource.fieldPolicies || {})) {
      if (!isDataAuditMetadataField(fieldCode)) continue;
      const pointer = `${resourcePointer}/fieldPolicies/${fieldCode}/read`;
      const policy = object(rawPolicy, `${resourcePointer}/fieldPolicies/${fieldCode}`);
      for (const capability of uniqueStrings(policy.read || [], pointer, 2000)) {
        if (!capabilityCodes.has(capability)) {
          fail('NATIVE_CAPABILITY_REFERENCE_MISSING', pointer);
        }
      }
    }
    const surface =
      resource.surface === undefined
        ? {}
        : object(resource.surface, `${resourcePointer}/surface`);
    if ((surface.mutationOwner || 'native') === 'native') return;
    const resourceCapabilities = object(
      resource.capabilities,
      `${resourcePointer}/capabilities`
    );
    for (const operation of ['create', 'update', 'delete']) {
      forbiddenNativeMutationCapabilities.set(
        String(resourceCapabilities[operation]),
        operation
      );
    }
  });
  const roleCodes = new Set<string>();
  for (const [index, raw] of config.authz.roles.entries()) {
    const pointer = `/config/authz/roles/${index}`;
    const role = object(raw, pointer);
    exactKeys(
      role,
      ['code', 'name', 'description', 'capabilities'],
      pointer,
      true
    );
    const code = stableCode(role.code, `${pointer}/code`);
    if (roleCodes.has(code)) fail('NATIVE_ROLE_DUPLICATE', `${pointer}/code`);
    roleCodes.add(code);
    requiredString(role.name, `${pointer}/name`, 255);
    const roleCapabilities = uniqueStrings(
      role.capabilities,
      `${pointer}/capabilities`,
      2000
    );
    for (const [capabilityIndex, capability] of roleCapabilities.entries()) {
      if (forbiddenNativeMutationCapabilities.has(capability)) {
        fail(
          'NATIVE_DATA_SURFACE_MUTATION_GRANT_FORBIDDEN',
          `${pointer}/capabilities/${capabilityIndex}`,
          { operation: forbiddenNativeMutationCapabilities.get(capability) }
        );
      }
      if (!capabilityCodes.has(capability)) {
        fail('NATIVE_CAPABILITY_REFERENCE_MISSING', `${pointer}/capabilities`);
      }
    }
  }
  const authenticatedUserRoleCode =
    config.authz.authenticatedUserRoleCode === undefined
      ? ''
      : stableCode(
          config.authz.authenticatedUserRoleCode,
          '/config/authz/authenticatedUserRoleCode'
        );
  if (authenticatedUserRoleCode && !roleCodes.has(authenticatedUserRoleCode)) {
    fail(
      'NATIVE_AUTHENTICATED_USER_ROLE_REFERENCE_MISSING',
      '/config/authz/authenticatedUserRoleCode'
    );
  }
  const perspectiveCodes = new Set<string>();
  let defaultPerspectives = 0;
  for (const [index, raw] of config.perspectives.entries()) {
    const pointer = `/config/perspectives/${index}`;
    const perspective = object(raw, pointer);
    exactKeys(
      perspective,
      [
        'code',
        'name',
        'description',
        'roleCodes',
        'capabilityCodes',
        'default',
      ],
      pointer,
      true
    );
    const code = stableCode(perspective.code, `${pointer}/code`);
    if (perspectiveCodes.has(code)) {
      fail('NATIVE_PERSPECTIVE_DUPLICATE', `${pointer}/code`);
    }
    perspectiveCodes.add(code);
    requiredString(perspective.name, `${pointer}/name`, 255);
    const perspectiveRoleCodes = uniqueStrings(
      perspective.roleCodes,
      `${pointer}/roleCodes`,
      20
    );
    if (perspectiveRoleCodes.length < 1) {
      fail('NATIVE_PERSPECTIVE_ROLE_REQUIRED', `${pointer}/roleCodes`);
    }
    perspectiveRoleCodes.forEach((roleCode, roleIndex) => {
      if (!roleCodes.has(roleCode)) {
        fail(
          'NATIVE_PERSPECTIVE_ROLE_MISSING',
          `${pointer}/roleCodes/${roleIndex}`
        );
      }
    });
    const expectedCapabilities = uniqueSorted(
      config.authz.roles
        .filter((role: JsonObject) => perspectiveRoleCodes.includes(role.code))
        .flatMap((role: JsonObject) => role.capabilities)
    );
    const declaredCapabilities = uniqueStrings(
      perspective.capabilityCodes,
      `${pointer}/capabilityCodes`,
      2000
    );
    if (
      canonicalJson(expectedCapabilities) !==
      canonicalJson(declaredCapabilities)
    ) {
      fail(
        'NATIVE_PERSPECTIVE_CAPABILITY_PROJECTION_MISMATCH',
        `${pointer}/capabilityCodes`
      );
    }
    if (perspective.default === true) defaultPerspectives += 1;
    else if (perspective.default !== undefined) {
      fail('NATIVE_PERSPECTIVE_DEFAULT_INVALID', `${pointer}/default`);
    }
  }
  if (defaultPerspectives > 1) {
    fail('NATIVE_PERSPECTIVE_DEFAULT_DUPLICATE', '/config/perspectives');
  }
  for (const [index, raw] of config.backend.operations.entries()) {
    const item = object(raw, `/config/backend/operations/${index}`);
    if (!capabilityCodes.has(item.capability)) {
      fail(
        'NATIVE_CAPABILITY_REFERENCE_MISSING',
        `/config/backend/operations/${index}/capability`
      );
    }
  }
  const routeCodes = new Set<string>();
  const routePaths = new Set<string>();
  for (const [index, raw] of config.frontend.routes.entries()) {
    const pointer = `/config/frontend/routes/${index}`;
    const item = object(raw, pointer);
    const code = stableCode(item.code, `${pointer}/code`);
    if (routeCodes.has(code)) fail('NATIVE_ROUTE_DUPLICATE', `${pointer}/code`);
    routeCodes.add(code);
    const routePath = absolutePath(item.path, `${pointer}/path`);
    if (routePaths.has(routePath)) {
      fail('NATIVE_ROUTE_PATH_DUPLICATE', `${pointer}/path`);
    }
    routePaths.add(routePath);
    const routeAccess = normalizeRouteAccess(item, pointer, config.appCode);
    if (
      routeAccess.capability &&
      !capabilityCodes.has(routeAccess.capability)
    ) {
      fail('NATIVE_CAPABILITY_REFERENCE_MISSING', `${pointer}/capability`);
    }
    const sourceAccess =
      item.access === undefined
        ? undefined
        : object(item.access, `${pointer}/access`);
    for (const key of ['allOf', 'anyOf'] as const) {
      const sourceCapabilities =
        sourceAccess?.[key] === undefined
          ? []
          : boundedArray(sourceAccess[key], `${pointer}/access/${key}`, 50);
      for (const [
        capabilityIndex,
        rawCapability,
      ] of sourceCapabilities.entries()) {
        const capability = capabilityCode(
          rawCapability,
          `${pointer}/access/${key}/${capabilityIndex}`,
          config.appCode
        );
        if (!capabilityCodes.has(capability)) {
          fail(
            'NATIVE_CAPABILITY_REFERENCE_MISSING',
            `${pointer}/access/${key}/${capabilityIndex}`
          );
        }
      }
    }
  }
  if (config.frontend.admin.access !== undefined) {
    const adminAccess = normalizeAccessExpression(
      config.frontend.admin.access,
      '/config/frontend/admin/access',
      config.appCode
    );
    for (const key of ['allOf', 'anyOf'] as const) {
      for (const [capabilityIndex, capability] of (
        adminAccess[key] || []
      ).entries()) {
        if (!capabilityCodes.has(capability)) {
          fail(
            'NATIVE_CAPABILITY_REFERENCE_MISSING',
            `/config/frontend/admin/access/${key}/${capabilityIndex}`
          );
        }
      }
    }
  }
  for (const [index, raw] of config.frontend.routes.entries()) {
    const item = object(raw, `/config/frontend/routes/${index}`);
    if (item.parentCode && !routeCodes.has(item.parentCode)) {
      fail(
        'NATIVE_ROUTE_PARENT_MISSING',
        `/config/frontend/routes/${index}/parentCode`
      );
    }
  }
}

function validateDataPolicyReferences(config: JsonObject) {
  const roleCodes = new Set<string>(
    config.authz.roles.map((item: any) => String(item.code))
  );
  const authenticatedUserRoleCode =
    config.authz.authenticatedUserRoleCode === undefined
      ? ''
      : stableCode(
          config.authz.authenticatedUserRoleCode,
          '/config/authz/authenticatedUserRoleCode'
        );
  const dimensions = new Map<string, NativeScopeSourceDimensionV2>(
    config.authz.scopeDimensions.map((item: any) => [
      String(item.code),
      {
        valueType: item.valueType === 'uuid' ? 'uuid' : 'string',
        ...(item.valueSource?.resourceCode
          ? { valueSourceResourceCode: String(item.valueSource.resourceCode) }
          : {}),
      },
    ])
  );
  const dimensionCodes = new Set(dimensions.keys());
  const resourceFields = new Map<string, Map<string, NativeDataFieldV2>>(
    config.data.resources.map((raw: any, index: number) => {
      const resource = validateResource(
        raw,
        `/config/data/resources/${index}`,
        config.appCode
      );
      return [
        resource.code,
        new Map(
          resource.schema.fields.map((field: JsonObject) => [
            String(field.code),
            field as NativeDataFieldV2,
          ])
        ),
      ];
    })
  );
  for (const [index, raw] of config.authz.scopeDimensions.entries()) {
    const pointer = `/config/authz/scopeDimensions/${index}`;
    const dimension = object(raw, pointer);
    exactKeys(
      dimension,
      [
        'code',
        'name',
        'resourceCode',
        'valueType',
        'hierarchyMode',
        'valueSource',
      ],
      pointer,
      true
    );
    if (dimension.valueSource === undefined) continue;
    const source = object(dimension.valueSource, `${pointer}/valueSource`);
    exactKeys(
      source,
      ['kind', 'resourceCode', 'labelField', 'enabledField'],
      `${pointer}/valueSource`,
      true
    );
    if (source.kind !== 'native_resource') {
      fail(
        'NATIVE_SCOPE_VALUE_SOURCE_KIND_INVALID',
        `${pointer}/valueSource/kind`
      );
    }
    if (dimension.valueType !== 'uuid') {
      fail('NATIVE_SCOPE_VALUE_SOURCE_TYPE_INVALID', `${pointer}/valueType`);
    }
    const resourceCodeValue = resourceCode(
      source.resourceCode,
      `${pointer}/valueSource/resourceCode`
    );
    const fields = resourceFields.get(resourceCodeValue);
    if (!fields) {
      fail(
        'NATIVE_SCOPE_VALUE_SOURCE_RESOURCE_MISSING',
        `${pointer}/valueSource/resourceCode`
      );
    }
    const labelField = fieldCodeValue(
      source.labelField,
      `${pointer}/valueSource/labelField`
    );
    if (
      !['text.short', 'text.long'].includes(
        String(fields.get(labelField)?.type || '')
      )
    ) {
      fail(
        'NATIVE_SCOPE_VALUE_SOURCE_LABEL_FIELD_INVALID',
        `${pointer}/valueSource/labelField`
      );
    }
    if (source.enabledField !== undefined) {
      const enabledField = fieldCodeValue(
        source.enabledField,
        `${pointer}/valueSource/enabledField`
      );
      if (fields.get(enabledField)?.type !== 'boolean') {
        fail(
          'NATIVE_SCOPE_VALUE_SOURCE_ENABLED_FIELD_INVALID',
          `${pointer}/valueSource/enabledField`
        );
      }
    }
  }
  const sourceCodes = new Set<string>();
  const lastKnownGoodDimensions = new Set<string>();
  for (const [index, raw] of config.authz.scopeSources.entries()) {
    const pointer = `/config/authz/scopeSources/${index}`;
    const source = object(raw, pointer);
    exactKeys(
      source,
      [
        'code',
        'name',
        'resourceCode',
        'subject',
        'grants',
        'operationField',
        'enabledField',
        'effectiveFromField',
        'effectiveToField',
        'failureMode',
      ],
      pointer,
      true
    );
    const code = stableCode(source.code, `${pointer}/code`);
    if (sourceCodes.has(code)) {
      fail('NATIVE_SCOPE_SOURCE_DUPLICATE', `${pointer}/code`);
    }
    sourceCodes.add(code);
    requiredString(source.name, `${pointer}/name`, 255);
    const sourceResourceCode = resourceCode(
      source.resourceCode,
      `${pointer}/resourceCode`
    );
    const fields = resourceFields.get(sourceResourceCode);
    if (!fields) {
      fail('NATIVE_SCOPE_SOURCE_RESOURCE_MISSING', `${pointer}/resourceCode`);
    }
    const subject = object(source.subject, `${pointer}/subject`);
    const subjectType = requiredString(
      subject.type,
      `${pointer}/subject/type`,
      32
    );
    exactKeys(
      subject,
      subjectType === 'role_membership'
        ? ['type', 'userIdField', 'roleCode']
        : ['type', 'userIdField'],
      `${pointer}/subject`
    );
    if (!['user', 'role_membership'].includes(subjectType)) {
      fail('NATIVE_SCOPE_SOURCE_SUBJECT_INVALID', `${pointer}/subject/type`);
    }
    const userIdField = resolveNativeScopeSourceFieldPathV2(
      subject.userIdField,
      fields
    );
    if (!nativeScopeSourceSubjectPathSupportedV2(userIdField)) {
      fail(
        'NATIVE_SCOPE_SOURCE_SUBJECT_PATH_INVALID',
        `${pointer}/subject/userIdField`
      );
    }
    if (
      subjectType === 'role_membership' &&
      !roleCodes.has(String(subject.roleCode))
    ) {
      fail('NATIVE_ROLE_REFERENCE_MISSING', `${pointer}/subject/roleCode`);
    }
    const grantDimensions = new Set<string>();
    for (const [grantIndex, rawGrant] of boundedArray(
      source.grants,
      `${pointer}/grants`,
      100
    ).entries()) {
      const grantPointer = `${pointer}/grants/${grantIndex}`;
      const grant = object(rawGrant, grantPointer);
      exactKeys(
        grant,
        ['dimensionCode', 'valueField', 'parentValueField'],
        grantPointer,
        true
      );
      const dimensionCode = stableCode(
        grant.dimensionCode,
        `${grantPointer}/dimensionCode`
      );
      if (
        !dimensionCodes.has(dimensionCode) ||
        grantDimensions.has(dimensionCode)
      ) {
        fail(
          'NATIVE_SCOPE_SOURCE_DIMENSION_INVALID',
          `${grantPointer}/dimensionCode`
        );
      }
      grantDimensions.add(dimensionCode);
      if (source.failureMode === 'last_known_good') {
        lastKnownGoodDimensions.add(dimensionCode);
      }
      for (const fieldName of ['valueField', 'parentValueField']) {
        if (grant[fieldName] === undefined) continue;
        const field = resolveNativeScopeSourceFieldPathV2(
          grant[fieldName],
          fields
        );
        if (
          !nativeScopeSourceGrantPathSupportedV2(
            field,
            dimensions.get(dimensionCode),
            resourceFields
          )
        ) {
          fail(
            'NATIVE_SCOPE_SOURCE_GRANT_PATH_INVALID',
            `${grantPointer}/${fieldName}`
          );
        }
      }
    }
    if (grantDimensions.size === 0) {
      fail('NATIVE_SCOPE_SOURCE_GRANT_REQUIRED', `${pointer}/grants`);
    }
    if (!['strict', 'last_known_good'].includes(source.failureMode)) {
      fail(
        'NATIVE_SCOPE_SOURCE_FAILURE_MODE_INVALID',
        `${pointer}/failureMode`
      );
    }
    for (const fieldName of [
      'operationField',
      'enabledField',
      'effectiveFromField',
      'effectiveToField',
    ]) {
      if (source[fieldName] === undefined) continue;
      const field = fieldCodeValue(
        source[fieldName],
        `${pointer}/${fieldName}`
      );
      if (!fields.has(field)) {
        fail('NATIVE_SCOPE_SOURCE_FIELD_MISSING', `${pointer}/${fieldName}`);
      }
    }
  }
  validateStandardAuthorizationProjectionSources(
    config,
    roleCodes,
    resourceFields,
    authenticatedUserRoleCode
  );
  const policyCodes = new Set<string>();
  for (const [index, raw] of config.authz.dataPolicies.entries()) {
    const pointer = `/config/authz/dataPolicies/${index}`;
    const policy = object(raw, pointer);
    exactKeys(
      policy,
      [
        'code',
        'name',
        'resourceCode',
        'unrestrictedRoleCodes',
        'operations',
        'matchMode',
        'rules',
        'readExpression',
        'writeBoundary',
      ],
      pointer,
      true
    );
    const code = stableCode(policy.code, `${pointer}/code`);
    if (policyCodes.has(code))
      fail('NATIVE_DATA_POLICY_DUPLICATE', `${pointer}/code`);
    policyCodes.add(code);
    const hasReadExpression = policy.readExpression !== undefined;
    const operations = uniqueStrings(
      policy.operations || [],
      `${pointer}/operations`,
      4
    );
    if (
      policy.operations !== undefined &&
      (operations.length === 0 ||
        operations.some(
          operation =>
            !['read', 'create', 'update', 'delete'].includes(operation)
        ))
    ) {
      fail('NATIVE_DATA_POLICY_OPERATIONS_INVALID', `${pointer}/operations`);
    }
    if (!['AND', 'OR'].includes(policy.matchMode)) {
      fail('NATIVE_DATA_POLICY_MATCH_MODE_INVALID', `${pointer}/matchMode`);
    }
    if (hasReadExpression && policy.operations !== undefined) {
      fail(
        'NATIVE_DATA_POLICY_READ_EXPRESSION_OPERATIONS_FORBIDDEN',
        `${pointer}/operations`
      );
    }
    const boundResource = config.data.resources.find(
      (candidate: JsonObject) => candidate.dataPolicyCode === code
    );
    const policyResourceCode = policy.resourceCode || boundResource?.code;
    const policyFields = policyResourceCode
      ? resourceFields.get(
          resourceCode(policyResourceCode, `${pointer}/resourceCode`)
        )
      : undefined;
    if (hasReadExpression && !policyFields) {
      fail('NATIVE_DATA_POLICY_RESOURCE_MISSING', `${pointer}/resourceCode`);
    }
    const unrestrictedRoleCodes = uniqueStrings(
      policy.unrestrictedRoleCodes || [],
      `${pointer}/unrestrictedRoleCodes`,
      100
    );
    if (
      policy.unrestrictedRoleCodes !== undefined &&
      unrestrictedRoleCodes.length === 0
    ) {
      fail(
        'NATIVE_DATA_POLICY_UNRESTRICTED_ROLES_INVALID',
        `${pointer}/unrestrictedRoleCodes`
      );
    }
    for (const roleCode of unrestrictedRoleCodes) {
      if (!roleCodes.has(roleCode)) {
        fail(
          'NATIVE_ROLE_REFERENCE_MISSING',
          `${pointer}/unrestrictedRoleCodes`
        );
      }
    }
    let ruleEntries: Array<{ rule: JsonObject; pointer: string }>;
    try {
      const baseRules = boundedArray(policy.rules, `${pointer}/rules`, 100).map(
        (rawRule, ruleIndex) => ({
          rule: object(rawRule, `${pointer}/rules/${ruleIndex}`),
          pointer: `${pointer}/rules/${ruleIndex}`,
        })
      );
      if (baseRules.length === 0) {
        if (
          !hasReadExpression ||
          policy.matchMode !== 'AND' ||
          policy.writeBoundary !== 'capability_only'
        ) {
          fail('NATIVE_DATA_POLICY_WRITE_BOUNDARY_REQUIRED', pointer);
        }
      } else if (policy.writeBoundary !== undefined) {
        fail(
          'NATIVE_DATA_POLICY_WRITE_BOUNDARY_INVALID',
          `${pointer}/writeBoundary`
        );
      }
      ruleEntries = [...baseRules];
      if (hasReadExpression) {
        ruleEntries.push(
          ...nativeDataPolicyExpressionLeavesV2(
            policy.readExpression,
            `${pointer}/readExpression`
          )
        );
        nativeDataPolicyExpressionToCnfV2(
          policy.readExpression,
          `${pointer}/readExpression`
        );
      }
    } catch (error) {
      if (error instanceof NativeDataPolicyExpressionV2Error) {
        fail(error.code, error.pointer);
      }
      throw error;
    }
    for (const { rule, pointer: rulePointer } of ruleEntries) {
      exactKeys(
        rule,
        [
          'subject',
          'dimensionCode',
          'relationCode',
          'resourceCode',
          'field',
          'roleCodes',
          'operation',
          'valuePath',
          'emptyMatchesAll',
          'operator',
          'value',
          'operand',
        ],
        rulePointer,
        true
      );
      const field = fieldCodeValue(rule.field, `${rulePointer}/field`);
      const fieldDefinition = policyFields?.get(field);
      if (hasReadExpression && !fieldDefinition) {
        fail('NATIVE_DATA_POLICY_FIELD_MISSING', `${rulePointer}/field`);
      }
      for (const roleCode of uniqueStrings(
        rule.roleCodes || [],
        `${rulePointer}/roleCodes`,
        100
      )) {
        if (!roleCodes.has(roleCode)) {
          fail('NATIVE_ROLE_REFERENCE_MISSING', `${rulePointer}/roleCodes`);
        }
      }
      const operator = String(rule.operator || '');
      const dbNowPredicate = rule.operand === 'db_now';
      const nullPredicate = ['is_null', 'is_not_null'].includes(operator);
      const constantPredicate = ['eq', 'not_eq', 'in', 'not_in'].includes(
        operator
      );
      const constantSource =
        !dbNowPredicate &&
        (rule.operator !== undefined || rule.value !== undefined);
      const sourceModes = [
        rule.subject === 'current_user' ? 'current_user' : '',
        typeof rule.dimensionCode === 'string' ? 'dimension' : '',
        typeof rule.relationCode === 'string' ? 'relationship' : '',
        constantSource ? 'constant' : '',
        dbNowPredicate ? 'db_now' : '',
      ].filter(Boolean);
      if (sourceModes.length !== 1) {
        fail('NATIVE_DATA_POLICY_RULE_SOURCE_INVALID', rulePointer);
      }
      if (rule.subject !== undefined && rule.subject !== 'current_user') {
        fail('NATIVE_DATA_POLICY_SUBJECT_INVALID', `${rulePointer}/subject`);
      }
      if (constantSource) {
        if (!constantPredicate && !nullPredicate) {
          fail(
            'NATIVE_DATA_POLICY_OPERATOR_INVALID',
            `${rulePointer}/operator`
          );
        }
        if (['in', 'not_in'].includes(operator)) {
          const values = boundedArray(
            rule.value,
            `${rulePointer}/value`,
            100
          ).map((value, valueIndex) =>
            requiredString(value, `${rulePointer}/value/${valueIndex}`, 2048)
          );
          if (values.length === 0 || new Set(values).size !== values.length) {
            fail('NATIVE_DATA_POLICY_VALUE_INVALID', `${rulePointer}/value`);
          }
        } else if (['eq', 'not_eq'].includes(operator)) {
          requiredString(rule.value, `${rulePointer}/value`, 2048);
        } else if (rule.value !== undefined || rule.operand !== undefined) {
          fail('NATIVE_DATA_POLICY_VALUE_INVALID', `${rulePointer}/value`);
        }
        for (const forbidden of [
          'operation',
          'valuePath',
          'emptyMatchesAll',
          'resourceCode',
          'operand',
        ]) {
          if (rule[forbidden] !== undefined) {
            fail(
              'NATIVE_DATA_POLICY_CONSTANT_RULE_INVALID',
              `${rulePointer}/${forbidden}`
            );
          }
        }
      }
      if (dbNowPredicate) {
        if (
          !['lt', 'lte', 'gt', 'gte'].includes(operator) ||
          rule.value !== undefined ||
          fieldDefinition?.type !== 'datetime'
        ) {
          fail('NATIVE_DATA_POLICY_DB_NOW_INVALID', rulePointer);
        }
        for (const forbidden of [
          'operation',
          'valuePath',
          'emptyMatchesAll',
          'resourceCode',
          'value',
        ]) {
          if (rule[forbidden] !== undefined) {
            fail(
              'NATIVE_DATA_POLICY_DB_NOW_INVALID',
              `${rulePointer}/${forbidden}`
            );
          }
        }
      }
      if (rule.dimensionCode && !dimensionCodes.has(rule.dimensionCode)) {
        fail('NATIVE_SCOPE_DIMENSION_MISSING', `${rulePointer}/dimensionCode`);
      }
      if (
        lastKnownGoodDimensions.has(String(rule.dimensionCode || '')) &&
        rule.operation !== 'read'
      ) {
        fail(
          'NATIVE_SCOPE_SOURCE_LAST_KNOWN_GOOD_UNSAFE',
          `${rulePointer}/operation`
        );
      }
    }
  }
  for (const [index, raw] of config.data.resources.entries()) {
    const resource = object(raw, `/config/data/resources/${index}`);
    if (resource.dataPolicyCode && !policyCodes.has(resource.dataPolicyCode)) {
      fail(
        'NATIVE_DATA_POLICY_REFERENCE_MISSING',
        `/config/data/resources/${index}/dataPolicyCode`
      );
    }
  }
}

function validateDataFieldReferences(config: JsonObject) {
  try {
    validateNativeDataResourceReferencesV2(
      config.data.resources,
      '/config/data/resources'
    );
  } catch (error) {
    if (error instanceof NativeDataFieldContractV2Error) {
      fail(error.code, error.pointer);
    }
    throw error;
  }
}

function validateStandardAuthorizationProjectionSources(
  config: JsonObject,
  roleCodes: Set<string>,
  resourceFields: Map<string, Map<string, NativeDataFieldV2>>,
  authenticatedUserRoleCode: string
) {
  const sourceCodes = new Set<string>();
  for (const [index, raw] of config.authz.roleMembershipSources.entries()) {
    const pointer = `/config/authz/roleMembershipSources/${index}`;
    const source = object(raw, pointer);
    exactKeys(
      source,
      [
        'code',
        'name',
        'resourceCode',
        'userIdField',
        'roleCode',
        'enabledField',
        'effectiveFromField',
        'effectiveToField',
        'failureMode',
      ],
      pointer,
      true
    );
    const sourceCode = stableCode(source.code, `${pointer}/code`);
    if (sourceCode.length > 100) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_SOURCE_CODE_INVALID',
        `${pointer}/code`
      );
    }
    if (sourceCodes.has(sourceCode)) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_SOURCE_DUPLICATE',
        `${pointer}/code`
      );
    }
    sourceCodes.add(sourceCode);
    requiredString(source.name, `${pointer}/name`, 255);
    const fields = authorizationProjectionResourceFields(
      source.resourceCode,
      `${pointer}/resourceCode`,
      resourceFields
    );
    authorizationProjectionUserField(
      source.userIdField,
      `${pointer}/userIdField`,
      fields
    );
    if (!roleCodes.has(String(source.roleCode || ''))) {
      fail('NATIVE_ROLE_REFERENCE_MISSING', `${pointer}/roleCode`);
    }
    if (
      authenticatedUserRoleCode &&
      source.roleCode === authenticatedUserRoleCode
    ) {
      fail(
        'NATIVE_AUTHENTICATED_USER_ROLE_SOURCE_CONFLICT',
        `${pointer}/roleCode`
      );
    }
    validateAuthorizationProjectionControlFields(source, pointer, fields);
  }

  for (const [index, raw] of config.authz.relationshipGrantSources.entries()) {
    const pointer = `/config/authz/relationshipGrantSources/${index}`;
    const source = object(raw, pointer);
    exactKeys(
      source,
      [
        'code',
        'name',
        'resourceCode',
        'subject',
        'relationCode',
        'targetResourceCode',
        'resourceIdField',
        'operations',
        'enabledField',
        'effectiveFromField',
        'effectiveToField',
        'failureMode',
      ],
      pointer,
      true
    );
    const sourceCode = stableCode(source.code, `${pointer}/code`);
    if (sourceCode.length > 100) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_SOURCE_CODE_INVALID',
        `${pointer}/code`
      );
    }
    if (sourceCodes.has(sourceCode)) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_SOURCE_DUPLICATE',
        `${pointer}/code`
      );
    }
    sourceCodes.add(sourceCode);
    requiredString(source.name, `${pointer}/name`, 255);
    const fields = authorizationProjectionResourceFields(
      source.resourceCode,
      `${pointer}/resourceCode`,
      resourceFields
    );
    const subject = object(source.subject, `${pointer}/subject`);
    const subjectType = requiredString(
      subject.type,
      `${pointer}/subject/type`,
      32
    );
    exactKeys(
      subject,
      subjectType === 'role_membership'
        ? ['type', 'userIdField', 'roleCode']
        : ['type', 'userIdField'],
      `${pointer}/subject`
    );
    if (!['user', 'role_membership'].includes(subjectType)) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_SUBJECT_INVALID',
        `${pointer}/subject/type`
      );
    }
    authorizationProjectionUserField(
      subject.userIdField,
      `${pointer}/subject/userIdField`,
      fields
    );
    if (
      subjectType === 'role_membership' &&
      !roleCodes.has(String(subject.roleCode || ''))
    ) {
      fail('NATIVE_ROLE_REFERENCE_MISSING', `${pointer}/subject/roleCode`);
    }
    stableCode(source.relationCode, `${pointer}/relationCode`);
    const targetResourceCode = resourceCode(
      source.targetResourceCode,
      `${pointer}/targetResourceCode`
    );
    if (!resourceFields.has(targetResourceCode)) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_TARGET_RESOURCE_MISSING',
        `${pointer}/targetResourceCode`
      );
    }
    const resourceIdField = resolveNativeScopeSourceFieldPathV2(
      source.resourceIdField,
      fields
    );
    const resourceIdReferenceValid = Boolean(
      resourceIdField?.field.type === 'resource-ref.single' &&
        resourceIdField.valuePath === 'value' &&
        resourceIdField.field.source?.resourceCode === targetResourceCode
    );
    if (
      source.resourceIdField === 'id'
        ? targetResourceCode !== String(source.resourceCode)
        : !resourceIdReferenceValid
    ) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_RESOURCE_ID_FIELD_INVALID',
        `${pointer}/resourceIdField`
      );
    }
    const operations = uniqueStrings(
      source.operations,
      `${pointer}/operations`,
      20
    );
    if (
      operations.length === 0 ||
      operations.some(
        operation =>
          operation.length > 64 ||
          !/^[A-Za-z0-9][A-Za-z0-9:._*-]{0,63}$/.test(operation)
      )
    ) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_OPERATIONS_INVALID',
        `${pointer}/operations`
      );
    }
    validateAuthorizationProjectionControlFields(source, pointer, fields);
  }
}

function authorizationProjectionResourceFields(
  value: unknown,
  pointer: string,
  resourceFields: Map<string, Map<string, NativeDataFieldV2>>
) {
  const code = resourceCode(value, pointer);
  const fields = resourceFields.get(code);
  if (!fields) {
    fail('NATIVE_AUTHORIZATION_PROJECTION_RESOURCE_MISSING', pointer);
  }
  return fields;
}

function authorizationProjectionUserField(
  value: unknown,
  pointer: string,
  fields: Map<string, NativeDataFieldV2>
) {
  const field = resolveNativeScopeSourceFieldPathV2(value, fields);
  if (!nativeScopeSourceSubjectPathSupportedV2(field)) {
    fail('NATIVE_AUTHORIZATION_PROJECTION_USER_FIELD_INVALID', pointer);
  }
}

function validateAuthorizationProjectionControlFields(
  source: JsonObject,
  pointer: string,
  fields: Map<string, NativeDataFieldV2>
) {
  if (source.failureMode !== 'strict') {
    fail(
      'NATIVE_AUTHORIZATION_PROJECTION_FAILURE_MODE_INVALID',
      `${pointer}/failureMode`
    );
  }
  if (source.enabledField !== undefined) {
    const enabledField = fieldCodeValue(
      source.enabledField,
      `${pointer}/enabledField`
    );
    if (fields.get(enabledField)?.type !== 'boolean') {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_ENABLED_FIELD_INVALID',
        `${pointer}/enabledField`
      );
    }
  }
  for (const fieldName of ['effectiveFromField', 'effectiveToField'] as const) {
    if (source[fieldName] === undefined) continue;
    const field = fieldCodeValue(source[fieldName], `${pointer}/${fieldName}`);
    if (!['date', 'datetime'].includes(String(fields.get(field)?.type))) {
      fail(
        'NATIVE_AUTHORIZATION_PROJECTION_EFFECTIVE_FIELD_INVALID',
        `${pointer}/${fieldName}`
      );
    }
  }
}

function validateBackendSecrets(rawSecrets: any[]) {
  const names = new Set<string>();
  const envs = new Set<string>();
  rawSecrets.forEach((raw, index) => {
    const pointer = `/config/backend/secrets/${index}`;
    const secret = object(raw, pointer);
    exactKeys(
      secret,
      ['name', 'env', 'description', 'required', 'exposure'],
      pointer,
      true
    );
    const name = requiredString(secret.name, `${pointer}/name`, 128);
    const env = requiredString(secret.env, `${pointer}/env`, 128);
    if (!SECRET_NAME_PATTERN.test(name)) {
      fail('NATIVE_SECRET_NAME_INVALID', `${pointer}/name`);
    }
    if (
      !SECRET_ENV_PATTERN.test(env) ||
      env.startsWith('OPENXIANGDA_') ||
      ['NODE_ENV', 'PORT'].includes(env)
    ) {
      fail('NATIVE_SECRET_ENV_INVALID', `${pointer}/env`);
    }
    if (names.has(name))
      fail('NATIVE_SECRET_NAME_DUPLICATE', `${pointer}/name`);
    if (envs.has(env)) fail('NATIVE_SECRET_ENV_DUPLICATE', `${pointer}/env`);
    names.add(name);
    envs.add(env);
    equal(secret.exposure, 'active_only', `${pointer}/exposure`);
    if (secret.required !== undefined) {
      boolean(secret.required, `${pointer}/required`);
    }
    if (secret.description !== undefined) {
      optionalString(secret.description, `${pointer}/description`, 2000);
    }
  });
}

function validateWorkflowReferences(config: JsonObject) {
  const definitions = new Set<string>();
  const definitionValues = new Map<string, JsonObject>();
  const resources = new Map<string, JsonObject>(
    config.data.resources.map((resource: JsonObject) => [
      String(resource.code),
      resource,
    ])
  );
  const frontendRoutesByCode = new Map<string, JsonObject>(
    config.frontend.routes.map((raw: unknown, index: number) => {
      const route = object(raw, `/config/frontend/routes/${index}`);
      return [
        stableCode(route.code, `/config/frontend/routes/${index}/code`),
        route,
      ];
    })
  );
  for (const [index, raw] of config.workflows.definitions.entries()) {
    const pointer = `/config/workflows/definitions/${index}`;
    const item = object(raw, pointer);
    exactKeys(item, ['version', 'definition', 'launch'], pointer, [
      'detailRouteCode',
    ]);
    validateWorkflowLaunch(item.launch, `${pointer}/launch`);
    if (item.detailRouteCode !== undefined) {
      const detailRouteCode = validateWorkflowDetailRouteCode(
        item.detailRouteCode,
        `${pointer}/detailRouteCode`
      );
      for (const [device, routeCode, expectedSurface] of [
        ['desktop', detailRouteCode.desktop, 'admin'],
        ['mobile', detailRouteCode.mobile, 'user'],
      ] as const) {
        const routePointer = `${pointer}/detailRouteCode/${device}`;
        const route = frontendRoutesByCode.get(routeCode);
        if (!route) {
          fail('NATIVE_WORKFLOW_DETAIL_ROUTE_MISSING', routePointer);
        }
        if (route.surface !== expectedSurface) {
          fail('NATIVE_WORKFLOW_DETAIL_ROUTE_SURFACE_INVALID', routePointer);
        }
        const routePath = absolutePath(route.path, routePointer);
        const parameters = [
          ...routePath.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g),
        ].map(match => match[1]);
        if (
          routePath.includes('*') ||
          parameters.length !== 1 ||
          parameters[0] !== 'instanceId'
        ) {
          fail('NATIVE_WORKFLOW_DETAIL_ROUTE_PATH_INVALID', routePointer);
        }
      }
    }
    const definition = object(item.definition, `${pointer}/definition`);
    const key = `${definition.code}:${positiveInteger(
      item.version,
      `${pointer}/version`
    )}`;
    if (definitions.has(key)) {
      fail('NATIVE_WORKFLOW_DEFINITION_DUPLICATE', pointer);
    }
    definitions.add(key);
    validateWorkflowDefinition(definition, `${pointer}/definition`);
    validateWorkflowSubject(
      definition.subject,
      resources,
      `${pointer}/definition/subject`
    );
    const policyErrors = validateWorkflowInstanceCommandPolicies(definition, {
      appCode: config.appCode,
      capabilities: config.authz.capabilities.map((item: JsonObject) => item.code),
      fields: new Map((resources.get(definition.subject.resourceCode)?.schema.fields || [])
        .map((field: JsonObject) => [field.code, field])),
    });
    if (policyErrors.length) {
      fail('NATIVE_WORKFLOW_INSTANCE_COMMAND_POLICY_INVALID', `${pointer}/definition/instanceCommands`, {
        errors: policyErrors,
      });
    }
    if (definition.title === definition.code) {
      fail(
        'NATIVE_WORKFLOW_USER_TITLE_REQUIRED',
        `${pointer}/definition/title`
      );
    }
    definitionValues.set(key, definition);
  }
  const bindings = new Set<string>();
  const bindingValues = new Map<string, JsonObject>();
  for (const [index, raw] of config.workflows.bindings.entries()) {
    const item = object(raw, `/config/workflows/bindings/${index}`);
    const binding = object(
      item.binding,
      `/config/workflows/bindings/${index}/binding`
    );
    const key = `${binding.workflowCode}:${positiveInteger(
      item.version,
      `/config/workflows/bindings/${index}/version`
    )}`;
    if (bindings.has(key)) {
      fail(
        'NATIVE_WORKFLOW_BINDING_DUPLICATE',
        `/config/workflows/bindings/${index}`
      );
    }
    bindings.add(key);
    validateWorkflowBinding(
      binding,
      `/config/workflows/bindings/${index}/binding`
    );
    bindingValues.set(key, binding);
  }
  const activationCodes = new Set<string>();
  const activeBindings = new Map<string, JsonObject>();
  for (const [index, raw] of config.workflows.activations.entries()) {
    const pointer = `/config/workflows/activations/${index}`;
    const activation = object(raw, pointer);
    exactKeys(
      activation,
      [
        'workflowCode',
        'definitionVersion',
        'bindingVersion',
        'acceptedCommandDeactivationPolicy',
      ],
      pointer,
      ['environmentKey']
    );
    const code = stableCode(activation.workflowCode, `${pointer}/workflowCode`);
    if (activationCodes.has(code))
      fail('NATIVE_WORKFLOW_ACTIVATION_DUPLICATE', pointer);
    activationCodes.add(code);
    const definitionKey = `${code}:${positiveInteger(
      activation.definitionVersion,
      `${pointer}/definitionVersion`
    )}`;
    const bindingKey = `${code}:${positiveInteger(
      activation.bindingVersion,
      `${pointer}/bindingVersion`
    )}`;
    if (!definitions.has(definitionKey)) {
      fail(
        'NATIVE_WORKFLOW_DEFINITION_REFERENCE_MISSING',
        `${pointer}/definitionVersion`
      );
    }
    if (!bindings.has(bindingKey)) {
      fail(
        'NATIVE_WORKFLOW_BINDING_REFERENCE_MISSING',
        `${pointer}/bindingVersion`
      );
    }
    const definition = definitionValues.get(definitionKey)!;
    const binding = bindingValues.get(bindingKey)!;
    if (
      !['finish-pinned', 'cancel-on-deactivate'].includes(
        activation.acceptedCommandDeactivationPolicy
      ) ||
      activation.acceptedCommandDeactivationPolicy !==
        definition.acceptedCommandDeactivationPolicy
    ) {
      fail(
        'NATIVE_WORKFLOW_COMMAND_DEACTIVATION_POLICY_MISMATCH',
        `${pointer}/acceptedCommandDeactivationPolicy`
      );
    }
    validateWorkflowDefinitionBinding(
      definition,
      binding,
      `/config/workflows/activations/${index}`
    );
    activeBindings.set(code, binding);
  }

  const providerCodes = new Set<string>();
  config.workflows.providers.forEach((raw: any, index: number) => {
    const pointer = `/config/workflows/providers/${index}`;
    const provider = object(raw, pointer);
    exactKeys(provider, ['code', 'endpointPath', 'timeoutMs'], pointer, true);
    const code = stableCode(provider.code, `${pointer}/code`);
    if (providerCodes.has(code))
      fail('NATIVE_WORKFLOW_PROVIDER_DUPLICATE', `${pointer}/code`);
    providerCodes.add(code);
    absolutePath(provider.endpointPath, `${pointer}/endpointPath`);
    if (provider.timeoutMs !== undefined) {
      boundedInteger(provider.timeoutMs, `${pointer}/timeoutMs`, 100, 10000);
    }
  });
  for (const [workflowCode, binding] of activeBindings.entries()) {
    for (const [bindingCode, rawEntry] of Object.entries(
      object(binding.bindings, '/config/workflows/bindings/*/binding/bindings')
    )) {
      const entry = object(
        rawEntry,
        `/config/workflows/${workflowCode}/bindings/${bindingCode}`
      );
      if (
        entry.provider === 'application_provider' &&
        !providerCodes.has(entry.providerCode)
      ) {
        fail(
          'NATIVE_WORKFLOW_PROVIDER_REFERENCE_MISSING',
          `/config/workflows/${workflowCode}/bindings/${bindingCode}/providerCode`
        );
      }
    }
  }
  const roleCodes = new Set(config.authz.roles.map((item: any) => item.code));
  const parameterCodes = new Set<string>();
  config.workflows.editableParameters.forEach((raw: any, index: number) => {
    const pointer = `/config/workflows/editableParameters/${index}`;
    const parameter = object(raw, pointer);
    exactKeys(
      parameter,
      [
        'code',
        'workflowCode',
        'bindingKey',
        'label',
        'valueType',
        'required',
        'allowedRoleCodes',
        'allowedProviderCodes',
        'maxItems',
      ],
      pointer,
      true
    );
    const code = stableCode(parameter.code, `${pointer}/code`);
    if (parameterCodes.has(code)) {
      fail('NATIVE_WORKFLOW_EDITABLE_PARAMETER_DUPLICATE', `${pointer}/code`);
    }
    parameterCodes.add(code);
    const workflowCode = workflowCodeValue(
      parameter.workflowCode,
      `${pointer}/workflowCode`
    );
    const bindingKey = workflowBindingCode(
      parameter.bindingKey,
      `${pointer}/bindingKey`
    );
    const activeBinding = activeBindings.get(workflowCode);
    if (
      !activeBinding ||
      !object(activeBinding.bindings, `${pointer}/bindingKey`)[bindingKey]
    ) {
      fail('NATIVE_WORKFLOW_EDITABLE_BINDING_MISSING', `${pointer}/bindingKey`);
    }
    requiredString(parameter.label, `${pointer}/label`, 255);
    if (
      !['role_code', 'user_ids', 'provider_code'].includes(parameter.valueType)
    ) {
      fail(
        'NATIVE_WORKFLOW_EDITABLE_VALUE_TYPE_INVALID',
        `${pointer}/valueType`
      );
    }
    for (const roleCode of uniqueStrings(
      parameter.allowedRoleCodes || [],
      `${pointer}/allowedRoleCodes`,
      100
    )) {
      if (!roleCodes.has(roleCode)) {
        fail('NATIVE_ROLE_REFERENCE_MISSING', `${pointer}/allowedRoleCodes`);
      }
    }
    for (const providerCode of uniqueStrings(
      parameter.allowedProviderCodes || [],
      `${pointer}/allowedProviderCodes`,
      100
    )) {
      if (!providerCodes.has(providerCode)) {
        fail(
          'NATIVE_WORKFLOW_PROVIDER_REFERENCE_MISSING',
          `${pointer}/allowedProviderCodes`
        );
      }
    }
    if (parameter.required !== undefined)
      boolean(parameter.required, `${pointer}/required`);
    if (parameter.maxItems !== undefined) {
      boundedInteger(parameter.maxItems, `${pointer}/maxItems`, 1, 200);
    }
  });
}

function validateWorkflowSubject(
  value: unknown,
  resources: Map<string, JsonObject>,
  pointer: string
) {
  const subject = object(value, pointer);
  exactKeys(subject, ['resourceCode', 'factProjection'], pointer, [
    'summaryFields',
  ]);
  const subjectResourceCode = resourceCode(
    subject.resourceCode,
    `${pointer}/resourceCode`
  );
  const resource = resources.get(subjectResourceCode);
  if (!resource) {
    fail('NATIVE_WORKFLOW_SUBJECT_RESOURCE_MISSING', `${pointer}/resourceCode`);
  }
  const fields = new Set(
    boundedArray(
      object(resource.schema, `${pointer}/resourceCode`).fields,
      `${pointer}/resourceCode`,
      500
    ).map((rawField, index) =>
      fieldCodeValue(
        object(rawField, `${pointer}/resourceCode/${index}`).code,
        `${pointer}/resourceCode/${index}`
      )
    )
  );
  const projection = object(
    subject.factProjection,
    `${pointer}/factProjection`
  );
  const entries = Object.entries(projection);
  if (entries.length < 1 || entries.length > 64) {
    fail(
      'NATIVE_WORKFLOW_SUBJECT_FACT_PROJECTION_INVALID',
      `${pointer}/factProjection`
    );
  }
  for (const [factKey, field] of entries) {
    if (!WORKFLOW_FACT_KEY_PATTERN.test(factKey)) {
      fail(
        'NATIVE_WORKFLOW_SUBJECT_FACT_KEY_INVALID',
        `${pointer}/factProjection/${factKey}`
      );
    }
    const fieldValue = fieldCodeValue(
      field,
      `${pointer}/factProjection/${factKey}`
    );
    if (!fields.has(fieldValue)) {
      fail(
        'NATIVE_WORKFLOW_SUBJECT_FIELD_MISSING',
        `${pointer}/factProjection/${factKey}`
      );
    }
  }

  if (subject.summaryFields !== undefined) {
    const summaryFields = uniqueStrings(
      subject.summaryFields,
      `${pointer}/summaryFields`,
      WORKFLOW_SUMMARY_MAX_FIELDS
    ).map((field, index) =>
      fieldCodeValue(field, `${pointer}/summaryFields/${index}`)
    );
    const resource = resources.get(subjectResourceCode)!;
    const resourceSurface =
      resource.surface &&
      typeof resource.surface === 'object' &&
      !Array.isArray(resource.surface)
        ? (resource.surface as JsonObject)
        : {};
    const surfaceFields =
      resourceSurface.fields &&
      typeof resourceSurface.fields === 'object' &&
      !Array.isArray(resourceSurface.fields)
        ? (resourceSurface.fields as JsonObject)
        : {};
    const resourceFields = new Map<string, JsonObject>(
      boundedArray(
        object(resource.schema, `${pointer}/resourceCode`).fields,
        `${pointer}/resourceCode`,
        500
      ).map((rawField, index) => {
        const field = object(
          rawField,
          `${pointer}/resourceCode/${index}`
        );
        return [String(field.code), field];
      })
    );
    for (const [index, fieldCode] of summaryFields.entries()) {
      const field = resourceFields.get(fieldCode);
      const surfaceField = surfaceFields[fieldCode];
      const fieldType = String(field?.type || '');
      const maxLength = field?.maxLength;
      if (
        !field ||
        field.system === true ||
        (surfaceField &&
          typeof surfaceField === 'object' &&
          !Array.isArray(surfaceField) &&
          (surfaceField as JsonObject).system === true) ||
        [
          'id',
          'revision',
          'created_by',
          'updated_by',
          'created_at',
          'updated_at',
        ].includes(fieldCode) ||
        !WORKFLOW_SUMMARY_FIELD_TYPES.has(fieldType) ||
        (fieldType === 'text.long' &&
          typeof maxLength === 'number' &&
          Number.isFinite(maxLength) &&
          maxLength > WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES)
      ) {
        fail(
          'NATIVE_WORKFLOW_SUBJECT_SUMMARY_FIELDS_INVALID',
          `${pointer}/summaryFields/${index}`
        );
      }
    }
  }
}

function validateWorkflowDefinition(definition: JsonObject, pointer: string) {
  exactKeys(
    definition,
    [
      'schemaVersion',
      'code',
      'title',
      'subject',
      'acceptedCommandDeactivationPolicy',
      'startAt',
      'inputSchema',
      'nodes',
    ],
    pointer,
    ['organizationContext', 'instanceCommands']
  );
  equal(
    definition.schemaVersion,
    'openxiangda.workflow-definition/v2',
    `${pointer}/schemaVersion`
  );
  workflowCodeValue(definition.code, `${pointer}/code`);
  requiredString(definition.title, `${pointer}/title`, 255);
  if (
    !['finish-pinned', 'cancel-on-deactivate'].includes(
      definition.acceptedCommandDeactivationPolicy
    )
  ) {
    fail(
      'NATIVE_WORKFLOW_COMMAND_DEACTIVATION_POLICY_REQUIRED',
      `${pointer}/acceptedCommandDeactivationPolicy`
    );
  }
  const nodes = object(definition.nodes, `${pointer}/nodes`);
  const nodeIds = Object.keys(nodes);
  if (nodeIds.length === 0 || nodeIds.length > 200) {
    fail('NATIVE_WORKFLOW_NODE_COUNT_INVALID', `${pointer}/nodes`);
  }
  const startAt = requiredString(definition.startAt, `${pointer}/startAt`, 128);
  if (!nodes[startAt])
    fail('NATIVE_WORKFLOW_START_NODE_MISSING', `${pointer}/startAt`);
  const edges = new Map<string, string[]>();
  for (const [nodeId, rawNode] of Object.entries(nodes)) {
    const nodePointer = `${pointer}/nodes/${nodeId}`;
    const node = object(rawNode, nodePointer);
    equal(node.id, nodeId, `${nodePointer}/id`);
    if (!['approval', 'condition', 'end'].includes(node.kind)) {
      fail('NATIVE_WORKFLOW_NODE_KIND_INVALID', `${nodePointer}/kind`);
    }
    const targets: string[] = [];
    if (node.kind === 'approval') {
      workflowBindingCode(node.binding, `${nodePointer}/binding`);
      if (!['single', 'any', 'all', 'sequence'].includes(node.mode)) {
        fail('NATIVE_WORKFLOW_APPROVAL_MODE_INVALID', `${nodePointer}/mode`);
      }
      targets.push(
        requiredString(node.onApprove, `${nodePointer}/onApprove`, 128),
        requiredString(node.onReject, `${nodePointer}/onReject`, 128)
      );
      for (const returnTarget of uniqueStrings(
        node.returnTargets || [],
        `${nodePointer}/returnTargets`,
        200
      )) {
        if (!nodes[returnTarget]) {
          fail(
            'NATIVE_WORKFLOW_TARGET_MISSING',
            `${nodePointer}/returnTargets`
          );
        }
      }
      for (const operation of uniqueStrings(
        node.allowedOperations || [],
        `${nodePointer}/allowedOperations`,
        20
      )) {
        if (!WORKFLOW_OPERATIONS.has(operation)) {
          fail(
            'NATIVE_WORKFLOW_OPERATION_INVALID',
            `${nodePointer}/allowedOperations`
          );
        }
      }
    } else if (node.kind === 'condition') {
      const branches = boundedArray(
        node.branches,
        `${nodePointer}/branches`,
        100
      );
      if (branches.length === 0) {
        fail('NATIVE_WORKFLOW_BRANCH_REQUIRED', `${nodePointer}/branches`);
      }
      branches.forEach((rawBranch, index) => {
        const branch = object(rawBranch, `${nodePointer}/branches/${index}`);
        validateWorkflowExpression(
          branch.when,
          `${nodePointer}/branches/${index}/when`,
          0
        );
        targets.push(
          requiredString(
            branch.target,
            `${nodePointer}/branches/${index}/target`,
            128
          )
        );
      });
      targets.push(
        requiredString(node.otherwise, `${nodePointer}/otherwise`, 128)
      );
    } else {
      requiredString(node.outcome, `${nodePointer}/outcome`, 128);
    }
    for (const target of targets) {
      if (!nodes[target]) fail('NATIVE_WORKFLOW_TARGET_MISSING', nodePointer);
    }
    edges.set(nodeId, targets);
  }
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const walk = (nodeId: string) => {
    if (visiting.has(nodeId))
      fail('NATIVE_WORKFLOW_CYCLE_FORBIDDEN', `${pointer}/nodes/${nodeId}`);
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    visiting.add(nodeId);
    for (const target of edges.get(nodeId) || []) walk(target);
    visiting.delete(nodeId);
  };
  walk(startAt);
  if (reachable.size !== nodeIds.length) {
    fail('NATIVE_WORKFLOW_NODE_UNREACHABLE', `${pointer}/nodes`);
  }
}

function validateWorkflowExpression(
  value: unknown,
  pointer: string,
  depth: number
) {
  if (depth > 20) fail('NATIVE_WORKFLOW_EXPRESSION_DEPTH_EXCEEDED', pointer);
  const expression = object(value, pointer);
  const op = requiredString(expression.op, `${pointer}/op`, 16);
  if (op === 'literal') return;
  if (op === 'path') {
    const path = requiredString(expression.path, `${pointer}/path`, 255);
    if (!/^[A-Za-z][A-Za-z0-9_.]{0,254}$/.test(path)) {
      fail('NATIVE_WORKFLOW_EXPRESSION_PATH_INVALID', `${pointer}/path`);
    }
    return;
  }
  if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'].includes(op)) {
    validateWorkflowExpression(expression.left, `${pointer}/left`, depth + 1);
    validateWorkflowExpression(expression.right, `${pointer}/right`, depth + 1);
    return;
  }
  if (['and', 'or'].includes(op)) {
    const values = boundedArray(expression.values, `${pointer}/values`, 100);
    if (values.length === 0)
      fail('NATIVE_WORKFLOW_EXPRESSION_EMPTY', `${pointer}/values`);
    values.forEach((item, index) =>
      validateWorkflowExpression(item, `${pointer}/values/${index}`, depth + 1)
    );
    return;
  }
  if (['not', 'exists'].includes(op)) {
    validateWorkflowExpression(expression.value, `${pointer}/value`, depth + 1);
    return;
  }
  fail('NATIVE_WORKFLOW_EXPRESSION_OPERATOR_INVALID', `${pointer}/op`);
}

function validateWorkflowBinding(binding: JsonObject, pointer: string) {
  equal(
    binding.schemaVersion,
    'openxiangda.workflow-binding/v2',
    `${pointer}/schemaVersion`
  );
  workflowCodeValue(binding.workflowCode, `${pointer}/workflowCode`);
  const entries = object(binding.bindings, `${pointer}/bindings`);
  if (Object.keys(entries).length > 200) {
    fail('NATIVE_WORKFLOW_BINDING_LIMIT_EXCEEDED', `${pointer}/bindings`);
  }
  for (const [code, raw] of Object.entries(entries)) {
    workflowBindingCode(code, `${pointer}/bindings/${code}`);
    const entry = object(raw, `${pointer}/bindings/${code}`);
    const provider = requiredString(
      entry.provider,
      `${pointer}/bindings/${code}/provider`,
      64
    );
    if (
      ![
        'fixed_users',
        'initiator',
        'input_users',
        'form_field_users',
        'department_supervisor',
        'app_role',
        'app_role_in_scope',
        'business_relation',
        'previous_node_actor',
        'initiator_select',
        'application_provider',
      ].includes(provider)
    ) {
      fail(
        'NATIVE_WORKFLOW_BINDING_PROVIDER_INVALID',
        `${pointer}/bindings/${code}/provider`
      );
    }
    if (
      provider === 'fixed_users' &&
      boundedArray(entry.users, `${pointer}/bindings/${code}/users`, 200)
        .length === 0
    ) {
      fail(
        'NATIVE_WORKFLOW_BINDING_USERS_REQUIRED',
        `${pointer}/bindings/${code}/users`
      );
    }
    if (['input_users', 'form_field_users'].includes(provider)) {
      requiredString(
        entry.inputPath,
        `${pointer}/bindings/${code}/inputPath`,
        255
      );
    }
    if (
      ['app_role', 'app_role_in_scope', 'initiator_select'].includes(provider)
    ) {
      stableCode(entry.roleCode, `${pointer}/bindings/${code}/roleCode`);
    }
    if (provider === 'department_supervisor') {
      requiredString(
        entry.departmentIdFrom,
        `${pointer}/bindings/${code}/departmentIdFrom`,
        255
      );
    }
    if (provider === 'application_provider') {
      stableCode(
        entry.providerCode,
        `${pointer}/bindings/${code}/providerCode`
      );
    }
  }
}

function validateWorkflowDefinitionBinding(
  definition: JsonObject,
  binding: JsonObject,
  pointer: string
) {
  equal(binding.workflowCode, definition.code, `${pointer}/workflowCode`);
  const entries = object(binding.bindings, `${pointer}/bindings`);
  for (const [nodeId, rawNode] of Object.entries(
    object(definition.nodes, `${pointer}/nodes`)
  )) {
    const node = object(rawNode, `${pointer}/nodes/${nodeId}`);
    if (node.kind === 'approval' && !entries[node.binding]) {
      fail(
        'NATIVE_WORKFLOW_BINDING_REFERENCE_MISSING',
        `${pointer}/nodes/${nodeId}/binding`
      );
    }
  }
}

function validateResource(raw: any, pointer: string, appCode: string) {
  const resource = object(raw, pointer);
  exactKeys(
    resource,
    [
      'schemaVersion',
      'appCode',
      'code',
      'name',
      'schema',
      'surface',
      'invariants',
      'capabilities',
      'dataPolicyCode',
      'fieldPolicies',
    ],
    pointer,
    true
  );
  equal(
    resource.schemaVersion,
    'openxiangda.data-resource/v2',
    `${pointer}/schemaVersion`
  );
  equal(resource.appCode, appCode, `${pointer}/appCode`);
  const code = resourceCode(resource.code, `${pointer}/code`);
  const name = requiredString(resource.name, `${pointer}/name`, 255);
  const schema = object(resource.schema, `${pointer}/schema`);
  exactKeys(schema, ['fields'], `${pointer}/schema`);
  let fields;
  let invariants;
  try {
    fields = parseNativeDataFieldsV2(schema.fields, `${pointer}/schema/fields`);
    invariants = parseNativeDataResourceInvariantsV2(
      resource.invariants,
      fields,
      `${pointer}/invariants`
    );
    validateNativeDataResourceSurfaceV2(
      resource.surface,
      fields,
      `${pointer}/surface`
    );
  } catch (error) {
    if (error instanceof NativeDataFieldContractV2Error) {
      fail(error.code, error.pointer);
    }
    throw error;
  }
  const fieldCodes = new Set<string>(fields.map(field => field.code));
  const capabilities = object(resource.capabilities, `${pointer}/capabilities`);
  exactKeys(
    capabilities,
    ['read', 'create', 'update', 'delete'],
    `${pointer}/capabilities`
  );
  const fieldPolicies = object(
    resource.fieldPolicies,
    `${pointer}/fieldPolicies`
  );
  for (const [fieldCode, rawPolicy] of Object.entries(fieldPolicies)) {
    if (!fieldCodes.has(fieldCode) && !isDataAuditMetadataField(fieldCode)) {
      fail(
        'NATIVE_DATA_FIELD_POLICY_FIELD_MISSING',
        `${pointer}/fieldPolicies/${fieldCode}`
      );
    }
    const policyPointer = `${pointer}/fieldPolicies/${fieldCode}`;
    const policy = object(rawPolicy, policyPointer);
    if (isDataAuditMetadataField(fieldCode)) {
      exactKeys(policy, ['read'], policyPointer, true);
      if (!Array.isArray(policy.read) || policy.read.length > 20 ||
        policy.read.some(value => typeof value !== 'string' || !value.trim()) ||
        new Set(policy.read).size !== policy.read.length) {
        fail('NATIVE_DATA_AUDIT_READ_POLICY_INVALID', `${policyPointer}/read`);
      }
    }
    exactKeys(
      policy,
      ['read', 'create', 'update', 'mask'],
      policyPointer,
      true
    );
    if (policy.mask !== undefined && !['omit', 'null'].includes(policy.mask)) {
      fail('NATIVE_DATA_FIELD_POLICY_MASK_INVALID', `${policyPointer}/mask`);
    }
  }
  return {
    ...resource,
    code,
    name,
    schema: { fields },
    ...(resource.invariants === undefined ? {} : { invariants }),
    capabilities,
    fieldPolicies,
  };
}

function platformCapabilities(appCode: string) {
  return [
    {
      code: `app:${appCode}:directory:read`,
      kind: 'platform',
      name: '读取受限组织目录',
      source: 'platform',
    },
    ...([
      ['app:role:read', '查看角色与授权'],
      ['app:role:define', '定义手工角色'],
      ['app:role:assign', '分配角色成员'],
      ['app:role:grant-capability', '授予角色能力'],
      ['app:scope-grant:manage', '管理数据范围'],
      ['app:super-admin:manage', '管理应用最高管理员'],
    ] as const).map(([code, name]) => ({
      code,
      kind: 'platform',
      name,
      source: 'platform',
    })),
  ];
}

function parseCanonicalArtifact(
  source: Buffer,
  pointer: string,
  invalidCode: string,
  canonicalCode: string
) {
  const text = source.toString('utf8');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(invalidCode, pointer);
  }
  const result = object(value, pointer);
  if (canonicalJson(result) !== text) fail(canonicalCode, pointer);
  return result;
}

function inspectJsonBudget(value: unknown, pointer: string) {
  let nodes = 0;
  const visit = (current: unknown, path: string, depth: number) => {
    nodes += 1;
    if (nodes > MAX_NODES) fail('NATIVE_ARTIFACT_NODE_LIMIT_EXCEEDED', path);
    if (depth > MAX_DEPTH) fail('NATIVE_ARTIFACT_DEPTH_LIMIT_EXCEEDED', path);
    if (typeof current === 'string') {
      if (Buffer.byteLength(current) > MAX_STRING_BYTES) {
        fail('NATIVE_ARTIFACT_STRING_LIMIT_EXCEEDED', path);
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) =>
        visit(item, `${path}/${index}`, depth + 1)
      );
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current as JsonObject)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) {
        fail('NATIVE_ARTIFACT_DANGEROUS_KEY', `${path}/${key}`);
      }
      if (isForbiddenRuntimeKey(key)) {
        fail('NATIVE_ARTIFACT_RUNTIME_FIELD_FORBIDDEN', `${path}/${key}`);
      }
      visit(child, `${path}/${key}`, depth + 1);
    }
  };
  visit(value, pointer, 0);
}

function isForbiddenRuntimeKey(key: string) {
  return [
    'environmentKey',
    'environmentId',
    'secretValue',
    'ciphertext',
    'oauthClient',
    'oauthClientId',
    'oauthClientSecret',
    'signingSecret',
    'kubernetesNamespace',
    'nodePort',
    'productionUrl',
  ].includes(key);
}

function projection<T extends JsonObject>(
  value: T
): NativeConfigurationProjection<T> {
  return { value, digest: sha256Canonical(value) };
}

function artifactBytes(
  value: string | Buffer | Uint8Array,
  maximum: number,
  pointer: string,
  errorCode: string
) {
  if (
    typeof value !== 'string' &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Uint8Array)
  ) {
    fail('NATIVE_ARTIFACT_BYTES_REQUIRED', pointer);
  }
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value as any);
  if (buffer.byteLength === 0) fail('NATIVE_ARTIFACT_EMPTY', pointer);
  if (buffer.byteLength > maximum) fail(errorCode, pointer);
  return buffer;
}

function verifyArtifactDigest(
  source: Buffer,
  expected: string,
  pointer: string,
  code: string
) {
  const actual = crypto.createHash('sha256').update(source).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    fail(code, pointer);
  }
}

function object(value: unknown, pointer: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('NATIVE_OBJECT_REQUIRED', pointer);
  }
  return value as JsonObject;
}

function boundedArray(value: unknown, pointer: string, maximum: number): any[] {
  if (!Array.isArray(value)) fail('NATIVE_ARRAY_REQUIRED', pointer);
  if ((value as any[]).length > maximum)
    fail('NATIVE_ARRAY_LIMIT_EXCEEDED', pointer);
  return value as any[];
}

function uniqueStrings(
  value: unknown,
  pointer: string,
  maximum: number
): string[] {
  const values = boundedArray(value, pointer, maximum).map((item, index) =>
    requiredString(item, `${pointer}/${index}`, 255)
  );
  if (new Set(values).size !== values.length)
    fail('NATIVE_ARRAY_DUPLICATE', pointer);
  return values;
}

function requiredString(value: unknown, pointer: string, maximum: number) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum
  ) {
    fail('NATIVE_STRING_INVALID', pointer);
  }
  return value as string;
}

function optionalString(value: unknown, pointer: string, maximum: number) {
  if (typeof value !== 'string' || value.length > maximum) {
    fail('NATIVE_STRING_INVALID', pointer);
  }
  return value as string;
}

function stableCode(value: unknown, pointer: string) {
  const normalized = requiredString(value, pointer, 128);
  if (!STABLE_CODE_PATTERN.test(normalized))
    fail('NATIVE_CODE_INVALID', pointer);
  return normalized;
}

function resourceCode(value: unknown, pointer: string) {
  const normalized = requiredString(value, pointer, 64);
  if (!RESOURCE_CODE_PATTERN.test(normalized)) {
    fail('NATIVE_RESOURCE_CODE_INVALID', pointer);
  }
  return normalized;
}

function fieldCodeValue(value: unknown, pointer: string) {
  const normalized = requiredString(value, pointer, 63);
  if (!FIELD_CODE_PATTERN.test(normalized)) {
    fail('NATIVE_FIELD_CODE_INVALID', pointer);
  }
  return normalized;
}

function workflowCodeValue(value: unknown, pointer: string) {
  const normalized = requiredString(value, pointer, 128);
  if (!WORKFLOW_CODE_PATTERN.test(normalized)) {
    fail('NATIVE_WORKFLOW_CODE_INVALID', pointer);
  }
  return normalized;
}

function workflowBindingCode(value: unknown, pointer: string) {
  const normalized = requiredString(value, pointer, 128);
  if (!WORKFLOW_BINDING_CODE_PATTERN.test(normalized)) {
    fail('NATIVE_WORKFLOW_BINDING_CODE_INVALID', pointer);
  }
  return normalized;
}

function capabilityCode(value: unknown, pointer: string, appCode: string) {
  const normalized = requiredString(value, pointer, 255);
  if (!CAPABILITY_PATTERN.test(normalized)) {
    fail('NATIVE_CAPABILITY_CODE_INVALID', pointer);
  }
  if (
    !normalized.startsWith(`app:${appCode}:`) &&
    !platformCapabilities(appCode).some(item => item.code === normalized)
  ) {
    fail('NATIVE_CAPABILITY_APP_MISMATCH', pointer);
  }
  return normalized;
}

function absolutePath(value: unknown, pointer: string) {
  const normalized = requiredString(value, pointer, 2048);
  if (
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.includes('..') ||
    normalized.includes('?') ||
    normalized.includes('#')
  ) {
    fail('NATIVE_ABSOLUTE_PATH_INVALID', pointer);
  }
  return normalized;
}

function positiveInteger(value: unknown, pointer: string) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    fail('NATIVE_POSITIVE_INTEGER_REQUIRED', pointer);
  }
  return Number(value);
}

function boundedInteger(
  value: unknown,
  pointer: string,
  minimum: number,
  maximum: number
) {
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    fail('NATIVE_INTEGER_OUT_OF_RANGE', pointer);
  }
  return Number(value);
}

function boolean(value: unknown, pointer: string) {
  if (typeof value !== 'boolean') fail('NATIVE_BOOLEAN_REQUIRED', pointer);
  return value as boolean;
}

function digest(value: unknown, pointer: string) {
  const normalized = requiredString(value, pointer, 64).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) fail('NATIVE_DIGEST_INVALID', pointer);
  return normalized;
}

function equal(actual: unknown, expected: unknown, pointer: string) {
  if (actual !== expected) fail('NATIVE_VALUE_MISMATCH', pointer);
}

function exactKeys(
  value: JsonObject,
  required: string[],
  pointer: string,
  optional: boolean | string[] = false
) {
  const allowedSet = new Set([
    ...required,
    ...(Array.isArray(optional) ? optional : []),
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key))
      fail('NATIVE_PROPERTY_UNKNOWN', `${pointer}/${key}`);
  }
  if (optional === true) return;
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail('NATIVE_PROPERTY_REQUIRED', `${pointer}/${key}`);
    }
  }
}

function sorted<T>(items: T[], key: (item: T) => string) {
  return [...items].sort((left, right) => compareText(key(left), key(right)));
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort(compareText);
}

function uniqueSortedNumbers(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function compareText(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  Object.values(value as any).forEach(item => deepFreeze(item));
  return value;
}

function firstDifferencePointer(
  expected: unknown,
  actual: unknown,
  pointer: string
): string {
  if (sameCanonicalValue(expected, actual)) return pointer;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      if (!sameCanonicalValue(expected[index], actual[index])) {
        return firstDifferencePointer(
          expected[index],
          actual[index],
          `${pointer}/${index}`
        );
      }
    }
  }
  if (
    expected &&
    actual &&
    typeof expected === 'object' &&
    typeof actual === 'object' &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const keys = uniqueSorted([
      ...Object.keys(expected as JsonObject),
      ...Object.keys(actual as JsonObject),
    ]);
    for (const key of keys) {
      const expectedValue = (expected as JsonObject)[key];
      const actualValue = (actual as JsonObject)[key];
      if (!sameCanonicalValue(expectedValue, actualValue)) {
        return firstDifferencePointer(
          expectedValue,
          actualValue,
          `${pointer}/${key}`
        );
      }
    }
  }
  return pointer;
}

function sameCanonicalValue(expected: unknown, actual: unknown) {
  if (expected === undefined || actual === undefined)
    return expected === actual;
  return canonicalJson(expected) === canonicalJson(actual);
}

function fail(
  code: string,
  pointer: string,
  identifiers: Record<string, unknown> = {}
): never {
  throw new NativeConfigurationCompilerError(code, pointer, identifiers);
}
