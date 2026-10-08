import { parseBusinessProcessResolution, parseBusinessProcessCommitResult } from 'openxiangda-contracts/browser';
import type { WorkflowDelegationAdministration, WorkflowDelegationCatalog, WorkflowDelegationCandidatePage, WorkflowDelegationCandidateQuery,
  WorkflowDelegationListQuery, WorkflowDelegationPage, WorkflowDelegationMutationPreview, WorkflowDelegationMutationReceipt, WorkflowDelegationMutationRequest } from 'openxiangda-contracts/browser';
import { recoverManagedRead } from './managed-read-recovery';
import { recoverRuntimeAuthorizationRead } from './runtime-authorization-recovery';
import type { ManagedReadRecoveryOptions } from './managed-command';
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
  type WorkflowTaskFieldSourceQuery,
  type WorkflowTaskSourceBinding,
  type DataFieldUserCandidateQuery,
  type WorkflowTaskUserCandidateQuery,
  type UserCandidatePage,
  type DataExportRequest,
  type DataPage,
  type DataQuery,
  type DataWhere,
  type DataRecord,
  type DataRecordPrint,
  type DataResourceSurface,
  type DataFormDraftStateSchema,
  type DataTransactionOperation,
  type DataTransactionRequest,
  type DataTransactionResult,
  type DirectoryEntryPage,
  type DirectoryResolveRequest,
  type RuntimeAuthorizationContext,
  type RuntimeRoleSummary,
  type SubjectProfile,
  type ApplicationOperationReceiptV2,
  type ApplicationFileIntentV2,
  type ApplicationOperationSurfaceCatalogV2,
  type ApplicationOperationSurfaceV2,
  type SubjectReadSurfaceResultV2,
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
  type BusinessProcessResolution,
  type BusinessProcessResolutionQuery,
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
  type NativeRoleMembershipBatchInput,
  type NativeRoleMembershipBatchResult,
  type NativeScopeGrant,
} from 'openxiangda-contracts/browser';
import { useSyncExternalStore } from 'react';
import type { ManagedConcurrencyClient } from './managed-command';
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
  retryable?: boolean;
  retryAfterMs?: number;
  data: T;
}

export class OpenXiangdaPlatformRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly data: unknown;
  readonly request?: Readonly<PlatformRequestContext>;

  constructor(input: {
    code: string;
    status: number;
    message: string;
    retryable?: boolean;
    retryAfterMs?: number;
    data?: unknown;
    request?: PlatformRequestContext;
  }) {
    super(input.message);
    this.name = 'OpenXiangdaPlatformRequestError';
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
    this.data = input.data ?? null;
    this.request = input.request ? Object.freeze({ ...input.request }) : undefined;
  }
}

/**
 * Convert platform read failures into copy that is safe and useful for a user.
 * Internal error codes remain available on the error object for diagnostics,
 * but generated resource pages should not expose them as the primary message.
 */
export function platformReadErrorMessage(error: unknown, fallback = '请稍后重试') {
  if (error instanceof OpenXiangdaPlatformRequestError) {
    const path = error.request?.path || '';
    if (error.status === 404 && /^\/[^/]+\/.*\/records\//.test(path)) {
      return '记录不存在，可能已被删除或当前账号无权查看。';
    }
    if (error.status === 403 && /^\/[^/]+\/.*\/records\//.test(path)) {
      return '当前账号无权查看该记录。';
    }
    return error.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface PlatformRequestContext {
  requestId: string | null;
  method: string;
  path: string;
  observedAt: string;
  appCode: string | null;
  environmentKey: string | null;
}

const safeRequestId = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : null;
function requestContext(path: string, init: RequestInit = {}, response?: Response, bodyId?: unknown): PlatformRequestContext {
  const cleanPath = path.split(/[?#]/)[0] || '/';
  let appCode: string | null = null;
  let environmentKey: string | null = null;
  try {
    const candidate = applicationCode();
    appCode = /^[a-z][a-z0-9-]{2,63}$/.test(candidate) ? candidate : null;
    environmentKey = activeIdentity?.environment.key || runtimeMount()?.environmentKey || null;
  } catch { /* Authentication can fail before application metadata is installed. */ }
  return { requestId: safeRequestId(response?.headers.get('x-request-id')) || safeRequestId(bodyId),
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(String(init.method || 'GET').toUpperCase()) ? String(init.method || 'GET').toUpperCase() : 'UNKNOWN',
    path: /^\/(?!\/)[A-Za-z0-9_./%:@+-]*$/.test(cleanPath) ? cleanPath.slice(0, 1000) : '/',
    observedAt: new Date().toISOString(), appCode, environmentKey };
}

/** A support copy contains no request body, response data, credentials or free-text message. */
export function platformRequestDiagnostic(error: unknown) {
  if (!(error instanceof OpenXiangdaPlatformRequestError) || !error.request) return null;
  return { schemaVersion: 'openxiangda.request-diagnostic/v1' as const,
    code: /^[A-Z][A-Z0-9_]{0,127}$/.test(error.code) ? error.code : 'PLATFORM_REQUEST_FAILED',
    status: error.status, ...error.request };
}

function responseRequestError(path: string, init: RequestInit | undefined, response: Response, payload: Partial<PlatformEnvelope<unknown>> | null, fallback: string) {
  const context = requestContext(path, init, response, payload?.requestId);
  const dataCode = payload?.data && typeof payload.data === 'object' && 'errorCode' in payload.data
    && typeof payload.data.errorCode === 'string' ? payload.data.errorCode : undefined;
  const code = String(payload?.errorCode || dataCode || payload?.code || `HTTP_${response.status}`);
  const retryAfter = response.headers.get('retry-after');
  const headerDelay = retryAfter ? (/^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter)*1000 : Date.parse(retryAfter)-Date.now()) : undefined;
  const dataDelay = payload?.data && typeof payload.data === 'object' && 'retryAfterMs' in payload.data
    ? payload.data.retryAfterMs : undefined;
  const delays = [headerDelay, payload?.retryAfterMs, dataDelay]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return new OpenXiangdaPlatformRequestError({ code, status: response.status,
    retryAfterMs: delays.length ? Math.max(...delays) : undefined,
    message: response.status >= 400 && response.status < 500 && typeof payload?.message === 'string' && payload.message.trim()
      ? payload.message
      : `${code}: ${payload?.message || fallback}${context.requestId ? ` (requestId: ${context.requestId})` : ''}`,
    retryable: typeof payload?.retryable === 'boolean' ? payload.retryable : undefined,
    data: payload?.data ?? null, request: context });
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
      throw responseRequestError('/service/api/auth/refresh', { method: 'POST' }, response, payload, '平台登录状态刷新失败');
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
    const response = await fetchWithDiagnostics(path, {
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
      // Application backends may return Nest HttpException JSON without an envelope code.
      // Only failed HTTP responses use that object as an error payload; successful JSON
      // retains the existing envelope/plain-response contract.
      const failurePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Partial<PlatformEnvelope<unknown>> : null;
      throw responseRequestError(path, init, response, failurePayload, '平台请求失败');
    }
    return envelope ? envelope.data : (payload as T);
  } finally {
    endGlobalRequest();
  }
}

async function fetchWithDiagnostics(path: string, init: RequestInit) {
  try { return await fetchWithPlatformSession(path, init); }
  catch (error) {
    if (error instanceof OpenXiangdaPlatformRequestError || (error as Error)?.name === 'AbortError' || init.signal?.aborted) throw error;
    throw new OpenXiangdaPlatformRequestError({ code: 'PLATFORM_TRANSPORT_UNAVAILABLE', status: 503,
      message: '平台请求未取得确定响应；写操作请先查询原操作状态', request: requestContext(path, init) });
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
          request: error.request,
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
    const response = await fetchWithDiagnostics(path, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as PlatformEnvelope<unknown> | null;
      throw responseRequestError(path, init, response, payload, '平台导出失败');
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
  const headers = new Headers(init?.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes((init?.method || 'GET').toUpperCase()) &&
      !headers.has('x-openxiangda-csrf-token')) {
    headers.set('x-openxiangda-csrf-token', await workflowCsrfToken());
  }
  return await request<T>(applicationApiPath(path), { ...init, headers });
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
interface RuntimeAuthorizationLoad {
  promise: Promise<RuntimeAuthorization>;
  controller: AbortController;
  key: string;
  subscribers: number;
  settled: boolean;
}
let runtimeAuthorizationLoad: RuntimeAuthorizationLoad | undefined;
let runtimeAuthorizationKey: string | undefined;
let runtimeAuthorizationGeneration = 0;

function clearRuntimeAuthorization() {
  const previous = runtimeAuthorizationLoad;
  runtimeAuthorizationGeneration += 1;
  activeIdentity = undefined;
  runtimeAuthorizationLoad = undefined;
  runtimeAuthorizationKey = undefined;
  previous?.controller.abort(new DOMException('登录身份已变化', 'AbortError'));
}

function applicationServiceBase() {
  return `/service/openxiangda-api/v2/applications/${applicationCode()}`;
}

function applicationAuthenticationBase() {
  return `${applicationServiceBase()}/auth`;
}

let applicationCsrfToken = '';
// A workflow command is bound to the header used to issue its one-time surface.
const workflowCommandCsrf = new Map<string, { csrf: string; expiresAt: number }>();
function bindWorkflowCsrf(surface: WorkflowSurface, csrf: string): WorkflowSurface {
  bindWorkflowCommandCsrf(surface.commandToken, surface.commandTokenExpiresAt, csrf);
  return surface;
}
function bindWorkflowCommandCsrf(commandToken: string | null | undefined, expiration: string | null | undefined, csrf: string, retainForReceipt = false) {
  const now = Date.now();
  for (const [key, value] of workflowCommandCsrf) if (value.expiresAt <= now) workflowCommandCsrf.delete(key);
  const expiresAt = Date.parse(expiration || '');
  if (commandToken && Number.isFinite(expiresAt) && expiresAt > now) {
    if (!workflowCommandCsrf.has(commandToken) && workflowCommandCsrf.size >= 512) workflowCommandCsrf.delete(workflowCommandCsrf.keys().next().value!);
    // Record deletion receipts can outlive their preview. Keep the original header
    // in the same bounded, identity-cleared command cache until it is evicted.
    workflowCommandCsrf.set(commandToken, { csrf, expiresAt: retainForReceipt ? Infinity : expiresAt });
  }
}
async function commandBoundCsrf(commandToken?: string | null) {
  const binding = commandToken ? workflowCommandCsrf.get(commandToken) : undefined;
  return binding?.csrf || await workflowCsrfToken();
}

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
  clearRuntimeAuthorization();
  applicationCsrfToken = '';
  workflowCommandCsrf.clear();
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
  clearRuntimeAuthorization();
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
  clearRuntimeAuthorization();
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

async function requestRuntimeAuthorization(
  generation: number,
  signal: AbortSignal,
): Promise<RuntimeAuthorization> {
  const mount = runtimeMount();
  const scope = runtimeAuthorizationScope();
  const assertCurrent = () => {
    if (signal.aborted) throw signal.reason;
    if (generation !== runtimeAuthorizationGeneration || runtimeAuthorizationScope() !== scope) {
      throw new Error('OPENXIANGDA_RUNTIME_AUTHORIZATION_SUPERSEDED');
    }
  };
  const assertObservedCurrent = () => {
    assertCurrent();
    if (runtimeAuthorizationLoad?.controller.signal !== signal || runtimeAuthorizationLoad.subscribers === 0) {
      throw new DOMException('读取已取消', 'AbortError');
    }
  };
  const read = async <T>(path: string) => recoverRuntimeAuthorizationRead<T>(async signal => {
    assertCurrent();
    const value = await request<T>(path, { signal });
    assertCurrent();
    return value;
  }, signal);
  if (mount) {
    const context = await read<RuntimeAuthorizationContext>(
      `${nativeBase()}/authz/current?environmentKey=${encodeURIComponent(
        mount.environmentKey,
      )}`,
    );
    assertObservedCurrent();
    return validateRuntimeAuthorization(context);
  }
  const current = await read<ConnectedCurrent>(
    `${applicationServiceBase()}/dev-sessions/current`,
  );
  assertObservedCurrent();
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

function runtimeAuthorizationScope() {
  const mount = runtimeMount();
  return JSON.stringify([applicationCode(), mount?.environmentKey || null, mount?.runtimeBase || null]);
}

export function isRuntimeAuthorizationIdentityRejection(error: unknown) {
  return error instanceof OpenXiangdaPlatformRequestError && [401, 403, 409].includes(error.status) ||
    error instanceof Error && /^OPENXIANGDA_RUNTIME_AUTHORIZATION_(?:INVALID|INACTIVE_INVALID|ACTIVE_INVALID|SUPERSEDED)$/.test(error.message);
}

function clearRuntimeEntryWait() {
  try {
    if (typeof window !== 'undefined') window.sessionStorage?.removeItem(`oxa-entry-wait:${window.location.pathname}`);
  } catch { /* Storage restrictions must not prevent a verified runtime from starting. */ }
}

function observeRuntimeAuthorization(owner: RuntimeAuthorizationLoad, signal?: AbortSignal) {
  owner.subscribers++;
  return new Promise<RuntimeAuthorization>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener('abort', abort);
      owner.subscribers--;
      return true;
    };
    const abort = () => {
      if (!finish()) return;
      const reason = signal?.reason || new DOMException('读取已取消', 'AbortError');
      if (!owner.settled && owner.subscribers === 0) {
        // StrictMode can resubscribe in this commit. A real departure still
        // retires the owner in the next microtask, without extending its budget.
        queueMicrotask(() => {
          if (owner.settled || owner.subscribers > 0) return;
          if (runtimeAuthorizationLoad === owner) {
            runtimeAuthorizationLoad = undefined;
            runtimeAuthorizationGeneration++;
          }
          owner.controller.abort(reason);
        });
      }
      reject(reason);
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    owner.promise.then(value => { if (finish()) resolve(value); }, reason => { if (finish()) reject(reason); });
  });
}

export async function loadRuntimeAuthorization(
  options: { refresh?: boolean; signal?: AbortSignal } = {},
): Promise<RuntimeAuthorization> {
  if (options.signal?.aborted) throw options.signal.reason || new DOMException('读取已取消', 'AbortError');
  const key = runtimeAuthorizationScope();
  if (runtimeAuthorizationKey && runtimeAuthorizationKey !== key) clearRuntimeAuthorization();
  let owner = runtimeAuthorizationLoad;
  if (!owner || (options.refresh && owner.settled)) {
    const generation = ++runtimeAuthorizationGeneration;
    owner = { controller: new AbortController(), key, subscribers: 0, settled: false,
      promise: undefined as unknown as Promise<RuntimeAuthorization> };
    runtimeAuthorizationLoad = owner;
    runtimeAuthorizationKey = key;
    const currentOwner = owner;
    currentOwner.promise = requestRuntimeAuthorization(generation, currentOwner.controller.signal).then(value => {
      currentOwner.settled = true;
      if (runtimeAuthorizationLoad === currentOwner && !currentOwner.controller.signal.aborted) clearRuntimeEntryWait();
      return value;
    }, error => {
      currentOwner.settled = true;
      if (runtimeAuthorizationLoad === currentOwner) {
        runtimeAuthorizationLoad = undefined;
        if (isRuntimeAuthorizationIdentityRejection(error)) {
          activeIdentity = undefined;
          workflowCommandCsrf.clear();
        }
      }
      throw error;
    });
  }
  return await observeRuntimeAuthorization(owner, options.signal);
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
  clearRuntimeAuthorization();
  applicationCsrfToken = '';
  workflowCommandCsrf.clear();
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

/** Uses the same authenticated transport and identity owner as ordinary Native data. */
export function createManagedConcurrencyClient(): ManagedConcurrencyClient {
  const identity = activeIdentity;
  if (!identity?.userId) throw new Error('OPENXIANGDA_CURRENT_USER_REQUIRED');
  const appCode = applicationCode(), environmentKey = currentEnvironmentKey();
  const scope = JSON.stringify([appCode, identity.environment.id, identity.userId]);
  const assertScope = () => {
    if (applicationCode() !== appCode || currentEnvironmentKey() !== environmentKey ||
        activeIdentity?.userId !== identity.userId || activeIdentity?.environment.id !== identity.environment.id ||
        activeIdentity?.identityScope !== identity.identityScope)
      throw new OpenXiangdaPlatformRequestError({ code: 'CONCURRENCY_IDENTITY_CHANGED', status: 401, message: '用户或应用环境已变化，请重新打开原操作' });
  };
  const frozenCall = async <T>(path: string, body: string, signal?: AbortSignal): Promise<T> => {
    assertScope();
    const value = await request<T>(`${nativeBase()}/concurrency/${path}`, {
      method: 'POST', body, signal,
    });
    assertScope(); return value;
  };
  const call = <T>(path: string, body: Record<string, unknown>, signal?: AbortSignal) =>
    frozenCall<T>(path, JSON.stringify({ ...body, environmentKey }), signal);
  const read = async <T>(path: string, body: Record<string, unknown>, signal?: AbortSignal, recovery?: ManagedReadRecoveryOptions) => {
    assertScope();
    const frozen = JSON.stringify({ ...body, environmentKey });
    const perspective = currentPerspectiveCode(), identityScope = activeIdentity?.identityScope;
    const assertReadScope = () => {
      assertScope();
      if (currentPerspectiveCode() !== perspective || activeIdentity?.identityScope !== identityScope)
        throw new OpenXiangdaPlatformRequestError({ code: 'CONCURRENCY_IDENTITY_CHANGED', status: 401, message: '读取身份或权限视角已变化，请重新打开页面' });
    };
    return recoverManagedRead<T>(async signal => {
      assertReadScope();
      const value = await frozenCall<T>(path, frozen, signal);
      assertReadScope();
      return value;
    }, signal, recovery);
  };
  return {
    scope,
    read: (code, input, signal, recovery) => read(`reads/${encodeURIComponent(code)}`, { input }, signal, recovery),
    enqueue: (command,input,requestKey,signal) => call(`commands/${encodeURIComponent(command)}/enqueue`,{input,requestKey},signal),
    mine: (command,input,signal,recovery) => read(`commands/${encodeURIComponent(command)}/mine`,input,signal,recovery),
    join: (command, input, requestKey, signal) => call(`commands/${encodeURIComponent(command)}/wait`, { input, requestKey }, signal),
    poll: (ticket, signal) => call('waiting/status', { ticket }, signal),
    leave: (ticket, signal) => call('waiting/leave', { ticket }, signal),
    accept: (permit, signal) => call('commands/accept', { permit }, signal),
    result: (input, signal, recovery) => read('commands/result', input, signal, recovery),
    cancel: (operationId, signal) => call('commands/cancel', { operationId }, signal),
    allocation: (allocationId, signal, recovery) => read('allocations/status', { allocationId }, signal, recovery),
  };
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
      // 匿名策略的上传字段以图片为主；非图片文件在预检内部自然跳过。
      return await uploadManagedWithPreflight({
        file,
        imageField: true,
        initiate: current =>
          request<DataFileUploadPlan>(`${base}/files/uploads/initiate`, {
            method: 'POST',
            body: JSON.stringify({
              policyCode: policy(),
              environmentKey: environmentKey(),
              fieldCode,
              fileName: current.name,
              fileSize: current.size,
              contentType: current.type || 'application/octet-stream',
            }),
          }),
        complete: fileId =>
          request<DataFileRef>(
            `${base}/files/${encodeURIComponent(fileId)}/complete`,
            {
              method: 'POST',
              body: JSON.stringify({
                policyCode: policy(),
                environmentKey: environmentKey(),
              }),
            },
          ),
      });
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
    action?: DataFieldSourceQuery['action'];
    task?: WorkflowTaskSourceBinding;
  },
) {
  if (options.task) {
    if (options.operation !== 'update' || options.launch || options.action)
      throw new Error('WORKFLOW_TASK_FIELD_SOURCE_CONTEXT_INVALID');
    const input: WorkflowTaskFieldSourceQuery = {
      schemaVersion: SCHEMA_VERSIONS.workflowTaskFieldSourceQuery,
      expectedRevision: options.task.expectedRevision,
      expectedTaskVersion: options.task.expectedTaskVersion,
      ...(options.task.subtable ? { subtable: options.task.subtable } : {}),
      ...(options.keyword.trim() ? { keyword: options.keyword.trim() } : {}),
      ...(options.cursor ? { cursor: options.cursor } : {}),
      ...(options.bindings ? { bindings: options.bindings } : {}),
    };
    return requestRead<DataFieldSourcePage>(
      `${workflowBase()}/tasks/${encodeURIComponent(options.task.taskId)}/fields/${encodeURIComponent(fieldCode)}/source/query`,
      { method: 'POST', body: JSON.stringify(input) });
  }
  const query: DataFieldSourceQuery = {
    schemaVersion: SCHEMA_VERSIONS.dataFieldSourceQuery,
    operation: options.operation,
    ...(options.launch ? { launch: options.launch } : {}),
    ...(options.action ? { action: options.action } : {}),
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

export async function queryFieldUserCandidates(
  resourceCode: string,
  fieldCode: string,
  input: DataFieldUserCandidateQuery,
): Promise<UserCandidatePage> {
  return requestRead<UserCandidatePage>(
    `${nativeBase()}/data-resources/${encodeURIComponent(resourceCode)}/fields/${encodeURIComponent(fieldCode)}/user-candidates/query`,
    { method: 'POST', body: JSON.stringify({ ...input, environmentKey: currentEnvironmentKey() }) },
  );
}

export async function queryWorkflowTaskUserCandidates(
  taskId: string,
  fieldCode: string,
  input: WorkflowTaskUserCandidateQuery,
): Promise<UserCandidatePage> {
  return requestRead<UserCandidatePage>(
    `${workflowBase()}/tasks/${encodeURIComponent(taskId)}/fields/${encodeURIComponent(fieldCode)}/user-candidates/query`,
    { method: 'POST', body: JSON.stringify(input) },
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

export async function loadNativeRecordPrint(code: string, recordId: string, options: { viewCode?: string } = {}): Promise<DataRecordPrint> {
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey(),
    ...(options.viewCode === undefined ? {} : { viewCode: options.viewCode }) });
  const snapshot = await requestRead<DataRecordPrint>(`${dataBase(code)}/records/${encodeURIComponent(recordId)}/print?${query}`);
  if (snapshot.schemaVersion !== 'openxiangda.data-record-print/v1' || snapshot.resourceCode !== code ||
      snapshot.recordId !== recordId || snapshot.viewCode !== options.viewCode ||
      !Array.isArray(snapshot.fields) || snapshot.fields.length < 1 || snapshot.fields.length > 100 ||
      new Set(snapshot.fields.map(field => field.code)).size !== snapshot.fields.length ||
      !snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data))
    throw new Error('OPENXIANGDA_NATIVE_RECORD_PRINT_RESPONSE_INVALID');
  return snapshot;
}

/** Comment reads retain current Perspective; writes/recovery use Native current-user authority. */
export async function loadNativeRecordComments(code: string, recordId: string, options: { limit?: number; cursor?: string } = {}): Promise<import('openxiangda-contracts/browser').DataRecordCommentPage> {
  const limit = options.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      (options.cursor !== undefined && (!/^[A-Za-z0-9_-]{1,256}$/.test(options.cursor))))
    throw new Error('OPENXIANGDA_NATIVE_RECORD_COMMENTS_PAGE_INVALID');
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey(), limit: String(limit),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }) });
  const page = await requestRead<import('openxiangda-contracts/browser').DataRecordCommentPage>(
    `${dataBase(code)}/records/${encodeURIComponent(recordId)}/comments?${query}`);
  if (page.schemaVersion !== 'openxiangda.data-record-comments/v1' || page.resourceCode !== code ||
      page.recordId !== recordId || page.limit !== limit || !Array.isArray(page.items) || page.items.length > limit ||
      !page.items.every(validRecordComment) || (page.nextCursor !== null &&
        (typeof page.nextCursor !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(page.nextCursor))))
    throw new Error('OPENXIANGDA_NATIVE_RECORD_COMMENTS_RESPONSE_INVALID');
  return page;
}

function validRecordComment(value: unknown): value is import('openxiangda-contracts/browser').DataRecordComment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const comment = value as import('openxiangda-contracts/browser').DataRecordComment;
  return typeof comment.id === 'string' && typeof comment.body === 'string' && comment.body.length <= 4000 &&
    typeof comment.authorUserId === 'string' && typeof comment.isOwn === 'boolean' &&
    typeof comment.createdAt === 'string' && Number.isFinite(Date.parse(comment.createdAt)) &&
    typeof comment.appVersionId === 'string' && Number.isSafeInteger(comment.environmentHeadRevision) && comment.environmentHeadRevision > 0;
}

function checkedRecordCommentReceipt(receipt: import('openxiangda-contracts/browser').DataRecordCommentReceipt, code: string, recordId: string, key: string) {
  if (receipt.schemaVersion !== 'openxiangda.data-record-comment-receipt/v1' || receipt.resourceCode !== code ||
      receipt.recordId !== recordId || receipt.idempotencyKey !== key || !validRecordComment(receipt.comment) ||
      receipt.comment.isOwn !== true || typeof receipt.replayed !== 'boolean')
    throw new Error('OPENXIANGDA_NATIVE_RECORD_COMMENTS_RESPONSE_INVALID');
  return receipt;
}

/** Fix the mutation before sending; never generate a replacement key for an unknown result. */
export async function createNativeRecordComment(code: string, recordId: string, input: import('openxiangda-contracts/browser').DataRecordCommentMutation) {
  const receipt = await request<import('openxiangda-contracts/browser').DataRecordCommentReceipt>(
    `${dataBase(code)}/records/${encodeURIComponent(recordId)}/comments`,
    { method: 'POST', body: JSON.stringify({ ...input, environmentKey: currentEnvironmentKey() }) });
  return checkedRecordCommentReceipt(receipt, code, recordId, input.idempotencyKey);
}

/** Author-only original-key recovery is re-authorized, even after a new application Head. */
export async function loadNativeRecordCommentReceipt(code: string, recordId: string, idempotencyKey: string) {
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey(), idempotencyKey });
  const receipt = await requestRead<import('openxiangda-contracts/browser').DataRecordCommentReceipt>(
    `${dataBase(code)}/records/${encodeURIComponent(recordId)}/comments/receipt?${query}`);
  return checkedRecordCommentReceipt(receipt, code, recordId, idempotencyKey);
}

function checkedRecordDeletionPreview(value: import('openxiangda-contracts/browser').DataRecordDeletionPreview, code: string, recordId: string) {
  const count = (n: number, min = 0, max = 100) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (value.schemaVersion !== 'openxiangda.data-record-deletion-preview/v1' || value.resourceCode !== code || value.recordId !== recordId ||
    typeof value.resourceName !== 'string' || typeof value.appVersionId !== 'string' || !count(value.environmentHeadRevision, 1, Number.MAX_SAFE_INTEGER) ||
    !count(value.recordRevision, 1, Number.MAX_SAFE_INTEGER) || !count(value.affectedRecords, 1) || !count(value.workflowCount) ||
    !count(value.pendingLaunchCount) || !count(value.cancelledTaskCount, 0, Number.MAX_SAFE_INTEGER) || typeof value.canCommit !== 'boolean' ||
    (value.canCommit ? value.workflowCount > 1 || value.pendingLaunchCount !== 0 || value.blocker !== undefined ||
      !['native-transaction', 'workflow-command'].includes(value.receiptOwner || '') ||
      (value.receiptOwner === 'workflow-command') !== (value.workflowCount === 1) ||
      typeof value.previewToken !== 'string' || !/^[A-Za-z0-9_-]{100,16384}$/.test(value.previewToken) ||
      typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))
      : !['pending_launch', 'multiple_workflows', 'owned_workflow'].includes(value.blocker || '') || value.previewToken !== undefined || value.receiptOwner !== undefined))
    throw new Error('OPENXIANGDA_NATIVE_RECORD_DELETION_RESPONSE_INVALID');
  return value;
}

function checkedRecordDeletionReceipt(value: import('openxiangda-contracts/browser').DataRecordDeletionReceipt, code: string, recordId: string, key: string) {
  if (value.schemaVersion !== 'openxiangda.data-record-deletion-receipt/v1' || value.resourceCode !== code || value.recordId !== recordId ||
    value.idempotencyKey !== key || !['native-transaction', 'workflow-command'].includes(value.receiptOwner) ||
    typeof value.receiptId !== 'string' || !value.receiptId || value.receiptId.length > 255 ||
    typeof value.deleted !== 'boolean' || typeof value.replayed !== 'boolean' ||
    (!value.deleted && (typeof value.errorCode !== 'string' || !value.errorCode)))
    throw new Error('OPENXIANGDA_NATIVE_RECORD_DELETION_RESPONSE_INVALID');
  return value;
}

/** Maintenance uses the current user role union, independent of read Perspective. */
export async function previewNativeRecordDeletion(code: string, recordId: string) {
  const csrf = await workflowCsrfToken();
  const result = await request<import('openxiangda-contracts/browser').DataRecordDeletionPreview>(`${dataBase(code)}/records/${encodeURIComponent(recordId)}/deletion/preview`,
    { method: 'POST', headers: { 'x-openxiangda-csrf-token': csrf }, body: JSON.stringify({ environmentKey: currentEnvironmentKey() }) });
  const preview = checkedRecordDeletionPreview(result, code, recordId);
  if (preview.canCommit) bindWorkflowCommandCsrf(preview.previewToken, preview.expiresAt, csrf, true);
  return preview;
}

export async function deleteNativeRecordWithPreview(code: string, recordId: string, input: import('openxiangda-contracts/browser').DataRecordDeletionMutation) {
  const result = await request<import('openxiangda-contracts/browser').DataRecordDeletionReceipt>(`${dataBase(code)}/records/${encodeURIComponent(recordId)}/deletion/execute`,
    { method: 'POST', headers: { 'x-openxiangda-csrf-token': await commandBoundCsrf(input.previewToken) }, body: JSON.stringify({ ...input, environmentKey: currentEnvironmentKey() }) });
  return checkedRecordDeletionReceipt(result, code, recordId, input.idempotencyKey);
}

/** Read the original owner receipt; never replace the pending request with a new key. */
export async function recoverNativeRecordDeletion(code: string, recordId: string, input: import('openxiangda-contracts/browser').DataRecordDeletionMutation) {
  const result = await request<import('openxiangda-contracts/browser').DataRecordDeletionReceipt>(`${dataBase(code)}/records/${encodeURIComponent(recordId)}/deletion/receipt`,
    { method: 'POST', headers: { 'x-openxiangda-csrf-token': await commandBoundCsrf(input.previewToken) }, body: JSON.stringify({ ...input, environmentKey: currentEnvironmentKey() }) });
  return checkedRecordDeletionReceipt(result, code, recordId, input.idempotencyKey);
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
    previewDeletion: (recordId: string) => previewNativeRecordDeletion(code, recordId),
    deleteWithPreview: (recordId: string, input: import('openxiangda-contracts/browser').DataRecordDeletionMutation) => deleteNativeRecordWithPreview(code, recordId, input),
    deletionReceipt: (recordId: string, input: import('openxiangda-contracts/browser').DataRecordDeletionMutation) => recoverNativeRecordDeletion(code, recordId, input),
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
      return await uploadManagedWithPreflight({
        file,
        imageField: surface.fields[fieldCode]?.type === 'image',
        initiate: current =>
          request<DataFileUploadPlan>(`${base}/files/uploads/initiate`, {
            method: 'POST',
            body: JSON.stringify({
              environmentKey: currentEnvironmentKey(),
              fieldCode,
              fileName: current.name,
              fileSize: current.size,
              contentType: current.type || 'application/octet-stream',
              ...(recordId ? { recordId } : {}),
            }),
          }),
        complete: fileId =>
          request<DataFileRef>(
            `${base}/files/${encodeURIComponent(fileId)}/complete`,
            {
              method: 'POST',
              body: JSON.stringify({
                environmentKey: currentEnvironmentKey(),
              }),
            },
          ),
      });
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

/**
 * Loads one bounded relationship projection after the platform proves normal
 * read access to the parent record. Callers never provide child resource
 * fields, filters, sorting, or limits; those stay frozen in the AppVersion.
 */
export async function loadSubjectReadSurface<
  TSubject extends Record<string, unknown> = Record<string, unknown>,
>(
  subjectResourceCode: string,
  surfaceCode: string,
  subjectId: string,
  options: { signal?: AbortSignal } = {},
): Promise<SubjectReadSurfaceResultV2<TSubject>> {
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey() });
  return await requestRead<SubjectReadSurfaceResultV2<TSubject>>(
    `${nativeBase()}/subjects/${encodeURIComponent(
      subjectResourceCode,
    )}/${encodeURIComponent(subjectId)}/surfaces/${encodeURIComponent(
      surfaceCode,
    )}?${query.toString()}`,
    { signal: options.signal },
  );
}

/** Lists only active-version operations exposed to the current role union. */
export async function loadApplicationOperationSurfaces(
  options: { signal?: AbortSignal } = {},
): Promise<ApplicationOperationSurfaceCatalogV2> {
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey() });
  return await requestRead<ApplicationOperationSurfaceCatalogV2>(
    `${nativeBase()}/operation-surfaces?${query.toString()}`,
    { signal: options.signal },
  );
}

/**
 * Executes the exact immutable operation surface returned by the catalog.
 * The caller never supplies a runtime path, capability, or subject resource.
 */
export async function executeApplicationOperation<
  TResult extends Record<string, unknown> = Record<string, unknown>,
>(
  operationSurface: ApplicationOperationSurfaceV2,
  input: Record<string, unknown>,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ApplicationOperationReceiptV2<TResult>> {
  return executeApplicationOperationWithCsrf(operationSurface, input, options, workflowCsrfToken);
}

async function executeApplicationOperationWithCsrf<TResult extends Record<string, unknown>>(
  operationSurface: ApplicationOperationSurfaceV2, input: Record<string, unknown>,
  options: { idempotencyKey?: string; signal?: AbortSignal }, csrf: () => Promise<string>,
): Promise<ApplicationOperationReceiptV2<TResult>> {
  if (
    !operationSurface?.code ||
    !operationSurface.appVersionId ||
    operationSurface.fileIntent ||
    !Number.isSafeInteger(operationSurface.environmentHeadRevision) ||
    operationSurface.environmentHeadRevision < 1
  ) {
    throw new Error('OPENXIANGDA_APPLICATION_OPERATION_SURFACE_INVALID');
  }
  const idempotencyKey = String(options.idempotencyKey || '').trim();
  if (
    operationSurface.idempotency === 'required' &&
    (!idempotencyKey || idempotencyKey.length > 128)
  ) {
    throw new Error('OPENXIANGDA_APPLICATION_OPERATION_IDEMPOTENCY_REQUIRED');
  }
  const csrfToken = await csrf();
  return await request<ApplicationOperationReceiptV2<TResult>>(
    `${nativeBase()}/operation-surfaces/${encodeURIComponent(
      operationSurface.code,
    )}/execute`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': csrfToken },
      signal: options.signal,
      body: JSON.stringify({
        environmentKey: currentEnvironmentKey(),
        expectedAppVersionId: operationSurface.appVersionId,
        expectedEnvironmentHeadRevision:
          operationSurface.environmentHeadRevision,
        input,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }),
    },
  );
}

/** Issues a short-lived, current-user-bound intent for one declared external file. */
export async function issueApplicationFileIntent(
  operationSurface: ApplicationOperationSurfaceV2,
  input: Record<string, unknown>,
  purpose: 'preview' | 'download',
  options: { signal?: AbortSignal } = {},
): Promise<ApplicationFileIntentV2> {
  if (
    !operationSurface?.code ||
    !operationSurface.appVersionId ||
    !operationSurface.fileIntent ||
    !operationSurface.fileIntent.purposes.includes(purpose) ||
    !Number.isSafeInteger(operationSurface.environmentHeadRevision) ||
    operationSurface.environmentHeadRevision < 1
  ) {
    throw new Error('OPENXIANGDA_APPLICATION_FILE_INTENT_SURFACE_INVALID');
  }
  const csrfToken = await workflowCsrfToken();
  return await request<ApplicationFileIntentV2>(
    `${nativeBase()}/operation-surfaces/${encodeURIComponent(
      operationSurface.code,
    )}/file-intents`,
    {
      method: 'POST',
      headers: { 'x-openxiangda-csrf-token': csrfToken },
      signal: options.signal,
      body: JSON.stringify({
        environmentKey: currentEnvironmentKey(),
        expectedAppVersionId: operationSurface.appVersionId,
        expectedEnvironmentHeadRevision:
          operationSurface.environmentHeadRevision,
        purpose,
        input,
      }),
    },
  );
}

/** Returns the same-origin content URL from a platform-issued opaque intent. */
export function applicationFileIntentUrl(intent: ApplicationFileIntentV2) {
  const contentUrl = String(intent?.contentUrl || '').trim();
  const expectedPrefix = `${nativeBase()}/operation-surfaces/${encodeURIComponent(
    String(intent?.operationCode || ''),
  )}/file-intents/`;
  let valid =
    intent?.schemaVersion === 'openxiangda.application-file-intent/v2' &&
    ['preview', 'download'].includes(String(intent?.purpose || '')) &&
    contentUrl.startsWith(expectedPrefix) &&
    !contentUrl.startsWith('//') &&
    !contentUrl.includes('\\') &&
    !Array.from(contentUrl).some(character => {
      const codePoint = character.codePointAt(0) || 0;
      return codePoint <= 31 || codePoint === 127;
    });
  try {
    const parsed = new URL(contentUrl, 'https://openxiangda.invalid');
    const suffix = parsed.pathname.slice(expectedPrefix.length);
    valid &&=
      parsed.origin === 'https://openxiangda.invalid' &&
      parsed.pathname.startsWith(expectedPrefix) &&
      /^fi2\.[A-Za-z0-9_-]+\/content$/.test(suffix) &&
      parsed.searchParams.size === 1 &&
      parsed.searchParams.get('purpose') === intent.purpose &&
      !parsed.hash;
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new Error('OPENXIANGDA_APPLICATION_FILE_INTENT_INVALID');
  }
  return contentUrl;
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

export async function listRoleManagementScopeValues(dimensionCode: string, input: { keyword?: string; limit?: number; offset?: number } = {}) {
  return request<import('openxiangda-contracts/browser').NativeRoleManagementScopeValuePage>(`${roleManagementBase()}/scope-values?${roleManagementQuery({ ...input, dimensionCode })}`);
}

export async function listRoleMemberships(
  input: {
    status?: 'active' | 'revoked' | 'expired';
    userId?: string;
    roleCode?: string;
    keyword?: string;
    dimensionCode?: string;
    scopeValue?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return await request<NativeRoleMembershipPage>(
    `${roleManagementBase()}/memberships?${roleManagementQuery(input)}`,
  );
}

/** Each item is independent; retain its operationId when recovering an unknown result. */
export async function previewRoleMembershipBatch(input: Pick<NativeRoleMembershipBatchInput, 'items'>) {
  return request<NativeRoleMembershipBatchResult>(`${roleManagementBase()}/memberships/batch/preview`, {
    method: 'POST', body: JSON.stringify({ ...input,
      schemaVersion: 'openxiangda.native-role-membership-batch-request/v2', environmentKey: currentEnvironmentKey() }),
  });
}

export async function executeRoleMembershipBatch(input: Pick<NativeRoleMembershipBatchInput, 'items'>) {
  return request<NativeRoleMembershipBatchResult>(`${roleManagementBase()}/memberships/batch/execute`, {
    method: 'POST', body: JSON.stringify({ ...input,
      schemaVersion: 'openxiangda.native-role-membership-batch-request/v2', environmentKey: currentEnvironmentKey() }),
  });
}

/** Potential versioned nodes, authorized by the existing workflow management reader. */
export async function loadWorkflowRoleReferences(roleCode: string, input: { keyword?: string; limit?: number; offset?: number } = {}) {
  const query = roleManagementQuery({ ...input, roleCode });
  return request<import('openxiangda-contracts/browser').WorkflowRoleReferencePage>(`${applicationServiceBase()}/workflow/management/role-references?${query}`);
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

/** Platforms without the maxPixels contract still enforce this floor. */
const FALLBACK_MAX_IMAGE_PIXELS = 40_000_000;

async function decodeImageSize(file: File) {
  if (!/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

async function downscaleImageFile(file: File, maxPixels: number) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.sqrt(
      (maxPixels * 0.95) / (bitmap.width * bitmap.height),
    );
    const width = Math.max(1, Math.floor(bitmap.width * scale));
    const height = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (!blob) throw new Error('OPENXIANGDA_IMAGE_DOWNSCALE_FAILED');
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

/**
 * Shared managed-upload flow with image preflight: the first plan publishes
 * maxPixels; an oversized image is downscaled locally and re-initiated so the
 * completed object matches its declared plan exactly.
 */
async function uploadManagedWithPreflight(input: {
  file: File;
  imageField: boolean;
  initiate: (file: File) => Promise<DataFileUploadPlan>;
  complete: (fileId: string) => Promise<DataFileRef>;
}): Promise<DataFileRef> {
  let file = input.file;
  let plan = await input.initiate(file);
  if (input.imageField && file.type.startsWith('image/')) {
    const maxPixels = plan.maxPixels ?? FALLBACK_MAX_IMAGE_PIXELS;
    const size = await decodeImageSize(file);
    if (size && size.width * size.height > maxPixels) {
      file = await downscaleImageFile(file, maxPixels);
      plan = await input.initiate(file);
    }
  }
  const uploaded = await fetch(plan.uploadUrl, {
    method: plan.uploadMethod,
    headers: plan.headers,
    body: file,
  });
  if (!uploaded.ok) {
    throw new Error(`FILE_UPLOAD_FAILED: HTTP_${uploaded.status}`);
  }
  return await input.complete(plan.file.id);
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

export type WorkflowFileBinding = ({ instanceId: string; taskId?: never } | { taskId: string; instanceId?: never }) & {
  resourceCode: string;
  recordId: string;
  fieldCode: string;
};

function workflowFileBase(binding: WorkflowFileBinding, fileId: string) {
  if (binding.taskId) return `${workflowBase()}/tasks/${encodeURIComponent(binding.taskId)}/form-files/${encodeURIComponent(fileId)}?fieldCode=${encodeURIComponent(binding.fieldCode)}`;
  const query = new URLSearchParams({
    resourceCode: binding.resourceCode,
    recordId: binding.recordId,
    fieldCode: binding.fieldCode,
  });
  return `${workflowBase()}/instances/${encodeURIComponent(
    binding.instanceId!,
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
  const csrfToken = await workflowCsrfToken();
  return await request<DataFilePreview>(`${path}/preview?${query}`, { headers: { 'x-openxiangda-csrf-token': csrfToken } });
}

export async function fetchWorkflowDataFileBlob(
  binding: WorkflowFileBinding,
  fileId: string,
  variant?: 'thumbnail',
) {
  const csrfToken = await workflowCsrfToken();
  const response = await fetch(
    workflowDataFileContentUrl(binding, fileId, 'inline', variant),
    {
      credentials: 'include',
      headers: new Headers({ accept: 'application/octet-stream,*/*', 'x-openxiangda-csrf-token': csrfToken }),
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

function delegationManagementQuery(input: object = {}) {
  if ('environmentKey' in input && input.environmentKey !== currentEnvironmentKey()) throw new Error('WORKFLOW_DELEGATION_ENVIRONMENT_MISMATCH');
  const params = new URLSearchParams({ environmentKey: currentEnvironmentKey() });
  for (const [key,value] of Object.entries(input)) if (value !== undefined && value !== '') params.set(key,String(value));
  return params;
}
export async function loadWorkflowDelegationCatalog() {
  return requestRead<WorkflowDelegationCatalog>(`${workflowBase()}/delegation-management/catalog?${delegationManagementQuery()}`);
}
export async function listWorkflowDelegations(input: WorkflowDelegationListQuery = {}) {
  return requestRead<WorkflowDelegationPage>(`${workflowBase()}/delegation-management?${delegationManagementQuery(input)}`);
}
export async function loadWorkflowDelegation(id: string) {
  return requestRead<WorkflowDelegationAdministration>(`${workflowBase()}/delegation-management/${encodeURIComponent(id)}?${delegationManagementQuery()}`);
}
export async function listWorkflowDelegationCandidates(input: WorkflowDelegationCandidateQuery) {
  return requestRead<WorkflowDelegationCandidatePage>(`${workflowBase()}/delegation-management/candidates?${delegationManagementQuery(input)}`);
}
export async function loadWorkflowDelegationMutationReceipt(operationId: string) {
  return requestRead<WorkflowDelegationMutationReceipt>(`${workflowBase()}/delegation-management/receipts/${encodeURIComponent(operationId)}?${delegationManagementQuery()}`);
}
async function delegationManagementMutation<T>(input: WorkflowDelegationMutationRequest, mode: 'preview' | 'execute'): Promise<T> {
  if (input.environmentKey !== currentEnvironmentKey()) throw new Error('WORKFLOW_DELEGATION_ENVIRONMENT_MISMATCH');
  const csrfToken = await workflowCsrfToken();
  return request<T>(`${workflowBase()}/delegation-management/${mode}`,{method:'POST',headers:{'x-openxiangda-csrf-token':csrfToken},body:JSON.stringify(input)});
}
export async function previewWorkflowDelegationMutation(input: WorkflowDelegationMutationRequest) {
  return delegationManagementMutation<WorkflowDelegationMutationPreview>(input,'preview');
}
export async function executeWorkflowDelegationMutation(input: WorkflowDelegationMutationRequest) {
  return delegationManagementMutation<WorkflowDelegationMutationReceipt>(input,'execute');
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
  const command = await request<unknown>(
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
  return parseBusinessProcessCommitResult(command, { appCode: applicationCode(), environmentKey: currentEnvironmentKey() as 'preproduction' | 'production',
    operationCode: input.processOperationCode, workflowCode: input.workflowCode, idempotencyKey: input.idempotencyKey });
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

/** Read-only lookup: not_observed is never permission to repeat the write with a new key. */
export async function resolveBusinessProcessOriginal(
  input: Omit<BusinessProcessResolutionQuery, 'environmentKey'>,
  signal?: AbortSignal,
): Promise<BusinessProcessResolution> {
  const query = { ...input, environmentKey: currentEnvironmentKey() as 'preproduction' | 'production' };
  const result = await request<unknown>(`${businessProcessBase()}/commands/resolve`, {
    method: 'POST', body: JSON.stringify(query), signal,
  });
  return parseBusinessProcessResolution(result, { ...query, appCode: applicationCode() });
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
  keyword?: string;
  instanceStatus?: 'running' | 'approved' | 'rejected' | 'withdrawn' | 'terminated';
}) {
  const query = new URLSearchParams({
    environmentKey: currentEnvironmentKey(),
    ...(input.view ? { view: input.view } : { status: input.status || 'pending' }),
    ...(input.keyword?.trim() ? { keyword: input.keyword.trim() } : {}),
    ...(input.instanceStatus ? { instanceStatus: input.instanceStatus } : {}),
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
  return bindWorkflowCsrf(normalizeWorkflowSurface(surface), csrfToken);
}

/** Private values remain scoped to the current user and fixed actionable task. */
export async function loadWorkflowTaskDrafts(taskId: string): Promise<import('openxiangda-contracts/browser').WorkflowTaskDraftList> {
  return requestRead(`${workflowBase()}/tasks/${encodeURIComponent(taskId)}/form-drafts`);
}

export async function saveWorkflowTaskDraft(taskId: string, input: import('openxiangda-contracts/browser').WorkflowTaskDraftSave): Promise<import('openxiangda-contracts/browser').WorkflowTaskDraft> {
  return request(`${workflowBase()}/tasks/${encodeURIComponent(taskId)}/form-drafts`, {
    method: 'POST', headers: { 'x-openxiangda-csrf-token': await workflowCsrfToken() }, body: JSON.stringify(input),
  });
}

export async function removeWorkflowTaskDraft(taskId: string, input: import('openxiangda-contracts/browser').WorkflowTaskDraftReference): Promise<{ deleted: true }> {
  return request(`${workflowBase()}/tasks/${encodeURIComponent(taskId)}/form-drafts/delete`, {
    method: 'POST', headers: { 'x-openxiangda-csrf-token': await workflowCsrfToken() }, body: JSON.stringify(input),
  });
}

/** Fix the upload ID before this call. Retrying uses the same intent and task. */
export async function initiateWorkflowTaskFileUpload(taskId: string, input: import('openxiangda-contracts/browser').WorkflowTaskFileUpload): Promise<import('openxiangda-contracts/browser').WorkflowTaskFileUploadPlan> {
  return request(`${workflowBase()}/tasks/${encodeURIComponent(taskId)}/form-files`, {
    method: 'POST', headers: { 'x-openxiangda-csrf-token': await workflowCsrfToken() }, body: JSON.stringify(input),
  });
}

export async function loadWorkflowTaskFileUploadPlan(taskId: string, fileId: string): Promise<import('openxiangda-contracts/browser').WorkflowTaskFileUploadPlan> {
  return requestRead(`${workflowBase()}/tasks/${encodeURIComponent(taskId)}/form-files/${encodeURIComponent(fileId)}`);
}

export async function completeWorkflowTaskFileUpload(taskId: string, fileId: string): Promise<DataFileRef> {
  return request(`${workflowBase()}/tasks/${encodeURIComponent(taskId)}/form-files/${encodeURIComponent(fileId)}/complete`, {
    method: 'POST', headers: { 'x-openxiangda-csrf-token': await workflowCsrfToken() }, body: '{}',
  });
}

export async function loadWorkflowInstanceSurface(instanceId: string) {
  const csrfToken = await workflowCsrfToken();
  const surface = await requestRead<WorkflowSurface>(
    `${workflowBase()}/instances/${encodeURIComponent(instanceId)}/surface`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return bindWorkflowCsrf(normalizeWorkflowSurface(surface), csrfToken);
}

/** Current record read/RLS plus explicit history policy, without handling authority. */
export async function loadWorkflowRecordHistory(
  resourceCode: string,
  recordId: string,
  options: { instanceId?: string; limit?: number; offset?: number } = {},
) {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 500)
    throw new Error('WORKFLOW_V2_RECORD_HISTORY_PAGE_INVALID');
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey(), limit: String(limit), offset: String(offset) });
  if (options.instanceId) query.set('instanceId', options.instanceId);
  return await requestRead<import('openxiangda-contracts/browser').WorkflowRecordHistory>(
    `${workflowBase()}/records/${encodeURIComponent(resourceCode)}/${encodeURIComponent(recordId)}/history?${query}`,
  );
}

export async function loadWorkflowTimeline(instanceId: string) {
  return await requestRead<WorkflowTimeline>(
    `${workflowBase()}/instances/${encodeURIComponent(instanceId)}/timeline`,
  );
}

/** Requires the same workflow management authority as the platform console. */
export async function loadWorkflowDefinitionGraph(workflowCode: string, version: number) {
  const result = await requestRead<import('openxiangda-contracts/browser').WorkflowGraphReadResult>(
    `${workflowBase()}/management/definitions/${encodeURIComponent(workflowCode)}/versions/${version}`,
  );
  if (!result.graph || result.graph.definitionDigest !== result.definitionDigest) throw new Error('WORKFLOW_V2_GRAPH_DIGEST_MISMATCH');
  return result;
}

export async function loadWorkflowInstanceGraph(instanceId: string) {
  const result = await requestRead<import('openxiangda-contracts/browser').WorkflowInstanceGraphReadResult>(
    `${workflowBase()}/management/instances/${encodeURIComponent(instanceId)}/graph`,
  );
  if (!result.graph || result.graph.definitionDigest !== result.definitionDigest) throw new Error('WORKFLOW_V2_GRAPH_DIGEST_MISMATCH');
  return result;
}

export async function loadApplicationAdministrationContext() {
  return requestRead<import('openxiangda-contracts/browser').ApplicationAdministrationContext>(
    `${applicationServiceBase()}/admin/context?${new URLSearchParams({ environmentKey: currentEnvironmentKey() })}`,
  );
}

/** Same administrator authority as the console; does not grant ordinary users repair access. */
export async function loadWorkflowBusinessStepRecovery(instanceId: string) {
  return requestRead<import('openxiangda-contracts/browser').WorkflowBusinessStepRecoveryOptions>(
    `${applicationServiceBase()}/admin/workflow-instances/${encodeURIComponent(instanceId)}/options?${new URLSearchParams({ environmentKey: currentEnvironmentKey() })}`,
  );
}

export async function previewWorkflowBusinessStepRecovery(instanceId: string) {
  const csrf = await workflowCsrfToken();
  const preview = await request<import('openxiangda-contracts/browser').WorkflowBusinessStepRecoveryPreview>(
    `${applicationServiceBase()}/admin/workflow-instances/${encodeURIComponent(instanceId)}/preview`, {
      method: 'POST', headers: { 'x-openxiangda-csrf-token': csrf },
      body: JSON.stringify({ environmentKey: currentEnvironmentKey(), action: 'admin_retry_step' }),
    },
  );
  bindWorkflowCommandCsrf(preview.commandToken, preview.expiresAt, csrf);
  return preview;
}

/** Keep this exact token/input/key until the outcome is known. Never executes the external handler. */
export async function executeWorkflowBusinessStepRecovery(instanceId: string, input: { commandToken: string; idempotencyKey: string; input: { reason: string } }) {
  return request<WorkflowCommandResult>(`${applicationServiceBase()}/admin/workflow-instances/${encodeURIComponent(instanceId)}/commands/admin_retry_step`, {
    method: 'POST', headers: { 'x-openxiangda-csrf-token': await commandBoundCsrf(input.commandToken) }, body: JSON.stringify(input),
  });
}

export async function loadWorkflowNodeConfigurations(workflowCode: string) {
  return requestRead<import('openxiangda-contracts/browser').WorkflowNodeConfigurations>(
    `${applicationServiceBase()}/admin/workflows/${encodeURIComponent(workflowCode)}/node-configurations?${new URLSearchParams({ environmentKey: currentEnvironmentKey() })}`,
  );
}

/** Retain the same operationId and exact input while the write result is unknown. */
export async function saveWorkflowNodeConfiguration(workflowCode: string, nodeId: string, input: import('openxiangda-contracts/browser').WorkflowNodeConfigurationMutation) {
  return request<import('openxiangda-contracts/browser').WorkflowNodeConfigurationReceipt>(
    `${applicationServiceBase()}/admin/workflows/${encodeURIComponent(workflowCode)}/node-configurations/${encodeURIComponent(nodeId)}`,
    { method: 'POST', body: JSON.stringify({ ...input, environmentKey: currentEnvironmentKey() }) },
  );
}

export async function loadWorkflowAssignmentRoutingCatalog(input: { keyword?: string; limit?: number; offset?: number } = {}) {
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey(), keyword: input.keyword || '', limit: String(input.limit ?? 20), offset: String(input.offset ?? 0) });
  return request<import('openxiangda-contracts/browser').WorkflowAssignmentRoutingCatalog>(`${applicationServiceBase()}/admin/workflow-assignment-routing?${query}`);
}

export async function loadWorkflowAssignmentRoutingConfiguration(policyCode: string) {
  return request<import('openxiangda-contracts/browser').WorkflowAssignmentRoutingConfiguration>(`${applicationServiceBase()}/admin/workflow-assignment-routing/${encodeURIComponent(policyCode)}?environmentKey=${encodeURIComponent(currentEnvironmentKey())}`);
}

export async function loadWorkflowAssignmentRoutingHistory(policyCode: string, input: { limit?: number; offset?: number } = {}) {
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey(), limit: String(input.limit ?? 20), offset: String(input.offset ?? 0) });
  return request<import('openxiangda-contracts/browser').WorkflowAssignmentRoutingHistory>(`${applicationServiceBase()}/admin/workflow-assignment-routing/${encodeURIComponent(policyCode)}/history?${query}`);
}

/** Keep the exact mutation and operationId to recover an unknown write result. */
export async function saveWorkflowAssignmentRoutingConfiguration(policyCode: string, input: import('openxiangda-contracts/browser').WorkflowAssignmentRoutingMutation) {
  return request<import('openxiangda-contracts/browser').WorkflowAssignmentRoutingReceipt>(`${applicationServiceBase()}/admin/workflow-assignment-routing/${encodeURIComponent(policyCode)}`, {
    method: 'POST', body: JSON.stringify({ ...input, environmentKey: currentEnvironmentKey() }),
  });
}

function normalizeWorkflowDetailSurface(
  detail: WorkflowDetailSurfaceV2,
  csrfToken: string,
): WorkflowDetailSurfaceV2 {
  return {
    ...detail,
    surface: bindWorkflowCsrf(normalizeWorkflowSurface(detail.surface), csrfToken),
  };
}

export async function loadWorkflowTaskDetail(taskId: string) {
  const csrfToken = await workflowCsrfToken();
  const detail = await requestRead<WorkflowDetailSurfaceV2>(
    `${workflowBase()}/tasks/${encodeURIComponent(taskId)}/detail`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowDetailSurface(detail, csrfToken);
}

export async function loadWorkflowInstanceDetail(instanceId: string) {
  const csrfToken = await workflowCsrfToken();
  const detail = await requestRead<WorkflowDetailSurfaceV2>(
    `${workflowBase()}/instances/${encodeURIComponent(instanceId)}/detail`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowDetailSurface(detail, csrfToken);
}

export async function loadWorkflowRecordDetail(resourceCode: string, recordId: string) {
  const csrfToken = await workflowCsrfToken();
  const query = new URLSearchParams({ environmentKey: currentEnvironmentKey() });
  const detail = await requestRead<WorkflowDetailSurfaceV2>(
    `${workflowBase()}/records/${encodeURIComponent(resourceCode)}/${encodeURIComponent(recordId)}/detail?${query}`,
    { headers: { 'x-openxiangda-csrf-token': csrfToken } },
  );
  return normalizeWorkflowDetailSurface(detail, csrfToken);
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
  const csrfToken = await commandBoundCsrf(input.commandToken);
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
  const csrfToken = await commandBoundCsrf(input.commandToken);
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

/** A read does not consume a token or imply that an unobserved command failed. */
export async function loadWorkflowTaskCommandReceipt(taskId: string, idempotencyKey: string, tokenDigest?: string) {
  return await request<import('openxiangda-contracts/browser').WorkflowTaskCommandReceipt>(
    `${workflowBase()}/tasks/${encodeURIComponent(taskId)}/commands/original?idempotencyKey=${encodeURIComponent(idempotencyKey)}${tokenDigest ? `&tokenDigest=${encodeURIComponent(tokenDigest)}` : ''}`,
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
  const idempotencyKey = options.idempotencyKey || randomWorkflowIdempotencyKey(operation.key);
  if (operation.execute.operationCode) {
    const catalog = await loadApplicationOperationSurfaces();
    const action = catalog.operations.find(item => item.code === operation.execute.operationCode);
    if (!action) throw new Error('OPENXIANGDA_WORKFLOW_BUSINESS_OPERATION_UNAVAILABLE');
    const instance = surface.instance as Record<string, unknown>;
    const dataRef = instance.dataRef as { resourceCode?: string; id?: string } | undefined;
    const resourceCode = surface.navigationTarget?.resourceCode || dataRef?.resourceCode;
    const recordId = surface.navigationTarget?.recordId || dataRef?.id;
    const detail = surface.presentation.businessDetail;
    const expectedRevision = surface.taskForm?.expectedRevision || detail?.sourceRevision;
    if (!recordId || !resourceCode || resourceCode !== action.subject.resourceCode ||
        !Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1 ||
        !['approve', 'reject', 'withdraw', 'resubmit'].includes(operation.key)) throw new Error('OPENXIANGDA_WORKFLOW_BUSINESS_SUBJECT_UNAVAILABLE');
    const target = operation.key === 'withdraw'
      ? { kind: 'instance', id: String(instance.id), command: 'withdraw' }
      : { kind: 'task', id: String(surface.task?.id || ''), command: operation.key };
    if (!target.id || target.id === 'undefined') throw new Error('OPENXIANGDA_WORKFLOW_BUSINESS_TARGET_UNAVAILABLE');
    const receipt = await executeApplicationOperationWithCsrf<WorkflowCommandResult>(action, {
      workflowCode: instance.workflowCode, target, recordId, expectedRevision,
      commandToken: surface.commandToken, idempotencyKey, input,
    }, { idempotencyKey }, () => commandBoundCsrf(surface.commandToken));
    return receipt.result;
  }
  const csrfToken = await commandBoundCsrf(surface.commandToken);
  const href = operation.execute.href.startsWith('/service/')
    ? operation.execute.href
    : `/service${operation.execute.href}`;
  return await request<WorkflowCommandResult>(href, {
    method: operation.execute.method,
    headers: { 'x-openxiangda-csrf-token': csrfToken },
    body: JSON.stringify({
      commandToken: surface.commandToken,
      idempotencyKey,
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

export interface ResourceFormDraftWorkflowScope {
  workflowCode: string;
  operationCode: string;
}

export interface ResourceFormDraft {
  workflowCode?: string;
  operationCode?: string;
  viewCode?: string;
  id: string;
  revision: number;
  mode: 'create' | 'update';
  recordId?: string;
  recordRevision?: number;
  values: Record<string, unknown>;
  state: Record<string, unknown>;
  stateSchemaVersion?: number;
  stateSchemaDigest?: string;
  updatedAt: string;
  expiresAt: string;
}
export interface ResourceFormDraftStateSchema extends DataFormDraftStateSchema {
  schemaVersion: 'openxiangda.form-draft-state-schema/v2';
  digest: string;
}
/** Authenticated drafts use the same current user/environment as Native CRUD. */
export function createResourceFormDraftClient(resourceCode: string, mode: 'create' | 'update', recordId?: string, viewCode?: string, workflowScope?: ResourceFormDraftWorkflowScope) {
  const base = `${nativeBase()}/form-drafts/${encodeURIComponent(resourceCode)}`;
  const scope = () => ({ environmentKey: currentEnvironmentKey(), mode, ...(recordId ? { recordId } : {}), ...(viewCode ? { viewCode } : {}), ...(workflowScope || {}) });
  return {
    list() {
      return request<{ items: ResourceFormDraft[]; limit: number; retentionDays: number; stateSchema?: ResourceFormDraftStateSchema }>(`${base}/?${new URLSearchParams(scope())}`);
    },
    save(input: { id: string; expectedRevision: number; recordRevision?: number; values: Record<string, unknown>; state?: Record<string, unknown> }) {
      return request<ResourceFormDraft>(`${base}/save`, { method: 'POST', body: JSON.stringify({ ...input, ...scope() }) });
    },
    remove(draft: Pick<ResourceFormDraft, 'id' | 'revision'>) {
      return request<{ deleted: boolean }>(`${base}/delete`, { method: 'POST', body: JSON.stringify({ ...scope(), id: draft.id, expectedRevision: draft.revision }) });
    },
    submit(draft: Pick<ResourceFormDraft, 'id' | 'revision'>, operations: DataTransactionOperation[]) {
      return request<DataTransactionResult>(`${base}/submit`, { method: 'POST', body: JSON.stringify({ ...scope(), id: draft.id, expectedRevision: draft.revision, operations }) });
    },
  };
}


/** Private drafting for one published named workflow intent; submit through BusinessProcess. */
export function createWorkflowFormDraftClient(resourceCode: string, scope: ResourceFormDraftWorkflowScope) {
  const client = createResourceFormDraftClient(resourceCode, 'create', undefined, undefined, {
    workflowCode: scope.workflowCode, operationCode: scope.operationCode,
  });
  return { list: client.list, save: client.save, remove: client.remove };
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
