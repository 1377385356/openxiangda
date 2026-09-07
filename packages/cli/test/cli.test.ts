import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { spawnSync } from 'node:child_process';
import {
  DEVKIT_COMMANDS,
  toolchainCapsuleDiagnostic,
} from "openxiangda-devkit-core";
import Deploy from "../src/commands/deploy.js";
import Check from "../src/commands/check.js";
import Create from "../src/commands/create.js";
import Dev from "../src/commands/dev.js";
import Login from "../src/commands/login.js";
import Logs from "../src/commands/logs.js";
import Rollback from "../src/commands/rollback.js";
import Start from "../src/commands/start.js";
import Stop from "../src/commands/stop.js";
import Admin from "../src/commands/admin.js";
import {
  resolveCliToolchainCapsule,
  resolveDefaultTemplate,
} from "../src/toolchain-capsule.js";

const expected = [
  "auth",
  "context",
  "docs",
  "admin",
  "create",
  "dev",
  "check",
  "accept",
  "deploy",
  "status",
  "logs",
  "cancel",
  "retry",
  "start",
  "stop",
  "rollback",
  "login",
  "skill",
  "spec",
];

test("publishes lifecycle commands, optional acceptance, and Skill installation", () => {
  assert.deepEqual(DEVKIT_COMMANDS.map(item => item.id), expected);
  const commandsRoot = resolve(import.meta.dirname, "../src/commands");
  const files = readdirSync(commandsRoot, { recursive: true })
    .map(String)
    .filter(name => name.endsWith(".ts"))
    .sort();
  assert.deepEqual(files, expected.map(name => `${name}.ts`).sort());
  assert.equal(files.some(name => name.includes("/")), false);
  assert.equal(Rollback.flags["operation-id"].required, undefined);
});

test("resolves the capsule from both source and packed application templates", () => {
  const packagesRoot = resolve(import.meta.dirname, "../../../packages");
  const rootManifest = readJson(join(packagesRoot, "openxiangda", "package.json"));
  const expected = { openxiangda: rootManifest.version };
  const source = resolveCliToolchainCapsule(
    resolve(import.meta.dirname, "../../../templates/application")
  );
  const packedRoot = resolve(import.meta.dirname, "../template");
  const packed = resolveCliToolchainCapsule(packedRoot);
  const packedManifest = readJson(join(packedRoot, "package.json"));
  const packedDeclarations = {
    openxiangda: dependency(
      packedManifest,
      "devDependencies",
      "openxiangda"
    ),
  };
  assert.equal(
    resolveDefaultTemplate(),
    resolve(import.meta.dirname, "../../../templates/application")
  );
  for (const [name, version] of Object.entries(expected)) {
    assert.equal(source.packages[name], version, name);
    assert.equal(packed.packages[name], version, name);
    assert.equal(packed.packages[name], packedDeclarations[name], name);
  }
  assert.deepEqual(packed.packages, source.packages);
  assert.equal(source.owner, "cli-template");
  assert.equal(packed.owner, "cli-template");
});

test("reports a stale dependency against the CLI-owned capsule", () => {
  const capsule = resolveCliToolchainCapsule();
  const staleSpecifier = capsule.packages.openxiangda.replace(
    /(\d+)$/,
    (_match, serial) => String(Number(serial) - 1),
  );
  assert.notEqual(staleSpecifier, capsule.packages.openxiangda);
  const diagnostic = toolchainCapsuleDiagnostic(
    [
      {
        name: "openxiangda",
        specifier: staleSpecifier,
        packageFile: "package.json",
        section: "dependencies",
      },
    ],
    capsule
  );
  assert.equal(diagnostic?.code, "OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH");
  assert.equal(diagnostic?.details?.owner, "cli-template");
  assert.deepEqual(diagnostic?.details?.expected, capsule.packages);
  assert.deepEqual(diagnostic?.details?.mismatches, [
    {
      expected: capsule.packages.openxiangda,
      actual: staleSpecifier,
      packageFile: "package.json",
      section: "dependencies",
    },
  ]);
});

test("root package owns the only installed developer bin", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")
  );
  const rootPackageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../openxiangda/package.json"), "utf8")
  );
  assert.equal(packageJson.bin, undefined);
  assert.deepEqual(rootPackageJson.bin, { openxiangda: "./bin/run.js" });
  assert.deepEqual(Object.keys(packageJson.exports).sort(), [".", "./package.json", "./run"]);
  assert.equal("openxiangda-mcp" in packageJson.dependencies, true);
  assert.equal("openxiangda-skill-kit" in packageJson.dependencies, true);
  assert.equal(
    Object.keys(packageJson.dependencies || {}).some(name =>
      /react|antd|tiptap/.test(name)
    ),
    false
  );
  const version = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../openxiangda/bin/run.js'), 'version', '--json'], {
    cwd: resolve(import.meta.dirname, '../../..'), encoding: 'utf8',
  });
  assert.equal(version.status, 0, version.stderr);
  const identity = JSON.parse(version.stdout).data;
  assert.equal(identity.productVersion, rootPackageJson.version);
  assert.equal(identity.engine.version, rootPackageJson.version);
  assert.equal(identity.engine.generation, 'v2');
  const cliBin = readFileSync(
    resolve(import.meta.dirname, "../bin/run.js"),
    "utf8"
  );
  assert.match(cliBin, /OPENXIANGDA_DISTRIBUTION_NAME/);
  assert.match(cliBin, /OPENXIANGDA_DISTRIBUTION_VERSION/);
  assert.match(cliBin, /DEVKIT_COMMANDS\.map\(command => command\.id\)/);
  assert.equal(cliBin.includes("const publicCommands = new Set(["), false);
});

test("locks Oclif to the root plugin and cleans stale command output", () => {
  const bin = readFileSync(resolve(import.meta.dirname, "../bin/run.js"), "utf8");
  const packageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")
  );
  assert.match(bin, /userPlugins:\s*false/);
  assert.match(bin, /devPlugins:\s*false/);
  assert.match(bin, /jitPlugins:\s*false/);
  assert.match(bin, /args\.includes\('--mcp-stdio'\)/);
  assert.match(bin, /await import\('openxiangda-mcp'\)/);
  assert.match(packageJson.scripts.build, /prune-package-dist/);
});

test("keeps the minimal delivery defaults and machine-output boundary", () => {
  assert.equal(Admin.flags.environment.default, "test");
  assert.deepEqual(Admin.flags.environment.options, ["test", "production"]);
  assert.deepEqual(Admin.args.action.options, ["context", "workflow"]);
  assert.equal(DEVKIT_COMMANDS.find(command => command.id === "admin")?.risk, "read");
  assert.equal(Deploy.flags.environment.default, "test");
  assert.deepEqual(Deploy.flags.environment.options, ["test", "production"]);
  assert.equal(Rollback.flags.environment.default, "test");
  assert.equal(Start.flags.environment.default, "test");
  assert.equal(Stop.flags.environment.default, "test");
  assert.deepEqual(Start.flags.environment.options, ["test", "production"]);
  assert.deepEqual(Stop.flags.environment.options, ["test", "production"]);
  assert.equal("backend-image" in Deploy.flags, false);
  assert.ok("base-url" in Login.flags);
  assert.ok("no-open" in Login.flags);
  assert.ok("no-open" in Dev.flags);
  assert.equal("reset" in Dev.flags, false);
  for (const command of [Create, Dev, Check, Deploy, Logs, Rollback]) {
    assert.ok("json-events" in command.flags, command.name);
    assert.ok("run-id" in command.flags, command.name);
  }
  assert.equal("json-events" in Login.flags, false);
  assert.deepEqual(
    DEVKIT_COMMANDS.filter(
      command => "studioJsonEvents" in command && command.studioJsonEvents
    ).map(command => command.id),
    ["create", "dev", "check", "deploy", "logs", "rollback"]
  );
  assert.ok("app-code" in Create.flags);
  assert.ok("name" in Create.flags);
  assert.ok("template-ref" in Create.flags);
  assert.ok("template-digest" in Create.flags);
  assert.ok("studio-project-id" in Create.flags);
  assert.ok("provisioning-run-id" in Create.flags);
  assert.equal("repository-url" in Create.flags, false);
  assert.equal("repository" in Create.flags, false);

  const base = readFileSync(resolve(import.meta.dirname, "../src/base.ts"), "utf8");
  const login = readFileSync(
    resolve(import.meta.dirname, "../src/commands/login.ts"),
    "utf8"
  );
  const applicationServices = readFileSync(
    resolve(
      import.meta.dirname,
      '../../devkit-core/src/application-services.ts'
    ),
    'utf8'
  );
  assert.match(base, /STUDIO_CLI_RESULT_SCHEMA_VERSION/);
  assert.match(base, /openxiangda\.cli-event\/v1/);
  assert.match(base, /nextCommand/);
  assert.match(base, /DELIVERY_RUN_ALREADY_ACTIVE/);
  assert.match(base, /openxiangda cancel <deployment-id>/);
  assert.match(base, /openxiangda retry <deployment-id>/);
  assert.equal(base.includes("OPENXIANGDA_BACKEND_IMAGE"), false);
  assert.match(login, /if \(!this\.jsonEnabled\(\)\)/);
  assert.match(login, /if \(!flags\["no-open"\]\) this\.openBrowser/);
  for (const field of [
    'rootFailure',
    'latestFailure',
    'candidate',
    'recovery',
    'attempts',
  ]) {
    assert.match(applicationServices, new RegExp(`${field}: run\\.${field}`));
  }
  assert.match(applicationServices, /recovery\.cancelAllowed/);
  assert.match(applicationServices, /recovery\.retryable/);
  assert.match(applicationServices, /recovery\.nextCommand/);
});

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
}

function dependency(
  manifest: Record<string, any>,
  section: string,
  name: string
) {
  const values = manifest[section] as Record<string, unknown>;
  return String(values[name] || "");
}
