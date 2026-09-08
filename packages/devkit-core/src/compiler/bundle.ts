import { DATA_AUDIT_METADATA_FIELDS, isDataAuditMetadataField, projectDataResourceView } from 'openxiangda-contracts';
import { nativeFieldRequiresCreateInputV2 } from 'openxiangda-contracts/native-compiler';
import { createHash } from 'node:crypto';
import {
  canonicalJson,
  applicationEventHandlerPathV2,
  DATA_EVENT_TYPES_V2,
  nativePlatformCapabilityCatalog,
  OPENXIANGDA_COMPILER_CONTRACT_VERSION,
  SCHEMA_VERSIONS,
  WORKFLOW_EVENT_TYPES_V2,
  sha256Digest,
  type AppApiOperationContract,
  type AppAdminNavigationGroupContract,
  type AppAdminPageContract,
  type AppPerspectiveContract,
  type AppRouteManifestEntryV3,
  type AppRouteManifestRouteV3,
  type AppRouteManifestV3,
  type AppRouteManifestDevicePolicyV3,
  type AppArtifact,
  type AppCapabilityContract,
  type AppDataPolicyDeclaration,
  type AppDataPolicyExpressionDeclaration,
  type AppDataPolicyRuleDeclaration,
  type AppResourceContract,
  type AppWorkflowContract,
  type AppWorkflowLaunchDeclaration,
  type AppWorkflowLaunchContract,
  type AppWorkflowNamedOperationIntentDeclaration,
  type AppWorkflowNamedOperationIntentContract,
  type AiCapabilityCatalog,
  type ConfigurationBundleV3,
  type ContractBundleV3,
  type DataFieldSurface,
  type EventSubscriptionFilter,
  type DataResource,
  type DataResourceSurface,
  type WorkflowCommand,
} from 'openxiangda-contracts';
import {
  AppConfigValidationError,
  type OpenXiangdaAppConfig,
} from './config.js';
import {
  AUTHORIZATION_TRANSITION_CAPABILITY_CODE_PATTERN,
  AUTHORIZATION_TRANSITION_KEYS,
  AUTHORIZATION_TRANSITION_ROLE_CODE_PATTERN,
  exactKeys,
  isExactStringArray,
  isPlainRecord,
} from './authorization-transition.js';
import { compileAiCapabilityCatalog } from './ai-catalog.js';
import {
  FIELD_VALUE_TYPESCRIPT_DECLARATIONS,
  fieldNullable,
  supportsGeneratedMutation,
  typescriptType,
} from './field-codec.js';
import { normalizeWorkflowDefinition } from '../internal/workflow.js';
import { supportsSearch, supportsSort } from './field-query-plan.js';
import { resolveDataFieldSurfaceWidget } from './field-surface.js';

export const CONFIG_BUNDLE_SCHEMA = SCHEMA_VERSIONS.configurationBundle;
export const CONTRACT_BUNDLE_SCHEMA = SCHEMA_VERSIONS.contractBundle;
export const COMPILER_CONTRACT_VERSION =
  OPENXIANGDA_COMPILER_CONTRACT_VERSION;

export interface CompiledSourceBundle<T> {
  value: T;
  content: string;
  digest: string;
  artifact: AppArtifact;
}

export interface CompiledApplicationSources {
  config: CompiledSourceBundle<ConfigurationBundleV3>;
  contracts: CompiledSourceBundle<ContractBundleV3> & {
    typescript: string;
  };
  aiCatalog: {
    value: AiCapabilityCatalog;
    content: string;
    digest: string;
    mediaType: 'application/vnd.openxiangda.ai-capability.v1+json';
  };
}

const DEFAULT_EVENT_DELIVERY = {
  timeoutMs: 10_000,
  maxAttempts: 8,
  initialBackoffMs: 1_000,
  maxBackoffMs: 300_000,
  ordering: 'none' as const,
  concurrency: 10,
};

function normalizeEventFilter(
  filter: EventSubscriptionFilter | undefined
): EventSubscriptionFilter {
  if (!filter) return {};
  return {
    ...(filter.resourceCodes
      ? { resourceCodes: uniqueSorted(filter.resourceCodes) }
      : {}),
    ...(filter.subject ? { subject: { ...filter.subject } } : {}),
    ...(filter.changedFields
      ? {
          changedFields: Object.fromEntries(
            Object.entries(filter.changedFields).map(([key, value]) => [
              key,
              uniqueSorted(value as string[]),
            ])
          ),
        }
      : {}),
    ...(filter.changes
      ? {
          changes: sorted(
            filter.changes.map(change => ({
              field: change.field,
              ...(change.before ? { before: change.before } : {}),
              ...(change.after ? { after: change.after } : {}),
            })),
            change => String(change.field || '')
          ),
        }
      : {}),
    ...(filter.where ? { where: filter.where } : {}),
  };
}

export function compileApplicationSources(
  config: OpenXiangdaAppConfig,
  generatorVersion = 'openxiangda-devkit-core'
): CompiledApplicationSources {
  const configuration = normalizeConfiguration(config);
  const configContent = canonicalJson(configuration);
  const configDigest = sha256Bytes(configContent);
  const aiCatalogValue = compileAiCapabilityCatalog(config, configDigest);
  const aiCatalogContent = canonicalJson(aiCatalogValue);
  const aiCatalogDigest = sha256Bytes(aiCatalogContent);
  const contract = compileContractBundleFromNormalized(
    config,
    configDigest,
    generatorVersion,
    configuration
  );
  const contractContent = canonicalJson(contract);
  const contractDigest = sha256Bytes(contractContent);
  return {
    config: {
      value: configuration,
      content: configContent,
      digest: configDigest,
      artifact: {
        kind: 'config',
        digest: configDigest,
        mediaType: 'application/vnd.openxiangda.config-bundle.v3+json',
        size: Buffer.byteLength(configContent),
        metadata: {
          schemaVersion: CONFIG_BUNDLE_SCHEMA,
          compilerContractVersion: COMPILER_CONTRACT_VERSION,
        },
      },
    },
    contracts: {
      value: contract,
      content: contractContent,
      digest: contractDigest,
      typescript: renderGeneratedContracts(config, contract),
      artifact: {
        kind: 'contracts',
        digest: contractDigest,
        mediaType: 'application/vnd.openxiangda.contract-bundle.v3+json',
        size: Buffer.byteLength(contractContent),
        metadata: {
          schemaVersion: CONTRACT_BUNDLE_SCHEMA,
          compilerContractVersion: COMPILER_CONTRACT_VERSION,
          configDigest,
        },
      },
    },
    aiCatalog: {
      value: aiCatalogValue,
      content: aiCatalogContent,
      digest: aiCatalogDigest,
      mediaType: 'application/vnd.openxiangda.ai-capability.v1+json',
    },
  };
}

export function normalizeConfiguration(
  config: OpenXiangdaAppConfig
): ConfigurationBundleV3 {
  return {
    schemaVersion: CONFIG_BUNDLE_SCHEMA,
    compilerContractVersion: COMPILER_CONTRACT_VERSION,
    appCode: config.app.code,
    perspectives: compilePerspectives(config),
    authz: {
      ...(config.authz?.authenticatedUserRoleCode
        ? {
            authenticatedUserRoleCode:
              config.authz.authenticatedUserRoleCode,
          }
        : {}),
      capabilities: sorted(config.authz?.capabilities || [], item => item.code),
      roles: sorted(
        (config.authz?.roles || []).map(role => ({
          code: role.code,
          name: role.name,
          ...(role.description ? { description: role.description } : {}),
          capabilities: uniqueSorted(role.capabilities),
        })),
        item => item.code
      ),
      scopeDimensions: sorted(
        (config.authz?.scopeDimensions || []).map(dimension => ({
          code: dimension.code,
          name: dimension.name,
          ...(dimension.resourceCode
            ? { resourceCode: dimension.resourceCode }
            : {}),
          ...(dimension.valueType ? { valueType: dimension.valueType } : {}),
          ...(dimension.hierarchyMode
            ? { hierarchyMode: dimension.hierarchyMode }
            : {}),
          ...(dimension.valueSource
            ? {
                valueSource: {
                  kind: dimension.valueSource.kind,
                  resourceCode: dimension.valueSource.resourceCode,
                  labelField: dimension.valueSource.labelField,
                  ...(dimension.valueSource.enabledField
                    ? { enabledField: dimension.valueSource.enabledField }
                    : {}),
                },
              }
            : {}),
        })),
        item => item.code
      ),
      scopeSources: sorted(
        (config.authz?.scopeSources || []).map(source => ({
          code: source.code,
          name: source.name,
          resourceCode: source.resourceCode,
          subject:
            source.subject.type === 'role_membership'
              ? {
                  type: source.subject.type,
                  userIdField: source.subject.userIdField,
                  roleCode: source.subject.roleCode,
                }
              : {
                  type: source.subject.type,
                  userIdField: source.subject.userIdField,
                },
          grants: sorted(
            source.grants.map(grant => ({
              dimensionCode: grant.dimensionCode,
              valueField: grant.valueField,
              ...(grant.parentValueField
                ? { parentValueField: grant.parentValueField }
                : {}),
            })),
            grant => grant.dimensionCode
          ),
          ...(source.operationField
            ? { operationField: source.operationField }
            : {}),
          ...(source.enabledField ? { enabledField: source.enabledField } : {}),
          ...(source.effectiveFromField
            ? { effectiveFromField: source.effectiveFromField }
            : {}),
          ...(source.effectiveToField
            ? { effectiveToField: source.effectiveToField }
            : {}),
          failureMode: source.failureMode,
        })),
        item => item.code
      ),
      roleMembershipSources: sorted(
        (config.authz?.roleMembershipSources || []).map(source => ({
          code: source.code,
          name: source.name,
          resourceCode: source.resourceCode,
          userIdField: source.userIdField,
          roleCode: source.roleCode,
          ...(source.enabledField ? { enabledField: source.enabledField } : {}),
          ...(source.effectiveFromField
            ? { effectiveFromField: source.effectiveFromField }
            : {}),
          ...(source.effectiveToField
            ? { effectiveToField: source.effectiveToField }
            : {}),
          failureMode: source.failureMode,
        })),
        item => item.code
      ),
      relationshipGrantSources: sorted(
        (config.authz?.relationshipGrantSources || []).map(source => ({
          code: source.code,
          name: source.name,
          resourceCode: source.resourceCode,
          subject:
            source.subject.type === 'role_membership'
              ? {
                  type: source.subject.type,
                  userIdField: source.subject.userIdField,
                  roleCode: source.subject.roleCode,
                }
              : {
                  type: source.subject.type,
                  userIdField: source.subject.userIdField,
                },
          relationCode: source.relationCode,
          targetResourceCode: source.targetResourceCode,
          resourceIdField: source.resourceIdField,
          operations: uniqueSorted(source.operations),
          ...(source.enabledField ? { enabledField: source.enabledField } : {}),
          ...(source.effectiveFromField
            ? { effectiveFromField: source.effectiveFromField }
            : {}),
          ...(source.effectiveToField
            ? { effectiveToField: source.effectiveToField }
            : {}),
          failureMode: source.failureMode,
        })),
        item => item.code
      ),
      dataPolicies: sorted(
        (config.authz?.dataPolicies || []).map(
          normalizeDataPolicyDeclaration
        ),
        item => item.code
      ),
      authorizationTransitions: sorted(
        (config.authz?.authorizationTransitions || []).map(
          normalizeAuthorizationTransition
        ),
        item => item.fromAuthzDigest
      ),
    },
    backend: {
      secrets: sorted(
        (config.backend.secrets || []).map(secret => ({
          name: secret.name,
          env: secret.env,
          ...(secret.description ? { description: secret.description } : {}),
          ...(secret.required !== undefined
            ? { required: secret.required }
            : {}),
          exposure: 'active_only' as const,
        })),
        item => item.name
      ),
      operations: sorted(
        (config.backend.operations || []).map(operation => ({
          code: operation.code,
          method: operation.method,
          path: operation.path,
          capability: operation.capability,
          requestSchema: operation.requestSchema,
          responseSchema: operation.responseSchema,
          ...(operation.platformAccess
            ? {
                platformAccess: {
                  ...(operation.platformAccess.roleAssertions ? {
                    roleAssertions: { roleCodes: uniqueSorted(operation.platformAccess.roleAssertions.roleCodes) },
                  } : {}),
                  ...(operation.platformAccess.directory
                    ? {
                        directory: {
                          mode: operation.platformAccess.directory.mode,
                          fields: uniqueSorted(
                            operation.platformAccess.directory.fields
                          ),
                        },
                      }
                    : {}),
                  ...(operation.platformAccess.managedFiles
                    ? {
                        managedFiles: sorted(
                          operation.platformAccess.managedFiles.map(item => ({
                            resourceCode: item.resourceCode,
                            fieldCodes: uniqueSorted(item.fieldCodes),
                            intents: uniqueSorted(item.intents),
                          })),
                          item => item.resourceCode
                        ),
                      }
                    : {}),
                  ...(operation.platformAccess.managedFileCopies
                    ? {
                        managedFileCopies: sorted(
                          operation.platformAccess.managedFileCopies.map(item => ({
                            mode: item.mode,
                            sourceResourceCode: item.sourceResourceCode,
                            sourceFieldCodes: uniqueSorted(item.sourceFieldCodes),
                            targetResourceCode: item.targetResourceCode,
                            targetFieldCodes: uniqueSorted(item.targetFieldCodes),
                          })),
                          item => `${item.sourceResourceCode}:${item.sourceFieldCodes.join(',')}=>${item.targetResourceCode}:${item.targetFieldCodes.join(',')}`
                        ),
                      }
                    : {}),
                  ...(operation.platformAccess.notification
                    ? {
                        notification: {
                          mode: operation.platformAccess.notification.mode,
                        },
                      }
                    : {}),
                  ...(operation.platformAccess.workflow
                    ? {
                        workflow: {
                          codes: uniqueSorted(
                            operation.platformAccess.workflow.codes
                          ),
                        },
                      }
                    : {}),
                },
              }
            : {}),
          ...(operation.ai
            ? {
                ai: {
                  name: operation.ai.name,
                  description: operation.ai.description,
                  risk: operation.ai.risk,
                  resources: uniqueSorted(operation.ai.resources),
                  sideEffects: uniqueSorted(operation.ai.sideEffects),
                  ...(operation.ai.concurrency
                    ? { concurrency: operation.ai.concurrency }
                    : {}),
                  ...(operation.ai.timeoutMs
                    ? { timeoutMs: operation.ai.timeoutMs }
                    : {}),
                },
              }
            : {}),
          ...(operation.description
            ? { description: operation.description }
            : {}),
        })),
        item => `${item.method}:${item.path}:${item.code}`
      ),
    },
    data: {
      resources: sorted(
        (config.data?.resources || []).map(normalizeDataResource),
        item => item.code
      ),
      ...((config.data?.resources || []).some(
        resource => resource.detailRouteCode
      )
        ? {
            resourceDetailRoutes: sorted(
              (config.data?.resources || []).flatMap(resource =>
                resource.detailRouteCode
                  ? [
                      {
                        resourceCode: resource.code,
                        desktop: resource.detailRouteCode.desktop,
                        mobile: resource.detailRouteCode.mobile,
                      },
                    ]
                  : []
              ),
              item => item.resourceCode
            ),
          }
        : {}),
    },
    events: {
      schemas: sorted(
        (config.events?.schemas || []).map(schema => ({
          schemaVersion: SCHEMA_VERSIONS.eventSchema,
          eventType: schema.eventType,
          dataSchemaVersion: schema.dataSchemaVersion,
          jsonSchema: schema.jsonSchema,
          schemaDigest: sha256Digest(schema.jsonSchema),
          sensitiveFields: uniqueSorted(schema.sensitiveFields || []),
          owner: 'application' as const,
        })),
        item => `${item.eventType}:${item.dataSchemaVersion}`
      ),
      subscriptions: sorted(
        (config.events?.subscriptions || []).map(subscription => ({
          code: subscription.code,
          ...(subscription.description
            ? { description: subscription.description }
            : {}),
          eventTypes: uniqueSorted(subscription.eventTypes),
          filter: normalizeEventFilter(subscription.filter),
          payload: {
            includeChanges: subscription.payload?.includeChanges !== false,
            fields: uniqueSorted(subscription.payload?.fields || []),
          },
          ...(subscription.platformAccess?.notification
            ? {
                platformAccess: {
                  notification: {
                    mode: subscription.platformAccess.notification.mode,
                  },
                },
            }
            : {}),
          ...(subscription.platformAccess?.managedFileCopies
            ? {
                platformAccess: {
                  ...(subscription.platformAccess.notification
                    ? {
                        notification: {
                          mode: subscription.platformAccess.notification.mode,
                        },
                      }
                    : {}),
                  managedFileCopies: sorted(
                    subscription.platformAccess.managedFileCopies.map(item => ({
                      mode: item.mode,
                      sourceResourceCode: item.sourceResourceCode,
                      sourceFieldCodes: uniqueSorted(item.sourceFieldCodes),
                      targetResourceCode: item.targetResourceCode,
                      targetFieldCodes: uniqueSorted(item.targetFieldCodes),
                    })),
                    item => `${item.sourceResourceCode}:${item.sourceFieldCodes.join(',')}=>${item.targetResourceCode}:${item.targetFieldCodes.join(',')}`
                  ),
                },
              }
            : {}),
          endpointPath: applicationEventHandlerPathV2(subscription.code),
          delivery: { ...DEFAULT_EVENT_DELIVERY, ...subscription.delivery },
        })),
        item => item.code
      ),
      timers: sorted(
        (config.events?.timers || []).map(timer => ({
          code: timer.code,
          eventType: timer.eventType,
          cronExpression: timer.cronExpression,
          timezone: timer.timezone,
          payload: timer.payload,
          misfirePolicy: timer.misfirePolicy || 'coalesce_one',
        })),
        item => item.code
      ),
      dateTriggers: sorted(
        (config.events?.dateTriggers || []).map(trigger => ({
          code: trigger.code,
          resourceCode: trigger.resourceCode,
          field: trigger.field,
          offset: trigger.offset,
          eventType: trigger.eventType,
          payload: trigger.payload,
        })),
        item => item.code
      ),
    },
    workflows: {
      definitions: sorted(
        (config.workflows?.definitions || []).map(item => ({
          version: item.version,
          definition: normalizeWorkflowDefinition(item.definition),
          launch: normalizeWorkflowLaunchDeclaration(item.launch),
          ...(item.detailRouteCode
            ? { detailRouteCode: { ...item.detailRouteCode } }
            : {}),
        })),
        item => `${item.definition.code}:${pad(item.version)}`
      ),
      bindings: sorted(
        (config.workflows?.bindings || []).map(item => ({
          version: item.version,
          binding: item.binding,
        })),
        item => `${item.binding.workflowCode}:${pad(item.version)}`
      ),
      activations: sorted(
        (config.workflows?.activations || []).map(item => ({
          workflowCode: item.workflowCode,
          definitionVersion: item.definitionVersion,
          bindingVersion: item.bindingVersion,
          acceptedCommandDeactivationPolicy:
            item.acceptedCommandDeactivationPolicy,
        })),
        item => item.workflowCode
      ),
      providers: sorted(
        (config.workflows?.providers || []).map(provider => ({
          code: provider.code,
          endpointPath: provider.endpointPath,
          ...(provider.timeoutMs !== undefined
            ? { timeoutMs: provider.timeoutMs }
            : {}),
        })),
        item => item.code
      ),
      editableParameters: sorted(
        (config.workflows?.editableParameters || []).map(parameter => ({
          code: parameter.code,
          workflowCode: parameter.workflowCode,
          bindingKey: parameter.bindingKey,
          label: parameter.label,
          valueType: parameter.valueType,
          ...(parameter.required !== undefined
            ? { required: parameter.required }
            : {}),
          ...(parameter.allowedRoleCodes
            ? { allowedRoleCodes: uniqueSorted(parameter.allowedRoleCodes) }
            : {}),
          ...(parameter.allowedProviderCodes
            ? {
                allowedProviderCodes: uniqueSorted(
                  parameter.allowedProviderCodes
                ),
              }
            : {}),
          ...(parameter.maxItems !== undefined
            ? { maxItems: parameter.maxItems }
            : {}),
        })),
        item => item.code
      ),
    },
    frontend: {
      routes: compileFrontendRoutes(config),
      user: {
        applicationTodoCenter:
          config.frontend.user?.applicationTodoCenter === true,
      },
      devicePolicy: compileRouteManifestDevicePolicy(config),
      authentication: compileApplicationAuthentication(config),
      ...(config.frontend.publicAccess
        ? { publicAccess: compileAnonymousPublicAccess(config) }
        : {}),
      admin: {
        ...(config.frontend.admin?.access
          ? {
              access: {
                ...(config.frontend.admin.access.allOf
                  ? {
                      allOf: uniqueSorted([
                        ...config.frontend.admin.access.allOf,
                      ]),
                    }
                  : {}),
                ...(config.frontend.admin.access.anyOf
                  ? {
                      anyOf: uniqueSorted([
                        ...config.frontend.admin.access.anyOf,
                      ]),
                    }
                  : {}),
              },
            }
          : {}),
        navigation: (config.frontend.admin?.navigation || []).map(group => ({
          code: group.code,
          label: group.label,
          ...(group.icon ? { icon: group.icon } : {}),
          ...(group.order !== undefined ? { order: group.order } : {}),
          items: group.items.map(item => ({
            page: { ...item.page },
            ...(item.label ? { label: item.label } : {}),
            ...(item.icon ? { icon: item.icon } : {}),
            ...(item.order !== undefined ? { order: item.order } : {}),
          })),
        })),
      },
    },
    runtime: {
      protocolCapabilities: runtimeProtocolCapabilities(config),
      health: {
        livePath: '/__platform/health',
        readyPath: '/__platform/ready',
        versionPath: '/__platform/version',
      },
    },
  };
}

function normalizeAuthorizationTransition(
  raw: unknown,
  index: number
) {
  const path = `authz.authorizationTransitions[${index}]`;
  if (!isPlainRecord(raw) || !exactKeys(raw, AUTHORIZATION_TRANSITION_KEYS)) {
    throw invalidAuthorizationTransition(path);
  }
  if (
    typeof raw.fromAuthzDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(raw.fromAuthzDigest) ||
    typeof raw.reason !== 'string' ||
    !raw.reason.trim() ||
    raw.reason.length > 2000 ||
    (raw.removeRoleCodes !== undefined &&
      !isExactStringArray(
        raw.removeRoleCodes,
        AUTHORIZATION_TRANSITION_ROLE_CODE_PATTERN,
        128
      )) ||
    (raw.removeCapabilityCodes !== undefined &&
      !isExactStringArray(
        raw.removeCapabilityCodes,
        AUTHORIZATION_TRANSITION_CAPABILITY_CODE_PATTERN,
        255
      ))
  ) {
    throw invalidAuthorizationTransition(path);
  }
  return {
    fromAuthzDigest: raw.fromAuthzDigest,
    ...(raw.removeRoleCodes
      ? { removeRoleCodes: uniqueSorted(raw.removeRoleCodes as string[]) }
      : {}),
    ...(raw.removeCapabilityCodes
      ? {
          removeCapabilityCodes: uniqueSorted(
            raw.removeCapabilityCodes as string[]
          ),
        }
      : {}),
    reason: raw.reason.trim(),
  };
}

function invalidAuthorizationTransition(path: string) {
  return new AppConfigValidationError([
    {
      schemaVersion: SCHEMA_VERSIONS.diagnostic,
      code: 'APP_CONFIG_AUTHZ_TRANSITION_INVALID',
      severity: 'error',
      message:
        '授权 transition 必须是只含 canonical 字段且值形状有界的对象',
      path,
      source: 'openxiangda-app.config.ts',
      retryable: false,
    },
  ]);
}

export function compileContractBundle(
  config: OpenXiangdaAppConfig,
  configDigest?: string,
  generatorVersion = 'openxiangda-devkit-core'
): ContractBundleV3 {
  const normalizedConfiguration = normalizeConfiguration(config);
  return compileContractBundleFromNormalized(
    config,
    configDigest ?? sha256Bytes(canonicalJson(normalizedConfiguration)),
    generatorVersion,
    normalizedConfiguration
  );
}

function compileContractBundleFromNormalized(
  config: OpenXiangdaAppConfig,
  configDigest: string,
  generatorVersion: string,
  normalizedConfiguration: ConfigurationBundleV3
): ContractBundleV3 {
  const capabilities = compileCapabilities(normalizedConfiguration);
  const eventConsumers = sorted(
    normalizedConfiguration.events.subscriptions.map(subscription => ({
      code: subscription.code,
      endpointPath: subscription.endpointPath,
      eventTypes: subscription.eventTypes,
      filter: subscription.filter,
      payload: subscription.payload,
      ...(subscription.platformAccess
        ? {
            platformAccess: {
              ...(subscription.platformAccess.notification
                ? {
                    notification: {
                      mode: subscription.platformAccess.notification.mode,
                    },
                  }
                : {}),
              ...(subscription.platformAccess.managedFileCopies
                ? {
                    managedFileCopies: sorted(
                      subscription.platformAccess.managedFileCopies.map(item => ({
                        mode: item.mode,
                        sourceResourceCode: item.sourceResourceCode,
                        sourceFieldCodes: uniqueSorted(item.sourceFieldCodes),
                        targetResourceCode: item.targetResourceCode,
                        targetFieldCodes: uniqueSorted(item.targetFieldCodes),
                      })),
                      item => `${item.sourceResourceCode}:${item.sourceFieldCodes.join(',')}=>${item.targetResourceCode}:${item.targetFieldCodes.join(',')}`
                    ),
                  }
                : {}),
            },
          }
        : {}),
      delivery: subscription.delivery,
    })),
    item => item.code
  );
  const applicationSchemaVersions = new Map(
    normalizedConfiguration.events.schemas.map(schema => [
      schema.eventType,
      schema.dataSchemaVersion,
    ])
  );
  const dataEventProducers = config.data?.resources.flatMap(resource =>
    DATA_EVENT_TYPES_V2.map(eventType => ({
      code: `data:${resource.code}:${eventType}`,
      source: 'data' as const,
      eventType,
      dataSchemaVersion: '2.0.0',
      resourceCode: resource.code,
    }))
  ) || [];
  const workflowEventProducers = config.workflows?.activations.length
    ? WORKFLOW_EVENT_TYPES_V2.map(eventType => ({
        code: `workflow:${eventType}`,
        source: 'workflow' as const,
        eventType,
        dataSchemaVersion: '2.0.0',
      }))
    : [];
  const eventProducers = sorted(
    [
      ...dataEventProducers,
      ...normalizedConfiguration.events.schemas.map(schema => ({
        code: `app:${schema.eventType}`,
        source: 'app' as const,
        eventType: schema.eventType,
        dataSchemaVersion: schema.dataSchemaVersion,
      })),
      ...normalizedConfiguration.events.timers.map(timer => ({
        code: timer.code,
        source: 'timer' as const,
        eventType: timer.eventType,
        dataSchemaVersion:
          applicationSchemaVersions.get(timer.eventType) || '2.0.0',
      })),
      ...normalizedConfiguration.events.dateTriggers.map(trigger => ({
        code: trigger.code,
        source: 'date' as const,
        eventType: trigger.eventType,
        dataSchemaVersion:
          applicationSchemaVersions.get(trigger.eventType) || '2.0.0',
        resourceCode: trigger.resourceCode,
        field: trigger.field,
      })),
      ...workflowEventProducers,
    ],
    item => `${item.source}:${item.code}:${item.eventType}`
  );
  const eventTypes = uniqueSorted([
    ...eventConsumers.flatMap(item => item.eventTypes),
    ...eventProducers.map(item => item.eventType),
  ]);
  const workflows = compileWorkflows(config);
  const adminPages = compileAdminPages(config);
  return {
    schemaVersion: CONTRACT_BUNDLE_SCHEMA,
    compilerContractVersion: COMPILER_CONTRACT_VERSION,
    generatorVersion,
    appCode: config.app.code,
    configDigest,
    perspectives: normalizedConfiguration.perspectives,
    resources: compileResources(normalizedConfiguration),
    capabilities,
    operations: compileOperations(config),
    eventConsumers,
    eventProducers,
    eventSchemas: normalizedConfiguration.events.schemas,
    eventHandlerManifest: {
      schemaVersion: SCHEMA_VERSIONS.eventHandlerManifest,
      appCode: config.app.code,
      handlers: eventConsumers.map(consumer => ({
        code: consumer.code,
        endpointPath: consumer.endpointPath,
        eventTypes: consumer.eventTypes,
        dataSchemaVersions: uniqueSorted(
          consumer.eventTypes.map(eventType =>
            eventType.startsWith('openxiangda.')
              ? '2.0.0'
              : applicationSchemaVersions.get(eventType) || '2.0.0'
          )
        ),
        maxBodyBytes: 65_536,
        receiptProtocolVersion: 2 as const,
      })),
    },
    eventTypes,
    workflows,
    routes: compileFrontendRoutes(config),
    authentication: compileApplicationAuthentication(config),
    ...(config.frontend.publicAccess
      ? { publicAccess: compileAnonymousPublicAccess(config) }
      : {}),
    ...(normalizedConfiguration.frontend.admin.access
      ? { adminAccess: normalizedConfiguration.frontend.admin.access }
      : {}),
    routeManifest: compileStandardRouteManifest(config),
    adminPages,
    adminNavigation: compileAdminNavigation(config),
  };
}

function compilePerspectives(
  config: OpenXiangdaAppConfig
): AppPerspectiveContract[] {
  const capabilitiesByRole = new Map(
    (config.authz?.roles || []).map(role => [role.code, role.capabilities])
  );
  return sorted(
    (config.perspectives || []).map(perspective => ({
      code: perspective.code,
      name: perspective.name,
      ...(perspective.description
        ? { description: perspective.description }
        : {}),
      roleCodes: uniqueSorted(perspective.roleCodes),
      capabilityCodes: uniqueSorted(
        perspective.roleCodes.flatMap(
          roleCode => capabilitiesByRole.get(roleCode) || []
        )
      ),
      ...(perspective.default === true ? { default: true } : {}),
    })),
    item => item.code
  );
}

function compileFrontendRoutes(config: OpenXiangdaAppConfig) {
  return sorted(
    (config.frontend.routes || []).map(route => ({
      code: route.code,
      path: route.path,
      label: route.label,
      surface: route.surface,
      ...(route.parentCode ? { parentCode: route.parentCode } : {}),
      ...(route.capability ? { capability: route.capability } : {}),
      ...(route.access
        ? {
            access: {
              ...(route.access.allOf
                ? { allOf: uniqueSorted([...route.access.allOf]) }
                : {}),
              ...(route.access.anyOf
                ? { anyOf: uniqueSorted([...route.access.anyOf]) }
                : {}),
            },
          }
        : {}),
      ...(route.pinned !== undefined ? { pinned: route.pinned } : {}),
      tabPersistence:
        route.tabPersistence ?? (/[:*]/.test(route.path) ? 'none' : 'session'),
      keepAlive: route.keepAlive ?? 'none',
    })),
    item => item.code
  );
}

function compileApplicationAuthentication(config: OpenXiangdaAppConfig) {
  const authentication = config.frontend.authentication;
  if (!authentication) return null;
  return {
    accountMode: authentication.accountMode,
    registration: { mode: authentication.registration.mode },
    methods: authentication.methods.map(method => ({ ...method })),
    surfaces: {
      desktop: { ...authentication.surfaces.desktop },
      mobile: { ...authentication.surfaces.mobile },
    },
  };
}

function compileAnonymousPublicAccess(config: OpenXiangdaAppConfig) {
  const publicAccess = config.frontend.publicAccess;
  if (!publicAccess) return null;
  return {
    policies: sorted(
      publicAccess.policies.map(policy => ({
        code: policy.code,
        routeCode: policy.routeCode,
        mode: policy.mode,
        resourceCode: policy.resourceCode,
        operations: uniqueSorted([...policy.operations]),
        fields: uniqueSorted([...policy.fields]),
        ...(policy.requiredFields
          ? { requiredFields: uniqueSorted([...policy.requiredFields]) }
          : {}),
        ...(policy.ownRecordFields
          ? { ownRecordFields: uniqueSorted([...policy.ownRecordFields]) }
          : {}),
        ...(policy.draft
          ? {
              draft: {
                enabled: true as const,
                inactivityTtlSeconds:
                  policy.draft.inactivityTtlSeconds ?? 2_592_000,
                maxBytes: policy.draft.maxBytes ?? 262_144,
              },
            }
          : {}),
        ...(policy.validations
          ? {
              validations: sorted(
                policy.validations.map(validation => ({
                  code: validation.code,
                  kind: validation.kind,
                  fields: uniqueSorted([...validation.fields]),
                  result: validation.result,
                })),
                item => item.code
              ),
            }
          : {}),
      })),
      item => item.code
    ),
  };
}

function generatedResourceOperations(resource: DataResource) {
  const native = (resource.surface?.mutationOwner || 'native') === 'native';
  return {
    list: resource.surface?.generated?.list ?? true,
    detail: resource.surface?.generated?.detail ?? true,
    create: resource.surface?.generated?.create ?? native,
    update: resource.surface?.generated?.update ?? native,
    delete: resource.surface?.generated?.delete ?? native,
  };
}

function normalizeWorkflowNamedOperationIntent(
  intent: AppWorkflowNamedOperationIntentDeclaration
) {
  return {
    operationCode: intent.operationCode,
    inputs: Object.fromEntries(
      Object.entries(intent.inputs)
        .sort(([left], [right]) => compare(left, right))
        .map(([inputCode, binding]) => [inputCode, { ...binding }])
    ),
    output: { ...intent.output },
  };
}

function normalizeWorkflowLaunchDeclaration(
  launch?: AppWorkflowLaunchDeclaration
): AppWorkflowLaunchDeclaration {
  return {
    mode: launch?.mode || 'work-center-only',
    ...(launch?.submission
      ? {
          submission: {
            kind: 'named-operation' as const,
            ...(launch.submission.create
              ? {
                  create: normalizeWorkflowNamedOperationIntent(
                    launch.submission.create
                  ),
                }
              : {}),
            ...(launch.submission.existing
              ? {
                  existing: normalizeWorkflowNamedOperationIntent(
                    launch.submission.existing
                  ),
                }
              : {}),
            ...(launch.submission.context
              ? {
                  context: [...launch.submission.context]
                    .map(context => ({ ...context }))
                    .sort((left, right) =>
                      compare(left.queryParameter, right.queryParameter)
                    ),
                }
              : {}),
          },
        }
      : {}),
  };
}

function compileWorkflowNamedOperationIntent(
  config: OpenXiangdaAppConfig,
  intent: AppWorkflowNamedOperationIntentDeclaration
): AppWorkflowNamedOperationIntentContract {
  const operation = (config.backend?.operations || []).find(
    candidate => candidate.code === intent.operationCode
  )!;
  return {
    ...normalizeWorkflowNamedOperationIntent(intent),
    method: 'POST',
    path: operation.path,
    requiredCapability: operation.capability,
    requestSchemaDigest: sha256Digest(operation.requestSchema),
    responseSchemaDigest: sha256Digest(operation.responseSchema),
  };
}

function compileWorkflowLaunchContract(
  config: OpenXiangdaAppConfig,
  launch?: AppWorkflowLaunchDeclaration
): AppWorkflowLaunchContract {
  const normalized = normalizeWorkflowLaunchDeclaration(launch);
  if (!normalized.submission) return { mode: normalized.mode };
  return {
    mode: normalized.mode,
    submission: {
      kind: 'named-operation',
      ...(normalized.submission.create
        ? {
            create: compileWorkflowNamedOperationIntent(
              config,
              normalized.submission.create
            ),
          }
        : {}),
      ...(normalized.submission.existing
        ? {
            existing: compileWorkflowNamedOperationIntent(
              config,
              normalized.submission.existing
            ),
          }
        : {}),
      context: [...(normalized.submission.context || [])],
    },
  };
}

function generatedAdminResourcePath(
  resourceCode: string,
  operation: 'list' | 'detail' | 'create' | 'update',
  viewCode?: string
) {
  const base = `/admin/resources/${resourceCode}${viewCode ? `/views/${viewCode}` : ""}`;
  if (operation === 'list') return base;
  if (operation === 'create') return `${base}/new`;
  if (operation === 'update') return `${base}/:id/edit`;
  return `${base}/:id`;
}

function compileAdminPages(config: OpenXiangdaAppConfig): AppAdminPageContract[] {
  const pages: AppAdminPageContract[] = [];
  for (const selection of sorted(config.data?.resources || [], item => item.code).flatMap(resource => [
    { resource, viewCode: undefined as string | undefined },
    ...(resource.surface?.views || []).map(view => ({ viewCode: view.code,
      resource: { ...resource, name: view.name, surface: projectDataResourceView(resource.surface!, view.code) } })),
  ])) {
    const { resource, viewCode } = selection;
    const generated = generatedResourceOperations(resource);
    const candidates: Array<{
      operation: 'list' | 'detail' | 'create' | 'update';
      kind: AppAdminPageContract['kind'];
      path: string;
      label: string;
      capability: string;
      navigationEligible: boolean;
    }> = [
      {
        operation: 'list',
        kind: 'resource-list',
        path: generatedAdminResourcePath(resource.code, 'list', viewCode),
        label: resource.name,
        capability: resource.capabilities.read,
        navigationEligible: true,
      },
      {
        operation: 'detail',
        kind: 'resource-detail',
        path: generatedAdminResourcePath(resource.code, 'detail', viewCode),
        label: `${resource.name}详情`,
        capability: resource.capabilities.read,
        navigationEligible: false,
      },
      {
        operation: 'create',
        kind: 'resource-create',
        path: generatedAdminResourcePath(resource.code, 'create', viewCode),
        label: `新增${resource.name}`,
        capability: resource.capabilities.create,
        navigationEligible: false,
      },
      {
        operation: 'update',
        kind: 'resource-update',
        path: generatedAdminResourcePath(resource.code, 'update', viewCode),
        label: `编辑${resource.name}`,
        capability: resource.capabilities.update,
        navigationEligible: false,
      },
    ];
    for (const candidate of candidates) {
      if (!generated[candidate.operation]) continue;
      pages.push({
        code: `resource:${resource.code}${viewCode ? `:view:${viewCode}` : ""}:${candidate.operation}`,
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
  for (const route of compileFrontendRoutes(config)) {
    if (route.surface !== 'admin') continue;
    pages.push({
      code: `operation:${route.code}`,
      kind: 'operation',
      path: route.path,
      label: route.label,
      navigationEligible:
        !route.path.startsWith('/m/admin') && !/[:*]/.test(route.path),
      routeCode: route.code,
    });
  }
  return pages.sort((left, right) => compare(left.code, right.code));
}

function routePathParams(path: string): string[] {
  return uniqueSorted(
    [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(match => match[1]!)
  );
}

export const DEFAULT_ROUTE_MANIFEST_DEVICE_POLICY = Object.freeze({
  kind: 'viewport-family',
  mobileMaxWidthPx: 900,
  desktopMinWidthPx: 901,
} satisfies AppRouteManifestDevicePolicyV3);

function compileRouteManifestDevicePolicy(
  config: OpenXiangdaAppConfig,
): AppRouteManifestDevicePolicyV3 {
  return {
    ...DEFAULT_ROUTE_MANIFEST_DEVICE_POLICY,
    ...(config.frontend.devicePolicy || {}),
  };
}

function compileStandardRouteManifestRoute(
  routeCode: string,
  path: string,
  surface: 'admin' | 'user',
  access?: Pick<AppRouteManifestRouteV3, 'capability' | 'access'>
): AppRouteManifestRouteV3 {
  return {
    routeCode,
    path,
    surface,
    pathParams: routePathParams(path),
    ...(access?.capability ? { capability: access.capability } : {}),
    ...(access?.access ? { access: access.access } : {}),
    requiresAuthentication: true,
  };
}

function standardRouteCode(
  kind: AppRouteManifestEntryV3['kind'],
  device: 'desktop' | 'mobile',
  workflowCode?: string
) {
  if (kind === 'workflow-launch')
    return `workflow.${workflowCode}.launch.${device}`;
  if (kind === 'application-todo-center')
    return `application.todo-center.${device}`;
  return `${kind.replaceAll('-', '.')}.${device}`;
}

function compileStandardRouteManifest(
  config: OpenXiangdaAppConfig
): AppRouteManifestV3 {
  const routes: AppRouteManifestEntryV3[] = [];
  const addRoute = (
    code: string,
    kind: AppRouteManifestEntryV3['kind'],
    desktopPath: string,
    mobilePath: string,
    workflowCode?: string,
    access?: Pick<AppRouteManifestRouteV3, 'capability' | 'access'>
  ) => {
    routes.push({
      code,
      kind,
      ...(workflowCode ? { workflowCode } : {}),
      desktop: compileStandardRouteManifestRoute(
        standardRouteCode(kind, 'desktop', workflowCode),
        desktopPath,
        'user',
        access
      ),
      mobile: compileStandardRouteManifestRoute(
        standardRouteCode(kind, 'mobile', workflowCode),
        mobilePath,
        'user',
        access
      ),
    });
  };
  if (config.frontend.user?.applicationTodoCenter === true) {
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
    if (!['standalone', 'hidden-handoff'].includes(workflow.launch.mode)) continue;
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
        ? { capability: namedCapabilities[0]! }
        : namedCapabilities.length > 1
          ? { access: { anyOf: namedCapabilities } }
          : undefined
    );
  }
  const normalizedRoutes = routes.sort((left, right) => compare(left.code, right.code));
  const staticRoute = (device: 'desktop' | 'mobile') => {
    const expectedPath = device === 'mobile' ? '/m/' : '/';
    const declared = (config.frontend.routes || [])
      .filter(
        route =>
          route.surface === 'user' &&
          validManifestStaticPath(route.path) &&
          route.path === expectedPath,
      )
      .sort((left, right) => compare(left.code, right.code))[0];
    if (
      declared &&
      declared.surface === 'user' &&
      validManifestStaticPath(declared.path)
    ) {
      return { code: declared.code, path: declared.path };
    }
    const fallback = (config.frontend.routes || [])
      .filter(
        route =>
          route.surface === 'user' &&
          validManifestStaticPath(route.path) &&
          (device === 'mobile'
            ? route.path.startsWith('/m/')
            : !route.path.startsWith('/m/')),
      )
      .sort((left, right) => compare(left.code, right.code))[0];
    return fallback
      ? { code: fallback.code, path: fallback.path }
      : {
          code: device === 'mobile' ? 'application-root-mobile' : 'application-root',
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
  const rootDesktop = staticRoute('desktop');
  const rootMobile = staticRoute('mobile');
  const payload = {
    schemaVersion: SCHEMA_VERSIONS.applicationRouteManifest,
    appCode: config.app.code,
    devicePolicy: compileRouteManifestDevicePolicy(config),
    rootEntry: {
      code: rootDesktop.code,
      desktop: rootDesktop.path,
      mobile: rootMobile.path,
    },
    authentication,
    routes: normalizedRoutes,
  } satisfies Omit<AppRouteManifestV3, 'digest'>;
  return { ...payload, digest: sha256Digest(payload) };
}

function validManifestStaticPath(path: string) {
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('..') &&
    !/[:*?#\\]/.test(path) &&
    path.length <= 2048
  );
}

function pageCodeForReference(
  reference: import('openxiangda-contracts').AppAdminPageReference
) {
  if (reference.kind === 'resource') return `resource:${reference.resourceCode}${reference.viewCode ? `:view:${reference.viewCode}` : ""}:list`;
  return `operation:${reference.routeCode}`;
}

function compileAdminNavigation(
  config: OpenXiangdaAppConfig
): AppAdminNavigationGroupContract[] {
  return (config.frontend.admin?.navigation || [])
    .map((group, groupIndex) => ({
      code: group.code,
      label: group.label,
      ...(group.icon ? { icon: group.icon } : {}),
      order: group.order ?? groupIndex,
      items: group.items
        .map((item, itemIndex) => ({
          pageCode: pageCodeForReference(item.page),
          ...(item.label ? { label: item.label } : {}),
          ...(item.icon ? { icon: item.icon } : {}),
          order: item.order ?? itemIndex,
        }))
        .sort(
          (left, right) =>
            left.order - right.order || compare(left.pageCode, right.pageCode)
        ),
    }))
    .sort(
      (left, right) => left.order - right.order || compare(left.code, right.code)
    );
}

type NormalizedCapabilityConfiguration = Pick<
  ConfigurationBundleV3,
  'appCode' | 'authz' | 'data'
>;

/**
 * Compile the capability projection from normalized configuration only.
 *
 * Catalog ownership is validated before compilation. This keeps the existing
 * platform -> explicit -> resource registration semantics and the resource
 * owner when a field policy reuses its code. The only new determinism rule is
 * that normalized resources/field keys and the platform's fixed operation
 * order are used instead of source object insertion order.
 */
function compileCapabilities(
  configuration: NormalizedCapabilityConfiguration
): AppCapabilityContract[] {
  const capabilities = new Map<string, AppCapabilityContract>();
  for (const item of platformCapabilities(configuration.appCode)) {
    capabilities.set(item.code, item);
  }
  for (const item of [...configuration.authz.capabilities].sort((left, right) =>
    compare(left.code, right.code)
  )) {
    capabilities.set(item.code, {
      ...item,
      source: 'explicit',
    });
  }
  for (const resource of [...configuration.data.resources].sort((left, right) =>
    compare(left.code, right.code)
  )) {
    const operationNames: Record<string, string> = {
      read: `读取${resource.name}`,
      create: `新建${resource.name}`,
      update: `更新${resource.name}`,
      delete: `删除${resource.name}`,
    };
    for (const operation of ['read', 'create', 'update', 'delete'] as const) {
      const code = resource.capabilities[operation];
      if (!code) continue;
      capabilities.set(code, {
        code,
        kind: 'data',
        name: operationNames[operation] ?? `${resource.name} ${operation}`,
        source: 'data',
      });
    }
    for (const [fieldCode, policy] of Object.entries(
      resource.fieldPolicies || {}
    ).sort(([left], [right]) => compare(left, right))) {
      if (isDataAuditMetadataField(fieldCode)) continue;
      for (const operation of ['read', 'create', 'update'] as const) {
        const codes = policy[operation];
        if (!Array.isArray(codes)) continue;
        for (const code of [...codes].sort(compare)) {
          if (capabilities.has(code)) continue;
          capabilities.set(code, {
            code,
            kind: 'data',
            name: `${resource.name}.${fieldCode}.${operation}`,
            source: 'data',
          });
        }
      }
    }
  }
  return [...capabilities.values()].sort((left, right) =>
    compare(left.code, right.code)
  );
}

function compileResources(config: ConfigurationBundleV3) {
  const detailRouteByResourceCode = new Map(
    (config.data.resourceDetailRoutes || []).map(declaration => [
      declaration.resourceCode,
      declaration,
    ])
  );
  return sorted(
    config.data.resources.map<AppResourceContract>(resource => {
      const detailRouteCode = detailRouteByResourceCode.get(resource.code);
      return {
        code: resource.code,
        // The platform only receives immutable artifact bytes. Bind the
        // contract to the normalized schema in config-bundle/v3, never to
        // ordering or optional-property details that existed only in source.
        schemaDigest: sha256Digest(resource.schema),
        fields: sorted(
          resource.schema.fields.map(field => ({
            code: field.code,
            type: field.type,
          })),
          field => field.code
        ),
        ...(detailRouteCode
          ? {
              detailRouteCode: {
                desktop: detailRouteCode.desktop,
                mobile: detailRouteCode.mobile,
              },
            }
          : {}),
      };
    }),
    item => item.code
  );
}

function compileOperations(config: OpenXiangdaAppConfig) {
  return sorted(
    (config.backend.operations || []).map<AppApiOperationContract>(operation => ({
      code: operation.code,
      method: operation.method,
      path: operation.path,
      requiredCapability: operation.capability,
      requestSchemaDigest: sha256Digest(operation.requestSchema),
      responseSchemaDigest: sha256Digest(operation.responseSchema),
      ...(operation.description
        ? { description: operation.description }
        : {}),
      ...(operation.platformAccess
        ? {
            platformAccess: {
              ...(operation.platformAccess.roleAssertions ? {
                roleAssertions: { roleCodes: uniqueSorted(operation.platformAccess.roleAssertions.roleCodes) },
              } : {}),
              ...(operation.platformAccess.directory
                ? {
                    directory: {
                      mode: operation.platformAccess.directory.mode,
                      fields: uniqueSorted(
                        operation.platformAccess.directory.fields
                      ),
                    },
                  }
                : {}),
              ...(operation.platformAccess.managedFiles
                ? {
                    managedFiles: sorted(
                      operation.platformAccess.managedFiles.map(item => ({
                        resourceCode: item.resourceCode,
                        fieldCodes: uniqueSorted(item.fieldCodes),
                        intents: uniqueSorted(item.intents),
                      })),
                      item => item.resourceCode
                    ),
                  }
                : {}),
              ...(operation.platformAccess.managedFileCopies
                ? {
                    managedFileCopies: sorted(
                      operation.platformAccess.managedFileCopies.map(item => ({
                        mode: item.mode,
                        sourceResourceCode: item.sourceResourceCode,
                        sourceFieldCodes: uniqueSorted(item.sourceFieldCodes),
                        targetResourceCode: item.targetResourceCode,
                        targetFieldCodes: uniqueSorted(item.targetFieldCodes),
                      })),
                      item => `${item.sourceResourceCode}:${item.sourceFieldCodes.join(',')}=>${item.targetResourceCode}:${item.targetFieldCodes.join(',')}`
                    ),
                  }
                : {}),
              ...(operation.platformAccess.notification
                ? {
                    notification: {
                      mode: operation.platformAccess.notification.mode,
                    },
                  }
                : {}),
              ...(operation.platformAccess.workflow
                ? {
                    workflow: {
                      codes: uniqueSorted(operation.platformAccess.workflow.codes),
                    },
                  }
                : {}),
            },
          }
        : {}),
    })),
    item => item.code
  );
}

function compileWorkflows(config: OpenXiangdaAppConfig) {
  const workflowCodes = uniqueSorted(
    (config.workflows?.definitions || []).map(item => item.definition.code)
  );
  return workflowCodes.map<AppWorkflowContract>(code => {
    const definitions = (config.workflows?.definitions || []).filter(
      item => item.definition.code === code
    );
    const activation = (config.workflows?.activations || []).find(
      item => item.workflowCode === code
    );
    const currentDefinition =
      definitions.find(item => item.version === activation?.definitionVersion) ||
      [...definitions].sort((left, right) => right.version - left.version)[0]!;
    const allowedOperations = new Set<WorkflowCommand>();
    for (const declaration of definitions) {
      for (const node of Object.values(declaration.definition.nodes)) {
        if (node.kind !== 'approval') continue;
        for (const operation of node.allowedOperations || []) {
          allowedOperations.add(operation);
        }
      }
    }
    return {
      code,
      title: currentDefinition.definition.title,
      acceptedCommandDeactivationPolicy:
        currentDefinition.definition.acceptedCommandDeactivationPolicy,
      subject: {
        ...currentDefinition.definition.subject,
        summaryFields: Array.isArray(
          currentDefinition.definition.subject.summaryFields
        )
          ? [...currentDefinition.definition.subject.summaryFields]
          : [],
      },
      launch: compileWorkflowLaunchContract(config, currentDefinition.launch),
      ...(['standalone', 'hidden-handoff'].includes(
        currentDefinition.launch?.mode || 'work-center-only'
      ) && !currentDefinition.launch?.submission
        ? {
            processOperationCode: `openxiangda.workflow.${code}.submit`,
          }
        : {}),
      ...(currentDefinition.detailRouteCode
        ? { detailRouteCode: { ...currentDefinition.detailRouteCode } }
        : {}),
      definitionVersions: uniqueSortedNumbers(
        definitions.map(item => item.version)
      ),
      bindingVersions: uniqueSortedNumbers(
        (config.workflows?.bindings || [])
          .filter(item => item.binding.workflowCode === code)
          .map(item => item.version)
      ),
      providerCodes: uniqueSorted(
        (config.workflows?.providers || []).map(item => item.code)
      ),
      allowedOperations: [...allowedOperations].sort(compare),
      editableParameterCodes: uniqueSorted(
        (config.workflows?.editableParameters || [])
          .filter(item => item.workflowCode === code)
          .map(item => item.code)
      ),
    };
  });
}

function runtimeProtocolCapabilities(config: OpenXiangdaAppConfig) {
  const operations = config.backend.operations || [];
  const usesDirectory =
    config.data?.resources.some(resource =>
      resource.schema.fields.some(field =>
        field.type.startsWith('user.') || field.type.startsWith('department.')
      )
    ) || operations.some(operation => operation.platformAccess?.directory);
  return uniqueSorted([
    'application-native-2',
    'authz.batch-explain',
    'deployment.durable-runs',
    'deployment.platform-executor',
    ...(config.data?.resources.length ? ['data-api-v2'] : []),
    ...(usesDirectory ? ['directory-v2'] : []),
    ...(operations.some(
      operation =>
        operation.platformAccess?.managedFiles ||
        operation.platformAccess?.managedFileCopies
    ) || config.events?.subscriptions.some(subscription => subscription.platformAccess?.managedFileCopies)
      ? ['data.managed-files']
      : []),
    ...(operations.some(operation => operation.platformAccess?.notification) ||
    config.events?.subscriptions.some(
      subscription => subscription.platformAccess?.notification
    )
      ? ['notification-hub-v2']
      : []),
    ...(operations.some(operation => operation.platformAccess?.workflow) ||
    (config.workflows?.definitions || []).some(
      declaration =>
        declaration.launch?.mode === 'standalone' ||
        declaration.launch?.mode === 'hidden-handoff'
    )
      ? ['business-process.durable-command']
      : []),
    ...(config.events?.subscriptions.length ||
    config.events?.timers?.length ||
    config.events?.dateTriggers?.length
      ? ['events-v2', 'events.durable-receipts']
      : []),
    ...(config.workflows?.activations.length
      ? ['workflow-kernel-v2', 'workflow.fresh-command-token']
      : []),
    ...((config.workflows?.definitions || []).some(item => item.definition.instanceCommands !== undefined)
      ? ['workflow.instance-cancellation-policy']
      : []),
    ...(config.frontend.authentication
      ? ['authentication.application-login-surface']
      : []),
    ...(config.frontend.publicAccess
      ? ['public-access.anonymous-owner-records']
      : []),
  ]);
}

function platformCapabilities(appCode: string): AppCapabilityContract[] {
  return nativePlatformCapabilityCatalog(appCode);
}

function normalizeDataResource(resource: DataResource): DataResource {
  return {
    schemaVersion: resource.schemaVersion,
    appCode: resource.appCode,
    code: resource.code,
    name: resource.name,
    schema: {
      fields: resource.schema.fields.map(field => ({
        code: field.code,
        type: field.type,
        ...(field.nullable !== undefined ? { nullable: field.nullable } : {}),
        ...(field.indexed !== undefined ? { indexed: field.indexed } : {}),
        ...(field.options ? { options: field.options } : {}),
        ...(field.source
          ? { source: normalizeDataFieldSource(field.source) }
          : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
        ...(field.precision !== undefined ? { precision: field.precision } : {}),
        ...(field.scale !== undefined ? { scale: field.scale } : {}),
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
        ...(field.rangeBoundary
          ? { rangeBoundary: field.rangeBoundary }
          : {}),
        ...(field.timePrecision ? { timePrecision: field.timePrecision } : {}),
        ...(field.file
          ? {
              file: {
                ...(field.file.maxCount !== undefined
                  ? { maxCount: field.file.maxCount }
                  : {}),
                ...(field.file.maxSizeMb !== undefined
                  ? { maxSizeMb: field.file.maxSizeMb }
                  : {}),
                ...(field.file.accept
                  ? { accept: uniqueSorted(field.file.accept) }
                  : {}),
              },
            }
          : {}),
        ...(field.serial ? { serial: { ...field.serial } } : {}),
        ...(field.subtable ? { subtable: { ...field.subtable } } : {}),
      })),
    },
    ...(resource.surface
      ? { surface: normalizeResourceSurface(resource.surface) }
      : {}),
    ...(resource.invariants
      ? {
          invariants: [...resource.invariants]
            .sort((left, right) => compare(left.code, right.code))
            .map(invariant => ({
              code: invariant.code,
              ...(invariant.message ? { message: invariant.message } : {}),
              expression: { ...invariant.expression },
            })),
        }
      : {}),
    capabilities: { ...resource.capabilities },
    ...(resource.dataPolicyCode
      ? { dataPolicyCode: resource.dataPolicyCode }
      : {}),
    fieldPolicies: Object.fromEntries(
      [...resource.schema.fields.map(field => field.code),
        ...DATA_AUDIT_METADATA_FIELDS.filter(code =>
          Object.prototype.hasOwnProperty.call(resource.fieldPolicies || {}, code))]
        .map(code => [code, resource.fieldPolicies?.[code]] as const)
        .sort(([left], [right]) => compare(left, right))
        .map(([fieldCode, policy]) => [
          fieldCode,
          {
            ...(policy && Object.prototype.hasOwnProperty.call(policy, 'read')
              ? { read: uniqueSorted(policy.read || []) }
              : {}),
            ...(policy && Object.prototype.hasOwnProperty.call(policy, 'create')
              ? { create: uniqueSorted(policy.create || []) }
              : {}),
            ...(policy && Object.prototype.hasOwnProperty.call(policy, 'update')
              ? { update: uniqueSorted(policy.update || []) }
              : isDataAuditMetadataField(fieldCode) ? {} : { update: [] }),
            ...(policy?.mask ? { mask: policy.mask } : {}),
          },
        ])
    ),
  };
}

function normalizeDataPolicyRule(
  rule: import('./config.js').AuthzDataPolicyRuleDeclaration
): AppDataPolicyRuleDeclaration {
  if ('operator' in rule) {
    if ('operand' in rule) {
      return {
        field: rule.field,
        operator: rule.operator,
        operand: rule.operand,
        ...(rule.roleCodes ? { roleCodes: uniqueSorted(rule.roleCodes) } : {}),
      };
    }
    if (!('value' in rule)) {
      return {
        field: rule.field,
        operator: rule.operator,
        ...(rule.roleCodes ? { roleCodes: uniqueSorted(rule.roleCodes) } : {}),
      };
    }
    return {
      field: rule.field,
      operator: rule.operator,
      value: Array.isArray(rule.value)
        ? uniqueSorted(rule.value)
        : rule.value,
      ...(rule.roleCodes ? { roleCodes: uniqueSorted(rule.roleCodes) } : {}),
    };
  }
  if ('subject' in rule) {
    return {
      subject: rule.subject,
      field: rule.field,
      ...(rule.roleCodes ? { roleCodes: uniqueSorted(rule.roleCodes) } : {}),
    };
  }
  if ('dimensionCode' in rule) {
    return {
      dimensionCode: rule.dimensionCode,
      field: rule.field,
      ...(rule.roleCodes ? { roleCodes: uniqueSorted(rule.roleCodes) } : {}),
      ...(rule.operation ? { operation: rule.operation } : {}),
      ...(rule.valuePath ? { valuePath: rule.valuePath } : {}),
      ...(rule.emptyMatchesAll !== undefined
        ? { emptyMatchesAll: rule.emptyMatchesAll }
        : {}),
    };
  }
  return {
    relationCode: rule.relationCode,
    resourceCode: rule.resourceCode,
    field: rule.field,
    ...(rule.roleCodes ? { roleCodes: uniqueSorted(rule.roleCodes) } : {}),
    ...(rule.operation ? { operation: rule.operation } : {}),
    ...(rule.valuePath ? { valuePath: rule.valuePath } : {}),
  };
}

function normalizeDataPolicyExpression(
  expression: AppDataPolicyExpressionDeclaration
): AppDataPolicyExpressionDeclaration {
  if ('allOf' in expression) {
    return { allOf: expression.allOf.map(normalizeDataPolicyExpression) };
  }
  if ('anyOf' in expression) {
    return { anyOf: expression.anyOf.map(normalizeDataPolicyExpression) };
  }
  return normalizeDataPolicyRule(expression as AppDataPolicyRuleDeclaration);
}

function normalizeDataPolicyDeclaration(
  policy: AppDataPolicyDeclaration
): AppDataPolicyDeclaration {
  const common = {
    code: policy.code,
    name: policy.name,
    resourceCode: policy.resourceCode,
    ...(policy.unrestrictedRoleCodes !== undefined
      ? { unrestrictedRoleCodes: uniqueSorted(policy.unrestrictedRoleCodes) }
      : {}),
  };
  if (policy.readExpression !== undefined) {
    const readExpression = normalizeDataPolicyExpression(
      policy.readExpression
    );
    if (policy.writeBoundary === 'capability_only') {
      return {
        ...common,
        matchMode: 'AND',
        rules: [],
        readExpression,
        writeBoundary: 'capability_only',
      };
    }
    return {
      ...common,
      matchMode: policy.matchMode,
      rules: policy.rules.map(normalizeDataPolicyRule),
      readExpression,
    };
  }
  return {
    ...common,
    ...(policy.operations
      ? {
          operations: uniqueSorted(policy.operations) as Array<
            'read' | 'create' | 'update' | 'delete'
          >,
        }
      : {}),
    matchMode: policy.matchMode,
    rules: policy.rules.map(normalizeDataPolicyRule),
  };
}

export function renderGeneratedContracts(
  config: OpenXiangdaAppConfig,
  contract = compileContractBundle(config)
) {
  const resourceCodes = contract.resources.map(item => item.code);
  const capabilities = contract.capabilities.map(item => item.code);
  const eventSubscriptionCodes = contract.eventConsumers.map(item => item.code);
  const workflowCodes = contract.workflows.map(item => item.code);
  const resourceSurfaces = Object.fromEntries(
    sorted(config.data?.resources || [], item => item.code).map(item => [
      item.code,
      normalizeResourceSurface(
        item.surface || defaultResourceSurface(item)
      ),
    ])
  );
  const resourceDefinitions = `{${
    resourceCodes.length
      ? `\n${sorted(config.data?.resources || [], item => item.code)
          .map(
            item =>
              `  ${JSON.stringify(item.code)}: {\n` +
              `    code: ${JSON.stringify(item.code)},\n` +
              `    name: ${JSON.stringify(item.name)},\n` +
              (item.detailRouteCode
                ? `    detailRouteCode: ${JSON.stringify(item.detailRouteCode)},\n`
                : '') +
              `    capabilities: ${JSON.stringify(item.capabilities, null, 2)
                .split('\n')
                .map((line, index) => (index === 0 ? line : `    ${line}`))
                .join('\n')},\n` +
              `    surface: resourceSurfaces[${JSON.stringify(item.code)}],\n` +
              '  }'
          )
          .join(',\n')}\n`
      : ''
  }}`;
  const operationEntries: Array<readonly [string, unknown]> =
    contract.operations.map(operation => [
      camel(operation.code),
      operation,
    ] as const);
  const routeEntries: Array<readonly [string, unknown]> = contract.routes.map(
    route => [camel(route.code), route] as const
  );
  const authenticationSurfaceEntries: Array<readonly [string, unknown]> =
    contract.authentication
      ? (['desktop', 'mobile'] as const).map(device => {
          const surface = contract.authentication!.surfaces[device];
          return [camel(surface.routeCode), { device, ...surface }] as const;
        })
      : [];
  const platformAuthManifest = contract.authentication
    ? {
        schemaVersion: 'openxiangda.platform-auth-manifest/v2',
        appCode: config.app.code,
        protectedUserRouteCount: contract.routes.filter(
          route => route.surface === 'user'
        ).length,
        methods: contract.authentication.methods,
        surfaces: (['desktop', 'mobile'] as const).map(device => ({
          device,
          ...contract.authentication!.surfaces[device],
        })),
      }
    : null;
  const eventHandlerEntries: Array<readonly [string, unknown]> =
    contract.eventHandlerManifest.handlers.map(handler => [
      handler.code,
      handler,
    ] as const);
  const eventTypesForSubscription = contract.eventConsumers.length
    ? contract.eventConsumers
        .map(
          consumer =>
            `TCode extends ${JSON.stringify(consumer.code)} ? ${consumer.eventTypes
              .map(eventType => JSON.stringify(eventType))
              .join(' | ')} :`
        )
        .join(' ') + ' never'
    : 'never';
  const lines = [
    '// Generated by OpenXiangda 2.0 Native compiler. Do not edit by hand.',
    `export const compilerContractVersion = ${JSON.stringify(COMPILER_CONTRACT_VERSION)} as const;`,
    `export const appCode = ${JSON.stringify(config.app.code)} as const;`,
    `export const appName = ${JSON.stringify(config.app.name)} as const;`,
    `export const appPerspectives = ${JSON.stringify(contract.perspectives, null, 2)} as const;`,
    `export const resourceCodes = ${JSON.stringify(resourceCodes, null, 2)} as const;`,
    `export const resourceSurfaces = ${JSON.stringify(resourceSurfaces, null, 2)} as const;`,
    `export const resourceDefinitions = ${resourceDefinitions} as const;`,
    `export const capabilities = ${JSON.stringify(capabilities, null, 2)} as const;`,
    `export const appOperations = ${renderEntries(operationEntries)} as const;`,
    `export const appRoutes = ${renderEntries(routeEntries)} as const;`,
    `export const authenticationMethods = ${JSON.stringify(contract.authentication?.methods || [], null, 2)} as const;`,
    `export const authenticationSurfaces = ${renderEntries(authenticationSurfaceEntries)} as const;`,
    contract.authentication
      ? `export const applicationAuthentication = ${JSON.stringify(contract.authentication, null, 2)} as const;`
      : 'export const applicationAuthentication = undefined;',
    contract.publicAccess
      ? `export const anonymousPublicAccess = ${JSON.stringify(contract.publicAccess, null, 2)} as const;`
      : 'export const anonymousPublicAccess = undefined;',
    platformAuthManifest
      ? `export const platformAuthManifest = ${JSON.stringify(platformAuthManifest, null, 2)} as const;`
      : 'export const platformAuthManifest = null;',
    contract.adminAccess
      ? `export const adminAccess = ${JSON.stringify(contract.adminAccess, null, 2)} as const;`
      : 'export const adminAccess = undefined;',
    `export const routeManifest = ${JSON.stringify(contract.routeManifest, null, 2)} as const;`,
    `export const adminPages = ${JSON.stringify(contract.adminPages, null, 2)} as const;`,
    `export const adminNavigation = ${JSON.stringify(contract.adminNavigation, null, 2)} as const;`,
    `export const eventTypes = ${JSON.stringify(contract.eventTypes, null, 2)} as const;`,
    `export const eventSubscriptionCodes = ${JSON.stringify(eventSubscriptionCodes, null, 2)} as const;`,
    `export const eventHandlerManifest = ${JSON.stringify(contract.eventHandlerManifest, null, 2)} as const;`,
    `export const eventHandlers = ${renderEntries(eventHandlerEntries)} as const;`,
    `export const eventSchemas = ${JSON.stringify(contract.eventSchemas, null, 2)} as const;`,
    `export const workflowCodes = ${JSON.stringify(workflowCodes, null, 2)} as const;`,
    `export const workflowDefinitions = ${JSON.stringify(
      contract.workflows.map(workflow => ({
        code: workflow.code,
        title: workflow.title,
        acceptedCommandDeactivationPolicy:
          workflow.acceptedCommandDeactivationPolicy,
        subject: workflow.subject,
        launch: workflow.launch,
        ...(workflow.processOperationCode
          ? { processOperationCode: workflow.processOperationCode }
          : {}),
        ...(workflow.detailRouteCode
          ? { detailRouteCode: workflow.detailRouteCode }
          : {}),
      })),
      null,
      2
    )} as const;`,
    'export const notificationTemplateCodes = {',
    '  applicationInformational: "application.informational.standard",',
    '} as const;',
    '',
    'export type ResourceCode = (typeof resourceCodes)[number];',
    'export type Capability = (typeof capabilities)[number];',
    'export type AppOperation = (typeof appOperations)[keyof typeof appOperations];',
    'export type AppRoute = (typeof appRoutes)[keyof typeof appRoutes];',
    'export type AppRouteCode = AppRoute["code"];',
    'export type ApplicationAuthenticationMethod = (typeof authenticationMethods)[number];',
    'export type ApplicationAuthenticationSurface = (typeof authenticationSurfaces)[keyof typeof authenticationSurfaces];',
    'export type ApplicationAuthenticationSurfaceCode = ApplicationAuthenticationSurface["routeCode"];',
    'export type AnonymousPublicAccess = typeof anonymousPublicAccess;',
    'export type AdminAccess = typeof adminAccess;',
    'export type RouteManifest = typeof routeManifest;',
    'export type AdminPage = (typeof adminPages)[number];',
    'export type AdminNavigationGroup = (typeof adminNavigation)[number];',
    'export type AppPerspective = (typeof appPerspectives)[number];',
    'export type EventType = (typeof eventTypes)[number];',
    'export type EventSubscriptionCode = (typeof eventSubscriptionCodes)[number];',
    `export type EventTypesForSubscription<TCode extends EventSubscriptionCode> = ${eventTypesForSubscription};`,
    'export type WorkflowCode = (typeof workflowCodes)[number];',
    'export type NotificationTemplateCode = (typeof notificationTemplateCodes)[keyof typeof notificationTemplateCodes];',
    '',
    'export interface OpenXiangdaCloudEvent<TType extends EventType = EventType, TData extends Record<string, unknown> = Record<string, unknown>> {',
    '  specversion: "1.0";',
    '  id: string;',
    '  source: string;',
    '  type: TType;',
    '  subject?: string;',
    '  time: string;',
    '  datacontenttype: "application/json";',
    '  dataschema?: string;',
    '  data: TData;',
    '  tenantid: string;',
    '  appcode: typeof appCode;',
    '  environment: string;',
    '  traceid?: string;',
    '  schemaversion: string;',
    '}',
    'export type EventHandlerInput<TCode extends EventSubscriptionCode> = OpenXiangdaCloudEvent<EventTypesForSubscription<TCode>>;',
    '',
    FIELD_VALUE_TYPESCRIPT_DECLARATIONS,
    '',
  ];
  for (const resource of sorted(
    config.data?.resources || [],
    item => item.code
  )) {
    lines.push(`export interface ${pascal(resource.code)}Record {`);
    lines.push('  id: string;');
    lines.push('  revision: number;');
    for (const field of resource.schema.fields) {
      const nullable = fieldNullable(field);
      const optional = nullable ? '?' : '';
      lines.push(
        `  ${safeProperty(field.code)}${optional}: ${typescriptType(field.type)}${
          nullable ? ' | null' : ''
        };`
      );
    }
    lines.push('}', '');
    lines.push(`export interface ${pascal(resource.code)}CreateInput {`);
    for (const field of resource.schema.fields) {
      const surface = resourceSurfaces[resource.code]?.fields[field.code];
      if (
        !supportsGeneratedMutation({
          type: field.type,
          system: surface?.system,
        }) ||
        !surface?.createCapabilities.length
      ) continue;
      const nullable = fieldNullable(field);
      const optional = nullable ? '?' : '';
      lines.push(
        `  ${safeProperty(field.code)}${optional}: ${typescriptType(field.type)}${nullable ? ' | null' : ''};`
      );
    }
    lines.push('}', '');
    lines.push(`export interface ${pascal(resource.code)}UpdateInput {`);
    for (const field of resource.schema.fields) {
      const surface = resourceSurfaces[resource.code]?.fields[field.code];
      if (
        !supportsGeneratedMutation({
          type: field.type,
          system: surface?.system,
        }) ||
        !surface?.updateCapabilities.length
      ) continue;
      const nullable = fieldNullable(field);
      lines.push(
        `  ${safeProperty(field.code)}?: ${typescriptType(field.type)}${nullable ? ' | null' : ''};`
      );
    }
    lines.push('}', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function normalizeResourceSurface(
  surface: DataResourceSurface
) {
  const fields = Object.fromEntries(
    Object.entries(surface.fields)
      .sort(([left], [right]) => compare(left, right))
      .map(([code, field]) => [
        code,
        {
          label: field.label,
          type: field.type,
          widget: field.widget,
          ...(field.section ? { section: field.section } : {}),
          ...(field.requiredHint !== undefined
            ? { requiredHint: field.requiredHint }
            : {}),
          ...(field.system !== undefined ? { system: field.system } : {}),
          ...(field.hidden !== undefined ? { hidden: field.hidden } : {}),
          readCapabilities: uniqueSorted(field.readCapabilities),
          createCapabilities: uniqueSorted(field.createCapabilities),
          updateCapabilities: uniqueSorted(field.updateCapabilities),
          ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
          ...(field.precision !== undefined ? { precision: field.precision } : {}),
          ...(field.scale !== undefined ? { scale: field.scale } : {}),
          ...(field.min !== undefined ? { min: field.min } : {}),
          ...(field.max !== undefined ? { max: field.max } : {}),
          ...(field.rangeBoundary
            ? { rangeBoundary: field.rangeBoundary }
            : {}),
          ...(field.maxCount !== undefined ? { maxCount: field.maxCount } : {}),
          ...(field.maxSizeMb !== undefined ? { maxSizeMb: field.maxSizeMb } : {}),
          ...(field.accept !== undefined ? { accept: field.accept } : {}),
          ...(field.options ? { options: field.options } : {}),
          ...(field.source
            ? { source: normalizeDataFieldSource(field.source) }
            : {}),
          ...(field.timePrecision
            ? { timePrecision: field.timePrecision }
            : {}),
          ...(field.serial ? { serial: { ...field.serial } } : {}),
          ...(field.subtable ? { subtable: { ...field.subtable } } : {}),
          ...(field.list !== undefined ? { list: field.list } : {}),
          ...(field.searchable !== undefined
            ? { searchable: field.searchable }
            : {}),
          ...(field.sortable !== undefined ? { sortable: field.sortable } : {}),
        },
      ])
  ) as Record<string, DataFieldSurface>;
  return {
    ...(surface.views?.length ? { views: sorted(surface.views, view => view.code) } : {}),
    ...(surface.mutationOwner !== undefined
      ? { mutationOwner: surface.mutationOwner }
      : {}),
    ...(surface.generated !== undefined
      ? { generated: { ...surface.generated } }
      : {}),
    fields,
    ...(surface.list
      ? {
          list: {
            ...(surface.list.actions !== undefined ? { actions: surface.list.actions } : {}),
            ...(surface.list.fieldOrder ? { fieldOrder: [...surface.list.fieldOrder] } : {}),
            ...(surface.list.defaultPageSize !== undefined
              ? { defaultPageSize: surface.list.defaultPageSize }
              : {}),
            ...(surface.list.searchableFields
              ? { searchableFields: [...surface.list.searchableFields] }
              : {}),
            ...(surface.list.filterFields
              ? { filterFields: [...surface.list.filterFields] }
              : {}),
            ...(surface.list.defaultSort
              ? { defaultSort: { ...surface.list.defaultSort } }
              : {}),
          },
        }
      : {}),
    ...(surface.form ? { form: { ...surface.form } } : {}),
    ...(surface.detail ? { detail: { ...surface.detail } } : {}),
    ...(surface.mobile ? { mobile: { ...surface.mobile } } : {}),
  };
}

function defaultResourceSurface(resource: DataResource): DataResourceSurface {
  const fields = resource.schema.fields.filter(field => field.code !== 'id');
  const visible = fields.slice(0, 8);
  const first = fields[0]?.code || 'id';
  const searchableFields = fields
    .filter(field => supportsSearch(field.type))
    .slice(0, 5)
    .map(field => field.code);
  const surfaceFields = Object.fromEntries(
    fields.map(field => [
      field.code,
      {
        label: field.code,
        type: field.type,
        widget: resolveDataFieldSurfaceWidget(field),
        ...(nativeFieldRequiresCreateInputV2(field) ? { requiredHint: true } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
        ...(field.precision !== undefined ? { precision: field.precision } : {}),
        ...(field.scale !== undefined ? { scale: field.scale } : {}),
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
        ...(field.rangeBoundary
          ? { rangeBoundary: field.rangeBoundary }
          : {}),
        ...(field.file?.maxCount !== undefined
          ? { maxCount: field.file.maxCount }
          : {}),
        ...(field.file?.maxSizeMb !== undefined
          ? { maxSizeMb: field.file.maxSizeMb }
          : {}),
        ...(field.file?.accept ? { accept: uniqueSorted(field.file.accept) } : {}),
        ...(field.options ? { options: field.options } : {}),
        ...(field.source ? { source: field.source } : {}),
        ...(field.timePrecision ? { timePrecision: field.timePrecision } : {}),
        ...(field.serial ? { serial: { ...field.serial } } : {}),
        ...(field.subtable ? { subtable: { ...field.subtable } } : {}),
        readCapabilities: [resource.capabilities.read],
        createCapabilities: [resource.capabilities.create],
        updateCapabilities: [resource.capabilities.update],
        ...(visible.some(item => item.code === field.code)
          ? { list: true }
          : {}),
        ...(searchableFields.includes(field.code) ? { searchable: true } : {}),
        ...(visible.some(item => item.code === field.code) &&
        supportsSort(field.type)
          ? { sortable: true }
          : {}),
      },
    ])
  ) as Record<string, DataFieldSurface>;
  return {
    mutationOwner: 'native',
    generated: {
      list: true,
      detail: true,
      create: true,
      update: true,
      delete: true,
    },
    fields: surfaceFields,
    list: {
      defaultPageSize: 20,
      ...(searchableFields.length ? { searchableFields } : {}),
      filterFields: visible.map(field => field.code),
      defaultSort: { field: first, order: 'asc' },
    },
    form: { layout: 'flat', fieldOrder: fields.map(field => field.code) },
    detail: { layout: 'flat', fieldOrder: fields.map(field => field.code) },
    mobile: { enabled: true },
  };
}

function normalizeDataFieldSource(
  source: NonNullable<
    DataResource['schema']['fields'][number]['source']
  >
) {
  return {
    kind: source.kind,
    resourceCode: source.resourceCode,
    labelField: source.labelField,
    ...(source.searchFields
      ? { searchFields: [...source.searchFields] }
      : {}),
    ...(source.descriptionFields
      ? { descriptionFields: [...source.descriptionFields] }
      : {}),
    ...(source.snapshotFields
      ? { snapshotFields: [...source.snapshotFields] }
      : {}),
    ...(source.filters
      ? {
          filters: source.filters.map(filter =>
            'binding' in filter
              ? { ...filter, binding: { ...filter.binding } }
              : { ...filter }
          ),
        }
      : {}),
    ...(source.pageSize !== undefined ? { pageSize: source.pageSize } : {}),
    ...(source.loadMode ? { loadMode: source.loadMode } : {}),
  };
}

export function sha256Bytes(content: string | Uint8Array) {
  return createHash('sha256').update(content).digest('hex');
}

function sorted<T>(items: readonly T[], key: (item: T) => string) {
  return [...items].sort((left, right) => compare(key(left), key(right)));
}

function uniqueSorted<T extends string>(items: readonly T[]): T[] {
  return [...new Set(items)].sort(compare);
}

function uniqueSortedNumbers(items: readonly number[]) {
  return [...new Set(items)].sort((left, right) => left - right);
}

function compare(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function pad(value: number) {
  return String(value).padStart(10, '0');
}

function pascal(value: string) {
  const normalized = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join('');
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `Resource${normalized}`;
}

function camel(value: string) {
  const pascalValue = pascal(value);
  return `${pascalValue[0]?.toLowerCase() || ''}${pascalValue.slice(1)}`;
}

function renderEntries(entries: Array<readonly [string, unknown]>) {
  if (entries.length === 0) return '{}';
  const body = entries
    .map(([key, value]) => `  ${safeProperty(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`)
    .join(',\n');
  return `{\n${body}\n}`;
}

function safeProperty(value: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)
    ? value
    : JSON.stringify(value);
}
