import { compileRequiredPlatformCapabilitiesV3 } from 'openxiangda-contracts/native-compiler';
import {
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  SCHEMA_VERSIONS,
  assertAppPackage,
  sha256Digest,
  type AppArtifact,
  type AppPackage,
  type ConfigurationBundleV3,
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
  return compileRequiredPlatformCapabilitiesV3(config);
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
