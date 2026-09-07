import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface PlatformEnvelope<T> {
  code: number;
  message: string;
  errorCode?: string;
  data: T;
}

export interface OpenXiangdaSession {
  schemaVersion: 2;
  baseUrl: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
  savedAt: string;
  source: "file" | "environment";
}

export interface DeveloperIdentity {
  user: Record<string, unknown> | null;
  tenant: Record<string, unknown> | null;
  isPlatformAdmin: boolean;
  manageableAppTypes: string[];
}

export interface CliAuthorizationStart {
  sessionId: string;
  loginUrl: string;
  qrText: string;
  expireIn: number;
  pollSecret: string;
}

interface CliAuthorizationPoll {
  status: "pending" | "authorized" | "expired" | "revoked";
  expireIn?: number;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
  user?: Record<string, unknown> | null;
  tenant?: Record<string, unknown> | null;
}

export class DeveloperSessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly data?: unknown
  ) {
    super(message);
    this.name = "DeveloperSessionError";
  }
}

export function defaultSessionPath() {
  return join(homedir(), ".config", "openxiangda-v2", "session.json");
}

export function normalizePlatformBaseUrl(value: string) {
  const text = String(value || "").trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new DeveloperSessionError(
      "OPENXIANGDA_PLATFORM_URL_INVALID",
      "平台地址不是有效 URL"
    );
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new DeveloperSessionError(
      "OPENXIANGDA_PLATFORM_URL_INVALID",
      "平台地址只允许不含用户凭据的 HTTP(S) URL"
    );
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (
    !path ||
    path === "/platform" ||
    path.startsWith("/platform/") ||
    path === "/view" ||
    path.startsWith("/view/")
  ) {
    return `${url.origin}/service`;
  }
  return `${url.origin}${path}`;
}

export async function loadSession(path = defaultSessionPath()) {
  const baseUrl = String(process.env.OPENXIANGDA_BASE_URL || "").trim();
  const token = String(process.env.OPENXIANGDA_TOKEN || "").trim();
  if (baseUrl || token) {
    if (!baseUrl || !token) {
      throw new DeveloperSessionError(
        "OPENXIANGDA_ENV_AUTH_INCOMPLETE",
        "CI 身份必须同时提供 OPENXIANGDA_BASE_URL 和 OPENXIANGDA_TOKEN"
      );
    }
    return {
      schemaVersion: 2,
      baseUrl: normalizePlatformBaseUrl(baseUrl),
      accessToken: token,
      savedAt: "environment",
      source: "environment",
    } satisfies OpenXiangdaSession;
  }
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<
      OpenXiangdaSession & { token: string }
    >;
    const accessToken = String(raw.accessToken || raw.token || "").trim();
    if (raw.schemaVersion !== 2 || !raw.baseUrl || !accessToken) return null;
    return {
      schemaVersion: 2,
      baseUrl: normalizePlatformBaseUrl(raw.baseUrl),
      accessToken,
      ...(raw.refreshToken ? { refreshToken: raw.refreshToken } : {}),
      ...(raw.accessTokenExpiresAt
        ? { accessTokenExpiresAt: raw.accessTokenExpiresAt }
        : {}),
      ...(raw.refreshTokenExpiresAt
        ? { refreshTokenExpiresAt: raw.refreshTokenExpiresAt }
        : {}),
      savedAt: raw.savedAt || "unknown",
      source: "file",
    } satisfies OpenXiangdaSession;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveSession(
  input: {
    baseUrl: string;
    accessToken?: string;
    token?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    refreshTokenExpiresAt?: number;
  },
  path = defaultSessionPath()
) {
  const accessToken = String(input.accessToken || input.token || "").trim();
  if (!accessToken) {
    throw new DeveloperSessionError(
      "OPENXIANGDA_ACCESS_TOKEN_REQUIRED",
      "缺少 OpenXiangda access token"
    );
  }
  const persisted = {
    schemaVersion: 2,
    baseUrl: normalizePlatformBaseUrl(input.baseUrl),
    accessToken,
    ...(input.refreshToken ? { refreshToken: input.refreshToken } : {}),
    ...(input.accessTokenExpiresAt
      ? { accessTokenExpiresAt: input.accessTokenExpiresAt }
      : {}),
    ...(input.refreshTokenExpiresAt
      ? { refreshTokenExpiresAt: input.refreshTokenExpiresAt }
      : {}),
    savedAt: new Date().toISOString(),
  } as const;
  const directory = dirname(path);
  const temporaryPath = join(directory, `.session-${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(persisted, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return sessionSummary({ ...persisted, source: "file" });
}

export async function clearSession(path = defaultSessionPath()) {
  await rm(path, { force: true });
}

/** Read-only snapshot: never refresh, persist, redirect, or initiate authorization. */
export async function developerAuthorizationStatus(input: {
  baseUrl: string;
  sessionPath?: string;
  fetch?: FetchLike;
  now?: () => number;
}) {
  const baseUrl = normalizePlatformBaseUrl(input.baseUrl);
  const observedAt = new Date((input.now || Date.now)()).toISOString();
  type State = 'missing' | 'platform_mismatch' | 'refresh_required' | 'authorized' | 'unauthorized' | 'unavailable';
  const result = (state: State) => ({
    ok: true, operation: 'auth.status',
    workspace: { appCode: 'global', root: process.cwd() },
    data: { baseUrl, observedAt, state, authorized: state === 'authorized' },
    diagnostics: [], nextActions: [],
  });
  try {
    const session: OpenXiangdaSession | null = await loadSession(input.sessionPath);
    if (!session) return result('missing');
    if (session.baseUrl !== baseUrl) return result('platform_mismatch');
    if (session.accessTokenExpiresAt && session.accessTokenExpiresAt <= (input.now || Date.now)()) {
      return result('refresh_required');
    }
    const response = await (input.fetch || globalThis.fetch.bind(globalThis))(
      `${baseUrl}/openxiangda-api/v2/auth/whoami`,
      { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` } },
    );
    if (response.status === 401 || response.status === 403) return result('unauthorized');
    if (!response.ok) return result('unavailable');
    const envelope = await response.json() as PlatformEnvelope<DeveloperIdentity>;
    if (envelope.code === 401 || envelope.code === 403) return result('unauthorized');
    if (envelope.code !== 200 || !envelope.data?.user || !envelope.data?.tenant) return result('unavailable');
    return result('authorized');
  } catch {
    return result('unavailable');
  }
}

export function redactToken(token: string) {
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function sessionSummary(session: OpenXiangdaSession) {
  return {
    schemaVersion: session.schemaVersion,
    baseUrl: session.baseUrl,
    accessToken: redactToken(session.accessToken),
    refreshTokenConfigured: Boolean(session.refreshToken),
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    savedAt: session.savedAt,
    source: session.source,
  };
}

export class OpenXiangdaDeveloperSession {
  private refreshInFlight: Promise<OpenXiangdaSession> | undefined;
  private validated = false;

  constructor(
    private session: OpenXiangdaSession,
    private readonly options: {
      fetch?: FetchLike;
      sessionPath?: string;
      now?: () => number;
    } = {}
  ) {}

  static async load(options: {
    fetch?: FetchLike;
    sessionPath?: string;
    now?: () => number;
  } = {}) {
    const session = await loadSession(options.sessionPath);
    return session ? new OpenXiangdaDeveloperSession(session, options) : null;
  }

  get baseUrl() {
    return this.session.baseUrl;
  }

  summary() {
    return sessionSummary(this.session);
  }

  assertPlatform(linkedBaseUrl: string) {
    const linked = normalizePlatformBaseUrl(linkedBaseUrl);
    if (linked !== this.session.baseUrl) {
      throw new DeveloperSessionError(
        "OPENXIANGDA_PLATFORM_SESSION_MISMATCH",
        `工作区绑定平台 ${linked} 与当前登录平台 ${this.session.baseUrl} 不一致；为防止凭据跨平台发送，请切换登录会话或重新绑定工作区`
      );
    }
  }

  async getAccessToken(input: { forceRefresh?: boolean } = {}) {
    if (input.forceRefresh || this.shouldRefresh()) {
      await this.refresh();
    }
    if (!this.validated) {
      try {
        await this.requestWhoami(this.session.accessToken);
      } catch (error) {
        if (!this.isUnauthorized(error) || !this.session.refreshToken) throw error;
        await this.refresh();
        await this.requestWhoami(this.session.accessToken);
      }
      this.validated = true;
    }
    return this.session.accessToken;
  }

  async whoami() {
    if (this.shouldRefresh()) await this.refresh();
    try {
      const identity = await this.requestWhoami(this.session.accessToken);
      this.validated = true;
      return identity;
    } catch (error) {
      if (!this.isUnauthorized(error) || !this.session.refreshToken) throw error;
      await this.refresh();
      const identity = await this.requestWhoami(this.session.accessToken);
      this.validated = true;
      return identity;
    }
  }

  async logout() {
    let serverRevoked = false;
    let serverError: string | undefined;
    try {
      const token = await this.getAccessToken();
      await this.request<unknown>("/openxiangda-api/v2/auth/logout", {
        method: "POST",
        token,
        body: "{}",
      });
      serverRevoked = true;
    } catch (error) {
      serverError = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.session.source === "file") {
        await clearSession(this.options.sessionPath);
      }
    }
    return { loggedOut: true, serverRevoked, ...(serverError ? { serverError } : {}) };
  }

  private shouldRefresh() {
    return Boolean(
      this.session.refreshToken &&
        this.session.accessTokenExpiresAt &&
        this.session.accessTokenExpiresAt <= this.now() + 30_000
    );
  }

  private async refresh() {
    if (this.refreshInFlight) return await this.refreshInFlight;
    if (!this.session.refreshToken || this.session.source === "environment") {
      throw new DeveloperSessionError(
        "OPENXIANGDA_AUTH_REFRESH_UNAVAILABLE",
        "当前身份不能自动刷新，请重新登录或更新 CI token"
      );
    }
    const pending = this.performRefresh();
    this.refreshInFlight = pending;
    try {
      return await pending;
    } finally {
      if (this.refreshInFlight === pending) this.refreshInFlight = undefined;
    }
  }

  private async performRefresh() {
    const pair = await this.request<{
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt?: number;
      refreshTokenExpiresAt?: number;
    }>("/openxiangda-api/v2/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: this.session.refreshToken }),
    });
    if (!pair.accessToken || !pair.refreshToken) {
      throw new DeveloperSessionError(
        "OPENXIANGDA_AUTH_REFRESH_INVALID",
        "平台返回了无效的刷新结果"
      );
    }
    await saveSession(
      { baseUrl: this.session.baseUrl, ...pair },
      this.options.sessionPath
    );
    this.session = {
      schemaVersion: 2,
      baseUrl: this.session.baseUrl,
      ...pair,
      savedAt: new Date(this.now()).toISOString(),
      source: "file",
    };
    this.validated = false;
    return this.session;
  }

  private async requestWhoami(token: string) {
    return await this.request<DeveloperIdentity>(
      "/openxiangda-api/v2/auth/whoami",
      { token }
    );
  }

  private async request<T>(
    path: string,
    input: { method?: string; token?: string; body?: string } = {}
  ) {
    const response = await this.fetch(`${this.session.baseUrl}${path}`, {
      method: input.method || "GET",
      headers: {
        Accept: "application/json",
        ...(input.body ? { "Content-Type": "application/json" } : {}),
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      },
      ...(input.body ? { body: input.body } : {}),
    });
    return await parseEnvelope<T>(response);
  }

  private isUnauthorized(error: unknown) {
    return (
      error instanceof DeveloperSessionError &&
      (error.status === 401 || error.code === "OPENXIANGDA_AUTH_REQUIRED")
    );
  }

  private get fetch() {
    return this.options.fetch || globalThis.fetch.bind(globalThis);
  }

  private now() {
    return (this.options.now || Date.now)();
  }
}

export async function authorizeDeveloperSession(input: {
  baseUrl: string;
  fetch?: FetchLike;
  sessionPath?: string;
  pollIntervalMs?: number;
  onAuthorization?: (authorization: CliAuthorizationStart) => void | Promise<void>;
}) {
  const baseUrl = normalizePlatformBaseUrl(input.baseUrl);
  const fetcher = input.fetch || globalThis.fetch.bind(globalThis);
  const startResponse = await fetcher(
    `${baseUrl}/openxiangda-api/v2/auth/cli-sessions`,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl }),
    }
  );
  const authorization = await parseEnvelope<CliAuthorizationStart>(startResponse);
  await input.onAuthorization?.(authorization);
  const deadline = Date.now() + authorization.expireIn * 1000;
  while (Date.now() < deadline) {
    await delay(Math.max(250, input.pollIntervalMs || 1500));
    const pollResponse = await fetcher(
      `${baseUrl}/openxiangda-api/v2/auth/cli-sessions/${encodeURIComponent(
        authorization.sessionId
      )}`,
      {
        headers: {
          Accept: "application/json",
          "X-OpenXiangda-CLI-Poll-Secret": authorization.pollSecret,
        },
      }
    );
    const poll = await parseEnvelope<CliAuthorizationPoll>(pollResponse);
    if (poll.status === "pending") continue;
    if (poll.status !== "authorized" || !poll.accessToken) {
      throw new DeveloperSessionError(
        "OPENXIANGDA_CLI_AUTH_NOT_AUTHORIZED",
        poll.status === "expired" ? "CLI 授权会话已过期" : "CLI 授权会话未获批准"
      );
    }
    const transient: OpenXiangdaSession = {
      schemaVersion: 2,
      baseUrl,
      accessToken: poll.accessToken,
      ...(poll.refreshToken ? { refreshToken: poll.refreshToken } : {}),
      ...(poll.accessTokenExpiresAt
        ? { accessTokenExpiresAt: poll.accessTokenExpiresAt }
        : {}),
      ...(poll.refreshTokenExpiresAt
        ? { refreshTokenExpiresAt: poll.refreshTokenExpiresAt }
        : {}),
      savedAt: "validation",
      source: "file",
    };
    const manager = new OpenXiangdaDeveloperSession(transient, { fetch: fetcher });
    const identity = await manager.whoami();
    const summary = await saveSession(transient, input.sessionPath);
    return { session: summary, identity };
  }
  throw new DeveloperSessionError(
    "OPENXIANGDA_CLI_AUTH_EXPIRED",
    "CLI 授权会话已过期"
  );
}

async function parseEnvelope<T>(response: Response) {
  let envelope: PlatformEnvelope<T>;
  try {
    envelope = (await response.json()) as PlatformEnvelope<T>;
  } catch {
    throw new DeveloperSessionError(
      "OPENXIANGDA_AUTH_RESPONSE_INVALID",
      "平台身份接口返回的不是有效 JSON",
      response.status
    );
  }
  if (!response.ok || Number(envelope.code) >= 400) {
    throw new DeveloperSessionError(
      envelope.errorCode ||
        (Number(envelope.code) === 401
          ? "OPENXIANGDA_AUTH_REQUIRED"
          : "OPENXIANGDA_AUTH_REQUEST_FAILED"),
      envelope.message || `平台身份请求失败: ${response.status}`,
      response.status === 200 ? Number(envelope.code) : response.status,
      envelope.data
    );
  }
  return envelope.data;
}

async function delay(milliseconds: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
