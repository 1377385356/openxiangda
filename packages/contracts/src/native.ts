import type {
  ApplicationEventSchemaDeclaration,
  DataFieldType,
  DataResource,
  EventDeliveryPolicy,
  EventProducerKind,
  EventSchemaDefinition,
  EventSubscriptionFilter,
  EventSubscriptionPayload,
  Sha256Digest,
  WorkflowBinding,
  WorkflowCommand,
  WorkflowDefinition,
} from './types.js';
import {
  OPENXIANGDA_COMPILER_CONTRACT_VERSION,
  SCHEMA_VERSIONS,
} from './types.js';

export type OpenXiangdaJsonSchema = Record<string, unknown>;
export type AppCapabilityKind = 'platform' | 'backend' | 'ui' | 'data';
export type ExplicitAppCapabilityKind = 'backend' | 'ui';

export interface AppCapabilityDeclaration {
  code: string;
  kind: ExplicitAppCapabilityKind;
  name: string;
  description?: string;
}

export interface AppCapabilityContract {
  code: string;
  kind: AppCapabilityKind;
  name: string;
  source: 'platform' | 'explicit' | 'data';
  description?: string;
}

export interface AppRoleDeclaration {
  code: string;
  name: string;
  description?: string;
  capabilities: string[];
  /** Removes an explicitly or implicitly granted capability before sealing. */
  deniedCapabilities?: string[];
}

/**
 * A user-selected read projection. It never replaces the current-user union
 * principal and can only narrow pages, fields and rows for reading.
 */
export interface AppPerspectiveDeclaration {
  code: string;
  name: string;
  description?: string;
  roleCodes: string[];
  default?: boolean;
}

export interface AppPerspectiveContract extends AppPerspectiveDeclaration {
  capabilityCodes: string[];
}

export interface AppScopeDimensionDeclaration {
  code: string;
  name: string;
  resourceCode?: string;
  valueType?: 'string' | 'uuid';
  hierarchyMode?: 'flat' | 'self_parent';
  valueSource?: AppScopeDimensionValueSource;
}

export interface AppScopeDimensionValueSource {
  kind: 'native_resource';
  resourceCode: string;
  labelField: string;
  enabledField?: string;
}

export type AppScopeSourceSubjectDeclaration =
  | { type: 'user'; userIdField: string }
  | { type: 'role_membership'; userIdField: string; roleCode: string };

export interface AppScopeSourceGrantDeclaration {
  dimensionCode: string;
  valueField: string;
  parentValueField?: string;
}

export interface AppScopeSourceDeclaration {
  code: string;
  name: string;
  resourceCode: string;
  subject: AppScopeSourceSubjectDeclaration;
  grants: AppScopeSourceGrantDeclaration[];
  operationField?: string;
  enabledField?: string;
  effectiveFromField?: string;
  effectiveToField?: string;
  failureMode: 'strict' | 'last_known_good';
}

export interface AppRoleMembershipSourceDeclaration {
  code: string;
  name: string;
  resourceCode: string;
  userIdField: string;
  roleCode: string;
  enabledField?: string;
  effectiveFromField?: string;
  effectiveToField?: string;
  failureMode: 'strict';
}

export type AppRelationshipGrantSourceSubjectDeclaration =
  | { type: 'user'; userIdField: string }
  | { type: 'role_membership'; userIdField: string; roleCode: string };

export interface AppRelationshipGrantSourceDeclaration {
  code: string;
  name: string;
  resourceCode: string;
  subject: AppRelationshipGrantSourceSubjectDeclaration;
  relationCode: string;
  targetResourceCode: string;
  resourceIdField: string;
  operations: string[];
  enabledField?: string;
  effectiveFromField?: string;
  effectiveToField?: string;
  failureMode: 'strict';
}

export type AppDataPolicyRuleDeclaration =
  | {
      field: string;
      operator: 'eq' | 'not_eq' | 'in' | 'not_in';
      value: string | string[];
      roleCodes?: string[];
    }
  | {
      field: string;
      operator: 'is_null' | 'is_not_null';
      roleCodes?: string[];
    }
  | {
      field: string;
      operator: 'lt' | 'lte' | 'gt' | 'gte';
      operand: 'db_now';
      roleCodes?: string[];
    }
  | { subject: 'current_user'; field: string; roleCodes?: string[] }
  | {
      dimensionCode: string;
      field: string;
      roleCodes?: string[];
      operation?: string;
      valuePath?: string;
      emptyMatchesAll?: boolean;
    }
  | {
      relationCode: string;
      resourceCode: string;
      field: string;
      roleCodes?: string[];
      operation?: string;
      valuePath?: string;
    };

export type AppDataPolicyExpressionDeclaration =
  | AppDataPolicyRuleDeclaration
  | { allOf: AppDataPolicyExpressionDeclaration[] }
  | { anyOf: AppDataPolicyExpressionDeclaration[] };

interface AppDataPolicyDeclarationBase {
  code: string;
  name: string;
  resourceCode: string;
  unrestrictedRoleCodes?: string[];
}

export type AppDataPolicyDeclaration = AppDataPolicyDeclarationBase &
  (
    | {
        operations?: Array<'read' | 'create' | 'update' | 'delete'>;
        matchMode: 'AND' | 'OR';
        rules: AppDataPolicyRuleDeclaration[];
        readExpression?: never;
        writeBoundary?: never;
      }
    | {
        operations?: never;
        matchMode: 'AND' | 'OR';
        rules: AppDataPolicyRuleDeclaration[];
        readExpression: AppDataPolicyExpressionDeclaration;
        writeBoundary?: never;
      }
    | {
        operations?: never;
        matchMode: 'AND';
        rules: [];
        readExpression: AppDataPolicyExpressionDeclaration;
        writeBoundary: 'capability_only';
      }
  );

export interface AppAuthorizationTransitionDeclaration {
  fromAuthzDigest: string;
  removeRoleCodes?: string[];
  removeCapabilityCodes?: string[];
  reason: string;
}

export interface AppBackendSecretDeclaration {
  name: string;
  env: string;
  description?: string;
  required?: boolean;
}

export type AppHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AppApiOperationAiDeclaration {
  name: string;
  description: string;
  risk: 'read' | 'write' | 'destructive' | 'external';
  resources: string[];
  sideEffects: string[];
  concurrency?: 'none' | 'revision';
  timeoutMs?: number;
}

export type AppOperationDirectoryField =
  | 'displayName'
  | 'employeeNumber'
  | 'primaryDepartment'
  | 'departments';

export interface AppOperationPlatformAccessDeclaration {
  /** 在业务事务内核对目标用户的已声明角色；不授予成员管理权限。 */
  roleAssertions?: { roleCodes: readonly string[] };
  directory?: {
    mode: 'current-initiator';
    fields: readonly AppOperationDirectoryField[];
  };
  managedFiles?: ReadonlyArray<{
    resourceCode: string;
    fieldCodes: readonly string[];
    intents: ReadonlyArray<'create' | 'update'>;
  }>;
  managedFileCopies?: ReadonlyArray<{
    mode: 'copy';
    sourceResourceCode: string;
    sourceFieldCodes: readonly string[];
    targetResourceCode: string;
    targetFieldCodes: readonly string[];
  }>;
  notification?: { mode: 'business-standard' };
  workflow?: { codes: readonly string[] };
}

export interface AppApiOperationDeclaration {
  code: string;
  method: AppHttpMethod;
  path: string;
  capability: string;
  requestSchema: OpenXiangdaJsonSchema;
  responseSchema: OpenXiangdaJsonSchema;
  description?: string;
  /** Platform-owned dependencies bounded to this immutable operation. */
  platformAccess?: AppOperationPlatformAccessDeclaration;
  /** Explicit opt-in. Backend operations without this declaration are not AI capabilities. */
  ai?: AppApiOperationAiDeclaration;
}

export interface AppApiOperationContract {
  code: string;
  method: AppHttpMethod;
  path: string;
  requiredCapability: string;
  requestSchemaDigest: string;
  responseSchemaDigest: string;
  description?: string;
  platformAccess?: AppOperationPlatformAccessDeclaration;
}

export interface AppFrontendRouteDeclaration {
  code: string;
  path: string;
  label: string;
  surface: 'admin' | 'user';
  parentCode?: string;
  capability?: string;
  access?: AppFrontendRouteAccess;
  pinned?: boolean;
  tabPersistence?: 'session' | 'none';
  keepAlive?: 'none' | 'memory';
}

export interface AppFrontendRouteAccess {
  allOf?: readonly string[];
  anyOf?: readonly string[];
}

export interface AppFrontendRouteContract
  extends Omit<
    AppFrontendRouteDeclaration,
    'tabPersistence' | 'keepAlive'
  > {
  tabPersistence: 'session' | 'none';
  keepAlive: 'none' | 'memory';
}

export type AnonymousPublicOperationV2 =
  | 'draft.read'
  | 'draft.update'
  | 'validate'
  | 'create'
  | 'own.list'
  | 'own.read'
  | 'public.list'
  | 'public.read';

export interface AnonymousPublicDuplicateValidationV2 {
  code: string;
  kind: 'duplicate';
  fields: readonly string[];
  result: 'availability';
}

export interface AnonymousPublicFilterV2 {
  field: string;
  operator: 'eq';
  value: string | number | boolean | null;
}

export interface AnonymousPublicServerGeneratedFieldV2 {
  field: string;
  kind: 'random-token';
}

export interface AnonymousPublicScheduleValidationV2 {
  campusPolicyCode: string;
  rulePolicyCode: string;
  campusField: string;
  ruleCampusField: string;
  ruleWeekdaysField: string;
  ruleOpenAtField: string;
  ruleCloseAtField: string;
  ruleSlotMinutesField: string;
  ruleAdvanceHoursField: string;
  ruleAdvanceDaysField: string;
  campusEnabledField: string;
  ruleEnabledField: string;
  dateField: string;
  timeField: string;
}

export interface AnonymousPublicAccessPolicyV2 {
  code: string;
  routeCode: string;
  mode: 'anonymous';
  resourceCode: string;
  operations: readonly AnonymousPublicOperationV2[];
  fields: readonly string[];
  requiredFields?: readonly string[];
  ownRecordFields?: readonly string[];
  publicRecordFields?: readonly string[];
  /** Fixed server-side filters applied to every public list/detail read. */
  publicFilters?: readonly AnonymousPublicFilterV2[];
  /** Fields populated by the platform during anonymous create. */
  serverGeneratedFields?: readonly AnonymousPublicServerGeneratedFieldV2[];
  /** Cross-resource schedule checks enforced again inside the submit transaction. */
  schedule?: AnonymousPublicScheduleValidationV2;
  /** Explicit child-field projection for public subtable values. */
  publicSubtableFields?: Readonly<Record<string, readonly string[]>>;
  draft?: {
    enabled: true;
    inactivityTtlSeconds?: number;
    maxBytes?: number;
  };
  validations?: readonly AnonymousPublicDuplicateValidationV2[];
}

export interface AnonymousPublicAccessContractV2 {
  policies: readonly AnonymousPublicAccessPolicyV2[];
}

export type ApplicationAuthenticationMethodType =
  | 'sso'
  | 'password'
  | 'dingtalk';

export interface ApplicationAuthenticationMethodBaseV2 {
  code: string;
  type: ApplicationAuthenticationMethodType;
  label: string;
  presentation: 'primary' | 'secondary';
  required: boolean;
}

export interface ApplicationSsoAuthenticationMethodV2
  extends ApplicationAuthenticationMethodBaseV2 {
  type: 'sso';
  provider: 'tenant-default';
}

export interface ApplicationPasswordAuthenticationMethodV2
  extends ApplicationAuthenticationMethodBaseV2 {
  type: 'password';
}

export interface ApplicationDingTalkAuthenticationMethodV2
  extends ApplicationAuthenticationMethodBaseV2 {
  type: 'dingtalk';
  flow: 'auto' | 'jsapi' | 'oauth';
}

export type ApplicationAuthenticationMethodV2 =
  | ApplicationSsoAuthenticationMethodV2
  | ApplicationPasswordAuthenticationMethodV2
  | ApplicationDingTalkAuthenticationMethodV2;

export interface ApplicationAuthenticationSurfaceV2 {
  routeCode: string;
  path: string;
  defaultRouteCode: string;
}

export interface ApplicationAuthenticationDeclarationV2 {
  accountMode: 'existing-platform-users-only';
  registration: { mode: 'reject' };
  methods: ApplicationAuthenticationMethodV2[];
  surfaces: {
    desktop: ApplicationAuthenticationSurfaceV2;
    mobile: ApplicationAuthenticationSurfaceV2;
  };
}

export interface ApplicationAuthenticationContractV2
  extends ApplicationAuthenticationDeclarationV2 {}

export interface ApplicationPlatformAuthManifestV2 {
  schemaVersion: 'openxiangda.platform-auth-manifest/v2';
  appCode: string;
  protectedUserRouteCount: number;
  methods: ApplicationAuthenticationMethodV2[];
  surfaces: Array<
    ApplicationAuthenticationSurfaceV2 & { device: 'desktop' | 'mobile' }
  >;
}

export interface ApplicationLoginMethodDescriptorV2
  extends ApplicationAuthenticationMethodBaseV2 {
  available: boolean;
  unavailableCode?:
    | 'PROVIDER_NOT_CONFIGURED'
    | 'PROVIDER_UNAVAILABLE'
    | 'FLOW_NOT_AVAILABLE';
  provider?: 'tenant-default';
  flow?: 'auto' | 'jsapi' | 'oauth';
}

export interface ApplicationLoginPublicSurfaceV2 {
  schemaVersion: 'openxiangda.application-login-surface/v2';
  app: { code: string; name: string };
  environment: { key: 'preproduction' | 'production' };
  device: 'desktop' | 'mobile';
  surface: ApplicationAuthenticationSurfaceV2;
  methods: ApplicationLoginMethodDescriptorV2[];
  csrfToken: string;
  returnTo: string;
}

export interface ApplicationLoginTransactionReceiptV2 {
  schemaVersion: 'openxiangda.application-login-transaction/v2';
  transactionId: string;
  expiresAt: string;
  csrfToken: string;
  returnTo: string;
}

export interface ApplicationLoginRedirectReceiptV2 {
  schemaVersion: 'openxiangda.application-login-redirect/v2';
  transactionId: string;
  methodCode: string;
  flow: 'sso' | 'oauth' | 'jsapi';
  redirectUrl?: string;
  jsapi?: { corpId: string; agentId?: string };
}

export interface ApplicationLoginReceiptV2 {
  schemaVersion: 'openxiangda.application-login-receipt/v2';
  state: 'authenticated';
  redirectTo: string;
}

export interface ApplicationLogoutReceiptV2 {
  schemaVersion: 'openxiangda.application-logout-receipt/v2';
  state: 'logged-out';
  redirectTo: string;
}

export type ApplicationLoginErrorCodeV2 =
  | 'APPLICATION_AUTH_UNAUTHENTICATED'
  | 'APPLICATION_AUTH_INVALID_CREDENTIAL'
  | 'APPLICATION_AUTH_RATE_LIMITED'
  | 'APPLICATION_AUTH_CHALLENGE_REQUIRED'
  | 'APPLICATION_AUTH_PROVIDER_UNAVAILABLE'
  | 'APPLICATION_AUTH_TRANSACTION_INVALID'
  | 'APPLICATION_AUTH_STATE_INVALID'
  | 'APPLICATION_AUTH_CSRF_INVALID'
  | 'APPLICATION_AUTH_ORIGIN_INVALID'
  | 'APPLICATION_AUTH_TEMPORARILY_UNAVAILABLE';

export interface ApplicationLoginChallengeV2 {
  id: string;
  type: 'math';
  question: string;
  expireAt: number;
  attemptsLeft: number;
}

export interface ApplicationLoginErrorV2 {
  code: ApplicationLoginErrorCodeV2;
  message: string;
  retryable: boolean;
  methodCode?: string;
  retryAfterSeconds?: number;
  challenge?: ApplicationLoginChallengeV2;
  requestId?: string;
}

export type AppAdminNavigationIcon =
  | 'overview'
  | 'database'
  | 'operations'
  | 'workflow'
  | 'members'
  | 'calendar'
  | 'document'
  | 'folder'
  | 'settings';

export type AppAdminPageReference =
  | { kind: 'resource'; resourceCode: string; viewCode?: string }
  | { kind: 'operation'; routeCode: string };

export interface AppAdminNavigationItemDeclaration {
  page: AppAdminPageReference;
  label?: string;
  icon?: AppAdminNavigationIcon;
  order?: number;
}

export interface AppAdminNavigationGroupDeclaration {
  code: string;
  label: string;
  icon?: AppAdminNavigationIcon;
  order?: number;
  items: readonly AppAdminNavigationItemDeclaration[];
}

export type AppAdminNavigationDeclaration =
  readonly AppAdminNavigationGroupDeclaration[];

export type AppAdminPageKind =
  | 'resource-list'
  | 'resource-detail'
  | 'resource-create'
  | 'resource-update'
  | 'operation';

export interface AppAdminPageContract {
  code: string;
  kind: AppAdminPageKind;
  path: string;
  label: string;
  navigationEligible: boolean;
  capability?: string;
  access?: AppFrontendRouteAccess;
  resourceCode?: string;
  viewCode?: string;
  routeCode?: string;
}

export interface AppAdminNavigationItemContract {
  pageCode: string;
  label?: string;
  icon?: AppAdminNavigationIcon;
  order: number;
}

export interface AppAdminNavigationGroupContract {
  code: string;
  label: string;
  icon?: AppAdminNavigationIcon;
  order: number;
  items: AppAdminNavigationItemContract[];
}

/**
 * A compiler-owned paired route used by standard Workflow and Todo surfaces.
 * The route manifest is a read-only catalog: it carries no component, router,
 * identity, or authorization state of its own.
 */
export type AppRouteManifestKind =
  | 'application-todo-center'
  | 'workflow-work-center'
  | 'workflow-launch'
  | 'workflow-task'
  | 'workflow-instance';

export interface AppRouteManifestDevicePolicyV3 {
  kind: 'viewport-family';
  mobileMaxWidthPx: number;
  desktopMinWidthPx: number;
}

export interface AppRouteManifestRootEntryV3 {
  code: string;
  desktop: string;
  mobile: string;
}

export interface AppRouteManifestAuthenticationPairV3 {
  routeCode: string;
  path: string;
}

export interface AppRouteManifestRouteV3 {
  routeCode: string;
  path: string;
  surface: 'admin' | 'user';
  readonly pathParams: readonly string[];
  capability?: string;
  access?: AppFrontendRouteAccess;
  requiresAuthentication: true;
}

export interface AppRouteManifestEntryV3 {
  code: string;
  kind: AppRouteManifestKind;
  workflowCode?: string;
  desktop: AppRouteManifestRouteV3;
  mobile: AppRouteManifestRouteV3;
}

export interface AppRouteManifestV3 {
  schemaVersion: typeof SCHEMA_VERSIONS.applicationRouteManifest;
  appCode: string;
  devicePolicy: AppRouteManifestDevicePolicyV3;
  rootEntry: AppRouteManifestRootEntryV3;
  authentication: {
    desktop: AppRouteManifestAuthenticationPairV3;
    mobile: AppRouteManifestAuthenticationPairV3;
  };
  readonly routes: readonly AppRouteManifestEntryV3[];
  digest: Sha256Digest;
}

export type WorkflowLaunchMode =
  | 'standalone'
  | 'custom-page'
  | 'hidden-handoff'
  | 'work-center-only';

export type AppWorkflowLaunchInputBindingDeclaration =
  | { source: 'field'; fieldCode: string }
  | { source: 'idempotency-key' }
  | { source: 'current-user-reference' }
  | { source: 'subject-id' }
  | { source: 'subject-revision' }
  | { source: 'requested-at' };

export interface AppWorkflowNamedOperationOutputDeclaration {
  subjectId: string;
  subjectRevision?: string;
  /** Optional or null means the business operation completed without approval. */
  processCommand?: string;
}

export interface AppWorkflowNamedOperationIntentDeclaration {
  operationCode: string;
  /** Top-level operation request property to one compiler-verified source. */
  inputs: Readonly<Record<string, AppWorkflowLaunchInputBindingDeclaration>>;
  /** Top-level operation response property names. */
  output: AppWorkflowNamedOperationOutputDeclaration;
}

export interface AppWorkflowLaunchContextDeclaration {
  queryParameter: string;
  fieldCode: string;
}

export interface AppWorkflowNamedOperationSubmissionDeclaration {
  kind: 'named-operation';
  create?: AppWorkflowNamedOperationIntentDeclaration;
  existing?: AppWorkflowNamedOperationIntentDeclaration;
  context?: readonly AppWorkflowLaunchContextDeclaration[];
}

export interface AppWorkflowLaunchDeclaration {
  mode: WorkflowLaunchMode;
  submission?: AppWorkflowNamedOperationSubmissionDeclaration;
}

export interface AppWorkflowNamedOperationIntentContract
  extends AppWorkflowNamedOperationIntentDeclaration {
  method: 'POST';
  path: string;
  requiredCapability: string;
  requestSchemaDigest: string;
  responseSchemaDigest: string;
}

export interface AppWorkflowNamedOperationSubmissionContract {
  kind: 'named-operation';
  create?: AppWorkflowNamedOperationIntentContract;
  existing?: AppWorkflowNamedOperationIntentContract;
  context: AppWorkflowLaunchContextDeclaration[];
}

export interface AppWorkflowLaunchContract {
  mode: WorkflowLaunchMode;
  submission?: AppWorkflowNamedOperationSubmissionContract;
}

export interface AppWorkflowDetailRouteCodeDeclaration {
  desktop: string;
  mobile: string;
}

export interface AppResourceDetailRouteCodeDeclaration {
  desktop: string;
  mobile: string;
}

export interface AppResourceDetailRouteDeclaration
  extends AppResourceDetailRouteCodeDeclaration {
  resourceCode: string;
}

export type NativeEventActionBinding =
  | { source: 'literal'; value: unknown }
  | { source: 'event'; path: string };

export interface NativeEventActionDeclaration {
  kind: 'native-data';
  version: 1;
  operations: Array<
    | { operation: 'create'; resourceCode: string; data: Record<string, NativeEventActionBinding> }
    | { operation: 'update'; resourceCode: string; id: NativeEventActionBinding; expectedRevision: NativeEventActionBinding; data: Record<string, NativeEventActionBinding> }
    | { operation: 'delete'; resourceCode: string; id: NativeEventActionBinding; expectedRevision: NativeEventActionBinding }
  >;
}

export interface NativeEventActionPlan extends NativeEventActionDeclaration {
  resourceDigests: Record<string, string>;
  digest: string;
}

export interface NativeEventSubscriptionDeclaration {
  execution?: NativeEventActionDeclaration;
  code: string;
  eventTypes: string[];
  filter: EventSubscriptionFilter;
  payload: EventSubscriptionPayload;
  endpointPath: string;
  description?: string;
  platformAccess?: AppEventSubscriptionPlatformAccessDeclaration;
  delivery: EventDeliveryPolicy;
}

/** Subscribed mode retains only declared data events, not complete change history. */
export interface NativeEventCapturePolicy {
  resourceCode: string;
  mode: 'all' | 'subscribed';
}

export interface AppEventSubscriptionPlatformAccessDeclaration {
  notification?: { mode: 'business-standard' };
  managedFileCopies?: ReadonlyArray<{
    mode: 'copy';
    sourceResourceCode: string;
    sourceFieldCodes: readonly string[];
    targetResourceCode: string;
    targetFieldCodes: readonly string[];
  }>;
}

export type NativeApplicationEventSchemaDeclaration =
  ApplicationEventSchemaDeclaration;

export interface NativeTimerSubscriptionDeclaration {
  code: string;
  eventType: string;
  cronExpression: string;
  timezone: string;
  payload: Record<string, unknown>;
  misfirePolicy: 'coalesce_one';
}

export interface NativeDateTriggerDeclaration {
  code: string;
  resourceCode: string;
  field: string;
  offset: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface NativeWorkflowDefinitionDeclaration {
  version: number;
  definition: WorkflowDefinition;
  launch: AppWorkflowLaunchDeclaration;
  detailRouteCode?: AppWorkflowDetailRouteCodeDeclaration;
}

export interface NativeWorkflowBindingDeclaration {
  version: number;
  binding: WorkflowBinding;
}

export interface NativeWorkflowActivationDeclaration {
  workflowCode: string;
  definitionVersion: number;
  bindingVersion: number;
  acceptedCommandDeactivationPolicy:
    WorkflowDefinition['acceptedCommandDeactivationPolicy'];
}

export interface NativeWorkflowProviderDeclaration {
  code: string;
  endpointPath: string;
  timeoutMs?: number;
}

export interface NativeWorkflowEditableParameterDeclaration {
  code: string;
  workflowCode: string;
  bindingKey: string;
  label: string;
  valueType: 'role_code' | 'user_ids' | 'provider_code';
  required?: boolean;
  allowedRoleCodes?: string[];
  allowedProviderCodes?: string[];
  maxItems?: number;
}

export interface NativeRuntimeRequirements {
  protocolCapabilities: string[];
  health: {
    livePath: '/__platform/health';
    readyPath: '/__platform/ready';
    versionPath: '/__platform/version';
  };
}

export interface ConfigurationBundleV3 {
  schemaVersion: typeof SCHEMA_VERSIONS.configurationBundle;
  compilerContractVersion: typeof OPENXIANGDA_COMPILER_CONTRACT_VERSION;
  appCode: string;
  perspectives: AppPerspectiveContract[];
  authz: {
    authenticatedUserRoleCode?: string;
    capabilities: AppCapabilityDeclaration[];
    roles: AppRoleDeclaration[];
    scopeDimensions: AppScopeDimensionDeclaration[];
    scopeSources: AppScopeSourceDeclaration[];
    roleMembershipSources: AppRoleMembershipSourceDeclaration[];
    relationshipGrantSources: AppRelationshipGrantSourceDeclaration[];
    dataPolicies: AppDataPolicyDeclaration[];
    authorizationTransitions: AppAuthorizationTransitionDeclaration[];
  };
  backend: {
    secrets: Array<
      AppBackendSecretDeclaration & { exposure: 'active_only' }
    >;
    operations: AppApiOperationDeclaration[];
  };
  data: {
    resources: DataResource[];
    /** Compiler-owned catalog used to reproduce resource navigation contracts. */
    resourceDetailRoutes?: AppResourceDetailRouteDeclaration[];
  };
  events: {
    capturePolicies?: NativeEventCapturePolicy[];
    schemas: EventSchemaDefinition[];
    subscriptions: NativeEventSubscriptionDeclaration[];
    timers: NativeTimerSubscriptionDeclaration[];
    dateTriggers: NativeDateTriggerDeclaration[];
  };
  workflows: {
    definitions: NativeWorkflowDefinitionDeclaration[];
    bindings: NativeWorkflowBindingDeclaration[];
    /** Complete desired activation set; absence is an explicit deactivation. */
    activations: NativeWorkflowActivationDeclaration[];
    providers: NativeWorkflowProviderDeclaration[];
    editableParameters: NativeWorkflowEditableParameterDeclaration[];
  };
  frontend: {
    routes: AppFrontendRouteDeclaration[];
    user: { applicationTodoCenter: boolean };
    admin: {
      access?: AppFrontendRouteAccess;
      navigation: AppAdminNavigationGroupDeclaration[];
    };
    devicePolicy: AppRouteManifestDevicePolicyV3;
    authentication?: ApplicationAuthenticationContractV2 | null;
    publicAccess?: AnonymousPublicAccessContractV2 | null;
  };
  runtime: NativeRuntimeRequirements;
}

export interface AppResourceContract {
  code: string;
  schemaDigest: string;
  fields: Array<{ code: string; type: DataFieldType }>;
  detailRouteCode?: AppResourceDetailRouteCodeDeclaration;
}

export interface AppEventConsumerContract {
  execution?: NativeEventActionPlan;
  code: string;
  endpointPath: string;
  eventTypes: string[];
  filter: EventSubscriptionFilter;
  payload: EventSubscriptionPayload;
  platformAccess?: AppEventSubscriptionPlatformAccessDeclaration;
  delivery: EventDeliveryPolicy;
}

export interface AppEventProducerContract {
  code: string;
  source: EventProducerKind;
  eventType: string;
  dataSchemaVersion: string;
  resourceCode?: string;
  field?: string;
}

export interface AppEventHandlerContract {
  code: string;
  endpointPath: string;
  eventTypes: string[];
  dataSchemaVersions: string[];
  maxBodyBytes: number;
  receiptProtocolVersion: 2;
}

export interface EventHandlerManifest {
  schemaVersion: typeof SCHEMA_VERSIONS.eventHandlerManifest;
  appCode: string;
  handlers: AppEventHandlerContract[];
}

export interface AppWorkflowContract {
  code: string;
  title: string;
  acceptedCommandDeactivationPolicy:
    WorkflowDefinition['acceptedCommandDeactivationPolicy'];
  subject: WorkflowDefinition['subject'];
  launch: AppWorkflowLaunchContract;
  processOperationCode?: string;
  detailRouteCode?: AppWorkflowDetailRouteCodeDeclaration;
  definitionVersions: number[];
  bindingVersions: number[];
  providerCodes: string[];
  allowedOperations: WorkflowCommand[];
  editableParameterCodes: string[];
}

export interface ContractBundleV3 {
  schemaVersion: typeof SCHEMA_VERSIONS.contractBundle;
  compilerContractVersion: typeof OPENXIANGDA_COMPILER_CONTRACT_VERSION;
  generatorVersion: string;
  appCode: string;
  configDigest: string;
  perspectives: AppPerspectiveContract[];
  resources: AppResourceContract[];
  capabilities: AppCapabilityContract[];
  operations: AppApiOperationContract[];
  eventConsumers: AppEventConsumerContract[];
  eventProducers: AppEventProducerContract[];
  eventSchemas: EventSchemaDefinition[];
  eventHandlerManifest: EventHandlerManifest;
  eventTypes: string[];
  workflows: AppWorkflowContract[];
  routes: AppFrontendRouteContract[];
  authentication?: ApplicationAuthenticationContractV2 | null;
  publicAccess?: AnonymousPublicAccessContractV2 | null;
  routeManifest: AppRouteManifestV3;
  adminAccess?: AppFrontendRouteAccess;
  adminPages: AppAdminPageContract[];
  adminNavigation: AppAdminNavigationGroupContract[];
}

export function nativePlatformCapabilityCatalog(
  appCode: string
): AppCapabilityContract[] {
  return [
    {
      code: `app:${appCode}:directory:read`,
      kind: 'platform',
      name: '读取受限组织目录',
      source: 'platform',
    },
    ...[
      ['app:role:read', '查看角色与授权'],
      ['app:role:define', '定义手工角色'],
      ['app:role:assign', '分配角色成员'],
      ['app:role:grant-capability', '授予角色能力'],
      ['app:scope-grant:manage', '管理数据范围'],
      ['app:super-admin:manage', '管理应用最高管理员'],
    ].map(([code, name]) => ({
      code: code!,
      kind: 'platform' as const,
      name: name!,
      source: 'platform' as const,
    })),
  ];
}
