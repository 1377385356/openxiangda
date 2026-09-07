import { writeDevelopmentFixture } from "./lib/development-records-fixture.mjs";
import { NATIVE_CONFIGURATION_VALIDATOR_DIGEST, compileNativeApplicationConfiguration } from '../packages/contracts/dist/native-compiler/index.js';
import { PLATFORM_CAPABILITY_CONTRACT_VERSIONS } from '../packages/contracts/dist/index.js';
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCreateJsonOutputBoundary } from "./lib/create-json-output-blackbox.mjs";
import { requiredPlatformCapabilitiesFromConfiguration } from "../packages/devkit-core/dist/compiler/package-compiler.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratchRoot = mkdtempSync(join(tmpdir(), "openxiangda-cli-blackbox-"));
const homeRoot = join(scratchRoot, "home");
const binRoot = join(scratchRoot, "bin");
const appRoot = join(scratchRoot, "instrument-center");
const pidPath = join(scratchRoot, "child-pids.txt");
const browserMarker = join(scratchRoot, "browser-opened");
const dockerMarker = join(scratchRoot, "docker-called");
const dockerModePath = join(scratchRoot, "docker-mode");
const commandMarker = join(scratchRoot, 'script-calls');
const realPnpm = execFileSync("which", ["pnpm"], { encoding: "utf8" }).trim();
const requests = [];
let latestDeployment;
let latestPackage;
let latestDeploymentRequest;
let revokeCount = 0;
let activeDev;
let failProvision = false;
let backendBuildAvailable = true;
let goldenCrudStatus = "available";
let capacitySufficient = true;

mkdirSync(homeRoot, { recursive: true });
mkdirSync(binRoot, { recursive: true });
writeFakeCommands();

const platform = createServer((request, response) => {
  void handlePlatformRequest(request, response).catch(error => {
    response.statusCode = 500;
    response.end(JSON.stringify({ code: 500, message: error.message, data: null }));
  });
});

try {
  await verifyCreateJsonOutputBoundary({
    label: "source",
    cwd: repositoryRoot,
    packageRoot: join(repositoryRoot, "packages"),
    source: {
      commandModule: join(
        repositoryRoot,
        "packages",
        "cli",
        "src",
        "commands",
        "create.ts"
      ),
      configRoot: join(repositoryRoot, "packages", "cli"),
    },
  });
  await verifyCreateJsonOutputBoundary({
    label: "dist",
    cwd: repositoryRoot,
    packageRoot: join(repositoryRoot, "packages"),
    cliEntry: join(repositoryRoot, "packages", "cli", "bin", "run.js"),
  });
  await listen(platform);
  const address = platform.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/service`;
  const environment = {
    ...process.env,
    HOME: homeRoot,
    PATH: `${binRoot}:${process.env.PATH || ""}`,
    OPENXIANGDA_REAL_PNPM: realPnpm,
    OPENXIANGDA_TEST_PACKAGE_ROOT: join(repositoryRoot, "packages"),
    OPENXIANGDA_TEMPLATE_ROOT: join(repositoryRoot, "templates", "application"),
    OPENXIANGDA_TEST_PID_PATH: pidPath,
    OPENXIANGDA_TEST_BROWSER_MARKER: browserMarker,
    OPENXIANGDA_TEST_DOCKER_MARKER: dockerMarker,
    OPENXIANGDA_TEST_COMMAND_MARKER: commandMarker,
  };

  const login = await runCli(
    ["login", "--base-url", baseUrl, "--json"],
    repositoryRoot,
    environment
  );
  assertEnvelope(login, "login");
  assert.equal(login.stdout.includes("developer-access-token"), false);
  assert.equal(login.stdout.includes("accessToken"), false);
  await waitFor(() => existsSync(browserMarker), "browser authorization open");

  const authRequests = requests.length;
  const authStatus = await runCli(['auth', 'status', '--base-url', baseUrl, '--json'], repositoryRoot, environment);
  assertEnvelope(authStatus, 'auth.status');
  assert.equal(authStatus.value.data.state, 'authorized');
  assert.equal(requests.length, authRequests + 1);
  assert.equal(authStatus.stdout.includes('developer-access-token'), false);
  const mismatched = await runCli(['auth', 'status', '--base-url', 'https://other.example', '--json'], repositoryRoot, environment);
  assertEnvelope(mismatched, 'auth.status');
  assert.equal(mismatched.value.data.state, 'platform_mismatch');
  assert.equal(requests.length, authRequests + 1);

  const created = await runCli(["create", appRoot, "--base-url", baseUrl, "--json"], repositoryRoot, environment);
  assertEnvelope(created, "create");
  assert.equal(created.value.workspace.appCode, "instrument-center");
  assert.ok(existsSync(join(appRoot, ".openxiangda", "link.json")));

  for (const args of [['admin', 'context'], ['admin', 'workflow', 'request-review']]) {
    for (const choice of [undefined, 'test', 'production']) {
      const result = await runCli(
        [...args, ...(choice ? ['--environment', choice] : []), '--cwd', appRoot, '--json'],
        appRoot,
        environment
      );
      assertEnvelope(result, args[1] === 'context' ? 'admin.context' : 'admin.workflow');
      assert.equal(result.value.data.environmentKey, choice === 'production' ? 'production' : 'preproduction');
    }
    const requestCount = requests.length;
    const invalid = await runCli([...args, '--environment', 'unknown', '--cwd', appRoot, '--json'], appRoot, environment, 1);
    assert.equal(invalid.value.ok, false);
    assert.equal(requests.length, requestCount);
  }

  failProvision = true;
  const createFailure = await runCli(
    ["create", appRoot, "--json"],
    repositoryRoot,
    environment,
    1
  );
  failProvision = false;
  assert.equal(createFailure.value.ok, false);
  assert.equal(createFailure.value.operation, "create");
  assert.equal(createFailure.value.error.retryable, true);
  assert.equal(createFailure.value.error.nextCommand, "openxiangda create <directory> --base-url <platform>");

  // The public scaffold is CRUD-only by default. This delivery black box
  // explicitly enables the generic Nest runtime so image-build failures,
  // registry auth, and immutable backend artifacts stay covered.
  const configPath = join(appRoot, "openxiangda.config.ts");
  const initialConfig = readFileSync(configPath, "utf8");
  assert.ok(initialConfig.includes("modules: [],"), "expected the blank module composition slot");
  writeFileSync(configPath, initialConfig.replace("modules: [],", `
    backend: { enabled: true },
    modules: [{
      code: 'delivery',
      models: [{ code: 'delivery-records', name: 'Delivery records',
        fields: [{ code: 'name', type: 'text.short', label: 'Name', required: true }],
      }],
      crud: [{ model: 'delivery-records' }],
    }],
  `));

  const dev = spawn(
    process.execPath,
    [join(repositoryRoot, "packages", "cli", "bin", "run.js"), "dev", "--cwd", appRoot, "--no-open", "--json"],
    { cwd: appRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] }
  );
  activeDev = dev;
  let devStdout = "";
  let devStderr = "";
  dev.stdout.on("data", chunk => { devStdout += chunk; });
  dev.stderr.on("data", chunk => { devStderr += chunk; });
  try {
    await waitFor(
      () => {
        if (dev.exitCode !== null || dev.signalCode !== null) {
          throw new Error(`Connected dev exited before readiness: ${dev.exitCode ?? dev.signalCode}`);
        }
        return existsSync(pidPath) && readFileSync(pidPath, "utf8").trim().split(/\s+/).length === 2;
      },
      "connected child processes after optional backend preparation",
      // 首次启用后端的真实依赖安装最多 180 秒，随后才进入子进程就绪阶段。
      // 提前退出立即失败；不能用通常的 15 秒探测预算截断整个安装过程。
      210_000
    );
    // The PID marker proves both loopback servers are listening. Give the
    // connected-dev readiness probe one event-loop turn to enter its steady
    // state before exercising graceful shutdown.
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  } catch (error) {
    throw new Error(`${error.message}; requests=${JSON.stringify(requests)}; stdout=${devStdout}; stderr=${devStderr}`);
  }
  dev.kill("SIGTERM");
  const devExit = await childExit(dev);
  activeDev = undefined;
  assert.equal(devExit, 0);
  assert.equal(devStderr, "");
  assertEnvelope(
    { stdout: devStdout, stderr: devStderr, status: devExit, value: JSON.parse(devStdout) },
    "dev"
  );
  const childPids = readFileSync(pidPath, "utf8").trim().split(/\s+/).map(Number);
  await waitFor(() => childPids.every(pid => !processExists(pid)), "connected child cleanup");
  assert.equal(revokeCount, 1);
  assert.equal(existsSync(dockerMarker), false);

  assertEnvelope(await runCli(["check", "--cwd", appRoot, "--json"], appRoot, environment), "check");
  const beforeLocalCheck = requests.length;
  const localCheck = await runCli(['check', '--local', '--cwd', appRoot, '--json'], appRoot, environment);
  assertEnvelope(localCheck, 'check');
  assert.equal(localCheck.value.data.validationScope, 'local');
  assert.equal(localCheck.value.data.targetEnvironment, null);
  assert.equal(requests.length, beforeLocalCheck, '本地候选检查不能请求平台');

  const unpublished = await runCli(["deploy", "--cwd", appRoot, "--json"], appRoot, environment, 1);
  assert.equal(unpublished.value.error.code, 'DELIVERY_GIT_COMMIT_REQUIRED');
  assert.equal(existsSync(dockerMarker), false);
  const gitRemote = join(scratchRoot, 'application.git');
  execFileSync('git', ['init', '--bare', '-b', 'main', gitRemote], { stdio: 'ignore' });
  const git = (...args) => execFileSync('git', ['-C', appRoot, ...args], { stdio: 'ignore' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'OpenXiangda Black Box');
  git('config', 'user.email', 'blackbox@example.invalid');
  writeDevelopmentFixture(appRoot, 'instrument-center');
  git('add', '.'); git('commit', '-m', 'verified application');
  git('remote', 'add', 'origin', gitRemote); git('push', '-u', 'origin', 'main');

  for (const status of [undefined, "preview", "planned"]) {
    goldenCrudStatus = status;
    const writesBeforeGoldenGate = deploymentWriteCount();
    const incompletePlatform = await runCli(
      ["deploy", "--cwd", appRoot, "--json"],
      appRoot,
      environment,
      1
    );
    assert.equal(
      incompletePlatform.value.error.code,
      "OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE"
    );
    assert.match(incompletePlatform.value.error.remediation, /工具.*平台/);
    assert.equal(existsSync(dockerMarker), false);
    assert.equal(deploymentWriteCount(), writesBeforeGoldenGate);
  }
  goldenCrudStatus = "available";

  capacitySufficient = false;
  const scriptsBeforeCapacity = readFileSync(commandMarker, 'utf8');
  const writesBeforeCapacity = deploymentWriteCount();
  const capacityPlan = await runCli(['deploy', '--dry-run', '--environment-id', 'environment-test', '--cwd', appRoot, '--json'], appRoot, environment);
  assertEnvelope(capacityPlan, 'deployment.plan');
  assert.equal(capacityPlan.value.data.runtimeCapacity.sufficient, false);
  assert.equal(capacityPlan.value.data.runtimeCapacity.environmentId, 'environment-test');
  const capacityFailure = await runCli(['deploy', '--cwd', appRoot, '--json'], appRoot, environment, 1);
  assert.equal(capacityFailure.value.error.code, 'APPLICATION_V2_RUNTIME_QUOTA_INSUFFICIENT');
  assert.equal(existsSync(dockerMarker), false);
  assert.equal(readFileSync(commandMarker, 'utf8'), scriptsBeforeCapacity, 'quota failure must precede all application check/test/build scripts');
  assert.equal(deploymentWriteCount(), writesBeforeCapacity);
  capacitySufficient = true;
  const maintenancePlan = await runCli(['deploy', '--strategy', 'maintenance-replace', '--dry-run', '--cwd', appRoot, '--json'], appRoot, environment);
  assert.equal(maintenancePlan.value.data.runtimeCapacity.deploymentStrategy, 'maintenance-replace');
  assert.equal(maintenancePlan.value.data.runtimeCapacity.maintenance.downtime, true);
  assert.equal(existsSync(dockerMarker), false);
  const productionMaintenance = await runCli(['deploy', '--environment', 'production', '--from', 'old-run', '--strategy', 'maintenance-replace', '--cwd', appRoot, '--json'], appRoot, environment, 1);
  assert.equal(productionMaintenance.value.ok, false);

  backendBuildAvailable = false;
  const writesBeforeUnavailable = deploymentWriteCount();
  const unavailable = await runCli(
    ["deploy", "--cwd", appRoot, "--json"],
    appRoot,
    environment,
    1
  );
  assert.equal(
    unavailable.value.error.code,
    "OPENXIANGDA_BACKEND_IMAGE_BUILD_UNAVAILABLE"
  );
  assert.equal(existsSync(dockerMarker), false);
  assert.equal(deploymentWriteCount(), writesBeforeUnavailable);
  backendBuildAvailable = true;

  writeFileSync(dockerModePath, "auth");
  const writesBeforeAuthFailure = deploymentWriteCount();
  const authFailure = await runCli(
    ["deploy", "--cwd", appRoot, "--json"],
    appRoot,
    environment,
    1
  );
  assert.equal(authFailure.value.error.code, "OPENXIANGDA_REGISTRY_AUTH_REQUIRED");
  assert.equal(authFailure.stdout.includes("must-not-leak"), false);
  assert.equal(deploymentWriteCount(), writesBeforeAuthFailure);
  rmSync(dockerModePath, { force: true });

  const deployed = await runCli(
    ["deploy", "--cwd", appRoot, "--json"],
    appRoot,
    environment
  );
  assertEnvelope(deployed, "deploy");
  assert.match(deployed.stderr, /核对远端主线与源码/);
  assert.match(deployed.stderr, /平台部署完成/);
  assert.ok(deployed.value.data.execution.stages.some(stage => stage.stage === 'backend-image' && stage.state === 'passed'));
  assert.ok(deployed.value.data.execution.stages.some(stage => stage.stage === 'platform' && stage.details.deploymentId === latestDeployment.id));
  assert.equal(latestDeployment.environment.kind, "preproduction");
  const dockerCalls = readFileSync(dockerMarker, "utf8");
  assert.match(dockerCalls, /\["buildx","version"\]/);
  assert.match(dockerCalls, /"--platform","linux\/amd64"/);
  assert.match(
    dockerCalls,
    /registry\.invalid\/openxiangda\/instrument-center-server:ox2-/
  );
  assert.equal(dockerCalls.includes("developer-access-token"), false);
  const backendArtifact = latestPackage.artifacts.find(item => item.kind === "backend");
  assert.equal(
    backendArtifact.metadata.imageDigest,
    `registry.invalid/openxiangda/instrument-center-server@sha256:${"a".repeat(64)}`
  );
  assert.equal(
    latestPackage.compatibility.requiredPlatformCapabilities.some(
      item => item.code === "data.native-golden-crud"
    ),
    true
  );

  assert.equal(latestDeploymentRequest.deploymentStrategy, undefined);
  assert.equal(latestDeploymentRequest.idempotencyKey, `deploy:${latestDeploymentRequest.packageDigest}:preproduction`);
  const maintenanceDeployment = await runCli(['deploy', '--strategy', 'maintenance-replace', '--cwd', appRoot, '--json'], appRoot, environment);
  assertEnvelope(maintenanceDeployment, 'deploy');
  assert.equal(latestDeploymentRequest.deploymentStrategy, 'maintenance-replace');
  assert.equal(latestDeploymentRequest.idempotencyKey, `deploy:${latestDeploymentRequest.packageDigest}:preproduction:maintenance-replace`);

  const status = await runCli(["status", "--cwd", appRoot, "--json"], appRoot, environment);
  assertEnvelope(status, "status");
  assert.equal(status.value.data.id, latestDeployment.id);

  const planEvents = await runCli(['deploy', '--dry-run', '--json-events', '--cwd', appRoot], appRoot, environment);
  assert.equal(planEvents.stderr, '');
  assert.equal(planEvents.value[0].type, 'command.started');
  assert.equal(planEvents.value.at(-1).type, 'command.completed');
  assert.ok(planEvents.value.some(event => event.type === 'command.status' && event.payload.progress?.stage === 'source'));

  const logs = await runCli(["logs", "--cwd", appRoot, "--json"], appRoot, environment);
  assertEnvelope(logs, "logs");
  assert.equal(logs.value.data.deploymentId, latestDeployment.id);
  assert.equal(logs.value.data.rootFailure, null);
  assert.equal(logs.value.data.latestFailure, null);
  assert.deepEqual(logs.value.data.candidate, latestDeployment.candidate);
  assert.deepEqual(logs.value.data.attempts, []);

  const rollback = await runCli(
    ["rollback", "--cwd", appRoot, "--to", "version-1", "--json"],
    appRoot,
    environment
  );
  assertEnvelope(rollback, "rollback");
  assert.equal(rollback.value.data.environment.kind, "preproduction");

  const invalidFrom = await runCli(
    ["deploy", "--cwd", appRoot, "--from", "test-run-1", "--json"],
    appRoot,
    environment,
    1
  );
  assert.equal(invalidFrom.value.error.code, "DEPLOY_TEST_FROM_INVALID");

  process.stdout.write("Verified login -> create -> dev -> check -> deploy -> status -> logs -> rollback without local infrastructure.\n");
} finally {
  if (activeDev?.exitCode === null) activeDev.kill("SIGKILL");
  await close(platform);
  // pnpm can finish the CLI process before every filesystem handle opened by
  // its child install has settled.  Let Node retry transient ENOTEMPTY/EBUSY
  // cleanup races instead of turning an otherwise successful lifecycle test
  // into a release failure.
  rmSync(scratchRoot, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100,
  });
}

function writeFakeCommands() {
  const fakePnpm = join(binRoot, "pnpm");
  writeFileSync(
    fakePnpm,
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const args = process.argv.slice(2);
if (process.env.OPENXIANGDA_TEST_COMMAND_MARKER) fs.appendFileSync(process.env.OPENXIANGDA_TEST_COMMAND_MARKER, JSON.stringify(args) + "\\n");
if (args[0] === "install") {
  // This lifecycle test runs before a release candidate exists in the public
  // registry. Keep the install real while resolving the current source
  // candidates locally; packed/release smoke owns tarball and registry proof.
  // Build the complete source candidate first so a template never observes a
  // stale dist export from a package outside the CLI dependency graph.
  const sourceRoot = path.dirname(process.env.OPENXIANGDA_TEST_PACKAGE_ROOT);
  const fakeBinRoot = path.dirname(process.argv[1]);
  const sourceEnvironment = {
    ...process.env,
    PATH: String(process.env.PATH || "")
      .split(path.delimiter)
      .filter(entry => path.resolve(entry) !== path.resolve(fakeBinRoot))
      .join(path.delimiter),
  };
  const sourceBuild = spawnSync(
    process.env.OPENXIANGDA_REAL_PNPM,
    ["run", "build"],
    { cwd: sourceRoot, stdio: "ignore", env: sourceEnvironment }
  );
  if (sourceBuild.status !== 0) process.exit(sourceBuild.status ?? 1);
  const manifestPath = path.join(process.cwd(), "package.json");
  const originalManifest = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(originalManifest);
  const localOverrides = {};
  for (const entry of fs.readdirSync(process.env.OPENXIANGDA_TEST_PACKAGE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = path.join(process.env.OPENXIANGDA_TEST_PACKAGE_ROOT, entry.name);
    const packagePath = path.join(packageRoot, "package.json");
    if (!fs.existsSync(packagePath)) continue;
    const candidate = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (typeof candidate.name === "string" && isOpenXiangdaPackageName(candidate.name)) {
      localOverrides[candidate.name] = "file:" + packageRoot;
    }
  }
  manifest.pnpm = {
    ...(manifest.pnpm || {}),
    overrides: { ...((manifest.pnpm || {}).overrides || {}), ...localOverrides },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
  const installed = spawnSync(
    process.env.OPENXIANGDA_REAL_PNPM,
    ["install", "--no-frozen-lockfile", "--ignore-scripts"],
    { cwd: process.cwd(), stdio: "ignore", env: process.env }
  );
  fs.writeFileSync(manifestPath, originalManifest);
  process.exit(installed.status ?? 1);
}

function isOpenXiangdaPackageName(name) {
  return name === "openxiangda" || name.startsWith("openxiangda-");
}
if (args[0] === "run" && (args[1] === "dev:web" || args[1] === "dev:server")) {
  const port = Number(args[1] === "dev:web" ? process.env.OPENXIANGDA_WEB_PORT : process.env.OPENXIANGDA_APP_PORT);
  fs.appendFileSync(process.env.OPENXIANGDA_TEST_PID_PATH, process.pid + "\\n");
  const server = http.createServer((_request, response) => response.end("ready"));
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
  server.listen(port, "127.0.0.1");
  return;
}
const result = spawnSync(process.env.OPENXIANGDA_REAL_PNPM, args, { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
`,
    { mode: 0o755 }
  );
  chmodSync(fakePnpm, 0o755);
  const browserCommand = process.platform === "darwin" ? "open" : "xdg-open";
  const fakeBrowserCommand = join(binRoot, browserCommand);
  writeFileSync(
    fakeBrowserCommand,
    `#!/bin/sh\ntouch "$OPENXIANGDA_TEST_BROWSER_MARKER"\n`,
    { mode: 0o755 }
  );
  chmodSync(fakeBrowserCommand, 0o755);
  const fakeDocker = join(binRoot, "docker");
  writeFileSync(fakeDocker, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OPENXIANGDA_TEST_DOCKER_MARKER, JSON.stringify(args) + "\\n");
if (args[0] === "buildx" && args[1] === "version") process.exit(0);
if (args[0] === "buildx" && args[1] === "build") {
  if (fs.existsSync(${JSON.stringify(dockerModePath)}) && fs.readFileSync(${JSON.stringify(dockerModePath)}, "utf8").trim() === "auth") {
    process.stderr.write("unauthorized password=must-not-leak");
    process.exit(1);
  }
  const metadata = args[args.indexOf("--metadata-file") + 1];
  fs.writeFileSync(metadata, JSON.stringify({ "containerimage.digest": "sha256:${"a".repeat(64)}" }));
  process.exit(0);
}
process.exit(97);
`, { mode: 0o755 });
  chmodSync(fakeDocker, 0o755);
}

async function handlePlatformRequest(request, response) {
  const url = new URL(request.url || "/", "http://platform.local");
  const path = url.pathname.replace(/^\/service/, "");
  const method = request.method || "GET";
  requests.push({ method, path });
  const body = await requestBody(request);

  if (method === 'GET' && /^\/openxiangda-api\/v2\/applications\/instrument-center\/admin\/(?:context|workflows\/request-review\/node-configurations)$/.test(path)) {
    const environmentKey = url.searchParams.get('environmentKey');
    assert.ok(['preproduction', 'production'].includes(environmentKey));
    return envelope(response, { environmentKey });
  }

  if (method === "POST" && path === "/openxiangda-api/v2/auth/cli-sessions") {
    return envelope(response, {
      sessionId: "login-session-1",
      loginUrl: "http://127.0.0.1/authorize",
      qrText: "authorize",
      expireIn: 30,
      pollSecret: "poll-secret",
    });
  }
  if (method === "GET" && path === "/openxiangda-api/v2/auth/cli-sessions/login-session-1") {
    return envelope(response, { status: "authorized", accessToken: "developer-access-token" });
  }
  if (method === "GET" && path === "/openxiangda-api/v2/auth/whoami") {
    return envelope(response, { user: { id: "developer-1" }, tenant: { id: "tenant-1" }, isPlatformAdmin: true, manageableAppTypes: ["native"] });
  }
  if (method === "POST" && path.endsWith("/provision")) {
    if (failProvision) {
      return envelope(response, null, 503, "platform temporarily unavailable");
    }
    return envelope(response, { appCode: "instrument-center", created: true });
  }
  if (method === "GET" && path.endsWith("/environments")) {
    return envelope(response, {
      schemaVersion: "openxiangda.application-environments/v2",
      items: [{
        id: "environment-test",
        environmentKey: "preproduction",
        environmentKind: "preproduction",
        status: "active",
        activeHead: { activeAppVersionId: "version-1", activatedByDeploymentId: "test-run-1", revision: 1, revisions: { backend: null } },
      }],
      total: 1,
    });
  }
  if (method === "POST" && path.endsWith("/dev-sessions")) {
    return envelope(response, {
      sessionId: "dev-session-1",
      sessionToken: "one-time-dev-token",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      mode: "published-resources",
      manifestOverlay: false,
      manifestDigest: body?.manifestDigest || null,
    });
  }
  if (method === "POST" && path.endsWith("/dev-sessions/current/revoke")) {
    revokeCount += 1;
    return envelope(response, { revoked: true });
  }
  if (path === "/openxiangda-api/v2/capabilities") {
    const codes = [
      "application-native-2", "authz.native-batch-explain", "authz.native-management",
      "deployment.durable-runs", "deployment.platform-executor",
      "environment.on-demand-production", "environment.runtime-lifecycle", "data-api-v2", "directory-v2",
      "authentication.application-login-surface",
    ];
    if (goldenCrudStatus) codes.push("data.native-golden-crud");
    const features = Object.fromEntries(
      codes.map(code => [
        code,
        {
          contractVersion: PLATFORM_CAPABILITY_CONTRACT_VERSIONS[code] || "1.0.0",
          status:
            code === "data.native-golden-crud"
              ? goldenCrudStatus
              : "available",
        },
      ])
    );
    return envelope(response, {
      schemaVersion: "openxiangda.platform-capabilities/v3",
      apiVersion: "v2",
      contractVersion: "2.0.0-alpha.5",
      platformVersion: "2.0.0-test",
      features,
      configurationCompatibility: {
        schemaVersion: "openxiangda.configuration-compatibility/v2",
        capability: {
          code: "configuration.compatibility-preflight",
          version: "native-2",
          status: "available",
        },
        requestSchemaVersion:
          "openxiangda.configuration-validation-request/v1",
        resultSchemaVersion:
          "openxiangda.configuration-validation-result/v1",
        endpointTemplate:
          "/openxiangda-api/v2/applications/{appCode}/configuration-compatibility",
        limits: {
          configurationCanonicalBytes: 4 * 1024 * 1024,
          contractCanonicalBytes: 8 * 1024 * 1024,
          requestBytes: 10 * 1024 * 1024,
        },
        validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST,
        supportedApplicationContracts: [
          {
            appPackageSchemaVersion: "openxiangda.app-package/v3",
            configurationBundleSchemaVersion: "openxiangda.config-bundle/v3",
            contractBundleSchemaVersion: "openxiangda.contract-bundle/v3",
            compilerContractVersion: "native-4",
          },
        ],
      },
      deployment: {
        executionOwner: "platform",
        durableRuns: true,
        clientCanCheckpoint: false,
        runtimeCapacityPreflight: { strategies: ['rolling', 'maintenance-replace'], schemaVersion: 'openxiangda.runtime-capacity-preflight/v1', endpointTemplate: '/openxiangda-api/v2/applications/{appCode}/runtime-capacity-preflight' },
        backendImageBuild: {
          owner: "developer-cli",
          available: backendBuildAvailable,
          repositoryPrefix: "registry.invalid/openxiangda",
          platform: "linux/amd64",
        },
      },
    });
  }
  if (method === 'POST' && path.endsWith('/runtime-capacity-preflight')) {
    return envelope(response, {
      schemaVersion: 'openxiangda.runtime-capacity-preflight/v1', observedAt: new Date().toISOString(),
      environmentKey: body.environmentKey, environmentId: body.environmentId || 'environment-test',
      deploymentStrategy: body.deploymentStrategy || 'rolling',
      maintenance: body.deploymentStrategy === 'maintenance-replace' ? { downtime: true, estimatedAfterStop: true, previousAppVersionId: 'old-version', previousDeploymentId: 'old-run', headRevision: 1 } : null,
      basis: 'new-candidate', existingRun: null, sufficient: capacitySufficient,
      capacity: { checked: true, namespace: 'apps', additionalReplicas: 1, profile: 'light', required: { pods: '1' },
        quotas: [{ name: 'q', available: { pods: capacitySufficient ? '1' : '0' } }],
        shortages: capacitySufficient ? [] : [{ quota: 'q', resource: 'pods', required: '1', available: '0' }] },
    });
  }
  if (
    method === "POST" &&
    path.endsWith("/configuration-compatibility")
  ) {
    return envelope(response, {
      schemaVersion: "openxiangda.configuration-validation-result/v1",
      compatible: true,
      environmentKey: body.environmentKey,
      clientContractVersion: body.clientContractVersion,
      platformVersion: "2.0.0-test",
      capability: {
        code: "configuration.compatibility-preflight",
        version: "native-2",
        status: "available",
      },
      required: body.required,
      supported: [body.required],
      source: {
        configurationDigest: body.configuration.digest,
        contractDigest: body.contract.digest,
      },
      projectionDigest: compileNativeApplicationConfiguration({ appCode: JSON.parse(body.configuration.canonical).appCode, configBytes: body.configuration.canonical, contractBytes: body.contract.canonical, expectedConfigDigest: body.configuration.digest, expectedContractDigest: body.contract.digest }).aggregateDigest,
      requiredPlatformCapabilities:
        requiredPlatformCapabilitiesFromConfiguration(
          JSON.parse(body.configuration.canonical)
        ),
      counts: {
        resources: 1,
        perspectives: 0,
        capabilities: 4,
        eventProducers: 3,
        workflowDefinitions: 0,
      },
    });
  }
  if (method === "GET" && path.includes("/artifacts/")) {
    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    return response.end(JSON.stringify({ code: 404, errorCode: 'DELIVERY_ARTIFACT_NOT_FOUND', message: '制品尚未上传' }));
  }
  if (method === "POST" && path.includes("/artifacts/")) {
    return envelope(response, { stored: true });
  }
  if (method === "POST" && path.endsWith("/deployments")) {
    latestDeploymentRequest = body;
    latestPackage = body?.package;
    latestDeployment = deploymentRun("test-run-1", "preproduction", body?.packageDigest, "deploy");
    return envelope(response, latestDeployment);
  }
  if (method === "GET" && path.endsWith("/deployments")) {
    return envelope(response, { items: latestDeployment ? [latestDeployment] : [], total: latestDeployment ? 1 : 0 });
  }
  if (method === "GET" && /\/deployments\/[^/]+$/.test(path)) {
    return envelope(response, latestDeployment);
  }
  if (method === "POST" && path.endsWith("/rollbacks")) {
    return envelope(response, deploymentRun("rollback-run-1", body?.environmentKind || "preproduction", "b".repeat(64), "rollback"));
  }
  response.statusCode = 404;
  return envelope(response, null, 404, `Unhandled ${method} ${path}`);
}

function deploymentRun(id, environmentKind, packageDigest = "a".repeat(64), kind = "deploy") {
  return {
    schemaVersion: "openxiangda.deployment-run/v2",
    id,
    appCode: "instrument-center",
    environment: { id: `environment-${environmentKind}`, kind: environmentKind },
    kind,
    packageDigest,
    idempotencyKey: `${kind}-${id}`,
    status: "succeeded",
    stage: "completed",
    attempt: 1,
    progress: {},
    checkpoints: [],
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
    result: { applicationVersionId: "version-1", traceId: "trace-1" },
    requestedBy: "developer-1",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:01.000Z",
  };
}

function runCli(args, cwd, env, expectedStatus = 0) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      [join(repositoryRoot, "packages", "cli", "bin", "run.js"), ...args],
      { cwd, env, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => {
      try {
        assert.equal(code, expectedStatus, `${args.join(" ")}\n${stdout}\n${stderr}`);
        if (['check', 'deploy'].includes(args[0]) && !args.includes('--json-events')) {
          for (const line of stderr.trim().split('\n').filter(Boolean)) assert.match(line, /：(进行中|完成|失败|未执行)，[\d.]+ 秒$/);
        } else assert.equal(stderr, "", args.join(" "));
        resolveRun({ status: code, stdout, stderr, value: args.includes('--json-events') ? stdout.trim().split('\n').map(line => JSON.parse(line)) : JSON.parse(stdout) });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function assertEnvelope(result, operation) {
  assert.equal(result.value.schemaVersion, "openxiangda.cli-result/v2");
  assert.equal(result.value.ok, true, result.stdout);
  assert.equal(result.value.operation, operation);
  assert.equal(result.value.error, null);
}

function deploymentWriteCount() {
  return requests.filter(
    item =>
      item.method === "POST" &&
      (item.path.includes("/artifacts/") || item.path.endsWith("/deployments"))
  ).length;
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  if (!String(request.headers["content-type"] || "").includes("application/json")) return undefined;
  return JSON.parse(text);
}

function envelope(response, data, status = 200, message = "success") {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ code: status, message, data }));
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise(resolveClose => server.close(() => resolveClose()));
}

function childExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode ?? 1);
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolveExit(code ?? 1));
  });
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
