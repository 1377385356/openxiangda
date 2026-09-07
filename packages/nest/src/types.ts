import type {
  AppApiOperationContract,
  AppEventHandlerContract,
  EventSchemaDefinition,
  GatewayInvocationPrincipal,
  NativePrincipal,
  Principal,
  SubjectProfile,
} from "openxiangda-contracts";

export type OpenXiangdaFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface OpenXiangdaOAuthClientOptions {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  /** Refresh before expiry; defaults to 30 seconds and is bounded by token TTL. */
  refreshSkewSeconds?: number;
}

export interface OpenXiangdaModuleOptions {
  appCode: string;
  platformBaseUrl: string;
  environmentKey: string;
  environmentId: string;
  appVersionId: string;
  deploymentRunId: string;
  environmentHeadRevision: number;
  backendRevisionId: string;
  version: string;
  gitSha?: string;
  buildId?: string;
  /**
   * Development-only loopback transport created by `openxiangda dev`.
   * It replaces Gateway assertions with the linked developer session while
   * keeping platform authorization authoritative.
   */
  connectedDevelopment?: boolean;
  requestTimeoutMs?: number;
  eventSigningSecret?: string;
  eventSigningSecrets?: Record<string, string | string[]>;
  eventMaxAgeSeconds?: number;
  /** Retry only idempotent receipt completion/release commands. Defaults to 3. */
  eventReceiptMaxAttempts?: number;
  /** Base delay for receipt command retry backoff. Defaults to 150ms. */
  eventReceiptRetryDelayMs?: number;
  /** Generated immutable handlers accepted by this application build. */
  eventHandlerManifest?: {
    readonly schemaVersion: 'openxiangda.event-handler-manifest/v2';
    readonly appCode: string;
    readonly handlers: readonly (Omit<
      AppEventHandlerContract,
      'eventTypes' | 'dataSchemaVersions'
    > & {
      readonly eventTypes: readonly string[];
      readonly dataSchemaVersions: readonly string[];
    })[];
  };
  /** Generated application-owned event schemas; platform schemas are built in. */
  eventSchemas?: readonly EventSchemaDefinition[];
  /** Current secret followed by an optional staged next secret during rotation. */
  workflowAssigneeProviderSecrets?: Record<string, string | string[]>;
  workflowAssigneeProviderMaxAgeSeconds?: number;
  /** Optional service identity for Worker/Scheduler and other requestless work. */
  oauthClient?: OpenXiangdaOAuthClientOptions;
  /** Exact pod/process identity used by the automatic background-task lease. */
  runtimeInstanceId?: string;
  eventReceiptStore?: OpenXiangdaEventReceiptStore;
  fetch?: OpenXiangdaFetch;
}

type PlatformRuntimeOptionKey =
  | 'appCode'
  | 'platformBaseUrl'
  | 'environmentKey'
  | 'environmentId'
  | 'appVersionId'
  | 'deploymentRunId'
  | 'environmentHeadRevision'
  | 'backendRevisionId'
  | 'version'
  | 'gitSha'
  | 'buildId'
  | 'connectedDevelopment'
  | 'oauthClient'
  | 'runtimeInstanceId';

/** Application-owned module options. Runtime identity is platform injected. */
export type OpenXiangdaApplicationModuleOptions = Omit<
  OpenXiangdaModuleOptions,
  PlatformRuntimeOptionKey
>;

export interface OpenXiangdaEventReceiptContext {
  tenantId: string;
  appCode: string;
  environmentKey: string;
  subscriptionCode: string;
  eventId: string;
  deliveryId: string;
}

export interface OpenXiangdaEventReceiptStore {
  claim(
    receipt: OpenXiangdaEventReceiptContext
  ): Promise<"claimed" | "duplicate" | "busy">;
  complete(receipt: OpenXiangdaEventReceiptContext): Promise<void>;
  release(receipt: OpenXiangdaEventReceiptContext): Promise<void>;
}

export interface OpenXiangdaVerifiedContext {
  principal:
    | NativePrincipal
    | OpenXiangdaServicePrincipal
    | OpenXiangdaConnectedDeveloperPrincipal;
  authorization: string;
  perspectiveCode: string | null;
  roleCodes?: string[];
  connectedDevelopmentSessionToken?: string;
  /** Immutable operation metadata whose capability was checked by the guard. */
  operation?: AppApiOperationContract;
}

export interface OpenXiangdaBusinessActionContext {
  code: string;
  requiredCapability: string;
  /** Platform Gateway request correlation propagated to nested platform calls. */
  requestId?: string;
  connectedDevelopmentSessionToken?: string;
}

export interface OpenXiangdaConnectedDeveloperPrincipal {
  principalType: "developer";
  userId: string;
  displayName: string;
  appCode: string;
  environmentId: string;
  environmentKey: string;
  activeAppVersionId: string;
  environmentHeadRevision: number;
  roleCodes: string[];
  isAppSuperAdmin: boolean;
  capabilityCodes: string[];
}

export interface OpenXiangdaConnectedDevelopmentStatus {
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
    key: "preproduction" | "production";
    activeAppVersionId: string;
    headRevision: number;
  };
  subjectProfile: SubjectProfile;
  principal: {
    type: "developer";
    userId: string;
    roleCodes: string[];
    isAppSuperAdmin: boolean;
    capabilityCodes: string[];
  };
  manifestDigest: string | null;
}

export interface OpenXiangdaServicePrincipal extends Principal {
  principalType: "service";
  clientRecordId: string;
  clientId: string;
  credentialVersion: number;
  environmentKey: string;
  environmentId: string;
  appVersionId: string;
  deploymentRunId: string;
  environmentHeadRevision: number;
  backendRevisionId: string;
  scopes: string[];
  rateLimitPerMinute: number;
  tokenId: string;
}

export interface OpenXiangdaGatewayTransportContext
  extends GatewayInvocationPrincipal {
  authorization: string;
  perspectiveCode: string | null;
}

export interface OpenXiangdaHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  originalUrl?: string;
  raw?: { url?: string; socket?: { remoteAddress?: string | null } };
  rawBody?: Buffer;
  body?: unknown;
  openxiangdaInvocation?: OpenXiangdaGatewayTransportContext;
  openxiangda?: OpenXiangdaVerifiedContext;
}

export interface OpenXiangdaCurrentUser {
  userId: string;
  displayName: string;
  appCode: string;
  environmentKey: string;
  roleCodes: string[];
  isAppSuperAdmin: boolean;
  capabilityCodes: string[];
}
