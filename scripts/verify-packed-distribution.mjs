import { browserStageFingerprint, canReuseBrowserStage, runCachedStage } from "./lib/release-stage-cache.mjs";
import { createHash } from 'node:crypto';
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publicPackages } from "./lib/release-package-state.mjs";
import { RETIRED_PACKAGE_NAMES } from "./lib/public-package-policy.mjs";
import {
  assertPublicArtifactManifest,
  loadReleaseArtifactManifest,
  materializeReleaseArtifact,
  selectReleaseArtifacts,
} from "./lib/release-artifacts.mjs";
import { verifyCreateJsonOutputBoundary } from "./lib/create-json-output-blackbox.mjs";
import { DOCUMENTATION_TOPICS } from '../packages/devkit-core/dist/documentation.js';
import { DEVKIT_COMMANDS } from "../packages/devkit-core/dist/command-registry.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = join(repositoryRoot, "packages");
const scratchRoot = mkdtempSync(join(tmpdir(), "openxiangda-v2-packed-"));
const tarballRoot = join(scratchRoot, "tarballs");
const extractedRoot = join(scratchRoot, "extracted");
const launcherRoot = join(scratchRoot, "launcher");
const applicationRoot = join(scratchRoot, "packed-reference-app");
const keepScratch = process.env.OPENXIANGDA_KEEP_PACK_SMOKE === "1";
const smokeLevel = normalizeSmokeLevel(
  process.env.OPENXIANGDA_PACK_SMOKE_LEVEL || "e2e"
);
const candidateRuntimeRoots = new Map();
const candidateTarballs = new Map();
const selectedPackageNames = new Set(
  String(process.env.OPENXIANGDA_RELEASE_PACKAGES || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);

mkdirSync(tarballRoot, { recursive: true });
mkdirSync(extractedRoot, { recursive: true });
mkdirSync(launcherRoot, { recursive: true });

try {
  const allPackages = publicPackages(repositoryRoot);
  const artifactManifestPath =
    process.env.OPENXIANGDA_RELEASE_ARTIFACT_MANIFEST?.trim();
  const artifacts = artifactManifestPath
    ? selectReleaseArtifacts(
        assertPublicArtifactManifest(
          loadReleaseArtifactManifest(artifactManifestPath, {
            packageNames: [...selectedPackageNames],
          })
        ),
        [...selectedPackageNames]
      )
    : [];
  const packages = artifactManifestPath
    ? artifacts.map(item => ({
        manifest: { name: item.name, version: item.version },
        tarball: materializeReleaseArtifact(item, tarballRoot),
      }))
    : selectedPackageNames.size
      ? allPackages.filter(item => selectedPackageNames.has(item.manifest.name))
      : allPackages;

  if (!packages.length) fail("No public OpenXiangda packages were found");
  if (selectedPackageNames.size !== packages.length) {
    const found = new Set(packages.map(item => item.manifest.name));
    const missing = [...selectedPackageNames].filter(name => !found.has(name));
    if (missing.length) fail(`Unknown candidate packages: ${missing.join(", ")}`);
  }
  if (!artifactManifestPath) {
    buildLocalPackageOutputs(packages.map(item => item.manifest.name));
  }

  const tarballs = candidateTarballs;
  for (const item of packages) {
    if (item.tarball) {
      verifyTarball(item.manifest.name, item.tarball);
      tarballs.set(item.manifest.name, item.tarball);
      continue;
    }
    const before = new Set(readdirSync(tarballRoot));
    run(
      "pnpm",
      ["--filter", item.manifest.name, "pack", "--pack-destination", tarballRoot],
      repositoryRoot
    );
    const created = readdirSync(tarballRoot).filter(
      name => name.endsWith(".tgz") && !before.has(name)
    );
    if (created.length !== 1) {
      fail(
        `Expected one tarball for ${item.manifest.name}, received ${created.length}`
      );
    }
    const tarball = join(tarballRoot, created[0]);
    verifyTarball(item.manifest.name, tarball);
    assertRepeatablePack(item.manifest.name, tarball);
    tarballs.set(item.manifest.name, tarball);
  }

  const overrides = Object.fromEntries(
    [...tarballs.entries()].map(([name, tarball]) => [name, `file:${tarball}`])
  );
  const rootFacadePackage = allPackages.find(
    item => item.manifest.name === "openxiangda"
  );
  if (!rootFacadePackage) fail("openxiangda root package is missing");
  writeJson(join(launcherRoot, "package.json"), {
    name: "openxiangda-packed-launcher",
    version: "0.0.0",
    private: true,
    packageManager: "pnpm@10.15.1",
    dependencies: {
      ...Object.fromEntries(
        [...tarballs.entries()].map(([name, tarball]) => [name, `file:${tarball}`])
      ),
      openxiangda:
        overrides.openxiangda || rootFacadePackage.manifest.version,
    },
    pnpm: { overrides },
  });
  writePnpmBuildPolicy(launcherRoot);
  assertStrictBuildPolicy(scratchRoot);
  const launcherInstallOutput = runCaptured(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile"],
    launcherRoot
  );
  assertReviewedBuildScripts(launcherInstallOutput, "packed creator launcher");
  if (findInstalledPackage(launcherRoot, "openxiangda")) {
    assertPublicCliSurface(launcherRoot);
    assertClosedPublicSubpaths(launcherRoot);
    assertPublicConfigCompatibility(launcherRoot);
  }
  await verifyCreateJsonOutputBoundary({
    label: "packed",
    cwd: launcherRoot,
    packageRoot: packagesRoot,
    cliEntry: join(
      findInstalledDependency(launcherRoot, "openxiangda", "openxiangda-cli"),
      "bin",
      "run.js"
    ),
  });
  await createPackedWorkspace(launcherRoot, applicationRoot);
  assertGeneratedIdentity(
    applicationRoot,
    "packed-reference-app",
    "Packed Reference App"
  );
  assertGeneratedDependencyClosure(applicationRoot, allPackages);

  const applicationManifestPath = join(applicationRoot, "package.json");
  const applicationManifest = readJson(applicationManifestPath);
  const applicationPackageNames = applicationDependencyClosure(
    applicationRoot,
    allPackages
  );
  applicationManifest.pnpm = {
    ...(applicationManifest.pnpm || {}),
    overrides: {
      ...(applicationManifest.pnpm?.overrides || {}),
      ...Object.fromEntries(
        Object.entries(overrides).filter(([name]) =>
          applicationPackageNames.has(name)
        )
      ),
    },
  };
  writeJson(applicationManifestPath, applicationManifest);

  assertNoPublishedWorkspaceProtocols(applicationRoot);
  const applicationInstallOutput = runCaptured(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile"],
    applicationRoot
  );
  assertReviewedBuildScripts(applicationInstallOutput, "fresh application");
  assertInstalledFromTarballs([launcherRoot, applicationRoot], tarballs);
  assertPackagedGuidance(applicationRoot);
  if (smokeLevel !== "install") {
    const checkOutput = runCaptured(
      "pnpm",
      ["exec", "openxiangda", "check", "--local", "--cwd", applicationRoot, "--json"],
      applicationRoot,
      { stdoutOnly: true }
    );
    if (/findCommand \(create\)|does not provide an export named/.test(checkOutput)) {
      fail("fresh application could not load every packed CLI command");
    }
    const checkResult = JSON.parse(checkOutput);
    if (!checkResult.ok || checkResult.data?.validationScope !== "local" || checkResult.data?.targetEnvironment !== null) {
      fail("fresh candidate validation must complete local checks without claiming target-platform evidence");
    }
    if (smokeLevel === "e2e") {
      run(
        "pnpm",
        ["--filter", "@app/web", "exec", "playwright", "install", "chromium"],
        applicationRoot
      );
      verifyMaintainerBrowserFixtures(applicationRoot);
    }
    assertNativePackageDeterminismAndTamperGate(applicationRoot);
    await assertOptionalBackendExtension(applicationRoot);
    assertApplicationCanGrow(applicationRoot);
  }

  process.stdout.write(
    `Verified ${packages.length} candidate tarball(s) with a fresh independent application at ${smokeLevel} level.\n`
  );
  if (keepScratch) process.stdout.write(`Packed smoke workspace: ${scratchRoot}\n`);
} finally {
  if (!keepScratch) rmSync(scratchRoot, { recursive: true, force: true });
}

function assertPackagedGuidance(root) {
  const sdk = findInstalledPackage(root, 'openxiangda');
  const version = readJson(join(sdk, 'package.json')).version;
  const index = JSON.parse(runCaptured('pnpm', ['exec', 'openxiangda', 'docs', '--json'], root, { stdoutOnly: true }));
  if (!index.ok || JSON.stringify(index.data.topics.map(topic => topic.id)) !== JSON.stringify(DOCUMENTATION_TOPICS.map(topic => topic.id))) fail('PACKED_DOCUMENTATION_INDEX_INVALID');
  for (const topic of index.data.topics) {
    if (topic.version !== version) fail(`PACKED_DOCUMENTATION_VERSION_MISMATCH:${topic.id}`);
  }
  const guide = JSON.parse(runCaptured('pnpm', ['exec', 'openxiangda', 'docs', 'getting-started', '--json'], root, { stdoutOnly: true }));
  if (guide.data.content.includes('__OPENXIANGDA_VERSION__') || !guide.data.content.includes(`openxiangda@${version}`)) fail('PACKED_GUIDANCE_BOOTSTRAP_VERSION_INVALID');
  if (createHash('sha256').update(guide.data.content).digest('hex') !== guide.data.sha256) fail('PACKED_GUIDANCE_DIGEST_INVALID');
  for (const id of ['product-design', 'interaction-patterns']) {
    const designGuide = JSON.parse(runCaptured('pnpm', ['exec', 'openxiangda', 'docs', id, '--json'], root, { stdoutOnly: true }));
    if (!designGuide.ok || designGuide.data.version !== version || Buffer.byteLength(designGuide.data.content) < 1000 || createHash('sha256').update(designGuide.data.content).digest('hex') !== designGuide.data.sha256) fail(`PACKED_DESIGN_GUIDANCE_INVALID:${id}`);
  }
  const agents = join(root, 'AGENTS.md');
  const ownText = '\n## 项目测试约定\n保留本项目内容\n';
  writeFileSync(agents, readFileSync(agents, 'utf8') + ownText);
  const installed = JSON.parse(runCaptured('pnpm', ['exec', 'openxiangda', 'skill', 'install', '--workspace', root, '--force', '--skip-support', '--json'], root, { stdoutOnly: true }));
  if (!installed.ok || !readFileSync(agents, 'utf8').endsWith(ownText)) fail('PACKED_GUIDANCE_OVERWROTE_PROJECT_RULES');
  const skill = readFileSync(join(root, '.agents/skills/openxiangda-v2/SKILL.md'), 'utf8');
  if (!skill.includes(`openxiangda@${version}`)) fail('PACKED_PROJECT_SKILL_VERSION_INVALID');
  process.stdout.write('Verified packed Chinese topics, version digests and project guidance preservation.\n');
}

function verifyMaintainerBrowserFixtures(root) {
  const fixture = join(repositoryRoot, 'scripts/fixtures/platform-browser');
  const web = join(root, 'apps/web');
  const installed = [];
  try {
    for (const entry of readdirSync(fixture)) {
      const target = join(web, entry);
      if (existsSync(target)) fail(`MAINTAINER_BROWSER_FIXTURE_CONFLICT:${entry}`);
      cpSync(join(fixture, entry), target, { recursive: true, errorOnExist: true, force: false });
      installed.push(target);
      // 测试材料属于平台维护者，但运行时标识必须属于本次真实生成的应用。
      const adapt = (path) => {
        if (statSync(path).isDirectory()) {
          for (const name of readdirSync(path)) adapt(join(path, name));
        } else {
          writeFileSync(path, readFileSync(path, 'utf8')
            .replaceAll('openxiangda-application', 'packed-reference-app')
            .replaceAll('OpenXiangda 应用', 'Packed Reference App'));
        }
      };
      adapt(target);
    }
    const packages = [...candidateRuntimeRoots].map(([name, packageRoot]) => ({ name, root: packageRoot, tarball: candidateTarballs.get(name) }));
    const currentFingerprint = () => browserStageFingerprint({ applicationRoot: root, packages, runnerRoot: join(repositoryRoot, 'scripts') });
    const fingerprint = currentFingerprint();
    const commonGitDirectory = runCaptured('git', ['rev-parse', '--git-common-dir'], repositoryRoot).trim();
    runCachedStage({
      directory: resolve(repositoryRoot, commonGitDirectory, 'openxiangda-release-stage-cache'),
      stage: 'packed-browser', fingerprint, currentFingerprint, enabled: canReuseBrowserStage(),
      execute: () => run('pnpm', ['--filter', '@app/web', 'exec', 'playwright', 'test', '--config', 'playwright.platform.config.ts'], root, {
        env: { OPENXIANGDA_E2E_BASE_URL: '' },
      }),
    });
  } finally {
    for (const target of installed) rmSync(target, { recursive: true, force: true });
  }
}

function assertApplicationCanGrow(root) {
  const configPath = join(root, 'openxiangda.config.ts');
  const source = readFileSync(configPath, 'utf8');
  const routes = Array.from({ length: 9 }, (_, index) => ({
    code: `extension-${index + 1}`, path: `/extension/${index + 1}`, label: `功能 ${index + 1}`, surface: 'user',
  }));
  writeFileSync(configPath, source.replace('routes: [', `routes: [${routes.map(route => JSON.stringify(route)).join(',')},`));
  const mainPath = join(root, 'apps/web/src/main.tsx');
  let main = readFileSync(mainPath, 'utf8');
  main = main.replace(/\bappRoutes\b/g, 'runtimeRoutes').replace('  runtimeRoutes,', '  appRoutes as runtimeRoutes,');
  main = main.replace('      applicationHome: ApplicationHome,', `${routes.map((_, index) => `      extension${index + 1}: ApplicationHome,`).join('\n')}\n      applicationHome: ApplicationHome,`);
  writeFileSync(join(root, 'apps/web/src/application.tsx'), main);
  writeFileSync(mainPath, "import './application.js';\n");
  const modules = join(root, 'apps/web/src/features');
  mkdirSync(modules);
  for (let index = 0; index < 40; index++) {
    writeFileSync(join(modules, `feature-${index}.ts`), `export const feature${index} = { code: 'feature-${index}', label: 'Workflow ${index}' };\n`);
  }
  const check = (expectedStatus = 0) => JSON.parse(runCaptured('pnpm', ['exec', 'openxiangda', 'check', '--local', '--json'], root, { stdoutOnly: true, expectedStatus }));
  const result = check();
  if (!result.ok || result.data?.validationScope !== 'local') fail('EXPANDED_APPLICATION_CHECK_FAILED');
  const generated = readFileSync(join(root, 'packages/contracts/src/generated.ts'), 'utf8');
  if (!/"protectedUserRouteCount": 11/.test(generated)) fail('EXPANDED_APPLICATION_ROUTE_FIXTURE_INVALID');

  const invalidType = join(modules, 'invalid-type.ts');
  writeFileSync(invalidType, 'export const mustBeText: string = 42;\n');
  try {
    if (check(1).ok) fail('EXPANDED_APPLICATION_TYPE_ERROR_ACCEPTED');
  } finally { rmSync(invalidType); }
  const validConfig = readFileSync(configPath, 'utf8');
  writeFileSync(configPath, validConfig.replace('routes: [', `routes: [${JSON.stringify(routes[0])},`));
  try {
    if (check(1).ok) fail('EXPANDED_APPLICATION_INVALID_DECLARATION_ACCEPTED');
  } finally { writeFileSync(configPath, validConfig); }
  process.stdout.write('已验证应用扩展到 11 个用户页面、40 个业务模块、独立入口与业务类；真实类型和声明错误仍被拒绝。\n');
}

async function assertOptionalBackendExtension(root) {
  if (existsSync(join(root, "apps/server"))) fail("DEFAULT_TEMPLATE_MUST_NOT_CONTAIN_BACKEND");
  const devkitRoot = findInstalledDependency(root, "openxiangda", "openxiangda-devkit-core");
  const devkit = await import(pathToFileURL(join(devkitRoot, "dist/index.js")).href);
  const manifest = readJson(join(root, "package.json"));
  const capsule = devkit.createToolchainCapsule({ openxiangda: manifest.devDependencies.openxiangda });
  const configPath = join(root, "openxiangda.config.ts");
  const source = readFileSync(configPath, "utf8");
  cpSync(join(repositoryRoot, "examples/business-action-extension/extension.config.ts"), join(root, "extension.config.ts"));
  writeFileSync(configPath, "import { businessExtension } from './extension.config.js';\n" + source.replace(
    "modules: [],", "...businessExtension('packed-reference-app'),"
  ));
  const workspace = await devkit.loadWorkspace(root);
  const initialized = devkit.initializeOptionalBackend(root, workspace.config, { sdkVersion: capsule.packages.openxiangda });
  if (!initialized.created || !initialized.installed) fail("OPTIONAL_BACKEND_INITIALIZATION_INCOMPLETE");
  assertPublicNotificationSurface(join(root, "apps/server"));
  writeFileSync(join(root, "apps/server/src/submit.controller.ts"), readFileSync(join(repositoryRoot, "examples/business-action-extension/submit.controller.ts"), 'utf8').replaceAll('SubmitController', 'WorkflowSubmitController'));
  const modulePath = join(root, "apps/server/src/app.module.ts");
  writeFileSync(modulePath, "import { WorkflowSubmitController } from './submit.controller.js';\n" + readFileSync(modulePath, "utf8").replace(
    "@Module({", "@Module({\n  controllers: [WorkflowSubmitController],"
  ));
  const checked = await new devkit.OpenXiangdaApplicationServices({ toolchainCapsule: capsule }).check(root);
  if (!checked.ok) fail(`OPTIONAL_BACKEND_CHECK_FAILED:${JSON.stringify(checked.diagnostics)}`);
  const second = devkit.initializeOptionalBackend(root, workspace.config, { sdkVersion: capsule.packages.openxiangda });
  if (second.created || second.installed || !readFileSync(modulePath, "utf8").includes("SubmitController")) fail("OPTIONAL_BACKEND_OVERWROTE_APPLICATION_SOURCE");
  process.stdout.write("Verified the same packed application before and after opting into a real Nest business action.\n");
}

async function createPackedWorkspace(launcher, target) {
  const creatorPath = join(
    findInstalledDependency(launcher, "openxiangda", "openxiangda-cli"),
    "dist",
    "create-workspace.js"
  );
  const creator = await import(pathToFileURL(creatorPath).href);
  await creator.createWorkspace({
    directory: target,
    appCode: "packed-reference-app",
    name: "Packed Reference App",
    install: false,
  });
}

function assertRepeatablePack(packageName, expectedTarball) {
  const repeatRoot = join(scratchRoot, "repeat-pack", packageName);
  mkdirSync(repeatRoot, { recursive: true });
  run(
    "pnpm",
    ["--filter", packageName, "pack", "--pack-destination", repeatRoot],
    repositoryRoot
  );
  const created = readdirSync(repeatRoot).filter(name => name.endsWith(".tgz"));
  if (created.length !== 1) {
    fail(`Expected one repeated tarball for ${packageName}, received ${created.length}`);
  }
  const repeatedTarball = join(repeatRoot, created[0]);
  if (!readFileSync(expectedTarball).equals(readFileSync(repeatedTarball))) {
    fail(`NON_DETERMINISTIC_PACKAGE_TARBALL: ${packageName}`);
  }
}

function assertPublicCliSurface(root) {
  const facade = readJson(join(findInstalledPackage(root, 'openxiangda'), 'package.json'));
  const legacyRoot = findInstalledDependency(root, 'openxiangda', 'openxiangda-legacy');
  const legacy = readJson(join(legacyRoot, 'package.json'));
  if (legacy.name !== 'openxiangda' || `npm:openxiangda@${legacy.version}` !== facade.dependencies['openxiangda-legacy'] || !legacy.version.startsWith('1.')) {
    fail('PACKED_LEGACY_ENGINE_IDENTITY_MISMATCH');
  }
  for (const secondBin of ["create-openxiangda", "openxiangda-mcp"]) {
    if (existsSync(join(root, "node_modules", ".bin", secondBin))) {
      fail(`packed installation exposed a second developer bin: ${secondBin}`);
    }
  }
  const dataRoot = join(scratchRoot, "fake-oclif-user-data");
  const pluginRoot = join(scratchRoot, "fake-ninth-command");
  mkdirSync(join(pluginRoot, "dist", "commands"), { recursive: true });
  mkdirSync(dataRoot, { recursive: true });
  writeJson(join(pluginRoot, "package.json"), {
    name: "openxiangda-fake-user-plugin",
    version: "1.0.0",
    type: "module",
    oclif: { commands: "./dist/commands" },
  });
  writeFileSync(
    join(pluginRoot, "dist", "commands", "ninth.js"),
    `import { Command } from "@oclif/core";
export default class Ninth extends Command { async run() { this.log("injected"); } }
`,
    "utf8"
  );
  writeJson(join(dataRoot, "package.json"), {
    private: true,
    oclif: {
      schema: 1,
      plugins: [
        { name: "openxiangda-fake-user-plugin", type: "link", root: pluginRoot },
      ],
    },
  });
  const env = { ...process.env, OPENXIANGDA_DATA_DIR: dataRoot };
  const help = runCaptured("pnpm", ["exec", "openxiangda", "--help"], root, {
    env,
  });
  const installedRootManifest = readJson(
    join(root, "node_modules", "openxiangda", "package.json")
  );
  const version = runCaptured(
    "pnpm",
    ["exec", "openxiangda", "--version"],
    root,
    { env }
  );
  if (
    !version.startsWith(
      `openxiangda/${installedRootManifest.version} `
    )
  ) {
    fail(
      `Root CLI version is not bound to openxiangda@${installedRootManifest.version}: ${version.trim()}`
    );
  }
  if (/^TOPICS$/m.test(help)) fail("openxiangda help exposed a topic tree");
  const commands = [...help.matchAll(/^  ([a-z][a-z-]*)\s{2,}/gm)]
    .map(match => match[1])
    .sort();
  const expected = publicCliCommands().sort();
  if (JSON.stringify(commands) !== JSON.stringify(expected)) {
    fail(`openxiangda help command set is ${commands.join(", ")}`);
  }
  for (const command of expected) {
    const commandHelp = runCaptured(
      "pnpm",
      ["exec", "openxiangda", command, "--help"],
      root,
      { env }
    );
    if (!commandHelp.trim()) {
      fail(`openxiangda ${command} --help returned no command help`);
    }
  }
  const injected = spawnSync(
    "pnpm",
    ["exec", "openxiangda", "ninth", "--json"],
    { cwd: root, env, encoding: "utf8" }
  );
  if (injected.status !== 2 || injected.stderr) {
    fail("fake Oclif plugin was not rejected through the stable JSON boundary");
  }
  const envelope = JSON.parse(String(injected.stdout || ""));
  if (envelope.error?.code !== "OPENXIANGDA_COMMAND_NOT_FOUND") {
    fail("fake Oclif plugin command did not return command-not-found");
  }
}

function assertPublicNotificationSurface(root) {
  const supported = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'const sdk = await import("openxiangda/nest");',
        'if (sdk.OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2 !== "openxiangda.notification.business-send/v2") throw new Error("business schema export mismatch");',
        'if (sdk.OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2 !== "openxiangda.notification.event-send/v2") throw new Error("event schema export mismatch");',
        'if (typeof sdk.OpenXiangdaTodoService !== "function" || typeof sdk.OpenXiangdaLoggerService !== "function") throw new Error("optional SDK export mismatch");',
      ].join("\n"),
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (supported.status !== 0) {
    fail(
      `packed openxiangda/nest notification import failed: ${String(
        supported.stderr || supported.stdout || "unknown error"
      ).trim()}`
    );
  }

}

function assertClosedPublicSubpaths(root) {
  const unsupported = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", 'await import("openxiangda/contracts")'],
    { cwd: root, encoding: "utf8" }
  );
  const unsupportedOutput = `${unsupported.stderr || ""}\n${
    unsupported.stdout || ""
  }`;
  if (
    unsupported.status === 0 ||
    !unsupportedOutput.includes("ERR_PACKAGE_PATH_NOT_EXPORTED")
  ) {
    fail("packed openxiangda unexpectedly exposed the physical ./contracts subpath");
  }
}

function assertPublicConfigCompatibility(root) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'const config = await import("openxiangda/config");',
        'const item = config.adminApplicationTodoCenterPage({ label: "Todo Center" });',
        'if (item?.page?.kind !== "application-todo-center") throw new Error("legacy Todo Center authoring export mismatch");',
      ].join("\n"),
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (result.status !== 0) {
    fail(
      `packed openxiangda/config compatibility import failed: ${String(
        result.stderr || result.stdout || "unknown error"
      ).trim()}`
    );
  }
}

function publicCliCommands() {
  return DEVKIT_COMMANDS.map(command => command.id);
}

function buildLocalPackageOutputs(packageNames) {
  run(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      "build",
      ...packageNames.flatMap(name => ["--filter", `${name}...`]),
    ],
    repositoryRoot
  );
}

function verifyTarball(packageName, tarball) {
  const packageRoot = join(
    extractedRoot,
    packageName.replace(/^@/, "").replaceAll("/", "-")
  );
  mkdirSync(packageRoot, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", packageRoot], repositoryRoot);
  const extractedPackageRoot = join(packageRoot, "package");
  candidateRuntimeRoots.set(packageName, extractedPackageRoot);
  const manifestPath = join(extractedPackageRoot, "package.json");
  if (!existsSync(manifestPath)) fail(`${packageName} tarball has no package.json`);
  const manifest = readJson(manifestPath);
  if (manifest.name !== packageName) {
    fail(`${packageName} tarball contains manifest for ${manifest.name || "unknown"}`);
  }
  if (packageName !== "openxiangda" && manifest.bin) {
    fail(`${packageName} must not publish a second developer CLI bin`);
  }
  if (packageName === "openxiangda-skill-kit") {
    if (existsSync(join(extractedPackageRoot, "docs"))) {
      fail("openxiangda-skill-kit must not publish the documentation site");
    }
    const maximumTarballBytes = 512 * 1024;
    const tarballBytes = statSync(tarball).size;
    if (tarballBytes > maximumTarballBytes) {
      fail(
        `openxiangda-skill-kit tarball is ${tarballBytes} bytes; maximum is ${maximumTarballBytes}`
      );
    }
  }
  if (
    packageName === "openxiangda" &&
    JSON.stringify(manifest.bin) !== JSON.stringify({ openxiangda: "./bin/run.js" })
  ) {
    fail("openxiangda must publish exactly the openxiangda bin");
  }
  if (packageName === "openxiangda") {
    const skill = join(extractedPackageRoot, "skills", "openxiangda-v2", "SKILL.md");
    if (!existsSync(skill)) fail("openxiangda tarball does not contain openxiangda-v2 Skill");
    const skillSource = readFileSync(skill, "utf8");
    if (skillSource.includes("__OPENXIANGDA_VERSION__")) {
      fail("openxiangda tarball retained an unresolved Skill version token");
    }
    if (!skillSource.includes(`openxiangda@${manifest.version}`)) {
      fail("openxiangda Skill is not bound to the root package version");
    }
    if (!manifest.exports?.["./nest"] || manifest.exports?.["./contracts"]) {
      fail(
        "openxiangda must expose notification contracts through ./nest without publishing ./contracts"
      );
    }
    const nestDeclaration = readFileSync(
      join(extractedPackageRoot, "dist", "nest.d.ts"),
      "utf8"
    );
    for (const name of [
      "OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2",
      "OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2",
    ]) {
      if (!nestDeclaration.includes(name)) {
        fail(`openxiangda ./nest declaration is missing ${name}`);
      }
    }
    const backendReference = readFileSync(
      join(
        extractedPackageRoot,
        "skills",
        "openxiangda-v2",
        "references",
        "backend.md"
      ),
      "utf8"
    );
    if (
      backendReference.includes("openxiangda/contracts") ||
      !backendReference.includes("from 'openxiangda/nest'")
    ) {
      fail("openxiangda packed backend Skill references an unsupported SDK entry");
    }
  }
  if (packageName === "openxiangda-cli") {
    if (!existsSync(join(extractedPackageRoot, "template", "package.json"))) {
      fail("openxiangda-cli tarball does not contain the application template");
    }
    const commandsRoot = join(extractedPackageRoot, "dist", "commands");
    const commandFiles = readdirSync(commandsRoot, { recursive: true })
      .map(String)
      .filter(name => name.endsWith(".js"))
      .sort();
    const expected = publicCliCommands().map(name => `${name}.js`).sort();
    if (JSON.stringify(commandFiles) !== JSON.stringify(expected)) {
      fail(`openxiangda-cli tarball command set is ${commandFiles.join(", ")}`);
    }
  }
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, version] of Object.entries(manifest[section] || {})) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        fail(`${packageName} ${section}.${name} leaked ${version}`);
      }
    }
  }

  const targets = new Set();
  collectPackageTargets(manifest.main, targets);
  collectPackageTargets(manifest.types, targets);
  collectPackageTargets(manifest.bin, targets);
  collectPackageTargets(manifest.exports, targets);
  for (const target of targets) {
    const path = resolve(extractedPackageRoot, target);
    if (!path.startsWith(`${extractedPackageRoot}/`) && path !== extractedPackageRoot) {
      fail(`${packageName} package target escapes the tarball: ${target}`);
    }
    if (!existsSync(path)) fail(`${packageName} package target is missing: ${target}`);
  }

  for (const target of Object.values(manifest.bin || {})) {
    if (typeof target !== "string") continue;
    const path = resolve(extractedPackageRoot, target);
    const source = readFileSync(path, "utf8");
    if (!source.startsWith("#!/usr/bin/env node")) {
      fail(`${packageName} bin target has no Node shebang: ${target}`);
    }
    if ((statSync(path).mode & 0o111) === 0) {
      fail(`${packageName} bin target is not executable: ${target}`);
    }
  }
  for (const file of packageFiles(extractedPackageRoot)) {
    const content = readFileSync(file, "utf8");
    for (const retired of RETIRED_PACKAGE_NAMES) {
      if (containsPackageName(content, retired)) {
        fail(
          `${packageName} tarball retained retired package name ${retired} in ${relative(extractedPackageRoot, file)}`
        );
      }
    }
  }
}

function containsPackageName(source, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9-])${escaped}(?![a-z0-9-])`, "m").test(source);
}

function packageFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files;
}

function collectPackageTargets(value, targets) {
  if (typeof value === "string") {
    if (value.startsWith("./")) targets.add(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) collectPackageTargets(nested, targets);
}

function assertNoPublishedWorkspaceProtocols(root) {
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.isFile() || entry.name !== "package.json") continue;
      const manifest = readJson(path);
      for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const [name, version] of Object.entries(manifest[section] || {})) {
          if (
            isOpenXiangdaPackageName(name) &&
            typeof version === "string" &&
            version.startsWith("workspace:")
          ) {
            fail(
              `${relative(root, path)} still contains ${section}.${name}=${version}`
            );
          }
        }
      }
    }
  }
}

function assertGeneratedIdentity(root, appCode, appName) {
  const webSourceRoot = join(root, "apps", "web", "src");
  const mainSource = readFileSync(join(webSourceRoot, "main.tsx"), "utf8");
  const config = readFileSync(join(root, "openxiangda.config.ts"), "utf8");
  const html = readFileSync(join(root, "apps", "web", "index.html"), "utf8");
  for (const [label, source, expected] of [
    ["React application code binding", mainSource, "appCode={appCode}"],
    ["React application name binding", mainSource, "appName={appName}"],
    ["Application config code", config, `code: '${appCode}'`],
    ["Application config name", config, `name: '${appName}'`],
    ["Application document title", html, `<title>${appName}</title>`],
  ]) {
    if (!source.includes(expected)) {
      fail(`${label} invariant is missing: ${expected}`);
    }
  }
  for (const retiredSource of ["runtime-meta.ts", "Shell.tsx"]) {
    if (existsSync(join(webSourceRoot, retiredSource))) {
      fail(`Fresh application copied platform-owned source: ${retiredSource}`);
    }
  }
  for (const [label, source] of [
    ["React entry", mainSource],
    ["Application config", config],
    ["Application HTML", html],
  ]) {
    for (const placeholder of [
      "procurement-center",
      "企业采购中心",
    ]) {
      if (source.includes(placeholder)) {
        fail(`${label} retained the template identity placeholder: ${placeholder}`);
      }
    }
  }
  const workspacePolicy = readFileSync(
    join(root, "pnpm-workspace.yaml"),
    "utf8"
  );
  if (
    !/^strictDepBuilds:\s*true$/m.test(workspacePolicy) ||
    !/^\s*-\s+esbuild\s*$/m.test(workspacePolicy)
  ) {
    fail("Fresh application does not enforce its reviewed dependency build policy");
  }
}

function assertGeneratedDependencyClosure(root, packages) {
  const versions = new Map(
    packages.map(item => [item.manifest.name, item.manifest.version])
  );
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", ".openxiangda"].includes(entry.name)) {
        continue;
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile() || entry.name !== "package.json") continue;
      const manifest = readJson(path);
      for (const section of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
      ]) {
        for (const [name, version] of Object.entries(manifest[section] || {})) {
          if (!isOpenXiangdaPackageName(name)) continue;
          const candidateVersion = versions.get(name);
          if (!candidateVersion) {
            fail(`Fresh application depends on a missing candidate: ${name}`);
          }
          if (version !== candidateVersion) {
            fail(
              `Fresh application pins ${name}@${version}; candidate is ${candidateVersion}`
            );
          }
        }
      }
    }
  };
  visit(root);
}

function applicationDependencyClosure(root, packages) {
  const packageByName = new Map(
    packages.map(item => [item.manifest.name, item.manifest])
  );
  const selected = new Set();
  const queue = [];
  const visitManifest = manifest => {
    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const name of Object.keys(manifest[section] || {})) {
        if (!isOpenXiangdaPackageName(name) || selected.has(name)) continue;
        selected.add(name);
        queue.push(name);
      }
    }
  };
  const visitDirectory = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", ".openxiangda"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visitDirectory(path);
      else if (entry.isFile() && entry.name === "package.json") {
        visitManifest(readJson(path));
      }
    }
  };
  visitDirectory(root);
  while (queue.length) {
    const name = queue.shift();
    const manifest = packageByName.get(name);
    if (manifest) visitManifest(manifest);
  }
  return selected;
}

function isOpenXiangdaPackageName(name) {
  return name === "openxiangda" || name.startsWith("openxiangda-");
}

function assertInstalledFromTarballs(roots, tarballs) {
  for (const packageName of tarballs.keys()) {
    const packagePath = roots
      .map(root => findInstalledPackage(root, packageName))
      .find(Boolean);
    if (!packagePath) {
      fail(`Fresh application did not install candidate ${packageName}`);
    }
    const installedRoot = realpathSync(packagePath);
    if (installedRoot.startsWith(repositoryRoot)) {
      fail(`${packageName} resolved to the source workspace instead of a tarball`);
    }
  }
}

function assertNativePackageDeterminismAndTamperGate(root) {
  const image =
    "registry.invalid/openxiangda/native-reference@sha256:" + "c".repeat(64);
  mkdirSync(join(root, ".openxiangda"), { recursive: true });
  const buildProbe = join(root, ".openxiangda", "build-probe.mjs");
  writeFileSync(
    buildProbe,
    `import { OpenXiangdaApplicationServices } from "openxiangda/testing";
const result = await new OpenXiangdaApplicationServices().build({
  root: process.argv[2],
  backendImage: process.argv[3],
  skipWorkspaceBuild: true,
});
if (!result.ok) throw new Error(result.diagnostics.map(item => item.code).join(","));
`,
    "utf8"
  );
  const build = () => run("node", [buildProbe, root, image], root);
  const snapshot = () => {
    const buildRoot = join(root, ".openxiangda", "build");
    const manifestBytes = readFileSync(join(buildRoot, "app-package.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const artifacts = new Map(
      manifest.artifacts.map(item => [
        item.digest,
        readFileSync(join(buildRoot, "artifacts", item.digest)),
      ])
    );
    return { manifest, manifestBytes, artifacts };
  };

  build();
  const first = snapshot();
  build();
  const second = snapshot();
  if (!first.manifestBytes.equals(second.manifestBytes)) {
    fail("Repeated Native builds produced different AppPackage bytes");
  }
  for (const [digest, bytes] of first.artifacts) {
    const repeated = second.artifacts.get(digest);
    if (!repeated || !bytes.equals(repeated)) {
      fail(`Repeated Native builds produced different artifact bytes: ${digest}`);
    }
  }
  const config = first.manifest.artifacts.find(item => item.kind === "config");
  const contracts = first.manifest.artifacts.find(
    item => item.kind === "contracts"
  );
  if (
    !config ||
    !contracts ||
    first.manifest.manifests?.config !== config.digest ||
    first.manifest.manifests?.dataContract !== contracts.digest ||
    config.metadata?.schemaVersion !== "openxiangda.config-bundle/v3" ||
    contracts.metadata?.schemaVersion !== "openxiangda.contract-bundle/v3" ||
    contracts.metadata?.configDigest !== config.digest
  ) {
    fail("Fresh Native AppPackage does not close its v3 config/contracts graph");
  }

  const probePath = join(root, ".openxiangda", "verify-sealed-package.mjs");
  writeFileSync(
    probePath,
    `import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Digest, verifySealedAppPackage } from "openxiangda/testing";

const root = process.argv[2];
const buildRoot = join(root, ".openxiangda", "build");
const manifest = JSON.parse(readFileSync(join(buildRoot, "app-package.json"), "utf8"));
const digest = sha256Digest(manifest);
const content = Object.fromEntries(
  manifest.artifacts.map(item => [
    item.digest,
    readFileSync(join(buildRoot, "artifacts", item.digest)),
  ])
);
const config = manifest.artifacts.find(item => item.kind === "config");
content[config.digest] = Buffer.from("{}");
await rejects("OPENXIANGDA_ARTIFACT_DIGEST_MISMATCH", () =>
  verifySealedAppPackage({ manifest, digest }, content)
);
const forged = { ...manifest, appCode: manifest.appCode + "-forged" };
await rejects("OPENXIANGDA_PACKAGE_DIGEST_MISMATCH", () =>
  verifySealedAppPackage({ manifest: forged, digest }, {})
);
process.stdout.write("Verified deterministic Native package and tamper rejection.\\n");

async function rejects(code, operation) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === code) return;
    throw error;
  }
  throw new Error(\`Expected \${code}\`);
}
`,
    "utf8"
  );
  run("node", [probePath, root], root);
}

function findInstalledPackage(root, packageName) {
  for (const consumerRoot of [
    root,
    join(root, "apps", "web"),
    join(root, "apps", "server"),
  ]) {
    const packagePath = join(
      consumerRoot,
      "node_modules",
      ...packageName.split("/")
    );
    if (existsSync(packagePath)) return packagePath;
  }
  return undefined;
}

function findInstalledDependency(root, packageName, dependencyName) {
  const direct = findInstalledPackage(root, dependencyName);
  if (direct) return direct;
  const packageRoot = findInstalledPackage(root, packageName);
  if (!packageRoot) {
    fail(`Fresh installation does not contain ${packageName}`);
  }
  const nested = join(
    dirname(realpathSync(packageRoot)),
    ...dependencyName.split("/")
  );
  if (!existsSync(nested)) {
    fail(`${packageName} does not resolve its declared ${dependencyName} dependency`);
  }
  return nested;
}

function normalizeSmokeLevel(value) {
  if (["install", "build", "e2e"].includes(value)) return value;
  fail(`Unknown OPENXIANGDA_PACK_SMOKE_LEVEL: ${value}`);
}

function run(command, args, cwd, options = {}) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...(options.env || {}) },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== (options.expectedStatus ?? 0)) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

function runCaptured(command, args, cwd, options = {}) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== (options.expectedStatus ?? 0)) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return options.stdoutOnly ? String(result.stdout || "") : `${result.stdout || ""}\n${result.stderr || ""}`;
}

function assertReviewedBuildScripts(output, label) {
  if (/ignored build scripts:/i.test(output)) {
    fail(`${label} contains an unreviewed dependency build script`);
  }
}

function writePnpmBuildPolicy(root) {
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    [
      "strictDepBuilds: true",
      "onlyBuiltDependencies:",
      "  - core-js",
      "  - core-js-pure",
      "  - esbuild",
      "  - es5-ext",
      "",
    ].join("\n"),
    "utf8"
  );
}

function assertStrictBuildPolicy(root) {
  const probeRoot = join(root, "build-policy-probe");
  const dependencyRoot = join(probeRoot, "dependency");
  mkdirSync(dependencyRoot, { recursive: true });
  writeJson(join(probeRoot, "package.json"), {
    name: "openxiangda-build-policy-probe",
    version: "0.0.0",
    private: true,
    packageManager: "pnpm@10.15.1",
    dependencies: {
      "unreviewed-build-probe": "file:./dependency",
    },
  });
  writeJson(join(dependencyRoot, "package.json"), {
    name: "unreviewed-build-probe",
    version: "1.0.0",
    scripts: {
      postinstall: "node -e \"process.exit(0)\"",
    },
  });
  writePnpmBuildPolicy(probeRoot);
  const result = spawnSync(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile"],
    {
      cwd: probeRoot,
      env: process.env,
      encoding: "utf8",
    }
  );
  if (result.error) throw result.error;
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 || !output.includes("unreviewed-build-probe")) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail("strict dependency build policy did not reject an unreviewed script");
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fail(message) {
  throw new Error(`PACKED_DISTRIBUTION_INVALID: ${message}`);
}
