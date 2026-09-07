import type { DeploymentStrategy } from 'openxiangda-contracts';
import {
  canonicalJson,
  CONFIGURATION_COMPATIBILITY_CAPABILITY,
  contractSchemas,
  OPENXIANGDA_CONTRACT_VERSION,
  sha256Digest,
  type ApplicationContractCompatibility,
  type ConfigurationValidationResult,
  type DeploymentEnvironment,
  type DeploymentRun,
  type PlatformCapabilities,
  type RequiredPlatformCapabilityContract,
  type RuntimeCapacityPreflight,
} from 'openxiangda-contracts';
import { createHash } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  ControlPlaneError,
  type CreateDeploymentInput,
  type UploadArtifactInput,
} from './control-plane-client.js';
import { type CompiledAppPackage } from './package-compiler.js';
import { operationStage, updateOperationStage } from './operation-progress.js';
import { NATIVE_CONFIGURATION_VALIDATOR_DIGEST } from 'openxiangda-contracts/native-compiler';
import { type ProductionPromotionPreflight } from 'openxiangda-contracts';

export interface DeploymentControlPlane {
  capabilities(): Promise<PlatformCapabilities>;
  artifactStatus?(appCode: string, digest: string): Promise<{ digest: string; kind: string; contentType: string; sizeBytes: number } | null>;
  uploadArtifact(
    input: UploadArtifactInput
  ): Promise<Record<string, unknown>>;
  createDeployment(input: CreateDeploymentInput): Promise<DeploymentRun>;
}

async function uploadOrReuse(client: DeploymentControlPlane, input: UploadArtifactInput, stage: string, label: string) {
  return operationStage(stage, label, async () => {
    const stored = await client.artifactStatus?.(input.appCode, input.digest);
    if (stored?.digest === input.digest && stored.kind === input.kind && stored.contentType === input.contentType && stored.sizeBytes === new Blob([input.content]).size) {
      updateOperationStage(stage, `${label}（复用已有内容）`, { reused: true, digest: input.digest, bytes: stored.sizeBytes });
      return stored;
    }
    return client.uploadArtifact(input);
  });
}

export interface SubmitAppPackageInput {
  deploymentStrategy?: DeploymentStrategy;
  client: DeploymentControlPlane;
  capabilities?: PlatformCapabilities;
  compiledPackage: CompiledAppPackage;
  artifactContent?: Record<string, BlobPart>;
  environmentId?: string;
  environmentKind?: DeploymentEnvironment;
  idempotencyKey: string;
  requestId?: string;
}

export async function submitAppPackage(
  input: SubmitAppPackageInput
): Promise<DeploymentRun> {
  const capabilities = input.capabilities || (await input.client.capabilities());
  assertApplicationContractCompatible(
    capabilities,
    input.compiledPackage.manifest.compatibility.applicationContract
  );
  await operationStage('artifacts-verify', '上传前校验制品完整性', () => verifySealedAppPackage(input.compiledPackage, input.artifactContent || {}));
  const required = input.compiledPackage.manifest.compatibility
    .requiredPlatformCapabilities;
  assertRequiredCapabilitiesAvailable(capabilities, required);

  const artifactContent = input.artifactContent || {};
  for (const artifact of input.compiledPackage.manifest.artifacts) {
    const content = artifactContent[artifact.digest];
    if (content === undefined) {
      throw new ControlPlaneError(
        400,
        'OPENXIANGDA_ARTIFACT_CONTENT_MISSING',
        `缺少制品内容: ${artifact.digest}`,
        { digest: artifact.digest, kind: artifact.kind }
      );
    }
    await uploadOrReuse(input.client, {
      appCode: input.compiledPackage.manifest.appCode,
      digest: artifact.digest,
      kind: artifact.kind,
      contentType: artifact.mediaType,
      content,
      metadata: {
        appVersion: input.compiledPackage.manifest.version,
        sourceCommit: input.compiledPackage.manifest.source.commit,
      },
    }, `upload-${artifact.kind}`, `上传${({ frontend: '前端', backend: '后端', config: '配置', contracts: '数据契约' } as Record<string, string>)[artifact.kind] || artifact.kind}制品`);
  }

  await uploadOrReuse(input.client, {
    appCode: input.compiledPackage.manifest.appCode,
    digest: input.compiledPackage.digest,
    kind: 'manifest',
    contentType: 'application/vnd.openxiangda.app-package.v3+json',
    content: canonicalJson(input.compiledPackage.manifest),
    metadata: {
      appVersion: input.compiledPackage.manifest.version,
      sourceCommit: input.compiledPackage.manifest.source.commit,
    },
  }, 'upload-manifest', '上传版本清单');

  return await operationStage('submit', '提交平台部署运行', () => input.client.createDeployment({
    appCode: input.compiledPackage.manifest.appCode,
    ...(input.environmentId ? { environmentId: input.environmentId } : {}),
    ...(input.environmentKind
      ? { environmentKind: input.environmentKind }
      : {}),
    ...(input.deploymentStrategy ? { deploymentStrategy: input.deploymentStrategy } : {}),
    packageDigest: input.compiledPackage.digest,
    package: input.compiledPackage.manifest,
    idempotencyKey: input.idempotencyKey,
    ...(input.requestId ? { requestId: input.requestId } : {}),
  }));
}

const validatePlatformCapabilities = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
}).compile(contractSchemas.platformCapabilities);

const validatePromotionPreflight = new Ajv2020({ allErrors: true, strict: false }).compile(contractSchemas.promotionPreflight);
const validateRuntimeCapacityPreflight = new Ajv2020({ allErrors: true, strict: false }).compile(contractSchemas.runtimeCapacityPreflight);
export function assertRuntimeCapacityPreflight(value: RuntimeCapacityPreflight, environmentId?: string, strategy: DeploymentStrategy = 'rolling') {
  if ((value.deploymentStrategy || 'rolling') !== strategy ||
    (strategy === 'maintenance-replace' && value.basis !== 'existing-run' && (!value.maintenance || value.basis !== 'new-candidate')) ||
    (strategy === 'rolling' && value.maintenance != null) || !validateRuntimeCapacityPreflight(value) || (environmentId && value.environmentId !== environmentId) ||
    !Number.isFinite(Date.parse(value.observedAt)) ||
    (value.capacity && (value.capacity.checked ? typeof value.sufficient !== 'boolean' : value.sufficient !== null)) ||
    (value.sufficient === false && !value.capacity?.shortages.length) ||
    (value.sufficient === true && value.capacity?.shortages.length)) {
    throw new ControlPlaneError(409, 'OPENXIANGDA_RUNTIME_CAPACITY_PREFLIGHT_RESULT_INVALID', '平台运行配额预检结果无效或不属于指定环境', { pointer: '/runtime-capacity-preflight' });
  }
}
export function assertProductionPromotionPreflight(value: ProductionPromotionPreflight, expected: {
  appCode: string; sourceDeploymentId: string; appVersionId: string; packageDigest: string;
}) {
  if (!validatePromotionPreflight(value) || value.validatorDigest !== NATIVE_CONFIGURATION_VALIDATOR_DIGEST ||
    Object.entries(expected).some(([key, expectedValue]) => value[key as keyof ProductionPromotionPreflight] !== expectedValue)) {
    throw new ControlPlaneError(409, 'PRODUCTION_PREFLIGHT_RESULT_INVALID', '生产预检结果无法绑定指定测试版本或当前共享校验规则', {
      pointer: '/promotion-preflight', expected, actual: value,
    });
  }
}

const validateConfigurationValidationResult = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
}).compile(contractSchemas.configurationValidationResult);

export function assertApplicationContractCompatible(
  capabilities: PlatformCapabilities,
  required: ApplicationContractCompatibility
): void {
  if (!validatePlatformCapabilities(capabilities)) {
    const paths = (validatePlatformCapabilities.errors || [])
      .slice(0, 20)
      .map(error => error.instancePath || '/')
      .filter((path, index, values) => values.indexOf(path) === index);
    throw new ControlPlaneError(
      409,
      'OPENXIANGDA_PLATFORM_CAPABILITIES_INVALID',
      '平台 capabilities 未提供有效的应用契约兼容信息',
      compatibilityDetails(capabilities, required, paths[0] || '/', {
        paths,
        remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda check',
      }),
      { remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda deploy' }
    );
  }
  const descriptor = capabilities.configurationCompatibility;
  if (descriptor.validatorDigest !== NATIVE_CONFIGURATION_VALIDATOR_DIGEST) {
    throw new ControlPlaneError(409, 'OPENXIANGDA_CONFIGURATION_VALIDATOR_MISMATCH',
      '本地与目标平台的完整校验规则版本不一致，尚未开始构建或上传',
      compatibilityDetails(capabilities, required, '/configurationCompatibility/validatorDigest', {
        expectedValidatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST,
        actualValidatorDigest: descriptor.validatorDigest,
      }), { remediation: '升级工具链与目标平台到配套发布版本后重试，保留当前源码与候选' });
  }
  if (
    descriptor.capability.code !== CONFIGURATION_COMPATIBILITY_CAPABILITY ||
    descriptor.capability.status !== 'available'
  ) {
    throw new ControlPlaneError(
      409,
      'OPENXIANGDA_CONFIGURATION_COMPATIBILITY_UNAVAILABLE',
      '目标平台未提供可用的配置兼容性预检能力',
      compatibilityDetails(
        capabilities,
        required,
        '/configurationCompatibility/capability'
      ),
      { remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda check' }
    );
  }
  const accepted = descriptor.supportedApplicationContracts;
  const matched = accepted.some(candidate =>
    applicationContractsEqual(candidate, required)
  );
  if (!matched) {
    throw new ControlPlaneError(
      409,
      'OPENXIANGDA_APPLICATION_CONTRACT_UNSUPPORTED',
      '平台不接受当前工具链生成的应用契约',
      compatibilityDetails(capabilities, required, '/', {
        remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda deploy',
      }),
      { remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda deploy' }
    );
  }
}

export function assertConfigurationValidationResult(
  capabilities: PlatformCapabilities,
  required: ApplicationContractCompatibility,
  result: ConfigurationValidationResult,
  source: { configurationDigest: string; contractDigest: string },
  requiredPlatformCapabilities: RequiredPlatformCapabilityContract[]
): void {
  const valid = validateConfigurationValidationResult(result);
  const sourceMatches =
    result?.source?.configurationDigest === source.configurationDigest &&
    result?.source?.contractDigest === source.contractDigest;
  const platformMatches =
    result?.platformVersion === capabilities.platformVersion &&
    result?.capability?.code ===
      capabilities.configurationCompatibility.capability.code &&
    result?.capability?.version ===
      capabilities.configurationCompatibility.capability.version;
  const contractMatches = applicationContractsEqual(result?.required, required);
  const capabilityClosureMatches =
    JSON.stringify(result?.requiredPlatformCapabilities) ===
    JSON.stringify(requiredPlatformCapabilities);
  if (
    !valid ||
    !sourceMatches ||
    !platformMatches ||
    !contractMatches ||
    !capabilityClosureMatches
  ) {
    const paths = (validateConfigurationValidationResult.errors || [])
      .slice(0, 20)
      .map(error => error.instancePath || '/')
      .filter((path, index, values) => values.indexOf(path) === index);
    throw new ControlPlaneError(
      409,
      'OPENXIANGDA_CONFIGURATION_VALIDATION_RESULT_INVALID',
      '目标平台返回的配置兼容性结果不能绑定当前平台、契约或制品',
      compatibilityDetails(capabilities, required, paths[0] || '/', {
        paths,
        expectedSource: source,
        actualSource: result?.source,
        expectedRequiredPlatformCapabilities: requiredPlatformCapabilities,
        actualRequiredPlatformCapabilities:
          result?.requiredPlatformCapabilities,
      }),
      { remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda check' }
    );
  }
}

export function compatibilityDetails(
  capabilities: Partial<PlatformCapabilities> | undefined,
  required: ApplicationContractCompatibility,
  pointer = '/',
  extra: Record<string, unknown> = {}
) {
  const descriptor = capabilities?.configurationCompatibility;
  return {
    pointer,
    clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
    clientSchemaVersions: {
      appPackage: required.appPackageSchemaVersion,
      configuration: required.configurationBundleSchemaVersion,
      contract: required.contractBundleSchemaVersion,
      compiler: required.compilerContractVersion,
    },
    platformVersion: String(capabilities?.platformVersion || 'unknown'),
    platformCapability: descriptor?.capability || {
      code: CONFIGURATION_COMPATIBILITY_CAPABILITY,
      version: 'unknown',
      status: 'unavailable',
    },
    required: { ...required },
    supported: (descriptor?.supportedApplicationContracts || [])
      .slice(0, 8)
      .map(candidate => ({ ...candidate })),
    ...extra,
  };
}

function applicationContractsEqual(
  left: ApplicationContractCompatibility | undefined,
  right: ApplicationContractCompatibility
) {
  if (!left) return false;
  return (
    left.appPackageSchemaVersion === right.appPackageSchemaVersion &&
    left.configurationBundleSchemaVersion ===
      right.configurationBundleSchemaVersion &&
    left.contractBundleSchemaVersion === right.contractBundleSchemaVersion &&
    left.compilerContractVersion === right.compilerContractVersion
  );
}

export function assertRequiredCapabilitiesAvailable(
  capabilities: PlatformCapabilities,
  required: RequiredPlatformCapabilityContract[]
): void {
  const unavailable = required.flatMap(requirement => {
    const capability = capabilities.features[requirement.code];
    if (
      capability?.status === 'available' &&
      capability.contractVersion === requirement.contractVersion
    ) {
      return [];
    }
    return [
      {
        code: requirement.code,
        requiredContractVersion: requirement.contractVersion,
        supportedContractVersion: capability?.contractVersion || null,
        status: capability?.status || 'missing',
      },
    ];
  });
  if (unavailable.length > 0) {
    throw new ControlPlaneError(
      409,
      'OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE',
      `平台尚未精确提供应用要求的能力合同: ${unavailable
        .map(item => item.code)
        .join(',')}`,
      {
        unavailable,
        remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda deploy',
      },
      { remediation: '核对项目工具与目标平台的配套发布版本和能力启用状态，升级不匹配的一端后重试 openxiangda deploy' }
    );
  }
}

/**
 * Final local trust boundary before any upload. The build manifest, component
 * links and the exact bytes sent to the platform must still describe one
 * immutable package; callers cannot replace a verified artifact afterwards.
 */
export async function verifySealedAppPackage(
  compiledPackage: CompiledAppPackage,
  artifactContent: Record<string, BlobPart>
) {
  if (sha256Digest(compiledPackage.manifest) !== compiledPackage.digest) {
    throw integrityError(
      'OPENXIANGDA_PACKAGE_DIGEST_MISMATCH',
      'AppPackage manifest 与 package digest 不一致'
    );
  }

  const byKind = new Map<string, (typeof compiledPackage.manifest.artifacts)[number]>();
  const contentByKind = new Map<string, Uint8Array>();
  for (const artifact of compiledPackage.manifest.artifacts) {
    if (byKind.has(artifact.kind)) {
      throw integrityError(
        'OPENXIANGDA_ARTIFACT_KIND_DUPLICATE',
        `AppPackage 包含重复制品类型: ${artifact.kind}`
      );
    }
    byKind.set(artifact.kind, artifact);
    const content = artifactContent[artifact.digest];
    if (content === undefined) {
      throw integrityError(
        'OPENXIANGDA_ARTIFACT_CONTENT_MISSING',
        `缺少制品内容: ${artifact.digest}`,
        { digest: artifact.digest, kind: artifact.kind }
      );
    }
    const bytes = await blobPartBytes(content);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== artifact.digest) {
      throw integrityError(
        'OPENXIANGDA_ARTIFACT_DIGEST_MISMATCH',
        `制品内容摘要不一致: ${artifact.kind}`,
        { expected: artifact.digest, actual: digest, kind: artifact.kind }
      );
    }
    if (artifact.size !== undefined && artifact.size !== bytes.byteLength) {
      throw integrityError(
        'OPENXIANGDA_ARTIFACT_SIZE_MISMATCH',
        `制品内容大小不一致: ${artifact.kind}`,
        { expected: artifact.size, actual: bytes.byteLength, kind: artifact.kind }
      );
    }
    contentByKind.set(artifact.kind, bytes);
  }

  const links = [
    ['frontend', compiledPackage.manifest.manifests.frontend],
    ['backend', compiledPackage.manifest.manifests.backend],
    ['config', compiledPackage.manifest.manifests.config],
    ['contracts', compiledPackage.manifest.manifests.dataContract],
  ] as const;
  for (const [kind, digest] of links) {
    const artifact = byKind.get(kind);
    if ((artifact && digest !== artifact.digest) || (!artifact && digest)) {
      throw integrityError(
        'OPENXIANGDA_COMPONENT_MANIFEST_MISMATCH',
        `组件 manifest 未指向同一 ${kind} 制品`,
        { kind, manifestDigest: digest || null, artifactDigest: artifact?.digest || null }
      );
    }
    if (artifact && !digest) {
      throw integrityError(
        'OPENXIANGDA_COMPONENT_MANIFEST_MISSING',
        `组件 manifest 缺少 ${kind} 摘要`,
        { kind, artifactDigest: artifact.digest }
      );
    }
  }

  verifyStructuredArtifacts(
    compiledPackage.manifest.appCode,
    compiledPackage.manifest.compatibility.applicationContract,
    byKind,
    contentByKind
  );
  return { packageDigest: compiledPackage.digest, artifacts: byKind.size };
}

function verifyStructuredArtifacts(
  appCode: string,
  applicationContract: ApplicationContractCompatibility,
  byKind: Map<string, { entrypoint?: string; metadata?: Record<string, unknown> }>,
  contentByKind: Map<string, Uint8Array>
) {
  const parse = (kind: string) => {
    const bytes = contentByKind.get(kind);
    if (!bytes) return undefined;
    try {
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, any>;
    } catch {
      throw integrityError(
        'OPENXIANGDA_ARTIFACT_JSON_INVALID',
        `${kind} 制品不是有效 JSON`,
        { kind }
      );
    }
  };
  const config = parse('config');
  const contracts = parse('contracts');
  if (
    config &&
    (config.schemaVersion !==
      applicationContract.configurationBundleSchemaVersion ||
      config.compilerContractVersion !==
        applicationContract.compilerContractVersion)
  ) {
    throw integrityError(
      'OPENXIANGDA_APPLICATION_CONTRACT_ARTIFACT_MISMATCH',
      'config 制品与 AppPackage 应用契约不一致'
    );
  }
  if (
    contracts &&
    (contracts.schemaVersion !== applicationContract.contractBundleSchemaVersion ||
      contracts.compilerContractVersion !==
        applicationContract.compilerContractVersion)
  ) {
    throw integrityError(
      'OPENXIANGDA_APPLICATION_CONTRACT_ARTIFACT_MISMATCH',
      'contracts 制品与 AppPackage 应用契约不一致'
    );
  }
  if (config && config.appCode !== appCode) {
    throw integrityError(
      'OPENXIANGDA_ARTIFACT_APP_CODE_MISMATCH',
      'config 制品 appCode 与 AppPackage 不一致'
    );
  }
  if (contracts && contracts.appCode !== appCode) {
    throw integrityError(
      'OPENXIANGDA_ARTIFACT_APP_CODE_MISMATCH',
      'contracts 制品 appCode 与 AppPackage 不一致'
    );
  }
  if (config && contracts) {
    const configured = (config.data?.resources || [])
      .map((item: any) => String(item?.code || ''))
      .filter(Boolean)
      .sort();
    const declared = (contracts.resources || [])
      .map((item: any) => String(item?.code || ''))
      .filter(Boolean)
      .sort();
    if (JSON.stringify(configured) !== JSON.stringify(declared)) {
      throw integrityError(
        'OPENXIANGDA_DATA_CONTRACT_RESOURCE_MISMATCH',
        'config 与 contracts 的数据资源清单不一致',
        { configured, declared }
      );
    }
  }

  const backend = parse('backend');
  const imageDigest = byKind.get('backend')?.metadata?.imageDigest;
  if (backend && imageDigest && backend.image !== imageDigest) {
    throw integrityError(
      'OPENXIANGDA_BACKEND_IMAGE_MANIFEST_MISMATCH',
      'backend 制品与 metadata 中的 OCI image 不一致'
    );
  }

  const frontend = parse('frontend');
  if (frontend) {
    const files = Array.isArray(frontend.files) ? frontend.files : [];
    const paths = new Set<string>();
    for (const file of files) {
      const path = String(file?.path || '');
      if (!path || paths.has(path) || path.startsWith('/') || path.includes('..')) {
        throw integrityError(
          'OPENXIANGDA_FRONTEND_BUNDLE_PATH_INVALID',
          `frontend 制品包含非法或重复路径: ${path || '<empty>'}`
        );
      }
      paths.add(path);
      const bytes = Buffer.from(String(file?.content || ''), 'base64');
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== file?.sha256) {
        throw integrityError(
          'OPENXIANGDA_FRONTEND_FILE_DIGEST_MISMATCH',
          `frontend 内部文件摘要不一致: ${path}`
        );
      }
    }
    const entrypoint = byKind.get('frontend')?.entrypoint;
    if (entrypoint && !paths.has(entrypoint)) {
      throw integrityError(
        'OPENXIANGDA_FRONTEND_ENTRYPOINT_MISSING',
        `frontend 制品缺少入口文件: ${entrypoint}`
      );
    }
  }
}

async function blobPartBytes(content: BlobPart): Promise<Uint8Array> {
  if (typeof content === 'string') return Buffer.from(content);
  if (content instanceof Blob) return new Uint8Array(await content.arrayBuffer());
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  throw integrityError(
    'OPENXIANGDA_ARTIFACT_CONTENT_UNSUPPORTED',
    '制品内容类型不受支持'
  );
}

function integrityError(
  code: string,
  message: string,
  data?: Record<string, unknown>
) {
  return new ControlPlaneError(400, code, message, data);
}
