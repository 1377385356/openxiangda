import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { referenceRegistryConfiguration } from "./lib/reference-registry.mjs";
import { seedReferenceLegacyEngine } from "./lib/reference-legacy-engine.mjs";
import { resolveDockerPublishedPort } from "./lib/docker-published-port.mjs";
import { assertReferenceLockArtifactIntegrities } from "./lib/reference-lock-integrity.mjs";
import {
  registryCommandOutput,
  releaseNpmEnvironment,
  runTransientRegistryOperation,
} from "./lib/release-network-policy.mjs";
import {
  loadReleaseArtifactManifest,
  materializeReleaseArtifact,
  selectReleaseArtifacts,
} from "./lib/release-artifacts.mjs";
import {
  assertReferencePackageVersions,
  expectedPublicPackageVersions,
  resolveReferenceApplicationRoot,
  updateReferencePackageVersions,
} from "./lib/reference-application-state.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = resolveReferenceApplicationRoot(
  repositoryRoot,
  process.env.OPENXIANGDA_REFERENCE_APP_ROOT
);
const scratchRoot = mkdtempSync(
  join(tmpdir(), "openxiangda-v2-reference-acceptance-")
);
const applicationRoot = join(scratchRoot, "application");
const resolutionRoot = join(scratchRoot, "resolution");
const tarballRoot = join(scratchRoot, "tarballs");
const registryConfig = join(scratchRoot, "verdaccio.yaml");
const registryUserConfig = join(scratchRoot, "npmrc");
const runKey = randomUUID().replaceAll("-", "").slice(0, 16);
const containerName = `openxiangda-reference-registry-${runKey}`;
const volumeName = `openxiangda-reference-registry-${runKey}`;
const keepScratch = process.env.OPENXIANGDA_KEEP_REFERENCE_SMOKE === "1";
const installReferenceWorktree =
  process.env.OPENXIANGDA_REFERENCE_INSTALL_WORKTREE === "1";
const updateGenerated =
  process.env.OPENXIANGDA_REFERENCE_UPDATE_GENERATED === "1";
const selectedPackageNames = new Set(
  String(process.env.OPENXIANGDA_RELEASE_PACKAGES || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);
let containerStarted = false;
let volumeCreated = false;
process.once('exit', cleanupReferenceResources);
process.once('SIGINT', () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));

try {
  assertReferenceRepository(referenceRoot);
  mkdirSync(tarballRoot, { recursive: true });
  const packages = publicPackages();
  const artifactManifestPath =
    process.env.OPENXIANGDA_RELEASE_ARTIFACT_MANIFEST?.trim();
  const artifactCandidates = artifactManifestPath
    ? selectReleaseArtifacts(
        loadReleaseArtifactManifest(artifactManifestPath, {
          packageNames: [...selectedPackageNames],
        }),
        [...selectedPackageNames]
      )
    : [];
  const publishedCandidates = artifactManifestPath
    ? artifactCandidates.map(item => ({
        root: null,
        manifest: { name: item.name, version: item.version },
        tarball: materializeReleaseArtifact(item, tarballRoot),
      }))
    : selectedPackageNames.size
      ? packages.filter(item => selectedPackageNames.has(item.manifest.name))
      : packages;
  if (selectedPackageNames.size !== publishedCandidates.length) {
    const found = new Set(publishedCandidates.map(item => item.manifest.name));
    const missing = [...selectedPackageNames].filter(name => !found.has(name));
    if (missing.length) fail(`Unknown candidate packages: ${missing.join(", ")}`);
  }
  const expectedVersions = expectedPublicPackageVersions(repositoryRoot);
  if (!installReferenceWorktree) {
    assertReferencePackageVersions(referenceRoot, expectedVersions);
  }

  writeFileSync(
    registryConfig,
    referenceRegistryConfiguration(
      publishedCandidates.map(item => item.manifest.name)
    ),
    "utf8"
  );
  run("docker", ["volume", "create", volumeName], repositoryRoot);
  volumeCreated = true;
  run(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--publish",
      "127.0.0.1::4873",
      "--volume",
      `${registryConfig}:/verdaccio/conf/config.yaml:ro`,
      "--volume",
      `${volumeName}:/verdaccio/storage`,
      "verdaccio/verdaccio@sha256:5a13d03808135726efde69a5a16fce1e1f724a961d6d647177c22da83c0af5cd",
    ],
    repositoryRoot
  );
  containerStarted = true;
  const port = resolveDockerPublishedPort(
    (command, args) => runCaptured(command, args, repositoryRoot),
    containerName,
    "4873/tcp"
  );
  if (!port) fail("Cannot resolve the acceptance registry port");
  const registryUrl = `http://127.0.0.1:${port}`;
  await waitForRegistry(registryUrl);
  const registryToken = await createRegistryUser(registryUrl);
  const registryHost = new URL(registryUrl).host;
  writeFileSync(
    registryUserConfig,
    `registry=${registryUrl}/\n//${registryHost}/:_authToken=${registryToken}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  const legacy = await seedReferenceLegacyEngine({ repositoryRoot, registryUrl, registryToken });
  process.stdout.write(`Prepared verified auxiliary ${legacy.name}@${legacy.version} in the isolated registry.\n`);
  for (const item of publishedCandidates) {
    let tarball = item.tarball;
    if (!tarball) {
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
      tarball = join(tarballRoot, created[0]);
    }
    run(
      "npm",
      [
        "publish",
        tarball,
        "--registry",
        registryUrl,
        "--access",
        "public",
        "--tag",
        "acceptance",
        "--userconfig",
        registryUserConfig,
        "--loglevel",
        "error",
      ],
      repositoryRoot
    );
  }

  const registryEnvironment = {
    ...releaseNpmEnvironment(),
    npm_config_registry: registryUrl,
    NPM_CONFIG_REGISTRY: registryUrl,
  };
  if (installReferenceWorktree) {
    copyReferenceWorktree(referenceRoot, resolutionRoot);
    const aligned = updateReferencePackageVersions(
      resolutionRoot,
      expectedVersions
    );
    rmSync(join(resolutionRoot, "pnpm-lock.yaml"), { force: true });
    run(
      "pnpm",
      [
        "install",
        "--no-frozen-lockfile",
        "--prefer-offline",
      ],
      resolutionRoot,
      registryEnvironment
    );
    assertInstalledVersions(resolutionRoot, expectedVersions);
    run(
      "pnpm",
      ["exec", "openxiangda", "check", "--local"],
      resolutionRoot,
      registryEnvironment
    );
    assertReferenceLockArtifactIntegrities(
      join(resolutionRoot, "pnpm-lock.yaml"),
      artifactCandidates
    );
    applyResolvedReferenceWorktree(resolutionRoot, referenceRoot);
    assertReferencePackageVersions(referenceRoot, expectedVersions);
    process.stdout.write(
      `Aligned ${aligned.dependencyCount} OpenXiangda dependencies across ${aligned.changedManifestCount} reference manifests and regenerated the reference lock from frozen candidates.\n`
    );
  }
  if (artifactCandidates.length) {
    assertReferenceLockArtifactIntegrities(
      join(referenceRoot, "pnpm-lock.yaml"),
      artifactCandidates
    );
  }
  // Preparation already installed and checked the candidate to materialize its
  // exact lock. Formal acceptance runs once in verify:release, after that lock
  // is reviewed and committed. updateGenerated explicitly retains acceptance.
  if (!installReferenceWorktree || updateGenerated) {
    copyReferenceWorktree(referenceRoot, applicationRoot);
    const installOutput = await runCapturedWithRegistryRetry(
      "pnpm",
      [
        "install",
        "--frozen-lockfile",
        "--prefer-offline",
      ],
      applicationRoot,
      registryEnvironment
    );
    if (/ignored build scripts:/i.test(installOutput)) {
      fail("Reference application contains an unreviewed dependency build script");
    }
    assertInstalledVersions(applicationRoot, expectedVersions);
    run("pnpm", ["exec", "openxiangda", "check", "--local"], applicationRoot, registryEnvironment);
    run("pnpm", ["check"], applicationRoot, registryEnvironment);
    run("pnpm", ["test"], applicationRoot, registryEnvironment);
    run("pnpm", ["build"], applicationRoot, registryEnvironment);
    run("pnpm", ["test:e2e"], applicationRoot, registryEnvironment);

    if (updateGenerated) {
      cpSync(
        join(applicationRoot, "packages", "contracts", "src", "generated.ts"),
        join(referenceRoot, "packages", "contracts", "src", "generated.ts")
      );
      process.stdout.write("Updated the reference application generated contracts.\n");
    }

    process.stdout.write(
      `Verified ${publishedCandidates.length} candidate package(s) through the registry with the independent reference application.\n`
    );
  } else {
    process.stdout.write("Reference candidate prepared; commit the reviewed lock, then run verify:release for formal acceptance.\n");
  }
  if (keepScratch) {
    process.stdout.write(`Reference acceptance workspace: ${scratchRoot}\n`);
  }
} finally {
  cleanupReferenceResources();
}

function cleanupReferenceResources() {
  if (containerStarted) {
    containerStarted = false;
    runCleanup("docker", ["rm", "--force", containerName], repositoryRoot);
  }
  if (volumeCreated) {
    volumeCreated = false;
    runCleanup("docker", ["volume", "rm", "--force", volumeName], repositoryRoot);
  }
  if (!keepScratch) rmSync(scratchRoot, { recursive: true, force: true });
}

function publicPackages() {
  const packagesRoot = join(repositoryRoot, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const root = join(packagesRoot, entry.name);
      const manifestPath = join(root, "package.json");
      if (!existsSync(manifestPath)) return undefined;
      const manifest = readJson(manifestPath);
      if (manifest.private === true) return undefined;
      if (!manifest.name || !manifest.version) {
        fail(`${relative(repositoryRoot, manifestPath)} has no package identity`);
      }
      return { root, manifest };
    })
    .filter(Boolean)
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

function assertReferenceRepository(root) {
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "openxiangda.config.ts",
  ]) {
    if (!existsSync(join(root, file))) {
      fail(`Reference application is missing ${file}: ${root}`);
    }
  }
}

function copyReferenceWorktree(source, target) {
  const ignored = new Set([
    ".git",
    ".codegraph",
    ".openxiangda",
    ".turbo",
    "node_modules",
    "dist",
    "playwright-report",
    "test-results",
    ".env",
  ]);
  cpSync(source, target, {
    recursive: true,
    filter(path) {
      if (path === source) return true;
      return !ignored.has(basename(path));
    },
  });
}

function applyResolvedReferenceWorktree(source, target) {
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "apps/server/package.json",
    "apps/web/package.json",
    "packages/contracts/package.json",
    "packages/contracts/src/generated.ts",
  ]) {
    cpSync(join(source, file), join(target, file));
  }
}

function assertInstalledVersions(root, expectedVersions) {
  for (const [name, expected] of expectedVersions) {
    const candidates = [
      join(root, "node_modules", ...name.split("/"), "package.json"),
      join(root, "apps", "server", "node_modules", ...name.split("/"), "package.json"),
      join(root, "apps", "web", "node_modules", ...name.split("/"), "package.json"),
    ];
    const installed = candidates.find(existsSync);
    if (!installed) continue;
    const actual = readJson(installed).version;
    if (actual !== expected) {
      fail(`${name} installed as ${actual}; expected ${expected}`);
    }
  }
}

async function waitForRegistry(registryUrl) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(`${registryUrl}/-/ping`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  fail(`Acceptance registry did not become ready: ${lastError}`);
}

async function createRegistryUser(registryUrl) {
  const name = `acceptance-${runKey}`;
  const response = await fetch(
    `${registryUrl}/-/user/org.couchdb.user:${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _id: `org.couchdb.user:${name}`,
        name,
        password: randomUUID(),
        email: `${name}@invalid.local`,
        type: "user",
        roles: [],
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.token !== "string" || !payload.token) {
    fail(
      `Cannot create the one-time registry user: HTTP ${response.status} ${JSON.stringify(payload)}`
    );
  }
  return payload.token;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(command, args, cwd, env = process.env) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

function runCaptured(command, args, cwd, env = process.env) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

async function runCapturedWithRegistryRetry(command, args, cwd, env) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const outcome = await runTransientRegistryOperation(
    () =>
      spawnSync(command, args, {
        cwd,
        env,
        encoding: "utf8",
      }),
    {
      onRetry: ({ nextAttempt, attempts }) => {
        process.stderr.write(
          `Transient registry failure; resuming the same install (${nextAttempt}/${attempts}).\n`
        );
      },
    }
  );
  const result = outcome.result;
  if (result?.stdout) process.stdout.write(result.stdout);
  if (result?.stderr) process.stderr.write(result.stderr);
  if (result?.error) throw result.error;
  if (result?.status !== 0) {
    fail(
      `${command} ${args.join(" ")} exited with ${result?.status}; attempts=${outcome.attempts}`
    );
  }
  return registryCommandOutput(result);
}

function runCleanup(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "ignore", timeout: 2000, killSignal: 'SIGKILL' });
  if (result.error) {
    process.stderr.write(`Cleanup warning: ${result.error.message}\n`);
  }
}

function fail(message) {
  throw new Error(message);
}
