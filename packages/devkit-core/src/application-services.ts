import type { DeploymentStrategy } from 'openxiangda-contracts';
import { cloneSourceGit, initializeSourceGit, installSourceCredential, pushSourceGit } from './source-git.js';
import { randomUUID } from "node:crypto";
import { publishedDeliverySource, assertDeliverySourceUnchanged, DeliverySourceError } from './delivery-source.js';
import { operationStage, skippedOperationStage, updateOperationStage } from './operation-progress.js';
import { deliveryInputDigest, reusableValidation, recordValidation, recordSealedCandidate, reusableSealedCandidate, type DeliveryCacheContext } from './delivery-cache.js';
import { developmentLifecycle, summarizeLifecycle, lifecycleAtCommit, verifyBusinessAcceptance } from './development-lifecycle.js';
import { runCommandProcess } from './command-process.js';
import { compileLocalConfiguration } from './configuration-preflight.js';
import { NativeConfigurationCompilerError, NATIVE_CONFIGURATION_VALIDATOR_DIGEST } from 'openxiangda-contracts/native-compiler';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  CONFIGURATION_COMPATIBILITY_CAPABILITY,
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  SCHEMA_VERSIONS,
  RUNTIME_CAPACITY_PREFLIGHT_SCHEMA,
  canonicalJson,
  sha256Digest,
  type AppArtifact,
  type DeploymentEnvironment,
  type DeploymentRun,
  type DevkitResult,
  type Diagnostic,
  type ConfigurationValidationResult,
  type WorkspaceIdentity,
} from "openxiangda-contracts";
import {
  compileApplicationSources,
  compileAppPackage,
  requiredPlatformCapabilities,
  backendRuntimeRequired,
  renderAdminNavigationSuggestion,
  sha256Bytes,
  validateAppConfig,
  type CompiledAppPackage,
} from "./compiler/index.js";
import {
  OpenXiangdaControlPlaneClient,
  ControlPlaneError,
  type CreateApplicationSecretInput,
  type CreateNativeRoleMembershipInput,
  type CreateOAuthClientInput,
  type ControlPlaneClientOptions,
  type NativeRelationshipGrantFilter,
  type RotateApplicationSecretInput,
  type UpdateApplicationSecretInput,
  type UpdateNativeRoleMembershipInput,
  type UpdateOAuthClientInput,
} from "./control-plane-client.js";
import {
  normalizePlatformBaseUrl,
  OpenXiangdaDeveloperSession,
} from "./session.js";
import {
  runConnectedDevelopment,
  selectConnectedDevelopmentEnvironment,
} from "./connected-development.js";
import {
  backendImageBuildTarget,
  publishBackendImage,
} from "./backend-image-build.js";
import { OPENXIANGDA_TOOLCHAIN_VERSION } from "./version.js";
import {
  git,
  loadWorkspace,
  type LoadedWorkspace,
} from "./workspace-loader.js";
import { validateApplicationUiContract } from './application-ui-contract.js';
import { initializeOptionalBackend } from './optional-backend.js';
import { buildPermissionReview } from './compiler/permission-review.js';
import { validateNestInjectionContract } from "./nest-injection-contract.js";
import {
  collectWorkspaceToolchainDependencies,
  defaultDevkitCoreToolchainCapsule,
  ToolchainCapsuleScanLimitError,
  toolchainCapsuleDiagnostic,
  type ToolchainCapsule,
} from "./toolchain-capsule.js";
import {
  advisoryAppSpecDiagnostics,
  closeAppSpecChange,
  createAppSpecCapability,
  createAppSpecChange,
  initializeAppSpec,
  inspectAppSpec,
  summarizeAppSpecContext,
  type AppSpecContractIndex,
  type AppSpecRisk,
} from "./app-spec.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GenerateOptions {
  root?: string;
  check?: boolean;
}

export interface BuildOptions {
  root?: string;
  backendImage?: string;
  skipWorkspaceBuild?: boolean;
  write?: boolean;
}

export interface BuiltApplication {
  package: CompiledAppPackage;
  sealedArtifact: SealedArtifactStatus;
  outputDirectory?: string;
}

export interface SealedArtifactStatus {
  schemaVersion: "openxiangda.sealed-artifact-status/v2";
  state: "check-did-not-seal" | "sealed";
  sealed: boolean;
  usableForDeploy: boolean;
  refreshedBy: "check" | "build";
  persisted: boolean;
  statusPath: ".openxiangda/build/seal-status.json";
  manifestPath: ".openxiangda/build/app-package.json";
  workspaceRevision: string | null;
  workspaceDirty: boolean;
  packageDigest: string | null;
  previousArtifact?: {
    packageDigest: string | null;
    sourceRevision: string | null;
    sourceDirty: boolean | null;
    matchesWorkspaceSource: boolean;
  };
  reasonCode?: "OPENXIANGDA_CHECK_DOES_NOT_SEAL";
  nextCommand: "openxiangda check" | "openxiangda deploy";
}

interface SealedApplication extends BuiltApplication {
  artifactContent: Record<string, string>;
}

export interface DeployOptions extends BuildOptions {
  deploymentStrategy?: DeploymentStrategy;
  environment: "preproduction";
  environmentId?: string;
  idempotencyKey?: string;
  requestId?: string;
}

interface PreproductionAcceptancePlan {
  schemaVersion: "openxiangda.preproduction-acceptance-plan/v2";
  environmentKey: "preproduction";
  redirectUri?: string;
  expiresInMinutes?: number;
  actors: Array<{
    key: string;
    name?: string;
    roleCodes: string[];
    departmentIds?: string[];
  }>;
}

export class OpenXiangdaApplicationServices {
  constructor(
    private readonly options: {
      toolchainVersion?: string;
      toolchainCapsule?: ToolchainCapsule;
      client?: OpenXiangdaControlPlaneClient;
      clientOptions?: ControlPlaneClientOptions;
    } = {}
  ) {}

  async workspaceContext(root?: string) {
    const workspace = await this.workspace(root);
    const lifecycle = developmentLifecycle(workspace.root, this.appSpecContractIndex(workspace, true));
    return this.ok(
      "workspace.context",
      workspace.context.workspace,
      { ...workspace.context, development: {
        ...summarizeLifecycle(lifecycle),
        application: lifecycle.context.application ? { path: lifecycle.context.application.path, content: lifecycle.context.application.content } : null,
        records: [
          ...lifecycle.context.index.capabilities, ...lifecycle.context.index.activeChanges,
          ...lifecycle.context.index.decisions, ...lifecycle.context.index.designs, ...lifecycle.context.index.history,
        ].map(({ id, title, status, path, kind }) => ({ id, title, status, path, kind })),
      } }
    );
  }

  async appSpecInit(root?: string) {
    const workspace = await this.workspace(root);
    const data = initializeAppSpec({
      root: workspace.root,
      appCode: workspace.config.app.code,
      appName: workspace.config.app.name,
    });
    return this.ok("spec.init", workspace.context.workspace, data, [
      {
        code: "spec.context",
        label: "读取当前 AppSpec 上下文",
        command: "openxiangda spec context --json",
      },
    ]);
  }

  async appSpecAddCapability(input: {
    root?: string;
    id: string;
    title: string;
    resources?: string[];
    actions?: string[];
  }) {
    const workspace = await this.workspace(input.root);
    const data = createAppSpecCapability({
      root: workspace.root,
      appCode: workspace.config.app.code,
      appName: workspace.config.app.name,
      id: input.id,
      title: input.title,
      ...(input.resources ? { resources: input.resources } : {}),
      ...(input.actions ? { actions: input.actions } : {}),
    });
    return this.ok("spec.add-capability", workspace.context.workspace, data);
  }

  async appSpecNew(input: {
    root?: string;
    id: string;
    title: string;
    risk?: AppSpecRisk;
    summary?: string;
    capabilities?: string[];
    requirements?: string[];
    resources?: string[];
    actions?: string[];
  }) {
    const workspace = await this.workspace(input.root);
    const data = createAppSpecChange({
      root: workspace.root,
      appCode: workspace.config.app.code,
      appName: workspace.config.app.name,
      id: input.id,
      title: input.title,
      ...(input.risk ? { risk: input.risk } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.capabilities ? { capabilities: input.capabilities } : {}),
      ...(input.requirements ? { requirements: input.requirements } : {}),
      ...(input.resources ? { resources: input.resources } : {}),
      ...(input.actions ? { actions: input.actions } : {}),
    });
    return this.ok("spec.new", workspace.context.workspace, data, [
      {
        code: "spec.context",
        label: "读取本次变更相关上下文",
        command: `openxiangda spec context ${input.id} --json`,
      },
    ]);
  }

  async appSpecContext(root?: string, selector?: string, historyOffset = 0) {
    const workspace = await this.workspace(root);
    const context = inspectAppSpec(
      workspace.root,
      this.appSpecContractIndex(workspace, true),
      selector,
      historyOffset
    );
    return this.result(
      "spec.context",
      workspace.context.workspace,
      { ...context, lifecycle: summarizeLifecycle(developmentLifecycle(workspace.root, this.appSpecContractIndex(workspace, true), undefined, selector)) },
      advisoryAppSpecDiagnostics(context.diagnostics)
    );
  }

  async appSpecCheck(root?: string) {
    const workspace = await this.workspace(root);
    const context = inspectAppSpec(
      workspace.root,
      this.appSpecContractIndex(workspace, true)
    );
    const lifecycle = developmentLifecycle(workspace.root, this.appSpecContractIndex(workspace, true));
    return this.result(
      "spec.check",
      workspace.context.workspace,
      { ...context, lifecycle: summarizeLifecycle(lifecycle) },
      lifecycle.diagnostics,
      [
        {
          code: "check",
          label: "继续运行应用检查",
          command: "openxiangda check",
        },
      ]
    );
  }

  async appSpecVerify(root: string | undefined, deploymentId: string, evidencePath?: string) {
    const workspace = await this.workspace(root);
    const run = await (await this.client(workspace.root)).deployment(workspace.config.app.code, deploymentId);
    const lifecycle = developmentLifecycle(workspace.root, this.appSpecContractIndex(workspace, true));
    const verification = verifyBusinessAcceptance(workspace.root, run, lifecycle, evidencePath);
    return this.result('spec.verify', workspace.context.workspace, verification, verification.diagnostics);
  }

  async appSpecClose(input: {
    root?: string;
    id: string;
    summary?: string;
    currentSpec?: "merged" | "not-applicable";
  }) {
    const workspace = await this.workspace(input.root);
    const outcome = closeAppSpecChange({
      root: workspace.root,
      id: input.id,
      contract: this.appSpecContractIndex(workspace, true),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.currentSpec ? { currentSpec: input.currentSpec } : {}),
    });
    const { diagnostics, ...data } = outcome;
    return this.result(
      "spec.close",
      workspace.context.workspace,
      data,
      diagnostics,
      data.converged
        ? []
        : [
            {
              code: "spec.context",
              label: "检查当前规格与变更差异",
              command: `openxiangda spec context ${input.id} --json`,
            },
          ]
    );
  }

  async accept(input: { root?: string; planPath: string }) {
    const workspace = await this.workspace(input.root);
    const diagnostics = this.toolchainDiagnostics(workspace);
    if (diagnostics.length > 0) {
      return this.result(
        "accept",
        workspace.context.workspace,
        undefined,
        diagnostics
      );
    }
    const planPath = resolve(workspace.root, String(input.planPath || ""));
    if (!existsSync(planPath)) {
      throw new Error(`OPENXIANGDA_ACCEPTANCE_PLAN_NOT_FOUND: ${planPath}`);
    }
    let plan: PreproductionAcceptancePlan;
    try {
      plan = JSON.parse(readFileSync(planPath, "utf8"));
    } catch {
      throw new Error(
        `OPENXIANGDA_ACCEPTANCE_PLAN_INVALID_JSON: ${planPath}`
      );
    }
    if (
      plan?.schemaVersion !==
        "openxiangda.preproduction-acceptance-plan/v2" ||
      plan.environmentKey !== "preproduction" ||
      !Array.isArray(plan.actors)
    ) {
      throw new Error(
        "OPENXIANGDA_ACCEPTANCE_PLAN_INVALID: 计划必须是 preproduction v2 身份矩阵"
      );
    }
    const client = await this.client(workspace.root);
    const prepared = await client.preparePreproductionAcceptanceIdentities(
      workspace.config.app.code,
      plan
    );
    return this.ok("accept", workspace.context.workspace, {
      manual: true,
      releaseGate: false,
      planPath,
      ...prepared,
    });
  }

  async contractDescribe(root?: string) {
    const workspace = await this.workspace(root);
    const sources = compileApplicationSources(
      workspace.config,
      this.toolchainVersion
    );
    const adminNavigationSuggestion = renderAdminNavigationSuggestion(
      workspace.config
    );
    return this.ok("contract.describe", workspace.context.workspace, {
      configDigest: sources.config.digest,
      contractDigest: sources.contracts.digest,
      aiCatalogDigest: sources.aiCatalog.digest,
      contract: sources.contracts.value,
      aiCatalog: sources.aiCatalog.value,
      permissionReview: buildPermissionReview(
        sources.config.value,
        sources.contracts.value
      ),
      adminNavigationAuthoring: {
        schemaVersion: "openxiangda.admin-navigation-authoring/v1",
        owner: "application",
        target: "frontend.admin.navigation",
        configured:
          sources.config.value.frontend.admin.navigation.length > 0,
        applyMode: "copy-once",
        automaticRuntimeDiscovery: false,
        suggestion: adminNavigationSuggestion,
      },
      counts: {
        backendSecrets: sources.config.value.backend.secrets.length,
        backendOperations: sources.config.value.backend.operations.length,
        frontendRoutes: sources.config.value.frontend.routes.length,
        anonymousPublicPolicies:
          sources.config.value.frontend.publicAccess?.policies.length || 0,
        dataResources: sources.config.value.data.resources.length,
        aiCapabilities: sources.aiCatalog.value.capabilities.length,
        eventSubscriptions: sources.config.value.events.subscriptions.length,
        timerSubscriptions: sources.config.value.events.timers.length,
        workflowDefinitions: sources.config.value.workflows.definitions.length,
        workflowBindings: sources.config.value.workflows.bindings.length,
        workflowProviders: sources.config.value.workflows.providers.length,
      },
    });
  }

  async contractContext(root?: string, input: { selector?: string; offset?: number; limit?: number } = {}) {
    const result = await this.contractDescribe(root);
    const data = result.data!;
    const groups = {
      resource: data.contract.resources,
      operation: data.contract.operations,
      workflow: data.contract.workflows,
      route: data.contract.routes,
      capability: data.aiCatalog.capabilities,
    };
    const entries = Object.entries(groups).flatMap(([kind, values]) =>
      (values as unknown as Array<Record<string, unknown>>).map(value => ({
        selector: `${kind}:${String(value.code || value.resourceCode || value.id)}`,
        kind, code: String(value.code || value.resourceCode || value.id),
        title: String(value.name || value.label || value.title || value.code || value.resourceCode || value.id),
        value,
      }))
    );
    const selector = input.selector || 'index';
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 30;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('CONTRACT_SELECTION_INVALID: offset 必须为非负整数，limit 必须在 1 到 100 之间');
    }
    let selection: unknown;
    if (selector === 'index') selection = {
      total: entries.length, offset, limit, nextOffset: offset + limit < entries.length ? offset + limit : null,
      sections: ['navigation', 'permissions', 'all'],
      entries: entries.slice(offset, offset + limit).map(({ value: _, ...entry }) => entry),
    };
    else if (selector === 'navigation') selection = { adminNavigationAuthoring: data.adminNavigationAuthoring };
    else if (selector === 'permissions') selection = { permissionReview: data.permissionReview };
    else if (selector === 'all') selection = data;
    else {
      const entry = entries.find(item => item.selector === selector);
      if (!entry) throw new Error(`CONTRACT_SELECTION_NOT_FOUND: 未知契约选择器 ${selector}，先读取 index`);
      selection = entry.value;
    }
    if (Buffer.byteLength(JSON.stringify(selection)) > 256 * 1024) throw new Error('CONTRACT_SELECTION_TOO_LARGE: 选择结果超过 256 KiB，请按模型或能力读取');
    return { ...result, data: { configDigest: data.configDigest, contractDigest: data.contractDigest, aiCatalogDigest: data.aiCatalogDigest, counts: data.counts, selector, selection } };
  }

  async platformCapabilities(root?: string) {
    const workspace = await this.workspace(root);
    const capabilities = await (
      await this.client(workspace.root)
    ).capabilities();
    return this.ok(
      "platform.capabilities",
      workspace.context.workspace,
      capabilities
    );
  }

  async administrationContext(root: string | undefined, environmentKey = "preproduction") {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const client = await this.client(workspace.root);
    return this.ok("admin.context", workspace.context.workspace,
      await client.applicationAdministrationContext(workspace.config.app.code, environment));
  }

  async workflowNodeConfigurations(root: string | undefined, workflowCode: string, environmentKey = "preproduction") {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    if (!workflowCode || workflowCode.length > 128) throw new Error("WORKFLOW_CODE_REQUIRED");
    const client = await this.client(workspace.root);
    return this.ok("admin.workflow", workspace.context.workspace,
      await client.workflowNodeConfigurations(workspace.config.app.code, workflowCode, environment));
  }

  async sourceStatus(root?: string) {
    const workspace = await this.workspace(root);
    return this.ok('source.status', workspace.context.workspace,
      await (await this.client(workspace.root)).sourceStatus(workspace.config.app.code));
  }

  async sourceFromUrl(input: { baseUrl: string; repository: string; directory?: string; branch?: string }) {
    const baseUrl = normalizePlatformBaseUrl(input.baseUrl);
    const session = await OpenXiangdaDeveloperSession.load();
    if (!session) throw new Error('OPENXIANGDA_AUTH_REQUIRED');
    session.assertPlatform(baseUrl);
    const client = new OpenXiangdaControlPlaneClient({ baseUrl, tokenProvider: session });
    const resolved = await client.resolveSourceRepository(input.repository);
    const identity = { appCode: resolved.appCode, name: resolved.name, root: resolve(input.directory || process.cwd()) };
    if (!input.directory) return this.ok('source.resolve', identity, { baseUrl, ...resolved });
    const credential = await client.repositoryCredential(resolved.repository.cloneUrl);
    const cloned = cloneSourceGit(input.directory, credential, input.branch);
    return this.ok('source.clone', identity, { baseUrl, appCode: resolved.appCode, ...cloned });
  }

  async setupSource(root?: string, input: { importOrigin?: boolean; initialCommit?: boolean } = {}) {
    const workspace = await this.workspace(root);
    const client = await this.client(workspace.root);
    const credential = await client.sourceCredential(workspace.config.app.code);
    initializeSourceGit(workspace.root, credential.repository, credential, input.importOrigin);
    installSourceCredential(workspace.root, credential);
    const source = pushSourceGit(workspace.root, credential.repository,
      input.initialCommit ? 'Initialize OpenXiangda application' : undefined, true);
    const completed = await client.completeSourceSetup(workspace.config.app.code, { branch: source.branch, commit: source.commit });
    return this.ok('source.setup', workspace.context.workspace, { repository: completed.repository, source });
  }

  async pushSource(root?: string, message?: string) {
    const workspace = await this.workspace(root);
    const client = await this.client(workspace.root);
    const status = await client.sourceStatus(workspace.config.app.code);
    if (!status.repository) throw new Error('APPLICATION_SOURCE_NOT_INITIALIZED: 先运行 openxiangda source setup');
    const source = pushSourceGit(workspace.root, status.repository, message);
    await client.verifySource(workspace.config.app.code, { ...source, dirty: false });
    return this.ok('source.push', workspace.context.workspace, source);
  }

  async provisionApplication(root?: string) {
    const workspace = await this.workspace(root);
    const capsuleDiagnostics = this.toolchainDiagnostics(workspace);
    if (capsuleDiagnostics.length > 0) {
      return this.result(
        "app.provision",
        workspace.context.workspace,
        undefined,
        capsuleDiagnostics
      );
    }
    const application = await (
      await this.client(workspace.root)
    ).provisionApplication({
      appCode: workspace.config.app.code,
      name: workspace.config.app.name,
    });
    return this.ok("app.provision", workspace.context.workspace, application, [
      { code: "check", label: "检查应用", command: "openxiangda check" },
    ]);
  }

  async oauthClients(root?: string) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).oauthClients(workspace.config.app.code);
    return this.ok("oauth.client.list", workspace.context.workspace, data);
  }

  async runtimeOAuthCredentialStatus(
    root: string | undefined,
    environmentKey: string
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).runtimeOAuthCredentialStatus(
      workspace.config.app.code,
      environment
    );
    return this.ok(
      "oauth.runtime.status",
      workspace.context.workspace,
      data
    );
  }

  async rotateRuntimeOAuthCredential(
    root: string | undefined,
    input: {
      environmentKey: string;
      gracePeriodSeconds?: number;
      idempotencyKey: string;
    }
  ) {
    const workspace = await this.workspace(root);
    const client = await this.client(workspace.root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const status = await client.runtimeOAuthCredentialStatus(
      workspace.config.app.code,
      environment
    );
    if (!status.configured || !status.client) {
      throw new Error("OAUTH2_RUNTIME_CLIENT_NOT_PROVISIONED");
    }
    const rotation = await client.stageRuntimeOAuthCredentialRotation(
      workspace.config.app.code,
      environment,
      {
        expectedCredentialVersion: status.client.credentialVersion,
        ...(input.gracePeriodSeconds === undefined
          ? {}
          : { gracePeriodSeconds: input.gracePeriodSeconds }),
        idempotencyKey: input.idempotencyKey,
      }
    );
    const head = await client.environmentHead(
      workspace.config.app.code,
      environment
    );
    if (!head.activeAppVersionId) {
      throw new Error("OAUTH2_RUNTIME_ROTATION_ACTIVE_VERSION_REQUIRED");
    }
    const deployment = await client.redeploy({
      appCode: workspace.config.app.code,
      appVersionId: head.activeAppVersionId,
      ...(head.environmentId ? { environmentId: head.environmentId } : {}),
      environmentKind: head.environmentKind,
      idempotencyKey: `oauth-runtime-rotation:${input.idempotencyKey}`,
      requestId: input.idempotencyKey,
    });
    return this.ok("oauth.runtime.rotate", workspace.context.workspace, {
      rotation,
      deployment,
      next: {
        command: `openxiangda status ${deployment.id}`,
        credentialActivatesDuringDeployment: true,
      },
    });
  }

  async createOAuthClient(
    root: string | undefined,
    input: CreateOAuthClientInput
  ) {
    const workspace = await this.workspace(root);
    const environmentKey = this.deploymentEnvironment(input.environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).createOAuthClient(workspace.config.app.code, {
      ...input,
      environmentKey,
    });
    return this.ok("oauth.client.create", workspace.context.workspace, data);
  }

  async updateOAuthClient(
    root: string | undefined,
    clientId: string,
    input: UpdateOAuthClientInput
  ) {
    const workspace = await this.workspace(root);
    const environmentKey = input.environmentKey
      ? this.deploymentEnvironment(input.environmentKey)
      : undefined;
    const data = await (
      await this.client(workspace.root)
    ).updateOAuthClient(workspace.config.app.code, clientId, {
      ...input,
      ...(environmentKey ? { environmentKey } : {}),
    });
    return this.ok("oauth.client.update", workspace.context.workspace, data);
  }

  async rotateOAuthClientSecret(
    root: string | undefined,
    clientId: string,
    gracePeriodSeconds = 600
  ) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).rotateOAuthClientSecret(
      workspace.config.app.code,
      clientId,
      gracePeriodSeconds
    );
    return this.ok("oauth.client.rotate", workspace.context.workspace, data);
  }

  async revokeOAuthClient(root: string | undefined, clientId: string) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).revokeOAuthClient(workspace.config.app.code, clientId);
    return this.ok("oauth.client.revoke", workspace.context.workspace, data);
  }

  async oauthAuditEvents(
    root: string | undefined,
    input: {
      environmentKey?: DeploymentEnvironment | string;
      clientId?: string;
      limit?: number;
    } = {}
  ) {
    const workspace = await this.workspace(root);
    const environmentKey = input.environmentKey
      ? this.deploymentEnvironment(input.environmentKey)
      : undefined;
    const data = await (
      await this.client(workspace.root)
    ).oauthAuditEvents(workspace.config.app.code, {
      ...input,
      ...(environmentKey ? { environmentKey } : {}),
    });
    return this.ok("oauth.audit.list", workspace.context.workspace, data);
  }

  async applicationSecrets(root: string | undefined, environmentKey: string) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).applicationSecrets(workspace.config.app.code, environment);
    return this.ok("secret.list", workspace.context.workspace, data);
  }

  async createApplicationSecret(
    root: string | undefined,
    environmentKey: string,
    input: CreateApplicationSecretInput
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).createApplicationSecret(workspace.config.app.code, environment, input);
    return this.ok("secret.create", workspace.context.workspace, data);
  }

  async updateApplicationSecret(
    root: string | undefined,
    environmentKey: string,
    name: string,
    input: UpdateApplicationSecretInput
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).updateApplicationSecret(
      workspace.config.app.code,
      environment,
      name,
      input
    );
    return this.ok("secret.update", workspace.context.workspace, data);
  }

  async rotateApplicationSecret(
    root: string | undefined,
    environmentKey: string,
    name: string,
    input: RotateApplicationSecretInput
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).rotateApplicationSecret(
      workspace.config.app.code,
      environment,
      name,
      input
    );
    return this.ok("secret.rotate", workspace.context.workspace, data);
  }

  async deleteApplicationSecret(
    root: string | undefined,
    environmentKey: string,
    name: string,
    input: { expectedRevision: number; reason?: string }
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).deleteApplicationSecret(
      workspace.config.app.code,
      environment,
      name,
      input
    );
    return this.ok("secret.delete", workspace.context.workspace, data);
  }

  async applicationSecretAuditEvents(
    root: string | undefined,
    environmentKey: string,
    name: string,
    limit = 100
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).applicationSecretAuditEvents(
      workspace.config.app.code,
      environment,
      name,
      limit
    );
    return this.ok("secret.audit.list", workspace.context.workspace, data);
  }

  async nativeRoleMemberships(
    root: string | undefined,
    environmentKey: string,
    input: {
      status?: "active" | "revoked" | "expired";
      userId?: string;
      roleCode?: string;
      keyword?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.nativeRoleMemberships(
      workspace.config.app.code,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.membership.list", workspace.context.workspace, data);
  }

  async createNativeRoleMembership(
    root: string | undefined,
    input: CreateNativeRoleMembershipInput
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.createNativeRoleMembership(
      workspace.config.app.code,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.membership.create", workspace.context.workspace, data);
  }

  async updateNativeRoleMembership(
    root: string | undefined,
    membershipId: string,
    input: UpdateNativeRoleMembershipInput
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.updateNativeRoleMembership(
      workspace.config.app.code,
      membershipId,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.membership.update", workspace.context.workspace, data);
  }

  async revokeNativeRoleMembership(
    root: string | undefined,
    membershipId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      expectedRevision: number;
      reason: string;
    }
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.revokeNativeRoleMembership(
      workspace.config.app.code,
      membershipId,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.membership.revoke", workspace.context.workspace, data);
  }

  async nativeSuperAdmins(
    root: string | undefined,
    environmentKey: string,
    input: {
      status?: "active" | "revoked";
      userId?: string;
      keyword?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.nativeSuperAdmins(
      workspace.config.app.code,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.super-admin.list", workspace.context.workspace, data);
  }

  async grantNativeSuperAdmin(
    root: string | undefined,
    environmentKey: string,
    input: { operationId: string; userId: string }
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.grantNativeSuperAdmin(
      workspace.config.app.code,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.super-admin.grant", workspace.context.workspace, data);
  }

  async revokeNativeSuperAdmin(
    root: string | undefined,
    environmentKey: string,
    grantId: string,
    input: { operationId: string; expectedRevision: number }
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.revokeNativeSuperAdmin(
      workspace.config.app.code,
      grantId,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.super-admin.revoke", workspace.context.workspace, data);
  }

  async nativeRelationshipGrants(
    root: string | undefined,
    environmentKey: string,
    input: Omit<NativeRelationshipGrantFilter, "environmentKey"> = {}
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.nativeRelationshipGrants(
      workspace.config.app.code,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.relationship.list", workspace.context.workspace, data);
  }

  async createNativeRelationshipGrant(
    root: string | undefined,
    input: Parameters<
      OpenXiangdaControlPlaneClient["createNativeRelationshipGrant"]
    >[1]
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.createNativeRelationshipGrant(
      workspace.config.app.code,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.relationship.create", workspace.context.workspace, data);
  }

  async updateNativeRelationshipGrant(
    root: string | undefined,
    grantId: string,
    input: Parameters<
      OpenXiangdaControlPlaneClient["updateNativeRelationshipGrant"]
    >[2]
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.updateNativeRelationshipGrant(
      workspace.config.app.code,
      grantId,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.relationship.update", workspace.context.workspace, data);
  }

  async revokeNativeRelationshipGrant(
    root: string | undefined,
    grantId: string,
    input: Parameters<
      OpenXiangdaControlPlaneClient["revokeNativeRelationshipGrant"]
    >[2]
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const client = await this.client(workspace.root);
    const data = await client.revokeNativeRelationshipGrant(
      workspace.config.app.code,
      grantId,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.relationship.revoke", workspace.context.workspace, data);
  }

  async nativeAuthorizationProjectionHealth(
    root: string | undefined,
    environmentKey: string
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).nativeAuthorizationProjectionHealth(
      workspace.config.app.code,
      environment
    );
    return this.ok("authz.projection.health", workspace.context.workspace, data);
  }

  async rebuildNativeAuthorizationProjections(
    root: string | undefined,
    input: { environmentKey: DeploymentEnvironment; operationId: string }
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).rebuildNativeAuthorizationProjections(workspace.config.app.code, {
      ...input,
      environmentKey: environment,
    });
    return this.ok("authz.projection.rebuild", workspace.context.workspace, data);
  }

  async recoverNativeAuthorizationProjection(
    root: string | undefined,
    jobId: string,
    input: { environmentKey: DeploymentEnvironment; operationId: string }
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(input.environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).recoverNativeAuthorizationProjection(
      workspace.config.app.code,
      jobId,
      { ...input, environmentKey: environment }
    );
    return this.ok("authz.projection.recover", workspace.context.workspace, data);
  }

  async eventSubscriptions(root?: string) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).eventSubscriptions(workspace.config.app.code);
    return this.ok("event.subscription.list", workspace.context.workspace, data);
  }

  async setEventSubscriptionStatus(
    root: string | undefined,
    subscriptionId: string,
    input: { expectedRevision: number; status: "active" | "paused" }
  ) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).setEventSubscriptionStatus(
      workspace.config.app.code,
      subscriptionId,
      input
    );
    return this.ok("event.subscription.status", workspace.context.workspace, data);
  }

  async eventDeliveries(root: string | undefined, limit = 100) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).eventDeliveries(workspace.config.app.code, limit);
    return this.ok("event.delivery.list", workspace.context.workspace, data);
  }

  async replayEventDelivery(
    root: string | undefined,
    deliveryId: string,
    idempotencyKey?: string
  ) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).replayEventDelivery(
      workspace.config.app.code,
      deliveryId,
      idempotencyKey
    );
    return this.ok("event.delivery.replay", workspace.context.workspace, data);
  }

  async timerSubscriptions(root?: string) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).timerSubscriptions(workspace.config.app.code);
    return this.ok("event.timer.list", workspace.context.workspace, data);
  }

  async setTimerSubscriptionStatus(
    root: string | undefined,
    timerId: string,
    input: { expectedRevision: number; status: "active" | "paused" }
  ) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).setTimerSubscriptionStatus(workspace.config.app.code, timerId, input);
    return this.ok("event.timer.status", workspace.context.workspace, data);
  }

  async workflowAssigneeProviders(
    root: string | undefined,
    environmentKey: string
  ) {
    const workspace = await this.workspace(root);
    const environment = this.deploymentEnvironment(environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).workflowAssigneeProviders(workspace.config.app.code, environment);
    return this.ok("workflow.provider.list", workspace.context.workspace, data);
  }

  async rotateWorkflowAssigneeProviderSecret(
    root: string | undefined,
    providerCode: string,
    input: {
      environmentKey: string;
      expectedRevision: number;
      idempotencyKey: string;
    }
  ) {
    const workspace = await this.workspace(root);
    const environmentKey = this.deploymentEnvironment(input.environmentKey);
    const data = await (
      await this.client(workspace.root)
    ).rotateWorkflowAssigneeProviderSecret(
      workspace.config.app.code,
      providerCode,
      { ...input, environmentKey }
    );
    return this.ok("workflow.provider.rotate", workspace.context.workspace, data);
  }

  async linkApplication(
    root: string | undefined,
    input: {
      baseUrl: string;
      environments?: Array<{
        id?: string;
        name: string;
        kind: DeploymentEnvironment;
      }>;
    }
  ) {
    const workspace = await this.workspace(root);
    const path = join(workspace.root, ".openxiangda", "link.json");
    const environments = (input.environments || []).map((environment) => ({
      ...environment,
      kind: this.deploymentEnvironment(environment.kind),
    }));
    mkdirSync(dirname(path), { recursive: true });
    const value = {
      schemaVersion: 2,
      appCode: workspace.config.app.code,
      baseUrl: normalizePlatformBaseUrl(input.baseUrl),
      environments,
    };
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return this.ok("app.link", workspace.context.workspace, { path, ...value });
  }

  async generate(input: GenerateOptions = {}) {
    const workspace = await this.workspace(input.root);
    const capsuleDiagnostics = this.toolchainDiagnostics(workspace);
    if (capsuleDiagnostics.length > 0) {
      return this.result(
        "generate",
        workspace.context.workspace,
        undefined,
        capsuleDiagnostics
      );
    }
    const sources = compileApplicationSources(
      workspace.config,
      this.toolchainVersion
    );
    const output = join(workspace.root, "packages/contracts/src/generated.ts");
    const current = existsSync(output) ? readFileSync(output, "utf8") : "";
    const changed = current !== sources.contracts.typescript;
    const diagnostics: Diagnostic[] = [];
    if (input.check && changed) {
      diagnostics.push(
        this.diagnostic(
          "GENERATED_CONTRACTS_OUTDATED",
          "生成契约与应用声明不一致",
          relative(workspace.root, output),
          "运行 openxiangda check 并提交生成结果"
        )
      );
    } else if (changed) {
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, sources.contracts.typescript, "utf8");
    }
    return this.result(
      "generate",
      workspace.context.workspace,
      {
        output,
        changed,
        contractDigest: sources.contracts.digest,
        aiCatalogDigest: sources.aiCatalog.digest,
      },
      diagnostics,
      changed && input.check
        ? [
            {
              code: "generate",
              label: "更新生成契约",
              command: "openxiangda check",
            },
          ]
        : []
    );
  }

  async check(
    root?: string,
    environmentKey?: DeploymentEnvironment
  ) {
    const workspace = await this.workspace(root);
    const appSpec = inspectAppSpec(
      workspace.root,
      this.appSpecContractIndex(workspace, false)
    );
    const lifecycle = developmentLifecycle(workspace.root, this.appSpecContractIndex(workspace, false));
    const diagnostics = [
      ...validateAppConfig(workspace.config),
      ...this.versionTrainDiagnostics(workspace),
      ...validateNestInjectionContract(workspace.root),
      ...validateApplicationUiContract(workspace.root, workspace.config.frontend.root),
      ...advisoryAppSpecDiagnostics(appSpec.diagnostics),
      ...advisoryAppSpecDiagnostics(lifecycle.diagnostics),
    ];
    if (diagnostics.some(item => item.severity === "error")) {
      const sealedArtifact = this.writeCheckSealedArtifactStatus(
        workspace,
        false
      );
      return this.result(
        "check",
        workspace.context.workspace,
        {
          generated: undefined,
          compatibility: null,
          stages: [],
          sealedArtifact,
          appSpec: { ...summarizeAppSpecContext(appSpec), lifecycle: summarizeLifecycle(lifecycle) },
        },
        diagnostics
      );
    }
    let compatibility: ConfigurationValidationResult | null = null;
    try {
      const local = await operationStage('local-configuration', '本地完整配置校验', async () => compileLocalConfiguration(workspace.config, this.toolchainVersion));
      if (environmentKey) {
        compatibility = await operationStage('target-preflight', '目标平台只读预检', () => this.validateTargetConfigurationCompatibility(workspace, environmentKey, local));
      }
    } catch (error) {
      diagnostics.push(this.configurationCompatibilityDiagnostic(error));
      const sealedArtifact = this.writeCheckSealedArtifactStatus(
        workspace,
        false
      );
      return this.result(
        "check",
        workspace.context.workspace,
        {
          generated: undefined,
          compatibility: null,
          stages: [],
          sealedArtifact,
          appSpec: { ...summarizeAppSpecContext(appSpec), lifecycle: summarizeLifecycle(lifecycle) },
        },
        diagnostics
      );
    }
    const generated = await operationStage('generate', '生成应用契约', () => this.generate({ root: workspace.root }));
    diagnostics.push(...generated.diagnostics);
    if (!generated.ok) {
      const sealedArtifact = this.writeCheckSealedArtifactStatus(
        workspace,
        false
      );
      return this.result(
        "check",
        workspace.context.workspace,
        {
          generated: generated.data,
          compatibility: null,
          stages: [],
          sealedArtifact,
          appSpec: { ...summarizeAppSpecContext(appSpec), lifecycle: summarizeLifecycle(lifecycle) },
        },
        diagnostics,
        generated.nextActions
      );
    }
    const backendDiagnostics = this.initializeBackend(workspace);
    if (backendDiagnostics.length) {
      return this.result("check", workspace.context.workspace, undefined, backendDiagnostics);
    }
    const stages: Array<{
      name: string; state: 'passed' | 'failed' | 'skipped';
      ok: boolean; exitCode: number | null; output: string;
      reused?: boolean;
    }> = [];
    const cache = this.deliveryCacheContext(workspace);
    const inputDigest = deliveryInputDigest(cache);
    const reusable = reusableValidation(cache, inputDigest);
    for (const name of ["check", "test", "build"]) {
      if (reusable) {
        await operationStage(name, `${this.packageScriptLabel(name)}（复用已验证结果）`, async () => {
          updateOperationStage(name, `${this.packageScriptLabel(name)}（复用已验证结果）`, { reused: true, inputDigest, outputDigest: reusable.outputDigest });
        });
        stages.push({ name, state: 'passed', ok: true, exitCode: 0, output: '输入与构建输出摘要未变，复用已通过的本地检查', reused: true });
        continue;
      }
      if (stages.some(stage => stage.state === 'failed')) {
        stages.push({ name, state: 'skipped', ok: false, exitCode: null, output: '前置阶段失败，未执行' });
        skippedOperationStage(name, this.packageScriptLabel(name));
        continue;
      }
      const result = await this.runPackageScript(workspace.root, name);
      stages.push({ name, ...result, state: result.ok ? 'passed' : 'failed' });
    }
    for (const stage of stages.filter(item => item.state === 'failed')) {
      const code = `WORKSPACE_${stage.name.toUpperCase()}_FAILED`;
      diagnostics.push(
        this.diagnostic(
          code,
          `工作区 ${stage.name} 脚本失败`,
          `package.json#scripts.${stage.name}`,
          "修复失败后重新运行 openxiangda check",
          { output: stage.output }
        )
      );
    }
    if (!reusable && stages.every(stage => stage.state === 'passed')) {
      try { recordValidation(cache, inputDigest); }
      catch (error) {
        diagnostics.push(this.diagnostic('OPENXIANGDA_VALIDATION_INPUT_CHANGED', (error as Error).message, 'workspace', '等待源码修改结束后重新运行 openxiangda check'));
      }
    }
    const passed = !diagnostics.some(item => item.severity === "error");
    const sealedArtifact = this.writeCheckSealedArtifactStatus(
      workspace,
      passed
    );
    return this.result(
      "check",
      workspace.context.workspace,
      {
        generated: generated.data,
        compatibility,
        stages,
        sealedArtifact,
        appSpec: { ...summarizeAppSpecContext(appSpec), lifecycle: summarizeLifecycle(lifecycle) },
      },
      diagnostics,
      passed
        ? [
            {
              code: "deploy",
              label: "密封并部署到预发",
              command: "openxiangda deploy",
            },
          ]
        : []
    );
  }

  async test(root?: string) {
    const workspace = await this.workspace(root);
    const diagnostics = this.toolchainDiagnostics(workspace);
    if (diagnostics.length > 0) {
      return this.result("test", workspace.context.workspace, undefined, diagnostics);
    }
    const command = await this.runPackageScript(workspace.root, "test");
    const commandDiagnostics = command.ok
      ? []
      : [
          this.diagnostic(
            "WORKSPACE_TEST_FAILED",
            "工作区测试失败",
            "package.json#scripts.test",
            "修复失败测试后重试",
            { output: command.output }
          ),
        ];
    return this.result(
      "test",
      workspace.context.workspace,
      command,
      commandDiagnostics
    );
  }

  async build(
    input: BuildOptions = {}
  ): Promise<DevkitResult<BuiltApplication>> {
    const sealed = await this.buildSealed(input);
    if (!sealed.data) return sealed;
    return {
      ...sealed,
      data: {
        package: sealed.data.package,
        sealedArtifact: sealed.data.sealedArtifact,
        ...(sealed.data.outputDirectory
          ? { outputDirectory: sealed.data.outputDirectory }
          : {}),
      },
    };
  }

  async buildPreview(root?: string) {
    const checked = await this.check(root);
    return {
      ...checked,
      operation: "build.preview",
      data: {
        sealed: false,
        packageDigest: null,
        check: checked.data,
      },
    };
  }

  private async buildSealed(
    input: BuildOptions = {}
  ): Promise<DevkitResult<SealedApplication>> {
    const workspace = await this.workspace(input.root);
    const diagnostics = this.toolchainDiagnostics(workspace);
    if (diagnostics.length > 0) {
      return this.result<SealedApplication>(
        "build",
        workspace.context.workspace,
        undefined,
        diagnostics
      );
    }
    const generated = await this.generate({ root: workspace.root });
    if (!generated.ok) {
      return this.result<SealedApplication>(
        "build",
        workspace.context.workspace,
        undefined,
        generated.diagnostics,
        generated.nextActions
      );
    }
    if (!input.skipWorkspaceBuild) {
      const backendDiagnostics = this.initializeBackend(workspace);
      if (backendDiagnostics.length) {
        return this.result<SealedApplication>("build", workspace.context.workspace, undefined, backendDiagnostics);
      }
      const command = await this.runPackageScript(workspace.root, "build");
      if (!command.ok) {
        diagnostics.push(
          this.diagnostic(
            "WORKSPACE_BUILD_FAILED",
            "前后端生产构建失败",
            "package.json#scripts.build",
            "修复构建错误后重试",
            { output: command.output }
          )
        );
        return this.result<SealedApplication>(
          "build",
          workspace.context.workspace,
          undefined,
          diagnostics
        );
      }
    }
    const hasBackend = backendRuntimeRequired(workspace.config);
    const backendImage = String(input.backendImage || "").trim();
    if (hasBackend && !backendImage) {
      diagnostics.push(
        this.diagnostic(
          "BACKEND_IMAGE_REQUIRED",
          "当前应用包含 NestJS 后端，密封 AppPackage 时必须提供不可变 OCI image",
          "backend.image",
          "运行 openxiangda deploy 由工具自动构建并推送官方后端镜像"
        )
      );
      return this.result<SealedApplication>(
        "build",
        workspace.context.workspace,
        undefined,
        diagnostics
      );
    }
    if (hasBackend && !/@sha256:[a-f0-9]{64}$/i.test(backendImage)) {
      diagnostics.push(
        this.diagnostic(
          "BACKEND_IMAGE_NOT_IMMUTABLE",
          "后端镜像必须使用不可变 sha256 digest，不能使用可变 tag",
          "backend.image",
          "运行 openxiangda deploy 重新构建并取得不可变镜像摘要"
        )
      );
      return this.result<SealedApplication>(
        "build",
        workspace.context.workspace,
        undefined,
        diagnostics
      );
    }
    const sources = compileApplicationSources(
      workspace.config,
      this.toolchainVersion
    );
    const frontendContent = this.directoryBundle(
      join(workspace.root, workspace.config.frontend.root, "dist")
    );
    const frontendDigest = sha256Bytes(frontendContent);
    const backendContent = hasBackend
      ? canonicalJson({ image: backendImage })
      : undefined;
    const backendDigest = backendContent
      ? sha256Bytes(backendContent)
      : undefined;
    const artifacts: AppArtifact[] = [
      {
        kind: "frontend",
        digest: frontendDigest,
        mediaType: "application/vnd.openxiangda.frontend-bundle.v2+json",
        size: Buffer.byteLength(frontendContent),
        entrypoint: "index.html",
      },
      ...(backendDigest && backendContent
        ? [
            {
              kind: "backend" as const,
              digest: backendDigest,
              mediaType: "application/vnd.oci.image.manifest.v1+json",
              size: Buffer.byteLength(backendContent),
              metadata: {
                imageDigest: backendImage,
              },
            },
          ]
        : []),
      sources.config.artifact,
      sources.contracts.artifact,
    ];
    const revision = workspace.context.workspace.revision || "0".repeat(40);
    const packageVersion = String(workspace.packageJson.version || "0.0.0");
    const compiled = compileAppPackage({
      config: workspace.config,
      version: `${packageVersion}-${revision.slice(0, 12)}`,
      createdAt:
        git(workspace.root, ["show", "-s", "--format=%cI", "HEAD"]) ||
        new Date(0).toISOString(),
      source: {
        repository:
          workspace.context.workspace.repository || `local:${workspace.root}`,
        commit: revision,
        dirty: workspace.context.workspace.dirty === true,
      },
      toolchainVersion: this.toolchainVersion,
      artifacts,
      manifests: {
        frontend: frontendDigest,
        ...(backendDigest ? { backend: backendDigest } : {}),
        config: sources.config.digest,
        dataContract: sources.contracts.digest,
      },
      minimumPlatformVersion: "2.0.0-alpha.5",
      metadata: {
        backend: hasBackend
          ? {
              present: true,
              isolation: workspace.config.backend.isolation || "shared",
              resourceProfile:
                workspace.config.backend.resourceProfile || "light",
            }
          : { present: false },
        aiCatalogDigest: sources.aiCatalog.digest,
        aiCatalog: sources.aiCatalog.value,
      },
    });
    const artifactContent = {
      [frontendDigest]: frontendContent,
      [sources.config.digest]: sources.config.content,
      [sources.contracts.digest]: sources.contracts.content,
    };
    if (backendDigest && backendContent) {
      artifactContent[backendDigest] = backendContent;
    }
    let outputDirectory: string | undefined;
    const sealedArtifact = this.sealedArtifactStatus(
      workspace,
      compiled.digest,
      input.write !== false
    );
    if (input.write !== false) {
      outputDirectory = join(workspace.root, ".openxiangda", "build");
      mkdirSync(join(outputDirectory, "artifacts"), { recursive: true });
      writeFileSync(
        join(outputDirectory, "app-package.json"),
        `${JSON.stringify(compiled.manifest, null, 2)}\n`,
        "utf8"
      );
      for (const [digest, content] of Object.entries(artifactContent)) {
        writeFileSync(
          join(outputDirectory, "artifacts", digest),
          content,
          "utf8"
        );
      }
      this.writeSealedArtifactStatus(workspace.root, sealedArtifact);
    }
    return this.result(
      "build",
      workspace.context.workspace,
      {
        package: compiled,
        artifactContent,
        sealedArtifact,
        ...(outputDirectory ? { outputDirectory } : {}),
      },
      diagnostics,
      [
        {
          code: "deploy",
          label: "部署到预发",
          command: "openxiangda deploy",
        },
      ]
    );
  }

  async deploymentPlan(input: {
    deploymentStrategy?: DeploymentStrategy;
    root?: string;
    environment: "preproduction";
    environmentId?: string;
    idempotencyKey?: string;
  }) {
    const workspace = await this.workspace(input.root);
    const diagnostics = this.toolchainDiagnostics(workspace);
    if (diagnostics.length > 0) {
      return this.result(
        "deployment.plan",
        workspace.context.workspace,
        undefined,
        diagnostics
      );
    }
    const source = await operationStage('source', '核对远端主线与源码', () => publishedDeliverySource(workspace.root));
    const lifecycle = developmentLifecycle(workspace.root, this.appSpecContractIndex(workspace, true));
    if (!lifecycle.readyForTest) return this.result('deployment.plan', workspace.context.workspace, { lifecycle: summarizeLifecycle(lifecycle) }, lifecycle.diagnostics);
    const sources = compileApplicationSources(
      workspace.config,
      this.toolchainVersion
    );
    const client = await this.client(workspace.root);
    const candidate = await reusableSealedCandidate(this.deliveryCacheContext(workspace), source);
    const runtimeCapacity = await this.runtimeCapacityPlan(workspace, client, await client.capabilities(), input, candidate?.package.digest);
    return this.ok("deployment.plan", workspace.context.workspace, {
      runtimeCapacity,
      environment: input.environment,
      appCode: workspace.config.app.code,
      sealed: false,
      packageDigest: null,
      buildOwner: "openxiangda deploy",
      source,
      frontendRoot: workspace.config.frontend.root,
      backendRoot: workspace.config.backend.root,
      configDigest: sources.config.digest,
      contractDigest: sources.contracts.digest,
    });
  }

  async deploy(input: DeployOptions) {
    const workspace = await this.workspace(input.root);
    const capsuleDiagnostics = this.toolchainDiagnostics(workspace);
    if (capsuleDiagnostics.length > 0) {
      return this.result(
        "deploy",
        workspace.context.workspace,
        undefined,
        capsuleDiagnostics
      );
    }
    if (String(input.environment) !== "preproduction") {
      return this.result("deploy", workspace.context.workspace, undefined, [
        this.diagnostic(
          "DEPLOY_PREPRODUCTION_ONLY",
          "Native 2.0 只允许直接部署到预发环境",
          String(input.environment),
          "使用 openxiangda deploy；生产环境必须显式复用成功的测试 DeploymentRun"
        ),
      ]);
    }
    const source = await operationStage('source', '核对远端主线与源码', () => publishedDeliverySource(workspace.root));
    const client = await this.client(workspace.root);
    const capabilities = await client.capabilities();
    const sources = compileApplicationSources(
      workspace.config,
      this.toolchainVersion
    );
    const {
      assertApplicationContractCompatible,
      assertRequiredCapabilitiesAvailable,
    } = await import(
      "./deployment.js"
    );
    assertApplicationContractCompatible(capabilities, {
      appPackageSchemaVersion: SCHEMA_VERSIONS.appPackage,
      configurationBundleSchemaVersion: sources.config.value.schemaVersion,
      contractBundleSchemaVersion: sources.contracts.value.schemaVersion,
      compilerContractVersion: sources.config.value.compilerContractVersion,
    });
    assertRequiredCapabilitiesAvailable(
      capabilities,
      requiredPlatformCapabilities(workspace.config)
    );
    const hasBackend = backendRuntimeRequired(workspace.config);
    const cache = this.deliveryCacheContext(workspace);
    const capacityCandidate = await reusableSealedCandidate(cache, source, input.backendImage);
    const runtimeCapacity = await this.runtimeCapacityPlan(workspace, client, capabilities, input, capacityCandidate?.package.digest);
    if (runtimeCapacity.sufficient === false) {
      throw new ControlPlaneError(409, 'APPLICATION_V2_RUNTIME_QUOTA_INSUFFICIENT', '应用运行资源不足，已在检查脚本与镜像构建前停止；请释放闲置后端或调整平台配额后重试', runtimeCapacity.capacity);
    }
    const generated = await this.generate({ root: workspace.root, check: true });
    if (!generated.ok) return { ...generated, operation: 'deploy' };
    const lifecycle = await operationStage('development-records', '核对需求、架构与测试验收计划', async () => {
      const lifecycle = developmentLifecycle(workspace.root, this.appSpecContractIndex(workspace, true));
      return { ...lifecycle, ok: lifecycle.readyForTest };
    });
    if (!lifecycle.readyForTest) return this.result('deploy', workspace.context.workspace, { lifecycle: summarizeLifecycle(lifecycle) }, lifecycle.diagnostics);
    const checked = await this.check(workspace.root, input.environment);
    if (!checked.ok) return { ...checked, operation: "deploy" };
    await assertDeliverySourceUnchanged(workspace.root, source);
    const preparedInputDigest = deliveryInputDigest(cache);
    const reused = await operationStage('candidate', '核对可复用的不可变制品', async () => {
      const candidate = await reusableSealedCandidate(cache, source, input.backendImage);
      updateOperationStage('candidate', candidate ? '复用已验证的不可变制品' : '准备构建新制品', { reused: !!candidate, ...(candidate ? { packageDigest: candidate.package.digest } : {}) });
      return candidate;
    });
    if (capacityCandidate && capacityCandidate.package.digest !== reused?.package.digest) {
      throw new ControlPlaneError(409, 'OPENXIANGDA_RUNTIME_CAPACITY_CANDIDATE_CHANGED', '检查过程中可复用制品发生变化，请重新预检后部署');
    }
    const backendImage = !reused && hasBackend
      ? input.backendImage
        ? input.backendImage
        : (
            await operationStage('backend-image', '构建并上传后端镜像', () => publishBackendImage({
              root: workspace.root,
              backendRoot: workspace.config.backend.root,
              target: backendImageBuildTarget(capabilities, workspace.config.app.code),
              uploader: client,
              ...(workspace.context.workspace.revision
                ? { sourceRevision: workspace.context.workspace.revision }
                : {}),
            }))
          ).reference
      : undefined;
    await assertDeliverySourceUnchanged(workspace.root, source);
    const built = reused ? this.ok('build', workspace.context.workspace, {
      ...reused, sealedArtifact: this.sealedArtifactStatus(workspace, reused.package.digest, true),
    }) : await operationStage('seal', '校验并冻结不可变制品', () => this.buildSealed({
      ...input,
      root: workspace.root,
      ...(backendImage ? { backendImage } : {}),
      skipWorkspaceBuild: true,
    }));
    if (!built.ok || !built.data) return built;
    if (preparedInputDigest && preparedInputDigest !== deliveryInputDigest(cache)) {
      throw new DeliverySourceError('OPENXIANGDA_VALIDATION_INPUT_CHANGED', '密封期间源码、依赖或构建环境发生变化，已停止上传', '等待修改结束后重新运行 openxiangda deploy');
    }
    if (!reused) recordSealedCandidate(cache, built.data.package);
    const retained = await publishedDeliverySource(workspace.root, source.commit);
    if (retained.repository !== source.repository) {
      throw new DeliverySourceError('DELIVERY_REPOSITORY_CHANGED', '发布准备期间绑定远端发生变化', '恢复并核对原来源仓库，再发布同一候选');
    }
    await assertDeliverySourceUnchanged(workspace.root, source);
    const deployment = await (
      await import("./deployment.js")
    ).submitAppPackage({
      client,
      capabilities,
      compiledPackage: built.data.package,
      artifactContent: built.data.artifactContent,
      environmentKind: input.environment,
      ...(input.deploymentStrategy ? { deploymentStrategy: input.deploymentStrategy } : {}),
      ...(input.environmentId ? { environmentId: input.environmentId } : {}),
      idempotencyKey:
        input.idempotencyKey ||
        `deploy:${built.data.package.digest}:${input.environment}${input.deploymentStrategy === 'maintenance-replace' ? ':maintenance-replace' : ''}`,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
    return this.ok("deploy", workspace.context.workspace, deployment, [
      {
        code: "status",
        label: "查看部署状态",
        command: `openxiangda status ${deployment.id}`,
      },
    ]);
  }

  private async runtimeCapacityPlan(workspace: LoadedWorkspace, client: OpenXiangdaControlPlaneClient,
    capabilities: Awaited<ReturnType<OpenXiangdaControlPlaneClient['capabilities']>>,
    input: { environment: 'preproduction'; environmentId?: string; idempotencyKey?: string; deploymentStrategy?: DeploymentStrategy }, packageDigest?: string) {
    const result = await operationStage('runtime-capacity', '只读预检运行资源配额', () => client.runtimeCapacityPreflight(workspace.config.app.code, capabilities, {
      schemaVersion: RUNTIME_CAPACITY_PREFLIGHT_SCHEMA,
      ...(input.deploymentStrategy ? { deploymentStrategy: input.deploymentStrategy } : {}),
      environmentKey: input.environment,
      ...(input.environmentId ? { environmentId: input.environmentId } : {}),
      backend: backendRuntimeRequired(workspace.config) ? { isolation: workspace.config.backend.isolation || 'shared', resourceProfile: workspace.config.backend.resourceProfile || 'light' } : null,
      ...(packageDigest ? { packageDigest, idempotencyKey: input.idempotencyKey || `deploy:${packageDigest}:${input.environment}${input.deploymentStrategy === 'maintenance-replace' ? ':maintenance-replace' : ''}` } : {}),
    }));
    const { assertRuntimeCapacityPreflight } = await import('./deployment.js');
    assertRuntimeCapacityPreflight(result, input.environmentId, input.deploymentStrategy);
    if (result.basis === 'existing-run' && !packageDigest) throw new ControlPlaneError(409, 'OPENXIANGDA_RUNTIME_CAPACITY_PREFLIGHT_RESULT_INVALID', '平台返回了未绑定本地候选的原运行');
    return result;
  }

  async deploymentStatus(root: string | undefined, deploymentId?: string) {
    const workspace = await this.workspace(root);
    const client = await this.client(workspace.root);
    let data: DeploymentRun | undefined;
    if (deploymentId) {
      data = await client.deployment(workspace.config.app.code, deploymentId);
    } else {
      const latest = (await client.deployments(workspace.config.app.code, 1))
        .items[0];
      data = latest
        ? await client.deployment(workspace.config.app.code, latest.id)
        : undefined;
    }
    if (!data) {
      return this.result("status", workspace.context.workspace, undefined, [
        this.diagnostic(
          "DEPLOYMENT_NOT_FOUND",
          "当前应用还没有部署记录",
          "deploymentId",
          "运行 openxiangda deploy 创建测试部署"
        ),
      ], [
        { code: "deploy", label: "部署测试环境", command: "openxiangda deploy" },
      ]);
    }
    return this.ok(
      "status",
      workspace.context.workspace,
      data,
      this.deploymentRecoveryActions(data)
    );
  }

  async environmentStatus(root?: string) {
    const workspace = await this.workspace(root);
    const data = await (
      await this.client(workspace.root)
    ).applicationEnvironments(workspace.config.app.code);
    return this.ok(
      "environment.status",
      workspace.context.workspace,
      data
    );
  }

  async startEnvironment(
    root: string | undefined,
    environment: DeploymentEnvironment,
    options: { idempotencyKey?: string; requestId?: string } = {}
  ) {
    return await this.changeEnvironmentRuntimeState(
      root,
      environment,
      "start",
      options
    );
  }

  async stopEnvironment(
    root: string | undefined,
    environment: DeploymentEnvironment,
    options: { idempotencyKey?: string; requestId?: string } = {}
  ) {
    return await this.changeEnvironmentRuntimeState(
      root,
      environment,
      "stop",
      options
    );
  }

  async deploymentLogs(root: string | undefined, deploymentId?: string) {
    const status = await this.deploymentStatus(root, deploymentId);
    if (!status.ok || !status.data) return { ...status, operation: "logs" };
    const run = status.data as DeploymentRun;
    return {
      ...status,
      operation: "logs",
      data: {
        deploymentId: run.id,
        status: run.status,
        stage: run.stage,
        checkpoints: run.checkpoints,
        failure: run.failure,
        rootFailure: run.rootFailure,
        latestFailure: run.latestFailure,
        candidate: run.candidate,
        recovery: run.recovery,
        attempts: run.attempts,
        traceId: run.result?.traceId,
      },
    };
  }

  async retry(root: string | undefined, deploymentId: string) {
    const workspace = await this.workspace(root);
    const deployment = await (
      await this.client(workspace.root)
    ).retryDeployment(workspace.config.app.code, deploymentId);
    return this.ok("retry", workspace.context.workspace, deployment, [
      {
        code: "status",
        label: "查看重试状态",
        command: `openxiangda status ${deployment.id}`,
      },
    ]);
  }

  async cancel(root: string | undefined, deploymentId: string) {
    const workspace = await this.workspace(root);
    const deployment = await (
      await this.client(workspace.root)
    ).cancelDeployment(workspace.config.app.code, deploymentId);
    return this.ok("cancel", workspace.context.workspace, deployment, [
      {
        code: "status",
        label: "查看取消结果",
        command: `openxiangda status ${deployment.id}`,
      },
    ]);
  }

  private deploymentRecoveryActions(run: DeploymentRun) {
    const recovery = run.recovery;
    return [
      ...(recovery.nextCommand
        ? [
            {
              code: recovery.retryable ? "retry" : "recover",
              label: recovery.retryable
                ? "显式重试失败部署"
                : "执行平台指定恢复",
              command: recovery.nextCommand,
            },
          ]
        : []),
      {
        code: "logs",
        label: "查看部署尝试账本",
        command: `openxiangda logs ${run.id}`,
      },
      ...(recovery.cancelAllowed
        ? [
            {
              code: "cancel",
              label: "取消未激活部署",
              command: `openxiangda cancel ${run.id}`,
            },
          ]
        : []),
    ];
  }

  async productionDeploymentPlan(root: string | undefined, deploymentId: string) {
    const workspace = await this.workspace(root);
    const client = await this.client(workspace.root);
    const source = await client.deployment(workspace.config.app.code, deploymentId);
    const appVersionId = String(source.result?.applicationVersionId || '');
    if (!appVersionId) throw new Error('DEPLOYMENT_APP_VERSION_NOT_AVAILABLE: 测试运行尚无可晋级版本');
    const diagnostics = await this.productionPromotionDiagnostics(workspace, client, source, appVersionId);
    return this.result('deployment.plan', workspace.context.workspace, {
      environment: 'production', sourceDeploymentId: deploymentId, appVersionId,
      packageDigest: source.packageDigest, sealed: true, submitted: false,
      rebuild: false, businessAcceptance: '需要核对该测试版本的业务验收记录',
    }, diagnostics);
  }

  async deployProduction(
    root: string | undefined,
    deploymentId: string
  ) {
    const workspace = await this.workspace(root);
    const capsuleDiagnostics = this.toolchainDiagnostics(workspace);
    if (capsuleDiagnostics.length > 0) {
      return this.result(
        "deploy",
        workspace.context.workspace,
        undefined,
        capsuleDiagnostics
      );
    }
    const environment = "production" as const;
    const client = await this.client(workspace.root);
    const source = await client.deployment(
      workspace.config.app.code,
      deploymentId
    );
    const appVersionId = String(source.result?.applicationVersionId || "");
    if (!appVersionId) throw new Error("DEPLOYMENT_APP_VERSION_NOT_AVAILABLE");
    const diagnostics = await this.productionPromotionDiagnostics(
      workspace,
      client,
      source,
      appVersionId
    );
    if (diagnostics.length > 0) {
      return this.result(
        "deploy",
        workspace.context.workspace,
        undefined,
        diagnostics
      );
    }
    const deployment = await operationStage('submit', '提交生产晋级', () => client.promote({
      appCode: workspace.config.app.code,
      appVersionId,
      environmentKind: environment,
      idempotencyKey: `promote:${source.packageDigest}:${environment}`,
    }));
    return this.ok("deploy", workspace.context.workspace, deployment, [
      { code: "status", label: "查看生产部署状态", command: `openxiangda status ${deployment.id}` },
    ]);
  }

  private async productionPromotionDiagnostics(
    workspace: LoadedWorkspace,
    client: OpenXiangdaControlPlaneClient,
    source: DeploymentRun,
    appVersionId: string
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    if (
      source.status !== "succeeded" ||
      source.environment.kind !== "preproduction"
    ) {
      diagnostics.push(
        this.diagnostic(
          "PRODUCTION_PREPRODUCTION_RUN_REQUIRED",
          "生产晋级来源必须是成功的预发 DeploymentRun",
          "deploymentId",
          "等待预发部署成功，并使用该 DeploymentRun ID 晋级",
          { status: source.status, environment: source.environment.kind }
        )
      );
      return diagnostics;
    }
    let version: Awaited<ReturnType<OpenXiangdaControlPlaneClient['productionPromotionPreflight']>>;
    try {
      const capabilities = await client.capabilities();
      const { assertApplicationContractCompatible, assertProductionPromotionPreflight } = await import('./deployment.js');
      assertApplicationContractCompatible(capabilities, CURRENT_APPLICATION_CONTRACT);
      version = await operationStage('promotion-preflight', '按原测试制品预检生产环境', () => client.productionPromotionPreflight(workspace.config.app.code, source.id));
      assertProductionPromotionPreflight(version, {
        appCode: workspace.config.app.code, sourceDeploymentId: source.id, appVersionId, packageDigest: source.packageDigest,
      });
      const testedLifecycle = lifecycleAtCommit(workspace.root, version.source.commit, this.appSpecContractIndex(workspace, true));
      if (!testedLifecycle.changeId || !testedLifecycle.acceptanceIds.length) {
        diagnostics.push(this.diagnostic('APPSPEC_TESTED_PLAN_REQUIRED', '指定测试版本缺少可追溯的需求与验收计划', 'appspec', '补齐真实记录并发布新的测试候选，再执行验收和生产晋级'));
      }
      // 原测试提交中的设计基线也必须有效，当前主线的补写不能补签旧版本。
      diagnostics.push(...testedLifecycle.design.diagnostics);
      const acceptance = await operationStage('business-acceptance', '核对原测试版本的业务验收报告', async () => verifyBusinessAcceptance(workspace.root, source, testedLifecycle));
      diagnostics.push(...acceptance.diagnostics);
    } catch (error) {
      return [this.configurationCompatibilityDiagnostic(error)];
    }
    if (workspace.context.workspace.dirty || version.source.dirty) {
      diagnostics.push(
        this.diagnostic(
          "PRODUCTION_SOURCE_DIRTY",
          "生产晋级只接受来源干净且当前工作区无未提交变更的 AppVersion",
          "git",
          "提交并推送当前改动，或在干净主线目录中晋级该测试版本"
        )
      );
    }
    const repository = git(workspace.root, ["config", "--get", "remote.origin.url"]);
    const currentRepository = this.repositoryIdentity(repository);
    const sourceRepository = this.repositoryIdentity(version.source.repository);
    if (
      !currentRepository ||
      !sourceRepository ||
      currentRepository !== sourceRepository
    ) {
      diagnostics.push(
        this.diagnostic(
          "PRODUCTION_SOURCE_REPOSITORY_MISMATCH",
          "当前工作区仓库与 AppVersion 来源仓库不一致",
          "git.remote.origin.url",
          "在构建该 AppVersion 的同一仓库中执行晋级",
          { current: repository || null, source: version.source.repository }
        )
      );
    }
    if (diagnostics.length) return diagnostics;
    try {
      await operationStage('promotion-source', '核对测试制品的主线来源', () => publishedDeliverySource(workspace.root, version.source.commit));
    } catch (error) {
      if (!(error instanceof DeliverySourceError)) throw error;
      diagnostics.push(this.diagnostic(error.code, error.message, 'git', String(error.data.remediation), error.data));
    }
    return diagnostics;
  }

  async rollback(
    root: string | undefined,
    environment: DeploymentEnvironment,
    appVersionId: string,
    options: { operationId?: string } = {}
  ) {
    const workspace = await this.workspace(root);
    const targetEnvironment = this.deploymentEnvironment(environment);
    const requestedOperationId = options.operationId?.trim();
    if (requestedOperationId && !UUID_PATTERN.test(requestedOperationId)) {
      throw new Error(
        "OPENXIANGDA_ROLLBACK_OPERATION_ID_INVALID: --operation-id 必须是 UUID"
      );
    }
    const operationId = requestedOperationId || randomUUID();
    const deployment = await (
      await this.client(workspace.root)
    ).rollback({
      appCode: workspace.config.app.code,
      appVersionId,
      environmentKind: targetEnvironment,
      idempotencyKey: `rollback:${appVersionId}:${targetEnvironment}:${operationId}`,
      requestId: operationId,
    });
    return this.ok("rollback", workspace.context.workspace, deployment);
  }

  private deploymentEnvironment(value: string): DeploymentEnvironment {
    const normalized = String(value || "").trim();
    if (normalized === "preproduction" || normalized === "production") {
      return normalized;
    }
    throw new Error(
      `OPENXIANGDA_REMOTE_ENVIRONMENT_INVALID: ${normalized || "<empty>"}`
    );
  }

  private async changeEnvironmentRuntimeState(
    root: string | undefined,
    environment: DeploymentEnvironment,
    action: "start" | "stop",
    options: { idempotencyKey?: string; requestId?: string }
  ) {
    const workspace = await this.workspace(root);
    const environmentKey = this.deploymentEnvironment(environment);
    const client = await this.client(workspace.root);
    const environments = await client.applicationEnvironments(
      workspace.config.app.code
    );
    const current = environments.items.find(
      item => item.environmentKey === environmentKey
    );
    if (!current) {
      throw new Error(
        `OPENXIANGDA_ENVIRONMENT_NOT_PROVISIONED: ${environmentKey}`
      );
    }
    const input = {
      idempotencyKey:
        options.idempotencyKey ||
        `environment:${action}:${environmentKey}:revision:${current.revision}`,
      ...(options.requestId ? { requestId: options.requestId } : {}),
    };
    const deployment =
      action === "start"
        ? await client.startEnvironment(
            workspace.config.app.code,
            environmentKey,
            input
          )
        : await client.stopEnvironment(
            workspace.config.app.code,
            environmentKey,
            input
          );
    return this.ok(
      `environment.${action}`,
      workspace.context.workspace,
      deployment,
      [
        {
          code: "status",
          label: "查看环境状态",
          command: "openxiangda status",
        },
      ]
    );
  }

  async dev(
    root?: string,
    input: {
      noOpen?: boolean;
      /** @internal Used by the packaged browser verification harness. */
      webPort?: number;
      onStatus?: (message: string) => void;
    } = {}
  ) {
    const workspace = await this.workspace(root);
    const capsuleDiagnostics = this.toolchainDiagnostics(workspace);
    if (capsuleDiagnostics.length > 0) {
      return this.result(
        "dev",
        workspace.context.workspace,
        undefined,
        capsuleDiagnostics
      );
    }
    const injectionDiagnostics = validateNestInjectionContract(workspace.root);
    if (injectionDiagnostics.length) {
      return this.result(
        "dev",
        workspace.context.workspace,
        undefined,
        injectionDiagnostics
      );
    }
    const generated = await this.generate({
      root: workspace.root,
    });
    if (!generated.ok) {
      return this.result(
        "dev",
        workspace.context.workspace,
        undefined,
        generated.diagnostics,
        generated.nextActions
      );
    }
    const backendDiagnostics = this.initializeBackend(workspace);
    if (backendDiagnostics.length) {
      return this.result("dev", workspace.context.workspace, undefined, backendDiagnostics);
    }
    try {
    const linkPath = join(workspace.root, ".openxiangda", "link.json");
    if (!existsSync(linkPath)) {
      throw new Error(
        "OPENXIANGDA_CONNECTED_LINK_REQUIRED: 先运行 openxiangda create <directory> --base-url <platform>"
      );
    }
    let link: {
      schemaVersion?: number;
      appCode?: string;
      baseUrl?: string;
    };
    try {
      link = JSON.parse(readFileSync(linkPath, "utf8")) as typeof link;
    } catch {
      throw new Error("OPENXIANGDA_CONNECTED_LINK_INVALID");
    }
    if (link.schemaVersion !== 2 || link.appCode !== workspace.config.app.code || !link.baseUrl) {
      throw new Error("OPENXIANGDA_CONNECTED_LINK_INVALID");
    }
    const developerSession = await OpenXiangdaDeveloperSession.load();
    if (!developerSession) {
      throw new Error("OPENXIANGDA_CONNECTED_LOGIN_REQUIRED: 先运行 openxiangda login");
    }
    developerSession.assertPlatform(link.baseUrl);
    await developerSession.whoami();
    const client = new OpenXiangdaControlPlaneClient({
      baseUrl: developerSession.baseUrl,
      tokenProvider: developerSession,
    });
    const environments = await client.applicationEnvironments(
      workspace.config.app.code
    );
    const environment = selectConnectedDevelopmentEnvironment(
      environments.items
    );
    if (!environment) {
      throw new Error(
        "OPENXIANGDA_CONNECTED_ACTIVE_ENVIRONMENT_REQUIRED: 应用需要已发布的 test(preproduction) 或 production 环境"
      );
    }
    const sources = compileApplicationSources(
      workspace.config,
      this.toolchainVersion
    );
    const remoteSession = {
      create: async () => {
        const value = await client.createConnectedDevelopmentSession(
          workspace.config.app.code,
          {
            environmentKey: environment.environmentKey,
            manifestDigest: sources.config.digest,
            configuration: sources.config.value,
          }
        );
        return {
          id: value.sessionId,
          token: value.sessionToken,
          expiresAt: value.expiresAt,
          mode: value.mode,
          manifestOverlay: value.manifestOverlay,
          manifestDigest: value.manifestDigest,
        } as const;
      },
      current: async (token: string) => {
        const value = await client.connectedDevelopmentSession(
          workspace.config.app.code,
          token
        );
        return {
          id: value.sessionId,
          expiresAt: value.expiresAt,
          mode: value.mode,
          manifestOverlay: value.manifestOverlay,
          manifestDigest: value.manifestDigest,
        } as const;
      },
      refresh: async (token: string) => {
        const value = await client.refreshConnectedDevelopmentSession(
          workspace.config.app.code,
          token
        );
        return {
          id: value.sessionId,
          expiresAt: value.expiresAt,
          mode: value.mode,
          manifestOverlay: value.manifestOverlay,
          manifestDigest: value.manifestDigest,
        } as const;
      },
      revoke: async (token: string) => {
        await client.revokeConnectedDevelopmentSession(
          workspace.config.app.code,
          token
        );
      },
    };
    input.onStatus?.(
      "connected dev 已启用增量配置：已有资源上的可空新字段无需先部署 test"
    );
    const connected = await runConnectedDevelopment({
      root: workspace.root,
      appCode: workspace.config.app.code,
      platformBaseUrl: developerSession.baseUrl,
      environment,
      developerSession,
      remoteSession,
      ...(input.noOpen === undefined ? {} : { noOpen: input.noOpen }),
      ...(input.webPort === undefined ? {} : { webPort: input.webPort }),
      ...(input.onStatus ? { onStatus: input.onStatus } : {}),
    });
    const diagnostics = connected.exitCode === 0
      ? []
      : [
          this.diagnostic(
            "DEV_PROCESS_FAILED",
            "连接式开发进程异常退出",
            workspace.root,
            "查看 Web 或 Nest 进程的终端输出后重试"
          ),
        ];
    return this.result(
      "dev",
      workspace.context.workspace,
      connected,
      diagnostics
    );
    } catch (error) {
      const failure = this.connectedDevelopmentFailure(error, workspace.root);
      return this.result(
        "dev",
        workspace.context.workspace,
        undefined,
        [
          this.diagnostic(
            failure.code,
            failure.message,
            failure.path,
            failure.remediation
          ),
        ],
        [{ code: failure.actionCode, label: failure.actionLabel, command: failure.command }]
      );
    }
  }

  private async workspace(root?: string) {
    return await loadWorkspace(root, this.toolchainVersion);
  }

  private appSpecContractIndex(
    workspace: LoadedWorkspace,
    includeDigests: boolean
  ): AppSpecContractIndex {
    const source = includeDigests
      ? compileApplicationSources(workspace.config, this.toolchainVersion)
      : undefined;
    return {
      appCode: workspace.config.app.code,
      resourceCodes: (workspace.config.data?.resources || []).map(
        resource => resource.code
      ),
      actionCodes: (workspace.config.backend?.operations || []).map(
        operation => operation.code
      ),
      ...(source
        ? {
            configDigest: source.config.digest,
            contractDigest: source.contracts.digest,
            aiCatalogDigest: source.aiCatalog.digest,
          }
        : {}),
    };
  }

  private async validateTargetConfigurationCompatibility(
    workspace: LoadedWorkspace,
    environmentKey: DeploymentEnvironment,
    local: ReturnType<typeof compileLocalConfiguration>
  ): Promise<ConfigurationValidationResult> {
    const client = await this.client(workspace.root);
    const capabilities = await client.capabilities();
    const { sources } = local;
    const required = {
      ...CURRENT_APPLICATION_CONTRACT,
      configurationBundleSchemaVersion: sources.config.value.schemaVersion,
      contractBundleSchemaVersion: sources.contracts.value.schemaVersion,
      compilerContractVersion: sources.config.value.compilerContractVersion,
    };
    const {
      assertApplicationContractCompatible,
      assertConfigurationValidationResult,
      assertRequiredCapabilitiesAvailable,
    } = await import("./deployment.js");
    assertApplicationContractCompatible(capabilities, required);
    assertRequiredCapabilitiesAvailable(
      capabilities,
      requiredPlatformCapabilities(workspace.config)
    );
    const result = await client.validateConfigurationCompatibility(
      workspace.config.app.code,
      capabilities,
      {
        schemaVersion: SCHEMA_VERSIONS.configurationValidationRequest,
        environmentKey,
        clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
        required,
        configuration: {
          schemaVersion: sources.config.value.schemaVersion,
          digest: sources.config.digest,
          canonical: sources.config.content,
        },
        contract: {
          schemaVersion: sources.contracts.value.schemaVersion,
          digest: sources.contracts.digest,
          canonical: sources.contracts.content,
        },
      }
    );
    assertConfigurationValidationResult(capabilities, required, result, {
      configurationDigest: sources.config.digest,
      contractDigest: sources.contracts.digest,
    }, requiredPlatformCapabilities(workspace.config));
    if (result.projectionDigest !== local.compiled.aggregateDigest) {
      throw new ControlPlaneError(409, 'OPENXIANGDA_CONFIGURATION_PROJECTION_MISMATCH',
        '相同校验规则与输入生成了不同投影，已停止构建，请检查平台配套版本', {
          pointer: '/projectionDigest', expectedProjectionDigest: local.compiled.aggregateDigest,
          actualProjectionDigest: result.projectionDigest, validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST,
        });
    }
    return result;
  }

  private configurationCompatibilityDiagnostic(error: unknown): Diagnostic {
    if (error instanceof NativeConfigurationCompilerError) {
      return this.diagnostic(error.code, '应用声明未通过本地完整配置校验', error.pointer,
        '按错误指针修正应用声明，运行 openxiangda check 复核', {
          pointer: error.pointer, identifiers: error.identifiers, validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST,
          validationOwner: 'local-shared-compiler',
        });
    }
    const data =
      error instanceof ControlPlaneError &&
      error.data &&
      typeof error.data === "object" &&
      !Array.isArray(error.data)
        ? (error.data as Record<string, unknown>)
        : {};
    const required = { ...CURRENT_APPLICATION_CONTRACT };
    const pointer = String(
      data.pointer ||
        (error instanceof ControlPlaneError ? error.remote?.path : "") ||
        "/"
    );
    const details = {
      pointer,
      clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
      clientSchemaVersions: {
        appPackage: required.appPackageSchemaVersion,
        configuration: required.configurationBundleSchemaVersion,
        contract: required.contractBundleSchemaVersion,
        compiler: required.compilerContractVersion,
      },
      platformVersion: "unknown",
      platformCapability: {
        code: CONFIGURATION_COMPATIBILITY_CAPABILITY,
        version: "unknown",
        status: "unavailable",
      },
      required,
      supported: [],
      ...data,
    };
    const diagnostic = this.diagnostic(
      String(
        (error as { code?: unknown })?.code ||
          "OPENXIANGDA_CONFIGURATION_COMPATIBILITY_FAILED"
      ),
      error instanceof Error
        ? error.message
        : "目标平台配置兼容性预检失败",
      pointer,
      error instanceof ControlPlaneError
        ? error.remote?.remediation ||
            (typeof data.remediation === "string"
              ? data.remediation
              : "升级目标平台或修正应用声明后重试 openxiangda check")
        : "检查目标平台兼容性后重试 openxiangda check",
      details
    );
    return {
      ...diagnostic,
      retryable:
        error instanceof ControlPlaneError
          ? error.remote?.retryable === true || error.status >= 500
          : false,
    };
  }

  private async client(root?: string) {
    if (this.options.client) return this.options.client;
    if (this.options.clientOptions) {
      return new OpenXiangdaControlPlaneClient(this.options.clientOptions);
    }
    const session = await OpenXiangdaDeveloperSession.load();
    if (!session) throw new Error("OPENXIANGDA_AUTH_REQUIRED");
    if (root) {
      const linkPath = join(root, ".openxiangda", "link.json");
      if (existsSync(linkPath)) {
        const link = JSON.parse(readFileSync(linkPath, "utf8")) as {
          baseUrl?: string;
        };
        if (link.baseUrl) session.assertPlatform(String(link.baseUrl));
      }
    }
    return new OpenXiangdaControlPlaneClient({
      baseUrl: session.baseUrl,
      tokenProvider: session,
    });
  }

  private get toolchainVersion() {
    return this.options.toolchainVersion || OPENXIANGDA_TOOLCHAIN_VERSION;
  }

  private deliveryCacheContext(workspace: LoadedWorkspace): DeliveryCacheContext {
    return {
      root: workspace.root, frontendRoot: workspace.config.frontend.root,
      ...(backendRuntimeRequired(workspace.config) ? { backendRoot: workspace.config.backend.root } : {}),
      toolchain: { version: this.toolchainVersion, capsule: this.toolchainCapsule, validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST },
    };
  }

  private get toolchainCapsule() {
    return this.options.toolchainCapsule || defaultDevkitCoreToolchainCapsule();
  }

  private initializeBackend(workspace: LoadedWorkspace): Diagnostic[] {
    try {
      initializeOptionalBackend(workspace.root, workspace.config, {
        ...(this.options.toolchainCapsule?.packages.openxiangda
          ? { sdkVersion: this.options.toolchainCapsule.packages.openxiangda }
          : {}),
      });
      return [];
    } catch (error) {
      return [{
        ...this.diagnostic(
          String((error as { code?: string }).code || "OPENXIANGDA_BACKEND_INITIALIZATION_FAILED"),
          (error as Error).message,
          workspace.config.backend.root,
          "修复初始化或依赖安装问题后重新运行 openxiangda check",
        ),
        retryable: (error as { retryable?: boolean }).retryable === true,
      }];
    }
  }

  private packageScriptLabel(script: string) {
    return ({ check: '类型与规范检查', test: '应用测试', build: '前后端构建' } as Record<string, string>)[script] || script;
  }

  private async runPackageScript(root: string, script: string) {
    return operationStage(script, this.packageScriptLabel(script), async () => {
      const result = await runCommandProcess('pnpm', ['run', script], { cwd: root });
      return { ok: result.ok, exitCode: result.status ?? 1, output: result.output.trim(), outputTruncated: result.outputTruncated };
    });
  }

  private repositoryIdentity(value: string) {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    if (normalized.startsWith("/") || normalized.startsWith("file://")) {
      return normalized.replace(/^file:\/\//, "").replace(/\.git\/?$/, "");
    }
    const scp = normalized.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
    if (scp && !normalized.includes("://")) {
      return `${scp[1]}/${scp[2]}`.toLowerCase().replace(/\.git\/?$/, "");
    }
    try {
      const url = new URL(normalized);
      return `${url.hostname}${url.pathname}`
        .toLowerCase()
        .replace(/\.git\/?$/, "")
        .replace(/\/$/, "");
    } catch {
      return normalized.toLowerCase().replace(/\.git\/?$/, "");
    }
  }

  private directoryBundle(root: string) {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw Object.assign(new Error(`前端构建目录不存在: ${root}`), {
        code: "FRONTEND_DIST_NOT_FOUND",
      });
    }
    const files: Array<{ path: string; sha256: string; content: string }> = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
        (a, b) => a.name.localeCompare(b.name)
      )) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile()) {
          const content = readFileSync(path);
          files.push({
            path: relative(root, path).replaceAll("\\", "/"),
            sha256: sha256Bytes(content),
            content: content.toString("base64"),
          });
        }
      }
    };
    visit(root);
    return canonicalJson({ schemaVersion: 2, files });
  }

  private writeCheckSealedArtifactStatus(
    workspace: LoadedWorkspace,
    passed: boolean
  ): SealedArtifactStatus {
    const previousArtifact = this.previousSealedArtifact(workspace);
    const status: SealedArtifactStatus = {
      schemaVersion: "openxiangda.sealed-artifact-status/v2",
      state: "check-did-not-seal",
      sealed: false,
      usableForDeploy: false,
      refreshedBy: "check",
      persisted: true,
      statusPath: ".openxiangda/build/seal-status.json",
      manifestPath: ".openxiangda/build/app-package.json",
      workspaceRevision: workspace.context.workspace.revision || null,
      workspaceDirty: workspace.context.workspace.dirty === true,
      packageDigest: null,
      ...(previousArtifact ? { previousArtifact } : {}),
      reasonCode: "OPENXIANGDA_CHECK_DOES_NOT_SEAL",
      nextCommand: passed ? "openxiangda deploy" : "openxiangda check",
    };
    this.writeSealedArtifactStatus(workspace.root, status);
    return status;
  }

  private sealedArtifactStatus(
    workspace: LoadedWorkspace,
    packageDigest: string,
    persisted: boolean
  ): SealedArtifactStatus {
    return {
      schemaVersion: "openxiangda.sealed-artifact-status/v2",
      state: "sealed",
      sealed: true,
      usableForDeploy: persisted,
      refreshedBy: "build",
      persisted,
      statusPath: ".openxiangda/build/seal-status.json",
      manifestPath: ".openxiangda/build/app-package.json",
      workspaceRevision: workspace.context.workspace.revision || null,
      workspaceDirty: workspace.context.workspace.dirty === true,
      packageDigest,
      nextCommand: "openxiangda deploy",
    };
  }

  private previousSealedArtifact(
    workspace: LoadedWorkspace
  ): SealedArtifactStatus["previousArtifact"] | undefined {
    const manifestPath = join(
      workspace.root,
      ".openxiangda",
      "build",
      "app-package.json"
    );
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
      return undefined;
    }
    if (statSync(manifestPath).size > 5 * 1024 * 1024) {
      return {
        packageDigest: null,
        sourceRevision: null,
        sourceDirty: null,
        matchesWorkspaceSource: false,
      };
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        source?: { commit?: unknown; dirty?: unknown };
      };
      const sourceRevision =
        typeof manifest.source?.commit === "string"
          ? manifest.source.commit
          : null;
      const sourceDirty =
        typeof manifest.source?.dirty === "boolean"
          ? manifest.source.dirty
          : null;
      const workspaceRevision = workspace.context.workspace.revision || null;
      const workspaceDirty = workspace.context.workspace.dirty === true;
      return {
        packageDigest: sha256Digest(manifest),
        sourceRevision,
        sourceDirty,
        matchesWorkspaceSource:
          sourceRevision !== null &&
          sourceRevision === workspaceRevision &&
          sourceDirty === workspaceDirty,
      };
    } catch {
      return {
        packageDigest: null,
        sourceRevision: null,
        sourceDirty: null,
        matchesWorkspaceSource: false,
      };
    }
  }

  private writeSealedArtifactStatus(
    root: string,
    status: SealedArtifactStatus
  ) {
    const statusPath = join(root, status.statusPath);
    mkdirSync(dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  }

  private versionTrainDiagnostics(workspace: LoadedWorkspace) {
    let dependencies: ReturnType<typeof collectWorkspaceToolchainDependencies>;
    try {
      dependencies = collectWorkspaceToolchainDependencies(workspace.root);
    } catch (error) {
      if (error instanceof ToolchainCapsuleScanLimitError) {
        return [
          this.diagnostic(
            error.code,
            "工作区 package.json 扫描超过安全资源上限",
            "package.json",
            "减少工作区中纳入检查的 package.json 数量或文件大小后重试",
            { message: error.message }
          ),
        ];
      }
      throw error;
    }
    const parsed = dependencies.map(dependency => {
      const version = dependency.specifier.replace(/^workspace:/, "");
      const match = version.match(
        /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/
      );
      return {
        ...dependency,
        version,
        major: match ? Number(match[1]) : null,
        exact: Boolean(match),
      };
    });
    const unpinned = parsed.filter(dependency => !dependency.exact);
    const incompatible = parsed.filter(
      dependency => dependency.exact && dependency.major !== 2
    );
    const diagnostics: Diagnostic[] = [];
    if (unpinned.length > 0) {
      diagnostics.push(
        this.diagnostic(
          "TOOLCHAIN_DEPENDENCY_NOT_PINNED",
          "openxiangda-* 依赖必须精确锁定，不能使用范围、标签或未定版本的 workspace 协议",
          "package.json",
          "把每个 openxiangda-* 依赖改为已验证的精确 2.x 版本，并提交 lockfile",
          { dependencies: unpinned }
        )
      );
    }
    if (incompatible.length > 0) {
      diagnostics.push(
        this.diagnostic(
          "TOOLCHAIN_RELEASE_TRAIN_INCOMPATIBLE",
          "应用包含不属于 OpenXiangda 2.x 发布列车的依赖",
          "package.json",
          "使用兼容的 OpenXiangda 2.x 精确版本；包版本可以独立递增，不要求字符串相同",
          { dependencies: incompatible }
        )
      );
    }
    const capsuleDiagnostic = toolchainCapsuleDiagnostic(
      dependencies,
      this.toolchainCapsule
    );
    if (capsuleDiagnostic) diagnostics.push(capsuleDiagnostic);
    return diagnostics;
  }

  private toolchainDiagnostics(workspace: LoadedWorkspace) {
    return this.versionTrainDiagnostics(workspace);
  }

  private diagnostic(
    code: string,
    message: string,
    path: string,
    remediation?: string,
    details?: Record<string, unknown>
  ): Diagnostic {
    return {
      schemaVersion: SCHEMA_VERSIONS.diagnostic,
      code,
      severity: "error",
      message,
      path,
      retryable: false,
      ...(remediation ? { remediation } : {}),
      ...(details ? { details } : {}),
    };
  }

  private connectedDevelopmentFailure(error: unknown, workspaceRoot: string) {
    const rawCode = String(
      (error as { code?: string })?.code ||
      (error instanceof Error ? error.message.split(":", 1)[0] : "") ||
      "OPENXIANGDA_CONNECTED_DEV_FAILED"
    ).trim();
    const known: Record<string, {
      message: string;
      remediation: string;
      actionCode: string;
      actionLabel: string;
      command: string;
      path?: string;
    }> = {
      OPENXIANGDA_CONNECTED_LINK_REQUIRED: {
        message: "当前工作区尚未绑定 OpenXiangda 平台",
        remediation: "运行 create 幂等完成工作区绑定和平台初始化",
        actionCode: "create",
        actionLabel: "初始化应用",
        command: "openxiangda create <directory> --base-url <platform>",
        path: ".openxiangda/link.json",
      },
      OPENXIANGDA_CONNECTED_LINK_INVALID: {
        message: "当前工作区的平台绑定无效或属于另一个应用",
        remediation: "运行 create 幂等校验并重新生成当前应用绑定",
        actionCode: "create",
        actionLabel: "重新初始化应用",
        command: "openxiangda create <directory> --base-url <platform>",
        path: ".openxiangda/link.json",
      },
      OPENXIANGDA_CONNECTED_LOGIN_REQUIRED: {
        message: "尚未登录 OpenXiangda 平台",
        remediation: "登录工作区绑定的平台后重试",
        actionCode: "login",
        actionLabel: "登录平台",
        command: "openxiangda login --base-url <platform>",
      },
      OPENXIANGDA_AUTH_REQUIRED: {
        message: "OpenXiangda 登录已失效",
        remediation: "重新登录工作区绑定的平台后重试",
        actionCode: "login",
        actionLabel: "重新登录",
        command: "openxiangda login --base-url <platform>",
      },
      OPENXIANGDA_PLATFORM_SESSION_MISMATCH: {
        message: "工作区绑定平台与当前登录平台不一致",
        remediation: "切换登录平台，或明确重新绑定当前工作区",
        actionCode: "login",
        actionLabel: "切换登录平台",
        command: "openxiangda login --base-url <linked-platform>",
        path: ".openxiangda/link.json",
      },
      OPENXIANGDA_CONNECTED_ACTIVE_ENVIRONMENT_REQUIRED: {
        message: "应用没有可用于 connected dev 的已发布环境",
        remediation: "先发布 test(preproduction)；只有 production 时也可以直接连接正式数据",
        actionCode: "deploy.test",
        actionLabel: "部署 test",
        command: "openxiangda deploy",
      },
    };
    const dataRemediation = (error as { data?: { remediation?: unknown } })
      ?.data?.remediation;
    const remoteRemediation =
      error instanceof ControlPlaneError
        ? error.remote?.remediation ||
          (typeof dataRemediation === "string" ? dataRemediation : undefined)
        : undefined;
    const selected = known[rawCode] || {
      message: "连接式开发预检失败",
      remediation:
        remoteRemediation || (error instanceof Error && error.message
          ? error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
          : "检查平台登录、应用权限和 Dev Session 状态后重试"),
      actionCode: "dev.retry",
      actionLabel: "重试 connected dev",
      command: "openxiangda dev",
    };
    return {
      code: rawCode,
      message: selected.message,
      remediation: selected.remediation,
      actionCode: selected.actionCode,
      actionLabel: selected.actionLabel,
      command: selected.command,
      path: selected.path || workspaceRoot,
    };
  }

  private ok<T>(
    operation: string,
    workspace: WorkspaceIdentity,
    data: T,
    nextActions: DevkitResult<T>["nextActions"] = []
  ): DevkitResult<T> {
    return {
      ok: true,
      operation,
      workspace,
      data,
      diagnostics: [],
      nextActions,
    };
  }

  private result<T>(
    operation: string,
    workspace: WorkspaceIdentity,
    data: T | undefined,
    diagnostics: Diagnostic[],
    nextActions: DevkitResult<T>["nextActions"] = []
  ): DevkitResult<T> {
    return {
      ok: diagnostics.every((item) => item.severity !== "error"),
      operation,
      workspace,
      ...(data === undefined ? {} : { data }),
      diagnostics: [...diagnostics].sort((left, right) => ({ error: 0, warning: 1, info: 2 })[left.severity] - ({ error: 0, warning: 1, info: 2 })[right.severity]),
      nextActions,
    };
  }
}
