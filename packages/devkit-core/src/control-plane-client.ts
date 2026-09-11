import type { DeploymentStrategy } from 'openxiangda-contracts';
import type { ApplicationSourceRepository, ApplicationSourceCredential } from 'openxiangda-contracts';
import {
  RUNTIME_CAPACITY_PREFLIGHT_SCHEMA,
  type RuntimeCapacityPreflight,
  type RuntimeCapacityPreflightRequest,
  CONFIGURATION_COMPATIBILITY_CAPABILITY,
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  SCHEMA_VERSIONS,
  type AppPackage,
  type ApplicationEnvironmentList,
  type ApplicationSecret,
  type ApplicationSecretAuditEvent,
  type AppVersion,
  type ProductionPromotionPreflight,
  type Diagnostic,
  type NativeRelationshipGrant,
  type NativeRelationshipGrantPage,
  type NativeAuthorizationProjectionHealth,
  type NativeAuthorizationProjectionMutationResult,
  type NativeAuthorizationManagementCatalog,
  type NativeAuthorizationMutationReceipt,
  type NativeRoleManagementAction,
  type NativeRoleManagementGrantMutationResult,
  type NativeRoleManagementGrantPage,
  type NativeRoleMembershipMutationResult,
  type NativeRoleMembershipPage,
  type NativeScopeGrant,
  type NativeSuperAdminGrant,
  type NativeSuperAdminGrantPage,
  type DeploymentKind,
  type DeploymentEnvironment,
  type DeploymentRun,
  type EnvironmentHead,
  type EventDelivery,
  type EventSubscription,
  type DateTrigger,
  type DataPage,
  type DataAggregatePage,
  type DataAggregateQuery,
  type DataAuditPage,
  type DataFileRef,
  type DataFileUploadPlan,
  type DataQuery,
  type DataRecord,
  type DataResource,
  type DataTransactionRequest,
  type DataTransactionResult,
  type DirectoryEntryKind,
  type DirectoryResolveRequest,
  type DirectorySearchResult,
  type PlatformCapabilities,
  type ConfigurationValidationRequest,
  type ConfigurationValidationResult,
  type OAuthApplicationPrincipal,
  type OAuthAuditEvent,
  type OAuthClient,
  type RuntimeOAuthCredentialStatus,
  type RuntimeMode,
  type ProvisionedApplication,
  type ApplicationRole,
  type RelationshipGrant,
  type RelationshipGrantSubjectType,
  type TimerSubscription,
  type RoleAssignment,
  type WorkflowBinding,
  type WorkflowNodeConfigurations,
  type ApplicationAdministrationContext,
  type WorkflowCommand,
  type WorkflowCommandInput,
  type WorkflowCommandResult,
  type WorkflowDefinition,
  type WorkflowDelegation,
  type WorkflowDelegationTarget,
  type WorkflowAssigneeProvider,
  type WorkflowInstance,
  type WorkflowSurface,
  type WorkflowWorkCenterItem,
  type WorkflowTimeline,
} from "openxiangda-contracts/browser";
import { Agent, fetch as undiciFetch } from "undici";
import type { BackendImageUploadReceipt } from './backend-image-upload.js';

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const ARTIFACT_UPLOAD_HEADERS_TIMEOUT_MS = 30 * 60 * 1000;
const ARTIFACT_UPLOAD_BODY_TIMEOUT_MS = 5 * 60 * 1000;

function createArtifactUploadFetch(): FetchLike {
  const dispatcher = new Agent({
    headersTimeout: ARTIFACT_UPLOAD_HEADERS_TIMEOUT_MS,
    bodyTimeout: ARTIFACT_UPLOAD_BODY_TIMEOUT_MS,
  });
  return async (input, init) =>
    (await undiciFetch(input as any, {
      ...(init || {}),
      dispatcher,
    } as any)) as unknown as Response;
}

interface PlatformEnvelope<T> {
  code: number;
  message: string;
  errorCode?: string;
  status?: number;
  retryable?: boolean;
  remediation?: string;
  requestId?: string;
  path?: string;
  field?: string;
  data: T;
}

export interface ControlPlaneClientOptions {
  baseUrl: string;
  token?: string;
  tokenProvider?: {
    getAccessToken(input?: { forceRefresh?: boolean }): Promise<string>;
  };
  credentials?: RequestCredentials;
  fetch?: FetchLike;
}

export interface ConnectedDevelopmentSessionStatus {
  schemaVersion: "openxiangda.connected-dev-session/v2";
  sessionId: string;
  expiresAt: string;
  expiresIn: number;
  mode: "published-resources" | "manifest-overlay";
  manifestOverlay: boolean;
  additiveSchemaSync: boolean;
  overlay?: {
    resources: number;
    addedFields: Array<{ resourceCode: string; fieldCode: string }>;
  };
  environment: {
    id: string;
    key: DeploymentEnvironment;
    activeAppVersionId: string;
    headRevision: number;
  };
  principal: {
    type: "developer";
    userId: string;
    roleCodes: string[];
    isAppSuperAdmin: boolean;
    capabilityCodes: string[];
  };
  manifestDigest: string | null;
}

export interface ConnectedDevelopmentSessionGrant
  extends ConnectedDevelopmentSessionStatus {
  /** Returned once by create; never persist or print it. */
  sessionToken: string;
}

export interface ChinaDivisionListItem {
  adcode: string;
  citycode?: string;
  name: string;
  level?: string;
  center?: string;
  parentAdcode?: string;
  hasChildren: boolean;
}

export interface PerspectiveRequest {
  perspectiveCode?: string;
}

export interface NativeAuthorizationPageInput {
  environmentKey?: DeploymentEnvironment;
  status?: "active" | "revoked" | "expired";
  limit?: number;
  offset?: number;
}

export interface CreateNativeRoleMembershipInput {
  environmentKey: DeploymentEnvironment;
  operationId: string;
  userId: string;
  roleCode: string;
  scopeGrants?: NativeScopeGrant[];
  validFrom?: string | null;
  validTo?: string | null;
  reason: string;
}

export interface UpdateNativeRoleMembershipInput {
  environmentKey: DeploymentEnvironment;
  operationId: string;
  expectedRevision: number;
  scopeGrants?: NativeScopeGrant[];
  validFrom?: string | null;
  validTo?: string | null;
  reason: string;
}

export interface NativeRelationshipGrantFilter
  extends NativeAuthorizationPageInput {
  subjectType?: "user" | "role_membership";
  subjectKey?: string;
  relationCode?: string;
  resourceCode?: string;
  resourceId?: string;
}

export interface NativeScopeValuePage {
  schemaVersion: string;
  environment: {
    id: string;
    key: DeploymentEnvironment;
    headRevision: number;
    authzRevisionId: string;
    scopeDataVersion: string;
  };
  dimensionCode: string;
  items: Array<{ id: string; label: string }>;
  limit: number;
  offset: number;
}

export type ApplicationApiQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ApplicationApiRequest extends RequestInit {
  perspectiveCode?: string;
  query?: ApplicationApiQuery;
}

export interface CreateOAuthClientInput {
  name: string;
  environmentKey: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
}

export interface UpdateOAuthClientInput {
  name?: string;
  environmentKey?: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
}

export interface OAuthClientSecretResult {
  client: OAuthClient;
  clientSecret: string;
  secretReturnedOnce: true;
  previousSecretValidUntil?: string | null;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export interface CreateApplicationSecretInput {
  name: string;
  value: string;
  description?: string;
  expiresAt?: string | null;
  idempotencyKey: string;
  expectedRevision?: 0;
}

export interface UpdateApplicationSecretInput {
  expectedRevision: number;
  description?: string | null;
  expiresAt?: string | null;
  status?: "active" | "disabled";
}

export interface RotateApplicationSecretInput {
  expectedRevision: number;
  value: string;
  idempotencyKey: string;
  reason?: string;
}

export type ApplicationApiJsonRequest<TBody = unknown> = Omit<
  ApplicationApiRequest,
  "body"
> & {
  body?: TBody;
};

export interface RelationshipGrantFilter {
  relationCode?: string;
  subjectType?: RelationshipGrantSubjectType;
  subjectKey?: string;
  resourceCode?: string;
  resourceId?: string;
  status?: "active" | "revoked" | "expired";
}

export interface CreateRelationshipGrantInput {
  subjectType: RelationshipGrantSubjectType;
  subjectKey: string;
  relationCode: string;
  resourceCode: string;
  resourceId: string;
  operations?: string[];
  sourceCode?: string;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface CreateRoleAssignmentInput {
  userId: string;
  roleId: string;
  scopeGrants?: Array<{
    dimensionCode: string;
    values: string[];
    operations?: string[];
  }>;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface CreateDeploymentInput {
  deploymentStrategy?: DeploymentStrategy;
  appCode: string;
  environmentId?: string;
  environmentKind?: DeploymentEnvironment;
  kind?: DeploymentKind;
  packageDigest: string;
  package: AppPackage;
  idempotencyKey: string;
  requestId?: string;
}

export interface ProvisionApplicationInput {
  appCode: string;
  name: string;
  description?: string | null;
}

export interface DeployExistingVersionInput {
  appCode: string;
  appVersionId: string;
  environmentId?: string;
  environmentKind?: DeploymentEnvironment;
  idempotencyKey: string;
  requestId?: string;
}

export interface ChangeEnvironmentRuntimeStateInput {
  idempotencyKey: string;
  requestId?: string;
}

export interface UploadArtifactInput {
  appCode: string;
  digest: string;
  kind: "frontend" | "backend" | "config" | "contracts" | "manifest";
  contentType: string;
  content: BlobPart;
  metadata?: Record<string, unknown>;
}

export interface WorkflowTaskCommandInput extends WorkflowCommandInput {
  csrfToken: string;
}

export class ControlPlaneError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data?: unknown,
    readonly remote?: {
      retryable?: boolean;
      remediation?: string;
      requestId?: string;
      path?: string;
      field?: string;
    }
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

export class OpenXiangdaControlPlaneClient {
  private readonly baseUrl: string;
  private readonly fetch: FetchLike;
  private readonly artifactUploadFetch: FetchLike;

  constructor(private readonly options: ControlPlaneClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
    this.artifactUploadFetch = options.fetch || createArtifactUploadFetch();
  }

  async capabilities(): Promise<PlatformCapabilities> {
    const capabilities = await this.json<PlatformCapabilities>(
      "/openxiangda-api/v2/capabilities",
      {
        headers: {
          "X-OpenXiangda-Client-Contract-Version": OPENXIANGDA_CONTRACT_VERSION,
        },
      }
    );
    if (capabilities.contractVersion !== OPENXIANGDA_CONTRACT_VERSION) {
      const compatibility = capabilities.configurationCompatibility;
      throw new ControlPlaneError(
        409,
        "OPENXIANGDA_CONTRACT_VERSION_MISMATCH",
        `平台 contract ${capabilities.contractVersion} 与工具 ${OPENXIANGDA_CONTRACT_VERSION} 不兼容`,
        {
          pointer: "/contractVersion",
          clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
          clientSchemaVersions: {
            appPackage: CURRENT_APPLICATION_CONTRACT.appPackageSchemaVersion,
            configuration:
              CURRENT_APPLICATION_CONTRACT.configurationBundleSchemaVersion,
            contract: CURRENT_APPLICATION_CONTRACT.contractBundleSchemaVersion,
            compiler: CURRENT_APPLICATION_CONTRACT.compilerContractVersion,
          },
          platformVersion: String(capabilities.platformVersion || "unknown"),
          platformCapability: compatibility?.capability || {
            code: CONFIGURATION_COMPATIBILITY_CAPABILITY,
            version: "unknown",
            status: "unavailable",
          },
          required: { ...CURRENT_APPLICATION_CONTRACT },
          supported: (
            compatibility?.supportedApplicationContracts || []
          ).slice(0, 8),
          requiredContractVersion: OPENXIANGDA_CONTRACT_VERSION,
          supportedContractVersion: capabilities.contractVersion,
        }
      );
    }
    return capabilities;
  }

  async runtimeCapacityPreflight(appCode: string, capabilities: PlatformCapabilities, input: RuntimeCapacityPreflightRequest): Promise<RuntimeCapacityPreflight> {
    const expected = '/openxiangda-api/v2/applications/{appCode}/runtime-capacity-preflight';
    const capability = capabilities.deployment.runtimeCapacityPreflight;
    if (capability?.schemaVersion !== RUNTIME_CAPACITY_PREFLIGHT_SCHEMA || capability.endpointTemplate !== expected) {
      throw new ControlPlaneError(409, 'OPENXIANGDA_RUNTIME_CAPACITY_PREFLIGHT_REQUIRED', '目标平台尚未提供当前版本的构建前运行配额预检，请更新配套平台后重试', { pointer: '/deployment/runtimeCapacityPreflight', platformVersion: capabilities.platformVersion });
    }
    if (input.deploymentStrategy === 'maintenance-replace' && !capability.strategies?.includes('maintenance-replace')) throw new ControlPlaneError(409, 'OPENXIANGDA_MAINTENANCE_STRATEGY_REQUIRED', '目标平台未提供显式 TEST 维护替换能力');
    return await this.json<RuntimeCapacityPreflight>(expected.replace('{appCode}', encodeURIComponent(appCode)), { method: 'POST', body: JSON.stringify(input) });
  }

  async validateConfigurationCompatibility(
    appCode: string,
    capabilities: PlatformCapabilities,
    input: ConfigurationValidationRequest
  ): Promise<ConfigurationValidationResult> {
    const compatibility = capabilities.configurationCompatibility;
    const expectedTemplate =
      "/openxiangda-api/v2/applications/{appCode}/configuration-compatibility";
    if (compatibility.endpointTemplate !== expectedTemplate) {
      throw new ControlPlaneError(
        409,
        "OPENXIANGDA_CONFIGURATION_COMPATIBILITY_ENDPOINT_INVALID",
        "平台配置兼容性端点不符合当前公开契约",
        {
          pointer: "/configurationCompatibility/endpointTemplate",
          clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
          clientSchemaVersions: {
            appPackage: input.required.appPackageSchemaVersion,
            configuration: input.required.configurationBundleSchemaVersion,
            contract: input.required.contractBundleSchemaVersion,
            compiler: input.required.compilerContractVersion,
          },
          platformVersion: capabilities.platformVersion,
          platformCapability: compatibility.capability,
          required: { ...input.required },
          supported: compatibility.supportedApplicationContracts.slice(0, 8),
          requiredEndpointTemplate: expectedTemplate,
          supportedEndpointTemplate: compatibility.endpointTemplate,
        }
      );
    }
    const body = JSON.stringify(input);
    const requestBytes = new TextEncoder().encode(body).byteLength;
    if (requestBytes > compatibility.limits.requestBytes) {
      throw new ControlPlaneError(
        409,
        "OPENXIANGDA_CONFIGURATION_VALIDATION_REQUEST_TOO_LARGE",
        "配置兼容性请求超过目标平台公开上限",
        {
          pointer: "/",
          clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
          clientSchemaVersions: {
            appPackage: input.required.appPackageSchemaVersion,
            configuration: input.required.configurationBundleSchemaVersion,
            contract: input.required.contractBundleSchemaVersion,
            compiler: input.required.compilerContractVersion,
          },
          platformVersion: capabilities.platformVersion,
          platformCapability: compatibility.capability,
          required: { ...input.required },
          supported: compatibility.supportedApplicationContracts.slice(0, 8),
          requiredRequestBytes: requestBytes,
          supportedRequestBytes: compatibility.limits.requestBytes,
        }
      );
    }
    return await this.json<ConfigurationValidationResult>(
      compatibility.endpointTemplate.replace(
        "{appCode}",
        encodeURIComponent(appCode)
      ),
      { method: "POST", body }
    );
  }

  async sourceStatus(appCode: string) {
    return this.json<{ enabled: boolean; repository: ApplicationSourceRepository | null }>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/source`);
  }

  async resolveSourceRepository(repository: string) {
    return this.json<{ appCode: string; name: string; repository: ApplicationSourceRepository }>(
      `/openxiangda-api/v2/application-source/resolve?repository=${encodeURIComponent(repository)}`);
  }

  async repositoryCredential(repository: string) {
    return this.json<ApplicationSourceCredential & { appCode: string }>(
      '/openxiangda-api/v2/application-source/credential',
      { method: 'POST', body: JSON.stringify({ repository }) });
  }

  async sourceCredential(appCode: string) {
    return this.json<ApplicationSourceCredential>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/source/credential`,
      { method: 'POST', body: '{}' });
  }

  async verifySource(appCode: string, source: AppPackage['source']) {
    return this.json<{ managed: boolean; commit?: string }>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/source/verify`,
      { method: 'POST', body: JSON.stringify(source) });
  }

  async completeSourceSetup(appCode: string, input: { branch: string; commit: string }) {
    return this.json<{ repository: ApplicationSourceRepository; commit: string }>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/source/complete-setup`,
      { method: 'POST', body: JSON.stringify(input) });
  }

  async provisionApplication(
    input: ProvisionApplicationInput
  ): Promise<ProvisionedApplication> {
    return await this.json<ProvisionedApplication>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        input.appCode
      )}/provision`,
      {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
        }),
      }
    );
  }

  async createConnectedDevelopmentSession(
    appCode: string,
    input: {
      environmentKey: DeploymentEnvironment;
      manifestDigest?: string;
      configuration?: unknown;
    }
  ): Promise<ConnectedDevelopmentSessionGrant> {
    return await this.json<ConnectedDevelopmentSessionGrant>(
      this.connectedDevelopmentSessionsPath(appCode),
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async preparePreproductionAcceptanceIdentities(
    appCode: string,
    input: {
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
  ): Promise<{
    schemaVersion: "openxiangda.preproduction-acceptance-identities/v2";
    appCode: string;
    environmentKey: "preproduction";
    expiresAt: string;
    actors: Array<{
      key: string;
      userId: string;
      roleCodes: string[];
      expiresAt: string;
      loginUrl: string;
      loginUrlExpiresAt: string;
    }>;
  }> {
    return await this.json(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/acceptance/identities/prepare`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async connectedDevelopmentSession(
    appCode: string,
    sessionToken: string
  ): Promise<ConnectedDevelopmentSessionStatus> {
    return await this.json<ConnectedDevelopmentSessionStatus>(
      `${this.connectedDevelopmentSessionsPath(appCode)}/current`,
      { headers: this.connectedDevelopmentSessionHeaders(sessionToken) }
    );
  }

  async refreshConnectedDevelopmentSession(
    appCode: string,
    sessionToken: string
  ): Promise<ConnectedDevelopmentSessionStatus> {
    return await this.json<ConnectedDevelopmentSessionStatus>(
      `${this.connectedDevelopmentSessionsPath(appCode)}/current/refresh`,
      {
        method: "POST",
        body: "{}",
        headers: this.connectedDevelopmentSessionHeaders(sessionToken),
      }
    );
  }

  async revokeConnectedDevelopmentSession(
    appCode: string,
    sessionToken: string
  ): Promise<void> {
    await this.json<unknown>(
      `${this.connectedDevelopmentSessionsPath(appCode)}/current/revoke`,
      {
        method: "POST",
        body: "{}",
        headers: this.connectedDevelopmentSessionHeaders(sessionToken),
      }
    );
  }

  async oauthClients(appCode: string): Promise<{
    items: OAuthClient[];
    total: number;
    reservedScopes: string[];
    appCapabilityScopePrefix: string;
  }> {
    return await this.json(`${this.oauthPath(appCode)}/clients`);
  }

  async runtimeOAuthCredentialStatus(
    appCode: string,
    environmentKey: string
  ): Promise<RuntimeOAuthCredentialStatus> {
    return await this.json(
      `${this.oauthPath(appCode)}/runtime-credentials/${encodeURIComponent(
        environmentKey
      )}`
    );
  }

  async stageRuntimeOAuthCredentialRotation(
    appCode: string,
    environmentKey: string,
    input: {
      expectedCredentialVersion: number;
      gracePeriodSeconds?: number;
      idempotencyKey: string;
    }
  ): Promise<RuntimeOAuthCredentialStatus> {
    return await this.json(
      `${this.oauthPath(appCode)}/runtime-credentials/${encodeURIComponent(
        environmentKey
      )}/rotate`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async createOAuthClient(
    appCode: string,
    input: CreateOAuthClientInput
  ): Promise<OAuthClientSecretResult> {
    return await this.json(`${this.oauthPath(appCode)}/clients`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateOAuthClient(
    appCode: string,
    clientId: string,
    input: UpdateOAuthClientInput
  ): Promise<OAuthClient> {
    return await this.json(
      `${this.oauthPath(appCode)}/clients/${encodeURIComponent(
        clientId
      )}/update`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async rotateOAuthClientSecret(
    appCode: string,
    clientId: string,
    gracePeriodSeconds = 600
  ): Promise<OAuthClientSecretResult> {
    return await this.json(
      `${this.oauthPath(appCode)}/clients/${encodeURIComponent(
        clientId
      )}/rotate-secret`,
      {
        method: "POST",
        body: JSON.stringify({ gracePeriodSeconds }),
      }
    );
  }

  async revokeOAuthClient(
    appCode: string,
    clientId: string
  ): Promise<OAuthClient> {
    return await this.json(
      `${this.oauthPath(appCode)}/clients/${encodeURIComponent(
        clientId
      )}/revoke`,
      { method: "POST", body: "{}" }
    );
  }

  async oauthAuditEvents(
    appCode: string,
    input: { environmentKey?: string; clientId?: string; limit?: number } = {}
  ): Promise<{ items: OAuthAuditEvent[]; limit: number }> {
    const query = new URLSearchParams();
    if (input.environmentKey) query.set("environmentKey", input.environmentKey);
    if (input.clientId) query.set("clientId", input.clientId);
    if (input.limit) query.set("limit", String(input.limit));
    const suffix = query.size ? `?${query}` : "";
    return await this.json(`${this.oauthPath(appCode)}/audit-events${suffix}`);
  }

  async oauthApplicationPrincipal(
    appCode: string
  ): Promise<OAuthApplicationPrincipal> {
    return await this.json(`${this.oauthPath(appCode)}/principal`);
  }

  async exchangeOAuthClientCredentials(input: {
    clientId: string;
    clientSecret: string;
    scope?: string[];
  }): Promise<OAuthTokenResponse> {
    const response = await this.fetch(
      `${this.baseUrl}/openxiangda-api/v2/oauth2/token`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${this.basicCredentials(
            input.clientId,
            input.clientSecret
          )}`,
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          ...(input.scope?.length ? { scope: input.scope.join(" ") } : {}),
        }),
      }
    );
    let data: OAuthTokenResponse & {
      error?: string;
      error_description?: string;
    };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new ControlPlaneError(
        response.status,
        "OAUTH2_TOKEN_RESPONSE_INVALID",
        "OAuth2 token 端点返回的不是有效 JSON"
      );
    }
    if (!response.ok || data.error) {
      throw new ControlPlaneError(
        response.status,
        data.error || "OAUTH2_TOKEN_REQUEST_FAILED",
        data.error_description || `OAuth2 token 请求失败: ${response.status}`
      );
    }
    return data;
  }

  async applicationApiResponse(
    appCode: string,
    environmentKey: string,
    runtimePath: string,
    input: ApplicationApiRequest
  ): Promise<Response> {
    const path = this.applicationApiPath(
      appCode,
      environmentKey,
      runtimePath,
      input.query
    );
    const { query: _query, perspectiveCode: _perspectiveCode, ...init } = input;
    const token = await this.accessToken(false);
    return await this.fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: init.credentials || this.options.credentials || "include",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...this.perspectiveHeaders(input),
        ...(init.headers || {}),
      },
    });
  }

  async applicationApiJson<TResponse = unknown, TBody = unknown>(
    appCode: string,
    environmentKey: string,
    runtimePath: string,
    input: ApplicationApiJsonRequest<TBody>
  ): Promise<TResponse> {
    const { body, ...request } = input;
    const response = await this.applicationApiResponse(
      appCode,
      environmentKey,
      runtimePath,
      {
        ...request,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(input.headers || {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }
    );
    const text = await response.text();
    let data: any = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new ControlPlaneError(
          response.status,
          "APPLICATION_API_RESPONSE_INVALID",
          "应用后端返回的不是有效 JSON",
          text
        );
      }
    }
    if (!response.ok) {
      throw new ControlPlaneError(
        response.status,
        String(
          data?.errorCode || data?.code || "APPLICATION_API_REQUEST_FAILED"
        ),
        String(
          data?.message || data?.error || `应用后端请求失败: ${response.status}`
        ),
        data
      );
    }
    return data as TResponse;
  }

  async artifactStatus(appCode: string, digest: string) {
    try {
      return await this.request<{ digest: string; kind: string; contentType: string; sizeBytes: number }>(
        `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/artifacts/${digest}`, { method: 'GET' }
      );
    } catch (error) {
      if (error instanceof ControlPlaneError && error.status === 404 && error.code === 'DELIVERY_ARTIFACT_NOT_FOUND') return null;
      throw error;
    }
  }

  async beginBackendImage(appCode: string, input: { digest: string; manifest: string }) {
    return this.json<BackendImageUploadReceipt>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/backend-images`,
      { method: 'POST', body: JSON.stringify(input), signal: AbortSignal.timeout(90000) });
  }

  async uploadBackendImageChunk(appCode: string, digest: string, blobDigest: string, offset: number, content: Uint8Array) {
    return this.request<{ offset: number; complete: boolean }>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/backend-images/${encodeURIComponent(digest)}/blobs/${encodeURIComponent(blobDigest)}?offset=${offset}`,
      { method: 'POST', body: new Blob([Uint8Array.from(content)]),
        headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.timeout(90000) },
      this.artifactUploadFetch);
  }

  async completeBackendImage(appCode: string, digest: string) {
    return this.json<BackendImageUploadReceipt>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/backend-images/${encodeURIComponent(digest)}/complete`,
      { method: 'POST', body: '{}', signal: AbortSignal.timeout(90000) });
  }

  async uploadArtifact(input: UploadArtifactInput) {
    const params = new URLSearchParams({
      kind: input.kind,
      contentType: input.contentType,
      metadata: JSON.stringify(input.metadata || {}),
    });
    const form = new FormData();
    form.append(
      "file",
      new Blob([input.content], { type: input.contentType }),
      input.digest
    );
    try {
      return await this.request<Record<string, unknown>>(
        `/openxiangda-api/v2/applications/${encodeURIComponent(
          input.appCode
        )}/artifacts/${input.digest}?${params}`,
        { method: "POST", body: form },
        this.artifactUploadFetch
      );
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      const causeCode = String(
        (error as any)?.cause?.code || (error as any)?.code || ""
      ).trim();
      throw new ControlPlaneError(
        503,
        "OPENXIANGDA_ARTIFACT_UPLOAD_FAILED",
        "Application v2 制品上传连接中断",
        {
          digest: input.digest,
          kind: input.kind,
          ...(causeCode ? { causeCode } : {}),
        },
        {
          retryable: true,
          remediation:
            "重新运行 openxiangda deploy；已完成的内容寻址制品会自动去重",
        }
      );
    }
  }

  async createDeployment(input: CreateDeploymentInput): Promise<DeploymentRun> {
    return await this.json<DeploymentRun>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        input.appCode
      )}/deployments`,
      {
        method: "POST",
        body: JSON.stringify({
          environmentId: input.environmentId,
          environmentKind: input.environmentKind,
          kind: input.kind || "deploy",
          ...(input.deploymentStrategy ? { deploymentStrategy: input.deploymentStrategy } : {}),
          packageDigest: input.packageDigest,
          package: input.package,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId,
        }),
      }
    );
  }

  async deployment(appCode: string, deploymentId: string) {
    return await this.json<DeploymentRun>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/deployments/${encodeURIComponent(deploymentId)}`
    );
  }

  async deployments(appCode: string, limit = 20) {
    return await this.json<{ items: DeploymentRun[]; total: number }>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/deployments?limit=${Math.min(Math.max(Number(limit) || 20, 1), 100)}`
    );
  }

  async applicationEnvironments(
    appCode: string
  ): Promise<ApplicationEnvironmentList> {
    return await this.json<ApplicationEnvironmentList>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/environments`
    );
  }

  async startEnvironment(
    appCode: string,
    environmentKey: DeploymentEnvironment,
    input: ChangeEnvironmentRuntimeStateInput
  ): Promise<DeploymentRun> {
    return await this.changeEnvironmentRuntimeState(
      appCode,
      environmentKey,
      "start",
      input
    );
  }

  async stopEnvironment(
    appCode: string,
    environmentKey: DeploymentEnvironment,
    input: ChangeEnvironmentRuntimeStateInput
  ): Promise<DeploymentRun> {
    return await this.changeEnvironmentRuntimeState(
      appCode,
      environmentKey,
      "stop",
      input
    );
  }

  async retryDeployment(appCode: string, deploymentId: string) {
    return await this.json<DeploymentRun>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/deployments/${encodeURIComponent(deploymentId)}/retry`,
      { method: "POST", body: "{}" }
    );
  }

  async cancelDeployment(appCode: string, deploymentId: string) {
    return await this.json<DeploymentRun>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/deployments/${encodeURIComponent(deploymentId)}/cancel`,
      { method: "POST", body: "{}" }
    );
  }

  async promote(input: DeployExistingVersionInput) {
    return await this.deployExistingVersion(input, "promotions");
  }

  async redeploy(input: DeployExistingVersionInput) {
    return await this.deployExistingVersion(input, "redeployments");
  }

  async rollback(input: DeployExistingVersionInput) {
    return await this.deployExistingVersion(input, "rollbacks");
  }

  async appVersions(appCode: string, limit = 30) {
    return await this.json<{ items: AppVersion[]; total: number }>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/versions?limit=${Math.min(Math.max(Number(limit) || 30, 1), 100)}`
    );
  }

  async productionPromotionPreflight(appCode: string, sourceDeploymentId: string) {
    return this.json<ProductionPromotionPreflight>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/deployments/${encodeURIComponent(sourceDeploymentId)}/promotion-preflight`,
      { method: 'POST', body: '{}' }
    );
  }

  async environmentHead(appCode: string, environmentKey: string) {
    return await this.json<EnvironmentHead>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/environment-heads/${encodeURIComponent(environmentKey)}`
    );
  }

  private async changeEnvironmentRuntimeState(
    appCode: string,
    environmentKey: DeploymentEnvironment,
    action: "start" | "stop",
    input: ChangeEnvironmentRuntimeStateInput
  ): Promise<DeploymentRun> {
    return await this.json<DeploymentRun>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/environments/${encodeURIComponent(environmentKey)}/${action}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async applicationSecrets(appCode: string, environmentKey: string) {
    return await this.json<{ items: ApplicationSecret[]; total: number }>(
      this.applicationSecretsPath(appCode, environmentKey)
    );
  }

  async applicationSecret(
    appCode: string,
    environmentKey: string,
    name: string
  ) {
    return await this.json<ApplicationSecret>(
      `${this.applicationSecretsPath(appCode, environmentKey)}/${encodeURIComponent(
        name
      )}`
    );
  }

  async createApplicationSecret(
    appCode: string,
    environmentKey: string,
    input: CreateApplicationSecretInput
  ) {
    return await this.json<ApplicationSecret>(
      this.applicationSecretsPath(appCode, environmentKey),
      { method: "POST", body: JSON.stringify({ expectedRevision: 0, ...input }) }
    );
  }

  async updateApplicationSecret(
    appCode: string,
    environmentKey: string,
    name: string,
    input: UpdateApplicationSecretInput
  ) {
    return await this.json<ApplicationSecret>(
      `${this.applicationSecretsPath(appCode, environmentKey)}/${encodeURIComponent(
        name
      )}`,
      { method: "PATCH", body: JSON.stringify(input) }
    );
  }

  async rotateApplicationSecret(
    appCode: string,
    environmentKey: string,
    name: string,
    input: RotateApplicationSecretInput
  ) {
    return await this.json<ApplicationSecret>(
      `${this.applicationSecretsPath(appCode, environmentKey)}/${encodeURIComponent(
        name
      )}/rotate`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async deleteApplicationSecret(
    appCode: string,
    environmentKey: string,
    name: string,
    input: { expectedRevision: number; reason?: string }
  ) {
    return await this.json<ApplicationSecret>(
      `${this.applicationSecretsPath(appCode, environmentKey)}/${encodeURIComponent(
        name
      )}`,
      { method: "DELETE", body: JSON.stringify(input) }
    );
  }

  async applicationSecretAuditEvents(
    appCode: string,
    environmentKey: string,
    name: string,
    limit = 100
  ) {
    return await this.json<{ items: ApplicationSecretAuditEvent[] }>(
      `${this.applicationSecretsPath(appCode, environmentKey)}/${encodeURIComponent(
        name
      )}/audit?limit=${Math.min(Math.max(Number(limit) || 100, 1), 500)}`
    );
  }

  async eventSubscriptions(appCode: string) {
    return await this.json<{ items: EventSubscription[] }>(
      `${this.eventsPath(appCode)}/subscriptions`
    );
  }

  async setEventSubscriptionStatus(
    appCode: string,
    subscriptionId: string,
    input: { expectedRevision: number; status: "active" | "paused" }
  ): Promise<EventSubscription> {
    return await this.json<EventSubscription>(
      `${this.eventsPath(appCode)}/subscriptions/${encodeURIComponent(
        subscriptionId
      )}/status`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async eventDeliveries(appCode: string, limit = 100) {
    return await this.json<{ items: EventDelivery[] }>(
      `${this.eventsPath(appCode)}/deliveries?limit=${Math.min(
        Math.max(Number(limit) || 100, 1),
        500
      )}`
    );
  }

  async replayEventDelivery(
    appCode: string,
    deliveryId: string,
    idempotencyKey?: string
  ) {
    return await this.json<EventDelivery>(
      `${this.eventsPath(appCode)}/deliveries/${encodeURIComponent(
        deliveryId
      )}/replay`,
      {
        method: "POST",
        body: JSON.stringify(
          idempotencyKey ? { idempotencyKey } : {}
        ),
      }
    );
  }

  async timerSubscriptions(appCode: string) {
    return await this.json<{ items: TimerSubscription[] }>(
      `${this.eventsPath(appCode)}/timers`
    );
  }

  async setTimerSubscriptionStatus(
    appCode: string,
    timerId: string,
    input: { expectedRevision: number; status: "active" | "paused" }
  ): Promise<TimerSubscription> {
    return await this.json<TimerSubscription>(
      `${this.eventsPath(appCode)}/timers/${encodeURIComponent(
        timerId
      )}/status`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async dateTriggers(appCode: string) {
    return await this.json<{ items: DateTrigger[] }>(
      `${this.eventsPath(appCode)}/date-triggers`
    );
  }

  async setDateTriggerStatus(
    appCode: string,
    triggerId: string,
    input: { expectedRevision: number; status: "active" | "paused" }
  ): Promise<DateTrigger> {
    return await this.json<DateTrigger>(
      `${this.eventsPath(appCode)}/date-triggers/${encodeURIComponent(
        triggerId
      )}/status`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async registerWorkflowDefinition(
    appCode: string,
    version: number,
    definition: WorkflowDefinition
  ) {
    return await this.json<Record<string, unknown>>(
      `${this.workflowPath(appCode)}/definitions`,
      {
        method: "POST",
        body: JSON.stringify({ version, definition }),
      }
    );
  }

  async registerWorkflowBinding(
    appCode: string,
    version: number,
    binding: WorkflowBinding
  ) {
    return await this.json<Record<string, unknown>>(
      `${this.workflowPath(appCode)}/bindings`,
      {
        method: "POST",
        body: JSON.stringify({ version, binding }),
      }
    );
  }

  async applyWorkflowAssigneeProvider(
    appCode: string,
    input: {
      environmentKey: string;
      code: string;
      endpointPath: string;
      timeoutMs?: number;
      status?: "active" | "paused";
      expectedRevision?: number;
    }
  ): Promise<WorkflowAssigneeProvider> {
    return await this.json<WorkflowAssigneeProvider>(
      `${this.workflowPath(appCode)}/assignee-providers`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async workflowAssigneeProviders(
    appCode: string,
    environmentKey = "production"
  ): Promise<{ items: WorkflowAssigneeProvider[] }> {
    return await this.json<{ items: WorkflowAssigneeProvider[] }>(
      `${this.workflowPath(
        appCode
      )}/assignee-providers?environmentKey=${encodeURIComponent(
        environmentKey
      )}`
    );
  }

  async rotateWorkflowAssigneeProviderSecret(
    appCode: string,
    providerCode: string,
    input: {
      environmentKey: string;
      expectedRevision: number;
      idempotencyKey: string;
    }
  ): Promise<WorkflowAssigneeProvider> {
    return await this.json<WorkflowAssigneeProvider>(
      `${this.workflowPath(appCode)}/assignee-providers/${encodeURIComponent(
        providerCode
      )}/rotate-secret`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async activateWorkflow(
    appCode: string,
    workflowCode: string,
    input: {
      environmentKey: string;
      definitionVersion: number;
      bindingVersion: number;
      expectedRevision?: number;
    }
  ) {
    return await this.json<Record<string, unknown>>(
      `${this.workflowPath(appCode)}/definitions/${encodeURIComponent(
        workflowCode
      )}/activate`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async createWorkflowDelegation(
    appCode: string,
    input: {
      environmentKey?: string;
      workflowCode?: string;
      delegatorRoleSubjectKey: string;
      delegateUserId: string;
      delegateRoleSubjectKey: string;
      validFrom: string;
      validTo: string;
      reason: string;
    }
  ): Promise<WorkflowDelegation> {
    return await this.json<WorkflowDelegation>(
      `${this.workflowPath(appCode)}/delegations`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async workflowDelegationTargets(
    appCode: string,
    userId: string,
    environmentKey?: string
  ): Promise<{ items: WorkflowDelegationTarget[]; total: number }> {
    return await this.json<{ items: WorkflowDelegationTarget[]; total: number }>(
      `${this.workflowPath(appCode)}/delegations/targets?userId=${encodeURIComponent(
        userId
      )}${environmentKey ? `&environmentKey=${encodeURIComponent(environmentKey)}` : ""}`
    );
  }

  async workflowDelegations(
    appCode: string,
    input: { all?: boolean; environmentKey?: string } = {}
  ): Promise<{ items: WorkflowDelegation[]; total: number }> {
    return await this.json<{ items: WorkflowDelegation[]; total: number }>(
      `${this.workflowPath(appCode)}/delegations?all=${input.all === true}${
        input.environmentKey
          ? `&environmentKey=${encodeURIComponent(input.environmentKey)}`
          : ""
      }`
    );
  }

  async revokeWorkflowDelegation(
    appCode: string,
    delegationId: string,
    environmentKey?: string
  ): Promise<WorkflowDelegation> {
    return await this.json<WorkflowDelegation>(
      `${this.workflowPath(appCode)}/delegations/${encodeURIComponent(
        delegationId
      )}/revoke${
        environmentKey
          ? `?environmentKey=${encodeURIComponent(environmentKey)}`
          : ""
      }`,
      {
        method: "POST",
      }
    );
  }

  async workflowTaskSurface(
    appCode: string,
    taskId: string,
    csrfToken: string
  ): Promise<WorkflowSurface> {
    return await this.json<WorkflowSurface>(
      `${this.workflowPath(appCode)}/tasks/${encodeURIComponent(
        taskId
      )}/surface`,
      { headers: { "X-OpenXiangda-CSRF-Token": csrfToken } }
    );
  }

  async workflowInstanceSurface(
    appCode: string,
    instanceId: string,
    csrfToken: string
  ): Promise<WorkflowSurface> {
    return await this.json<WorkflowSurface>(
      `${this.workflowPath(appCode)}/instances/${encodeURIComponent(
        instanceId
      )}/surface`,
      { headers: { "X-OpenXiangda-CSRF-Token": csrfToken } }
    );
  }

  async executeWorkflowTaskCommand(
    appCode: string,
    taskId: string,
    command: WorkflowCommand,
    input: WorkflowTaskCommandInput
  ): Promise<WorkflowCommandResult> {
    const { csrfToken, ...request } = input;
    return await this.json<WorkflowCommandResult>(
      `${this.workflowPath(appCode)}/tasks/${encodeURIComponent(
        taskId
      )}/commands/${encodeURIComponent(command)}`,
      {
        method: "POST",
        headers: { "X-OpenXiangda-CSRF-Token": csrfToken },
        body: JSON.stringify(request),
      }
    );
  }

  async executeWorkflowInstanceCommand(
    appCode: string,
    instanceId: string,
    command: "withdraw" | "terminate",
    input: WorkflowTaskCommandInput
  ): Promise<WorkflowCommandResult> {
    const { csrfToken, ...request } = input;
    return await this.json<WorkflowCommandResult>(
      `${this.workflowPath(appCode)}/instances/${encodeURIComponent(
        instanceId
      )}/commands/${command}`,
      {
        method: "POST",
        headers: { "X-OpenXiangda-CSRF-Token": csrfToken },
        body: JSON.stringify(request),
      }
    );
  }

  async workflowAssignmentExplain(
    appCode: string,
    taskId: string
  ) {
    return await this.json<Record<string, unknown>>(
      `${this.workflowPath(appCode)}/tasks/${encodeURIComponent(
        taskId
      )}/assignment-explain`
    );
  }

  async workflowTimeline(
    appCode: string,
    instanceId: string
  ) {
    return await this.json<WorkflowTimeline>(
      `${this.workflowPath(appCode)}/instances/${encodeURIComponent(
        instanceId
      )}/timeline`
    );
  }

  async workflowWorkCenter(
    appCode: string,
    input: {
      status?: "pending" | "completed";
      limit?: number;
      environmentKey?: string;
    } = {}
  ) {
    const query = new URLSearchParams({
      status: input.status || "pending",
      limit: String(Math.min(Math.max(Number(input.limit) || 50, 1), 200)),
      ...(input.environmentKey ? { environmentKey: input.environmentKey } : {}),
    });
    return await this.json<{ items: WorkflowWorkCenterItem[] }>(
      `${this.workflowPath(appCode)}/work-center/items?${query}`
    );
  }

  async workflowDiagnostics(
    appCode: string,
    limit = 100
  ): Promise<{ items: Diagnostic[]; total: number }> {
    return await this.json<{ items: Diagnostic[]; total: number }>(
      `${this.workflowPath(appCode)}/diagnostics?limit=${Math.min(
        Math.max(Number(limit) || 100, 1),
        500
      )}`
    );
  }

  async applicationAdministrationContext(appCode: string, environmentKey: DeploymentEnvironment): Promise<ApplicationAdministrationContext> {
    return await this.json<ApplicationAdministrationContext>(
      `${this.administrationPath(appCode)}/context?${this.query({ environmentKey })}`
    );
  }

  async workflowNodeConfigurations(appCode: string, workflowCode: string, environmentKey: DeploymentEnvironment): Promise<WorkflowNodeConfigurations> {
    return await this.json<WorkflowNodeConfigurations>(
      `${this.administrationPath(appCode)}/workflows/${encodeURIComponent(workflowCode)}/node-configurations?${this.query({ environmentKey })}`
    );
  }

  async nativeAuthorizationCatalog(
    appCode: string,
    input: { environmentKey?: DeploymentEnvironment } = {}
  ): Promise<NativeAuthorizationManagementCatalog> {
    const query = this.query({
      environmentKey: input.environmentKey || "preproduction",
    });
    return await this.json<NativeAuthorizationManagementCatalog>(
      `${this.nativeAuthzManagementPath(appCode)}/catalog?${query}`
    );
  }

  async nativeScopeValues(
    appCode: string,
    input: {
      environmentKey?: DeploymentEnvironment;
      dimensionCode: string;
      keyword?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<NativeScopeValuePage> {
    return await this.json<NativeScopeValuePage>(
      `${this.nativeAuthzManagementPath(appCode)}/scope-values?${this.query({
        ...input,
        environmentKey: input.environmentKey || "preproduction",
      })}`
    );
  }

  async nativeRoleMemberships(
    appCode: string,
    input: NativeAuthorizationPageInput & {
      userId?: string;
      roleCode?: string;
      keyword?: string;
    } = {}
  ): Promise<NativeRoleMembershipPage> {
    return await this.json<NativeRoleMembershipPage>(
      `${this.nativeAuthzManagementPath(appCode)}/memberships?${this.query({
        ...input,
        environmentKey: input.environmentKey || "preproduction",
      })}`
    );
  }

  async createNativeRoleMembership(
    appCode: string,
    input: CreateNativeRoleMembershipInput
  ): Promise<NativeRoleMembershipMutationResult> {
    return await this.json(
      `${this.nativeAuthzManagementPath(appCode)}/memberships`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async updateNativeRoleMembership(
    appCode: string,
    membershipId: string,
    input: UpdateNativeRoleMembershipInput
  ): Promise<NativeRoleMembershipMutationResult> {
    return await this.json(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/memberships/${encodeURIComponent(membershipId)}/update`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async revokeNativeRoleMembership(
    appCode: string,
    membershipId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      expectedRevision: number;
      reason: string;
    }
  ): Promise<NativeRoleMembershipMutationResult> {
    return await this.json(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/memberships/${encodeURIComponent(membershipId)}/revoke`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async nativeRoleManagementGrants(
    appCode: string,
    input: {
      environmentKey?: DeploymentEnvironment;
      status?: "active" | "revoked";
      subjectRoleCode?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<NativeRoleManagementGrantPage> {
    return await this.json<NativeRoleManagementGrantPage>(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/role-management-grants?${this.query({
        ...input,
        environmentKey: input.environmentKey || "preproduction",
      })}`
    );
  }

  async createNativeRoleManagementGrant(
    appCode: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      reason: string;
      subjectRoleCode: string;
      manageAllRoles: boolean;
      managedRoleCodes: string[];
      actions: NativeRoleManagementAction[];
    }
  ): Promise<NativeRoleManagementGrantMutationResult> {
    return await this.json(
      `${this.nativeAuthzManagementPath(appCode)}/role-management-grants`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async updateNativeRoleManagementGrant(
    appCode: string,
    grantId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      reason: string;
      expectedRevision: number;
      subjectRoleCode: string;
      manageAllRoles: boolean;
      managedRoleCodes: string[];
      actions: NativeRoleManagementAction[];
    }
  ): Promise<NativeRoleManagementGrantMutationResult> {
    return await this.json(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/role-management-grants/${encodeURIComponent(grantId)}/update`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async revokeNativeRoleManagementGrant(
    appCode: string,
    grantId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      reason: string;
      expectedRevision: number;
    }
  ): Promise<NativeRoleManagementGrantMutationResult> {
    return await this.json(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/role-management-grants/${encodeURIComponent(grantId)}/revoke`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async nativeAuthorizationMutationReceipt(
    appCode: string,
    operationId: string
  ): Promise<NativeAuthorizationMutationReceipt> {
    return await this.json<NativeAuthorizationMutationReceipt>(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/mutation-receipts/${encodeURIComponent(operationId)}`
    );
  }

  async nativeSuperAdmins(
    appCode: string,
    input: {
      environmentKey?: DeploymentEnvironment;
      status?: "active" | "revoked";
      userId?: string;
      keyword?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<NativeSuperAdminGrantPage> {
    return await this.json<NativeSuperAdminGrantPage>(
      `${this.nativeAuthzManagementPath(appCode)}/super-admins?${this.query(
        { ...input, environmentKey: input.environmentKey || "preproduction" }
      )}`
    );
  }

  async grantNativeSuperAdmin(
    appCode: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      userId: string;
    }
  ): Promise<{
    grant: NativeSuperAdminGrant;
    environmentSubjectVersions: Array<Record<string, unknown>>;
    revokedSessionCount: number;
  }> {
    return await this.json(
      `${this.nativeAuthzManagementPath(appCode)}/super-admins`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async revokeNativeSuperAdmin(
    appCode: string,
    grantId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      expectedRevision: number;
    }
  ): Promise<{
    grant: NativeSuperAdminGrant;
    environmentSubjectVersions: Array<Record<string, unknown>>;
    revokedSessionCount: number;
  }> {
    return await this.json(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/super-admins/${encodeURIComponent(grantId)}/revoke`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async nativeRelationshipGrants(
    appCode: string,
    input: NativeRelationshipGrantFilter = {}
  ): Promise<NativeRelationshipGrantPage> {
    return await this.json<NativeRelationshipGrantPage>(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/relationship-grants?${this.query({
        ...input,
        environmentKey: input.environmentKey || "preproduction",
      })}`
    );
  }

  async createNativeRelationshipGrant(
    appCode: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      subjectType: "user" | "role_membership";
      subjectKey: string;
      relationCode: string;
      resourceCode: string;
      resourceId: string;
      operations?: string[];
      sourceCode?: string;
      validFrom?: string | null;
      validTo?: string | null;
    }
  ): Promise<{ grant: NativeRelationshipGrant }> {
    return await this.json(
      `${this.nativeAuthzManagementPath(appCode)}/relationship-grants`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async updateNativeRelationshipGrant(
    appCode: string,
    grantId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      expectedRevision: number;
      operations?: string[];
      validFrom?: string | null;
      validTo?: string | null;
    }
  ): Promise<{ grant: NativeRelationshipGrant }> {
    return await this.json(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/relationship-grants/${encodeURIComponent(grantId)}/update`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async revokeNativeRelationshipGrant(
    appCode: string,
    grantId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
      expectedRevision: number;
    }
  ): Promise<{ grant: NativeRelationshipGrant }> {
    return await this.json(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/relationship-grants/${encodeURIComponent(grantId)}/revoke`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async nativeAuthorizationProjectionHealth(
    appCode: string,
    environmentKey: DeploymentEnvironment = "preproduction"
  ): Promise<NativeAuthorizationProjectionHealth> {
    return await this.json<NativeAuthorizationProjectionHealth>(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/projections/health?${this.query({ environmentKey })}`
    );
  }

  async rebuildNativeAuthorizationProjections(
    appCode: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
    }
  ): Promise<NativeAuthorizationProjectionMutationResult> {
    return await this.json<NativeAuthorizationProjectionMutationResult>(
      `${this.nativeAuthzManagementPath(appCode)}/projections/rebuild`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async recoverNativeAuthorizationProjection(
    appCode: string,
    jobId: string,
    input: {
      environmentKey: DeploymentEnvironment;
      operationId: string;
    }
  ): Promise<NativeAuthorizationProjectionMutationResult> {
    return await this.json<NativeAuthorizationProjectionMutationResult>(
      `${this.nativeAuthzManagementPath(
        appCode
      )}/projections/jobs/${encodeURIComponent(jobId)}/recover`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async myRoleAssignments(
    appCode: string
  ): Promise<{ items: RoleAssignment[]; total: number }> {
    return await this.json<{ items: RoleAssignment[]; total: number }>(
      `${this.authzPath(appCode)}/assignments/me`
    );
  }

  async applicationRoles(
    appCode: string
  ): Promise<{ items: ApplicationRole[]; total: number }> {
    return await this.json<{ items: ApplicationRole[]; total: number }>(
      `${this.authzPath(appCode)}/roles`
    );
  }

  async createRoleAssignment(
    appCode: string,
    input: CreateRoleAssignmentInput
  ): Promise<RoleAssignment> {
    return await this.json<RoleAssignment>(
      `${this.authzPath(appCode)}/assignments`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async updateRoleAssignment(
    appCode: string,
    assignmentId: string,
    input: {
      expectedRevision: number;
      scopeGrants?: CreateRoleAssignmentInput["scopeGrants"];
      validFrom?: string | null;
      validTo?: string | null;
    }
  ): Promise<RoleAssignment> {
    return await this.json<RoleAssignment>(
      `${this.authzPath(appCode)}/assignments/${encodeURIComponent(
        assignmentId
      )}/update`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async revokeRoleAssignment(
    appCode: string,
    assignmentId: string,
    expectedRevision: number
  ): Promise<RoleAssignment> {
    return await this.json<RoleAssignment>(
      `${this.authzPath(appCode)}/assignments/${encodeURIComponent(
        assignmentId
      )}/revoke`,
      { method: "POST", body: JSON.stringify({ expectedRevision }) }
    );
  }

  async searchDirectoryEntries(
    appCode: string,
    kind: DirectoryEntryKind,
    input: { keyword: string; limit?: number }
  ): Promise<DirectorySearchResult> {
    const query = new URLSearchParams({
      keyword: input.keyword.trim(),
      limit: String(Math.min(Math.max(Number(input.limit) || 20, 1), 50)),
    });
    return await this.json<DirectorySearchResult>(
      `${this.directoryPath(appCode)}/${kind}s?${query}`
    );
  }

  async browseDepartmentEntries(
    appCode: string,
    input: { parentId?: string; offset?: number; limit?: number }
  ): Promise<DirectorySearchResult> {
    const query = new URLSearchParams({
      offset: String(Math.max(Number(input.offset) || 0, 0)),
      limit: String(Math.min(Math.max(Number(input.limit) || 100, 1), 100)),
    });
    const parentId = String(input.parentId || "").trim();
    if (parentId) query.set("parentId", parentId);
    return await this.json<DirectorySearchResult>(
      `${this.directoryPath(appCode)}/departments/tree?${query}`
    );
  }

  async browseDepartmentUserEntries(
    appCode: string,
    input: { departmentId: string; page?: number; limit?: number }
  ): Promise<DirectorySearchResult> {
    const departmentId = String(input.departmentId || "").trim();
    if (!departmentId) throw new Error("departmentId is required");
    const query = new URLSearchParams({
      page: String(Math.max(Number(input.page) || 1, 1)),
      limit: String(Math.min(Math.max(Number(input.limit) || 50, 1), 100)),
    });
    return await this.json<DirectorySearchResult>(
      `${this.directoryPath(appCode)}/departments/${encodeURIComponent(
        departmentId
      )}/users?${query}`
    );
  }

  async resolveDirectoryEntries(
    appCode: string,
    input: DirectoryResolveRequest
  ): Promise<DirectorySearchResult> {
    return await this.json<DirectorySearchResult>(
      `${this.directoryPath(appCode)}/resolve`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  async applyDataResource(
    resource: DataResource,
    input: { expectedRevision?: number } = {}
  ): Promise<DataResource> {
    return await this.json<DataResource>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        resource.appCode
      )}/data-resources/${encodeURIComponent(resource.code)}/apply`,
      {
        method: "POST",
        body: JSON.stringify({
          name: resource.name,
          schema: resource.schema,
          capabilities: resource.capabilities,
          dataPolicyCode: resource.dataPolicyCode,
          fieldPolicies: resource.fieldPolicies,
          expectedRevision: input.expectedRevision,
        }),
      }
    );
  }

  async relationshipGrants(
    appCode: string,
    filter: RelationshipGrantFilter = {}
  ): Promise<{ items: RelationshipGrant[]; total: number }> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined && value !== "") query.set(key, value);
    }
    const suffix = query.size ? `?${query.toString()}` : "";
    return await this.json<{ items: RelationshipGrant[]; total: number }>(
      `${this.authzPath(appCode)}/relationship-grants${suffix}`
    );
  }

  async createRelationshipGrant(
    appCode: string,
    input: CreateRelationshipGrantInput
  ): Promise<RelationshipGrant> {
    return await this.json<RelationshipGrant>(
      `${this.authzPath(appCode)}/relationship-grants`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async updateRelationshipGrant(
    appCode: string,
    grantId: string,
    input: {
      expectedRevision: number;
      operations?: string[];
      validFrom?: string | null;
      validTo?: string | null;
    }
  ): Promise<RelationshipGrant> {
    return await this.json<RelationshipGrant>(
      `${this.authzPath(appCode)}/relationship-grants/${encodeURIComponent(
        grantId
      )}/update`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  async revokeRelationshipGrant(
    appCode: string,
    grantId: string,
    expectedRevision: number
  ): Promise<RelationshipGrant> {
    return await this.json<RelationshipGrant>(
      `${this.authzPath(appCode)}/relationship-grants/${encodeURIComponent(
        grantId
      )}/revoke`,
      { method: "POST", body: JSON.stringify({ expectedRevision }) }
    );
  }

  async queryData<T extends Record<string, unknown>>(
    appCode: string,
    resourceCode: string,
    query: DataQuery,
    request: PerspectiveRequest = {}
  ): Promise<DataPage<T>> {
    return await this.json<DataPage<T>>(
      this.dataPath(appCode, resourceCode, "query"),
      {
        method: "POST",
        body: JSON.stringify(query),
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async chinaDivisions(parentAdcode?: string): Promise<ChinaDivisionListItem[]> {
    const query = new URLSearchParams();
    if (parentAdcode) query.set("parentAdcode", parentAdcode);
    const suffix = query.size ? `?${query}` : "";
    return await this.json<ChinaDivisionListItem[]>(`/china-divisions/${suffix}`);
  }

  async getData<T extends Record<string, unknown>>(
    appCode: string,
    resourceCode: string,
    id: string,
    request: PerspectiveRequest = {}
  ): Promise<DataRecord<T>> {
    return await this.json<DataRecord<T>>(
      this.dataPath(appCode, resourceCode, `records/${encodeURIComponent(id)}`),
      { headers: this.perspectiveHeaders(request) }
    );
  }

  async aggregateData<T extends Record<string, unknown>>(
    appCode: string,
    resourceCode: string,
    query: DataAggregateQuery,
    request: PerspectiveRequest = {}
  ): Promise<DataAggregatePage<T>> {
    return await this.json<DataAggregatePage<T>>(
      this.dataPath(appCode, resourceCode, "aggregate"),
      {
        method: "POST",
        body: JSON.stringify(query),
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async dataAudit(
    appCode: string,
    resourceCode: string,
    id: string,
    input: { limit?: number; offset?: number } = {},
    request: PerspectiveRequest = {}
  ): Promise<DataAuditPage> {
    const query = new URLSearchParams();
    if (input.limit !== undefined) query.set("limit", String(input.limit));
    if (input.offset !== undefined) query.set("offset", String(input.offset));
    const suffix = query.size ? `?${query}` : "";
    return await this.json<DataAuditPage>(
      `${this.dataPath(
        appCode,
        resourceCode,
        `records/${encodeURIComponent(id)}/audit`
      )}${suffix}`,
      { headers: this.perspectiveHeaders(request) }
    );
  }

  async initiateDataFileUpload(
    appCode: string,
    resourceCode: string,
    input: {
      fieldCode: string;
      fileName: string;
      fileSize: number;
      contentType?: string;
      recordId?: string;
    },
    request: PerspectiveRequest = {}
  ): Promise<DataFileUploadPlan> {
    return await this.json<DataFileUploadPlan>(
      this.dataPath(appCode, resourceCode, "files/uploads/initiate"),
      {
        method: "POST",
        body: JSON.stringify(input),
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async completeDataFileUpload(
    appCode: string,
    resourceCode: string,
    fileId: string,
    request: PerspectiveRequest = {}
  ): Promise<DataFileRef> {
    return await this.json<DataFileRef>(
      this.dataPath(
        appCode,
        resourceCode,
        `files/${encodeURIComponent(fileId)}/complete`
      ),
      {
        method: "POST",
        body: "{}",
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async deleteUnreferencedDataFile(
    appCode: string,
    resourceCode: string,
    fileId: string,
    request: PerspectiveRequest = {}
  ): Promise<{ id: string; deleted: boolean }> {
    return await this.json(
      this.dataPath(
        appCode,
        resourceCode,
        `files/${encodeURIComponent(fileId)}/delete`
      ),
      {
        method: "POST",
        body: "{}",
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async dataFileContent(
    appCode: string,
    resourceCode: string,
    fileId: string,
    request: PerspectiveRequest = {}
  ): Promise<Response> {
    const path = this.dataPath(
      appCode,
      resourceCode,
      `files/${encodeURIComponent(fileId)}/content`
    );
    const download = async (forceRefresh: boolean) => {
      const token = await this.accessToken(forceRefresh);
      return await this.fetch(`${this.baseUrl}${path}`, {
        credentials: this.options.credentials || "same-origin",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...this.perspectiveHeaders(request),
        },
      });
    };
    let response = await download(false);
    if (response.status === 401 && this.options.tokenProvider) {
      response = await download(true);
    }
    if (!response.ok) {
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        // Binary endpoints may fail before the platform writes a JSON body.
      }
      throw new ControlPlaneError(
        response.status,
        data?.errorCode || "DATA_FILE_DOWNLOAD_FAILED",
        data?.message || `文件下载失败: ${response.status}`,
        data
      );
    }
    return response;
  }

  async createData<T extends Record<string, unknown>>(
    appCode: string,
    resourceCode: string,
    data: Record<string, unknown>,
    request: PerspectiveRequest = {}
  ): Promise<DataRecord<T>> {
    return await this.json<DataRecord<T>>(
      this.dataPath(appCode, resourceCode, "records"),
      {
        method: "POST",
        body: JSON.stringify({ data }),
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async updateData<T extends Record<string, unknown>>(
    appCode: string,
    resourceCode: string,
    id: string,
    input: { expectedRevision: number; data: Record<string, unknown> },
    request: PerspectiveRequest = {}
  ): Promise<DataRecord<T>> {
    return await this.json<DataRecord<T>>(
      this.dataPath(
        appCode,
        resourceCode,
        `records/${encodeURIComponent(id)}/update`
      ),
      {
        method: "POST",
        body: JSON.stringify(input),
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async deleteData<T extends Record<string, unknown>>(
    appCode: string,
    resourceCode: string,
    id: string,
    expectedRevision: number,
    request: PerspectiveRequest = {}
  ): Promise<DataRecord<T>> {
    return await this.json<DataRecord<T>>(
      this.dataPath(
        appCode,
        resourceCode,
        `records/${encodeURIComponent(id)}/delete`
      ),
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  async transactData(
    appCode: string,
    transaction: DataTransactionRequest,
    request: PerspectiveRequest = {}
  ): Promise<DataTransactionResult> {
    return await this.json<DataTransactionResult>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        appCode
      )}/native/data/transactions`,
      {
        method: "POST",
        body: JSON.stringify(transaction),
        headers: this.perspectiveHeaders(request),
      }
    );
  }

  private dataPath(appCode: string, resourceCode: string, suffix: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/native/data/${encodeURIComponent(resourceCode)}/${suffix}`;
  }

  private applicationApiPath(
    appCode: string,
    environmentKey: string,
    runtimePath: string,
    query: ApplicationApiQuery = {}
  ) {
    const normalized = String(runtimePath || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    if (
      !normalized ||
      normalized.includes("\0") ||
      normalized
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    ) {
      throw new ControlPlaneError(
        400,
        "APPLICATION_API_PATH_INVALID",
        "应用后端路径不能为空或包含路径穿越片段"
      );
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const suffix = params.size ? `?${params}` : "";
    return `/openxiangda-app-api/v2/${encodeURIComponent(
      appCode
    )}/${encodeURIComponent(environmentKey)}/${normalized
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}${suffix}`;
  }

  private async deployExistingVersion(
    input: DeployExistingVersionInput,
    action: "promotions" | "rollbacks" | "redeployments"
  ) {
    return await this.json<DeploymentRun>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        input.appCode
      )}/${action}`,
      {
        method: "POST",
        body: JSON.stringify({
          appVersionId: input.appVersionId,
          environmentId: input.environmentId,
          environmentKind: input.environmentKind,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId,
        }),
      }
    );
  }

  private authzPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/authz`;
  }

  private nativeAuthzPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/native/authz`;
  }

  private nativeAuthzManagementPath(appCode: string) {
    return `${this.nativeAuthzPath(appCode)}/management`;
  }

  private query(input: Record<string, unknown>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null || value === "") continue;
      query.set(key, String(value));
    }
    return query.toString();
  }

  private directoryPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/directory`;
  }

  private oauthPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/oauth2`;
  }

  private applicationSecretsPath(appCode: string, environmentKey: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/environments/${encodeURIComponent(environmentKey)}/secrets`;
  }

  private eventsPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/events`;
  }

  private connectedDevelopmentSessionsPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/dev-sessions`;
  }

  private connectedDevelopmentSessionHeaders(sessionToken: string) {
    const token = String(sessionToken || "").trim();
    if (!token) throw new Error("OPENXIANGDA_CONNECTED_DEV_SESSION_REQUIRED");
    return { "X-OpenXiangda-Dev-Session": token };
  }

  private workflowPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      appCode
    )}/workflow`;
  }

  private administrationPath(appCode: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}/admin`;
  }

  private perspectiveHeaders(request: PerspectiveRequest) {
    const perspectiveCode = String(request?.perspectiveCode || "").trim();
    if (perspectiveCode && !/^[a-z][a-z0-9._-]{0,127}$/.test(perspectiveCode)) {
      throw new ControlPlaneError(
        400,
        "OPENXIANGDA_PERSPECTIVE_INVALID",
        "perspectiveCode must be a stable lowercase identifier"
      );
    }
    return perspectiveCode
      ? { "X-OpenXiangda-Perspective": perspectiveCode }
      : {};
  }

  private basicCredentials(clientId: string, clientSecret: string) {
    const value = `${clientId}:${clientSecret}`;
    if (typeof Buffer !== "undefined")
      return Buffer.from(value).toString("base64");
    return globalThis.btoa(value);
  }

  private async json<T>(path: string, init: RequestInit = {}) {
    return await this.request<T>(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    fetcher: FetchLike = this.fetch
  ) {
    try {
      return await this.requestOnce<T>(path, init, false, fetcher);
    } catch (error) {
      if (!this.options.tokenProvider || !this.isUnauthorized(error)) throw error;
      return await this.requestOnce<T>(path, init, true, fetcher);
    }
  }

  private async requestOnce<T>(
    path: string,
    init: RequestInit,
    forceRefresh: boolean,
    fetcher: FetchLike
  ) {
    const token = await this.accessToken(forceRefresh);
    const response = await fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials:
        init.credentials || this.options.credentials || "same-origin",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    let envelope: PlatformEnvelope<T>;
    try {
      envelope = (await response.json()) as PlatformEnvelope<T>;
    } catch {
      throw new ControlPlaneError(
        response.status,
        "CONTROL_PLANE_RESPONSE_INVALID",
        "平台返回的不是有效 JSON"
      );
    }
    if (!response.ok || Number(envelope.code) >= 400) {
      const status = response.ok ? Number(envelope.code) : response.status;
      throw new ControlPlaneError(
        status,
        envelope.errorCode || "CONTROL_PLANE_REQUEST_FAILED",
        envelope.message || `平台请求失败: ${response.status}`,
        envelope.data,
        {
          ...(envelope.retryable === undefined
            ? {}
            : { retryable: envelope.retryable }),
          ...(envelope.remediation
            ? { remediation: envelope.remediation }
            : {}),
          ...(envelope.requestId ? { requestId: envelope.requestId } : {}),
          ...(envelope.path ? { path: envelope.path } : {}),
          ...(envelope.field ? { field: envelope.field } : {}),
        }
      );
    }
    return envelope.data;
  }

  private isUnauthorized(error: unknown) {
    return error instanceof ControlPlaneError && error.status === 401;
  }

  private async accessToken(forceRefresh: boolean) {
    return this.options.tokenProvider
      ? await this.options.tokenProvider.getAccessToken({ forceRefresh })
      : this.options.token;
  }
}
