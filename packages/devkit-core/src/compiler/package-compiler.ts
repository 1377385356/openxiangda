import {
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
  SCHEMA_VERSIONS,
  assertAppPackage,
  hasDataAuditReadPolicy,
  sha256Digest,
  type AppArtifact,
  type AppPackage,
  type ConfigurationBundleV3,
  type PlatformCapabilityCode,
  type RequiredPlatformCapabilityContract,
} from 'openxiangda-contracts';

// AppPackage sealing lives in the compiler package so CLI and MCP cannot drift.
import {
  AppConfigValidationError,
  type OpenXiangdaAppConfig,
  validateAppConfig,
} from './config.js';
import { normalizeConfiguration } from './bundle.js';

export interface CompileAppPackageInput {
  config: OpenXiangdaAppConfig;
  version: string;
  createdAt?: string;
  source: AppPackage['source'];
  toolchainVersion: string;
  artifacts: AppArtifact[];
  manifests: AppPackage['manifests'];
  minimumPlatformVersion: string;
  metadata?: Record<string, unknown>;
}

export interface CompiledAppPackage {
  manifest: AppPackage;
  digest: string;
}

export const NATIVE_GOLDEN_CRUD_CAPABILITY = 'data.native-golden-crud';

export function requiredPlatformCapabilities(
  config: OpenXiangdaAppConfig
): RequiredPlatformCapabilityContract[] {
  return requiredPlatformCapabilitiesFromConfiguration(
    normalizeConfiguration(config)
  );
}

export function requiredPlatformCapabilitiesFromConfiguration(
  config: ConfigurationBundleV3
): RequiredPlatformCapabilityContract[] {
  const operations = config.backend.operations;
  const requiresDirectoryV2 =
    config.authz.roles.some(role =>
      role.capabilities.some(capability => capability.endsWith(':directory:read'))
    ) ||
    config.data.resources.some(resource =>
      resource.schema.fields.some(field =>
        ['user.single', 'user.multiple', 'department.single', 'department.multiple'].includes(
          field.type
        )
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
      subscription => subscription.platformAccess?.managedFileCopies
    );
  const usesNotification = operations.some(
    operation => operation.platformAccess?.notification
  ) || config.events.subscriptions.some(
    subscription => subscription.platformAccess?.notification
  );
  const standardProcessDefinitions = config.workflows.definitions.filter(
    declaration =>
      declaration.launch.mode === 'standalone' ||
      declaration.launch.mode === 'hidden-handoff'
  );
  const usesBusinessProcess =
    operations.some(operation => operation.platformAccess?.workflow) ||
    standardProcessDefinitions.length > 0;
  const namedInputSourceDefinitions = standardProcessDefinitions.filter(declaration => {
    const submission = declaration.launch.submission;
    if (!submission) return false;
    const resource = config.data.resources.find(item => item.code === declaration.definition.subject.resourceCode);
    return [submission.create, submission.existing].some(intent => intent &&
      Object.values(intent.inputs).some(binding => binding.source === 'field' &&
        resource?.schema.fields.some(field => field.code === binding.fieldCode &&
          field.type.startsWith('resource-ref.') && field.source)));
  });
  const dataUsage = { resources: config.data.resources };
  const authzUsage = {
    perspectives: config.perspectives,
    authz: config.authz,
  };
  const runtimeUsage = {
    schemaVersion: config.schemaVersion,
    appCode: config.appCode,
    frontend: {
      routes: config.frontend.routes || [],
      user: config.frontend.user,
      admin: config.frontend.admin,
      devicePolicy: config.frontend.devicePolicy,
    },
    backend: {
      // Bind runtime routing and declared platform dependencies, but never
      // hash descriptions, schema examples/defaults or Secret descriptors.
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
  const usages: Array<{ code: PlatformCapabilityCode; declaration: unknown }> = [
    ...(config.data.resources.some(hasDataAuditReadPolicy)
      ? [{ code: 'data.audit-read-access' as const, declaration: dataUsage }]
      : []),
    ...(config.workflows.definitions.some(item => item.definition.instanceCommands !== undefined)
      ? [{
          code: 'workflow.instance-cancellation-policy' as const,
          declaration: config.workflows.definitions.filter(item => item.definition.instanceCommands !== undefined),
        }]
      : []),
    ...(namedInputSourceDefinitions.length ? [{ code: 'workflow.named-input-sources' as const, declaration: namedInputSourceDefinitions }] : []),
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
    ...(config.data.resources.length
      ? ([
          { code: 'data-api-v2', declaration: dataUsage },
          { code: NATIVE_GOLDEN_CRUD_CAPABILITY, declaration: dataUsage },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(requiresDirectoryV2
      ? ([
          {
            code: 'directory-v2',
            declaration: {
              roles: config.authz.roles.map(role => ({
                code: role.code,
                capabilities: role.capabilities.filter(capability =>
                  capability.endsWith(':directory:read')
                ),
              })),
              resources: config.data.resources.map(resource => ({
                code: resource.code,
                fields: resource.schema.fields.filter(field =>
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
                  directory: operation.platformAccess!.directory,
                })),
            },
          },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(usesManagedFiles
      ? ([
          {
            code: 'data.managed-files',
            declaration: {
              operations: operations
                .filter(
                  operation =>
                    operation.platformAccess?.managedFiles ||
                    operation.platformAccess?.managedFileCopies
                )
                .map(operation => ({
                  code: operation.code,
                  ...(operation.platformAccess!.managedFiles
                    ? { managedFiles: operation.platformAccess!.managedFiles }
                    : {}),
                  ...(operation.platformAccess!.managedFileCopies
                    ? {
                        managedFileCopies:
                          operation.platformAccess!.managedFileCopies,
                      }
                    : {}),
                })),
              subscriptions: config.events.subscriptions
                .filter(
                  subscription => subscription.platformAccess?.managedFileCopies
                )
                .map(subscription => ({
                  code: subscription.code,
                  managedFileCopies:
                    subscription.platformAccess!.managedFileCopies,
                })),
            },
          },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(usesEvents
      ? ([
          { code: 'events-v2', declaration: config.events },
          { code: 'events.durable-receipts', declaration: config.events },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(config.workflows.activations.length
      ? ([
          { code: 'workflow-kernel-v2', declaration: config.workflows },
          {
            code: 'workflow.fresh-command-token',
            declaration: config.workflows,
          },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(usesBusinessProcess
      ? ([
          {
            code: 'business-process.durable-command',
            declaration: {
              operations: operations
                .filter(operation => operation.platformAccess?.workflow)
                .map(operation => ({
                  code: operation.code,
                  workflow: operation.platformAccess!.workflow,
                })),
              definitions: standardProcessDefinitions,
              activations: config.workflows.activations.filter(activation =>
                standardProcessDefinitions.some(
                  declaration =>
                    declaration.definition.code === activation.workflowCode
                )
              ),
            },
          },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(usesNotification
      ? ([
          {
            code: 'notification-hub-v2',
            declaration: {
              operations: operations
                .filter(operation => operation.platformAccess?.notification)
                .map(operation => ({
                  code: operation.code,
                  notification: operation.platformAccess!.notification,
                })),
              subscriptions: config.events.subscriptions
                .filter(subscription => subscription.platformAccess?.notification)
                .map(subscription => ({
                  code: subscription.code,
                  notification: subscription.platformAccess!.notification,
                })),
            },
          },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(config.frontend.authentication
      ? ([
          {
            code: 'authentication.application-login-surface',
            declaration: config.frontend.authentication,
          },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
    ...(config.frontend.publicAccess
      ? ([
          {
            code: 'public-access.anonymous-owner-records',
            declaration: config.frontend.publicAccess,
          },
        ] satisfies Array<{
          code: PlatformCapabilityCode;
          declaration: unknown;
        }>)
      : []),
  ];
  return usages
    .map(({ code, declaration }) => ({
      code,
      contractVersion: PLATFORM_CAPABILITY_CONTRACT_VERSIONS[code],
      usageDigest: `sha256:${sha256Digest(declaration)}` as const,
    }))
    .sort((left, right) =>
      left.code === right.code ? 0 : left.code < right.code ? -1 : 1
    );
}

export function compileAppPackage(
  input: CompileAppPackageInput
): CompiledAppPackage {
  const diagnostics = validateAppConfig(input.config);
  if (diagnostics.length > 0) throw new AppConfigValidationError(diagnostics);
  const manifest: AppPackage = {
    schemaVersion: SCHEMA_VERSIONS.appPackage,
    appCode: input.config.app.code,
    version: input.version,
    createdAt: input.createdAt || new Date().toISOString(),
    source: { ...input.source },
    toolchain: {
      version: input.toolchainVersion,
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    },
    artifacts: [...input.artifacts].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
      if (left.digest === right.digest) return 0;
      return left.digest < right.digest ? -1 : 1;
    }),
    manifests: { ...input.manifests },
    compatibility: {
      minimumPlatformVersion: input.minimumPlatformVersion,
      applicationContract: { ...CURRENT_APPLICATION_CONTRACT },
      requiredPlatformCapabilities: requiredPlatformCapabilitiesFromConfiguration(
        normalizeConfiguration(input.config)
      ),
    },
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
  };
  assertAppPackage(manifest);
  return { manifest, digest: sha256Digest(manifest) };
}
