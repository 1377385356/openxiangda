import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
import { pathToFileURL } from "node:url";

const SUCCESS_STDOUT = "fake-pnpm: resolving dependencies\n";
const SUCCESS_STDERR = "fake-pnpm: progress enabled\n";
const FAILURE_STDOUT =
  "registry=https://packages.invalid/?token=stdout-install-secret\n";
const FAILURE_STDERR =
  "//packages.invalid/:_authToken=stderr-install-secret\nAuthorization: Bearer install-secret\n";

export async function verifyCreateJsonOutputBoundary(options) {
  const cliRoot = options.source?.configRoot || dirname(dirname(options.cliEntry));
  const expectedCliVersion = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8')).version;
  const scratchRoot = mkdtempSync(
    join(tmpdir(), `openxiangda-create-json-${options.label}-`)
  );
  const homeRoot = join(scratchRoot, "home");
  const binRoot = join(scratchRoot, "bin");
  const invocationMarker = join(scratchRoot, "pnpm-invocations.jsonl");
  const supportMarker = join(scratchRoot, "unexpected-support-invocation");
  let platformRequestCount = 0;
  const server = createServer((request, response) => {
    platformRequestCount += 1;
    void handlePlatformRequest(request, response).catch(error => {
      response.statusCode = 500;
      response.end(
        JSON.stringify({ code: 500, message: error.message, data: null })
      );
    });
  });

  mkdirSync(homeRoot, { recursive: true });
  mkdirSync(binRoot, { recursive: true });
  writeFakePnpm(join(binRoot, "pnpm"));
  for (const command of ['dws', 'npm']) {
    const file = join(binRoot, command);
    writeFileSync(file, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(supportMarker)}, ${JSON.stringify(command)}); process.exit(97);\n`);
    chmodSync(file, 0o755);
  }

  try {
    await listen(server);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const environment = {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH || ""}`,
      OPENXIANGDA_BASE_URL: `http://127.0.0.1:${address.port}/service`,
      OPENXIANGDA_TOKEN: "developer-access-token",
      OPENXIANGDA_TEST_PNPM_MARKER: invocationMarker,
      OPENXIANGDA_TEST_PACKAGE_ROOT: resolve(options.packageRoot),
    };
    const command = createCommand(options, scratchRoot);

    // 文件中的旧身份不能决定新应用的目标，也不能把既有工作区带到另一站点。
    const sessionDirectory = join(homeRoot, ".config", "openxiangda-v2");
    mkdirSync(sessionDirectory, { recursive: true });
    writeFileSync(join(sessionDirectory, "session.json"), JSON.stringify({
      schemaVersion: 2,
      baseUrl: environment.OPENXIANGDA_BASE_URL,
      accessToken: "developer-access-token",
    }));
    const fileSessionEnvironment = {
      ...environment, OPENXIANGDA_BASE_URL: "", OPENXIANGDA_TOKEN: "",
    };
    for (const [suffix, flags, code] of [
      ["missing-platform", [], "OPENXIANGDA_CREATE_PLATFORM_REQUIRED"],
      ["wrong-platform", ["--base-url", "https://other.example"], "OPENXIANGDA_AUTH_REQUIRED"],
    ]) {
      const guardedRoot = join(scratchRoot, `${options.label}-${suffix}`);
      const guarded = await runCommand(command, ["create", guardedRoot, ...flags, "--json"], options.cwd, fileSessionEnvironment, 1);
      assertMachineEnvelope(guarded, false, "create");
      assert.equal(guarded.value.error.code, code);
      assert.equal(platformRequestCount, 0, "站点错误不得发送身份或远端创建请求");
      assert.equal(existsSync(guardedRoot), false, "站点错误不得生成目录");
      assert.equal(existsSync(invocationMarker), false, "站点错误不得安装依赖");
    }

    const successRoot = join(scratchRoot, `${options.label}-success`);
    const success = await runCommand(
      command,
      ["create", successRoot, "--json"],
      options.cwd,
      { ...environment, OPENXIANGDA_TEST_PNPM_OUTCOME: "success" },
      0
    );
    assertMachineEnvelope(success, true, "create");
    assert.equal(success.stderr, "", `${options.label} success stderr`);
    assertNoInstallSecrets(success);

    const originalLink = readFileSync(join(successRoot, ".openxiangda", "link.json"));
    const previousRequestCount = platformRequestCount;
    const previousInstallLog = readFileSync(invocationMarker);
    const rebind = await runCommand(command,
      ["create", successRoot, "--base-url", "https://other.example", "--json"],
      options.cwd, fileSessionEnvironment, 1);
    assertMachineEnvelope(rebind, false, "create");
    assert.equal(rebind.value.error.code, "OPENXIANGDA_WORKSPACE_LINK_MISMATCH");
    const otherSession = await runCommand(command, ["create", successRoot, "--json"], options.cwd,
      { ...environment, OPENXIANGDA_BASE_URL: "https://other.example" }, 1);
    assertMachineEnvelope(otherSession, false, "create");
    assert.equal(otherSession.value.error.code, "OPENXIANGDA_WORKSPACE_LINK_MISMATCH");
    assert.deepEqual(readFileSync(join(successRoot, ".openxiangda", "link.json")), originalLink);
    assert.equal(platformRequestCount, previousRequestCount);
    assert.deepEqual(readFileSync(invocationMarker), previousInstallLog);

    const failureRoot = join(scratchRoot, `${options.label}-failure`);
    const failure = await runCommand(
      command,
      ["create", failureRoot, "--json"],
      options.cwd,
      { ...environment, OPENXIANGDA_TEST_PNPM_OUTCOME: "failure" },
      1
    );
    assertMachineEnvelope(failure, false, "create");
    assert.equal(failure.stderr, "", `${options.label} failure stderr`);
    assert.equal(failure.value.error.code, "WORKSPACE_INSTALL_FAILED");
    assert.equal(failure.value.error.retryable, true);
    assertNoInstallSecrets(failure);

    const eventRoot = join(scratchRoot, `${options.label}-events`);
    const events = await runCommand(
      command,
      [
        "create",
        eventRoot,
        "--app-code",
        "cli-events-app",
        "--name",
        "CLI Events App",
        "--json-events",
        "--run-id",
        "agent-run-123",
      ],
      options.cwd,
      { ...environment, OPENXIANGDA_TEST_PNPM_OUTCOME: "success" },
      0
    );
    assertEventStream(events, "create", "agent-run-123");
    assert.equal(events.value.at(-1).payload.result.workspace.appCode, "cli-events-app");
    assert.equal(events.value.at(-1).payload.result.workspace.name, "CLI Events App");
    assert.match(
      events.value.at(-1).payload.result.data.workspace.template.digest,
      /^sha256:[0-9a-f]{64}$/
    );
    assert.equal(events.stderr, "", `${options.label} event stderr`);
    assertNoInstallSecrets(events);

    const humanRoot = join(scratchRoot, `${options.label}-human`);
    const human = await runCommand(
      command,
      ["create", humanRoot],
      options.cwd,
      { ...environment, OPENXIANGDA_TEST_PNPM_OUTCOME: "success" },
      0
    );
    assert.match(human.stdout, /fake-pnpm: resolving dependencies/);
    assert.match(human.stderr, /fake-pnpm: progress enabled/);

    const invocations = readFileSync(invocationMarker, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line));
    assert.equal(
      invocations.length,
      4,
      `${options.label} pnpm invocation count`
    );
    for (const invocation of invocations) {
      assert.deepEqual(invocation.args, ["install"]);
    }
    assert.equal(existsSync(supportMarker), false, 'Create engine smoke must not invoke real support setup');
  } finally {
    await close(server);
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

function createCommand(options, scratchRoot) {
  if (options.cliEntry) {
    return [process.execPath, resolve(options.cliEntry)];
  }
  if (!options.source?.commandModule || !options.source?.configRoot) {
    throw new Error("CREATE_JSON_BLACKBOX_COMMAND_REQUIRED");
  }
  const runner = join(scratchRoot, "source-create-runner.mjs");
  writeFileSync(
    runner,
    `const { default: Create } = await import(${JSON.stringify(
      pathToFileURL(resolve(options.source.commandModule)).href
    )});
const args = process.argv.slice(2);
if (args[0] === "create") args.shift();
await Create.run(args, ${JSON.stringify(resolve(options.source.configRoot))});
`,
    "utf8"
  );
  return [process.execPath, "--import", "tsx", runner];
}

function writeFakePnpm(path) {
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(
  process.env.OPENXIANGDA_TEST_PNPM_MARKER,
  JSON.stringify({ args, cwd: process.cwd() }) + "\\n"
);
if (process.env.OPENXIANGDA_TEST_PNPM_OUTCOME === "failure") {
  process.stdout.write(${JSON.stringify(FAILURE_STDOUT)});
  process.stderr.write(${JSON.stringify(FAILURE_STDERR)});
  process.exit(42);
}
process.stdout.write(${JSON.stringify(SUCCESS_STDOUT)});
process.stderr.write(${JSON.stringify(SUCCESS_STDERR)});
const nodeModules = path.join(process.cwd(), "node_modules");
fs.mkdirSync(nodeModules, { recursive: true });
for (const entry of fs.readdirSync(process.env.OPENXIANGDA_TEST_PACKAGE_ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const packageRoot = path.join(process.env.OPENXIANGDA_TEST_PACKAGE_ROOT, entry.name);
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (typeof manifest.name !== "string" || !isOpenXiangdaPackageName(manifest.name)) continue;
  const target = path.join(nodeModules, manifest.name);
  if (!fs.existsSync(target)) fs.symlinkSync(packageRoot, target, "dir");
}

function isOpenXiangdaPackageName(name) {
  return name === "openxiangda" || name.startsWith("openxiangda-");
}
process.exit(0);
`,
    { encoding: "utf8", mode: 0o755 }
  );
  chmodSync(path, 0o755);
}

async function handlePlatformRequest(request, response) {
  const url = new URL(request.url || "/", "http://platform.local");
  const path = url.pathname.replace(/^\/service/, "");
  if (
    request.method === "GET" &&
    path === "/openxiangda-api/v2/auth/whoami"
  ) {
    return envelope(response, {
      user: { id: "developer-1" },
      tenant: { id: "tenant-1" },
      isPlatformAdmin: true,
      manageableAppTypes: ["native"],
    });
  }
  if (request.method === "POST" && path.endsWith("/provision")) {
    for await (const _chunk of request) {
      // Drain the request before completing the response.
    }
    return envelope(response, { appCode: path.split("/").at(-2), created: true });
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ code: 404, message: "not found", data: null }));
}

function envelope(response, data) {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ code: 200, message: "success", data }));
}

function runCommand(command, args, cwd, env, expectedStatus) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command[0], [...command.slice(1), ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", code => {
      try {
        assert.equal(
          code,
          expectedStatus,
          `${optionsLabel(command)} ${args.join(" ")}\n${stdout}\n${stderr}`
        );
        resolveRun({ status: code, stdout, stderr });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function assertMachineEnvelope(result, ok, operation) {
  assert.equal(result.stdout.trimStart().startsWith("{"), true);
  result.value = JSON.parse(result.stdout);
  assert.equal(result.value.schemaVersion, "openxiangda.cli-result/v2");
  assert.equal(result.value.operation, operation);
  assert.equal(result.value.ok, ok);
}

function assertEventStream(result, operation, runId) {
  result.value = parseEvents(result.stdout);
  assert.ok(result.value.length >= 2);
  assert.equal(result.value[0].type, "command.started");
  assert.equal(result.value.at(-1).type, "command.completed");
  assert.deepEqual(
    result.value.map(event => event.seq),
    result.value.map((_event, index) => index + 1)
  );
  for (const event of result.value) {
    assert.equal(event.schemaVersion, "openxiangda.cli-event/v1");
    assert.equal(event.runId, runId);
    assert.equal(event.payload.operation, operation);
  }
}

function parseEvents(stdout) {
  return stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function assertNoInstallSecrets(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  for (const secret of [
    "developer-access-token",
    "stdout-install-secret",
    "stderr-install-secret",
    "Authorization: Bearer",
    "_authToken",
    "packages.invalid",
  ]) {
    assert.equal(output.includes(secret), false, `leaked ${secret}`);
  }
}

function optionsLabel(command) {
  return command.map(item => String(item)).join(" ");
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise(resolveClose => server.close(resolveClose));
}
