import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createServer as createNetServer } from "node:net";
import { platform } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { lstatSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { ApplicationEnvironment, DeploymentEnvironment } from "openxiangda-contracts";
import type { OpenXiangdaDeveloperSession } from "./session.js";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_WEB_PORT = 5173;
const DEFAULT_APP_PORT = 3000;
const DEFAULT_PROXY_PORT = 7001;

export interface ConnectedDevelopmentGrant {
  id: string;
  token: string;
  expiresAt: string;
  mode: "published-resources" | "manifest-overlay";
  manifestOverlay: boolean;
  manifestDigest: string | null;
  environment: {
    id: string;
    key: DeploymentEnvironment;
    activeAppVersionId: string;
    headRevision: number;
  };
}

export interface ConnectedDevelopmentSessionApi {
  create(): Promise<ConnectedDevelopmentGrant>;
  current(token: string): Promise<Omit<ConnectedDevelopmentGrant, "token">>;
  refresh(token: string): Promise<Omit<ConnectedDevelopmentGrant, "token">>;
  revoke(token: string): Promise<void>;
}

export interface ConnectedDevelopmentOptions {
  root: string;
  appCode: string;
  platformBaseUrl: string;
  environment: ApplicationEnvironment;
  developerSession: OpenXiangdaDeveloperSession;
  remoteSession: ConnectedDevelopmentSessionApi;
  /** Configured package directory, present only when local Nest execution is required. */
  backendRoot?: string;
  noOpen?: boolean;
  webPort?: number;
  onStatus?: (message: string) => void;
  readinessTimeoutMs?: number;
  /** @internal deterministic proxy port for verification. */
  proxyPort?: number;
  /** @internal observes a ready session without exposing credentials. */
  onReady?: (session: ConnectedDevelopmentSession) => void | Promise<void>;
}

export interface ConnectedDevelopmentSession {
  mode: "connected";
  appCode: string;
  environment: {
    key: DeploymentEnvironment;
    label: "test" | "production";
    id: string;
    productionData: boolean;
  };
  urls: {
    web: string;
    app: string | null;
    proxy: string;
    platform: string;
  };
  ports: {
    web: number;
    app: number | null;
    proxy: number;
  };
  publishedResourcesOnly: boolean;
  manifestOverlay: boolean;
}

export interface ConnectedDevelopmentResult {
  exitCode: number;
  session: ConnectedDevelopmentSession;
}

export function selectConnectedDevelopmentEnvironment(
  environments: ApplicationEnvironment[]
) {
  const available = environments.filter(
    environment => environment.status === "active" && environment.activeHead
  );
  return (
    available.find(item => item.environmentKey === "preproduction") ||
    available.find(item => item.environmentKey === "production")
  );
}

export async function runConnectedDevelopment(
  input: ConnectedDevelopmentOptions
): Promise<ConnectedDevelopmentResult> {
  const environmentKey = input.environment.environmentKey;
  const environmentLabel = environmentKey === "preproduction" ? "test" : "production";
  const productionData = environmentKey === "production";
  const backendRoot = input.backendRoot === undefined ? undefined : connectedBackendRoot(input.root, input.backendRoot);
  const activeHead = input.environment.activeHead;
  const activeVersion = activeHead?.activeAppVersion;
  if (backendRoot && (!activeHead || !activeVersion ||
    activeVersion.id !== activeHead.activeAppVersionId || activeVersion.appCode !== input.appCode ||
    !activeVersion.version?.trim() || !activeHead.activatedByDeploymentId ||
    !Number.isSafeInteger(activeHead.revision) || activeHead.revision < 1)) {
    throw new Error("OPENXIANGDA_CONNECTED_RUNTIME_DESCRIPTOR_REQUIRED: 本地 Nest 需要平台返回完整且一致的已激活应用版本");
  }
  const webPort = input.webPort === undefined
    ? await availablePort(DEFAULT_WEB_PORT)
    : await requiredPort(input.webPort, "WEB");
  const appPort = backendRoot ? await availablePort(DEFAULT_APP_PORT, new Set([webPort])) : null;
  const occupiedPorts = new Set([webPort, ...(appPort === null ? [] : [appPort])]);
  const proxyPort = input.proxyPort === undefined
    ? await availablePort(DEFAULT_PROXY_PORT, occupiedPorts)
    : await requiredPort(input.proxyPort, "PROXY", occupiedPorts);
  const urls = {
    web: `http://${LOOPBACK_HOST}:${webPort}`,
    app: appPort === null ? null : `http://${LOOPBACK_HOST}:${appPort}`,
    proxy: `http://${LOOPBACK_HOST}:${proxyPort}`,
    platform: input.platformBaseUrl.replace(/\/+$/, ""),
  };
  const session: ConnectedDevelopmentSession = {
    mode: "connected",
    appCode: input.appCode,
    environment: {
      key: environmentKey,
      label: environmentLabel,
      id: input.environment.id,
      productionData,
    },
    urls,
    ports: { web: webPort, app: appPort, proxy: proxyPort },
    publishedResourcesOnly: true,
    manifestOverlay: false,
  };

  let grant = await input.remoteSession.create();
  const children: ChildProcess[] = [];
  const exits: Promise<ChildExit>[] = [];
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  let stopping = false;
  let interrupted = false;
  let refreshInFlight: Promise<void> | undefined;
  let refreshTimer: NodeJS.Timeout | undefined;
  let refreshError: unknown;
  const stop = (signal: NodeJS.Signals = "SIGTERM", fromSignal = false) => {
    if (stopping) return;
    stopping = true;
    interrupted = fromSignal;
    terminateChildren(children, signal);
  };
  const refreshGrant = async () => {
    if (refreshInFlight) return await refreshInFlight;
    const pending = (async () => {
      const next = await input.remoteSession.refresh(grant.token);
      assertStatus(next);
      assertSessionTarget(next, input.environment);
      grant = { ...grant, ...next };
    })();
    refreshInFlight = pending;
    try {
      await pending;
    } catch (error) {
      refreshError = error;
      stop();
      throw error;
    } finally {
      if (refreshInFlight === pending) refreshInFlight = undefined;
    }
  };
  const sessionHeaders = async () => {
    const expiresAt = Date.parse(grant.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60_000) {
      await refreshGrant();
    }
    return { "x-openxiangda-dev-session": grant.token };
  };
  const proxy = createConnectedProxy({
    appCode: input.appCode,
    environmentKey,
    platformBaseUrl: input.platformBaseUrl,
    localAppBaseUrl: urls.app,
    developerSession: input.developerSession,
    sessionHeaders,
  });

  try {
    // Validation belongs to the cleanup lifecycle: even a malformed grant may
    // contain a live token that the platform expects us to revoke.
    assertGrant(grant);
    assertSessionTarget(grant, input.environment);
    session.publishedResourcesOnly = !grant.manifestOverlay;
    session.manifestOverlay = grant.manifestOverlay;
    await listen(proxy, proxyPort);
    const environment = {
      ...process.env,
      OPENXIANGDA_APP_CODE: input.appCode,
      OPENXIANGDA_APP_PORT: appPort === null ? "" : String(appPort),
      OPENXIANGDA_WEB_PORT: String(webPort),
      OPENXIANGDA_DEV_PROXY: urls.proxy,
      OPENXIANGDA_PLATFORM_PROXY: urls.proxy,
      OPENXIANGDA_PLATFORM_BASE_URL: `${urls.proxy}/service`,
      OPENXIANGDA_DEV_HOST: LOOPBACK_HOST,
      OPENXIANGDA_CONNECTED_DEV: "true",
      OPENXIANGDA_CONNECTED_DEV_ENVIRONMENT_LABEL: environmentLabel,
      OPENXIANGDA_ENVIRONMENT_KEY: environmentKey,
      OPENXIANGDA_ENVIRONMENT_ID: input.environment.id,
      OPENXIANGDA_APP_VERSION: activeVersion?.version || "",
      OPENXIANGDA_APP_VERSION_ID: activeHead?.activeAppVersionId || "",
      OPENXIANGDA_DEPLOYMENT_RUN_ID: activeHead?.activatedByDeploymentId || "",
      OPENXIANGDA_ENVIRONMENT_HEAD_REVISION: activeHead ? String(activeHead.revision) : "",
      // Local edited source is never represented as a deployed backend artifact.
      OPENXIANGDA_BACKEND_REVISION_ID: backendRoot ? `connected-development:${grant.id}` : "",
      OPENXIANGDA_RUNTIME_MODE: environmentKey,
      OPENXIANGDA_UI_ONLY: "false",
    };
    const spawnManaged = (args: string[], extra: NodeJS.ProcessEnv) => {
      const child = spawn("pnpm", args, {
        cwd: input.root,
        detached: process.platform !== "win32",
        stdio: "inherit",
        env: { ...environment, ...extra },
      });
      children.push(child);
      exits.push(childExit(child));
      return child;
    };
    spawnManaged(["run", "dev:web"], { HOST: LOOPBACK_HOST, PORT: String(webPort) });
    if (backendRoot) spawnManaged(["--dir", backendRoot, "run", "dev"], { PORT: String(appPort) });
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const handler = () => stop(signal, true);
      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }
    refreshTimer = setInterval(() => void refreshGrant().catch(() => undefined), 10 * 60_000);
    refreshTimer.unref();

    input.onStatus?.(`正在启动连接式开发：${urls.web}`);
    if (productionData) {
      input.onStatus?.("警告：当前连接 production，页面使用正式业务数据");
    } else {
      input.onStatus?.("当前连接 test 数据（平台环境 preproduction）");
    }
    const startup = await Promise.race([
      waitForReadiness([urls.web, ...(urls.app ? [`${urls.app}/__platform/ready`] : [])], input.readinessTimeoutMs),
      Promise.race(exits).then(exit => {
        throw exit.error || new Error(`OPENXIANGDA_CONNECTED_PROCESS_EXITED:${exit.code}`);
      }),
    ]);
    void startup;
    input.onStatus?.(`连接式开发已就绪：${urls.web}`);
    await input.onReady?.(session);
    if (!input.noOpen) openBrowser(urls.web);

    const first = await Promise.race(exits);
    stop("SIGTERM");
    const completed = await terminateAndWait(children, exits);
    if (refreshError) throw refreshError;
    const exitCode = interrupted
      ? 0
      : completed.find(item => item.code !== 0)?.code ?? first.code;
    return { exitCode, session };
  } finally {
    if (refreshTimer) clearInterval(refreshTimer);
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    terminateChildren(children, "SIGTERM");
    await terminateAndWait(children, exits);
    await close(proxy);
    await input.remoteSession.revoke(grant.token).catch(() => undefined);
  }
}

function createConnectedProxy(input: {
  appCode: string;
  environmentKey: DeploymentEnvironment;
  platformBaseUrl: string;
  localAppBaseUrl: string | null;
  developerSession: OpenXiangdaDeveloperSession;
  sessionHeaders: () => Promise<Record<string, string>>;
}) {
  return createHttpServer((request, response) => {
    void (async () => {
      const route = proxyRoute(
        request.url || "/",
        input.appCode,
        input.environmentKey,
        input.platformBaseUrl,
        input.localAppBaseUrl
      );
      if (!route) {
        response.statusCode = 404;
        response.end("OpenXiangda connected dev proxy only serves /service and /api");
        return;
      }
      if (route.kind === "disabled") {
        response.statusCode = 404;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ code: "OPENXIANGDA_CONNECTED_BACKEND_DISABLED", message: "当前应用未声明本地后端" }));
        return;
      }
      const authorization = `Bearer ${await input.developerSession.getAccessToken()}`;
      const headers = forwardedHeaders(request.headers);
      headers.authorization = authorization;
      if (route.kind === "remote") {
        Object.assign(headers, await input.sessionHeaders());
      } else {
        Object.assign(headers, await input.sessionHeaders());
        headers["x-openxiangda-connected-dev"] = "1";
      }
      await forward(request, response, route.url, headers);
    })().catch(error => {
      if (response.headersSent) response.destroy(error as Error);
      else {
        response.statusCode = 502;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify({
          code: "OPENXIANGDA_CONNECTED_PROXY_FAILED",
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    });
  });
}

function proxyRoute(
  requestUrl: string,
  appCode: string,
  environmentKey: DeploymentEnvironment,
  platformBaseUrl: string,
  localAppBaseUrl: string | null
) {
  const incoming = new URL(requestUrl, "http://connected.local");
  if (incoming.pathname === "/api" || incoming.pathname.startsWith("/api/")) {
    if (!localAppBaseUrl) return { kind: "disabled" as const };
    return { kind: "local" as const, url: new URL(`${incoming.pathname}${incoming.search}`, `${localAppBaseUrl}/`) };
  }
  if (incoming.pathname !== "/service" && !incoming.pathname.startsWith("/service/")) return null;
  const servicePath = incoming.pathname.slice("/service".length) || "/";
  const appApiPrefix = `/openxiangda-app-api/v2/${encodeURIComponent(appCode)}/${encodeURIComponent(environmentKey)}/`;
  if (servicePath.startsWith(appApiPrefix)) {
    const runtimePath = servicePath.slice(appApiPrefix.length);
    if (!runtimePath || runtimePath.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("OPENXIANGDA_CONNECTED_APP_API_PATH_INVALID");
    }
    const decoded = runtimePath.split("/").map(part => decodeURIComponent(part)).join("/");
    if (!localAppBaseUrl) return { kind: "disabled" as const };
    return { kind: "local" as const, url: new URL(`/${decoded}${incoming.search}`, `${localAppBaseUrl}/`) };
  }
  const base = platformBaseUrl.endsWith("/") ? platformBaseUrl : `${platformBaseUrl}/`;
  return { kind: "remote" as const, url: new URL(`${servicePath.replace(/^\/+/, "")}${incoming.search}`, base) };
}

function connectedBackendRoot(workspaceRoot: string, backendRoot: string): string {
  const root = resolve(workspaceRoot);
  const target = resolve(root, backendRoot);
  const name = relative(root, target);
  if (!name || name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name)) {
    throw new Error("OPENXIANGDA_CONNECTED_BACKEND_PATH_INVALID");
  }
  let current = root;
  for (const part of name.split(sep)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("OPENXIANGDA_CONNECTED_BACKEND_PATH_INVALID");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return target;
}

function assertSessionTarget(grant: Pick<ConnectedDevelopmentGrant, "environment">, environment: ApplicationEnvironment) {
  const target = grant.environment;
  const head = environment.activeHead;
  if (!head || !target || target.id !== environment.id || target.key !== environment.environmentKey ||
    target.activeAppVersionId !== head.activeAppVersionId || target.headRevision !== head.revision) {
    throw new Error("OPENXIANGDA_CONNECTED_HEAD_CHANGED: 开发会话目标与已读取的环境版本不一致，请重新运行 dev");
  }
}

async function forward(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  target: URL,
  headers: Record<string, string | string[]>
) {
  await new Promise<void>((resolve, reject) => {
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = send(target, {
      method: request.method,
      headers: { ...headers, host: target.host },
    }, incoming => {
      response.statusCode = incoming.statusCode || 502;
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined && !hopByHopHeader(name)) response.setHeader(name, value);
      }
      incoming.pipe(response);
      incoming.once("end", resolve);
      incoming.once("error", reject);
    });
    upstream.once("error", reject);
    request.pipe(upstream);
  });
}

function forwardedHeaders(source: import("node:http").IncomingHttpHeaders) {
  return Object.fromEntries(
    Object.entries(source).flatMap(([name, value]) =>
      value === undefined ||
      hopByHopHeader(name) ||
      name.toLowerCase() === "host"
        ? []
        : [[name, value]]
    )
  ) as Record<string, string | string[]>;
}

function hopByHopHeader(name: string) {
  return ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"].includes(name.toLowerCase());
}

function assertGrant(grant: ConnectedDevelopmentGrant) {
  const modeValid =
    (grant.mode === "published-resources" && grant.manifestOverlay === false) ||
    (grant.mode === "manifest-overlay" && grant.manifestOverlay === true);
  if (
    !grant.id ||
    !grant.token ||
    !grant.expiresAt ||
    !modeValid
  ) {
    throw new Error("OPENXIANGDA_CONNECTED_DEV_SESSION_INVALID");
  }
}

function assertStatus(grant: Omit<ConnectedDevelopmentGrant, "token">) {
  const modeValid =
    (grant.mode === "published-resources" && grant.manifestOverlay === false) ||
    (grant.mode === "manifest-overlay" && grant.manifestOverlay === true);
  if (
    !grant.id ||
    !grant.expiresAt ||
    !modeValid
  ) {
    throw new Error("OPENXIANGDA_CONNECTED_DEV_SESSION_INVALID");
  }
}

async function waitForReadiness(urls: string[], timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const results = await Promise.all(
        urls.map(url => fetch(url, { signal: AbortSignal.timeout(1_000) }))
      );
      const ready = results.every(result => result.ok);
      await Promise.all(
        results.map(result => result.body?.cancel().catch(() => undefined))
      );
      if (ready) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`OPENXIANGDA_CONNECTED_READINESS_TIMEOUT${lastError instanceof Error ? `:${lastError.message}` : ""}`);
}

function childExit(child: ChildProcess) {
  return new Promise<ChildExit>(resolve => {
    child.once("error", error => resolve({ code: 1, error }));
    child.once("exit", (code, signal) => resolve({ code: code ?? (signal ? 1 : 0) }));
  });
}

interface ChildExit { code: number; error?: Error }

function terminateChildren(children: ChildProcess[], signal: NodeJS.Signals) {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}

async function terminateAndWait(
  children: ChildProcess[],
  exits: Promise<ChildExit>[]
) {
  if (!exits.length) return [];
  const completed = Promise.all(exits.map(exit => exit.catch(error => ({ code: 1, error }))));
  const result = await Promise.race([
    completed,
    delay(5_000).then(() => null),
  ]);
  if (result) return result;
  terminateChildren(children, "SIGKILL");
  return await completed;
}

async function availablePort(preferred: number, excluded = new Set<number>()) {
  if (!excluded.has(preferred) && await portAvailable(preferred)) return preferred;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await ephemeralPort();
    if (!excluded.has(port)) return port;
  }
  throw new Error("OPENXIANGDA_CONNECTED_PORT_ALLOCATION_FAILED");
}

async function requiredPort(port: number, label: string, excluded = new Set<number>()) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || excluded.has(port) || !(await portAvailable(port))) {
    throw new Error(`OPENXIANGDA_CONNECTED_${label}_PORT_UNAVAILABLE:${port}`);
  }
  return port;
}

function portAvailable(port: number) {
  return new Promise<boolean>(resolve => {
    const server = createNetServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: LOOPBACK_HOST, port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

function ephemeralPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, () => {
      const address = server.address() as AddressInfo;
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function listen(server: import("node:http").Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: import("node:http").Server) {
  if (!server.listening) return Promise.resolve();
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  return new Promise<void>(resolve => server.close(() => resolve()));
}

function openBrowser(url: string) {
  const command = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  spawnSync(command, args, { stdio: "ignore" });
}

function delay(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
