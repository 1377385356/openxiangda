import { OPENXIANGDA_COMPILER_CONTRACT_VERSION, PLATFORM_CAPABILITY_CONTRACT_VERSIONS } from "./native-version.js";
export { OPENXIANGDA_COMPILER_CONTRACT_VERSION, PLATFORM_CAPABILITY_CONTRACT_VERSIONS } from "./native-version.js";
import type { DataResourceSurface } from "./surface.js";
import type {
  CascadePathValue,
  DataFieldOption,
  DateRangeValue,
  DepartmentReferenceValue,
  LabeledValue,
  ManagedImageValue,
  ResourceReferenceValue,
  StableAddressValue,
  StableLocationValue,
  StableSignatureValue,
  UserReferenceValue,
} from "./field-values.js";
import type { DataFieldResourceSource } from "./references.js";
import type { WorkflowBusinessData } from "./workflow-summary.js";
import type { WorkflowBusinessDetail } from "./workflow-detail.js";
import type {
  AppWorkflowLaunchContextDeclaration,
  AppWorkflowLaunchInputBindingDeclaration,
  AppWorkflowNamedOperationOutputDeclaration,
} from "./native.js";
import {
  STUDIO_CAPABILITIES_SCHEMA_VERSION,
  STUDIO_CLI_EVENT_SCHEMA_VERSION,
  STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION,
  STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
  WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
  type StudioWorkspaceProtocolCapabilities,
} from "./studio.js";

export const OPENXIANGDA_CONTRACT_VERSION = "2.0.0-alpha.5" as const;


export const SCHEMA_VERSIONS = {
  studioCapabilities: STUDIO_CAPABILITIES_SCHEMA_VERSION,
  studioCliEvent: STUDIO_CLI_EVENT_SCHEMA_VERSION,
  studioWorkspaceBinding: STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION,
  studioWorkspaceInitialization: STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
  workspaceTemplateBinding: WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
  workspaceContext: "openxiangda.workspace-context/v3",
  application: "openxiangda.application/v2",
  applicationSecret: "openxiangda.application-secret/v2",
  diagnostic: "openxiangda.diagnostic/v2",
  principal: "openxiangda.principal/v2",
  nativePrincipal: "openxiangda.native-principal/v2",
  subjectProfile: "openxiangda.subject-profile/v2",
  currentInitiatorDirectoryRequest:
    "openxiangda.current-initiator-directory-request/v2",
  currentInitiatorDirectorySnapshot:
    "openxiangda.current-initiator-directory-snapshot/v2",
  roleSubjectPage: "openxiangda.role-subject-page/v2",
  runtimeAuthorization: "openxiangda.runtime-authorization/v2",
  nativeRoleMembershipPage: "openxiangda.native-role-membership-page/v2",
  nativeAuthorizationManagementCatalog:
    "openxiangda.native-authorization-catalog/v2",
  nativeRoleManagementGrantPage:
    "openxiangda.native-role-management-grant-page/v2",
  nativeAuthorizationMutationReceipt:
    "openxiangda.native-authorization-mutation-receipt/v2",
  nativeSuperAdminGrantPage: "openxiangda.native-super-admin-grant-page/v2",
  nativeRelationshipGrantPage: "openxiangda.native-relationship-grant-page/v2",
  nativeAuthorizationProjectionHealth:
    "openxiangda.native-authorization-projection-health/v2",
  roleAssignment: "openxiangda.role-assignment/v2",
  relationshipGrant: "openxiangda.relationship-grant/v2",
  gatewayAssertionJwks: "openxiangda.gateway-assertion-jwks/v2",
  gatewayInvocationPrincipal: "openxiangda.gateway-invocation-principal/v2",
  runtimeLeaseResult: "openxiangda.runtime-lease-result/v2",
  runtimeSecretValues: "openxiangda.runtime-secret-values/v2",
  authorizationDecision: "openxiangda.authorization-decision/v2",
  authorizationBatchRequest: "openxiangda.authorization-batch-request/v2",
  authorizationBatchResult: "openxiangda.authorization-batch-result/v2",
  nativeAuthorizationDecision: "openxiangda.native-authorization-decision/v2",
  nativeAuthorizationBatchRequest:
    "openxiangda.native-authorization-batch-request/v2",
  nativeAuthorizationBatchResult:
    "openxiangda.native-authorization-batch-result/v2",
  directoryResolveRequest: "openxiangda.directory-resolve-request/v2",
  directorySearchResult: "openxiangda.directory-search-result/v2",
  directoryEntryPage: "openxiangda.directory-entry-page/v2",
  nativeScopeValueResolveRequest:
    "openxiangda.native-scope-value-resolve-request/v2",
  nativeScopeValuePage: "openxiangda.native-scope-value-page/v2",
  dataFieldSourceQuery: "openxiangda.data-field-source-query/v2",
  dataFieldSourcePage: "openxiangda.data-field-source-page/v2",
  dataRef: "openxiangda.data-ref/v2",
  dataResource: "openxiangda.data-resource/v2",
  dataQuery: "openxiangda.data-query/v2",
  dataBatchQuery: "openxiangda.data-batch-query/v2",
  dataBatchQueryResult: "openxiangda.data-batch-query-result/v2",
  dataExportRequest: "openxiangda.data-export-request/v2",
  dataPage: "openxiangda.data-page/v2",
  dataRecord: "openxiangda.data-record/v2",
  dataAggregateQuery: "openxiangda.data-aggregate-query/v2",
  dataAggregatePage: "openxiangda.data-aggregate-page/v2",
  dataAuditPage: "openxiangda.data-audit-page/v2",
  dataFileRef: "openxiangda.data-file-ref/v2",
  dataFileUploadPlan: "openxiangda.data-file-upload-plan/v2",
  dataFilePreview: "openxiangda.data-file-preview/v2",
  dataFileCopyRequest: "openxiangda.data-file-copy-request/v2",
  dataFileCopyReceipt: "openxiangda.data-file-copy-receipt/v2",
  dataTransactionRequest: "openxiangda.data-transaction-request/v2",
  dataTransactionResult: "openxiangda.data-transaction-result/v2",
  aiCapabilityCatalog: "openxiangda.ai-capability/v1",
  cloudEvent: "openxiangda.cloud-event/v2",
  eventCatalog: "openxiangda.event-catalog/v2",
  eventSchema: "openxiangda.event-schema/v2",
  eventHandlerManifest: "openxiangda.event-handler-manifest/v2",
  eventDeliveryAck: "openxiangda.event-delivery-ack/v2",
  eventSubscription: "openxiangda.event-subscription/v2",
  eventDelivery: "openxiangda.event-delivery/v2",
  eventReceiptCommand: "openxiangda.event-receipt-command/v2",
  eventReceiptResult: "openxiangda.event-receipt-result/v2",
  timerSubscription: "openxiangda.timer-subscription/v2",
  dateTrigger: "openxiangda.date-trigger/v2",
  workflowDefinition: "openxiangda.workflow-definition/v2",
  workflowBinding: "openxiangda.workflow-binding/v2",
  workflowPreparation: "openxiangda.workflow-preparation/v2",
  workflowInstance: "openxiangda.workflow-instance/v2",
  workflowTask: "openxiangda.workflow-task/v2",
  workflowBusinessData: "openxiangda.workflow-business-data/v1",
  workflowBusinessDetail: "openxiangda.workflow-business-detail/v1",
  workflowSurface: "openxiangda.workflow-surface/v2",
  workflowDetailSurface: "openxiangda.workflow-detail-surface/v2",
  workflowCommandInput: "openxiangda.workflow-command-input/v2",
  workflowLaunchSurface: "openxiangda.workflow-launch-surface/v3",
  workflowDelegation: "openxiangda.workflow-delegation/v2",
  workflowAssigneeProvider: "openxiangda.workflow-assignee-provider/v2",
  workflowAssigneeRequest: "openxiangda.workflow-assignee-request/v2.1",
  workflowAssigneeResponse: "openxiangda.workflow-assignee-response/v2",
  businessProcessCommit: "openxiangda.business-process.commit/v2",
  standardProcessCommit: "openxiangda.standard-process.commit/v2",
  businessProcessCommand: "openxiangda.business-process.command/v2",
  businessProcessReceipt: "openxiangda.business-process-receipt/v2",
  businessProcessPoll: "openxiangda.business-process-poll/v2",
  processCommandSurface: "openxiangda.process-command-surface/v2",
  businessProcessAnswer: "openxiangda.business-process-answer/v2",
  businessProcessRetry: "openxiangda.business-process-retry/v2",
  appPackage: "openxiangda.app-package/v3",
  appVersion: "openxiangda.app-version/v2",
  environmentHead: "openxiangda.environment-head/v2",
  applicationEnvironments: "openxiangda.application-environments/v2",
  deploymentRun: "openxiangda.deployment-run/v2",
  promotionPreflight: "openxiangda.promotion-preflight/v1",
  runtimeCapacityPreflight: "openxiangda.runtime-capacity-preflight/v1",
  platformCapabilities: "openxiangda.platform-capabilities/v3",
  configurationCompatibility:
    "openxiangda.configuration-compatibility/v2",
  configurationValidationRequest:
    "openxiangda.configuration-validation-request/v1",
  configurationValidationResult:
    "openxiangda.configuration-validation-result/v1",
  configurationBundle: "openxiangda.config-bundle/v3",
  contractBundle: "openxiangda.contract-bundle/v3",
  applicationRouteManifest: "openxiangda.application-route-manifest/v3",
} as const;

export type SchemaVersion =
  (typeof SCHEMA_VERSIONS)[keyof typeof SCHEMA_VERSIONS];
export type Sha256Digest = string;
export type PrefixedSha256Digest = `sha256:${string}`;
export type IsoDateTime = string;

export const DEPLOYMENT_ENVIRONMENTS = ["preproduction", "production"] as const;
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];
export const LOCAL_RUNTIME_MODE = "local" as const;
export type LocalRuntimeMode = typeof LOCAL_RUNTIME_MODE;
export type RuntimeMode = LocalRuntimeMode | DeploymentEnvironment;

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  schemaVersion: typeof SCHEMA_VERSIONS.diagnostic;
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path?: string;
  source?: string;
  retryable: boolean;
  remediation?: string;
  details?: Record<string, unknown>;
}

export interface WorkspaceIdentity {
  appCode: string;
  name?: string;
  root: string;
  repository?: string;
  revision?: string;
  dirty?: boolean;
}

export interface WorkspaceContext {
  schemaVersion: typeof SCHEMA_VERSIONS.workspaceContext;
  workspace: WorkspaceIdentity;
  roots: {
    frontend: string;
    backend: string;
    platform: string;
  };
  toolchain: {
    packageName?: "openxiangda-devkit-core";
    version: string;
    contractVersion: typeof OPENXIANGDA_CONTRACT_VERSION;
    nodeVersion: string;
    packageManager: string;
    studio?: StudioWorkspaceProtocolCapabilities;
  };
  environments: Array<{
    id?: string;
    name: string;
    kind: DeploymentEnvironment;
  }>;
  changedDomains: Array<
    "frontend" | "backend" | "data" | "authz" | "events" | "workflow" | "config"
  >;
  development?: {
    schemaVersion: 'openxiangda.development-lifecycle/v2';
    stage: 'design-incomplete' | 'ready-for-implementation' | 'ready-for-test';
    readyForImplementation: boolean;
    design: { readyForImplementation: boolean; reviewId: string | null; scope: 'initial' | 'change' | null; baselineDigest: string | null; documentIds: string[]; diagnostics: Diagnostic[] };
    readyForTest: boolean;
    changeId: string | null;
    acceptanceIds: string[];
    currentSpecDigest: string | null;
    diagnostics: Diagnostic[];
    nextCommand: string;
    application: { path: string; content: string } | null;
    records: Array<{ id: string; title: string; status: string; path: string; kind: string }>;
  };
}

export interface RuntimeEnvironment {
  id: string;
  tenantId: string;
  appCode: string;
  environmentKey: DeploymentEnvironment;
  environmentKind: DeploymentEnvironment;
  displayName: string;
  status: "active" | "decommissioned";
  runtimeState: "running" | "stopped";
  sideEffectPolicy: Record<string, unknown>;
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ApplicationSourceRepository {
  provider: 'forgejo';
  repositoryId: string;
  repositoryName: string;
  cloneUrl: string;
  webUrl: string;
  defaultBranch: string;
}

export interface ApplicationSourceCredential {
  repository: ApplicationSourceRepository;
  username: string;
  password: string;
  name: string;
  email: string;
}

export interface ProvisionedApplication {
  sourceRepository?: ApplicationSourceRepository;
  schemaVersion: typeof SCHEMA_VERSIONS.application;
  created: boolean;
  application: {
    schemaVersion: typeof SCHEMA_VERSIONS.application;
    id: string;
    appCode: string;
    name: string;
    description?: string | null;
    runtimeMode: "react-spa";
    activeRuntimeReleaseId: string | null;
    activeRuntimeBuildId: string | null;
    createdAt?: IsoDateTime | null;
    updatedAt?: IsoDateTime | null;
  };
  environments: RuntimeEnvironment[];
  bootstrapSuperAdminGrant: NativeSuperAdminGrant;
}

export type PrincipalType = "user" | "service" | "public";

export interface Principal {
  schemaVersion: typeof SCHEMA_VERSIONS.principal;
  tenantId: string;
  appCode: string;
  environmentKey: string;
  principalType: PrincipalType;
  subjectId: string;
  userId?: string;
  loginSessionId?: string;
  /** Platform identity codes maintained by the organization sync. */
  platformRoleCodes?: string[];
  authzVersion: number;
  isAppSuperAdmin: boolean;
}

export interface NativePrincipal {
  schemaVersion: typeof SCHEMA_VERSIONS.nativePrincipal;
  tenantId: string;
  appCode: string;
  environmentId: string;
  environmentKey: RuntimeMode;
  activeAppVersionId: string;
  environmentHeadRevision: number;
  principalType: "user";
  subjectId: string;
  userId: string;
  /** Platform-resolved human-readable snapshot for the current user. */
  displayName: string;
  loginSessionId: string;
  subjectKind: "super_admin" | "role_union";
  /** Verified complete application-role union. */
  roleCodes: string[];
  /** Additive platform identity codes; never treated as the selected app role. */
  platformRoleCodes?: string[];
  authzRevisionId: string;
  authzVersion: number;
  scopeDataVersion: string;
  /** Digest of the platform-verified role/capability union and authz snapshot. */
  authorizationDigest: string;
  isAppSuperAdmin: boolean;
  capabilities: string[];
  expiresAt: IsoDateTime | null;
}

export interface SubjectProfile {
  schemaVersion: typeof SCHEMA_VERSIONS.subjectProfile;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  jobNumber: string | null;
  affiliatedDepartment: { id: string; name: string } | null;
}

export interface CurrentInitiatorDirectoryRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.currentInitiatorDirectoryRequest;
}

export interface CurrentInitiatorDirectorySnapshot {
  schemaVersion: typeof SCHEMA_VERSIONS.currentInitiatorDirectorySnapshot;
  userId: string;
  displayName?: string;
  employeeNumber?: string | null;
  primaryDepartment?: { value: string; label: string } | null;
  departments?: Array<{ value: string; label: string }>;
  snapshotRevision: Sha256Digest;
  resolvedAt: IsoDateTime;
}

export interface RoleSubjectScopeSummary {
  dimensionCode: string;
  valueCount: number;
  previewValues: string[];
  operationCount: number;
  truncated: boolean;
}

export interface RoleSubjectChoice {
  subjectKey: string;
  subjectKind: "membership" | "super_admin" | "workflow_participant";
  role: {
    code: string;
    name: string;
    source: "package" | "manual" | "reserved";
    description: string | null;
  };
  revision: number;
  scopeDimensionCount: number;
  scopeSummary: RoleSubjectScopeSummary[];
  scopeSummaryTruncated: boolean;
  validFrom: IsoDateTime | null;
  validTo: IsoDateTime | null;
}

export interface RoleSubjectChoicePage {
  schemaVersion: typeof SCHEMA_VERSIONS.roleSubjectPage;
  items: RoleSubjectChoice[];
  total: number;
  nextCursor: string | null;
  roleSubjectSetVersion: string;
}

export interface NativeScopeGrant {
  dimensionCode: string;
  values: string[];
  operations: string[];
}

export const NATIVE_ROLE_MANAGEMENT_ACTIONS = [
  "membership.read",
  "membership.assign",
  "membership.update",
  "membership.revoke",
  "management.delegate",
] as const;

export type NativeRoleManagementAction =
  (typeof NATIVE_ROLE_MANAGEMENT_ACTIONS)[number];

export interface NativeRoleManagementAuthority {
  unrestricted: boolean;
  wildcardActions: NativeRoleManagementAction[];
  roles: Array<{
    roleCode: string;
    actions: NativeRoleManagementAction[];
  }>;
}

export interface NativeAuthorizationManagementRole {
  code: string;
  name: string;
  description: string | null;
  capabilityCodes: string[];
  source: "package" | "manual";
}

export interface NativeScopeDimensionApplicabilityRule {
  policyCode: string;
  allRoles: boolean;
  roleCodes: string[];
  unrestrictedRoleCodes: string[];
}

export interface NativeScopeDimensionApplicability {
  dimensionCode: string;
  allRoles: boolean;
  roleCodes: string[];
  unrestrictedRoleCodes: string[];
  rules: NativeScopeDimensionApplicabilityRule[];
}

export interface NativeAuthorizationManagementScopeDimension {
  code: string;
  name: string;
  resourceCode: string | null;
  valueType: string | null;
  hierarchyMode: string | null;
  valueSource: Record<string, unknown> | null;
  applicability: NativeScopeDimensionApplicability;
}

export interface NativeAuthorizationManagementCatalog {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeAuthorizationManagementCatalog;
  environment: {
    id: string;
    key: DeploymentEnvironment;
    activeAppVersionId: string;
    headRevision: number;
    dataLogicalRevisionId: string;
    authzRevisionId: string;
    authzVersion: number;
    scopeDataVersion: string;
  };
  roles: NativeAuthorizationManagementRole[];
  roleManagement: NativeRoleManagementAuthority;
  scopeDimensions: NativeAuthorizationManagementScopeDimension[];
}

export interface NativeRoleMembership {
  id: string;
  environmentId: string;
  userId: string;
  userName?: string | null;
  userAvatar?: string | null;
  roleCode: string;
  roleName?: string | null;
  roleSource: "package" | "manual";
  sourceCode: string;
  maintainable: boolean;
  immutableReason: "authenticated_user_role" | "authorization_projection" | null;
  scopeGrants: NativeScopeGrant[];
  status: "active" | "revoked" | "expired";
  revision: number;
  validFrom: IsoDateTime | null;
  validTo: IsoDateTime | null;
  createdAt?: IsoDateTime | null;
  updatedAt?: IsoDateTime | null;
}

export interface NativeRoleMembershipPage {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeRoleMembershipPage;
  items: NativeRoleMembership[];
  total: number;
  limit: number;
  offset: number;
}

export interface NativeRoleManagementGrant {
  id: string;
  environmentId: string;
  subjectRoleCode: string;
  manageAllRoles: boolean;
  managedRoleCodes: string[];
  actions: NativeRoleManagementAction[];
  status: "active" | "revoked";
  revision: number;
  reason: string;
  createdBy: string;
  updatedBy: string;
  createdAt: IsoDateTime | null;
  updatedAt: IsoDateTime | null;
}

export interface NativeRoleManagementGrantPage {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeRoleManagementGrantPage;
  items: NativeRoleManagementGrant[];
  total: number;
  limit: number;
  offset: number;
}

export interface NativeAuthorizationMutationReceipt {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeAuthorizationMutationReceipt;
  operationId: string;
  operationKind: string;
  requestDigest: Sha256Digest;
  actorUserId: string;
  reason: string | null;
  result: Record<string, unknown>;
  replayed: boolean;
  createdAt: IsoDateTime;
}

export interface NativeRoleMembershipMutationResult {
  membership: NativeRoleMembership;
  roleSubjectSetVersion: string;
  receipt: NativeAuthorizationMutationReceipt;
  revokedRelationshipCount?: number;
  revokedSessionCount?: number;
}

export interface NativeRoleManagementGrantMutationResult {
  grant: NativeRoleManagementGrant;
  state: NativeEnvironmentAuthorizationStateView;
  receipt: NativeAuthorizationMutationReceipt;
}

export interface NativeEnvironmentAuthorizationStateView {
  environmentId: string;
  tenantId: string;
  appCode: string;
  activeAuthzRevisionId: string;
  lastActivationOperationId: string;
  authzVersion: number;
  scopeDataVersion: string;
  revision: number;
  updatedBy: string;
  updatedAt: IsoDateTime;
}

export interface NativeSuperAdminGrant {
  id: string;
  tenantId: string;
  appCode: string;
  userId: string;
  userName?: string | null;
  userAvatar?: string | null;
  status: "active" | "revoked";
  revision: number;
  createdAt?: IsoDateTime | null;
  updatedAt?: IsoDateTime | null;
}

export interface NativeSuperAdminGrantPage {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeSuperAdminGrantPage;
  items: NativeSuperAdminGrant[];
  total: number;
  limit: number;
  offset: number;
}

export interface NativeRelationshipGrant {
  id: string;
  environmentId: string;
  relationCode: string;
  subjectType: "user" | "role_membership";
  subjectKey: string;
  resourceCode: string;
  resourceId: string;
  operations: string[];
  sourceCode: string;
  status: "active" | "revoked" | "expired";
  revision: number;
  validFrom: IsoDateTime | null;
  validTo: IsoDateTime | null;
  createdAt?: IsoDateTime | null;
  updatedAt?: IsoDateTime | null;
}

export interface NativeRelationshipGrantPage {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeRelationshipGrantPage;
  items: NativeRelationshipGrant[];
  total: number;
  limit: number;
  offset: number;
}

export interface NativeAuthorizationProjectionSourceHealth {
  kind: "role_membership" | "relationship_grant";
  sourceCode: string;
  desiredPresent: boolean;
  status: "stale" | "processing" | "healthy" | "retired" | "failed" | null;
  sourceRevision: number | null;
  projectedRevision: number | null;
  jobId: string | null;
  jobStatus:
    | "pending"
    | "processing"
    | "retry_wait"
    | "succeeded"
    | "dead_letter"
    | "superseded"
    | null;
  errorCode: string | null;
}

export interface NativeAuthorizationProjectionHealth {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeAuthorizationProjectionHealth;
  ready: boolean;
  environmentId: string;
  authzRevisionId: string;
  activeAuthzRevisionId: string | null;
  sourceCount: number;
  sources: NativeAuthorizationProjectionSourceHealth[];
}

export interface NativeAuthorizationProjectionMutationResult {
  environmentId: string;
  jobIds: string[];
}

export interface RuntimeAuthorizationIdentity {
  type: "user_union" | "developer";
  userId: string;
  roleCodes: string[];
  capabilityCodes: string[];
  isAppSuperAdmin: boolean;
  identityScope: string;
}

export interface RuntimeRoleSummary {
  code: string;
  name: string;
  source: 'package' | 'manual' | 'reserved';
}

/**
 * Browser runtime identity owned by the platform. Published applications use
 * the current logged-in user's complete application-role union and never
 * select or replace their authenticated identity.
 */
export interface RuntimeAuthorizationContext {
  schemaVersion: typeof SCHEMA_VERSIONS.runtimeAuthorization;
  state: "active" | "unassigned";
  environment: {
    id: string;
    key: DeploymentEnvironment;
    activeAppVersionId: string;
    headRevision: number;
    authzRevisionId?: string;
    authzVersion?: number;
    scopeDataVersion?: string;
  };
  subjectProfile: SubjectProfile;
  roles: RuntimeRoleSummary[];
  principal: RuntimeAuthorizationIdentity | null;
}

export interface OAuthApplicationPrincipal {
  principalType: "application";
  clientRecordId: string;
  clientId: string;
  credentialVersion: number;
  tenantId: string;
  appCode: string;
  environmentKey: string;
  scopes: string[];
  rateLimitPerMinute: number;
  tokenId: string;
  issuedAt?: number;
  expiresAt?: number;
}

export interface GatewayAssertionJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  use: "sig";
  alg: "EdDSA";
  kid: string;
}

export interface GatewayAssertionJwks {
  schemaVersion: typeof SCHEMA_VERSIONS.gatewayAssertionJwks;
  keys: GatewayAssertionJwk[];
}

export interface GatewayInvocationTarget {
  tenantId: string;
  appCode: string;
  environmentId: string;
  environmentKey: RuntimeMode;
  appVersionId: string;
  deploymentRunId: string;
  headRevision: number;
  backendRevisionId: string;
}

export interface GatewayApplicationPrincipal extends OAuthApplicationPrincipal {
  environmentId: string;
  environmentKey: RuntimeMode;
  appVersionId: string;
  deploymentRunId: string;
  headRevision: number;
  runtimeContract?: "native-2";
  runtimeCredentialId?: string;
}

export interface GatewayInvocationPrincipal {
  schemaVersion: typeof SCHEMA_VERSIONS.gatewayInvocationPrincipal;
  target: GatewayInvocationTarget;
  principal: NativePrincipal | GatewayApplicationPrincipal;
  invocationTokenId: string;
}

export type RuntimeLeaseAction = "acquire" | "renew" | "release";

export interface RuntimeLeaseCommand {
  action: RuntimeLeaseAction;
  holderId: string;
  leaseToken?: string;
  waitMs?: number;
}

export interface RuntimeTarget {
  environmentId: string;
  appVersionId: string;
  deploymentRunId: string;
  headRevision: number;
}

export interface RuntimeLeaseResult {
  schemaVersion: typeof SCHEMA_VERSIONS.runtimeLeaseResult;
  granted: boolean;
  released: boolean;
  leaseToken: string | null;
  expiresAt: IsoDateTime | null;
  retryAfterMs: number;
  target: RuntimeTarget;
}

export interface RuntimeSecretValue {
  name: string;
  env: string;
  value: string;
  version: number;
  revision: number;
}

export interface RuntimeSecretValues {
  schemaVersion: typeof SCHEMA_VERSIONS.runtimeSecretValues;
  items: RuntimeSecretValue[];
  target: RuntimeTarget;
}

export interface OAuthClient {
  id: string;
  appCode: string;
  environmentKey: string;
  name: string;
  clientId: string;
  clientKind: "external" | "runtime";
  platformManaged: boolean;
  clientSecretHint: string;
  previousClientSecretHint?: string | null;
  previousSecretValidUntil?: IsoDateTime | null;
  pendingRotation?: {
    credentialVersion: number;
    requestedAt: IsoDateTime | null;
    gracePeriodSeconds: number;
  } | null;
  scopes: string[];
  status: "active" | "revoked";
  credentialVersion: number;
  rateLimitPerMinute: number;
  lastUsedAt?: IsoDateTime | null;
  lastRotatedAt?: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface RuntimeOAuthCredentialStatus {
  configured: boolean;
  requiresRedeploy: boolean;
  client: OAuthClient | null;
  idempotentReplay?: boolean;
}

export interface OAuthAuditEvent {
  id: string;
  appCode: string | null;
  environmentKey: string | null;
  clientId: string | null;
  eventType: string;
  outcome: "allowed" | "denied";
  actorType: "user" | "application" | "anonymous";
  actorId: string | null;
  tokenId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  reasonCode: string | null;
  details: Record<string, unknown>;
  createdAt: IsoDateTime;
}

export interface ApplicationSecret {
  schemaVersion: typeof SCHEMA_VERSIONS.applicationSecret;
  id: string;
  appCode: string;
  environmentKey: string;
  name: string;
  description: string | null;
  status: "active" | "disabled" | "deleted";
  revision: number;
  hasValue: boolean;
  expiresAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  idempotentReplay?: boolean;
  references?: {
    activeConfiguration: {
      appVersionId: string;
      version: string;
      configDigest: string;
    } | null;
  };
}

export interface ApplicationSecretAuditEvent {
  schemaVersion: typeof SCHEMA_VERSIONS.applicationSecret;
  id: string;
  appCode: string;
  environmentKey: string;
  name: string;
  eventType: string;
  outcome: "allowed" | "denied";
  actorUserId: string | null;
  version: number | null;
  revision: number | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateTime;
}

export interface RoleAssignmentScopeGrant {
  dimensionCode: string;
  values: string[];
  operations: string[];
}

export interface ApplicationRole {
  id: string;
  appCode: string;
  code: string;
  name: string;
  description?: string | null;
  isAppSuperAdmin: boolean;
}

export interface RoleAssignment {
  schemaVersion: typeof SCHEMA_VERSIONS.roleAssignment;
  id: string;
  tenantId: string;
  appCode: string;
  userId: string;
  role: {
    id: string;
    code: string;
    name: string;
    isAppSuperAdmin: boolean;
  };
  status: "active" | "revoked" | "expired";
  revision: number;
  scopeGrants: RoleAssignmentScopeGrant[];
  validFrom?: IsoDateTime | null;
  validTo?: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type RelationshipGrantSubjectType = "user" | "role_assignment";
export type RelationshipGrantStatus = "active" | "revoked" | "expired";

export interface RelationshipGrant {
  schemaVersion: typeof SCHEMA_VERSIONS.relationshipGrant;
  id: string;
  tenantId: string;
  appCode: string;
  relationCode: string;
  subjectType: RelationshipGrantSubjectType;
  subjectKey: string;
  resourceCode: string;
  resourceId: string;
  operations: string[];
  sourceCode: string;
  status: RelationshipGrantStatus;
  revision: number;
  validFrom?: IsoDateTime | null;
  validTo?: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AuthorizationDecisionLayer {
  layer: "app_super_admin" | "rbac" | "data_policy" | "field_policy";
  allowed: boolean;
  reason?: string;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthorizationDecision {
  schemaVersion: typeof SCHEMA_VERSIONS.authorizationDecision;
  explainId: string;
  allowed: boolean;
  principal: Principal;
  decisions: AuthorizationDecisionLayer[];
}

export interface AuthorizationExplainRequest {
  key: string;
  capability: string;
  dataPolicyCode?: string;
  operation?: string;
  data?: Record<string, unknown>;
}

export interface AuthorizationBatchRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.authorizationBatchRequest;
  requests: AuthorizationExplainRequest[];
}

export interface AuthorizationBatchResult {
  schemaVersion: typeof SCHEMA_VERSIONS.authorizationBatchResult;
  principal: Principal;
  items: Array<{
    key: string;
    decision: AuthorizationDecision;
  }>;
}

export interface NativeAuthorizationIdentity {
  environmentId: string;
  environmentKey: RuntimeMode;
  authzRevisionId: string;
  authzVersion: number;
  scopeDataVersion: string;
}

export interface NativeAuthorizationDecision {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeAuthorizationDecision;
  explainId: string;
  allowed: boolean;
  identity: NativeAuthorizationIdentity;
  decisions: AuthorizationDecisionLayer[];
}

export interface NativeAuthorizationExplainRequest {
  key: string;
  capability: string;
  dataPolicyCode?: string;
  operation?: string;
  data?: Record<string, unknown>;
}

export interface NativeAuthorizationBatchRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeAuthorizationBatchRequest;
  requests: NativeAuthorizationExplainRequest[];
}

export interface NativeAuthorizationBatchResult {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeAuthorizationBatchResult;
  identity: NativeAuthorizationIdentity;
  items: Array<{
    key: string;
    decision: NativeAuthorizationDecision;
  }>;
}

export type DirectoryEntryKind = "department" | "user";

export interface DirectoryEntry {
  kind: DirectoryEntryKind;
  id: string;
  label: string;
  /** Complete value persisted by user/department fields without a later lookup. */
  snapshot: UserReferenceValue | DepartmentReferenceValue;
  description?: string;
  parentId?: string;
  hasChildren?: boolean;
  path?: Array<{ id: string; label: string }>;
  selectable?: boolean;
}

export interface DirectoryResolveRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.directoryResolveRequest;
  kind: DirectoryEntryKind;
  ids: string[];
}

export interface DirectorySearchResult {
  schemaVersion: typeof SCHEMA_VERSIONS.directorySearchResult;
  kind: DirectoryEntryKind;
  items: DirectoryEntry[];
  total: number;
}

export interface DirectoryEntryPage {
  schemaVersion: typeof SCHEMA_VERSIONS.directoryEntryPage;
  kind: DirectoryEntryKind;
  items: Array<DirectoryEntry & { selectable: boolean }>;
  nextCursor: string | null;
}

export interface NativeScopeValueResolveRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeScopeValueResolveRequest;
  dimensionCode: string;
  operation: "create" | "update";
  values: string[];
}

export interface NativeSelectorEnvironment {
  id: string;
  key: DeploymentEnvironment;
  activeAppVersionId: string;
  headRevision: number;
  authzRevisionId: string;
  authzVersion: number;
  scopeDataVersion: string;
}

export interface NativeScopeValuePage {
  schemaVersion: typeof SCHEMA_VERSIONS.nativeScopeValuePage;
  environment: NativeSelectorEnvironment;
  resourceCode: string;
  fieldCode: string;
  dimensionCode: string;
  operation: "create" | "update";
  items: Array<{ value: string; label: string; selectable: boolean }>;
  nextCursor: string | null;
}

export interface DataFieldSourceLaunchBinding {
  workflowCode: string;
  operationCode: string;
}

export interface DataFieldSourceQuery {
  schemaVersion: typeof SCHEMA_VERSIONS.dataFieldSourceQuery;
  operation: "create" | "update";
  keyword?: string;
  cursor?: string;
  /** Values for the source declaration's validated current-form bindings. */
  bindings?: Record<string, unknown>;
  /** 正式流程发起意图；平台核验字段绑定和动作能力，目标仍按当前用户读取。 */
  launch?: DataFieldSourceLaunchBinding;
}

export interface DataFieldSourcePage {
  schemaVersion: typeof SCHEMA_VERSIONS.dataFieldSourcePage;
  environment: NativeSelectorEnvironment;
  resourceCode: string;
  fieldCode: string;
  sourceResourceCode: string;
  operation: "create" | "update";
  items: ResourceReferenceValue[];
  nextCursor: string | null;
}

export interface DataRef {
  schemaVersion: typeof SCHEMA_VERSIONS.dataRef;
  appCode: string;
  resource: string;
  recordId: string;
  revision: number;
  environmentKey?: string;
}

export const DATA_FIELD_TYPES = [
  "text.short",
  "text.long",
  "text.rich",
  "number.integer",
  "number.decimal",
  "boolean",
  "date",
  "time",
  "datetime",
  "date-range",
  "datetime-range",
  "option.single",
  "option.multiple",
  "cascade.single",
  "cascade.multiple",
  "user.single",
  "user.multiple",
  "department.single",
  "department.multiple",
  "resource-ref.single",
  "resource-ref.multiple",
  "image",
  "signature",
  "address",
  "location",
  "uuid",
  "json",
  "file",
  "serial-number",
  "subtable",
] as const;

export type DataFieldType = (typeof DATA_FIELD_TYPES)[number];

export type DataRangeBoundary = "closed" | "half-open";

export interface DataFieldDefinition {
  code: string;
  type: DataFieldType;
  nullable?: boolean;
  indexed?: boolean;
  /** Static options are part of the authoritative data contract. */
  options?: DataFieldOption[];
  /** Dynamic same-application source for resource-reference fields. */
  source?: DataFieldResourceSource;
  maxLength?: number;
  precision?: number;
  scale?: number;
  /** Inclusive numeric lower bound. Only valid for number fields. */
  min?: number;
  /** Inclusive numeric upper bound. Only valid for number fields. */
  max?: number;
  /** Required for date-range/datetime-range and forbidden for every other type. */
  rangeBoundary?: DataRangeBoundary;
  timePrecision?: "minute" | "second";
  file?: {
    maxCount?: number;
    maxSizeMb?: number;
    accept?: string[];
  };
  serial?: {
    prefix?: string;
    digits?: number;
    start?: number;
  };
  subtable?: {
    resourceCode: string;
    foreignKey: string;
    orderField: string;
    maxRows?: number;
  };
}

export interface DataFieldPolicy {
  read?: string[];
  create?: string[];
  update?: string[];
  mask?: "omit" | "null";
}

export type DataResourceInvariantOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

/**
 * A bounded same-record invariant. It deliberately cannot contain SQL,
 * JavaScript, paths, functions or cross-resource lookups.
 */
export interface DataResourceInvariant {
  code: string;
  message?: string;
  expression: {
    leftField: string;
    operator: DataResourceInvariantOperator;
    rightField: string;
  };
}

export interface DataResource {
  schemaVersion: typeof SCHEMA_VERSIONS.dataResource;
  id?: string;
  tenantId?: string;
  appCode: string;
  code: string;
  name: string;
  schema: {
    fields: DataFieldDefinition[];
  };
  invariants?: DataResourceInvariant[];
  /** Default UI metadata projected with the authoritative Data Resource. */
  surface?: DataResourceSurface;
  capabilities: {
    read: string;
    create: string;
    update: string;
    delete: string;
  };
  dataPolicyCode?: string | null;
  fieldPolicies: Record<string, DataFieldPolicy>;
  status?: "active" | "retired";
  revision?: number;
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export type DataQueryOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "between"
  | "has"
  | "hasAny"
  | "hasAll"
  | "overlaps"
  | "containedBy"
  | "jsonContains"
  | "isEmpty"
  | "isNotEmpty";

export type DataWhere =
  | { and: DataWhere[] }
  | { or: DataWhere[] }
  | { not: DataWhere }
  | {
      field: string;
      operator: DataQueryOperator;
      value?: unknown;
      path?: string;
    };

export interface DataQuery {
  schemaVersion: typeof SCHEMA_VERSIONS.dataQuery;
  select?: string[];
  where?: DataWhere;
  order?: Array<{
    field: string;
    direction?: "asc" | "desc";
    nulls?: "first" | "last";
  }>;
  limit?: number;
  offset?: number;
}

export interface DataExportRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.dataExportRequest;
  select?: string[];
  where?: DataWhere;
  order?: DataQuery["order"];
}

export interface DataPage<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  schemaVersion: typeof SCHEMA_VERSIONS.dataPage;
  resourceCode: string;
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type DataBatchQueryOperation =
  | {
      key: string;
      resourceCode: string;
      query: DataQuery;
      aggregate?: never;
    }
  | {
      key: string;
      resourceCode: string;
      aggregate: DataAggregateQuery;
      query?: never;
    };

export interface DataBatchQueryRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.dataBatchQuery;
  operations: DataBatchQueryOperation[];
}

export type DataBatchQueryItemResult<
  T extends Record<string, unknown> = Record<string, unknown>
> =
  | {
      key: string;
      resourceCode: string;
      ok: true;
      data: DataPage<T> | DataAggregatePage<T>;
    }
  | {
      key: string;
      resourceCode: string;
      ok: false;
      error: {
        code: string;
        status: number;
        retryable: boolean;
      };
    };

export interface DataBatchQueryResult<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  schemaVersion: typeof SCHEMA_VERSIONS.dataBatchQueryResult;
  results: DataBatchQueryItemResult<T>[];
}

export interface DataRecord<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  schemaVersion: typeof SCHEMA_VERSIONS.dataRecord;
  resourceCode: string;
  data: T;
}

export type DataAggregateMeasureType =
  | "count"
  | "countDistinct"
  | "sum"
  | "avg"
  | "min"
  | "max";

export interface DataAggregateQuery {
  schemaVersion: typeof SCHEMA_VERSIONS.dataAggregateQuery;
  dimensions?: Array<{
    field: string;
    as: string;
    bucket?: "day" | "week" | "month" | "quarter" | "year";
  }>;
  measures: Array<{
    type: DataAggregateMeasureType;
    field?: string;
    as: string;
  }>;
  where?: DataWhere;
  order?: Array<{
    field: string;
    direction?: "asc" | "desc";
    nulls?: "first" | "last";
  }>;
  limit?: number;
  offset?: number;
  /** IANA calendar zone for datetime buckets, validated by the platform. Defaults to UTC. */
  timeZone?: string;
}

export interface DataAggregatePage<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  schemaVersion: typeof SCHEMA_VERSIONS.dataAggregatePage;
  resourceCode: string;
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface DataAuditEntry {
  id: string;
  operation: "created" | "updated" | "deleted";
  recordId: string;
  revision: number;
  actor: EventActor;
  actorDisplay?: {
    displayName: string;
    avatarUrl?: string;
  };
  correlation: {
    eventId: string;
    requestId: string | null;
    traceId: string | null;
    environmentKey: DeploymentEnvironment;
    appVersionId: string | null;
    environmentHeadRevision: number | null;
    capturePlanRevision: number | null;
    cause: EventCause;
  };
  changes: Record<string, DataEventFieldChange>;
  projection: Record<string, unknown | EventValueDigest>;
  occurredAt: IsoDateTime;
}

export interface DataAuditPage {
  schemaVersion: typeof SCHEMA_VERSIONS.dataAuditPage;
  resourceCode: string;
  recordId: string;
  items: DataAuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface DataFileRef {
  schemaVersion: typeof SCHEMA_VERSIONS.dataFileRef;
  id: string;
  name: string;
  size: number;
  contentType: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export type DataImageRef = DataFileRef & ManagedImageValue;

export type DataFieldValue<T extends DataFieldType> = T extends
  | "text.short"
  | "text.long"
  | "text.rich"
  ? string
  : T extends "number.integer" | "number.decimal"
  ? number
  : T extends "boolean"
  ? boolean
  : T extends "date" | "time" | "datetime"
  ? string
  : T extends "date-range" | "datetime-range"
  ? DateRangeValue
  : T extends "option.single"
  ? LabeledValue
  : T extends "option.multiple"
  ? LabeledValue[]
  : T extends "cascade.single"
  ? CascadePathValue
  : T extends "cascade.multiple"
  ? CascadePathValue[]
  : T extends "user.single"
  ? UserReferenceValue
  : T extends "user.multiple"
  ? UserReferenceValue[]
  : T extends "department.single"
  ? DepartmentReferenceValue
  : T extends "department.multiple"
  ? DepartmentReferenceValue[]
  : T extends "resource-ref.single"
  ? ResourceReferenceValue
  : T extends "resource-ref.multiple"
  ? ResourceReferenceValue[]
  : T extends "file"
  ? DataFileRef[]
  : T extends "image"
  ? DataImageRef[]
  : T extends "signature"
  ? StableSignatureValue
  : T extends "address"
  ? StableAddressValue
  : T extends "location"
  ? StableLocationValue
  : T extends "uuid" | "serial-number"
  ? string
  : T extends "subtable"
  ? Array<Record<string, unknown>>
  : unknown;

export interface DataFileUploadPlan {
  schemaVersion: typeof SCHEMA_VERSIONS.dataFileUploadPlan;
  resourceCode: string;
  fieldCode: string;
  file: DataFileRef;
  uploadMethod: "PUT";
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: IsoDateTime;
}

export interface DataFileCopyRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.dataFileCopyRequest;
  idempotencyKey: string;
  source: {
    resourceCode: string;
    fieldCode: string;
    fileId: string;
    recordId: string;
  };
  target: {
    resourceCode: string;
    fieldCode: string;
  };
}

export interface DataFileCopyReceipt {
  schemaVersion: typeof SCHEMA_VERSIONS.dataFileCopyReceipt;
  receiptId: string;
  status: "succeeded" | "retryable";
  idempotencyKey: string;
  source: DataFileCopyRequest["source"];
  target: DataFileCopyRequest["target"] & {
    fileId: string | null;
    file: DataFileRef | null;
  };
  attempt: number;
  createdAt: IsoDateTime | null;
  updatedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  errorCode: string | null;
}

export type DataFilePreviewType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "spreadsheet"
  | "text"
  | "office"
  | "download";

export type DataFilePreviewRenderMode =
  | "inline"
  | "image-transcode"
  | "image-heic"
  | "pdfjs"
  | "excel-basic"
  | "excel-client"
  | "text"
  | "docx-html"
  | "download";

export interface DataFilePreview {
  schemaVersion: typeof SCHEMA_VERSIONS.dataFilePreview;
  resourceCode: string;
  file: DataFileRef;
  extension: string;
  previewType: DataFilePreviewType;
  renderMode: DataFilePreviewRenderMode;
  previewSurface: "media" | "document" | "download";
  previewProvider: "browser" | "platform" | "none";
  canPreview: boolean;
  canDownload: true;
  unsupportedReason?: string;
}

export interface DataTransactionOperationReference {
  operationIndex: number;
  field: "id";
}

export type DataTransactionOperation =
  | {
      operation: "create";
      resourceCode: string;
      data: Record<string, unknown>;
    }
  | {
      operation: "update";
      resourceCode: string;
      id: string;
      expectedRevision: number;
      data: Record<string, unknown>;
    }
  | {
      operation: "delete";
      resourceCode: string;
      id: string;
      expectedRevision: number;
    }
  | {
      operation: "increment";
      resourceCode: string;
      id: string;
      field: string;
      amount: number;
    }
  | {
      operation: "emitEvent";
      eventType: string;
      subject?: string;
      data: Record<string, unknown>;
    };

export type DataTransactionRecordAssertion =
  | {
      kind: "value";
      field: string;
      operator: DataQueryOperator;
      value?: unknown;
      path?: string;
    }
  | {
      kind: "field";
      leftField: string;
      operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
      rightField: string;
    }
  | {
      /** Compare one declared datetime field with database transaction time. */
      kind: "database-now";
      field: string;
      operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
    };

export type DataTransactionGuard =
  | {
      /** 仅供声明了 platformAccess.roleAssertions 的受信业务动作使用。 */
      kind: "role-member";
      userId: string;
      roleCode: string;
      errorCode: string;
    }
  | {
      kind: "query-empty";
      resourceCode: string;
      lockKey: string;
      errorCode: string;
      where: DataWhere;
    }
  | {
      kind: "record-assert";
      resourceCode: string;
      lockKey: string;
      errorCode: string;
      id: string;
      assertions: DataTransactionRecordAssertion[];
    }
  | {
      kind: "record-exists";
      resourceCode: string;
      lockKey: string;
      errorCode: string;
      id: string;
    }
  | {
      kind: "record-match";
      resourceCode: string;
      lockKey: string;
      errorCode: string;
      id: string;
      assertions: DataTransactionRecordAssertion[];
    };

export interface DataTransactionRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.dataTransactionRequest;
  idempotencyKey: string;
  guards?: DataTransactionGuard[];
  operations: DataTransactionOperation[];
}

export interface DataTransactionResult {
  schemaVersion: typeof SCHEMA_VERSIONS.dataTransactionResult;
  idempotencyKey: string;
  /** Database transaction time used by every dynamic guard assertion. */
  evaluatedAt?: IsoDateTime;
  replayed: boolean;
  items: Array<
    | {
        index: number;
        resourceCode: string;
        operation: "create" | "update" | "delete" | "increment";
        id: string;
        revision: number;
      }
    | {
        index: number;
        operation: "emitEvent";
        eventType: string;
        eventId: string;
      }
  >;
}

export interface CloudEvent<
  TData extends Record<string, unknown> = Record<string, unknown>
> {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  subject?: string;
  time: IsoDateTime;
  datacontenttype: "application/json";
  dataschema?: string;
  data: TData;
  tenantid: string;
  appcode: string;
  environment: string;
  traceid?: string;
  schemaversion: string;
}

export const DATA_EVENT_TYPES_V2 = [
  "openxiangda.data.record.created.v2",
  "openxiangda.data.record.updated.v2",
  "openxiangda.data.record.deleted.v2",
] as const;

export type DataEventTypeV2 = (typeof DATA_EVENT_TYPES_V2)[number];

export const WORKFLOW_EVENT_TYPES_V2 = [
  "openxiangda.workflow.instance.started.v2",
  "openxiangda.workflow.instance.completed.v2",
  "openxiangda.workflow.instance.rejected.v2",
  "openxiangda.workflow.instance.returned.v2",
  "openxiangda.workflow.instance.resumed.v2",
  "openxiangda.workflow.instance.withdrawn.v2",
  "openxiangda.workflow.instance.terminated.v2",
  "openxiangda.workflow.instance.cc_added.v2",
  "openxiangda.workflow.task.created.v2",
  "openxiangda.workflow.task.assigned.v2",
  "openxiangda.workflow.task.assignment_pending.v2",
  "openxiangda.workflow.task.assignment_resolution_failed.v2",
  "openxiangda.workflow.task.approved.v2",
  "openxiangda.workflow.task.completed.v2",
  "openxiangda.workflow.task.rejected.v2",
  "openxiangda.workflow.task.returned.v2",
  "openxiangda.workflow.task.resubmitted.v2",
  "openxiangda.workflow.task.transferred.v2",
  "openxiangda.workflow.task.reassigned.v2",
  "openxiangda.workflow.task.delegated.v2",
  "openxiangda.workflow.task.assignee_added.v2",
  "openxiangda.workflow.task.cancelled.v2",
  "openxiangda.workflow.participant.activated.v2",
  "openxiangda.workflow.participant.completed.v2",
  "openxiangda.workflow.participant.rejected.v2",
  "openxiangda.workflow.participant.returned.v2",
  "openxiangda.workflow.participant.transferred.v2",
  "openxiangda.workflow.participant.reassigned.v2",
  "openxiangda.workflow.participant.delegated.v2",
  "openxiangda.workflow.participant.added.v2",
  "openxiangda.workflow.participant.suspended.v2",
  "openxiangda.workflow.participant.resumed.v2",
  "openxiangda.workflow.participant.cancelled.v2",
] as const;

export type WorkflowEventTypeV2 = (typeof WORKFLOW_EVENT_TYPES_V2)[number];

export type EventProducerKind =
  | "data"
  | "app"
  | "workflow"
  | "timer"
  | "date"
  | "system";

export interface EventCatalogEntry {
  schemaVersion: typeof SCHEMA_VERSIONS.eventCatalog;
  eventType: string;
  owner: "platform" | "application";
  dataSchemaVersion: string;
  producerKinds: EventProducerKind[];
  subjectPattern: string;
  orderingKey: "none" | "record" | "workflow_instance";
  replayable: boolean;
  maxDataBytes: number;
  sensitiveFields: string[];
  status: "active" | "deprecated";
}

export interface EventSchemaDefinition {
  schemaVersion: typeof SCHEMA_VERSIONS.eventSchema;
  eventType: string;
  dataSchemaVersion: string;
  jsonSchema: Record<string, unknown>;
  schemaDigest: string;
  sensitiveFields: readonly string[];
  owner: "platform" | "application";
}

export interface ApplicationEventSchemaDeclaration {
  eventType: string;
  dataSchemaVersion: string;
  jsonSchema: Record<string, unknown>;
  sensitiveFields?: string[];
}

export interface EventValueDigest {
  kind: "digest";
  valueType: string;
  bytes: number;
  sha256: string;
  truncated: true;
  preview?: string;
}

export interface DataEventFieldChange {
  before?: unknown | EventValueDigest;
  after?: unknown | EventValueDigest;
}

export interface EventActor {
  principalType:
    | "user"
    | "user_union"
    | "application"
    | "developer"
    | "workflow"
    | "timer"
    | "system";
  subjectId: string;
}

export interface EventCause {
  eventId: string | null;
  subscriptionCode: string | null;
  depth: number;
}

export interface DataRecordEventData extends Record<string, unknown> {
  resourceCode: string;
  recordId: string;
  operation: "created" | "updated" | "deleted";
  revision: number;
  changedFields: string[];
  changes: Record<string, DataEventFieldChange>;
  projection: Record<string, unknown | EventValueDigest>;
  actor: EventActor;
  cause: EventCause;
}

export interface WorkflowFactEventData extends Record<string, unknown> {
  workflowCode: string;
  definitionVersion: number;
  bindingVersion: number;
  instanceId: string;
  generation: number;
  businessKey: string;
  taskId: string | null;
  participantId?: string | null;
  instanceSequence: number;
  revision: number;
  dataRef: Record<string, unknown>;
  dataRevision: string;
  actor: EventActor;
  cause: EventCause;
}

export interface EventSubjectFilter {
  equals?: string;
  prefix?: string;
}

export interface EventChangedFieldsFilter {
  anyOf?: string[];
  allOf?: string[];
  noneOf?: string[];
}

export interface EventValuePredicate {
  eq?: unknown;
  ne?: unknown;
  in?: unknown[];
  notIn?: unknown[];
  exists?: boolean;
}

export interface EventChangeFilter {
  field: string;
  before?: EventValuePredicate;
  after?: EventValuePredicate;
}

export type EventFilterCondition =
  | { change: EventChangeFilter }
  | { all: EventFilterCondition[] }
  | { any: EventFilterCondition[] }
  | { not: EventFilterCondition };

export interface EventSubscriptionFilter {
  resourceCodes?: string[];
  subject?: EventSubjectFilter;
  changedFields?: EventChangedFieldsFilter;
  changes?: EventChangeFilter[];
  where?: EventFilterCondition;
}

export interface EventSubscriptionPayload {
  includeChanges: boolean;
  fields: string[];
}

export interface EventDeliveryPolicy {
  timeoutMs: number;
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  ordering: "none" | "record" | "workflow-instance";
  concurrency: number;
}

export interface EventSubscription {
  schemaVersion: typeof SCHEMA_VERSIONS.eventSubscription;
  id: string;
  appCode: string;
  code: string;
  description: string | null;
  eventTypes: string[];
  filter: EventSubscriptionFilter;
  payload: EventSubscriptionPayload;
  environmentKey: string;
  endpointPath: string;
  delivery: EventDeliveryPolicy;
  status: "active" | "paused";
  revision: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface EventDelivery {
  schemaVersion: typeof SCHEMA_VERSIONS.eventDelivery;
  id: string;
  eventId: string;
  eventType: string;
  subject: string | null;
  subscriptionId: string;
  subscriptionCode: string;
  status:
    | "pending"
    | "delivering"
    | "retry_wait"
    | "succeeded"
    | "dead_lettered";
  attempt: number;
  nextAttemptAt: IsoDateTime | null;
  deliveredAt: IsoDateTime | null;
  responseStatus: number | null;
  responseBodyPreview: string | null;
  lastError: string | null;
  replayOfDeliveryId: string | null;
  correlation?: {
    eventId: string;
    requestId: string | null;
    traceId: string | null;
    environmentKey: string;
    eventOccurredAt: IsoDateTime | null;
    outboxStatus: string | null;
    outboxAttempts: number;
    outboxError: string | null;
  };
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface EventReceiptCommand {
  schemaVersion: typeof SCHEMA_VERSIONS.eventReceiptCommand;
  action: "claim" | "complete" | "release";
  tenantId: string;
  appCode: string;
  environmentKey: string;
  subscriptionCode: string;
  eventId: string;
  deliveryId: string;
  claimToken?: string;
}

export interface EventReceiptResult {
  schemaVersion: typeof SCHEMA_VERSIONS.eventReceiptResult;
  outcome: "claimed" | "duplicate" | "completed" | "released";
  eventId: string;
  deliveryId: string;
  status: "processing" | "succeeded" | "released";
  claimToken: string | null;
  attempts: number;
  leaseExpiresAt: IsoDateTime;
  completedAt: IsoDateTime | null;
}

export interface EventDeliveryAck {
  schemaVersion: typeof SCHEMA_VERSIONS.eventDeliveryAck;
  accepted: true;
  duplicate: boolean;
  eventId: string;
  deliveryId: string;
  receiptStatus: "succeeded";
}

export interface TimerSubscription {
  schemaVersion: typeof SCHEMA_VERSIONS.timerSubscription;
  id: string;
  appCode: string;
  code: string;
  eventType: string;
  cronExpression: string;
  timezone: string;
  payload: Record<string, unknown>;
  misfirePolicy: "coalesce_one";
  environmentKey: string;
  status: "active" | "paused";
  revision: number;
  nextDueAt: IsoDateTime | null;
  lastFiredAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface DateTrigger {
  schemaVersion: typeof SCHEMA_VERSIONS.dateTrigger;
  id: string;
  appCode: string;
  code: string;
  resourceCode: string;
  field: string;
  offset: string;
  eventType: string;
  payload: Record<string, unknown>;
  environmentKey: string;
  status: "active" | "paused";
  revision: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type WorkflowApprovalMode = "single" | "any" | "all" | "sequence";
export type WorkflowFieldPolicy =
  | "hidden"
  | "readonly"
  | "edit"
  | "edit_required";
export type WorkflowCommand =
  | "approve"
  | "reject"
  | "return"
  | "transfer"
  | "delegate"
  | "add_assignee"
  | "resubmit"
  | "withdraw"
  | "terminate"
  | "cc"
  | "admin_reassign"
  | "admin_override"
  | "retry_resolution";

export type WorkflowExpression =
  | { op: "literal"; value: unknown }
  | { op: "path"; path: string }
  | {
      op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
      left: WorkflowExpression;
      right: WorkflowExpression;
    }
  | { op: "and" | "or"; values: WorkflowExpression[] }
  | { op: "not" | "exists"; value: WorkflowExpression };

export interface WorkflowApprovalNode {
  id: string;
  kind: "approval";
  title: string;
  binding: string;
  mode: WorkflowApprovalMode;
  onApprove: string;
  onReject: string;
  allowedOperations?: WorkflowCommand[];
  returnTargets?: string[];
  fieldPolicy?: {
    default?: WorkflowFieldPolicy;
    fields?: Record<string, WorkflowFieldPolicy>;
  };
}

export interface WorkflowConditionNode {
  id: string;
  kind: "condition";
  title?: string;
  branches: Array<{
    when: WorkflowExpression;
    target: string;
    label?: string;
  }>;
  otherwise: string;
}

export interface WorkflowEndNode {
  id: string;
  kind: "end";
  title: string;
  outcome: string;
}

export type WorkflowNode =
  | WorkflowApprovalNode
  | WorkflowConditionNode
  | WorkflowEndNode;

export interface WorkflowDefinition {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowDefinition;
  code: string;
  title: string;
  acceptedCommandDeactivationPolicy:
    | "finish-pinned"
    | "cancel-on-deactivate";
  subject: WorkflowSubjectDefinition;
  startAt: string;
  inputSchema: Record<string, unknown> & {
    type: "object";
    additionalProperties: false;
  };
  organizationContext?: {
    department?: {
      source:
        | "none"
        | "user_primary_department"
        | "choose_if_multiple"
        | "always_choose"
        | "fixed"
        | "from_input"
        | "from_role_scope";
      required?: boolean;
      value?: string;
      path?: string;
      /** Scope dimension used by from_role_scope; defaults to `department`. */
      dimension?: string;
    };
  };
  nodes: Record<string, WorkflowNode>;
}

export interface WorkflowSubjectDefinition {
  resourceCode: string;
  factProjection: Record<string, string>;
  /** Read-only business fields projected on the workflow task/instance Surface. */
  summaryFields?: string[];
}

export type WorkflowBindingProvider =
  | "fixed_users"
  | "initiator"
  | "input_users"
  | "form_field_users"
  | "department_supervisor"
  | "app_role"
  | "app_role_in_scope"
  | "business_relation"
  | "previous_node_actor"
  | "initiator_select"
  | "application_provider";

export interface WorkflowBindingEntry {
  provider: WorkflowBindingProvider;
  users?: string[];
  inputPath?: string;
  departmentIdFrom?: string;
  level?: number;
  fallbackToAncestorSupervisor?: boolean;
  roleCode?: string;
  scope?: { dimension: string; valueFrom?: string; value?: string };
  relationCode?: string;
  resourceCode?: string;
  resourceIdFrom?: string;
  providerCode?: string;
  /** Applies to every provider; defaults to 1. */
  min?: number;
  /** Applies to every provider; defaults to 200 and cannot exceed 200. */
  max?: number;
  /** Long-term delegation is enabled by default for eligible role-bound providers. */
  delegatable?: boolean;
}

export interface WorkflowBinding {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowBinding;
  workflowCode: string;
  bindings: Record<string, WorkflowBindingEntry>;
}

/** Platform-owned runtime parameters; immutable workflow topology remains code-owned. */
export interface WorkflowNodeConfigurationPatch {
  title?: string;
  description?: string;
  assignee?:
    | { provider: "fixed_users"; users: string[] }
    | { provider: "app_role" | "app_role_in_scope"; roleCode: string };
}

export interface WorkflowNodeConfigurationState {
  revision: number;
  patch: WorkflowNodeConfigurationPatch | null;
  updatedBy: string | null;
  updatedAt: IsoDateTime | null;
}

export interface WorkflowNodeConfigurations {
  schemaVersion: "openxiangda.workflow-node-configurations/v2";
  workflowCode: string;
  definitionVersion: number;
  bindingVersion: number;
  effect: "future_node_entries_keep_existing_tasks";
  nodes: Array<{
    nodeId: string;
    kind: WorkflowNode["kind"];
    defaults: { title: string; binding?: WorkflowBindingEntry };
    configuration: WorkflowNodeConfigurationState;
    effective: {
      revision: number;
      title: string;
      description?: string;
      binding?: WorkflowBindingEntry;
      bindingDigest?: string;
    };
  }>;
  principals: {
    users: Array<{ value: string; label: string }>;
    roles: Array<{ code: string; name: string }>;
  };
  history: Array<{
    id: string;
    nodeId: string;
    revision: number;
    actorUserId: string;
    reason: string;
    before: WorkflowNodeConfigurationState;
    after: WorkflowNodeConfigurationState & { workflowCode: string; nodeId: string; effect: "future_node_entries_keep_existing_tasks" };
    createdAt: IsoDateTime;
  }>;
}

export type ApplicationAdministrationPage = "overview" | "data" | "workflows" | "instances" | "automation" | "roles" | "versions" | "runtime" | "audit";

export interface ApplicationAdministrationContext {
  schemaVersion: "openxiangda.application-admin-context/v2";
  appCode: string;
  environmentKey: DeploymentEnvironment;
  environmentId: string;
  /** No active version exists when unpublished is true. */
  appVersionId: string | null;
  headRevision: number | null;
  userId: string;
  authorization: "application_super_admin" | "delegated_role_manager" | "application_management";
  authorizedPages: ApplicationAdministrationPage[];
  unpublished?: boolean;
  capabilities: Record<string, boolean>;
  limits: { atomicOperations: number; requestBytes: number; importRows?: number; importBytes?: number };
}

export interface WorkflowCandidatePrincipal {
  userId: string;
  roleSubjectKey?: string;
  roleSubjectKind?: "membership" | "super_admin";
  roleSubjectRevision?: number;
  roleCode?: string;
  roleName?: string;
  displayName?: string;
  source: string;
  delegationId?: string;
  delegatedFromUserId?: string;
  delegatedFromRoleSubjectKey?: string;
  delegatedFromRoleSubjectRevision?: number;
  delegationValidFrom?: IsoDateTime;
  delegationValidTo?: IsoDateTime;
}

export interface WorkflowPreparationOption {
  value: string;
  label: string;
  description?: string;
}

export type WorkflowPreparationRequirement =
  | {
      id: string;
      kind: "choose_department";
      title: string;
      required: boolean;
      candidates: WorkflowPreparationOption[];
    }
  | {
      id: string;
      kind: "choose_approvers";
      title: string;
      required: boolean;
      min: number;
      max: number;
      candidates: WorkflowCandidatePrincipal[];
    }
  | {
      id: string;
      kind: string;
      title: string;
      required?: boolean;
      candidates?: Array<
        WorkflowPreparationOption | WorkflowCandidatePrincipal
      >;
      min?: number;
      max?: number;
      inputSchema?: Record<string, unknown>;
      uiSchema?: Record<string, unknown>;
    };

export interface WorkflowPreviewNode {
  nodeId: string;
  kind: WorkflowNode["kind"];
  title?: string;
  result?: Record<string, unknown>;
  assignees: WorkflowCandidatePrincipal[];
  assignmentExplain: Array<Record<string, unknown>>;
}

export interface WorkflowPreparation {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowPreparation;
  preparationId: string;
  status: "needs_input" | "ready";
  requirements: WorkflowPreparationRequirement[];
  preparationToken: string | null;
  preview: {
    certainty: "partial" | "complete";
    nodes: WorkflowPreviewNode[];
    outcome: string | null;
    warnings: Array<Record<string, unknown>>;
  };
  expiresAt: IsoDateTime;
  definitionVersion: number;
  bindingVersion: number;
  dataRevision: number;
  factDigest: Sha256Digest;
  inputHash: Sha256Digest;
}

export interface WorkflowDataRef {
  resourceCode: string;
  id: string;
}

export interface WorkflowPrepareStartInput {
  environmentKey?: string;
  businessKey: string;
  dataRef: WorkflowDataRef;
  dataRevision: number;
  facts: Record<string, unknown>;
  answers?: Record<string, unknown>;
}

export type BusinessProcessCommandStatus =
  | "accepted"
  | "resolving"
  | "awaiting_input"
  | "ready"
  | "starting"
  | "started"
  | "retry_wait"
  | "dead_letter"
  | "cancelled";

export type BusinessProcessDataOperation =
  | {
      key: string;
      kind: "create";
      resourceCode: string;
      data: Record<string, unknown>;
    }
  | {
      key: string;
      kind: "update";
      resourceCode: string;
      id: string;
      expectedRevision: number;
      data: Record<string, unknown>;
    }
  | {
      key: string;
      kind: "delete";
      resourceCode: string;
      id: string;
      expectedRevision: number;
    }
  | {
      key: string;
      kind: "increment";
      resourceCode: string;
      id: string;
      field: string;
      amount: number;
    };

/** Wire command accepted only from a verified Named Action. */
export interface BusinessProcessCommit {
  schemaVersion: typeof SCHEMA_VERSIONS.businessProcessCommit;
  environmentKey: DeploymentEnvironment;
  idempotencyKey: string;
  data: {
    guards?: DataTransactionGuard[];
    operations: BusinessProcessDataOperation[];
  };
  workflow: {
    workflowCode: string;
    subject: { fromOperation: string };
    answers?: Record<string, unknown>;
  };
}

/** Browser-safe command for a compiler-owned standalone/hidden-handoff operation. */
export interface StandardProcessCommit {
  schemaVersion: typeof SCHEMA_VERSIONS.standardProcessCommit;
  environmentKey: DeploymentEnvironment;
  workflowCode: string;
  idempotencyKey: string;
  mutation:
    | { kind: "create"; data: Record<string, unknown> }
    | {
        kind: "update";
        id: string;
        expectedRevision: number;
        data: Record<string, unknown>;
      };
  answers?: Record<string, unknown>;
}

export interface BusinessProcessCommand {
  schemaVersion: typeof SCHEMA_VERSIONS.businessProcessCommand;
  id: string;
  appCode: string;
  environmentKey: DeploymentEnvironment;
  operationCode: string;
  idempotencyKey: string;
  workflowCode: string;
  status: BusinessProcessCommandStatus;
  revision: number;
  subject: {
    resourceCode: string;
    id: string;
    dataRevision: number;
    factDigest: Sha256Digest;
  };
  definitionVersion: number;
  bindingVersion: number;
  requirements: WorkflowPreparationRequirement[];
  answers: Record<string, unknown>;
  preview: Record<string, unknown>;
  workflowInstanceId: string | null;
  attemptCount: number;
  lastError: { code: string; preview: string } | null;
  replayed: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Immutable idempotency receipt plus the current durable command projection. */
export interface BusinessProcessReceipt {
  schemaVersion: typeof SCHEMA_VERSIONS.businessProcessReceipt;
  receiptId: string;
  commandId: string;
  operationCode: string;
  idempotencyKey: string;
  requestDigest: string;
  command: BusinessProcessCommand;
  createdAt: IsoDateTime | null;
}

/** Revision-cursor read; the platform remains the owner of command progress. */
export interface BusinessProcessPoll {
  schemaVersion: typeof SCHEMA_VERSIONS.businessProcessPoll;
  command: BusinessProcessCommand;
  changed: boolean;
  terminal: boolean;
  retryable: boolean;
  cursor: { afterRevision: number; revision: number };
  nextPoll: { afterRevision: number; retryAfterMs: number } | null;
}

export interface BusinessProcessAnswer {
  schemaVersion: typeof SCHEMA_VERSIONS.businessProcessAnswer;
  expectedRevision: number;
  answers: Record<string, unknown>;
}

export interface BusinessProcessRetry {
  schemaVersion: typeof SCHEMA_VERSIONS.businessProcessRetry;
  expectedRevision: number;
}

export interface ProcessCommandResumePointer {
  method: "GET" | "POST";
  href: string;
  expectedRevision?: number;
}

export interface ProcessCommandSurface {
  schemaVersion: typeof SCHEMA_VERSIONS.processCommandSurface;
  surfaceRevision: Sha256Digest;
  command: BusinessProcessCommand;
  subject: {
    resourceCode: string;
    recordId: string;
    dataRevision: number;
    form: {
      kind: "native-resource-form";
      resourceCode: string;
      recordId: string;
    };
  };
  requirements: WorkflowPreparationRequirement[];
  resume: {
    status: ProcessCommandResumePointer;
    surface: ProcessCommandResumePointer;
    answer: ProcessCommandResumePointer | null;
    retry: ProcessCommandResumePointer | null;
    navigationTarget: {
      kind: "PLATFORM_ROUTE";
      routeCode: "resource.record";
      appCode: string;
      pathParams: { resourceCode: string; recordId: string };
      query: { processCommandId: string };
      access: "AUTHENTICATED";
    };
    desktop: string;
    mobile: string;
  };
}

export interface WorkflowInstance {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowInstance;
  engineVersion: "2.0";
  id: string;
  appCode: string;
  environmentId: string;
  environmentKey: string;
  workflowCode: string;
  definitionVersion: number;
  bindingVersion: number;
  businessKey: string;
  generation: number;
  status:
    | "running"
    | "returned"
    | "approved"
    | "rejected"
    | "withdrawn"
    | "terminated"
    | "error";
  initiatorUserId: string;
  initiatorAuthorizationDigest: Sha256Digest | null;
  dataRef: Record<string, unknown>;
  dataRevision: string;
  currentNodeId: string | null;
  outcome: string | null;
  version: number;
  eventSequence: number;
  startedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
}

export interface WorkflowTask {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowTask;
  engineVersion: "2.0";
  id: string;
  instanceId: string;
  workflowCode: string;
  businessKey: string;
  nodeId: string;
  title: string;
  status:
    | "assignment_pending"
    | "assigned"
    | "completed"
    | "rejected"
    | "returned"
    | "cancelled"
    | "expired";
  approvalMode: WorkflowApprovalMode;
  taskKind: "normal" | "return_review" | "resume";
  assignedRoleSubjectKey: string | null;
  activeParticipantId: string | null;
  participants: WorkflowTaskParticipant[];
  originTaskId: string | null;
  returnSessionId: string | null;
  version: number;
  dataRef: Record<string, unknown>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface WorkflowDetailNavigation {
  custom: boolean;
  desktopPath: string;
  mobilePath: string;
}

export type WorkflowWorkCenterView = 'pending' | 'handled' | 'created' | 'cc';
export interface WorkflowWorkCenterItem {
  itemKind: 'task' | 'instance';
  id: string;
  instanceId: string;
  taskId: string | null;
  workflowCode: string;
  workflowTitle: string | null;
  taskTitle: string | null;
  businessKey: string;
  resourceCode: string | null;
  recordId: string | null;
  title: string;
  status: string;
  instanceStatus: string;
  occurredAt: IsoDateTime;
  updatedAt: IsoDateTime;
  detailNavigation: WorkflowDetailNavigation;
}

export interface WorkflowTaskParticipant {
  id: string;
  userId: string;
  roleSubjectKey: string | null;
  roleSubjectKind: "membership" | "super_admin" | null;
  roleSubjectRevision: number | null;
  role: {
    code: string;
    name: string;
  } | null;
  kind: "primary" | "add_sign" | "transfer" | "delegate";
  status: "pending" | "active" | "approved" | "rejected" | "cancelled";
  required: boolean;
  outcome:
    | "approved"
    | "rejected"
    | "returned"
    | "resubmitted"
    | "transferred"
    | "delegated"
    | null;
  sourceParticipantId: string | null;
  delegationId: string | null;
  delegationValidFrom: IsoDateTime | null;
  delegationValidTo: IsoDateTime | null;
  createdByRoleSubjectKey: string | null;
  completedByRoleSubjectKey: string | null;
  createdAt: IsoDateTime;
  completedAt: IsoDateTime | null;
}

export interface WorkflowOperationSurface {
  key: WorkflowCommand | string;
  kind: "workflow_command" | "app_action";
  label: string;
  group:
    | "decision"
    | "task_collaboration"
    | "initiator"
    | "administration"
    | "app_action";
  audience: "participant" | "initiator" | "administrator" | "application";
  placement: "primary" | "secondary" | "overflow";
  emphasis: "primary" | "danger" | "warning" | "neutral";
  /** @deprecated Consume emphasis. Kept during the alpha package transition. */
  tone: string;
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
  inputSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
  execute: {
    method: "POST";
    href: string;
    idempotencyRequired: boolean;
  };
  refresh: string[];
}

export interface WorkflowSurfacePresentation {
  businessData: WorkflowBusinessData;
  businessDetail: WorkflowBusinessDetail;
  summary: {
    title: string;
    initiatorDisplayName: string;
    departmentDisplayName: string | null;
    submittedAt: IsoDateTime;
    businessNumber: string | null;
    /** Additive identity presentation for standard Workflow detail pages. */
    initiator?: WorkflowPersonPresentation;
  };
  [key: string]: unknown;
}

export interface WorkflowPersonPresentation {
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  departmentDisplayName: string | null;
}

export interface WorkflowNavigationTarget {
  kind: "resource_record";
  appCode: string;
  environmentKey: "preproduction" | "production";
  resourceCode: string;
  recordId: string;
  desktopPath: string;
  mobilePath: string;
}

export interface WorkflowSurface {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowSurface;
  protocolVersion: "workflow_surface_v2";
  surfaceRevision: Sha256Digest;
  engineVersion: "2.0";
  commandToken: string | null;
  commandTokenExpiresAt: IsoDateTime | null;
  instanceSequence: number;
  detailNavigation: WorkflowDetailNavigation;
  navigationTarget: WorkflowNavigationTarget | null;
  instance: WorkflowInstance | Record<string, unknown>;
  task: WorkflowTask | Record<string, unknown> | null;
  presentation: WorkflowSurfacePresentation;
  fieldPolicy: {
    default: WorkflowFieldPolicy;
    fields: Record<string, WorkflowFieldPolicy>;
  };
  operations: WorkflowOperationSurface[];
  extensions: Record<string, unknown>;
}

export interface WorkflowCommandInput {
  commandToken: string;
  idempotencyKey: string;
  input?: Record<string, unknown>;
}

/**
 * Result returned by a task or instance Workflow command.
 *
 * Task commands include `taskId` and may advance the instance. Instance
 * commands include `instanceId` and currently do not need to report an
 * `advanced` flag. Additional platform-owned result fields are preserved by
 * the SDK clients through the open index signature.
 */
export interface WorkflowCommandResult {
  taskId?: string | null;
  instanceId?: string | null;
  status: string;
  outcome?: string | null;
  nextNodeId?: string | null;
  advanced?: boolean;
  [key: string]: unknown;
}

export interface WorkflowLaunchSurface {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowLaunchSurface;
  protocolVersion: "workflow_launch_surface_v3";
  surfaceRevision: Sha256Digest;
  engineVersion: "2.0";
  appCode: string;
  environmentKey: DeploymentEnvironment;
  environmentId: string;
  workflowCode: string;
  title: string;
  launchMode: "standalone" | "hidden-handoff";
  /** Present for the legacy standard-process transport only. */
  processOperationCode?: string;
  subject: WorkflowSubjectDefinition;
  inputSchema: Record<string, unknown>;
  head: {
    workflowRevision: number;
    definitionVersion: number;
    bindingVersion: number;
    nativeRevision: number;
    contractRevisionId: string;
  };
  paths: {
    desktop: string;
    mobile: string;
  };
  /** Present for the legacy standard-process transport only. */
  commit?: {
    method: "POST";
    href: string;
    idempotencyRequired: true;
  };
  submission:
    | {
        kind: "standard-process";
        processOperationCode: string;
        commit: {
          method: "POST";
          href: string;
          idempotencyRequired: true;
        };
      }
    | {
        kind: "named-operation";
        create?: WorkflowNamedOperationLaunchIntent;
        existing?: WorkflowNamedOperationLaunchIntent;
        context: AppWorkflowLaunchContextDeclaration[];
      };
}

export interface WorkflowNamedOperationLaunchIntent {
  operationCode: string;
  method: "POST";
  href: string;
  requiredCapability: string;
  requestSchemaDigest: Sha256Digest;
  responseSchemaDigest: Sha256Digest;
  inputs: Record<string, AppWorkflowLaunchInputBindingDeclaration>;
  output: AppWorkflowNamedOperationOutputDeclaration;
}

export interface WorkflowTimelineFlowItem {
  key: string;
  nodeId: string | null;
  kind: "start" | WorkflowNode["kind"];
  title: string;
  status:
    | "completed"
    | "active"
    | "waiting"
    | "returned"
    | "cancelled"
    | "error";
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  assignees: Array<{
    userId: string;
    displayName: string;
    status?: string;
    outcome?: string | null;
    comment?: string | null;
    completedAt?: IsoDateTime | null;
    avatarUrl?: string | null;
    departmentDisplayName?: string | null;
  }>;
  operations: WorkflowTimelineItem[];
  result?: Record<string, unknown>;
}

export interface WorkflowTimelineItem {
  id: string;
  operation: string;
  operationLabel: string;
  actorUserId: string;
  actorDisplayName: string;
  actorAvatarUrl?: string | null;
  actorDepartmentDisplayName?: string | null;
  actingForUserId: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  severity: "normal" | "admin" | "security";
  createdAt: IsoDateTime;
}

export type WorkflowTimelineDisplayStatus =
  | "completed"
  | "active"
  | "waiting"
  | "returned"
  | "rejected"
  | "withdrawn"
  | "terminated"
  | "cancelled"
  | "error";

export interface WorkflowTimelineDisplayOperation {
  id: string;
  operation: string;
  operationLabel: string;
  actor: WorkflowPersonPresentation;
  actingForUserId: string | null;
  reason: string | null;
  severity: "normal" | "admin" | "security";
  occurredAt: IsoDateTime;
}

export interface WorkflowTimelineDisplayEntry {
  key: string;
  kind: "submission" | "node" | "planned_node" | "process_event";
  nodeId: string | null;
  nodeKind: string;
  title: string;
  status: WorkflowTimelineDisplayStatus;
  enteredAt: IsoDateTime | null;
  leftAt: IsoDateTime | null;
  primaryDisplayTime: IsoDateTime | null;
  people: WorkflowPersonPresentation[];
  operations: WorkflowTimelineDisplayOperation[];
  result: Record<string, unknown>;
  terminalReason: string | null;
}

export interface WorkflowTimelineDisplay {
  entries: WorkflowTimelineDisplayEntry[];
}

export interface WorkflowTimeline {
  engineVersion: "2.0";
  instanceId: string;
  flow: WorkflowTimelineFlowItem[];
  items: WorkflowTimelineItem[];
  /** Additive revision and display projection. Old clients may ignore these. */
  instanceSequence?: number;
  timelineRevision?: Sha256Digest;
  display?: WorkflowTimelineDisplay;
}

export interface WorkflowDetailTimeline extends WorkflowTimeline {
  instanceSequence: number;
  timelineRevision: Sha256Digest;
  display: WorkflowTimelineDisplay;
}

export interface WorkflowDetailSurfaceV2 {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowDetailSurface;
  protocolVersion: "workflow_detail_surface_v2";
  detailRevision: Sha256Digest;
  instanceSequence: number;
  timelineRevision: Sha256Digest;
  surface: WorkflowSurface;
  timeline: WorkflowDetailTimeline;
  currentStatus: {
    code: string;
    label: string;
    tone: string;
  };
  nodes: WorkflowTimelineDisplayEntry[];
  handlingRecords: WorkflowTimelineDisplayOperation[];
  operations: WorkflowOperationSurface[];
  navigationContext: {
    desktopReturnPath: string;
    mobileReturnPath: string;
  };
}

export interface WorkflowDelegation {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowDelegation;
  id: string;
  appCode: string;
  environmentKey: string;
  workflowCode: string | null;
  delegatorUserId: string;
  delegateUserId: string;
  delegatorRoleSubjectKey: string;
  delegateRoleSubjectKey: string;
  validFrom: IsoDateTime;
  validTo: IsoDateTime;
  status: "active" | "revoked" | "expired";
  reason: string;
  createdBy: string;
  createdAt: IsoDateTime;
  revokedAt: IsoDateTime | null;
}

export interface WorkflowDelegationTarget {
  roleSubjectKey: string;
  roleSubjectKind: "membership";
  roleSubjectRevision: number;
  userId: string;
  role: {
    code: string;
    name: string;
    isAppSuperAdmin: boolean;
  };
  scopeGrants: RoleAssignmentScopeGrant[];
  validFrom: IsoDateTime | null;
  validTo: IsoDateTime | null;
}

export interface WorkflowAssigneeProvider {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowAssigneeProvider;
  id: string;
  appCode: string;
  environmentKey: string;
  code: string;
  endpointPath: string;
  timeoutMs: number;
  status: "active" | "paused";
  signingSecretVersion: number;
  pendingSigningSecretVersion: number | null;
  rotationPending: boolean;
  revision: number;
  signingSecret?: string | null;
  signingSecretReturnedOnce?: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface WorkflowAssigneeRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowAssigneeRequest;
  requestId: string;
  providerCode: string;
  appCode: string;
  environmentKey: string;
  workflowCode: string;
  nodeId: string;
  businessKey: string;
  dataRef: WorkflowDataRef;
  dataRevision: number;
  definitionVersion: number;
  bindingVersion: number;
  factDigest: Sha256Digest;
  facts: Record<string, unknown>;
  organizationContext: Record<string, unknown>;
  initiator: WorkflowCandidatePrincipal;
  authzVersion: number;
}

export interface WorkflowAssigneeResponse {
  schemaVersion: typeof SCHEMA_VERSIONS.workflowAssigneeResponse;
  requestId: string;
  candidates: WorkflowCandidatePrincipal[];
}

export type AppArtifactKind = "frontend" | "backend" | "config" | "contracts";

export interface ApplicationContractCompatibility {
  appPackageSchemaVersion: string;
  configurationBundleSchemaVersion: string;
  contractBundleSchemaVersion: string;
  compilerContractVersion: string;
}

export const CURRENT_APPLICATION_CONTRACT = {
  appPackageSchemaVersion: SCHEMA_VERSIONS.appPackage,
  configurationBundleSchemaVersion: SCHEMA_VERSIONS.configurationBundle,
  contractBundleSchemaVersion: SCHEMA_VERSIONS.contractBundle,
  compilerContractVersion: OPENXIANGDA_COMPILER_CONTRACT_VERSION,
} as const satisfies ApplicationContractCompatibility;

export const CONFIGURATION_COMPATIBILITY_CAPABILITY =
  "configuration.compatibility-preflight" as const;


export type PlatformCapabilityCode =
  keyof typeof PLATFORM_CAPABILITY_CONTRACT_VERSIONS;

export interface RequiredPlatformCapabilityContract {
  code: PlatformCapabilityCode;
  contractVersion: string;
  usageDigest: PrefixedSha256Digest;
}

export interface PlatformFeatureCapabilityContract {
  contractVersion: string;
  status: "available" | "preview" | "planned";
  limits?: Record<string, number>;
}

export interface ConfigurationCompatibilityContract {
  schemaVersion: typeof SCHEMA_VERSIONS.configurationCompatibility;
  validatorDigest: Sha256Digest;
  capability: {
    code: typeof CONFIGURATION_COMPATIBILITY_CAPABILITY;
    version: string;
    status: "available";
  };
  requestSchemaVersion: typeof SCHEMA_VERSIONS.configurationValidationRequest;
  resultSchemaVersion: typeof SCHEMA_VERSIONS.configurationValidationResult;
  endpointTemplate: string;
  limits: {
    configurationCanonicalBytes: number;
    contractCanonicalBytes: number;
    requestBytes: number;
  };
  supportedApplicationContracts: ApplicationContractCompatibility[];
}

export interface ConfigurationValidationArtifact {
  schemaVersion: string;
  digest: Sha256Digest;
  canonical: string;
}

export interface ConfigurationValidationRequest {
  schemaVersion: typeof SCHEMA_VERSIONS.configurationValidationRequest;
  environmentKey: DeploymentEnvironment;
  clientContractVersion: typeof OPENXIANGDA_CONTRACT_VERSION;
  required: ApplicationContractCompatibility;
  configuration: ConfigurationValidationArtifact;
  contract: ConfigurationValidationArtifact;
}

export interface ConfigurationValidationResult {
  schemaVersion: typeof SCHEMA_VERSIONS.configurationValidationResult;
  compatible: true;
  environmentKey: DeploymentEnvironment;
  clientContractVersion: typeof OPENXIANGDA_CONTRACT_VERSION;
  platformVersion: string;
  capability: ConfigurationCompatibilityContract["capability"];
  required: ApplicationContractCompatibility;
  supported: ApplicationContractCompatibility[];
  source: {
    configurationDigest: Sha256Digest;
    contractDigest: Sha256Digest;
  };
  projectionDigest: Sha256Digest;
  requiredPlatformCapabilities: RequiredPlatformCapabilityContract[];
  counts: {
    resources: number;
    perspectives: number;
    capabilities: number;
    eventProducers: number;
    workflowDefinitions: number;
  };
}

export interface AppArtifact {
  kind: AppArtifactKind;
  digest: Sha256Digest;
  mediaType: string;
  size?: number;
  entrypoint?: string;
  metadata?: Record<string, unknown>;
}

export interface AppPackage {
  schemaVersion: typeof SCHEMA_VERSIONS.appPackage;
  appCode: string;
  version: string;
  createdAt: IsoDateTime;
  source: {
    repository: string;
    commit: string;
    dirty: boolean;
  };
  toolchain: {
    version: string;
    contractVersion: typeof OPENXIANGDA_CONTRACT_VERSION;
  };
  artifacts: AppArtifact[];
  manifests: {
    frontend?: Sha256Digest;
    backend?: Sha256Digest;
    config?: Sha256Digest;
    dataContract?: Sha256Digest;
  };
  compatibility: {
    minimumPlatformVersion: string;
    requiredPlatformCapabilities: RequiredPlatformCapabilityContract[];
    applicationContract: ApplicationContractCompatibility;
  };
  metadata?: Record<string, unknown>;
}

export interface AppVersion {
  schemaVersion: typeof SCHEMA_VERSIONS.appVersion;
  id: string;
  appCode: string;
  version: string;
  packageDigest: Sha256Digest;
  source: AppPackage["source"];
  toolchain: AppPackage["toolchain"];
  revisions: {
    frontend: string | null;
    backend: string | null;
    config: string | null;
    dataContract: string | null;
  };
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: IsoDateTime;
}

export interface ProductionPromotionPreflight {
  schemaVersion: typeof SCHEMA_VERSIONS.promotionPreflight;
  appCode: string;
  sourceDeploymentId: string;
  appVersionId: string;
  packageDigest: Sha256Digest;
  environmentKey: 'production';
  source: AppPackage['source'];
  validatorDigest: Sha256Digest;
  projectionDigest: Sha256Digest;
}

export interface EnvironmentHead {
  schemaVersion: typeof SCHEMA_VERSIONS.environmentHead;
  id: string;
  appCode: string;
  environmentKey: string;
  environmentId: string | null;
  environmentKind: DeploymentEnvironment;
  activeAppVersionId: string;
  revisions: AppVersion["revisions"];
  revision: number;
  activatedByDeploymentId: string;
  activatedBy: string;
  activatedAt: IsoDateTime;
  updatedAt: IsoDateTime;
  activeAppVersion?: AppVersion | null;
}

export interface ApplicationEnvironment extends RuntimeEnvironment {
  activeHead: EnvironmentHead | null;
}

export interface ApplicationEnvironmentList {
  schemaVersion: typeof SCHEMA_VERSIONS.applicationEnvironments;
  items: ApplicationEnvironment[];
  total: number;
}

export type DeploymentKind =
  | "deploy"
  | "promotion"
  | "rollback"
  | "redeploy"
  | "start"
  | "stop";
export type DeploymentStatus =
  | "queued"
  | "preparing"
  | "deploying"
  | "activating"
  | "verifying"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface DeploymentCheckpoint {
  stage: string;
  status: DeploymentStatus;
  at: IsoDateTime;
  attempt: number;
  component?: string;
  result?: Record<string, unknown>;
}

export interface DeploymentFailure {
  code: string;
  message: string;
  retryable: boolean;
  stage?: string;
  component?: string;
  details?: Record<string, unknown>;
  failedAt?: IsoDateTime;
}

export type DeploymentCandidateState =
  | "none"
  | "created"
  | "ready"
  | "failed"
  | "retired";

export type DeploymentRecoveryAction =
  | "rollback"
  | "replace"
  | "reuse"
  | "cleanup";

export interface DeploymentCandidate {
  identity: string | null;
  state: DeploymentCandidateState;
  recoveryAction: DeploymentRecoveryAction | null;
}

export interface DeploymentRecovery {
  mode: "none" | "same_run_attempt" | "platform_upgrade_replacement";
  retryable: boolean;
  replacementAllowed: boolean;
  cancelAllowed: boolean;
  action: DeploymentRecoveryAction | null;
  expectedAttempt: number;
  nextCommand: string | null;
  rootDeploymentId?: string;
  replacesDeploymentId?: string;
  candidateApplicationVersionId?: string;
  sourceExecutorVersion?: string;
  replacementExecutorVersion?: string;
  sourceAttempt?: number;
  sourceFailure?: DeploymentFailure | null;
  sourceRootFailure?: DeploymentFailure | null;
  sourceLatestFailure?: DeploymentFailure | null;
  sourceCandidate?: DeploymentCandidate;
}

export interface DeploymentAttempt {
  attempt: number;
  stage: string;
  candidateIdentity: string | null;
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime;
  outcome: "succeeded" | "failed" | "interrupted";
  failure: DeploymentFailure | null;
  candidateState: DeploymentCandidateState;
  recoveryAction: DeploymentRecoveryAction | null;
}

export interface DeploymentRun {
  schemaVersion: typeof SCHEMA_VERSIONS.deploymentRun;
  id: string;
  appCode: string;
  environment: {
    id?: string;
    kind?: DeploymentEnvironment;
  };
  kind: DeploymentKind;
  packageDigest: Sha256Digest;
  idempotencyKey: string;
  status: DeploymentStatus;
  stage: string;
  attempt: number;
  progress: Record<string, unknown>;
  checkpoints: DeploymentCheckpoint[];
  failure?: DeploymentFailure;
  rootFailure: DeploymentFailure | null;
  latestFailure: DeploymentFailure | null;
  candidate: DeploymentCandidate;
  recovery: DeploymentRecovery;
  attempts: DeploymentAttempt[];
  result: Record<string, unknown>;
  requestedBy: string;
  startedAt?: IsoDateTime;
  finishedAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export const RUNTIME_CAPACITY_PREFLIGHT_SCHEMA = SCHEMA_VERSIONS.runtimeCapacityPreflight;

export type DeploymentStrategy = 'rolling' | 'maintenance-replace';

export interface RuntimeCapacityPreflightRequest {
  deploymentStrategy?: DeploymentStrategy;
  schemaVersion: typeof RUNTIME_CAPACITY_PREFLIGHT_SCHEMA;
  environmentKey: 'preproduction';
  environmentId?: string;
  backend: { isolation: 'shared' | 'dedicated'; resourceProfile: 'light' | 'standard' } | null;
  packageDigest?: string;
  idempotencyKey?: string;
}

export interface RuntimeCapacityPreflight {
  deploymentStrategy?: DeploymentStrategy;
  maintenance?: { downtime: true; estimatedAfterStop: true; previousAppVersionId: string; previousDeploymentId: string; headRevision: number } | null;
  schemaVersion: typeof RUNTIME_CAPACITY_PREFLIGHT_SCHEMA;
  observedAt: IsoDateTime;
  environmentKey: 'preproduction';
  environmentId: string;
  basis: 'new-candidate' | 'existing-run' | 'frontend-only';
  existingRun: { id: string; status: string } | null;
  sufficient: boolean | null;
  capacity: {
    checked: boolean;
    namespace: string;
    additionalReplicas: number;
    profile?: 'light' | 'standard';
    required: Record<string, string>;
    quotas: Array<{ name: string; available: Record<string, string> }>;
    shortages: Array<{ quota: string; resource: string; required: string; available: string }>;
  } | null;
}

export interface PlatformCapabilities {
  sourceHosting?: { provider: 'forgejo'; enabled: boolean };
  schemaVersion: typeof SCHEMA_VERSIONS.platformCapabilities;
  apiVersion: "v2";
  contractVersion: typeof OPENXIANGDA_CONTRACT_VERSION;
  platformVersion: string;
  features: Record<string, PlatformFeatureCapabilityContract>;
  configurationCompatibility: ConfigurationCompatibilityContract;
  deployment: {
    executionOwner: "platform";
    durableRuns: true;
    clientCanCheckpoint: false;
    runtimeCapacityPreflight?: {
      strategies?: DeploymentStrategy[];
      schemaVersion: typeof RUNTIME_CAPACITY_PREFLIGHT_SCHEMA;
      endpointTemplate: '/openxiangda-api/v2/applications/{appCode}/runtime-capacity-preflight';
    };
    backendImageUpload?: {
      schemaVersion: 'openxiangda.backend-image-upload/v2';
      owner: 'platform';
      available: boolean;
      platform: 'linux/amd64';
      format: 'oci-layout';
      maxChunkBytes: number;
      maxImageBytes: number;
      endpointTemplate: '/openxiangda-api/v2/applications/{appCode}/backend-images';
    };
    backendImageBuild: {
      owner: "developer-cli";
      available: boolean;
      repositoryPrefix: string | null;
      platform: "linux/amd64";
    };
  };
  oauth2?: {
    tokenEndpoint: string;
    grantTypes: ["client_credentials"];
    clientAuthenticationMethods: ["client_secret_basic"];
    accessTokenTtlSeconds: number;
    supportedScopes: string[];
    environmentBoundClients: boolean;
    platformManagedRuntimeClients?: boolean;
    dualSecretRotation: boolean;
    stagedRuntimeRotation?: boolean;
    runtimeRotationUsesSameVersionRedeploy?: boolean;
    defaultRotationGracePeriodSeconds: number;
    clientRateLimit: boolean;
    auditEvents: boolean;
  };
}

export interface NextAction {
  code: string;
  label: string;
  command?: string;
  href?: string;
}

export interface DevkitResult<T> {
  ok: boolean;
  operation: string;
  workspace: WorkspaceIdentity;
  data?: T;
  diagnostics: Diagnostic[];
  nextActions: NextAction[];
  traceId?: string;
}
