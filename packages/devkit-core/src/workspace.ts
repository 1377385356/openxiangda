import { resolve } from 'node:path';
import {
  OPENXIANGDA_CONTRACT_VERSION,
  CLI_EVENT_SCHEMA_VERSION,
  CLI_RESULT_SCHEMA_VERSION,
  CLI_PROTOCOL_VERSION,
  WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
  SCHEMA_VERSIONS,
  type WorkspaceContext,
} from 'openxiangda-contracts';
import { DEVKIT_COMMANDS } from './command-registry.js';
import {
  AppConfigValidationError,
  type OpenXiangdaAppConfig,
  validateAppConfig,
} from './config.js';

export interface CreateWorkspaceContextOptions {
  root: string;
  toolchainVersion: string;
  nodeVersion: string;
  packageManager: string;
  repository?: string;
  revision?: string;
  dirty?: boolean;
  environments?: WorkspaceContext['environments'];
  changedDomains?: WorkspaceContext['changedDomains'];
}

export function createWorkspaceContext(
  config: OpenXiangdaAppConfig,
  options: CreateWorkspaceContextOptions
): WorkspaceContext {
  const diagnostics = validateAppConfig(config);
  if (diagnostics.length > 0) throw new AppConfigValidationError(diagnostics);
  const root = resolve(options.root);
  return {
    schemaVersion: SCHEMA_VERSIONS.workspaceContext,
    workspace: {
      appCode: config.app.code,
      name: config.app.name,
      root,
      ...(options.repository ? { repository: options.repository } : {}),
      ...(options.revision ? { revision: options.revision } : {}),
      ...(options.dirty !== undefined ? { dirty: options.dirty } : {}),
    },
    roots: {
      frontend: resolve(root, config.frontend.root),
      backend: resolve(root, config.backend.root),
      platform: resolve(root, config.platform.root),
    },
    toolchain: {
      packageName: "openxiangda-devkit-core",
      version: options.toolchainVersion,
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
      nodeVersion: options.nodeVersion,
      packageManager: options.packageManager,
      cli: {
        schemaVersion: CLI_PROTOCOL_VERSION,
        cliResultSchemaVersion: CLI_RESULT_SCHEMA_VERSION,
        cliEvents: {
          schemaVersion: CLI_EVENT_SCHEMA_VERSION,
          commands: DEVKIT_COMMANDS.filter(
            command =>
              'jsonEvents' in command && command.jsonEvents
          ).map(command => ({
            id: command.id,
            operation: command.operation,
            risk: command.risk,
          })),
        },
        templates: {
          schemaVersion: WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
          digestAlgorithm: 'sha256',
          supportedReferences: ['builtin:application', 'file'],
        },
      },
    },
    environments: options.environments || [],
    changedDomains: options.changedDomains || [],
  };
}
