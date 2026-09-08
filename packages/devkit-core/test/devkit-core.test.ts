import { writeDevelopmentFixture, writeVerificationFixture } from "../../../scripts/lib/development-records-fixture.mjs";
import { NATIVE_CONFIGURATION_VALIDATOR_DIGEST } from 'openxiangda-contracts/native-compiler';
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";
import test from "node:test";
import { withOperationProgress } from '../src/operation-progress.js';
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
  SCHEMA_VERSIONS,
  STUDIO_CAPABILITIES_SCHEMA_VERSION,
  STUDIO_PLATFORM_CONTRACT_VERSION,
  STUDIO_SITE_PROFILE_ENDPOINT,
  STUDIO_SITE_PROFILE_SCHEMA_VERSION,
  contractSchemas,
  canonicalJson,
  type PlatformCapabilityCode,
  type PlatformCapabilities,
  type StudioCapabilities,
  type NativeAuthorizationManagementCatalog,
} from "openxiangda-contracts";
import {
  AppConfigValidationError,
  ControlPlaneError,
  OpenXiangdaControlPlaneClient,
  OpenXiangdaApplicationServices,
  OPENXIANGDA_TOOLCHAIN_VERSION,
  type OpenXiangdaAppDeclaration,
  compileApplicationSources,
  compileAppPackage,
  createWorkspaceContext,
  defineOpenXiangdaApp,
  loadAppConfig,
  submitAppPackage,
  verifySealedAppPackage,
  validateAppConfig,
  authorizeDeveloperSession,
  collectWorkspaceToolchainDependencies,
  loadSession,
  normalizePlatformBaseUrl,
  OpenXiangdaDeveloperSession,
  runConnectedDevelopment,
  selectConnectedDevelopmentEnvironment,
  saveSession,
  assertApplicationContractCompatible,
  assertRequiredCapabilitiesAvailable,
  TOOLCHAIN_CAPSULE_MAX_MANIFEST_BYTES,
  ToolchainCapsuleScanLimitError,
} from "../src/index.js";

const devkitPackageManifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")
) as {
  version: string;
  dependencies: Record<string, string>;
};
const currentDevkitPackageVersion = devkitPackageManifest.version;
const currentContractsPackageVersion =
  devkitPackageManifest.dependencies["openxiangda-contracts"];
const staleDevkitPackageVersion = "2.0.0-alpha.0";

function requiredCapability(code: PlatformCapabilityCode, seed = "a") {
  return {
    code,
    contractVersion: PLATFORM_CAPABILITY_CONTRACT_VERSIONS[code],
    usageDigest: `sha256:${seed.repeat(64)}` as const,
  };
}

function availableCapability(code: PlatformCapabilityCode) {
  return {
    contractVersion: PLATFORM_CAPABILITY_CONTRACT_VERSIONS[code],
    status: "available" as const,
  };
}

test("connected development prefers test and falls back to published production", () => {
  const production = {
    id: "environment-production",
    environmentKey: "production",
    status: "active",
    activeHead: { activeAppVersionId: "version-production", revision: 1 },
  } as any;
  const preproduction = {
    id: "environment-test",
    environmentKey: "preproduction",
    status: "active",
    activeHead: { activeAppVersionId: "version-test", revision: 2 },
  } as any;
  const inactiveTest = {
    ...preproduction,
    id: "environment-inactive-test",
    status: "inactive",
  } as any;

  assert.equal(
    selectConnectedDevelopmentEnvironment([production, preproduction]),
    preproduction
  );
  assert.equal(
    selectConnectedDevelopmentEnvironment([production, inactiveTest]),
    production
  );
  assert.equal(
    selectConnectedDevelopmentEnvironment([{ ...preproduction, activeHead: null }]),
    undefined
  );
});

test("connected development proxies remote data and local Nest without Docker or credential leakage", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-connected-dev-"));
  const bin = join(root, "bin");
  const pidPath = join(root, "child-pids.txt");
  const dockerMarker = join(root, "docker-called");
  const originalPath = process.env.PATH;
  const originalPidPath = process.env.OPENXIANGDA_TEST_PID_PATH;
  const remoteRequests: Array<{ url: string; headers: Record<string, string | string[] | undefined> }> = [];
  const revoked: string[] = [];
  let remote: ReturnType<typeof createHttpServer> | undefined;
  try {
    mkdirSync(bin, { recursive: true });
    const fakePnpm = join(bin, "pnpm");
    writeFileSync(fakePnpm, `#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const script = process.argv.at(-1);
if (process.argv.join(" ").includes("must-not-leak") || JSON.stringify(process.env).includes("must-not-leak")) process.exit(91);
const port = script === "dev:web" ? Number(process.env.OPENXIANGDA_WEB_PORT) : Number(process.env.OPENXIANGDA_APP_PORT);
fs.appendFileSync(process.env.OPENXIANGDA_TEST_PID_PATH, process.pid + "\\n");
const server = http.createServer((request, response) => {
  if (script === "dev:web" && request.url === "/__test/stop") {
    response.end("stopping");
    response.on("finish", () => server.close(() => process.exit(0)));
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ script, url: request.url, headers: request.headers }));
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
server.listen(port, "127.0.0.1");
`, { mode: 0o755 });
    chmodSync(fakePnpm, 0o755);
    const fakeDocker = join(bin, "docker");
    writeFileSync(fakeDocker, `#!/bin/sh\ntouch "${dockerMarker}"\nexit 93\n`, { mode: 0o755 });
    chmodSync(fakeDocker, 0o755);
    process.env.PATH = `${bin}:${originalPath || ""}`;
    process.env.OPENXIANGDA_TEST_PID_PATH = pidPath;

    remote = createHttpServer((request, response) => {
      remoteRequests.push({ url: request.url || "/", headers: request.headers });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve, reject) => {
      remote!.once("error", reject);
      remote!.listen(0, "127.0.0.1", resolve);
    });
    const remoteAddress = remote.address();
    assert.ok(remoteAddress && typeof remoteAddress === "object");
    const platformBaseUrl = `http://127.0.0.1:${remoteAddress.port}/service`;
    const secretDeveloperToken = "developer-token-must-not-leak";
    const secretSessionToken = "dev-session-token-must-not-leak";
    const result = await runConnectedDevelopment({
      root,
      backendRoot: "services/api",
      appCode: "reference-app",
      platformBaseUrl,
      environment: {
        id: "environment-test",
        environmentKey: "preproduction",
        status: "active",
        activeHead: {
          activeAppVersionId: "version-1",
          activatedByDeploymentId: "deployment-1",
          revision: 3,
          revisions: { backend: "backend-1" },
          activeAppVersion: { id: "version-1", appCode: "reference-app", version: "1.2.3" },
        },
      } as any,
      developerSession: {
        getAccessToken: async () => secretDeveloperToken,
      } as any,
      remoteSession: {
        create: async () => ({
          id: "session-1",
          token: secretSessionToken,
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          mode: "manifest-overlay",
          manifestOverlay: true,
          manifestDigest: "a".repeat(64),
          environment: { id: "environment-test", key: "preproduction", activeAppVersionId: "version-1", headRevision: 3 },
        }),
        current: async () => ({
          id: "session-1",
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          mode: "manifest-overlay",
          manifestOverlay: true,
          manifestDigest: "a".repeat(64),
          environment: { id: "environment-test", key: "preproduction", activeAppVersionId: "version-1", headRevision: 3 },
        }),
        refresh: async () => ({
          id: "session-1",
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          mode: "manifest-overlay",
          manifestOverlay: true,
          manifestDigest: "a".repeat(64),
          environment: { id: "environment-test", key: "preproduction", activeAppVersionId: "version-1", headRevision: 3 },
        }),
        revoke: async token => { revoked.push(token); },
      },
      noOpen: true,
      webPort: await isolatedLoopbackPort(),
      readinessTimeoutMs: 5_000,
      onReady: async session => {
        const remoteResponse = await fetch(`${session.urls.proxy}/service/openxiangda-api/v2/probe`);
        assert.equal(remoteResponse.status, 200);
        const localResponse = await fetch(`${session.urls.proxy}/api/probe`);
        const local = await localResponse.json() as any;
        assert.equal(local.script, "dev");
        assert.equal(local.headers["x-openxiangda-connected-dev"], "1");
        assert.equal(local.headers.authorization, `Bearer ${secretDeveloperToken}`);
        assert.equal(
          local.headers["x-openxiangda-dev-session"],
          secretSessionToken
        );
        const appApiResponse = await fetch(
          `${session.urls.proxy}/service/openxiangda-app-api/v2/reference-app/preproduction/api/probe`
        );
        const appApi = await appApiResponse.json() as any;
        assert.equal(appApi.script, "dev");
        assert.equal(appApi.url, "/api/probe");
        await fetch(`${session.urls.web}/__test/stop`);
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.session.environment.label, "test");
    assert.equal(result.session.publishedResourcesOnly, false);
    assert.equal(result.session.manifestOverlay, true);
    assert.equal(existsSync(dockerMarker), false);
    assert.equal(remoteRequests.length, 1);
    assert.equal(remoteRequests[0]?.headers.authorization, `Bearer ${secretDeveloperToken}`);
    assert.equal(remoteRequests[0]?.headers["x-openxiangda-dev-session"], secretSessionToken);
    assert.deepEqual(revoked, [secretSessionToken]);
    assert.doesNotMatch(JSON.stringify(result), /must-not-leak/);
    for (const pid of readFileSync(pidPath, "utf8").trim().split("\n").map(Number)) {
      assert.throws(() => process.kill(pid, 0));
    }
  } finally {
    process.env.PATH = originalPath;
    if (originalPidPath === undefined) delete process.env.OPENXIANGDA_TEST_PID_PATH;
    else process.env.OPENXIANGDA_TEST_PID_PATH = originalPidPath;
    if (remote) await new Promise<void>(resolve => remote!.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("connected development revokes a malformed grant before failing", async () => {
  const revoked: string[] = [];
  const root = mkdtempSync(join(tmpdir(), "openxiangda-invalid-grant-"));
  try {
    await assert.rejects(
      () =>
        runConnectedDevelopment({
          root,
        appCode: "reference-app",
        platformBaseUrl: "https://platform.example/service",
        environment: {
          id: "environment-test",
          environmentKey: "preproduction",
          status: "active",
          activeHead: { activeAppVersionId: "version-1", revision: 1 },
        } as any,
        developerSession: {
          getAccessToken: async () => "developer-token",
        } as any,
        remoteSession: {
          create: async () => ({
            id: "session-invalid",
            token: "invalid-but-live-token",
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
            mode: "published-resources",
            manifestOverlay: true,
            manifestDigest: null,
            environment: { id: "environment-test", key: "preproduction", activeAppVersionId: "version-1", headRevision: 1 },
          }),
          current: async () => {
            throw new Error("not reached");
          },
          refresh: async () => {
            throw new Error("not reached");
          },
          revoke: async token => {
            revoked.push(token);
          },
        },
          noOpen: true,
        }),
      /OPENXIANGDA_CONNECTED_DEV_SESSION_INVALID/
    );
    assert.deepEqual(revoked, ["invalid-but-live-token"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("connected development handles SIGTERM without orphaning children or its Dev Session", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-connected-signal-"));
  const bin = join(root, "bin");
  const harnessPath = join(root, "signal-harness.mts");
  const readyPath = join(root, "ready");
  const revokePath = join(root, "revoked");
  const resultPath = join(root, "result.json");
  const pidPath = join(root, "child-pids.txt");
  const webPort = await isolatedLoopbackPort();
  let harness: ReturnType<typeof spawn> | undefined;
  try {
    mkdirSync(bin, { recursive: true });
    const fakePnpm = join(bin, "pnpm");
    writeFileSync(fakePnpm, `#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
if (process.argv.join(" ").includes("short-lived-signal-session-token") || JSON.stringify(process.env).includes("short-lived-signal-session-token")) process.exit(91);
const script = process.argv.at(-1);
const port = script === "dev:web" ? Number(process.env.OPENXIANGDA_WEB_PORT) : Number(process.env.OPENXIANGDA_APP_PORT);
fs.appendFileSync(process.env.OPENXIANGDA_TEST_PID_PATH, process.pid + "\\n");
const server = http.createServer((_request, response) => response.end("ready"));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
server.listen(port, "127.0.0.1");
`, { mode: 0o755 });
    chmodSync(fakePnpm, 0o755);
    const connectedSource = pathToFileURL(
      resolve(import.meta.dirname, "../src/connected-development.ts")
    ).href;
    writeFileSync(harnessPath, `
import { writeFileSync } from "node:fs";
import { runConnectedDevelopment } from ${JSON.stringify(connectedSource)};
const root = process.env.OPENXIANGDA_TEST_ROOT;
const result = await runConnectedDevelopment({
  root,
  backendRoot: "services/api",
  appCode: "reference-app",
  platformBaseUrl: "http://127.0.0.1:9/service",
  environment: {
    id: "environment-test",
    environmentKey: "preproduction",
    status: "active",
    activeHead: {
      activeAppVersionId: "version-1",
      activatedByDeploymentId: "deployment-1",
      revision: 3,
      revisions: { backend: "backend-1" },
      activeAppVersion: { id: "version-1", appCode: "reference-app", version: "1.2.3" },
    },
  },
  developerSession: { getAccessToken: async () => "developer-token" },
  remoteSession: {
    create: async () => ({
      id: "session-1",
      token: "short-lived-signal-session-token",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      mode: "published-resources",
      manifestOverlay: false,
      manifestDigest: "${"a".repeat(64)}",
      environment: { id: "environment-test", key: "preproduction", activeAppVersionId: "version-1", headRevision: 3 },
    }),
    current: async () => { throw new Error("current is not used"); },
    refresh: async () => { throw new Error("refresh is not due"); },
    revoke: async () => writeFileSync(${JSON.stringify(revokePath)}, "revoked"),
  },
  noOpen: true,
  webPort: ${webPort},
  readinessTimeoutMs: 5_000,
  onReady: () => writeFileSync(${JSON.stringify(readyPath)}, "ready"),
});
writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(result));
`);
    harness = spawn(process.execPath, ["--import", "tsx", harnessPath], {
      cwd: resolve(import.meta.dirname, "../../.."),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH || ""}`,
        OPENXIANGDA_TEST_ROOT: root,
        OPENXIANGDA_TEST_PID_PATH: pidPath,
      },
    });
    const harnessCompletion = childCompletion(harness, 12_000);
    await Promise.race([
      waitForPath(readyPath, 5_000),
      harnessCompletion.then(completed => {
        throw new Error(
          `SIGNAL_HARNESS_EXITED_BEFORE_READY:${completed.code}\n${completed.output}`
        );
      }),
    ]);
    assert.equal(harness.kill("SIGTERM"), true);
    const completed = await harnessCompletion;
    assert.equal(completed.code, 0, completed.output);
    assert.equal(existsSync(revokePath), true);
    assert.equal(JSON.parse(readFileSync(resultPath, "utf8")).exitCode, 0);
    for (const pid of readFileSync(pidPath, "utf8").trim().split("\n").map(Number)) {
      assert.equal(await waitForProcessExit(pid), true);
    }
  } finally {
    if (harness?.exitCode === null) harness.kill("SIGKILL");
    if (existsSync(pidPath)) {
      for (const pid of readFileSync(pidPath, "utf8").trim().split("\n").map(Number)) {
        if (!Number.isSafeInteger(pid)) continue;
        try { process.kill(-pid, "SIGKILL"); } catch {}
      }
    }
    rmSync(root, { recursive: true, force: true });
  }
});

async function waitForPath(path: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`PATH_TIMEOUT:${path}`);
}

async function waitForProcessExit(pid: number, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return false;
}

async function isolatedLoopbackPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function childCompletion(
  child: ReturnType<typeof spawn>,
  timeoutMs: number
) {
  return await new Promise<{ code: number; output: string }>((resolve, reject) => {
    let output = "";
    child.stdout?.on("data", chunk => { output += String(chunk); });
    child.stderr?.on("data", chunk => { output += String(chunk); });
    const timer = setTimeout(
      () => reject(new Error(`CHILD_EXIT_TIMEOUT:\n${output}`)),
      timeoutMs
    );
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });
}

test("uses the frozen connected Dev Session endpoints and header contract", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const status = {
    schemaVersion: "openxiangda.connected-dev-session/v2" as const,
    sessionId: "00000000-0000-4000-8000-000000000001",
    expiresAt: "2026-08-21T01:00:00.000Z",
    expiresIn: 1800,
    mode: "manifest-overlay" as const,
    manifestOverlay: true,
    additiveSchemaSync: true,
    environment: {
      id: "environment-test",
      key: "preproduction" as const,
      activeAppVersionId: "version-1",
      headRevision: 4,
    },
    principal: {
      type: "developer" as const,
      userId: "user-1",
      roleCodes: ["college_admin", "instrument_admin"],
      isAppSuperAdmin: false,
      capabilityCodes: ["app:instrument:update"],
    },
    manifestDigest: "a".repeat(64),
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example/service",
    token: "developer-access-token",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      const path = new URL(String(input)).pathname;
      return response(path.endsWith("/dev-sessions")
        ? { ...status, sessionToken: "one-time-session-token" }
        : status);
    },
  });
  const created = await client.createConnectedDevelopmentSession(
    "reference-app",
    {
      environmentKey: "preproduction",
      manifestDigest: "a".repeat(64),
      configuration: {
        schemaVersion: "openxiangda.config-bundle/v3",
        appCode: "reference-app",
      },
    }
  );
  await client.connectedDevelopmentSession("reference-app", created.sessionToken);
  await client.refreshConnectedDevelopmentSession("reference-app", created.sessionToken);
  await client.revokeConnectedDevelopmentSession("reference-app", created.sessionToken);

  assert.deepEqual(requests.map(item => ({
    path: new URL(item.url).pathname,
    method: item.init?.method || "GET",
    devSession: new Headers(item.init?.headers).get("X-OpenXiangda-Dev-Session"),
  })), [
    { path: "/service/openxiangda-api/v2/applications/reference-app/dev-sessions", method: "POST", devSession: null },
    { path: "/service/openxiangda-api/v2/applications/reference-app/dev-sessions/current", method: "GET", devSession: "one-time-session-token" },
    { path: "/service/openxiangda-api/v2/applications/reference-app/dev-sessions/current/refresh", method: "POST", devSession: "one-time-session-token" },
    { path: "/service/openxiangda-api/v2/applications/reference-app/dev-sessions/current/revoke", method: "POST", devSession: "one-time-session-token" },
  ]);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    environmentKey: "preproduction",
    manifestDigest: "a".repeat(64),
    configuration: {
      schemaVersion: "openxiangda.config-bundle/v3",
      appCode: "reference-app",
    },
  });
});

test("classifies interrupted artifact uploads as retryable before DeploymentRun creation", async () => {
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example/service",
    token: "developer-access-token",
    fetch: async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.ok(init?.body instanceof FormData);
      const cause = Object.assign(new Error("headers timeout"), {
        code: "UND_ERR_HEADERS_TIMEOUT",
      });
      throw Object.assign(new TypeError("fetch failed"), { cause });
    },
  });

  await assert.rejects(
    () =>
      client.uploadArtifact({
        appCode: "reference-app",
        digest: "a".repeat(64),
        kind: "frontend",
        contentType: "application/vnd.openxiangda.frontend-bundle.v2+json",
        content: "sealed frontend",
        metadata: { sourceCommit: "source-1" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ControlPlaneError);
      assert.equal(error.status, 503);
      assert.equal(error.code, "OPENXIANGDA_ARTIFACT_UPLOAD_FAILED");
      assert.equal(error.remote?.retryable, true);
      assert.match(error.remote?.remediation || "", /openxiangda deploy/);
      assert.deepEqual(error.data, {
        digest: "a".repeat(64),
        kind: "frontend",
        causeCode: "UND_ERR_HEADERS_TIMEOUT",
      });
      return true;
    }
  );
});

test("prepares optional preproduction identities through the bounded v2 endpoint", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example/service",
    token: "developer-access-token",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: "openxiangda.preproduction-acceptance-identities/v2",
        appCode: "reference-app",
        environmentKey: "preproduction",
        expiresAt: "2026-08-27T01:00:00.000Z",
        actors: [],
      });
    },
  });
  await client.preparePreproductionAcceptanceIdentities("reference-app", {
    environmentKey: "preproduction",
    expiresInMinutes: 60,
    actors: [
      {
        key: "viewer",
        roleCodes: ["viewer"],
      },
    ],
  });

  assert.equal(
    new URL(requests[0]!.url).pathname,
    "/service/openxiangda-api/v2/applications/reference-app/acceptance/identities/prepare"
  );
  assert.equal(requests[0]!.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]!.init?.body)), {
    environmentKey: "preproduction",
    expiresInMinutes: 60,
    actors: [{ key: "viewer", roleCodes: ["viewer"] }],
  });
});

test("preserves the platform Dev Session remediation in machine errors", async () => {
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    token: "developer-access-token",
    fetch: async () => new Response(JSON.stringify({
      code: 409,
      errorCode: "OPENXIANGDA_DEV_SESSION_HEAD_CHANGED",
      status: 409,
      retryable: true,
      remediation: "Refresh the connected development session and retry.",
      requestId: "request-1",
      message: "The published application head changed.",
      data: { expectedHeadRevision: 4, actualHeadRevision: 5 },
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.connectedDevelopmentSession("reference-app", "session-token"),
    (error: unknown) => {
      assert.ok(error instanceof ControlPlaneError);
      assert.equal(error.code, "OPENXIANGDA_DEV_SESSION_HEAD_CHANGED");
      assert.equal(error.remote?.retryable, true);
      assert.equal(
        error.remote?.remediation,
        "Refresh the connected development session and retry."
      );
      assert.equal(error.remote?.requestId, "request-1");
      return true;
    }
  );
});

test("loads current workspace sources without exposing TypeScript to Node runtimes", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-source-condition-"));
  try {
    const packageRoot = join(root, "node_modules", "@app", "domain");
    mkdirSync(join(packageRoot, "src"), { recursive: true });
    mkdirSync(join(packageRoot, "dist"), { recursive: true });
    writeFileSync(
      join(packageRoot, "package.json"),
      JSON.stringify({
        name: "@app/domain",
        type: "module",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            "openxiangda-source": "./src/index.ts",
            import: "./dist/index.js",
          },
        },
      })
    );
    writeFileSync(
      join(packageRoot, "src", "index.ts"),
      'export const appName: string = "current-source";\n'
    );
    writeFileSync(
      join(packageRoot, "dist", "index.js"),
      'export const appName = "stale-dist";\n'
    );
    writeFileSync(
      join(packageRoot, "dist", "index.d.ts"),
      "export declare const appName: string;\n"
    );
    const configPath = join(root, "openxiangda.config.ts");
    writeFileSync(
      configPath,
      `import { appName } from "@app/domain";\nexport default ${JSON.stringify(
        config()
      )}.app ? { ...${JSON.stringify(configDeclaration())}, app: { ...${JSON.stringify(
        config().app
      )}, name: appName } } : null;\n`
    );

    const loaded = await loadAppConfig(configPath);
    assert.equal(loaded.app.name, "current-source");
    assert.equal(
      execFileSync(
        process.execPath,
        ["--input-type=module", "--eval", 'import("@app/domain").then(value => process.stdout.write(value.appName))'],
        { cwd: root, encoding: "utf8" }
      ),
      "stale-dist"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loads and normalizes the deprecated Todo Center authoring helper", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-todo-authoring-"));
  try {
    const configPath = join(root, "openxiangda.config.ts");
    writeFileSync(
      configPath,
      `import {
  adminApplicationTodoCenterPage,
  adminNavigationGroup,
  defineAdminNavigation,
  defineOpenXiangdaApp,
} from "openxiangda/config";
const source = ${JSON.stringify(configDeclaration())};
export default defineOpenXiangdaApp({
  ...source,
  frontend: {
    ...source.frontend,
    admin: {
      navigation: defineAdminNavigation([
        adminNavigationGroup("overview", "工作台", [
          adminApplicationTodoCenterPage({ label: "待办中心" }),
        ]),
      ]),
    },
  },
});
`
    );
    const loaded = await loadAppConfig(configPath);
    assert.equal(loaded.frontend.user?.applicationTodoCenter, true);
    assert.deepEqual(loaded.frontend.admin?.navigation, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("normalizes browser and service URLs to one platform identity", () => {
  assert.equal(
    normalizePlatformBaseUrl("https://platform.example.test/platform/"),
    "https://platform.example.test/service"
  );
  assert.equal(
    normalizePlatformBaseUrl("https://platform.example.test/service/"),
    "https://platform.example.test/service"
  );
});

test("stores developer sessions atomically without exposing raw tokens", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-session-"));
  const path = join(root, "session.json");
  try {
    const summary = await saveSession(
      {
        baseUrl: "https://platform.example.test/platform",
        accessToken: "access-token-secret",
        refreshToken: "refresh-token-secret",
        accessTokenExpiresAt: 2000,
      },
      path
    );
    assert.equal(summary.baseUrl, "https://platform.example.test/service");
    assert.equal(summary.accessToken.includes("access-token-secret"), false);
    assert.equal("refreshToken" in summary, false);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.accessToken, "access-token-secret");
    assert.equal(raw.refreshToken, "refresh-token-secret");
    assert.equal((await loadSession(path))?.source, "file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects workspace platform mismatches before making authenticated requests", () => {
  const manager = new OpenXiangdaDeveloperSession({
    schemaVersion: 2,
    baseUrl: "https://platform-a.example.test/service",
    accessToken: "secret",
    savedAt: "test",
    source: "file",
  });
  assert.throws(
    () => manager.assertPlatform("https://platform-b.example.test/service"),
    /凭据跨平台发送/
  );
});

test("refreshes an expired developer session once and persists the rotated pair", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-refresh-"));
  const path = join(root, "session.json");
  const requests: Array<{ path: string; authorization?: string }> = [];
  try {
    await saveSession(
      {
        baseUrl: "https://platform.example.test/service",
        accessToken: "expired-access",
        refreshToken: "refresh-one",
        accessTokenExpiresAt: 1000,
        refreshTokenExpiresAt: 999999,
      },
      path
    );
    const manager = await OpenXiangdaDeveloperSession.load({
      sessionPath: path,
      now: () => 2000,
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          path: url.pathname,
          authorization: new Headers(init?.headers).get("authorization") || undefined,
        });
        if (url.pathname.endsWith("/refresh")) {
          return Response.json({
            code: 200,
            message: "success",
            data: {
              accessToken: "access-two",
              refreshToken: "refresh-two",
              accessTokenExpiresAt: 100000,
              refreshTokenExpiresAt: 999999,
            },
          });
        }
        return Response.json({
          code: 200,
          message: "success",
          data: {
            user: { id: "USER_1" },
            tenant: { id: "TENANT_1" },
            isPlatformAdmin: true,
            manageableAppTypes: ["reference-app"],
          },
        });
      },
    });
    assert.ok(manager);
    const identity = await manager.whoami();
    assert.equal(identity.isPlatformAdmin, true);
    assert.deepEqual(requests, [
      {
        path: "/service/openxiangda-api/v2/auth/refresh",
        authorization: undefined,
      },
      {
        path: "/service/openxiangda-api/v2/auth/whoami",
        authorization: "Bearer access-two",
      },
    ]);
    assert.equal((await loadSession(path))?.accessToken, "access-two");
    assert.equal((await loadSession(path))?.refreshToken, "refresh-two");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retries a control-plane request exactly once after a remote 401 envelope", async () => {
  const tokenCalls: boolean[] = [];
  const requests: string[] = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example.test/service",
    tokenProvider: {
      getAccessToken: async ({ forceRefresh = false } = {}) => {
        tokenCalls.push(forceRefresh);
        return forceRefresh ? "fresh-token" : "expired-token";
      },
    },
    fetch: async (_input, init) => {
      const authorization = new Headers(init?.headers).get("authorization") || "";
      requests.push(authorization);
      if (authorization === "Bearer expired-token") {
        return Response.json({
          code: 401,
          message: "Token is invalid",
          data: null,
        });
      }
      return Response.json({
        code: 200,
        message: "success",
        data: {
          contractVersion: OPENXIANGDA_CONTRACT_VERSION,
          platformVersion: "2.0.0-alpha.1",
          minimumCliVersion: "2.0.0-alpha.1",
          features: {},
          limits: {},
        },
      });
    },
  });

  await client.capabilities();
  assert.deepEqual(tokenCalls, [false, true]);
  assert.deepEqual(requests, ["Bearer expired-token", "Bearer fresh-token"]);
});

test("does not repeatedly replay a control-plane request when refreshed credentials fail", async () => {
  let requestCount = 0;
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example.test/service",
    tokenProvider: {
      getAccessToken: async ({ forceRefresh = false } = {}) =>
        forceRefresh ? "still-invalid" : "expired-token",
    },
    fetch: async () => {
      requestCount += 1;
      return Response.json({
        code: 401,
        message: "Token is invalid",
        data: null,
      });
    },
  });

  await assert.rejects(() => client.capabilities(), /Token is invalid/);
  assert.equal(requestCount, 2);
});

test("always clears the local session when server-side logout cannot be confirmed", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-logout-"));
  const path = join(root, "session.json");
  try {
    await saveSession(
      {
        baseUrl: "https://platform.example.test/service",
        accessToken: "access-one",
      },
      path
    );
    const manager = await OpenXiangdaDeveloperSession.load({
      sessionPath: path,
      fetch: async () => {
        throw new Error("network unavailable");
      },
    });
    assert.ok(manager);
    const result = await manager.logout();
    assert.equal(result.serverRevoked, false);
    assert.match(result.serverError || "", /network unavailable/);
    assert.equal(await loadSession(path), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps the browser login URL separate from the CLI token polling secret", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-browser-auth-"));
  const path = join(root, "session.json");
  const requests: Array<{ path: string; pollSecret?: string }> = [];
  try {
    const result = await authorizeDeveloperSession({
      baseUrl: "https://platform.example.test/service",
      sessionPath: path,
      pollIntervalMs: 1,
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          path: url.pathname,
          pollSecret:
            new Headers(init?.headers).get(
              "x-openxiangda-cli-poll-secret"
            ) || undefined,
        });
        if (url.pathname.endsWith("/cli-sessions")) {
          return Response.json({
            code: 200,
            message: "success",
            data: {
              sessionId: "session-1",
              loginUrl:
                "https://platform.example.test/service/openxiangda-api/v2/auth/cli-sessions/session-1/login",
              qrText:
                "https://platform.example.test/service/openxiangda-api/v2/auth/cli-sessions/session-1/login",
              expireIn: 30,
              pollSecret: "out-of-band-poll-secret",
            },
          });
        }
        if (url.pathname.endsWith("/cli-sessions/session-1")) {
          return Response.json({
            code: 200,
            message: "success",
            data: {
              status: "authorized",
              accessToken: "access-one",
              refreshToken: "refresh-one",
              accessTokenExpiresAt: Date.now() + 60_000,
              refreshTokenExpiresAt: Date.now() + 600_000,
            },
          });
        }
        return Response.json({
          code: 200,
          message: "success",
          data: {
            user: { id: "USER_1" },
            tenant: { id: "TENANT_1" },
            isPlatformAdmin: false,
            manageableAppTypes: ["reference-app"],
          },
        });
      },
    });

    assert.equal(result.identity.manageableAppTypes[0], "reference-app");
    assert.deepEqual(requests, [
      {
        path: "/service/openxiangda-api/v2/auth/cli-sessions",
        pollSecret: undefined,
      },
      {
        path: "/service/openxiangda-api/v2/auth/cli-sessions/session-1",
        pollSecret: "out-of-band-poll-secret",
      },
      {
        path: "/service/openxiangda-api/v2/auth/whoami",
        pollSecret: undefined,
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports the independently published Devkit package version", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { version: string };
  assert.equal(OPENXIANGDA_TOOLCHAIN_VERSION, manifest.version);
});

function configDeclaration(): OpenXiangdaAppDeclaration {
  return {
    schemaVersion: 3,
    app: { code: "reference-app", name: "Reference App" },
    frontend: { root: "apps/web" },
    backend: {
      root: "apps/server",
      runtime: "node",
      framework: "nestjs",
      enabled: true,
      isolation: "shared",
      resourceProfile: "light",
    },
    platform: { root: "platform" },
    data: {
      resources: [
        {
          code: "instruments",
          name: "仪器",
          fields: [
            { code: "name", type: "text.short", label: "仪器名称", required: true },
          ],
        },
      ],
    },
  };
}

function config() {
  return defineOpenXiangdaApp(configDeclaration());
}

test("returns an actionable DevkitResult when connected dev preflight fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-connected-preflight-"));
  try {
    mkdirSync(join(root, "packages/contracts/src"), { recursive: true });
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "reference-app",
      private: true,
      packageManager: "pnpm@10.15.1",
    }));
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const result = await new OpenXiangdaApplicationServices().dev(root, {
      noOpen: true,
    });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics[0]?.code,
      "OPENXIANGDA_CONNECTED_LINK_REQUIRED"
    );
    assert.match(result.diagnostics[0]?.remediation || "", /create/);
    assert.deepEqual(result.nextActions[0], {
      code: "create",
      label: "初始化应用",
      command: "openxiangda create <directory> --base-url <platform>",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function response<T>(data: T, status = 200) {
  return new Response(
    JSON.stringify({
      code: status,
      message: status < 400 ? "success" : "failed",
      data,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function configurationCompatibility(
  supportedApplicationContracts = [{ ...CURRENT_APPLICATION_CONTRACT }]
) {
  return {
    schemaVersion: SCHEMA_VERSIONS.configurationCompatibility,
    validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST,
    capability: {
      code: "configuration.compatibility-preflight" as const,
      version: "native-2",
      status: "available" as const,
    },
    requestSchemaVersion: SCHEMA_VERSIONS.configurationValidationRequest,
    resultSchemaVersion: SCHEMA_VERSIONS.configurationValidationResult,
    endpointTemplate:
      "/openxiangda-api/v2/applications/{appCode}/configuration-compatibility",
    limits: {
      configurationCanonicalBytes: 4 * 1024 * 1024,
      contractCanonicalBytes: 8 * 1024 * 1024,
      requestBytes: 10 * 1024 * 1024,
    },
    supportedApplicationContracts,
  };
}

function platformCapabilitiesFixture() {
  return {
    schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
    apiVersion: "v2",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    platformVersion: "2.0.0-test",
    features: {},
    configurationCompatibility: configurationCompatibility(),
    deployment: {
      executionOwner: "platform",
      durableRuns: true,
      clientCanCheckpoint: false,
      backendImageBuild: {
        owner: "developer-cli",
        available: false,
        repositoryPrefix: null,
        platform: "linux/amd64",
      },
    },
  } as const;
}

test('rejects a different shared validator before accepting an otherwise matching platform contract', () => {
  const capabilities = platformCapabilitiesFixture();
  assert.throws(() => assertApplicationContractCompatible({
    ...capabilities,
    configurationCompatibility: { ...capabilities.configurationCompatibility, validatorDigest: 'f'.repeat(64) },
  }, CURRENT_APPLICATION_CONTRACT), (error: unknown) => error instanceof ControlPlaneError && error.code === 'OPENXIANGDA_CONFIGURATION_VALIDATOR_MISMATCH');
});

function assertPlatformCapabilitiesInvalid(capabilities: PlatformCapabilities) {
  assert.throws(
    () =>
      assertApplicationContractCompatible(
        capabilities,
        CURRENT_APPLICATION_CONTRACT
      ),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code === "OPENXIANGDA_PLATFORM_CAPABILITIES_INVALID"
  );
}

test('validates optional source hosting from the platform without opening the capability envelope', () => {
  const base = platformCapabilitiesFixture();
  for (const sourceHosting of [undefined, { provider: 'forgejo' as const, enabled: false }, { provider: 'forgejo' as const, enabled: true }]) {
    assert.doesNotThrow(() => assertApplicationContractCompatible({ ...base, ...(sourceHosting ? { sourceHosting } : {}) }, CURRENT_APPLICATION_CONTRACT));
  }
  for (const sourceHosting of [{ provider: 'other', enabled: true }, { provider: 'forgejo', enabled: 'true' }, { provider: 'forgejo' }, { provider: 'forgejo', enabled: true, secret: 'forbidden' }]) {
    assertPlatformCapabilitiesInvalid({ ...base, sourceHosting } as unknown as PlatformCapabilities);
  }
});

const validateStudioCapabilities = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
}).compile(contractSchemas.studioCapabilities);

function assertStudioCapabilitiesInvalid(value: unknown) {
  assert.equal(validateStudioCapabilities(value), false);
  assert.ok((validateStudioCapabilities.errors || []).length > 0);
}

test("keeps platform v3 closed and validates standalone Studio discovery", () => {
  const base = platformCapabilitiesFixture();
  assert.doesNotThrow(() =>
    assertApplicationContractCompatible(base, CURRENT_APPLICATION_CONTRACT)
  );

  const available = {
    schemaVersion: STUDIO_CAPABILITIES_SCHEMA_VERSION,
    studioContractVersion: STUDIO_PLATFORM_CONTRACT_VERSION,
    studio: {
      contractVersion: STUDIO_PLATFORM_CONTRACT_VERSION,
      profile: {
        schemaVersion: STUDIO_SITE_PROFILE_SCHEMA_VERSION,
        endpoint: STUDIO_SITE_PROFILE_ENDPOINT,
        status: "available",
        signatureAlgorithm: "Ed25519",
        verificationOwner: "studio-client-trust-store",
      },
      compatibility: {
        studioContractRange: "^1.0.0",
        cliContractRange: ">=2.0.0-alpha.135 <3.0.0",
      },
    },
  } as const satisfies StudioCapabilities;
  assert.equal(validateStudioCapabilities(available), true);

  const unavailable = {
    schemaVersion: STUDIO_CAPABILITIES_SCHEMA_VERSION,
    studioContractVersion: STUDIO_PLATFORM_CONTRACT_VERSION,
    studio: {
      contractVersion: STUDIO_PLATFORM_CONTRACT_VERSION,
      profile: {
        schemaVersion: STUDIO_SITE_PROFILE_SCHEMA_VERSION,
        endpoint: STUDIO_SITE_PROFILE_ENDPOINT,
        status: "unavailable",
        unavailableCode: "STUDIO_SITE_PROFILE_NOT_CONFIGURED",
        signatureAlgorithm: "Ed25519",
        verificationOwner: "studio-client-trust-store",
      },
      compatibility: {
        studioContractRange: null,
        cliContractRange: null,
      },
    },
  } as const satisfies StudioCapabilities;
  assert.equal(validateStudioCapabilities(unavailable), true);

  assertPlatformCapabilitiesInvalid({
    ...base,
    studioContractVersion: STUDIO_PLATFORM_CONTRACT_VERSION,
    studio: available.studio,
  } as unknown as PlatformCapabilities);
  assertStudioCapabilitiesInvalid({
    schemaVersion: STUDIO_CAPABILITIES_SCHEMA_VERSION,
    studioContractVersion: STUDIO_PLATFORM_CONTRACT_VERSION,
  });
  assertStudioCapabilitiesInvalid({
    schemaVersion: STUDIO_CAPABILITIES_SCHEMA_VERSION,
    studio: available.studio,
  });
  assertStudioCapabilitiesInvalid({
    ...available,
    studio: {
      ...available.studio,
      profile: {
        ...available.studio.profile,
        privateKey: "must-never-be-accepted",
      },
    },
  });
  assertStudioCapabilitiesInvalid({
    ...available,
    studio: {
      ...available.studio,
      contractVersion: "1.0.1",
    },
  });
  assertStudioCapabilitiesInvalid({
    ...available,
    studio: {
      ...available.studio,
      compatibility: {
        studioContractRange: null,
        cliContractRange: null,
      },
    },
  });
  assertStudioCapabilitiesInvalid({
    ...unavailable,
    studio: {
      ...unavailable.studio,
      compatibility: {
        studioContractRange: "^1.0.0",
        cliContractRange: ">=2.0.0-alpha.135 <3.0.0",
      },
    },
  });
});

test("accepts Native schemaVersion 3 and rejects the removed alpha generation", () => {
  assert.equal(validateAppConfig(config()).length, 0);
  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...configDeclaration(),
        schemaVersion: 2 as 3,
      }),
    AppConfigValidationError
  );
});

test("provisions a stable Application v2 identity through the control plane", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example/",
    token: "platform-admin-token",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: SCHEMA_VERSIONS.application,
        created: true,
        application: {
          schemaVersion: SCHEMA_VERSIONS.application,
          id: "app-1",
          appCode: "reference-app",
          name: "Reference App",
          runtimeMode: "react-spa",
          activeRuntimeReleaseId: null,
          activeRuntimeBuildId: null,
        },
        environments: [
          {
            id: "environment-preproduction",
            tenantId: "tenant-1",
            appCode: "reference-app",
            environmentKey: "preproduction",
            environmentKind: "preproduction",
            displayName: "预发环境",
            status: "active",
            runtimeState: "stopped",
            sideEffectPolicy: {
              externalSideEffects: "restricted",
              productionDataAccess: false,
            },
            revision: 1,
            createdBy: "user-1",
            updatedBy: "user-1",
            createdAt: "2026-08-15T00:00:00.000Z",
            updatedAt: "2026-08-15T00:00:00.000Z",
          },
        ],
        bootstrapSuperAdminGrant: {
          id: "super-admin-grant-1",
          tenantId: "tenant-1",
          appCode: "reference-app",
          userId: "user-1",
          status: "active",
          revision: 1,
        },
      });
    },
  });
  const result = await client.provisionApplication({
    appCode: "reference-app",
    name: "Reference App",
    description: "Independent validation application",
  });
  assert.equal(result.created, true);
  assert.deepEqual(
    result.environments.map(environment => [
      environment.environmentKey,
      environment.id,
    ]),
    [["preproduction", "environment-preproduction"]]
  );
  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/provision"
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    name: "Reference App",
    description: "Independent validation application",
  });
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("Authorization"),
    "Bearer platform-admin-token"
  );
});

test("stages platform-managed runtime OAuth rotation without transporting secret material", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        configured: true,
        requiresRedeploy: Boolean(init?.method === "POST"),
        client: {
          id: "runtime-client-1",
          appCode: "reference-app",
          environmentKey: "preproduction",
          name: "Platform runtime workload",
          clientId: "oxc_runtime",
          clientKind: "runtime",
          platformManaged: true,
          clientSecretHint: "…safehint",
          pendingRotation:
            init?.method === "POST"
              ? {
                  credentialVersion: 2,
                  requestedAt: "2026-08-12T02:00:00.000Z",
                  gracePeriodSeconds: 600,
                }
              : null,
          scopes: ["app:invoke"],
          status: "active",
          credentialVersion: 1,
          rateLimitPerMinute: 6000,
          createdAt: "2026-08-12T01:00:00.000Z",
          updatedAt: "2026-08-12T02:00:00.000Z",
        },
      });
    },
  });

  await client.runtimeOAuthCredentialStatus(
    "reference-app",
    "preproduction"
  );
  await client.stageRuntimeOAuthCredentialRotation(
    "reference-app",
    "preproduction",
    {
      expectedCredentialVersion: 1,
      gracePeriodSeconds: 600,
      idempotencyKey: "rotation-1",
    }
  );

  assert.deepEqual(
    requests.map((item) => ({
      path: new URL(item.url).pathname,
      method: item.init?.method || "GET",
    })),
    [
      {
        path: "/openxiangda-api/v2/applications/reference-app/oauth2/runtime-credentials/preproduction",
        method: "GET",
      },
      {
        path: "/openxiangda-api/v2/applications/reference-app/oauth2/runtime-credentials/preproduction/rotate",
        method: "POST",
      },
    ]
  );
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    expectedCredentialVersion: 1,
    gracePeriodSeconds: 600,
    idempotencyKey: "rotation-1",
  });
  assert.equal(String(requests[1]?.init?.body).includes("secret"), false);
});

test("orchestrates runtime credential rotation as one same-version rolling deployment", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-runtime-rotate-"));
  const calls: Array<{ operation: string; input?: unknown }> = [];
  try {
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
        devDependencies: {
          "openxiangda-contracts": "2.0.0-alpha.10",
          "openxiangda-devkit-core": "2.0.0-alpha.10",
        },
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const deployment = {
      id: "runtime-rollout-1",
      status: "queued",
    };
    const services = new OpenXiangdaApplicationServices({
      client: {
        runtimeOAuthCredentialStatus: async () => {
          calls.push({ operation: "status" });
          return {
            configured: true,
            requiresRedeploy: false,
            client: { credentialVersion: 4 },
          };
        },
        stageRuntimeOAuthCredentialRotation: async (
          _appCode: string,
          _environmentKey: string,
          input: unknown
        ) => {
          calls.push({ operation: "stage", input });
          return {
            configured: true,
            requiresRedeploy: true,
            client: { credentialVersion: 4 },
          };
        },
        environmentHead: async () => {
          calls.push({ operation: "head" });
          return {
            activeAppVersionId: "app-version-4",
            environmentId: "environment-preproduction",
            environmentKind: "preproduction",
          };
        },
        redeploy: async (input: unknown) => {
          calls.push({ operation: "redeploy", input });
          return deployment;
        },
      } as any,
    });

    const result = await services.rotateRuntimeOAuthCredential(root, {
      environmentKey: "preproduction",
      gracePeriodSeconds: 900,
      idempotencyKey: "runtime-rotation-4",
    });
    assert.equal(result.ok, true);
    assert.equal((result.data as any).deployment.id, "runtime-rollout-1");
    assert.deepEqual(calls, [
      { operation: "status" },
      {
        operation: "stage",
        input: {
          expectedCredentialVersion: 4,
          gracePeriodSeconds: 900,
          idempotencyKey: "runtime-rotation-4",
        },
      },
      { operation: "head" },
      {
        operation: "redeploy",
        input: {
          appCode: "reference-app",
          appVersionId: "app-version-4",
          environmentId: "environment-preproduction",
          environmentKind: "preproduction",
          idempotencyKey:
            "oauth-runtime-rotation:runtime-rotation-4",
          requestId: "runtime-rotation-4",
        },
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('再次检查复用已验证脚本，但输出或源码变化会重新执行', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oxa-check-reuse-'));
  try {
    mkdirSync(join(root, 'apps/web/dist'), { recursive: true });
    writeFileSync(join(root, 'apps/web/dist/index.html'), '<main>ready</main>');
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    const { enabled, ...backend } = configDeclaration().backend!;
    writeFileSync(join(root, 'openxiangda.config.ts'), `export default ${JSON.stringify({ ...configDeclaration(), backend })};`);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'reference-app', version: '0.1.0', packageManager: 'pnpm@10.15.1',
      scripts: { check: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' },
      devDependencies: { 'openxiangda-contracts': currentContractsPackageVersion, 'openxiangda-devkit-core': currentDevkitPackageVersion },
    }));
    const services = new OpenXiangdaApplicationServices();
    const first = await services.check(root);
    assert.equal(first.ok, true, JSON.stringify(first.diagnostics));
    const workspaceContext = await services.workspaceContext(root);
    const validateContext = new Ajv2020({ strict: false }).compile(contractSchemas.workspaceContext);
    assert.equal(validateContext(workspaceContext.data), true, JSON.stringify(validateContext.errors));
    assert.ok(existsSync(join(root, '.openxiangda/build/validation-evidence.json')), JSON.stringify(first));
    const reused = await services.check(root);
    assert.equal(reused.ok, true);
    assert.equal(reused.data?.stages.length, 3);
    assert.ok(reused.data?.stages.every(stage => stage.reused === true));
    writeFileSync(join(root, 'apps/web/dist/index.html'), '<main>changed</main>');
    const rebuilt = await services.check(root);
    assert.equal(rebuilt.ok, true);
    assert.ok(rebuilt.data?.stages.every(stage => !stage.reused));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("loads a normal workspace and deterministically generates and seals it", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-devkit-"));
  try {
    mkdirSync(join(root, "apps/web/dist"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    mkdirSync(join(root, "packages/contracts/src"), { recursive: true });
    writeFileSync(join(root, "apps/web/dist/index.html"), "<main>ready</main>");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
        scripts: {
          check: 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
          build: 'node -e "process.exit(0)"',
        },
        devDependencies: {
          "openxiangda-contracts": currentContractsPackageVersion,
          "openxiangda-devkit-core": currentDevkitPackageVersion,
        },
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const services = new OpenXiangdaApplicationServices();
    const generated = await services.generate({ root });
    assert.equal(generated.ok, true);
    assert.match(
      readFileSync(join(root, "packages/contracts/src/generated.ts"), "utf8"),
      /interface InstrumentsRecord/
    );
    const compatibleIndependentVersions = await services.check(root);
    assert.equal(compatibleIndependentVersions.ok, true);
    assert.deepEqual(
      compatibleIndependentVersions.data?.sealedArtifact,
      JSON.parse(
        readFileSync(
          join(root, ".openxiangda/build/seal-status.json"),
          "utf8"
        )
      )
    );
    assert.equal(
      compatibleIndependentVersions.data?.sealedArtifact.state,
      "check-did-not-seal"
    );
    assert.equal(
      compatibleIndependentVersions.data?.sealedArtifact.usableForDeploy,
      false
    );
    assert.equal(
      compatibleIndependentVersions.data?.sealedArtifact.nextCommand,
      "openxiangda deploy"
    );

    const packageJsonPath = join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    packageJson.scripts.check = 'node -e "process.exit(7)"';
    packageJson.scripts.test = 'node -e "require(\'node:fs\').writeFileSync(\'unexpected-test\', \'ran\')"';
    packageJson.scripts.build = 'node -e "require(\'node:fs\').writeFileSync(\'unexpected-build\', \'ran\')"';
    writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    const failedCheck = await services.check(root);
    assert.equal(failedCheck.ok, false);
    assert.deepEqual(failedCheck.data?.stages.map(stage => stage.state), ['failed', 'skipped', 'skipped']);
    assert.equal(existsSync(join(root, 'unexpected-test')), false);
    assert.equal(existsSync(join(root, 'unexpected-build')), false);
    packageJson.scripts.check = 'node -e "process.exit(0)"';
    packageJson.scripts.test = 'node -e "process.exit(0)"';
    packageJson.scripts.build = 'node -e "process.exit(0)"';
    packageJson.devDependencies["openxiangda-devkit-core"] =
      `^${currentDevkitPackageVersion}`;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    const floatingDependency = await services.check(root);
    assert.equal(floatingDependency.ok, false);
    assert.equal(
      floatingDependency.diagnostics.find(
        diagnostic => diagnostic.code === "TOOLCHAIN_DEPENDENCY_NOT_PINNED"
      )?.path,
      "package.json"
    );
    packageJson.devDependencies["openxiangda-devkit-core"] =
      currentDevkitPackageVersion;
    packageJson.devDependencies["openxiangda-contracts"] = "1.9.0";
    writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    const incompatibleTrain = await services.check(root);
    assert.equal(incompatibleTrain.ok, false);
    assert.equal(
      incompatibleTrain.diagnostics.find(
        diagnostic =>
          diagnostic.code === "TOOLCHAIN_RELEASE_TRAIN_INCOMPATIBLE"
      )?.path,
      "package.json"
    );
    packageJson.devDependencies["openxiangda-contracts"] =
      currentContractsPackageVersion;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    const first = await services.build({
      root,
      backendImage: `registry.example/reference@sha256:${"1".repeat(64)}`,
      skipWorkspaceBuild: true,
      write: true,
    });
    const second = await services.build({
      root,
      backendImage: `registry.example/reference@sha256:${"1".repeat(64)}`,
      skipWorkspaceBuild: true,
      write: false,
    });
    assert.equal(first.ok, true);
    assert.equal(first.data?.package.digest, second.data?.package.digest);
    assert.equal(first.data?.sealedArtifact.state, "sealed");
    assert.equal(first.data?.sealedArtifact.usableForDeploy, true);
    assert.equal(
      first.data?.sealedArtifact.packageDigest,
      first.data?.package.digest
    );
    assert.deepEqual(
      first.data?.sealedArtifact,
      JSON.parse(
        readFileSync(
          join(first.data!.outputDirectory!, "seal-status.json"),
          "utf8"
        )
      )
    );
    assert.equal(first.data?.package.manifest.artifacts.length, 4);
    assert.deepEqual(first.data?.package.manifest.metadata?.backend, {
      present: true,
      isolation: "shared",
      resourceProfile: "light",
    });
    const aiCatalog = first.data?.package.manifest.metadata?.aiCatalog as {
      schemaVersion?: string;
      capabilities?: unknown[];
    };
    assert.equal(aiCatalog?.schemaVersion, SCHEMA_VERSIONS.aiCapabilityCatalog);
    assert.ok((aiCatalog?.capabilities?.length || 0) > 0);
    assert.equal(
      first.data?.package.manifest.metadata?.aiCatalogDigest,
      second.data?.package.manifest.metadata?.aiCatalogDigest
    );
    assert.equal("artifactContent" in first.data!, false);
    const buildDirectory = first.data?.outputDirectory;
    assert.ok(buildDirectory);
    const sealedBytes = [
      readFileSync(join(buildDirectory!, "app-package.json"), "utf8"),
      ...readdirSync(join(buildDirectory!, "artifacts")).map(file =>
        readFileSync(join(buildDirectory!, "artifacts", file), "utf8")
      ),
    ].join("\n");
    const checkedAfterSeal = await services.check(root);
    assert.equal(checkedAfterSeal.ok, true);
    assert.equal(
      checkedAfterSeal.data?.sealedArtifact.previousArtifact?.packageDigest,
      first.data?.package.digest
    );
    assert.equal(
      checkedAfterSeal.data?.sealedArtifact.previousArtifact
        ?.matchesWorkspaceSource,
      false
    );
    assert.equal(
      checkedAfterSeal.data?.sealedArtifact.state,
      "check-did-not-seal"
    );
    assert.equal(
      JSON.parse(
        readFileSync(join(buildDirectory!, "seal-status.json"), "utf8")
      ).sealed,
      false
    );
    const mutableImage = await services.build({
      root,
      backendImage: "registry.example/reference:latest",
      skipWorkspaceBuild: true,
      write: false,
    });
    assert.equal(mutableImage.ok, false);
    assert.equal(
      mutableImage.diagnostics[0]?.code,
      "BACKEND_IMAGE_NOT_IMMUTABLE"
    );

    const { enabled: _enabled, ...crudBackend } = configDeclaration().backend;
    const crudConfig = {
      ...configDeclaration(),
      backend: crudBackend,
    };
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(crudConfig)};\n`
    );
    const crudPackage = await services.build({
      root,
      skipWorkspaceBuild: true,
      write: false,
    });
    assert.equal(crudPackage.ok, true);
    assert.equal(crudPackage.data?.package.manifest.artifacts.length, 3);
    assert.equal(crudPackage.data?.package.manifest.manifests.backend, undefined);
    assert.deepEqual(
      crudPackage.data?.package.manifest.metadata?.backend,
      { present: false }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("enforces the CLI toolchain capsule before workspace side effects", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-capsule-"));
  const marker = join(root, "script-ran");
  const generated = join(root, "packages/contracts/src/generated.ts");
  try {
    mkdirSync(join(root, "apps/web/dist"), { recursive: true });
    mkdirSync(join(root, "packages/contracts/src"), { recursive: true });
    writeFileSync(join(root, "apps/web/dist/index.html"), "<main />");
    writeFileSync(generated, "sentinel-generated-contract");
    const script = `node -e "require('node:fs').writeFileSync(${JSON.stringify(
      marker
    )}, 'ran')"`;
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "capsule-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
        scripts: { check: script, test: script, build: script },
        devDependencies: {
          "openxiangda-contracts": currentContractsPackageVersion,
          "openxiangda-devkit-core": staleDevkitPackageVersion,
        },
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const deployment = {
      id: "deployment-capsule",
      status: "succeeded",
      stage: "completed",
      checkpoints: [],
      failure: null,
      rootFailure: null,
      latestFailure: null,
      candidate: {
        identity: null,
        state: "none",
        recoveryAction: null,
      },
      recovery: {
        mode: "none",
        retryable: false,
        replacementAllowed: false,
        cancelAllowed: false,
        action: null,
        expectedAttempt: 1,
        nextCommand: null,
      },
      attempts: [],
      result: {},
    };
    let capabilitiesCalled = false;
    const rollbackInputs: Record<string, unknown>[] = [];
    const services = new OpenXiangdaApplicationServices({
      client: {
        capabilities: async () => {
          capabilitiesCalled = true;
          throw new Error("CAPABILITIES_MUST_NOT_RUN");
        },
        deployment: async () => deployment,
        rollback: async input => {
          rollbackInputs.push(input);
          return deployment;
        },
      } as any,
    });

    const checked = await services.check(root);
    assert.equal(checked.ok, false);
    assert.deepEqual(checked.data?.stages, []);
    assert.equal(
      readFileSync(generated, "utf8"),
      "sentinel-generated-contract"
    );
    assert.equal(existsSync(marker), false);
    const capsule = checked.diagnostics.find(
      diagnostic => diagnostic.code === "OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH"
    );
    assert.equal(capsule?.details?.owner, "devkit-core");
    assert.equal(
      (
        capsule?.details?.mismatches as Array<{
          expected?: string;
          actual?: string;
        }>
      )?.some(
        mismatch =>
          mismatch.expected === currentDevkitPackageVersion &&
          mismatch.actual === staleDevkitPackageVersion
      ),
      true
    );

    for (const result of [
      await services.test(root),
      await services.build({ root, skipWorkspaceBuild: true }),
      await services.buildPreview(root),
      await services.dev(root, { noOpen: true }),
      await services.deploy({ root, environment: "preproduction" }),
    ]) {
      assert.equal(result.ok, false);
      assert.equal(
        result.diagnostics.some(
          diagnostic =>
            diagnostic.code === "OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH"
        ),
        true
      );
    }
    assert.equal(capabilitiesCalled, false);
    assert.equal(existsSync(marker), false);
    assert.equal(
      (await services.deploymentStatus(root, "deployment-capsule")).ok,
      true
    );
    assert.equal(
      (await services.deploymentLogs(root, "deployment-capsule")).ok,
      true
    );
    assert.equal(
      (
        await services.rollback(root, "preproduction", "version-capsule", {
          operationId: "11111111-1111-4111-8111-111111111111",
        })
      ).ok,
      true
    );
    assert.equal(
      rollbackInputs[0]?.idempotencyKey,
      "rollback:version-capsule:preproduction:11111111-1111-4111-8111-111111111111"
    );
    assert.equal(
      rollbackInputs[0]?.requestId,
      "11111111-1111-4111-8111-111111111111"
    );
    await assert.rejects(
      services.rollback(root, "preproduction", "version-capsule", {
        operationId: "not-a-uuid",
      }),
      /OPENXIANGDA_ROLLBACK_OPERATION_ID_INVALID/
    );
    await services.rollback(root, "preproduction", "version-capsule");
    await services.rollback(root, "preproduction", "version-capsule");
    assert.match(
      String(rollbackInputs[1]?.requestId),
      /^[0-9a-f-]{36}$/i
    );
    assert.notEqual(
      rollbackInputs[1]?.requestId,
      rollbackInputs[2]?.requestId
    );

    const packageJsonPath = join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    packageJson.devDependencies["openxiangda-devkit-core"] =
      currentDevkitPackageVersion;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    mkdirSync(join(root, "apps/extra"), { recursive: true });
    writeFileSync(
      join(root, "apps/extra/package.json"),
      JSON.stringify({
        name: "extra",
        dependencies: {
          "openxiangda-devkit-core": staleDevkitPackageVersion,
        },
      })
    );
    const split = await services.check(root);
    assert.equal(split.ok, false);
    const splitMismatches = split.diagnostics.find(
      diagnostic => diagnostic.code === "OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH"
    )?.details?.mismatches as Array<{ packageFile: string; actual: string }>;
    assert.deepEqual(
      splitMismatches.map(item => [item.packageFile, item.actual]),
      [
        ["apps/extra/package.json", staleDevkitPackageVersion],
        ["package.json", currentDevkitPackageVersion],
      ]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bounds workspace manifest scanning before parsing oversized files", () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-capsule-limit-"));
  try {
    mkdirSync(join(root, "nested"), { recursive: true });
    writeFileSync(
      join(root, "nested/package.json"),
      "{" + "x".repeat(TOOLCHAIN_CAPSULE_MAX_MANIFEST_BYTES) + "}"
    );
    assert.throws(
      () => collectWorkspaceToolchainDependencies(root),
      (error: unknown) =>
        error instanceof ToolchainCapsuleScanLimitError &&
        error.code === "OPENXIANGDA_WORKSPACE_CAPSULE_SCAN_LIMIT"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("creates deterministic workspace roots and compiles an AppPackage", () => {
  const appConfig = config();
  const context = createWorkspaceContext(appConfig, {
    root: "/workspace/reference-app",
    toolchainVersion: "2.0.0-alpha.1",
    nodeVersion: "22.18.0",
    packageManager: "pnpm@10.15.1",
    revision: "0123456789abcdef",
    dirty: false,
    changedDomains: ["frontend", "config"],
  });
  assert.deepEqual(context.roots, {
    frontend: "/workspace/reference-app/apps/web",
    backend: "/workspace/reference-app/apps/server",
    platform: "/workspace/reference-app/platform",
  });
  assert.equal(context.toolchain.packageName, "openxiangda-devkit-core");
  assert.equal(context.schemaVersion, SCHEMA_VERSIONS.workspaceContext);
  assert.equal(
    context.toolchain.studio!.schemaVersion,
    "openxiangda.studio-workspace/v2"
  );
  assert.deepEqual(
    context.toolchain.studio!.cliEvents.commands.map(command => command.id),
    ["create", "dev", "check", "deploy", "logs", "rollback"]
  );
  assert.deepEqual(context.toolchain.studio!.templates.supportedReferences, [
    "builtin:application",
    "file",
  ]);
  assert.deepEqual(context.toolchain.studio!.initialization, {
    schemaVersion: "openxiangda.studio-workspace-initialization/v1",
    bindingSchemaVersion: "openxiangda.studio-workspace-binding/v1",
    applicationAuthority: "site-project-provisioning-run",
    applicationKey: "appType",
    requiredCreateFlags: [
      "app-code",
      "name",
      "template-ref",
      "template-digest",
      "studio-project-id",
      "provisioning-run-id",
      "json-events",
      "run-id",
    ],
    repositoryAuthority: "site-git-broker",
  });

  const compiled = compileAppPackage({
    config: appConfig,
    version: "2.0.0-test.1",
    createdAt: "2026-08-10T00:00:00.000Z",
    source: {
      repository: "https://example.invalid/reference-app.git",
      commit: "0123456789abcdef",
      dirty: false,
    },
    toolchainVersion: "2.0.0-alpha.1",
    artifacts: [],
    manifests: {},
    minimumPlatformVersion: "2.0.0-alpha.1",
  });
  assert.equal(compiled.manifest.schemaVersion, SCHEMA_VERSIONS.appPackage);
  assert.equal(compiled.manifest.appCode, "reference-app");
  assert.match(compiled.digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    compiled.manifest.compatibility.requiredPlatformCapabilities.map(
      item => item.code
    ),
    [
    "application-native-2",
    "authz.native-batch-explain",
    "authz.native-management",
    "data-api-v2",
    "data.native-golden-crud",
    "deployment.durable-runs",
    "deployment.platform-executor",
    "environment.on-demand-production",
    "environment.runtime-lifecycle",
    ]
  );
  assert.equal(
    compiled.manifest.compatibility.requiredPlatformCapabilities.every(
      item =>
        item.contractVersion ===
          PLATFORM_CAPABILITY_CONTRACT_VERSIONS[item.code] &&
        /^sha256:[0-9a-f]{64}$/.test(item.usageDigest)
    ),
    true
  );
});

test("requires every derived platform capability to be available at the exact contract version", () => {
  const capabilities: PlatformCapabilities = {
    schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
    apiVersion: "v2",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    platformVersion: "2.0.0-test",
    features: {
      "application-native-2": availableCapability("application-native-2"),
      "data.native-golden-crud": availableCapability(
        "data.native-golden-crud"
      ),
    },
    configurationCompatibility: configurationCompatibility(),
    deployment: {
      executionOwner: "platform",
      durableRuns: true,
      clientCanCheckpoint: false,
      backendImageBuild: {
        owner: "developer-cli",
        available: true,
        repositoryPrefix: "registry.example.invalid/openxiangda",
        platform: "linux/amd64",
      },
    },
  };
  assert.doesNotThrow(() =>
    assertRequiredCapabilitiesAvailable(capabilities, [
      requiredCapability("application-native-2"),
      requiredCapability("data.native-golden-crud"),
    ])
  );
  assert.doesNotThrow(() =>
    assertApplicationContractCompatible(
      capabilities,
      CURRENT_APPLICATION_CONTRACT
    )
  );
  assert.throws(
    () =>
      assertApplicationContractCompatible(
        {
          ...capabilities,
          configurationCompatibility: configurationCompatibility([
              {
                ...CURRENT_APPLICATION_CONTRACT,
                configurationBundleSchemaVersion:
                  "openxiangda.config-bundle/v2",
              },
            ]),
        },
        CURRENT_APPLICATION_CONTRACT
      ),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code === "OPENXIANGDA_APPLICATION_CONTRACT_UNSUPPORTED"
  );
  const missingContractList = {
    ...capabilities,
    configurationCompatibility: undefined,
  } as unknown as PlatformCapabilities;
  assert.throws(
    () =>
      assertApplicationContractCompatible(
        missingContractList,
        CURRENT_APPLICATION_CONTRACT
      ),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code === "OPENXIANGDA_PLATFORM_CAPABILITIES_INVALID" &&
      Array.isArray((error.data as { paths?: unknown })?.paths) &&
      ((error.data as { paths: string[] }).paths.length <= 20)
  );
  assert.throws(
    () =>
      assertApplicationContractCompatible(
        {
          ...capabilities,
          features: {
            "application-native-2": {
              version: "2",
              status: "available",
            },
          },
        } as unknown as PlatformCapabilities,
        CURRENT_APPLICATION_CONTRACT
      ),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code === "OPENXIANGDA_PLATFORM_CAPABILITIES_INVALID"
  );
  for (const status of [undefined, "preview", "planned"] as const) {
    const fixture: PlatformCapabilities = {
      ...capabilities,
      features: {
        ...capabilities.features,
        ...(status
          ? {
              "data.native-golden-crud": {
                contractVersion:
                  PLATFORM_CAPABILITY_CONTRACT_VERSIONS[
                    "data.native-golden-crud"
                  ],
                status,
              },
            }
          : {}),
      },
    };
    if (!status) delete fixture.features["data.native-golden-crud"];
    assert.throws(
      () =>
        assertRequiredCapabilitiesAvailable(fixture, [
          requiredCapability("data.native-golden-crud"),
        ]),
      (error: unknown) =>
        error instanceof ControlPlaneError &&
        error.code === "OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE" &&
        typeof error.remote?.remediation === "string"
    );
  }
  assert.throws(
    () =>
      assertRequiredCapabilitiesAvailable(
        {
          ...capabilities,
          features: {
            ...capabilities.features,
            "data.native-golden-crud": {
              contractVersion: "0.0.0",
              status: "available",
            },
          },
        },
        [requiredCapability("data.native-golden-crud")]
      ),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code === "OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE" &&
      (error.data as any)?.unavailable?.[0]?.requiredContractVersion ===
        PLATFORM_CAPABILITY_CONTRACT_VERSIONS["data.native-golden-crud"] &&
      (error.data as any)?.unavailable?.[0]?.supportedContractVersion ===
        "0.0.0"
  );
});

test("rejects every direct deployment target except preproduction", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-prod-deploy-"));
  try {
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const result = await new OpenXiangdaApplicationServices({
      client: {
        createDeployment: () => {
          throw new Error("platform must not be contacted");
        },
      } as any,
    }).deploy({ root, environment: "production" as "preproduction" });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "DEPLOY_PREPRODUCTION_ONLY");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an incompatible application contract before build or upload side effects", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-contract-preflight-"));
  const remote = mkdtempSync(join(tmpdir(), "openxiangda-v2-contract-remote-"));
  const buildMarker = join(root, "workspace-build-ran");
  const uploadArtifact = test.mock.fn(async () => ({}));
  const createDeployment = test.mock.fn(async () => {
    throw new Error("deployment must not be created");
  });
  try {
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
        scripts: {
          check: `node -e "require('node:fs').writeFileSync(${JSON.stringify(
            buildMarker
          )}, 'ran')"`,
          test: "node -e \"process.exit(0)\"",
          build: `node -e "require('node:fs').writeFileSync(${JSON.stringify(
            buildMarker
          )}, 'ran')"`,
        },
        devDependencies: {
          "openxiangda-contracts": currentContractsPackageVersion,
          "openxiangda-devkit-core": currentDevkitPackageVersion,
        },
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
    const runGit = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
    runGit('init', '-b', 'main');
    runGit('config', 'user.name', 'OpenXiangda Test');
    runGit('config', 'user.email', 'test@example.invalid');
    runGit('add', '.'); runGit('commit', '-m', 'fixture');
    runGit('remote', 'add', 'origin', remote); runGit('push', '-u', 'origin', 'main');
    const capabilities: PlatformCapabilities = {
      schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
      apiVersion: "v2",
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
      platformVersion: "2.0.0-test",
      features: {},
      configurationCompatibility: configurationCompatibility([
        {
          ...CURRENT_APPLICATION_CONTRACT,
          contractBundleSchemaVersion: "openxiangda.contract-bundle/v2",
        },
      ]),
      deployment: {
        executionOwner: "platform",
        durableRuns: true,
        clientCanCheckpoint: false,
        backendImageBuild: {
          owner: "developer-cli",
          available: true,
          repositoryPrefix: "registry.example.invalid/openxiangda",
          platform: "linux/amd64",
        },
      },
    };
    const services = new OpenXiangdaApplicationServices({
      client: {
        capabilities: async () => capabilities,
        uploadArtifact,
        createDeployment,
      } as any,
    });
    await assert.rejects(
      () => services.deploy({ root, environment: "preproduction" }),
      (error: unknown) =>
        error instanceof ControlPlaneError &&
        error.code === "OPENXIANGDA_APPLICATION_CONTRACT_UNSUPPORTED"
    );
    assert.equal(existsSync(buildMarker), false);
    assert.equal(uploadArtifact.mock.callCount(), 0);
    assert.equal(createDeployment.mock.callCount(), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  }
});

test("runs target Native compatibility before workspace checks or builds", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-target-preflight-"));
  const stageMarker = join(root, "workspace-stage-ran");
  const validateConfigurationCompatibility = test.mock.fn(async () => {
    throw new ControlPlaneError(
      409,
      "NATIVE_PROPERTY_UNKNOWN",
      "NATIVE_PROPERTY_UNKNOWN",
      {
        pointer: "/config/data/resources/0/surface/detail/unknown",
        clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
        clientSchemaVersions: {
          appPackage: SCHEMA_VERSIONS.appPackage,
          configuration: SCHEMA_VERSIONS.configurationBundle,
          contract: SCHEMA_VERSIONS.contractBundle,
          compiler: "native-2",
        },
        platformVersion: "2.0.0-target",
        platformCapability: {
          code: "configuration.compatibility-preflight",
          version: "native-2",
          status: "available",
        },
        required: { ...CURRENT_APPLICATION_CONTRACT },
        supported: [{ ...CURRENT_APPLICATION_CONTRACT }],
      }
    );
  });
  try {
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
        scripts: Object.fromEntries(
          ["check", "test", "build"].map(name => [
            name,
            `node -e "require('node:fs').writeFileSync(${JSON.stringify(
              stageMarker
            )}, 'ran')"`,
          ])
        ),
        devDependencies: {
          "openxiangda-contracts": currentContractsPackageVersion,
          "openxiangda-devkit-core": currentDevkitPackageVersion,
        },
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const featureCodes: PlatformCapabilityCode[] = [
      "application-native-2",
      "authz.native-batch-explain",
      "authz.native-management",
      "data-api-v2",
      "data.native-golden-crud",
      "deployment.durable-runs",
      "deployment.platform-executor",
      "environment.on-demand-production",
      "environment.runtime-lifecycle",
    ];
    const capabilities: PlatformCapabilities = {
      schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
      apiVersion: "v2",
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
      platformVersion: "2.0.0-target",
      features: Object.fromEntries(
        featureCodes.map(code => [code, availableCapability(code)])
      ),
      configurationCompatibility: configurationCompatibility(),
      deployment: {
        executionOwner: "platform",
        durableRuns: true,
        clientCanCheckpoint: false,
        backendImageBuild: {
          owner: "developer-cli",
          available: true,
          repositoryPrefix: "registry.example.invalid/openxiangda",
          platform: "linux/amd64",
        },
      },
    };
    const result = await new OpenXiangdaApplicationServices({
      client: {
        capabilities: async () => capabilities,
        validateConfigurationCompatibility,
      } as any,
    }).check(root, "preproduction");

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "NATIVE_PROPERTY_UNKNOWN");
    assert.equal(
      result.diagnostics[0]?.path,
      "/config/data/resources/0/surface/detail/unknown"
    );
    assert.deepEqual(
      (result.diagnostics[0]?.details as any)?.platformCapability,
      {
        code: "configuration.compatibility-preflight",
        version: "native-2",
        status: "available",
      }
    );
    assert.deepEqual((result.data as any)?.stages, []);
    assert.equal(existsSync(stageMarker), false);
    assert.equal(validateConfigurationCompatibility.mock.callCount(), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects local and retired environment keys before a remote operation", () => {
  const services = new OpenXiangdaApplicationServices();
  assert.throws(
    () => (services as any).deploymentEnvironment("local"),
    /OPENXIANGDA_REMOTE_ENVIRONMENT_INVALID: local/
  );
  assert.throws(
    () => (services as any).deploymentEnvironment("development"),
    /OPENXIANGDA_REMOTE_ENVIRONMENT_INVALID: development/
  );
  assert.equal(
    (services as any).deploymentEnvironment("preproduction"),
    "preproduction"
  );
  assert.equal(
    (services as any).deploymentEnvironment("production"),
    "production"
  );
});

test("promotes to production only after verifying the exact preproduction version in the remote default branch", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-prod-promote-"));
  const remote = mkdtempSync(join(tmpdir(), "openxiangda-v2-prod-remote-"));
  const gitCommand = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  try {
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    writeDevelopmentFixture(root, "reference-app");
    gitCommand(remote, "init", "--bare", "-b", "master");
    gitCommand(root, "init", "-b", "master");
    gitCommand(root, "config", "user.name", "OpenXiangda Test");
    gitCommand(root, "config", "user.email", "test@openxiangda.invalid");
    gitCommand(root, "add", ".");
    gitCommand(root, "commit", "-m", "test fixture");
    gitCommand(root, "remote", "add", "origin", remote);
    gitCommand(root, "push", "-u", "origin", "master");
    let commit = gitCommand(root, "rev-parse", "HEAD");
    const promoted: unknown[] = [];
    const source = {
      id: "preproduction-run-1",
      appCode: "reference-app",
      environment: { kind: "preproduction" },
      kind: "deploy",
      packageDigest: "a".repeat(64),
      idempotencyKey: "preproduction-1",
      status: "succeeded",
      stage: "succeeded",
      attempt: 1,
      progress: {},
      checkpoints: [],
      result: { applicationVersionId: "version-1" },
      requestedBy: "user-1",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:01:00.000Z",
    };
    writeVerificationFixture(root, source);
    gitCommand(root, "add", "."); gitCommand(root, "commit", "-m", "record protocol acceptance"); gitCommand(root, "push", "origin", "master");
    const services = new OpenXiangdaApplicationServices({
      client: {
        deployment: async () => source,
        appVersions: async () => { throw new Error('晋级不能依赖最近版本列表'); },
        capabilities: async () => platformCapabilitiesFixture(),
        productionPromotionPreflight: async () => ({
          schemaVersion: SCHEMA_VERSIONS.promotionPreflight,
          appCode: 'reference-app', sourceDeploymentId: source.id, appVersionId: 'version-1',
          packageDigest: source.packageDigest, environmentKey: 'production',
          source: { repository: remote, commit, dirty: false },
          validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST, projectionDigest: 'b'.repeat(64),
        }),
        promote: async (input: unknown) => {
          promoted.push(input);
          return { ...source, id: "production-run-1", kind: "promotion" };
        },
      } as any,
    });

    const valid = await services.deployProduction(root, source.id);
    assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics));
    assert.equal(promoted.length, 1);

    const later = configDeclaration();
    later.app.name = 'Later mainline requirements';
    writeFileSync(join(root, 'openxiangda.config.ts'), `export default ${JSON.stringify(later)};\n`);
    gitCommand(root, 'add', '.'); gitCommand(root, 'commit', '-m', 'later requirements'); gitCommand(root, 'push', 'origin', 'master');
    const acceptancePath = join(root, `appspec/verification/${source.id}.json`);
    const originalAcceptance = JSON.parse(readFileSync(acceptancePath, 'utf8'));
    writeFileSync(acceptancePath, JSON.stringify({
      ...originalAcceptance,
      performance: [...originalAcceptance.performance, { ...originalAcceptance.performance[0], targetMs: 3000, observedMs: 5765 }],
      performanceDeferral: {
        status: 'deferred', reason: '协议夹具明确将性能验收移交独立任务，保留原失败。',
        followUp: '后续由协议夹具中的维护者执行性能修复和验收。',
        authorizedBy: '协议测试用户（非真实授权）', authorizedAt: '2026-09-06T07:00:00Z',
        authorizationSource: 'SRC-TEST-001', evidence: ['appspec/verification/protocol-fixture.txt'],
      },
    }));
    gitCommand(root, 'add', '.'); gitCommand(root, 'commit', '-m', 'record explicit performance deferral'); gitCommand(root, 'push', 'origin', 'master');
    const historical = await withOperationProgress('deploy', undefined, () => services.deployProduction(root, source.id));
    assert.equal(historical.ok, true, JSON.stringify(historical.diagnostics));
    assert.equal((promoted[1] as any).appVersionId, 'version-1');
    const acceptanceStage = (historical.data as any).execution.stages.find((stage: any) => stage.stage === 'business-acceptance');
    assert.equal(acceptanceStage.details.performance.status, 'deferred');
    assert.equal(acceptanceStage.details.performance.overBudget, 1);
    assert.equal(acceptanceStage.details.packageDigest, source.packageDigest);
    assert.match(acceptanceStage.label, /延期（未通过）/);

    writeFileSync(join(root, "uncommitted.txt"), "dirty");
    const dirty = await services.deployProduction(root, source.id);
    assert.equal(dirty.ok, false);
    assert.equal(dirty.diagnostics[0]?.code, "PRODUCTION_SOURCE_DIRTY");
    assert.equal(promoted.length, 2);

    rmSync(join(root, 'uncommitted.txt'));
    const reviewPath = join(root, 'appspec/reviews/initial.md');
    const validReview = readFileSync(reviewPath, 'utf8');
    writeFileSync(reviewPath, validReview.replace(/baselineDigest: .+/, `baselineDigest: ${'0'.repeat(64)}`));
    gitCommand(root, 'add', '.'); gitCommand(root, 'commit', '-m', 'invalid tested design fixture');
    commit = gitCommand(root, 'rev-parse', 'HEAD');
    writeFileSync(reviewPath, validReview);
    gitCommand(root, 'add', '.'); gitCommand(root, 'commit', '-m', 'later valid review cannot approve prior source'); gitCommand(root, 'push', 'origin', 'master');
    const invalidSourceDesign = await services.deployProduction(root, source.id);
    assert.equal(invalidSourceDesign.ok, false);
    assert.ok(invalidSourceDesign.diagnostics.some(item => item.code === 'APPSPEC_DESIGN_BASELINE_STALE'));
    assert.equal(promoted.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  }
});

test("sends an optional Perspective on current-user Data API reads", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: SCHEMA_VERSIONS.dataPage,
        resourceCode: "instruments",
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
    },
  });
  await client.queryData(
    "reference-app",
    "instruments",
    {
      schemaVersion: SCHEMA_VERSIONS.dataQuery,
      limit: 20,
    },
    { perspectiveCode: "instrument-manager" }
  );
  assert.equal(
    new Headers(requests[0]?.init?.headers).get(
      "X-OpenXiangda-Perspective"
    ),
    "instrument-manager"
  );
  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/data/instruments/query"
  );
  await client.queryData(
    "reference-app",
    "instruments",
    { schemaVersion: SCHEMA_VERSIONS.dataQuery },
    {}
  );
  assert.equal(
    new Headers(requests[1]?.init?.headers).get(
      "X-OpenXiangda-Perspective"
    ),
    null
  );
});

test("calls an application backend through the platform identity gateway", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example/",
    credentials: "include",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({ created: true, id: "reservation-1" }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
  });

  const result = await client.applicationApiJson<
    { created: boolean; id: string },
    { instrumentId: string }
  >("reference-app", "preproduction", "/instruments/reserve", {
    method: "POST",
    query: { notify: true },
    body: { instrumentId: "instrument-1" },
    perspectiveCode: "instrument-manager",
  });

  assert.deepEqual(result, { created: true, id: "reservation-1" });
  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-app-api/v2/reference-app/preproduction/instruments/reserve?notify=true"
  );
  assert.equal(requests[0]?.init?.credentials, "include");
  assert.equal(
    new Headers(requests[0]?.init?.headers).get(
      "X-OpenXiangda-Perspective"
    ),
    "instrument-manager"
  );
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    instrumentId: "instrument-1",
  });
  await assert.rejects(
    () =>
      client.applicationApiJson(
        "reference-app",
        "preproduction",
        "../secrets",
        { perspectiveCode: "instrument-manager" }
      ),
    ControlPlaneError
  );
});

test("manages Native memberships and relationship grants through the authorization kernel API", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      if (String(input).includes("/projections/health")) {
        return response({
          schemaVersion: SCHEMA_VERSIONS.nativeAuthorizationProjectionHealth,
          ready: true,
          environmentId: "environment-1",
          authzRevisionId: "authz-1",
          activeAuthzRevisionId: "authz-1",
          sourceCount: 0,
          sources: [],
        });
      }
      if (String(input).includes("/projections/")) {
        return response({ environmentId: "environment-1", jobIds: ["job-1"] });
      }
      return response(
        String(input).includes("relationship-grants")
          ? { grant: { id: "grant-1" } }
          : init?.method === "POST"
            ? { membership: { id: "membership-1" }, roleSubjectSetVersion: "2" }
            : {
                schemaVersion: SCHEMA_VERSIONS.nativeRoleMembershipPage,
                items: [],
                total: 0,
                limit: 20,
                offset: 0,
              }
      );
    },
  });

  await client.nativeRoleMemberships(
    "reference-app",
    {
      environmentKey: "preproduction",
      roleCode: "college_admin",
      status: "active",
      limit: 20,
      offset: 0,
    }
  );
  await client.createNativeRoleMembership(
    "reference-app",
    {
      environmentKey: "preproduction",
      operationId: "22222222-2222-4222-8222-222222222222",
      userId: "user-2",
      roleCode: "college_admin",
      reason: "assign college administrator",
      scopeGrants: [
        {
          dimensionCode: "college",
          values: ["college-1"],
          operations: ["*"],
        },
      ],
    }
  );
  await client.createNativeRelationshipGrant(
    "reference-app",
    {
      environmentKey: "preproduction",
      operationId: "44444444-4444-4444-8444-444444444444",
      subjectType: "role_membership",
      subjectKey: "membership-1",
      relationCode: "instrument_manager",
      resourceCode: "instrument",
      resourceId: "instrument-1",
      operations: ["*"],
      sourceCode: "reference-seed",
    }
  );
  await client.nativeAuthorizationProjectionHealth(
    "reference-app",
    "preproduction"
  );
  await client.rebuildNativeAuthorizationProjections("reference-app", {
    environmentKey: "preproduction",
    operationId: "55555555-5555-4555-8555-555555555555",
  });
  await client.recoverNativeAuthorizationProjection(
    "reference-app",
    "66666666-6666-4666-8666-666666666666",
    {
      environmentKey: "preproduction",
      operationId: "77777777-7777-4777-8777-777777777777",
    }
  );

  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/memberships?environmentKey=preproduction&roleCode=college_admin&status=active&limit=20&offset=0"
  );
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    environmentKey: "preproduction",
    operationId: "22222222-2222-4222-8222-222222222222",
    userId: "user-2",
    roleCode: "college_admin",
    reason: "assign college administrator",
    scopeGrants: [
      {
        dimensionCode: "college",
        values: ["college-1"],
        operations: ["*"],
      },
    ],
  });
  assert.equal(
    requests[2]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/relationship-grants"
  );
  assert.equal(
    requests[3]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/projections/health?environmentKey=preproduction"
  );
  assert.deepEqual(JSON.parse(String(requests[4]?.init?.body)), {
    environmentKey: "preproduction",
    operationId: "55555555-5555-4555-8555-555555555555",
  });
  assert.equal(
    requests[5]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/projections/jobs/66666666-6666-4666-8666-666666666666/recover"
  );
});

test("manages bounded role-management grants through the Native API", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response(
        init?.method === "POST"
          ? { grant: { id: "grant-1" } }
          : String(input).includes("mutation-receipts")
            ? { operationId: "operation-1" }
            : {
                schemaVersion: SCHEMA_VERSIONS.nativeRoleManagementGrantPage,
                items: [],
                total: 0,
                limit: 20,
                offset: 0,
              }
      );
    },
  });

  await client.nativeRoleManagementGrants("reference-app", {
    environmentKey: "preproduction",
    subjectRoleCode: "business_manager",
    limit: 20,
    offset: 0,
  });
  await client.createNativeRoleManagementGrant("reference-app", {
    environmentKey: "preproduction",
    operationId: "88888888-8888-4888-8888-888888888888",
    reason: "delegate venue operator management",
    subjectRoleCode: "business_manager",
    manageAllRoles: false,
    managedRoleCodes: ["venue_operator"],
    actions: ["membership.read", "membership.assign", "management.delegate"],
  });
  await client.nativeAuthorizationMutationReceipt(
    "reference-app",
    "88888888-8888-4888-8888-888888888888"
  );

  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/role-management-grants?environmentKey=preproduction&subjectRoleCode=business_manager&limit=20&offset=0"
  );
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    environmentKey: "preproduction",
    operationId: "88888888-8888-4888-8888-888888888888",
    reason: "delegate venue operator management",
    subjectRoleCode: "business_manager",
    manageAllRoles: false,
    managedRoleCodes: ["venue_operator"],
    actions: ["membership.read", "membership.assign", "management.delegate"],
  });
  assert.equal(
    requests[2]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/mutation-receipts/88888888-8888-4888-8888-888888888888"
  );
});

test("loads Native authorization catalog role applicability", async () => {
  const requests: string[] = [];
  const catalog: NativeAuthorizationManagementCatalog = {
    schemaVersion: SCHEMA_VERSIONS.nativeAuthorizationManagementCatalog,
    environment: {
      id: "environment-1",
      key: "preproduction",
      activeAppVersionId: "version-1",
      headRevision: 4,
      dataLogicalRevisionId: "data-4",
      authzRevisionId: "authz-4",
      authzVersion: 2,
      scopeDataVersion: "scope-4",
    },
    roles: [
      {
        code: "college_admin",
        name: "学院管理员",
        description: null,
        capabilityCodes: ["app:reference-app:role:assign"],
        source: "package",
      },
    ],
    roleManagement: {
      unrestricted: true,
      wildcardActions: [
        "membership.read",
        "membership.assign",
        "membership.update",
        "membership.revoke",
        "management.delegate",
      ],
      roles: [
        {
          roleCode: "college_admin",
          actions: [
            "membership.read",
            "membership.assign",
            "membership.update",
            "membership.revoke",
            "management.delegate",
          ],
        },
      ],
    },
    scopeDimensions: [
      {
        code: "college",
        name: "学院",
        resourceCode: "colleges",
        valueType: "uuid",
        hierarchyMode: "flat",
        valueSource: { kind: "native_resource", resourceCode: "colleges" },
        applicability: {
          dimensionCode: "college",
          allRoles: false,
          roleCodes: ["college_admin"],
          unrestrictedRoleCodes: ["school_admin"],
          rules: [
            {
              policyCode: "instrument-policy",
              allRoles: false,
              roleCodes: ["college_admin"],
              unrestrictedRoleCodes: ["school_admin"],
            },
          ],
        },
      },
    ],
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async input => {
      requests.push(String(input));
      return response(catalog);
    },
  });

  const loaded = await client.nativeAuthorizationCatalog("reference-app", {
    environmentKey: "preproduction",
  });

  assert.equal(
    requests[0],
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/catalog?environmentKey=preproduction"
  );
  assert.deepEqual(
    loaded.scopeDimensions[0]?.applicability,
    catalog.scopeDimensions[0]?.applicability
  );
});

test("sends Native super-admin environment context", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: "native-super-admin-grant-page-v2",
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
    },
  });

  await client.nativeSuperAdmins("reference-app", {
    environmentKey: "production",
  });
  await client.grantNativeSuperAdmin("reference-app", {
    environmentKey: "production",
    operationId: "55555555-5555-4555-8555-555555555555",
    userId: "user-2",
  });
  await client.revokeNativeSuperAdmin(
    "reference-app",
    "grant-1",
    {
      environmentKey: "production",
      operationId: "66666666-6666-4666-8666-666666666666",
      expectedRevision: 2,
    }
  );

  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/authz/management/super-admins?environmentKey=production"
  );
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    environmentKey: "production",
    operationId: "55555555-5555-4555-8555-555555555555",
    userId: "user-2",
  });
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    environmentKey: "production",
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedRevision: 2,
  });
});

test("searches and resolves the current-user application directory", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: SCHEMA_VERSIONS.directorySearchResult,
        kind: String(input).includes("/users") ? "user" : "department",
        items: [],
        total: 0,
      });
    },
  });

  await client.searchDirectoryEntries(
    "reference-app",
    "department",
    { keyword: "理学院", limit: 10 }
  );
  await client.browseDepartmentEntries(
    "reference-app",
    { parentId: "department-root", limit: 50 }
  );
  await client.browseDepartmentUserEntries(
    "reference-app",
    { departmentId: "department-science", page: 2, limit: 25 }
  );
  await client.resolveDirectoryEntries(
    "reference-app",
    {
      schemaVersion: SCHEMA_VERSIONS.directoryResolveRequest,
      kind: "user",
      ids: ["user-1"],
    }
  );

  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/directory/departments?keyword=%E7%90%86%E5%AD%A6%E9%99%A2&limit=10"
  );
  assert.equal(
    requests[1]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/directory/departments/tree?offset=0&limit=50&parentId=department-root"
  );
  assert.equal(
    requests[2]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/directory/departments/department-science/users?page=2&limit=25"
  );
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), {
    schemaVersion: SCHEMA_VERSIONS.directoryResolveRequest,
    kind: "user",
    ids: ["user-1"],
  });
});

test("declares and manages application events without external targets", async () => {
  const configured = defineOpenXiangdaApp({
    ...configDeclaration(),
    events: {
      schemas: [
        {
          eventType: "reference-app.timer.daily-summary.v1",
          dataSchemaVersion: "1.0.0",
          jsonSchema: { type: "object", additionalProperties: false },
        },
      ],
      subscriptions: [
        {
          code: "instrument-events",
          eventTypes: ["openxiangda.data.record.created.v2"],
          filter: { resourceCodes: ["instruments"] },
          payload: { includeChanges: true, fields: ["name"] },
        },
      ],
      timers: [
        {
          code: "daily-summary-timer",
          eventType: "reference-app.timer.daily-summary.v1",
          cronExpression: "0 0 8 * * *",
          timezone: "Asia/Shanghai",
          payload: {},
          misfirePolicy: "coalesce_one",
        },
      ],
    },
  });
  const compiled = compileAppPackage({
    config: configured,
    version: "2.0.0-test.1",
    source: {
      repository: "https://example.invalid/reference-app.git",
      commit: "0123456789abcdef",
      dirty: false,
    },
    toolchainVersion: "2.0.0-alpha.1",
    artifacts: [],
    manifests: {},
    minimumPlatformVersion: "2.0.0-alpha.1",
  });
  assert.ok(
    compiled.manifest.compatibility.requiredPlatformCapabilities.some(
      item => item.code === "events-v2"
    )
  );
  assert.ok(
    compiled.manifest.compatibility.requiredPlatformCapabilities.some(
      item => item.code === "events.durable-receipts"
    )
  );

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/timers")) {
        return response({ items: [{
          schemaVersion: SCHEMA_VERSIONS.timerSubscription,
          id: "timer-1",
          appCode: "reference-app",
          code: "daily-summary-timer",
          eventType: "reference-app.timer.daily-summary.v1",
          cronExpression: "0 0 8 * * *",
          timezone: "Asia/Shanghai",
          payload: {},
          misfirePolicy: "coalesce_one",
          environmentKey: "production",
          status: "active",
          revision: 1,
          nextDueAt: "2026-08-12T00:00:00.000Z",
          lastFiredAt: null,
          createdAt: "2026-08-11T00:00:00.000Z",
          updatedAt: "2026-08-11T00:00:00.000Z",
        }] });
      }
      if (url.includes("/timers/") && url.endsWith("/status")) {
        return response({
          schemaVersion: SCHEMA_VERSIONS.timerSubscription,
          id: "timer-1",
          appCode: "reference-app",
          code: "daily-summary-timer",
          eventType: "reference-app.timer.daily-summary.v1",
          cronExpression: "0 0 8 * * *",
          timezone: "Asia/Shanghai",
          payload: {},
          misfirePolicy: "coalesce_one",
          environmentKey: "production",
          status: "paused",
          revision: 2,
          nextDueAt: "2026-08-12T00:00:00.000Z",
          lastFiredAt: null,
          createdAt: "2026-08-11T00:00:00.000Z",
          updatedAt: "2026-08-11T00:01:00.000Z",
        });
      }
      const subscription = {
        schemaVersion: SCHEMA_VERSIONS.eventSubscription,
        id: "subscription-1",
        appCode: "reference-app",
        code: "instrument-events",
        description: null,
        eventTypes: ["openxiangda.data.record.created.v2"],
        filter: { resourceCodes: ["instruments"] },
        payload: { includeChanges: true, fields: ["name"] },
        environmentKey: "production",
        endpointPath: "/__platform/events/instrument-events",
        delivery: {
          timeoutMs: 10000,
          maxAttempts: 8,
          initialBackoffMs: 1000,
          maxBackoffMs: 300000,
          ordering: "none",
          concurrency: 10,
        },
        status: "active",
        revision: 1,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      };
      return response(url.endsWith("/subscriptions") ? { items: [subscription] } : subscription);
    },
  });
  const subscription = (await client.eventSubscriptions("reference-app")).items[0]!;
  const timer = (await client.timerSubscriptions("reference-app")).items[0]!;
  await client.setTimerSubscriptionStatus("reference-app", timer.id, {
    expectedRevision: timer.revision,
    status: "paused",
  });
  await client.setEventSubscriptionStatus("reference-app", subscription.id, {
    expectedRevision: subscription.revision,
    status: "paused",
  });
  assert.equal(timer.code, "daily-summary-timer");
  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/events/subscriptions"
  );
  assert.equal(
    requests[1]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/events/timers"
  );
  assert.equal(
    requests[2]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/events/timers/timer-1/status"
  );
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    expectedRevision: 1,
    status: "paused",
  });
  assert.equal(
    requests[3]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/events/subscriptions/subscription-1/status"
  );
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), {
    expectedRevision: 1,
    status: "paused",
  });

  assert.throws(
    () =>
      defineOpenXiangdaApp({
        ...configDeclaration(),
        events: {
          subscriptions: [
            {
              code: "unsafe-events",
              eventTypes: ["openxiangda.data.record.created.v2"],
              endpointPath: "https://external.example/events",
            },
          ],
        },
      }),
    AppConfigValidationError
  );
});

test("compiles Workflow v2 declarations and sends current-user commands", async () => {
  const workflow = {
    schemaVersion: SCHEMA_VERSIONS.workflowDefinition,
    code: "reservation-approval",
    title: "预约审批",
    acceptedCommandDeactivationPolicy: "finish-pinned" as const,
    subject: {
      resourceCode: "instruments",
      factProjection: { instrumentName: "name" },
    },
    startAt: "college-review",
    inputSchema: { type: "object", additionalProperties: false },
    nodes: {
      "college-review": {
        id: "college-review",
        kind: "approval" as const,
        title: "学院审批",
        binding: "collegeReviewer",
        mode: "single" as const,
        onApprove: "approved",
        onReject: "rejected",
      },
      approved: {
        id: "approved",
        kind: "end" as const,
        title: "通过",
        outcome: "approved",
      },
      rejected: {
        id: "rejected",
        kind: "end" as const,
        title: "拒绝",
        outcome: "rejected",
      },
    },
  };
  const binding = {
    schemaVersion: SCHEMA_VERSIONS.workflowBinding,
    workflowCode: workflow.code,
    bindings: {
      collegeReviewer: {
        provider: "app_role_in_scope" as const,
        roleCode: "college_admin",
        scope: { dimension: "college", valueFrom: "collegeId" },
      },
    },
  };
  const configured = defineOpenXiangdaApp({
    ...configDeclaration(),
    workflows: {
      definitions: [{ version: 1, definition: workflow }],
      bindings: [{ version: 1, binding }],
      activations: [
        {
          workflowCode: workflow.code,
          definitionVersion: 1,
          bindingVersion: 1,
          acceptedCommandDeactivationPolicy: "finish-pinned",
        },
      ],
    },
  });
  const compiled = compileAppPackage({
    config: configured,
    version: "2.0.0-test.1",
    source: {
      repository: "https://example.invalid/reference-app.git",
      commit: "0123456789abcdef",
      dirty: false,
    },
    toolchainVersion: "2.0.0-alpha.1",
    artifacts: [],
    manifests: {},
    minimumPlatformVersion: "2.0.0-alpha.1",
  });
  assert.ok(
    compiled.manifest.compatibility.requiredPlatformCapabilities.some(
      item => item.code === "workflow-kernel-v2"
    )
  );
  assert.deepEqual(
    compileApplicationSources(configured).config.value.workflows.activations,
    [
      {
        workflowCode: workflow.code,
        definitionVersion: 1,
        bindingVersion: 1,
        acceptedCommandDeactivationPolicy: "finish-pinned",
      },
    ]
  );
  const withoutActivation = defineOpenXiangdaApp({
    ...configDeclaration(),
    workflows: {
      definitions: [{ version: 1, definition: workflow }],
      bindings: [{ version: 1, binding }],
      activations: [],
    },
  });
  assert.deepEqual(
    compileApplicationSources(withoutActivation).config.value.workflows
      .activations,
    []
  );
  assert.equal(
    validateAppConfig({
      ...configured,
      workflows: {
        ...configured.workflows!,
        activations: [
          configured.workflows!.activations[0]!,
          configured.workflows!.activations[0]!,
        ],
      },
    }).some(
      item => item.code === "APP_CONFIG_WORKFLOW_ACTIVATION_DUPLICATE"
    ),
    true
  );

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        taskId: "task-1",
        instanceId: "instance-1",
        status: "running",
      });
    },
  });
  await client.executeWorkflowTaskCommand(
    "reference-app",
    "task-1",
    "approve",
    {
      commandToken: "A".repeat(43),
      idempotencyKey: "approve-task-1",
      input: { comment: "同意" },
      csrfToken: "csrf-1",
    }
  );
  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/workflow/tasks/task-1/commands/approve"
  );
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    commandToken: "A".repeat(43),
    idempotencyKey: "approve-task-1",
    input: { comment: "同意" },
  });
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("x-openxiangda-csrf-token"),
    "csrf-1"
  );
  await client.createWorkflowDelegation(
    "reference-app",
    {
      environmentKey: "preproduction",
      workflowCode: "reservation-approval",
      delegatorRoleSubjectKey:
        "membership:00000000-0000-4000-8000-000000000001",
      delegateUserId: "user-b",
      delegateRoleSubjectKey: "membership:00000000-0000-4000-8000-000000000002",
      validFrom: "2026-08-11T00:00:00.000Z",
      validTo: "2026-08-12T00:00:00.000Z",
      reason: "出差代理",
    }
  );
  assert.equal(
    requests[1]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/workflow/delegations"
  );
  await client.applyWorkflowAssigneeProvider("reference-app", {
    environmentKey: "production",
    code: "special-lab-reviewers",
    endpointPath:
      "/openxiangda/workflow/assignee-providers/special-lab-reviewers",
    timeoutMs: 3000,
  });
  assert.equal(
    requests[2]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/workflow/assignee-providers"
  );

  await client.workflowInstanceSurface(
    "reference-app",
    "instance-1",
    "csrf-1"
  );
  await client.workflowTimeline("reference-app", "instance-1");
  await client.workflowDiagnostics("reference-app", 25);
  assert.equal(
    requests[3]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/workflow/instances/instance-1/surface"
  );
  assert.equal(
    requests[4]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/workflow/instances/instance-1/timeline"
  );
  assert.equal(
    requests[5]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/workflow/diagnostics?limit=25"
  );
});

test("manages role-bound relationship grants through the v2 authz API", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const grant = {
    schemaVersion: SCHEMA_VERSIONS.relationshipGrant,
    id: "grant-1",
    tenantId: "tenant-1",
    appCode: "reference-app",
    relationCode: "instrument_manager",
    subjectType: "role_assignment" as const,
    subjectKey: "assignment-instrument",
    resourceCode: "instrument",
    resourceId: "instrument-1",
    operations: ["query"],
    sourceCode: "manual",
    status: "active" as const,
    revision: 1,
    validFrom: null,
    validTo: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response(
        String(init?.method || "GET") === "POST"
          ? grant
          : {
              items: [grant],
              total: 1,
            }
      );
    },
  });

  const listed = await client.relationshipGrants("reference-app", {
    relationCode: "instrument_manager",
    subjectType: "role_assignment",
  });
  assert.equal(listed.total, 1);
  assert.match(requests[0]!.url, /relationCode=instrument_manager/);
  assert.match(requests[0]!.url, /subjectType=role_assignment/);

  const created = await client.createRelationshipGrant("reference-app", {
    subjectType: "role_assignment",
    subjectKey: "assignment-instrument",
    relationCode: "instrument_manager",
    resourceCode: "instrument",
    resourceId: "instrument-1",
    operations: ["query"],
  });
  assert.equal(created.id, "grant-1");
  assert.equal(requests[1]!.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[1]!.init?.body)), {
    subjectType: "role_assignment",
    subjectKey: "assignment-instrument",
    relationCode: "instrument_manager",
    resourceCode: "instrument",
    resourceId: "instrument-1",
    operations: ["query"],
  });
});

test("lists roles and manages operational role assignments through v2 authz", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const role = {
    id: "role-applicant",
    appCode: "reference-app",
    code: "applicant",
    name: "Applicant",
    isAppSuperAdmin: false,
  };
  const assignment = {
    schemaVersion: SCHEMA_VERSIONS.roleAssignment,
    id: "assignment-applicant",
    tenantId: "tenant-1",
    appCode: "reference-app",
    userId: "user-1",
    role,
    status: "active" as const,
    revision: 1,
    scopeGrants: [],
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response(
        String(input).endsWith("/roles")
          ? { items: [role], total: 1 }
          : assignment
      );
    },
  });

  assert.equal(
    (await client.applicationRoles("reference-app")).items[0]?.code,
    "applicant"
  );
  await client.createRoleAssignment("reference-app", {
    userId: "user-1",
    roleId: role.id,
    scopeGrants: [
      { dimensionCode: "college", values: ["college-1"], operations: ["*"] },
    ],
  });
  await client.updateRoleAssignment("reference-app", assignment.id, {
    expectedRevision: 1,
    scopeGrants: [],
  });
  await client.revokeRoleAssignment("reference-app", assignment.id, 2);

  assert.equal(requests[0]?.url.endsWith("/authz/roles"), true);
  assert.equal(requests[1]?.url.endsWith("/authz/assignments"), true);
  assert.equal(
    requests[2]?.url.endsWith("/authz/assignments/assignment-applicant/update"),
    true
  );
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), {
    expectedRevision: 2,
  });
});

test("negotiates capabilities and creates a package-level deployment", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const capabilities: PlatformCapabilities = {
    schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
    apiVersion: "v2",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    platformVersion: "2.0.0-alpha.1",
    features: {},
    configurationCompatibility: configurationCompatibility(),
    deployment: {
      executionOwner: "platform",
      durableRuns: true,
      clientCanCheckpoint: false,
      backendImageBuild: {
        owner: "developer-cli",
        available: true,
        repositoryPrefix: "registry.example.invalid/openxiangda",
        platform: "linux/amd64",
      },
    },
  };
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/capabilities")) return response(capabilities);
    return response({
      schemaVersion: SCHEMA_VERSIONS.deploymentRun,
      id: "deployment-1",
      appCode: "reference-app",
      environment: {},
      kind: "deploy",
      packageDigest: "a".repeat(64),
      idempotencyKey: "reference-app:test.1",
      status: "queued",
      stage: "queued",
      attempt: 1,
      progress: {},
      checkpoints: [],
      result: {},
      requestedBy: "user-1",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example/",
    token: "test-token",
    fetch,
  });
  assert.equal((await client.capabilities()).apiVersion, "v2");

  const appPackage = compileAppPackage({
    config: config(),
    version: "2.0.0-test.1",
    createdAt: "2026-08-10T00:00:00.000Z",
    source: {
      repository: "https://example.invalid/reference-app.git",
      commit: "0123456789abcdef",
      dirty: false,
    },
    toolchainVersion: "2.0.0-alpha.1",
    artifacts: [],
    manifests: {},
    minimumPlatformVersion: "2.0.0-alpha.1",
  });
  const deployment = await client.createDeployment({
    appCode: "reference-app",
    packageDigest: appPackage.digest,
    package: appPackage.manifest,
    idempotencyKey: "reference-app:test.1",
  });
  assert.equal(deployment.status, "queued");
  assert.equal(
    requests[1]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/deployments"
  );
  assert.equal(
    new Headers(requests[1]?.init?.headers).get("Authorization"),
    "Bearer test-token"
  );
});

test("submits digest-bound generated artifacts to the advertised compatibility endpoint", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const capabilities: PlatformCapabilities = {
    schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
    apiVersion: "v2",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    platformVersion: "2.0.0-target",
    features: {},
    configurationCompatibility: configurationCompatibility(),
    deployment: {
      executionOwner: "platform",
      durableRuns: true,
      clientCanCheckpoint: false,
      backendImageBuild: {
        owner: "developer-cli",
        available: true,
        repositoryPrefix: "registry.example.invalid/openxiangda",
        platform: "linux/amd64",
      },
    },
  };
  const source = {
    configurationDigest: "a".repeat(64),
    contractDigest: "b".repeat(64),
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    token: "test-token",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: SCHEMA_VERSIONS.configurationValidationResult,
        compatible: true,
        environmentKey: "preproduction",
        clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
        platformVersion: capabilities.platformVersion,
        capability: capabilities.configurationCompatibility.capability,
        required: { ...CURRENT_APPLICATION_CONTRACT },
        supported: [{ ...CURRENT_APPLICATION_CONTRACT }],
        source,
        projectionDigest: "c".repeat(64),
        requiredPlatformCapabilities: [
          requiredCapability("application-native-2"),
        ],
        counts: {
          resources: 43,
          perspectives: 1,
          capabilities: 172,
          eventProducers: 161,
          workflowDefinitions: 1,
        },
      });
    },
  });

  const input = {
    schemaVersion: SCHEMA_VERSIONS.configurationValidationRequest,
    environmentKey: "preproduction",
    clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
    required: { ...CURRENT_APPLICATION_CONTRACT },
    configuration: {
      schemaVersion: SCHEMA_VERSIONS.configurationBundle,
      digest: source.configurationDigest,
      canonical: "{}",
    },
    contract: {
      schemaVersion: SCHEMA_VERSIONS.contractBundle,
      digest: source.contractDigest,
      canonical: "{}",
    },
  } as any;
  const result = await client.validateConfigurationCompatibility(
    "reference-app",
    capabilities,
    input
  );

  assert.equal(result.counts.eventProducers, 161);
  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/configuration-compatibility"
  );
  assert.deepEqual(
    JSON.parse(String(requests[0]?.init?.body)).configuration,
    {
      schemaVersion: SCHEMA_VERSIONS.configurationBundle,
      digest: source.configurationDigest,
      canonical: "{}",
    }
  );
  const requestsBeforeLimitFailure = requests.length;
  await assert.rejects(
    () =>
      client.validateConfigurationCompatibility(
        "reference-app",
        {
          ...capabilities,
          configurationCompatibility: {
            ...capabilities.configurationCompatibility,
            limits: {
              ...capabilities.configurationCompatibility.limits,
              requestBytes: 1,
            },
          },
        },
        input
      ),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code ===
        "OPENXIANGDA_CONFIGURATION_VALIDATION_REQUEST_TOO_LARGE" &&
      error.data?.pointer === "/" &&
      Array.isArray(error.data?.supported)
  );
  assert.equal(requests.length, requestsBeforeLimitFailure);
});

test("rejects a platform with a different contract train", async () => {
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async () =>
      response({
        schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
        apiVersion: "v2",
        contractVersion: "2.1.0",
        platformVersion: "2.1.0",
        features: {},
        configurationCompatibility: configurationCompatibility(),
        deployment: {
          executionOwner: "platform",
          durableRuns: true,
          clientCanCheckpoint: false,
          backendImageBuild: {
            owner: "developer-cli",
            available: true,
            repositoryPrefix: "registry.example.invalid/openxiangda",
            platform: "linux/amd64",
          },
        },
      }),
  });
  await assert.rejects(() => client.capabilities(), ControlPlaneError);
});

test("manages environment-bound OAuth clients and exchanges client credentials", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    token: "developer-token",
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "application-token",
            token_type: "Bearer",
            expires_in: 900,
            scope: "app:invoke",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/oauth2/clients")) {
        return response({
          client: {
            id: "client-record-1",
            appCode: "reference-app",
            environmentKey: "preproduction",
            name: "External integration",
            clientId: "client-1",
            clientSecretHint: "…secret",
            scopes: ["app:invoke"],
            status: "active",
            credentialVersion: 1,
            rateLimitPerMinute: 600,
            createdAt: "2026-08-12T00:00:00.000Z",
            updatedAt: "2026-08-12T00:00:00.000Z",
          },
          clientSecret: "secret-once",
          secretReturnedOnce: true,
        });
      }
      return response({ ok: true });
    },
  });

  const created = await client.createOAuthClient("reference-app", {
    name: "External integration",
    environmentKey: "preproduction",
    scopes: ["app:invoke"],
  });
  const token = await client.exchangeOAuthClientCredentials({
    clientId: created.client.clientId,
    clientSecret: created.clientSecret,
    scope: ["app:invoke"],
  });

  assert.equal(created.client.environmentKey, "preproduction");
  assert.equal(token.access_token, "application-token");
  assert.equal(
    new Headers(requests[0]!.init?.headers).get("Authorization"),
    "Bearer developer-token"
  );
  assert.match(
    new Headers(requests[1]!.init?.headers).get("Authorization") || "",
    /^Basic /u
  );
});

test("manages environment-bound application Secrets without returning values", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    token: "developer-token",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: SCHEMA_VERSIONS.applicationSecret,
        id: "secret-1",
        appCode: "reference-app",
        environmentKey: "preproduction",
        name: "dingtalk-client-secret",
        description: null,
        status: "active",
        revision: 1,
        hasValue: true,
        expiresAt: null,
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z",
      });
    },
  });

  const created = await client.createApplicationSecret(
    "reference-app",
    "preproduction",
    {
      name: "dingtalk-client-secret",
      value: "local-only-secret",
      idempotencyKey: "secret-create:test-1",
    }
  );

  assert.equal(created.hasValue, true);
  assert.equal("value" in created, false);
  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/environments/preproduction/secrets"
  );
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    expectedRevision: 0,
    name: "dingtalk-client-secret",
    value: "local-only-secret",
    idempotencyKey: "secret-create:test-1",
  });
});

test("calls application APIs with OAuth access tokens", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    token: "application-token",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ imported: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const result = await client.applicationApiJson<{ imported: number }>(
    "reference-app",
    "preproduction",
    "reservations/import",
    { method: "POST", body: { source: "external" } }
  );

  const headers = new Headers(requests[0]!.init?.headers);
  assert.equal(result.imported, 3);
  assert.equal(headers.get("Authorization"), "Bearer application-token");
});

test("reports invalid OAuth token responses as a typed control-plane error", async () => {
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async () => new Response("upstream unavailable", { status: 502 }),
  });
  await assert.rejects(
    () =>
      client.exchangeOAuthClientCredentials({
        clientId: "client-1",
        clientSecret: "secret-1",
      }),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code === "OAUTH2_TOKEN_RESPONSE_INVALID" &&
      error.status === 502
  );
});

test("promotes, rolls back, retries, cancels, and reads immutable application versions", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const deployment = {
    schemaVersion: SCHEMA_VERSIONS.deploymentRun,
    id: "deployment-1",
    appCode: "reference-app",
    environment: { kind: "production" },
    kind: "promotion",
    packageDigest: "a".repeat(64),
    idempotencyKey: "promote-1",
    status: "queued",
    stage: "queued",
    attempt: 1,
    progress: {},
    checkpoints: [],
    result: {},
    requestedBy: "user-1",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/versions?")) {
        return response({ items: [], total: 0 });
      }
      if (url.includes("/environment-heads/")) {
        return response({
          schemaVersion: SCHEMA_VERSIONS.environmentHead,
          id: "head-1",
          appCode: "reference-app",
          environmentKey: "production",
          environmentId: null,
          environmentKind: "production",
          activeAppVersionId: "version-1",
          revisions: {
            frontend: null,
            backend: null,
            config: null,
            dataContract: null,
          },
          revision: 1,
          activatedByDeploymentId: "deployment-1",
          activatedBy: "user-1",
          activatedAt: "2026-08-10T00:00:00.000Z",
          updatedAt: "2026-08-10T00:00:00.000Z",
        });
      }
      return response(deployment);
    },
  });

  await client.promote({
    appCode: "reference-app",
    appVersionId: "version-1",
    environmentKind: "production",
    idempotencyKey: "promote-1",
  });
  await client.redeploy({
    appCode: "reference-app",
    appVersionId: "version-1",
    environmentKind: "production",
    idempotencyKey: "redeploy-1",
  });
  await client.rollback({
    appCode: "reference-app",
    appVersionId: "version-1",
    environmentKind: "production",
    idempotencyKey: "rollback-1",
  });
  await client.retryDeployment("reference-app", "deployment-1");
  await client.cancelDeployment("reference-app", "deployment-1");
  await client.appVersions("reference-app");
  const head = await client.environmentHead("reference-app", "production");

  assert.equal(head.activeAppVersionId, "version-1");
  assert.deepEqual(
    requests.map((item) => new URL(item.url).pathname),
    [
      "/openxiangda-api/v2/applications/reference-app/promotions",
      "/openxiangda-api/v2/applications/reference-app/redeployments",
      "/openxiangda-api/v2/applications/reference-app/rollbacks",
      "/openxiangda-api/v2/applications/reference-app/deployments/deployment-1/retry",
      "/openxiangda-api/v2/applications/reference-app/deployments/deployment-1/cancel",
      "/openxiangda-api/v2/applications/reference-app/versions",
      "/openxiangda-api/v2/applications/reference-app/environment-heads/production",
    ]
  );
});

test("reads and changes platform-owned application environment runtime state", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const environment = {
    id: "environment-preproduction",
    tenantId: "tenant-1",
    appCode: "reference-app",
    environmentKey: "preproduction" as const,
    environmentKind: "preproduction" as const,
    displayName: "预发环境",
    status: "active" as const,
    runtimeState: "running" as const,
    sideEffectPolicy: {},
    revision: 3,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    activeHead: null,
  };
  const client = new OpenXiangdaControlPlaneClient({
    baseUrl: "https://platform.example",
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (!init?.method) {
        return response({
          schemaVersion: SCHEMA_VERSIONS.applicationEnvironments,
          items: [environment],
          total: 1,
        });
      }
      const action = url.endsWith("/start") ? "start" : "stop";
      return response({
        schemaVersion: SCHEMA_VERSIONS.deploymentRun,
        id: `deployment-${action}`,
        appCode: "reference-app",
        environment: {
          id: environment.id,
          kind: environment.environmentKind,
        },
        kind: action,
        packageDigest: "a".repeat(64),
        idempotencyKey: `environment-${action}-3`,
        status: "queued",
        stage: "queued",
        attempt: 1,
        progress: {},
        checkpoints: [],
        result: {},
        requestedBy: "user-1",
        createdAt: "2026-08-16T00:00:00.000Z",
        updatedAt: "2026-08-16T00:00:00.000Z",
      });
    },
  });

  const listed = await client.applicationEnvironments("reference-app");
  await client.startEnvironment("reference-app", "preproduction", {
    idempotencyKey: "environment-start-3",
  });
  await client.stopEnvironment("reference-app", "preproduction", {
    idempotencyKey: "environment-stop-3",
    requestId: "request-stop-3",
  });

  assert.equal(listed.items[0]?.runtimeState, "running");
  assert.deepEqual(
    requests.map(item => ({
      path: new URL(item.url).pathname,
      method: item.init?.method || "GET",
    })),
    [
      {
        path: "/openxiangda-api/v2/applications/reference-app/environments",
        method: "GET",
      },
      {
        path: "/openxiangda-api/v2/applications/reference-app/environments/preproduction/start",
        method: "POST",
      },
      {
        path: "/openxiangda-api/v2/applications/reference-app/environments/preproduction/stop",
        method: "POST",
      },
    ]
  );
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    idempotencyKey: "environment-stop-3",
    requestId: "request-stop-3",
  });
});

test("hydrates the latest deployment detail before reporting status and logs", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-latest-detail-"));
  const calls: string[] = [];
  const compact = {
    id: "deployment-latest",
    status: "failed",
    checkpoints: [],
  };
  const detail: any = {
    ...compact,
    failure: {
      code: "APPLICATION_V2_RUNTIME_NOT_READY",
      message: "not ready",
      retryable: true,
    },
    rootFailure: {
      code: "APPLICATION_V2_RUNTIME_NOT_READY",
      message: "not ready",
      retryable: true,
    },
    latestFailure: {
      code: "APPLICATION_V2_RUNTIME_NOT_READY",
      message: "not ready",
      retryable: true,
    },
    candidate: {
      identity: "kubernetes:openxiangda-apps:Deployment:candidate",
      state: "failed",
      recoveryAction: "reuse",
    },
    recovery: {
      mode: "same_run_attempt",
      retryable: true,
      replacementAllowed: false,
      cancelAllowed: false,
      action: "reuse",
      expectedAttempt: 1,
      nextCommand: "openxiangda retry deployment-latest",
    },
    attempts: [
      {
        attempt: 1,
        stage: "verifying-readiness",
        candidateIdentity:
          "kubernetes:openxiangda-apps:Deployment:candidate",
        startedAt: "2026-08-27T00:00:00.000Z",
        finishedAt: "2026-08-27T00:01:00.000Z",
        outcome: "failed",
        failure: {
          code: "APPLICATION_V2_RUNTIME_NOT_READY",
          message: "not ready",
          retryable: true,
        },
        candidateState: "failed",
        recoveryAction: "reuse",
      },
    ],
    checkpoints: [
      {
        stage: "verifying-readiness",
        status: "verifying",
        at: "2026-08-27T00:00:00.000Z",
        attempt: 1,
      },
    ],
  };
  try {
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const services = new OpenXiangdaApplicationServices({
      client: {
        deployments: async () => {
          calls.push("list");
          return { items: [compact], total: 1 };
        },
        deployment: async () => {
          calls.push("detail");
          return detail;
        },
      } as any,
    });

    const status = await services.deploymentStatus(root);
    assert.equal(status.data?.checkpoints.length, 1);
    assert.equal(
      status.nextActions[0]?.command,
      "openxiangda retry deployment-latest"
    );
    const logs = await services.deploymentLogs(root);
    assert.equal(logs.data?.checkpoints.length, 1);
    assert.deepEqual(logs.data?.rootFailure, detail.rootFailure);
    assert.deepEqual(logs.data?.latestFailure, detail.latestFailure);
    assert.deepEqual(logs.data?.candidate, detail.candidate);
    assert.equal(logs.data?.attempts.length, 1);
    detail.status = "verifying";
    detail.failure = undefined;
    detail.checkpoints = [];
    detail.recovery = {
      ...detail.recovery,
      retryable: false,
      cancelAllowed: false,
      nextCommand: null,
    };
    const activated = await services.deploymentStatus(
      root,
      "deployment-latest"
    );
    assert.equal(
      activated.nextActions.some(action => action.code === "cancel"),
      false
    );
    assert.deepEqual(calls, ["list", "detail", "list", "detail", "detail"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("derives environment lifecycle idempotency from the platform revision", async () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-v2-environment-state-"));
  const calls: unknown[] = [];
  try {
    mkdirSync(join(root, "apps/web"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "reference-app",
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
      })
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify(configDeclaration())};\n`
    );
    const services = new OpenXiangdaApplicationServices({
      client: {
        applicationEnvironments: async () => ({
          schemaVersion: SCHEMA_VERSIONS.applicationEnvironments,
          items: [
            {
              environmentKey: "preproduction",
              revision: 7,
            },
          ],
          total: 1,
        }),
        stopEnvironment: async (
          appCode: string,
          environmentKey: string,
          input: unknown
        ) => {
          calls.push({ appCode, environmentKey, input });
          return { id: "deployment-stop-7", status: "queued" };
        },
      } as any,
    });

    const result = await services.stopEnvironment(root, "preproduction");
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      {
        appCode: "reference-app",
        environmentKey: "preproduction",
        input: {
          idempotencyKey:
            "environment:stop:preproduction:revision:7",
        },
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("submits one immutable package instead of resource-level release steps", async () => {
  const compiledPackage = compileAppPackage({
    config: config(),
    version: "2.0.0-test.1",
    createdAt: "2026-08-10T00:00:00.000Z",
    source: {
      repository: "https://example.invalid/reference-app.git",
      commit: "0123456789abcdef",
      dirty: false,
    },
    toolchainVersion: "2.0.0-alpha.1",
    artifacts: [],
    manifests: {},
    minimumPlatformVersion: "2.0.0-alpha.1",
  });
  const uploadArtifact = test.mock.fn(async () => ({}));
  const createDeployment = test.mock.fn(async (input) => ({
    schemaVersion: SCHEMA_VERSIONS.deploymentRun,
    id: "deployment-1",
    appCode: input.appCode,
    environment: {},
    kind: "deploy" as const,
    packageDigest: input.packageDigest,
    idempotencyKey: input.idempotencyKey,
    status: "queued" as const,
    stage: "queued",
    attempt: 1,
    progress: {},
    checkpoints: [],
    result: {},
    requestedBy: "user-1",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  }));

  let stored = false;
  const submission: Parameters<typeof submitAppPackage>[0] = {
    client: {
      capabilities: async () => ({
        schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
        apiVersion: "v2",
        contractVersion: OPENXIANGDA_CONTRACT_VERSION,
        platformVersion: "2.0.0-alpha.1",
        features: {
          "application-native-2": availableCapability("application-native-2"),
          "authz.native-batch-explain": availableCapability(
            "authz.native-batch-explain"
          ),
          "authz.native-management": availableCapability(
            "authz.native-management"
          ),
          "deployment.durable-runs": availableCapability(
            "deployment.durable-runs"
          ),
          "deployment.platform-executor": availableCapability(
            "deployment.platform-executor"
          ),
          "environment.on-demand-production": availableCapability(
            "environment.on-demand-production"
          ),
          "environment.runtime-lifecycle": availableCapability(
            "environment.runtime-lifecycle"
          ),
          "data-api-v2": availableCapability("data-api-v2"),
          "data.native-golden-crud": availableCapability(
            "data.native-golden-crud"
          ),
        },
        configurationCompatibility: configurationCompatibility(),
        deployment: {
          executionOwner: "platform",
          durableRuns: true,
          clientCanCheckpoint: false,
          backendImageBuild: {
            owner: "developer-cli",
            available: true,
            repositoryPrefix: "registry.example.invalid/openxiangda",
            platform: "linux/amd64",
          },
        },
      }),
      uploadArtifact,
      artifactStatus: async (_appCode, digest) => stored ? {
        digest, kind: 'manifest', contentType: 'application/vnd.openxiangda.app-package.v3+json', sizeBytes: Buffer.byteLength(canonicalJson(compiledPackage.manifest)),
      } : null,
      createDeployment,
    },
    compiledPackage,
    environmentKind: "preproduction",
    idempotencyKey: "reference-app:test.1",
  };
  const deployment = await submitAppPackage(submission);

  assert.equal(deployment.id, "deployment-1");
  assert.equal(uploadArtifact.mock.callCount(), 1);
  assert.equal(uploadArtifact.mock.calls[0]?.arguments[0].kind, "manifest");
  assert.equal(createDeployment.mock.callCount(), 1);
  stored = true;
  await submitAppPackage(submission);
  assert.equal(uploadArtifact.mock.callCount(), 1, '原清单已上传时不重复上传');
  assert.equal(createDeployment.mock.callCount(), 2);
  assert.equal(createDeployment.mock.calls[1]?.arguments[0].idempotencyKey, submission.idempotencyKey);
});

test("rejects artifact bytes changed after the AppPackage was sealed", async () => {
  const content = JSON.stringify({
    schemaVersion: "openxiangda.config-bundle/v3",
    compilerContractVersion: "native-2",
    appCode: "reference-app",
    data: { resources: [{ code: "instruments" }] },
  });
  const digest = createHash("sha256").update(content).digest("hex");
  const compiledPackage = compileAppPackage({
    config: config(),
    version: "2.0.0-integrity.1",
    createdAt: "2026-08-12T00:00:00.000Z",
    source: {
      repository: "https://example.invalid/reference-app.git",
      commit: "0123456789abcdef",
      dirty: false,
    },
    toolchainVersion: "2.0.0-alpha.10",
    artifacts: [
      {
        kind: "config",
        digest,
        mediaType: "application/vnd.openxiangda.config-bundle.v3+json",
        size: Buffer.byteLength(content),
      },
    ],
    manifests: { config: digest },
    minimumPlatformVersion: "2.0.0-alpha.1",
  });

  await assert.rejects(
    () => verifySealedAppPackage(compiledPackage, { [digest]: `${content} ` }),
    (error: unknown) =>
      error instanceof ControlPlaneError &&
      error.code === "OPENXIANGDA_ARTIFACT_DIGEST_MISMATCH"
  );
});
