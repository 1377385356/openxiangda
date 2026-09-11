import {
  normalizeWorkflowSurface,
  SCHEMA_VERSIONS,
  type DataAuditPage,
  type DataAggregatePage,
  type DataAggregateQuery,
  type DataBatchQueryOperation,
  type DataBatchQueryRequest,
  type DataBatchQueryResult,
  type DataFilePreview,
  type DataFileRef,
  type DataFileUploadPlan,
  type DataFieldSourcePage,
  type DataFieldSourceQuery,
  type DataExportRequest,
  type DataPage,
  type DataQuery,
  type DataWhere,
  type DataRecord,
  type DataResourceSurface,
  type DataTransactionOperation,
  type DataTransactionRequest,
  type DataTransactionResult,
  type DirectoryEntryPage,
  type DirectoryResolveRequest,
  type RuntimeAuthorizationContext,
  type RuntimeRoleSummary,
  type SubjectProfile,
  type ResourceReferenceValue,
  type WorkflowCommand,
  type WorkflowCommandInput,
  type WorkflowCommandResult,
  type WorkflowDetailSurfaceV2,
  type WorkflowInstance,
  type WorkflowLaunchSurface,
  type WorkflowRecordCorrectionSurface,
  type WorkflowRecordCorrectionInput,
  type WorkflowNamedOperationLaunchIntent,
  type WorkflowSurface,
  type WorkflowTask,
  type WorkflowWorkCenterItem,
  type WorkflowTimeline,
  type ApplicationTodoCenterPageV2,
  type ApplicationTodoInteractionResultV2,
  type ApplicationTodoViewV2,
  type NotificationMessageDetailV2,
  type NotificationReadReceiptV2,
  type ApplicationLoginPublicSurfaceV2,
  type ApplicationLoginTransactionReceiptV2,
  type ApplicationLoginRedirectReceiptV2,
  type ApplicationLoginReceiptV2,
  type ApplicationLogoutReceiptV2,
  type BusinessProcessAnswer,
  type BusinessProcessCommand,
  type BusinessProcessCommandQuery,
  type BusinessProcessCommandList,
  type BusinessProcessPoll,
  type BusinessProcessReceipt,
  type BusinessProcessRetry,
  type ProcessCommandSurface,
  type StandardProcessCommit,
  type NativeAuthorizationManagementCatalog,
  type NativeAuthorizationMutationReceipt,
  type NativeRoleManagementAction,
  type NativeRoleManagementGrantMutationResult,
  type NativeRoleManagementGrantPage,
  type NativeRoleMembershipMutationResult,
  type NativeRoleMembershipPage,
  type NativeScopeGrant,
} from 'openxiangda-contracts/browser';
import { useSyncExternalStore } from 'react';
import {
  buildResourceWhere,
  type GenericResourceQuery,
} from './components/platform-fields/resource-query';
export type { GenericResourceQuery } from './components/platform-fields/resource-query';
import {
  applicationApiPath,
  applicationCode,
  currentPerspectiveCode,
  runtimeMount,
} from './runtime-meta';

interface PlatformEnvelope<T> {
  code: number | string;
  message?: string;
  errorCode?: string;
  requestId?: string;
  data: T;
}

export class OpenXiangdaPlatformRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly data: unknown;

  constructor(input: {
    code: string;
    status: number;
    message: string;
    data?: unknown;
  }) {
    super(input.message);
    this.name = 'OpenXiangdaPlatformRequestError';
    this.code = input.code;
    this.status = input.status;
    this.data = input.data ?? null;
  }
}

let globalRequestCount = 0;
const globalRequestListeners = new Set<() => void>();

function beginGlobalRequest() {
  globalRequestCount += 1;
  globalRequestListeners.forEach((listener) => listener());
}

function endGlobalRequest() {
  globalRequestCount = Math.max(0, globalRequestCount - 1);
  globalRequestListeners.forEach((listener) => listener());
}

export function useGlobalRequestLoading() {
  return useSyncExternalStore(
    (listener) => {
      globalRequestListeners.add(listener);
      return () => globalRequestListeners.delete(listener);
    },
    () => globalRequestCount > 0,
    () => false,
  );
}

let platformRefreshPromise: Promise<void> | undefined;

function isApplicationLoginRequest(path: string) {
  return /^\/service\/openxiangda-api\/v2\/applications\/[^/]+\/auth(?:\/|$)/.test(
    path,
  );
}

async function refreshPlatformBrowserSession() {
  if (platformRefreshPromise) return await platformRefreshPromise;
  const pending = (async () => {
    const response = await fetch('/service/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    const payload = (await response.json().catch(() => null)) as
      | PlatformEnvelope<unknown>
      | null;
    if (!response.ok || (payload && payload.code !== 200)) {
      throw new OpenXiangdaPlatformRequestError({
        code: String(payload?.errorCode || payload?.code || `HTTP_${response.status}`),
        status: response.status,
        message: payload?.message || '平台登录状态刷新失败',
        data: payload?.data ?? null,
      });
    }
  })();
  platformRefreshPromise = pending;
  try {
    await pending;
  } finally {
    if (platformRefreshPromise === pending) platformRefreshPromise = undefined;
  }
}

async function fetchWithPlatformSession(path: string, init: RequestInit) {
  const send = () =>
    fetch(path, {
      credentials: 'include',
      ...init,
    });
  const response = await send();
  if (response.status !== 401 || isApplicationLoginRequest(path)) {
    return response;
  }
  try {
    await refreshPlatformBrowserSession();
  } catch (error) {
    if (
      error instanceof OpenXiangdaPlatformRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      return response;
    }
    throw error;
  }
  return await send();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  beginGlobalRequest();
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has('accept')) headers.set('accept', 'application/json');
    if (init?.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const perspective = currentPerspectiveCode();
    if (perspective && !headers.has('x-openxiangda-perspective')) {
      headers.set('x-openxiangda-perspective', perspective);
    }
    const response = await fetchWithPlatformSession(path, {
      ...init,
      headers,
    });
    const payload = (await response.json().catch(() => null)) as
      | PlatformEnvelope<T>
      | T
      | null;
    const envelope =
      payload && typeof payload === 'object' && 'code' in payload
        ? (payload as PlatformEnvelope<T>)
        : null;
    if (!response.ok || (envelope && envelope.code !== 200)) {
      const requestId = envelope?.requestId
        ? ` (requestId: ${envelope.requestId})`
        : '';
      const code = String(
        envelope?.errorCode || envelope?.code || `HTTP_${response.status}`,
      );
      throw new OpenXiangdaPlatformRequestError({
        code,
        status: response.status,
        message: `${code}: ${envelope?.message || '平台请求失败'}${requestId}`,
        data: envelope?.data ?? null,
      });
    }
    return envelope ? envelope.data : (payload as T);
  } finally {
    endGlobalRequest();
  }
}

/** 仅用于明确只读的调用；写入和作业创建继续走 request，不自动重放。 */
async function requestRead<T>(path: string, init: RequestInit = {}): Promise<T> {
  const readScope = () => JSON.stringify([applicationCode(), activeIdentity?.environment.key || runtimeMount()?.environmentKey || null,
    currentPerspectiveCode(), activeIdentity?.identityScope || null]);
  const scope = readScope();
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('读取超时', 'TimeoutError')), 10_000);
  let onAbort: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    for (let attempt = 0; ; attempt++) {
      if (readScope() !== scope) throw new Error('OPENXIANGDA_READ_SCOPE_CHANGED');
      try {
        const result = await Promise.race([request<T>(path, { ...init, signal: controller.signal }), aborted]);
        if (readScope() !== scope) throw new Error('OPENXIANGDA_READ_SCOPE_CHANGED');
        return result;
      } catch (error) {
        if (!(error instanceof OpenXiangdaPlatformRequestError) || error.status !== 503 ||
          error.code !== 'OPENXIANGDA_AUTHORIZATION_PROJECTION_NOT_READY') throw error;
        if (attempt >= 3 || controller.signal.aborted) throw new OpenXiangdaPlatformRequestError({
          code: error.code, status: error.status,
          message: '读取权限正在更新，请稍后刷新；已完成的操作无需重复提交',
        });
        await Promise.race([new Promise(resolve => setTimeout(resolve, [250, 750, 1500][attempt])), aborted]);
      }
    }
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', onAbort!);
    init.signal?.removeEventListener('abort', abort);
  }
}

async function requestBlob(path: string, init?: RequestInit) {
  beginGlobalRequest();
  try {
    const headers = new Headers(init?.headers);
    headers.set('accept', 'text/csv');
    if (init?.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const perspective = currentPerspectiveCode();
    if (perspective && !headers.has('x-openxiangda-perspective')) {
      headers.set('x-openxiangda-perspective', perspective);
    }
    const response = await fetchWithPlatformSession(path, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as PlatformEnvelope<unknown> | null;
      const requestId = payload?.requestId
        ? ` (requestId: ${payload.requestId})`
        : '';
      throw Object.assign(
        new Error(
          `${payload?.errorCode || `HTTP_${response.status}`}: ${
            payload?.message || '平台导出失败'
          }${requestId}`,
        ),
        {
          code: payload?.errorCode || `HTTP_${response.status}`,
          status: response.status,
          data: payload?.data ?? null,
        },
      );
    }
    const disposition = response.headers.get('content-disposition') || '';
    const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    return {
      blob: await response.blob(),
      fileName: encodedName ? decodeURIComponent(encodedName) : undefined,
      rowLimit: Number(
        response.headers.get('x-openxiangda-export-row-limit') || 10_000,
      ),
    };
  } finally {
    endGlobalRequest();
  }
}

export async function requestApplicationApi<T>(
  path: string,
  init?: RequestInit,
) {
  return await request<T>(applicationApiPath(path), init);
}

export interface RuntimeIdentity {
  userId: string;
  roleCodes: string[];
  capabilityCodes: string[];
  isAppSuperAdmin: boolean;
  identityScope: string;
  subjectProfile: SubjectProfile;
  roles: RuntimeRoleSummary[];
  environment: {
    id: string;
    key: 'preproduction' | 'production';
    activeAppVersionId?: string;
    headRevision?: number;
    authzRevisionId?: string;
    authzVersion?: number;
    scopeDataVersion?: string;
  };
}

interface ConnectedCurrent {
  environment: RuntimeIdentity['environment'];
  principal: Pick<
    RuntimeIdentity,
    'userId' | 'roleCodes' | 'capabilityCodes' | 'isAppSuperAdmin'
  > & {
    type: 'developer';
  };
  subjectProfile: SubjectProfile;
  roles: RuntimeRoleSummary[];
}

export interface RuntimeAuthorization {
  state: 'active' | 'unassigned';
  identity: RuntimeIdentity | null;
}

let activeIdentity: RuntimeIdentity | undefined;
let runtimeAuthorizationLoad: Promise<RuntimeAuthorization> | undefined;

function applicationServiceBase() {
  return `/service/openxiangda-api/v2/applications/${applicationCode()}`;
}

function applicationAuthenticationBase() {
  return `${applicationServiceBase()}/auth`;
}

let applicationCsrfToken = '';
const platformSessionListeners = new Set<() => void>();
let platformSessionChannel: BroadcastChannel | undefined;
let platformSessionStorageListening = false;
const PLATFORM_AUTH_CHANNEL = 'auth-session-v2';
const PLATFORM_LOGOUT_STORAGE_KEY = 'auth_session_v2:logout';
const platformAuthOwnerId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `openxiangda-${Date.now()}-${Math.random().toString(16).slice(2)}`;

interface PlatformLogoutSignal {
  type: 'logout';
  payload: {
    version: 2;
    ownerId: string;
    reason: 'logout' | 'invalid-session';
    at: number;
  };
}

function isPlatformLogoutSignal(value: unknown): value is PlatformLogoutSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const signal = value as Partial<PlatformLogoutSignal>;
  return (
    signal.type === 'logout' &&
    Boolean(signal.payload) &&
    signal.payload?.version === 2 &&
    typeof signal.payload.ownerId === 'string' &&
    (signal.payload.reason === 'logout' ||
      signal.payload.reason === 'invalid-session') &&
    typeof signal.payload.at === 'number'
  );
}

function invalidatePlatformSession() {
  activeIdentity = undefined;
  runtimeAuthorizationLoad = undefined;
  applicationCsrfToken = '';
  platformSessionListeners.forEach(listener => listener());
}

function ensurePlatformSessionChannel() {
  if (typeof window === 'undefined') return undefined;
  if (!platformSessionStorageListening) {
    platformSessionStorageListening = true;
    window.addEventListener('storage', event => {
      if (event.key !== PLATFORM_LOGOUT_STORAGE_KEY || !event.newValue) return;
      try {
        if (isPlatformLogoutSignal({
          type: 'logout',
          payload: JSON.parse(event.newValue),
        })) {
          invalidatePlatformSession();
        }
      } catch {
        // Ignore malformed cross-tab coordination values.
      }
    });
  }
  if (platformSessionChannel || !('BroadcastChannel' in window)) {
    return platformSessionChannel;
  }
  platformSessionChannel = new window.BroadcastChannel(PLATFORM_AUTH_CHANNEL);
  platformSessionChannel.addEventListener('message', event => {
    if (!isPlatformLogoutSignal(event.data)) return;
    invalidatePlatformSession();
  });
  return platformSessionChannel;
}

export function subscribePlatformSessionInvalidation(listener: () => void) {
  platformSessionListeners.add(listener);
  ensurePlatformSessionChannel();
  return () => {
    platformSessionListeners.delete(listener);
  };
}

function publishPlatformLogout() {
  const signal: PlatformLogoutSignal = {
    type: 'logout',
    payload: {
      version: 2,
      ownerId: platformAuthOwnerId,
      reason: 'logout',
      at: Date.now(),
    },
  };
  ensurePlatformSessionChannel()?.postMessage(signal);
  try {
    window.localStorage.setItem(
      PLATFORM_LOGOUT_STORAGE_KEY,
      JSON.stringify(signal.payload),
    );
  } catch {
    // BroadcastChannel and local listeners still cover this tab.
  }
  invalidatePlatformSession();
}

function runtimeEnvironmentKey() {
  return runtimeMount()?.environmentKey || 'preproduction';
}

export function isApplicationUnauthenticatedError(error: unknown) {
  return (
    error instanceof OpenXiangdaPlatformRequestError &&
    error.status === 401 &&
    [
      'APPLICATION_AUTH_UNAUTHENTICATED',
      'OPENXIANGDA_NATIVE_CURRENT_USER_SESSION_REQUIRED',
      'HTTP_401',
      '401',
    ].includes(error.code)
  );
}

export async function loadApplicationLoginSurface(input: {
  device: 'desktop' | 'mobile';
  returnTo: string;
}) {
  const query = new URLSearchParams({
    environmentKey: runtimeEnvironmentKey(),
    device: input.device,
    returnTo: input.returnTo,
  });
  const surface = await request<ApplicationLoginPublicSurfaceV2>(
    `${applicationAuthenticationBase()}/surface?${query}`,
  );
  applicationCsrfToken = surface.csrfToken;
  return surface;
}

export async function createApplicationLoginTransaction(input: {
  device: 'desktop' | 'mobile';
  returnTo: string;
}) {
  if (!applicationCsrfToken) {
    await loadApplicationLoginSurface(input);
  }
  const receipt = await request<ApplicationLoginTransactionReceiptV2>(
    `${applicationAuthenticationBase()}/transactions`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': applicationCsrfToken },
      body: JSON.stringify({
        environmentKey: runtimeEnvironmentKey(),
        device: input.device,
        returnTo: input.returnTo,
      }),
    },
  );
  applicationCsrfToken = receipt.csrfToken;
  return receipt;
}

export async function passwordLoginApplication(input: {
  transactionId: string;
  methodCode: string;
  username: string;
  password: string;
  rememberAccount?: boolean;
  challengeId?: string;
  challengeAnswer?: string;
}) {
  const receipt = await request<ApplicationLoginReceiptV2>(
    `${applicationAuthenticationBase()}/transactions/${encodeURIComponent(
      input.transactionId,
    )}/password`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': applicationCsrfToken },
      body: JSON.stringify({
        methodCode: input.methodCode,
        username: input.username,
        password: input.password,
        rememberAccount: input.rememberAccount === true,
        ...(input.challengeId ? { challengeId: input.challengeId } : {}),
        ...(input.challengeAnswer
          ? { challengeAnswer: input.challengeAnswer }
          : {}),
      }),
    },
  );
  activeIdentity = undefined;
  runtimeAuthorizationLoad = undefined;
  return receipt;
}

async function startApplicationLoginRedirect(input: {
  transactionId: string;
  methodCode: string;
  kind: 'sso' | 'dingtalk';
  jsapiAvailable?: boolean;
}) {
  return await request<ApplicationLoginRedirectReceiptV2>(
    `${applicationAuthenticationBase()}/transactions/${encodeURIComponent(
      input.transactionId,
    )}/${input.kind}/${encodeURIComponent(input.methodCode)}/start`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': applicationCsrfToken },
      body: JSON.stringify(
        input.kind === 'dingtalk'
          ? { jsapiAvailable: input.jsapiAvailable === true }
          : {},
      ),
    },
  );
}

export async function startApplicationSso(input: {
  transactionId: string;
  methodCode: string;
}) {
  return await startApplicationLoginRedirect({ ...input, kind: 'sso' });
}

export async function startApplicationDingTalk(input: {
  transactionId: string;
  methodCode: string;
  jsapiAvailable?: boolean;
}) {
  return await startApplicationLoginRedirect({ ...input, kind: 'dingtalk' });
}

export async function completeApplicationDingTalkJsapi(input: {
  transactionId: string;
  methodCode: string;
  code: string;
}) {
  const receipt = await request<ApplicationLoginReceiptV2>(
    `${applicationAuthenticationBase()}/transactions/${encodeURIComponent(
      input.transactionId,
    )}/dingtalk/${encodeURIComponent(input.methodCode)}/complete`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': applicationCsrfToken },
      body: JSON.stringify({ code: input.code }),
    },
  );
  activeIdentity = undefined;
  runtimeAuthorizationLoad = undefined;
  return receipt;
}

function validateRuntimeAuthorization(
  context: RuntimeAuthorizationContext,
): RuntimeAuthorization {
  const mount = runtimeMount();
  if (
    !mount ||
    context.schemaVersion !== SCHEMA_VERSIONS.runtimeAuthorization ||
    context.environment.key !== mount.environmentKey
  ) {
    throw new Error('OPENXIANGDA_RUNTIME_AUTHORIZATION_INVALID');
  }
  if (context.state !== 'active') {
    if (context.principal) {
      throw new Error('OPENXIANGDA_RUNTIME_AUTHORIZATION_INACTIVE_INVALID');
    }
    activeIdentity = undefined;
    return { state: context.state, identity: null };
  }
  if (!context.principal || context.principal.type !== 'user_union') {
    throw new Error('OPENXIANGDA_RUNTIME_AUTHORIZATION_ACTIVE_INVALID');
  }
  activeIdentity = {
    userId: context.principal.userId,
    roleCodes: context.principal.roleCodes,
    capabilityCodes: context.principal.capabilityCodes,
    isAppSuperAdmin: context.principal.isAppSuperAdmin,
    identityScope: context.principal.identityScope,
    subjectProfile: context.subjectProfile,
    roles: context.roles,
    environment: {
      id: context.environment.id,
      key: context.environment.key,
      activeAppVersionId: context.environment.activeAppVersionId,
      headRevision: context.environment.headRevision,
      authzRevisionId: context.environment.authzRevisionId,
      authzVersion: context.environment.authzVersion,
      scopeDataVersion: context.environment.scopeDataVersion,
    },
  };
  return { state: context.state, identity: activeIdentity };
}

async function requestRuntimeAuthorization(): Promise<RuntimeAuthorization> {
  const mount = runtimeMount();
  if (mount) {
    const context = await requestRead<RuntimeAuthorizationContext>(
      `${nativeBase()}/authz/current?environmentKey=${encodeURIComponent(
        mount.environmentKey,
      )}`,
    );
    return validateRuntimeAuthorization(context);
  }
  const current = await requestRead<ConnectedCurrent>(
    `${applicationServiceBase()}/dev-sessions/current`,
  );
  activeIdentity = {
    ...current.principal,
    identityScope: `connected-dev:${applicationCode()}:${
      current.environment.key
    }:${current.principal.userId}`,
    subjectProfile: current.subjectProfile,
    roles: current.roles,
    environment: current.environment,
  };
  return { state: 'active', identity: activeIdentity };
}

export async function loadRuntimeAuthorization(
  options: { refresh?: boolean } = {},
): Promise<RuntimeAuthorization> {
  if (options.refresh) runtimeAuthorizationLoad = undefined;
  if (runtimeAuthorizationLoad) return await runtimeAuthorizationLoad;
  const pending = (async () => {
    return await requestRuntimeAuthorization();
  })();
  runtimeAuthorizationLoad = pending;
  try {
    return await pending;
  } catch (error) {
    if (runtimeAuthorizationLoad === pending) {
      runtimeAuthorizationLoad = undefined;
    }
    throw error;
  }
}

export async function logoutCurrentUser() {
  const device =
    typeof window !== 'undefined' &&
    /(?:^|\/)m(?:\/|$)/.test(window.location.pathname)
      ? 'mobile'
      : 'desktop';
  if (!applicationCsrfToken) {
    await loadApplicationLoginSurface({ device, returnTo: '/' });
  }
  const receipt = await request<ApplicationLogoutReceiptV2>(
    `${applicationAuthenticationBase()}/logout`, {
    method: 'POST',
    headers: { 'x-openxiangda-csrf-token': applicationCsrfToken },
    body: JSON.stringify({ environmentKey: runtimeEnvironmentKey(), device }),
  });
  activeIdentity = undefined;
  runtimeAuthorizationLoad = undefined;
  applicationCsrfToken = '';
  publishPlatformLogout();
  return receipt;
}

export async function uploadCurrentUserAvatar(file: File) {
  const contentType = file.type.toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new Error('头像仅支持 JPG、PNG 或 WebP 图片');
  }
  if (file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error('头像图片不能超过 5MB');
  }
  const plan = await request<{
    uploadUrl: string;
    uploadMethod: string;
    headers: Record<string, string>;
    objectName: string;
  }>(`${nativeBase()}/authz/profile/avatar/initiate`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      contentType,
    }),
  });
  const uploaded = await fetch(plan.uploadUrl, {
    method: plan.uploadMethod,
    headers: plan.headers,
    body: file,
  });
  if (!uploaded.ok) {
    throw new Error(`头像上传失败：HTTP_${uploaded.status}`);
  }
  const profile = await request<SubjectProfile>(
    `${nativeBase()}/authz/profile/avatar/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ objectName: plan.objectName }),
    },
  );
  if (activeIdentity) activeIdentity.subjectProfile = profile;
  return profile;
}

function currentEnvironmentKey() {
  const key = activeIdentity?.environment.key || runtimeMount()?.environmentKey;
  if (!key) throw new Error('OPENXIANGDA_CURRENT_ENVIRONMENT_REQUIRED');
  return key;
}

export interface AnonymousPublicDraft {
  schemaVersion: 'openxiangda.anonymous-public-draft/v2';
  revision: number;
  data: Record<string, unknown>;
  progress: { completed: number; total: number; percentage: number | null };
  expiresAt: string;
}

export interface AnonymousPublicRecord {
  schemaVersion: 'openxiangda.anonymous-public-record/v2';
  resourceCode: string;
  data: Record<string, unknown>;
}

const anonymousPublicBootstrapLoads = new Map<string, Promise<any>>();

export function createAnonymousPublicClient(input: {
  routeCode: string;
  policyCode?: string;
}) {
  const base = `/service/openxiangda-api/v2/applications/${encodeURIComponent(
    applicationCode(),
  )}/anonymous-public`;
  let policyCode = input.policyCode || '';
  const environmentKey = () =>
    runtimeMount()?.environmentKey || 'preproduction';
  const policy = () => {
    if (!policyCode)
      throw new Error('OPENXIANGDA_ANONYMOUS_PUBLIC_BOOTSTRAP_REQUIRED');
    return policyCode;
  };
  return {
    async bootstrap() {
      const bootstrapKey = `${applicationCode()}:${environmentKey()}:${input.routeCode}:${input.policyCode || ''}`;
      let load = anonymousPublicBootstrapLoads.get(bootstrapKey);
      if (!load) {
        load = request<{
        schemaVersion: 'openxiangda.anonymous-public-session/v2';
        policy: {
          code: string;
          operations: string[];
          fields: string[];
          publicRecordFields?: string[];
          publicSubtableFields?: Record<string, string[]>;
        };
        draft?: AnonymousPublicDraft;
      }>(`${base}/bootstrap`, {
        method: 'POST',
        body: JSON.stringify({
          routeCode: input.routeCode,
          ...(input.policyCode ? { policyCode: input.policyCode } : {}),
          environmentKey: environmentKey(),
        }),
      });
        anonymousPublicBootstrapLoads.set(bootstrapKey, load);
        void load.finally(() => anonymousPublicBootstrapLoads.delete(bootstrapKey));
      }
      const session = await load;
      policyCode = session.policy.code;
      return session;
    },
    async currentDraft() {
      const query = new URLSearchParams({
        policyCode: policy(),
        environmentKey: environmentKey(),
      });
      return await request<AnonymousPublicDraft>(
        `${base}/draft/current?${query}`,
      );
    },
    async saveDraft(
      expectedRevision: number,
      data: Record<string, unknown>,
    ) {
      return await request<AnonymousPublicDraft>(`${base}/draft/current`, {
        method: 'PUT',
        body: JSON.stringify({
          policyCode: policy(),
          environmentKey: environmentKey(),
          expectedRevision,
          data,
        }),
      });
    },
    async validate(code: string, data: Record<string, unknown>) {
      return await request<{
        schemaVersion: 'openxiangda.anonymous-public-validation/v2';
        code: string;
        result: 'available' | 'duplicate';
      }>(`${base}/validations/${encodeURIComponent(code)}`, {
        method: 'POST',
        body: JSON.stringify({
          policyCode: policy(),
          environmentKey: environmentKey(),
          data,
        }),
      });
    },
    async submit(expectedRevision: number, idempotencyKey: string) {
      return await request<{
        schemaVersion: 'openxiangda.anonymous-public-submission/v2';
        state: 'submitted';
        recordId: string;
        submittedAt: string;
        idempotentReplay: boolean;
        generated?: Record<string, string>;
      }>(`${base}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          policyCode: policy(),
          environmentKey: environmentKey(),
          expectedRevision,
          idempotencyKey,
        }),
      });
    },
    async listOwn(options: { cursor?: string; pageSize?: number } = {}) {
      const query = new URLSearchParams({
        policyCode: policy(),
        environmentKey: environmentKey(),
        pageSize: String(options.pageSize || 20),
      });
      if (options.cursor) query.set('cursor', options.cursor);
      return await request<{
        schemaVersion: 'openxiangda.anonymous-public-record-page/v2';
        items: AnonymousPublicRecord[];
        nextCursor: string | null;
      }>(`${base}/records?${query}`);
    },
    async getOwn(recordId: string) {
      const query = new URLSearchParams({
        policyCode: policy(),
        environmentKey: environmentKey(),
      });
      return await request<AnonymousPublicRecord>(
        `${base}/records/${encodeURIComponent(recordId)}?${query}`,
      );
    },
    async listPublic(options: { cursor?: string; pageSize?: number } = {}) {
      const query = new URLSearchParams({
        policyCode: policy(),
        environmentKey: environmentKey(),
        pageSize: String(options.pageSize || 20),
      });
      if (options.cursor) query.set('cursor', options.cursor);
      return await request<{
        schemaVersion: 'openxiangda.anonymous-public-record-page/v2';
        items: AnonymousPublicRecord[];
        nextCursor: string | null;
      }>(`${base}/public/records?${query}`);
    },
    async getPublic(recordId: string) {
      const query = new URLSearchParams({
        policyCode: policy(),
        environmentKey: environmentKey(),
      });
      return await request<AnonymousPublicRecord>(
        `${base}/public/records/${encodeURIComponent(recordId)}?${query}`,
      );
    },
    async upload(fieldCode: string, file: File) {
      const plan = await request<DataFileUploadPlan>(
        `${base}/files/uploads/initiate`,
        {
          method: 'POST',
          body: JSON.stringify({
            policyCode: policy(),
            environmentKey: environmentKey(),
            fieldCode,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || 'application/octet-stream',
          }),
        },
      );
      const uploaded = await fetch(plan.uploadUrl, {
        method: plan.uploadMethod,
        headers: plan.headers,
        body: file,
      });
      if (!uploaded.ok) {
        throw new Error(`FILE_UPLOAD_FAILED: HTTP_${uploaded.status}`);
      }
      return await request<DataFileRef>(
        `${base}/files/${encodeURIComponent(plan.file.id)}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            policyCode: policy(),
            environmentKey: environmentKey(),
          }),
        },
      );
    },
    fileContentUrl(
      fileId: string,
      disposition: 'attachment' | 'inline' = 'attachment',
      variant?: 'thumbnail',
      resourceCode?: string,
      parentFieldCode?: string,
    ) {
      const query = new URLSearchParams({
        policyCode: policy(),
        environmentKey: environmentKey(),
        disposition,
      });
      if (variant) query.set('variant', variant);
      if (resourceCode) query.set('resourceCode', resourceCode);
      if (parentFieldCode) query.set('parentFieldCode', parentFieldCode);
      return `${base}/files/${encodeURIComponent(fileId)}/content?${query}`;
    },
  };
}

export type DirectoryKind = 'user' | 'department';

export interface ChinaDivisionListItem {
  adcode: string;
  citycode?: string;
  name: string;
  level?: string;
  center?: string;
  parentAdcode?: string;
  hasChildren: boolean;
}

export async function loadChinaDivisions(parentAdcode?: string) {
  const params = new URLSearchParams();
  if (parentAdcode) params.set('parentAdcode', parentAdcode);
  const suffix = params.size ? `?${params}` : '';
  return await request<ChinaDivisionListItem[]>(
    `/service/china-divisions/${suffix}`,
  );
}

export async function searchDirectory(
  kind: DirectoryKind,
  options: { keyword: string; cursor?: string },
) {
  const params = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    keyword: options.keyword.trim(),
    limit: '20',
  });
  if (options.cursor) params.set('cursor', options.cursor);
  return request<DirectoryEntryPage>(
    `${nativeBase().replace(/\/native$/, '')}/directory/${kind}s?${params}`,
  );
}

export async function browseDepartmentTree(options: {
  parentId?: string;
  cursor?: string;
}) {
  const params = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    limit: '100',
  });
  if (options.parentId) params.set('parentId', options.parentId);
  if (options.cursor) params.set('offset', options.cursor);
  return request<DirectoryEntryPage>(
    `${nativeBase().replace(
      /\/native$/,
      '',
    )}/directory/departments/tree?${params}`,
  );
}

export async function browseDepartmentUsers(departmentId: string, page = 1) {
  const params = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    page: String(page),
    limit: '20',
  });
  return request<DirectoryEntryPage>(
    `${nativeBase().replace(
      /\/native$/,
      '',
    )}/directory/departments/${encodeURIComponent(
      departmentId,
    )}/users?${params}`,
  );
}

export async function resolveDirectory(kind: DirectoryKind, ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0)
    throw new Error('OPENXIANGDA_DIRECTORY_RESOLVE_IDS_REQUIRED');
  if (uniqueIds.length > 50)
    throw new Error('OPENXIANGDA_DIRECTORY_RESOLVE_IDS_EXCEEDED');
  const body: DirectoryResolveRequest = {
    schemaVersion: SCHEMA_VERSIONS.directoryResolveRequest,
    kind,
    ids: uniqueIds,
  };
  return request<DirectoryEntryPage>(
    `${nativeBase().replace(
      /\/native$/,
      '',
    )}/directory/resolve?environmentKey=${encodeURIComponent(
      currentEnvironmentKey(),
    )}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function searchResource(
  resourceCode: string,
  fieldCode: string,
  options: {
    operation: 'create' | 'update';
    keyword: string;
    cursor?: string;
    bindings?: Record<string, unknown>;
    launch?: DataFieldSourceQuery['launch'];
  },
) {
  const query: DataFieldSourceQuery = {
    schemaVersion: SCHEMA_VERSIONS.dataFieldSourceQuery,
    operation: options.operation,
    ...(options.launch ? { launch: options.launch } : {}),
    ...(options.keyword.trim() ? { keyword: options.keyword.trim() } : {}),
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(options.bindings && Object.keys(options.bindings).length
      ? { bindings: options.bindings }
      : {}),
  };
  return await requestRead<DataFieldSourcePage>(
    `${nativeBase()}/data-resources/${encodeURIComponent(
      resourceCode,
    )}/fields/${encodeURIComponent(fieldCode)}/source/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...query,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

function nativeResourceListQuery(
  code: string,
  surface: DataResourceSurface,
  query: GenericResourceQuery,
): DataQuery {
  const sorts = query.sorts ?? (query.sort ? [query.sort] : surface.list?.defaultSort ? [surface.list.defaultSort] : []);
  const where = buildResourceWhere(code, surface, query);
  return {
    schemaVersion: SCHEMA_VERSIONS.dataQuery,
    ...(where ? { where } : {}),
    order: sorts.map(sort => ({ field: sort.field, direction: sort.order })),
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  };
}

export interface NativeResourceBatchListOperation {
  key: string;
  resourceCode: string;
  surface: DataResourceSurface;
  query: GenericResourceQuery;
}

export type NativeResourceBatchListResult =
  | {
      key: string;
      resourceCode: string;
      ok: true;
      page: { rows: Record<string, unknown>[]; total: number };
    }
  | {
      key: string;
      resourceCode: string;
      ok: false;
      error: { code: string; status: number; retryable: boolean };
    };

export interface NativeResourceBatchAggregateOperation {
  key: string;
  resourceCode: string;
  aggregate: DataAggregateQuery;
}

export type NativeResourceBatchAggregateResult<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  | {
      key: string;
      resourceCode: string;
      ok: true;
      aggregate: DataAggregatePage<T>;
    }
  | {
      key: string;
      resourceCode: string;
      ok: false;
      error: { code: string; status: number; retryable: boolean };
    };

function hasOwn(value: unknown, property: string) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, property)
  );
}

function assertBatchQueryOperationDiscriminator(
  value: unknown,
): asserts value is DataBatchQueryOperation {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('OPENXIANGDA_NATIVE_DATA_REQUEST_OBJECT_REQUIRED');
  }
  const hasQuery = hasOwn(value, 'query');
  const hasAggregate = hasOwn(value, 'aggregate');
  if (hasQuery === hasAggregate) {
    throw new Error(
      'OPENXIANGDA_NATIVE_DATA_BATCH_QUERY_OPERATION_KIND_INVALID',
    );
  }
}

function isDataPage<T extends Record<string, unknown>>(
  value: unknown,
): value is DataPage<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion ===
      SCHEMA_VERSIONS.dataPage
  );
}

function isDataAggregatePage<T extends Record<string, unknown>>(
  value: unknown,
): value is DataAggregatePage<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion ===
      SCHEMA_VERSIONS.dataAggregatePage
  );
}

function isDataBatchQueryResult<T extends Record<string, unknown>>(
  value: unknown,
): value is DataBatchQueryResult<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion ===
      SCHEMA_VERSIONS.dataBatchQueryResult &&
    Array.isArray((value as { results?: unknown }).results)
  );
}

export async function batchQueryNativeData<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  operations: DataBatchQueryOperation[],
): Promise<DataBatchQueryResult<T>> {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('OPENXIANGDA_NATIVE_DATA_BATCH_QUERY_OPERATIONS_REQUIRED');
  }
  operations.forEach(assertBatchQueryOperationDiscriminator);
  const body: DataBatchQueryRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataBatchQuery,
    operations,
  };
  const result = await request<DataBatchQueryResult<T>>(
    `${nativeBase()}/data/batch-query`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
  if (!isDataBatchQueryResult<T>(result)) {
    throw new Error('OPENXIANGDA_NATIVE_DATA_BATCH_QUERY_RESPONSE_INVALID');
  }
  return result;
}

export async function batchListNativeResources(
  operations: NativeResourceBatchListOperation[],
): Promise<NativeResourceBatchListResult[]> {
  if (operations.length === 0) return [];
  const result = await batchQueryNativeData(
    operations.map(operation => ({
      key: operation.key,
      resourceCode: operation.resourceCode,
      query: nativeResourceListQuery(
        operation.resourceCode,
        operation.surface,
        operation.query,
      ),
    })),
  );
  return result.results.map(item =>
    item.ok
      ? isDataPage(item.data)
        ? {
            key: item.key,
            resourceCode: item.resourceCode,
            ok: true,
            page: { rows: item.data.items, total: item.data.total },
          }
        : (() => {
            throw new Error(
              'OPENXIANGDA_NATIVE_DATA_BATCH_LIST_RESPONSE_KIND_INVALID',
            );
          })()
      : item,
  );
}

export async function batchAggregateNativeResources<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  operations: NativeResourceBatchAggregateOperation[],
): Promise<NativeResourceBatchAggregateResult<T>[]> {
  if (operations.length === 0) return [];
  const result = await batchQueryNativeData<T>(
    operations.map(operation => ({
      key: operation.key,
      resourceCode: operation.resourceCode,
      aggregate: operation.aggregate,
    })),
  );
  return result.results.map(item => {
    if (!item.ok) return item;
    if (!isDataAggregatePage<T>(item.data)) {
      throw new Error(
        'OPENXIANGDA_NATIVE_DATA_BATCH_AGGREGATE_RESPONSE_KIND_INVALID',
      );
    }
    return {
      key: item.key,
      resourceCode: item.resourceCode,
      ok: true as const,
      aggregate: item.data,
    };
  });
}

export function createNativeResourceClient(
  code: string,
  surface: DataResourceSurface,
) {
  const base = dataBase(code);
  const declaredFields = new Set(Object.keys(surface.fields));
  const assertField = (field: string) => {
    if (!declaredFields.has(field))
      throw new Error(
        `OPENXIANGDA_RESOURCE_QUERY_FIELD_NOT_DECLARED:${code}:${field}`,
      );
    return field;
  };
  return {
    async list(query: GenericResourceQuery) {
      const body = nativeResourceListQuery(code, surface, query);
      const page = await requestRead<DataPage<Record<string, unknown>>>(
        `${base}/query`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...body,
            environmentKey: currentEnvironmentKey(),
          }),
        },
      );
      return { rows: page.items, total: page.total };
    },
    async exportCsv(query: GenericResourceQuery, select: string[]) {
      const { where, order } = nativeResourceListQuery(code, surface, query);
      const body: DataExportRequest = {
        schemaVersion: SCHEMA_VERSIONS.dataExportRequest,
        select: select.map(assertField),
        ...(where ? { where } : {}),
        order,
      };
      return await requestBlob(`${base}/export`, {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          environmentKey: currentEnvironmentKey(),
        }),
      });
    },
    async get(id: string) {
      const record = await requestRead<DataRecord<Record<string, unknown>>>(
        `${base}/records/${encodeURIComponent(
          id,
        )}?environmentKey=${encodeURIComponent(currentEnvironmentKey())}`,
      );
      return record.data;
    },
    async audit(id: string) {
      return requestRead<DataAuditPage>(
        `${base}/records/${encodeURIComponent(
          id,
        )}/audit?limit=10&offset=0&environmentKey=${encodeURIComponent(
          currentEnvironmentKey(),
        )}`,
      );
    },
    async create(data: Record<string, unknown>) {
      const record = await request<DataRecord<Record<string, unknown>>>(
        `${base}/records`,
        {
          method: 'POST',
          body: JSON.stringify({
            environmentKey: currentEnvironmentKey(),
            data,
          }),
        },
      );
      return record.data;
    },
    async update(
      id: string,
      expectedRevision: number,
      data: Record<string, unknown>,
    ) {
      const record = await request<DataRecord<Record<string, unknown>>>(
        `${base}/records/${encodeURIComponent(id)}/update`,
        {
          method: 'POST',
          body: JSON.stringify({
            environmentKey: currentEnvironmentKey(),
            expectedRevision,
            data,
          }),
        },
      );
      return record.data;
    },
    async remove(id: string, expectedRevision: number) {
      const record = await request<DataRecord<Record<string, unknown>>>(
        `${base}/records/${encodeURIComponent(id)}/delete`,
        {
          method: 'POST',
          body: JSON.stringify({
            environmentKey: currentEnvironmentKey(),
            expectedRevision,
          }),
        },
      );
      return record.data;
    },
    async upload(fieldCode: string, file: File, recordId?: string) {
      assertField(fieldCode);
      const plan = await request<DataFileUploadPlan>(
        `${base}/files/uploads/initiate`,
        {
          method: 'POST',
          body: JSON.stringify({
            environmentKey: currentEnvironmentKey(),
            fieldCode,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || 'application/octet-stream',
            ...(recordId ? { recordId } : {}),
          }),
        },
      );
      const uploaded = await fetch(plan.uploadUrl, {
        method: plan.uploadMethod,
        headers: plan.headers,
        body: file,
      });
      if (!uploaded.ok)
        throw new Error(`FILE_UPLOAD_FAILED: HTTP_${uploaded.status}`);
      return request<DataFileRef>(
        `${base}/files/${encodeURIComponent(plan.file.id)}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ environmentKey: currentEnvironmentKey() }),
        },
      );
    },
  };
}

export async function transactNativeData(
  operations: DataTransactionOperation[],
  idempotencyKey: string = crypto.randomUUID(),
) {
  const transaction: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey,
    operations,
  };
  return request<DataTransactionResult>(`${nativeBase()}/data/transactions`, {
    method: 'POST',
    body: JSON.stringify({
      ...transaction,
      environmentKey: currentEnvironmentKey(),
    }),
  });
}

/**
 * Authorizes a managed upload through the active Named Action contract. Once
 * complete, the result is an ordinary durable DataFileRef; later data writes
 * persist that JSON value without replaying the action or upload intent.
 */
export async function uploadOperationManagedFile(input: {
  operationCode: string;
  resourceCode: string;
  fieldCode: string;
  intent: 'create' | 'update';
  file: File;
  recordId?: string;
}): Promise<DataFileRef> {
  if (
    (input.intent === 'update' && !input.recordId) ||
    (input.intent === 'create' && input.recordId)
  ) {
    throw new Error('OPENXIANGDA_OPERATION_FILE_RECORD_INTENT_MISMATCH');
  }
  const base = `${nativeBase()}/operations/${encodeURIComponent(
    input.operationCode,
  )}/data/${encodeURIComponent(input.resourceCode)}/files`;
  const plan = await request<DataFileUploadPlan>(`${base}/uploads/initiate`, {
    method: 'POST',
    body: JSON.stringify({
      environmentKey: currentEnvironmentKey(),
      intent: input.intent,
      fieldCode: input.fieldCode,
      fileName: input.file.name,
      fileSize: input.file.size,
      contentType: input.file.type || 'application/octet-stream',
      ...(input.recordId ? { recordId: input.recordId } : {}),
    }),
  });
  const uploaded = await fetch(plan.uploadUrl, {
    method: plan.uploadMethod,
    headers: plan.headers,
    body: input.file,
  });
  if (!uploaded.ok) {
    throw new Error(`FILE_UPLOAD_FAILED: HTTP_${uploaded.status}`);
  }
  return await request<DataFileRef>(
    `${base}/${encodeURIComponent(plan.file.id)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

function nativeBase() {
  return `/service/openxiangda-api/v2/applications/${applicationCode()}/native`;
}

export interface ResourceListPreference {
  version: 1;
  columns: Array<{ key: string; visible: boolean; fixed?: 'left' }>;
  filters: {
    keyword?: string;
    values?: Record<string, unknown>;
    where?: DataWhere;
  };
  sorts: Array<{ field: string; direction: 'ascend' | 'descend' }>;
  density: 'small' | 'middle' | 'large';
  pageSize: number;
  updatedAt?: string;
}

function adminListPreferenceBase() {
  return `${nativeBase()}/admin-list/preferences`;
}

export async function loadResourceListPreference(listKey: string) {
  return await request<ResourceListPreference | null>(
    `${adminListPreferenceBase()}/${encodeURIComponent(listKey)}`,
  );
}

export async function saveResourceListPreference(
  listKey: string,
  preference: ResourceListPreference,
) {
  return await request<ResourceListPreference>(
    `${adminListPreferenceBase()}/${encodeURIComponent(listKey)}`,
    {
      method: 'PUT',
      body: JSON.stringify(preference),
    },
  );
}

export async function resetResourceListPreference(listKey: string) {
  await request<null>(
    `${adminListPreferenceBase()}/${encodeURIComponent(listKey)}`,
    { method: 'DELETE' },
  );
}

function roleManagementBase() {
  return `${nativeBase()}/authz/management`;
}

function roleManagementQuery(input: Record<string, unknown> = {}) {
  const query = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
  });
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  return query;
}

export async function loadRoleManagementCatalog() {
  return await request<NativeAuthorizationManagementCatalog>(
    `${roleManagementBase()}/catalog?${roleManagementQuery()}`,
  );
}

export async function listRoleMemberships(
  input: {
    status?: 'active' | 'revoked' | 'expired';
    userId?: string;
    roleCode?: string;
    keyword?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return await request<NativeRoleMembershipPage>(
    `${roleManagementBase()}/memberships?${roleManagementQuery(input)}`,
  );
}

export async function searchRoleManagementUsers(input: {
  keyword: string;
  cursor?: string;
  limit?: number;
}) {
  const query = roleManagementQuery({
    purpose: 'authorization-management',
    keyword: input.keyword.trim(),
    cursor: input.cursor,
    limit: Math.min(Math.max(Number(input.limit) || 20, 1), 100),
  });
  return await request<DirectoryEntryPage>(
    `${nativeBase().replace(/\/native$/, '')}/directory/users?${query}`,
  );
}

export interface CreateRoleMembershipInput {
  operationId: string;
  reason: string;
  userId: string;
  roleCode: string;
  scopeGrants?: NativeScopeGrant[];
  validFrom?: string | null;
  validTo?: string | null;
}

export async function createRoleMembership(input: CreateRoleMembershipInput) {
  return await request<NativeRoleMembershipMutationResult>(
    `${roleManagementBase()}/memberships`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

export interface UpdateRoleMembershipInput {
  operationId: string;
  reason: string;
  expectedRevision: number;
  scopeGrants?: NativeScopeGrant[];
  validFrom?: string | null;
  validTo?: string | null;
}

export async function updateRoleMembership(
  membershipId: string,
  input: UpdateRoleMembershipInput,
) {
  return await request<NativeRoleMembershipMutationResult>(
    `${roleManagementBase()}/memberships/${encodeURIComponent(
      membershipId,
    )}/update`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

export async function revokeRoleMembership(
  membershipId: string,
  input: { operationId: string; reason: string; expectedRevision: number },
) {
  return await request<NativeRoleMembershipMutationResult>(
    `${roleManagementBase()}/memberships/${encodeURIComponent(
      membershipId,
    )}/revoke`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

export async function listRoleManagementGrants(
  input: {
    status?: 'active' | 'revoked';
    subjectRoleCode?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return await request<NativeRoleManagementGrantPage>(
    `${roleManagementBase()}/role-management-grants?${roleManagementQuery(
      input,
    )}`,
  );
}

export interface SetRoleManagementGrantInput {
  operationId: string;
  reason: string;
  subjectRoleCode: string;
  manageAllRoles: boolean;
  managedRoleCodes: string[];
  actions: NativeRoleManagementAction[];
}

export async function createRoleManagementGrant(
  input: SetRoleManagementGrantInput,
) {
  return await request<NativeRoleManagementGrantMutationResult>(
    `${roleManagementBase()}/role-management-grants`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

export async function updateRoleManagementGrant(
  grantId: string,
  input: SetRoleManagementGrantInput & { expectedRevision: number },
) {
  return await request<NativeRoleManagementGrantMutationResult>(
    `${roleManagementBase()}/role-management-grants/${encodeURIComponent(
      grantId,
    )}/update`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

export async function revokeRoleManagementGrant(
  grantId: string,
  input: { operationId: string; reason: string; expectedRevision: number },
) {
  return await request<NativeRoleManagementGrantMutationResult>(
    `${roleManagementBase()}/role-management-grants/${encodeURIComponent(
      grantId,
    )}/revoke`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        environmentKey: currentEnvironmentKey(),
      }),
    },
  );
}

export async function loadAuthorizationMutationReceipt(operationId: string) {
  return await request<NativeAuthorizationMutationReceipt>(
    `${roleManagementBase()}/mutation-receipts/${encodeURIComponent(
      operationId,
    )}`,
  );
}

function dataBase(code: string) {
  return `${nativeBase()}/data/${encodeURIComponent(code)}`;
}

export function dataFileContentUrl(
  resource: string,
  fileId: string,
  disposition: 'attachment' | 'inline' = 'attachment',
  variant?: 'thumbnail',
) {
  const query = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    disposition,
  });
  if (variant) query.set('variant', variant);
  const perspective = currentPerspectiveCode();
  if (perspective) query.set('perspective', perspective);
  return `${dataBase(resource)}/files/${encodeURIComponent(
    fileId,
  )}/content?${query}`;
}

export function dataRichTextImageSource(resource: string, fileId: string) {
  const query = new URLSearchParams({ disposition: 'inline' });
  const perspective = currentPerspectiveCode();
  if (perspective) query.set('perspective', perspective);
  return `${dataBase(resource)}/files/${encodeURIComponent(fileId)}/content?${query}`;
}

export async function loadDataFilePreview(resource: string, fileId: string) {
  return request<DataFilePreview>(
    `${dataBase(resource)}/files/${encodeURIComponent(
      fileId,
    )}/preview?environmentKey=${encodeURIComponent(currentEnvironmentKey())}`,
  );
}

export async function fetchDataFileBlob(
  resource: string,
  fileId: string,
  variant?: 'thumbnail',
) {
  const headers = new Headers({ accept: 'application/octet-stream,*/*' });
  const response = await fetch(
    dataFileContentUrl(resource, fileId, 'inline', variant),
    {
      credentials: 'include',
      headers,
    },
  );
  if (!response.ok)
    throw new Error(`FILE_CONTENT_READ_FAILED: HTTP_${response.status}`);
  return response.blob();
}

export async function downloadDataFile(
  resource: string,
  fileId: string,
  fileName: string,
) {
  const blob = await fetchDataFileBlob(resource, fileId);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export interface WorkflowFileBinding {
  instanceId: string;
  resourceCode: string;
  recordId: string;
  fieldCode: string;
}

function workflowFileBase(binding: WorkflowFileBinding, fileId: string) {
  const query = new URLSearchParams({
    resourceCode: binding.resourceCode,
    recordId: binding.recordId,
    fieldCode: binding.fieldCode,
  });
  return `${workflowBase()}/instances/${encodeURIComponent(
    binding.instanceId,
  )}/files/${encodeURIComponent(fileId)}?${query}`;
}

export function workflowDataFileContentUrl(
  binding: WorkflowFileBinding,
  fileId: string,
  disposition: 'attachment' | 'inline' = 'attachment',
  variant?: 'thumbnail',
) {
  const base = workflowFileBase(binding, fileId);
  const [path, query = ''] = base.split('?');
  const parameters = new URLSearchParams(query);
  parameters.set('disposition', disposition);
  if (variant) parameters.set('variant', variant);
  return `${path}/content?${parameters}`;
}

export async function loadWorkflowDataFilePreview(
  binding: WorkflowFileBinding,
  fileId: string,
) {
  const base = workflowFileBase(binding, fileId);
  const [path, query = ''] = base.split('?');
  return await request<DataFilePreview>(`${path}/preview?${query}`);
}

export async function fetchWorkflowDataFileBlob(
  binding: WorkflowFileBinding,
  fileId: string,
  variant?: 'thumbnail',
) {
  const response = await fetch(
    workflowDataFileContentUrl(binding, fileId, 'inline', variant),
    {
      credentials: 'include',
      headers: new Headers({ accept: 'application/octet-stream,*/*' }),
    },
  );
  if (!response.ok) {
    throw new Error(`WORKFLOW_FILE_CONTENT_READ_FAILED: HTTP_${response.status}`);
  }
  return await response.blob();
}

export async function downloadWorkflowDataFile(
  binding: WorkflowFileBinding,
  fileId: string,
  fileName: string,
) {
  const blob = await fetchWorkflowDataFileBlob(binding, fileId);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function workflowBase() {
  return `${applicationServiceBase()}/workflow`;
}

export interface WorkflowWorkCenterPage {
  engineVersion: '2.0';
  authorizationMode: 'current_user_role_union';
  authorizationDigest: string;
  status?: 'pending' | 'completed';
  view: import('openxiangda-contracts/browser').WorkflowWorkCenterView;
  counts: Record<import('openxiangda-contracts/browser').WorkflowWorkCenterView, number>;
  total: number;
  limit: number;
  offset: number;
  items: WorkflowWorkCenterItem[];
}

export async function loadWorkflowLaunchSurface(workflowCode: string) {
  const query = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
  });
  return await requestRead<WorkflowLaunchSurface>(
    `${workflowBase()}/definitions/${encodeURIComponent(
      workflowCode,
    )}/launch-surface?${query}`,
  );
}

/** Executes the exact application Named Action sealed into a Workflow launch Surface. */
export async function executeWorkflowLaunchNamedOperation<
  TResult extends Record<string, unknown> = Record<string, unknown>,
>(
  intent: WorkflowNamedOperationLaunchIntent,
  input: Record<string, unknown>,
): Promise<TResult> {
  if (
    intent.method !== 'POST' ||
    !intent.href.startsWith('/') ||
    intent.href.startsWith('//') ||
    intent.href.split('/').includes('..')
  ) {
    throw new Error('OPENXIANGDA_WORKFLOW_NAMED_OPERATION_TARGET_INVALID');
  }
  return await requestApplicationApi<TResult>(intent.href, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}


function businessProcessBase() {
  return `${applicationServiceBase()}/business-process`;
}

export type StandardProcessCommitInput = Omit<
  StandardProcessCommit,
  'schemaVersion' | 'environmentKey'
> & { processOperationCode: string };

export async function commitStandardProcess(
  input: StandardProcessCommitInput,
): Promise<BusinessProcessCommand> {
  const expectedOperationCode = `openxiangda.workflow.${input.workflowCode}.submit`;
  if (input.processOperationCode !== expectedOperationCode) {
    throw new Error('OPENXIANGDA_STANDARD_PROCESS_OPERATION_MISMATCH');
  }
  const { processOperationCode: _sealedOperation, ...wire } = input;
  return await request<BusinessProcessCommand>(
    `${businessProcessBase()}/standard-commands`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...wire,
        schemaVersion: SCHEMA_VERSIONS.standardProcessCommit,
        environmentKey: currentEnvironmentKey(),
      } satisfies StandardProcessCommit),
    },
  );
}

/** Find readable original commands when entering from a subject record. */
export async function listBusinessProcessCommands(
  input: Omit<BusinessProcessCommandQuery, 'environmentKey'>,
  signal?: AbortSignal,
): Promise<BusinessProcessCommandList> {
  const query = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    resourceCode: input.resourceCode,
    recordId: input.recordId,
  });
  for (const key of ['workflowCode', 'operationCode', 'pageSize', 'beforeCommandId'] as const) {
    if (input[key] !== undefined) query.set(key, String(input[key]));
  }
  return await request<BusinessProcessCommandList>(
    `${businessProcessBase()}/commands?${query}`, { signal },
  );
}

export async function loadBusinessProcessCommand(
  commandId: string,
): Promise<BusinessProcessCommand> {
  return await request<BusinessProcessCommand>(
    `${businessProcessBase()}/commands/${encodeURIComponent(commandId)}`,
  );
}

/** Read the durable idempotency receipt without creating or replaying a command. */
export async function loadBusinessProcessReceipt(
  commandId: string,
): Promise<BusinessProcessReceipt> {
  return await request<BusinessProcessReceipt>(
    `${businessProcessBase()}/commands/${encodeURIComponent(commandId)}/receipt`,
  );
}

/** Read command progress with a revision cursor; the platform owns all state transitions. */
export async function pollBusinessProcessCommand(
  commandId: string,
  afterRevision = 0,
): Promise<BusinessProcessPoll> {
  if (!Number.isInteger(afterRevision) || afterRevision < 0) {
    throw new Error('OPENXIANGDA_BUSINESS_PROCESS_POLL_CURSOR_INVALID');
  }
  const query = new URLSearchParams({ afterRevision: String(afterRevision) });
  return await request<BusinessProcessPoll>(
    `${businessProcessBase()}/commands/${encodeURIComponent(commandId)}/poll?${query}`,
  );
}

export async function loadProcessCommandSurface(
  commandId: string,
  signal?: AbortSignal,
): Promise<ProcessCommandSurface> {
  return await request<ProcessCommandSurface>(
    `${businessProcessBase()}/commands/${encodeURIComponent(commandId)}/surface`,
    { signal },
  );
}

export async function answerBusinessProcessCommand(
  commandId: string,
  input: Omit<BusinessProcessAnswer, 'schemaVersion'>,
): Promise<BusinessProcessCommand> {
  return await request<BusinessProcessCommand>(
    `${businessProcessBase()}/commands/${encodeURIComponent(commandId)}/answers`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        schemaVersion: SCHEMA_VERSIONS.businessProcessAnswer,
      } satisfies BusinessProcessAnswer),
    },
  );
}

export async function retryBusinessProcessCommand(
  commandId: string,
  input: Omit<BusinessProcessRetry, 'schemaVersion'>,
): Promise<BusinessProcessCommand> {
  return await request<BusinessProcessCommand>(
    `${businessProcessBase()}/commands/${encodeURIComponent(commandId)}/retry`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        schemaVersion: SCHEMA_VERSIONS.businessProcessRetry,
      } satisfies BusinessProcessRetry),
    },
  );
}

export async function loadWorkflowWorkCenter(input: {
  status?: 'pending' | 'completed';
  view?: import('openxiangda-contracts/browser').WorkflowWorkCenterView;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    ...(input.view ? { view: input.view } : { status: input.status || 'pending' }),
    limit: String(input.limit ?? 20),
    offset: String(input.offset ?? 0),
  });
  return await requestRead<WorkflowWorkCenterPage>(
    `${workflowBase()}/work-center/items?${query}`,
  );
}

export async function loadWorkflowTaskSurface(taskId: string) {
  const csrfToken = await workflowCsrfToken();
  const surface = await requestRead<WorkflowSurface>(
    `${workflowBase()}/tasks/${encodeURIComponent(taskId)}/surface`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowSurface(surface);
}

export async function loadWorkflowInstanceSurface(instanceId: string) {
  const csrfToken = await workflowCsrfToken();
  const surface = await requestRead<WorkflowSurface>(
    `${workflowBase()}/instances/${encodeURIComponent(instanceId)}/surface`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowSurface(surface);
}

export async function loadWorkflowTimeline(instanceId: string) {
  return await requestRead<WorkflowTimeline>(
    `${workflowBase()}/instances/${encodeURIComponent(instanceId)}/timeline`,
  );
}

function normalizeWorkflowDetailSurface(
  detail: WorkflowDetailSurfaceV2,
): WorkflowDetailSurfaceV2 {
  return {
    ...detail,
    surface: normalizeWorkflowSurface(detail.surface),
  };
}

export async function loadWorkflowTaskDetail(taskId: string) {
  const csrfToken = await workflowCsrfToken();
  const detail = await requestRead<WorkflowDetailSurfaceV2>(
    `${workflowBase()}/tasks/${encodeURIComponent(taskId)}/detail`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowDetailSurface(detail);
}

export async function loadWorkflowInstanceDetail(instanceId: string) {
  const csrfToken = await workflowCsrfToken();
  const detail = await requestRead<WorkflowDetailSurfaceV2>(
    `${workflowBase()}/instances/${encodeURIComponent(instanceId)}/detail`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowDetailSurface(detail);
}

export async function loadWorkflowRecordDetail(resourceCode: string, recordId: string) {
  const csrfToken = await workflowCsrfToken();
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey() });
  const detail = await requestRead<WorkflowDetailSurfaceV2>(
    `${workflowBase()}/records/${encodeURIComponent(resourceCode)}/${encodeURIComponent(recordId)}/detail?${query}`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowDetailSurface(detail);
}

export async function loadWorkflowDataAudit(instanceId: string) {
  const csrfToken = await workflowCsrfToken();
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey(), limit: '50', offset: '0' });
  return await requestRead<import('openxiangda-contracts/browser').DataAuditPage>(
    `${workflowBase()}/instances/${encodeURIComponent(instanceId)}/data-audit?${query}`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
}

export async function getNotificationMessage(messageId: string): Promise<NotificationMessageDetailV2> {
  return request<NotificationMessageDetailV2>(
    `${applicationServiceBase()}/notification-hub/management/messages/${encodeURIComponent(messageId)}?environmentKey=${encodeURIComponent(currentEnvironmentKey())}`,
  );
}

export async function getDingTalkCardReadReceipt(messageId: string, deliveryId: string): Promise<NotificationReadReceiptV2> {
  return request<NotificationReadReceiptV2>(
    `${applicationServiceBase()}/notification-hub/management/messages/${encodeURIComponent(messageId)}/deliveries/${encodeURIComponent(deliveryId)}/read-receipt?environmentKey=${encodeURIComponent(currentEnvironmentKey())}`,
  );
}

export async function refreshDingTalkCardReadReceipt(messageId: string, deliveryId: string): Promise<NotificationReadReceiptV2> {
  return request<NotificationReadReceiptV2>(
    `${applicationServiceBase()}/notification-hub/management/messages/${encodeURIComponent(messageId)}/deliveries/${encodeURIComponent(deliveryId)}/read-receipt/refresh`,
    { method: 'POST', body: JSON.stringify({ environmentKey: currentEnvironmentKey() }) },
  );
}

export async function loadApplicationTodos(input: {
  view: ApplicationTodoViewV2;
  unread?: boolean;
  keyword?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    view: input.view,
    limit: String(input.limit ?? 20),
    offset: String(input.offset ?? 0),
  });
  if (input.unread) query.set('unread', 'true');
  if (input.keyword?.trim()) query.set('keyword', input.keyword.trim());
  return await request<ApplicationTodoCenterPageV2>(
    `${applicationServiceBase()}/todos?${query}`,
  );
}

export async function recordApplicationTodoInteraction(
  messageId: string,
  kind: 'read' | 'click',
) {
  return await request<ApplicationTodoInteractionResultV2>(
    `${applicationServiceBase()}/todos/${encodeURIComponent(
      messageId,
    )}/interactions`,
    {
      method: 'POST',
      body: JSON.stringify({
        environmentKey: currentEnvironmentKey(),
        kind,
      }),
    },
  );
}

export async function executeWorkflowTaskCommand(
  taskId: string,
  command: WorkflowCommand | string,
  input: WorkflowCommandInput,
): Promise<WorkflowCommandResult> {
  const csrfToken = await workflowCsrfToken();
  return await request<WorkflowCommandResult>(
    `${workflowBase()}/tasks/${encodeURIComponent(
      taskId,
    )}/commands/${encodeURIComponent(command)}`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': csrfToken },
      body: JSON.stringify(input),
    },
  );
}

export async function executeWorkflowInstanceCommand(
  instanceId: string,
  command: 'withdraw' | 'terminate',
  input: WorkflowCommandInput,
): Promise<WorkflowCommandResult> {
  const csrfToken = await workflowCsrfToken();
  return await request<WorkflowCommandResult>(
    `${workflowBase()}/instances/${encodeURIComponent(
      instanceId,
    )}/commands/${encodeURIComponent(command)}`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': csrfToken },
      body: JSON.stringify(input),
    },
  );
}

/** Execute a server-issued Workflow operation without task/instance branching. */
export async function executeWorkflowOperation(
  surface: WorkflowSurface,
  operation: WorkflowSurface['operations'][number],
  input: Record<string, unknown> = {},
  options: { idempotencyKey?: string } = {},
): Promise<WorkflowCommandResult> {
  if (
    operation.kind !== 'workflow_command' ||
    !operation.visible ||
    !operation.enabled
  ) {
    throw new Error('OPENXIANGDA_WORKFLOW_OPERATION_NOT_EXECUTABLE');
  }
  if (!surface.commandToken) {
    throw new Error('OPENXIANGDA_WORKFLOW_COMMAND_TOKEN_REQUIRED');
  }
  const csrfToken = await workflowCsrfToken();
  const href = operation.execute.href.startsWith('/service/')
    ? operation.execute.href
    : `/service${operation.execute.href}`;
  return await request<WorkflowCommandResult>(href, {
    method: operation.execute.method,
    headers: { 'x-openxiangda-csrf-token': csrfToken },
    body: JSON.stringify({
      commandToken: surface.commandToken,
      idempotencyKey:
        options.idempotencyKey || randomWorkflowIdempotencyKey(operation.key),
      input,
    } satisfies WorkflowCommandInput),
  });
}

function randomWorkflowIdempotencyKey(command: string) {
  const suffix =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `workflow:${command}:${suffix}`;
}

async function workflowCsrfToken() {
  if (!applicationCsrfToken) {
    await loadApplicationLoginSurface({
      device:
        typeof window !== 'undefined' &&
        /(?:^|\/)m(?:\/|$)/.test(window.location.pathname)
          ? 'mobile'
          : 'desktop',
      returnTo:
        typeof window === 'undefined'
          ? '/'
          : `${window.location.pathname}${window.location.search}`,
    });
  }
  if (!applicationCsrfToken) {
    throw new Error('OPENXIANGDA_WORKFLOW_CSRF_TOKEN_REQUIRED');
  }
  return applicationCsrfToken;
}

export interface ResourceFormDraft {
  viewCode?: string;
  id: string;
  revision: number;
  mode: 'create' | 'update';
  recordId?: string;
  recordRevision?: number;
  values: Record<string, unknown>;
  updatedAt: string;
  expiresAt: string;
}
/** Authenticated drafts use the same current user/environment as Native CRUD. */
export function createResourceFormDraftClient(resourceCode: string, mode: 'create' | 'update', recordId?: string, viewCode?: string) {
  const base = `${nativeBase()}/form-drafts/${encodeURIComponent(resourceCode)}`;
  const scope = () => ({ environmentKey: currentEnvironmentKey(), mode, ...(recordId ? { recordId } : {}), ...(viewCode ? { viewCode } : {}) });
  return {
    list() {
      return request<{ items: ResourceFormDraft[]; limit: number; retentionDays: number }>(`${base}/?${new URLSearchParams(scope())}`);
    },
    save(input: { id: string; expectedRevision: number; recordRevision?: number; values: Record<string, unknown> }) {
      return request<ResourceFormDraft>(`${base}/save`, { method: 'POST', body: JSON.stringify({ ...scope(), ...input }) });
    },
    remove(draft: Pick<ResourceFormDraft, 'id' | 'revision'>) {
      return request<{ deleted: boolean }>(`${base}/delete`, { method: 'POST', body: JSON.stringify({ ...scope(), id: draft.id, expectedRevision: draft.revision }) });
    },
    submit(draft: Pick<ResourceFormDraft, 'id' | 'revision'>, operations: DataTransactionOperation[]) {
      return request<DataTransactionResult>(`${base}/submit`, { method: 'POST', body: JSON.stringify({ ...scope(), id: draft.id, expectedRevision: draft.revision, operations }) });
    },
  };
}


export async function loadWorkflowRecordCorrection(resourceCode: string, recordId: string) {
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey() });
  const surface = await requestRead<WorkflowRecordCorrectionSurface>(`${workflowBase()}/records/${encodeURIComponent(resourceCode)}/${encodeURIComponent(recordId)}/correction-surface?${query}`);
  assertWorkflowRecordCorrectionScope(surface, resourceCode, recordId);
  return surface;
}

function assertWorkflowRecordCorrectionScope(surface: WorkflowRecordCorrectionSurface, resourceCode: string, recordId: string) {
  if (
    surface.schemaVersion !== 'openxiangda.workflow-record-correction-surface/v2' ||
    surface.appCode !== applicationCode() ||
    surface.environmentKey !== currentEnvironmentKey() ||
    surface.resourceCode !== resourceCode || surface.recordId !== recordId ||
    surface.record?.id !== recordId ||
    !Number.isSafeInteger(surface.expectedRevision) || surface.expectedRevision < 1 ||
    surface.expectedRevision !== surface.record.revision ||
    surface.preservesApprovalResult !== true || surface.surface?.mutationOwner !== 'workflow'
  ) throw new Error('OPENXIANGDA_WORKFLOW_CORRECTION_SURFACE_SCOPE_INVALID');
  const expected = `${workflowBase()}/records/${encodeURIComponent(resourceCode)}/${encodeURIComponent(recordId)}/corrections`;
  const href = surface.command.href.startsWith('/service/') ? surface.command.href : `/service${surface.command.href}`;
  if (href !== expected || surface.command.method !== 'POST') throw new Error('OPENXIANGDA_WORKFLOW_CORRECTION_COMMAND_SCOPE_INVALID');
  return href;
}

export async function correctWorkflowRecord(surface: WorkflowRecordCorrectionSurface, resourceCode: string, operations: DataTransactionOperation[], idempotencyKey: string) {
  const href = assertWorkflowRecordCorrectionScope(surface, resourceCode, surface.recordId);
  const root = operations[0];
  if (!root || root.operation !== 'update' || root.resourceCode !== resourceCode || root.id !== surface.recordId || root.expectedRevision !== surface.expectedRevision) {
    throw new Error('OPENXIANGDA_WORKFLOW_CORRECTION_RECORD_SCOPE_INVALID');
  }
  if (Object.keys(root.data).some(key => !surface.editableFields.includes(key) || surface.surface.fields[key]?.type === 'subtable')) {
    throw new Error('OPENXIANGDA_WORKFLOW_CORRECTION_FIELD_INVALID');
  }
  const csrf = await workflowCsrfToken();
  return request(href, { method: 'POST', headers: { 'x-openxiangda-csrf-token': csrf }, body: JSON.stringify({
    schemaVersion: 'openxiangda.workflow-record-correction/v2', environmentKey: surface.environmentKey,
    idempotencyKey, operations,
  } satisfies WorkflowRecordCorrectionInput) });
}
