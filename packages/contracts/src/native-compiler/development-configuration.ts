import { canonicalJson, sha256Digest } from "../canonical.js";
import type { ConfigurationBundleV3, ContractBundleV3 } from "../native.js";
import { OPENXIANGDA_CONTRACT_VERSION } from "../native-version.js";

export const DEVELOPMENT_CONFIGURATION_SCHEMA =
  "openxiangda.development-configuration/v1";
export const DEVELOPMENT_CONFIGURATION_MANIFEST_SCHEMA =
  "openxiangda.development-configuration-manifest/v1";
export const DEVELOPMENT_CONFIGURATION_FEATURE =
  "application.development-configuration";
export const DEVELOPMENT_CONFIGURATION_ENDPOINT =
  "/openxiangda-api/v2/applications/{appCode}/dev-sessions/configuration";

export interface DevelopmentConfigurationInput {
  schemaVersion: typeof DEVELOPMENT_CONFIGURATION_SCHEMA;
  environmentKey: "preproduction";
  expectedHeadRevision: number;
  configDigest: string;
  contractDigest: string;
  configuration: ConfigurationBundleV3;
  contract: ContractBundleV3;
  source: { repository: string | null; commit: string | null; dirty: boolean };
  toolchainVersion: string;
}

export interface DevelopmentConfigurationManifest {
  schemaVersion: typeof DEVELOPMENT_CONFIGURATION_MANIFEST_SCHEMA;
  appCode: string;
  version: string;
  configDigest: string;
  contractDigest: string;
  source: DevelopmentConfigurationInput["source"];
  toolchain: { version: string; contractVersion: string };
  artifacts: Array<{
    kind: "config" | "contracts";
    digest: string;
    mediaType: "application/json";
  }>;
}

export interface DevelopmentConfigurationResult {
  schemaVersion: typeof DEVELOPMENT_CONFIGURATION_SCHEMA;
  appCode: string;
  environmentKey: "preproduction";
  environmentId: string;
  appVersionId: string;
  configurationRunId: string;
  headRevision: number;
  configDigest: string;
  contractDigest: string;
  reused: boolean;
  runtimeArtifactsDeployed: false;
  backendEventsAvailable: false;
}

export class DevelopmentConfigurationContractError extends Error {
  readonly status = 400;
  readonly data: { pointer: string };
  constructor(readonly code: string, readonly pointer: string) {
    super(code);
    this.data = { pointer };
  }
}

function fail(pointer: string): never {
  throw new DevelopmentConfigurationContractError(
    "OPENXIANGDA_CONNECTED_DEV_CONFIGURATION_INVALID",
    pointer
  );
}

export function assertDevelopmentConfigurationManifest(
  value: unknown
): DevelopmentConfigurationManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("/packageManifest");
  const m = value as DevelopmentConfigurationManifest;
  const keys = [
    "schemaVersion",
    "appCode",
    "version",
    "configDigest",
    "contractDigest",
    "source",
    "toolchain",
    "artifacts",
  ];
  if (
    Object.keys(m).some((key) => !keys.includes(key)) ||
    m.schemaVersion !== DEVELOPMENT_CONFIGURATION_MANIFEST_SCHEMA ||
    typeof m.appCode !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(m.appCode) ||
    !/^[a-f0-9]{64}$/.test(m.configDigest) ||
    !/^[a-f0-9]{64}$/.test(m.contractDigest) ||
    m.version !== `development-${m.configDigest}`
  )
    fail("/packageManifest");
  if (
    !m.source ||
    typeof m.source !== "object" ||
    Array.isArray(m.source) ||
    Object.keys(m.source).some(
      (key) => !["repository", "commit", "dirty"].includes(key)
    ) ||
    ![null, "string"].includes(
      m.source.repository === null ? null : typeof m.source.repository
    ) ||
    (m.source.repository !== null &&
      (m.source.repository.length > 1024 ||
        /[\r\n\0]/.test(m.source.repository))) ||
    (m.source.commit !== null &&
      (typeof m.source.commit !== "string" ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(m.source.commit))) ||
    typeof m.source.dirty !== "boolean"
  )
    fail("/packageManifest/source");
  if (
    !m.toolchain ||
    Object.keys(m.toolchain).some(
      (key) => !["version", "contractVersion"].includes(key)
    ) ||
    typeof m.toolchain.version !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/.test(m.toolchain.version) ||
    m.toolchain.contractVersion !== OPENXIANGDA_CONTRACT_VERSION
  )
    fail("/packageManifest/toolchain");
  const artifacts = [
    { kind: "config", digest: m.configDigest, mediaType: "application/json" },
    {
      kind: "contracts",
      digest: m.contractDigest,
      mediaType: "application/json",
    },
  ];
  if (canonicalJson(m.artifacts) !== canonicalJson(artifacts))
    fail("/packageManifest/artifacts");
  return m;
}

export function createDevelopmentConfigurationManifest(
  appCode: string,
  input: DevelopmentConfigurationInput
): DevelopmentConfigurationManifest {
  return assertDevelopmentConfigurationManifest({
    schemaVersion: DEVELOPMENT_CONFIGURATION_MANIFEST_SCHEMA,
    appCode,
    version: `development-${input.configDigest}`,
    configDigest: input.configDigest,
    contractDigest: input.contractDigest,
    source: { ...input.source },
    toolchain: {
      version: input.toolchainVersion,
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    },
    artifacts: [
      {
        kind: "config",
        digest: input.configDigest,
        mediaType: "application/json",
      },
      {
        kind: "contracts",
        digest: input.contractDigest,
        mediaType: "application/json",
      },
    ],
  });
}

export function developmentConfigurationKey(
  manifest: DevelopmentConfigurationManifest,
  expectedHeadRevision: number
): string {
  if (!Number.isSafeInteger(expectedHeadRevision) || expectedHeadRevision < 1)
    fail("/expectedHeadRevision");
  return `development:${sha256Digest({ manifest, expectedHeadRevision })}`;
}

export function assertDevelopmentConfigurationResult(
  value: unknown,
  appCode: string,
  input: Pick<
    DevelopmentConfigurationInput,
    "configDigest" | "contractDigest" | "expectedHeadRevision"
  >
): DevelopmentConfigurationResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("/result");
  const r = value as DevelopmentConfigurationResult;
  const keys = [
    "schemaVersion",
    "appCode",
    "environmentKey",
    "environmentId",
    "appVersionId",
    "configurationRunId",
    "headRevision",
    "configDigest",
    "contractDigest",
    "reused",
    "runtimeArtifactsDeployed",
    "backendEventsAvailable",
  ];
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if (
    Object.keys(r).some((key) => !keys.includes(key)) ||
    r.schemaVersion !== DEVELOPMENT_CONFIGURATION_SCHEMA ||
    r.appCode !== appCode ||
    r.environmentKey !== "preproduction" ||
    r.configDigest !== input.configDigest ||
    r.contractDigest !== input.contractDigest ||
    !uuid.test(r.environmentId) ||
    !uuid.test(r.appVersionId) ||
    !uuid.test(r.configurationRunId) ||
    typeof r.reused !== "boolean" ||
    !Number.isSafeInteger(r.headRevision) ||
    r.headRevision < 1 ||
    (!r.reused && r.headRevision !== input.expectedHeadRevision + 1) ||
    r.runtimeArtifactsDeployed !== false ||
    r.backendEventsAvailable !== false
  )
    fail("/result");
  return r;
}
