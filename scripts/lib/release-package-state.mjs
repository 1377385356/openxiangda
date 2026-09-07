import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { assertPublicPackagePolicy } from "./public-package-policy.mjs";
import { releaseNpmEnvironment } from "./release-network-policy.mjs";

export const RELEASE_PACKAGE_STATE_SCHEMA =
  "openxiangda.release-package-state/v1";

export function inspectReleasePackages(repositoryRoot, options = {}) {
  const registry = resolveReleaseRegistry(repositoryRoot, options.registry);
  const releasePackages = selectReleasePackages(
    publicPackages(repositoryRoot),
    options.packageNames
  );
  if (options.prepare !== false) {
    prepareReleaseOutputs(repositoryRoot, options.quiet === true, releasePackages);
  }
  const scratchRoot = mkdtempSync(join(tmpdir(), "openxiangda-release-state-"));
  const packages = [];
  try {
    for (const item of releasePackages) {
      const spec = `${item.manifest.name}@${item.manifest.version}`;
      const packageRoot = join(
        scratchRoot,
        item.manifest.name.replaceAll("/", "-").replaceAll("@", "")
      );
      const currentTarballs = join(packageRoot, "current-tarballs");
      mkdirSync(currentTarballs, { recursive: true });
      const currentTarball = packCurrent(
        repositoryRoot,
        item.manifest.name,
        currentTarballs,
        options.quiet
      );
      const releaseArtifact = options.artifactRoot
        ? { tarball: persistCurrentTarball(currentTarball, options.artifactRoot) }
        : {};
      const currentFiles = unpackAndDigest(
        repositoryRoot,
        currentTarball,
        join(packageRoot, "current")
      );
      assertPortablePackageFiles(currentFiles);

      if (isReleaseVersionPublished(repositoryRoot, registry, spec)) {
        const publishedTarballs = join(packageRoot, "published-tarballs");
        mkdirSync(publishedTarballs, { recursive: true });
        const publishedTarball = packPublished(
          repositoryRoot,
          registry,
          spec,
          publishedTarballs
        );
        const publishedFiles = unpackAndDigest(
          repositoryRoot,
          publishedTarball,
          join(packageRoot, "published")
        );
        const changedFiles = compareFiles(currentFiles, publishedFiles);
        if (changedFiles.length) {
          fail(
            `${spec} already exists in ${registry}, but the local package has different contents. ` +
              `Published versions are immutable; create a changeset and version the package.\n` +
              changedFiles
                .slice(0, 12)
                .map(value => `  - ${describeDifference(value)}`)
                .join("\n")
          );
        }
        packages.push({
          name: item.manifest.name,
          version: item.manifest.version,
          status: "published-unchanged",
          previousVersion: item.manifest.version,
          changedFiles: [],
          ...releaseArtifact,
        });
        continue;
      }

      const previousVersion = latestPublishedVersion(
        repositoryRoot,
        registry,
        item.manifest.name,
        item.manifest.version
      );
      let changedFiles = ["*"];
      if (previousVersion) {
        const previousTarballs = join(packageRoot, "previous-tarballs");
        mkdirSync(previousTarballs, { recursive: true });
        const previousTarball = packPublished(
          repositoryRoot,
          registry,
          `${item.manifest.name}@${previousVersion}`,
          previousTarballs
        );
        const previousRoot = join(packageRoot, "previous");
        const previousFiles = unpackAndDigest(
          repositoryRoot,
          previousTarball,
          previousRoot
        );
        changedFiles = compareFiles(currentFiles, previousFiles).map(
          difference => difference.name
        );
        changedFiles.push(
          ...manifestSemanticDifferences(
            readPackageManifest(join(packageRoot, "current")),
            readPackageManifest(previousRoot)
          )
        );
        changedFiles = [...new Set(changedFiles)].sort();
      }
      packages.push({
        name: item.manifest.name,
        version: item.manifest.version,
        status: "candidate",
        previousVersion,
        changedFiles,
        ...releaseArtifact,
      });
    }

    return {
      schema: RELEASE_PACKAGE_STATE_SCHEMA,
      registry,
      packages,
    };
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

function persistCurrentTarball(tarball, artifactRoot) {
  mkdirSync(artifactRoot, { recursive: true });
  const target = join(artifactRoot, basename(tarball));
  copyFileSync(tarball, target);
  return target;
}

function prepareReleaseOutputs(repositoryRoot, quiet, releasePackages) {
  const filters = releasePackages.flatMap(item => [
    "--filter",
    `${item.manifest.name}...`,
  ]);
  run(
    "pnpm",
    ["exec", "turbo", "run", "build", ...filters],
    repositoryRoot,
    quiet
  );
  run("node", ["scripts/generate-reference.mjs"], repositoryRoot, quiet);
}

export function publicPackages(repositoryRoot) {
  const packagesRoot = join(repositoryRoot, "packages");
  const packages = readdirSync(packagesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const root = join(packagesRoot, entry.name);
      const manifestPath = join(root, "package.json");
      if (!existsSync(manifestPath)) return undefined;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.private === true) return undefined;
      if (!manifest.name || !manifest.version) {
        fail(`${relative(repositoryRoot, manifestPath)} has no package identity`);
      }
      return { root, manifest };
    })
    .filter(Boolean)
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
  return assertPublicPackagePolicy(packages);
}

export function selectReleasePackages(packages, packageNames = []) {
  const selectedPackageNames = new Set(packageNames || []);
  if (selectedPackageNames.size === 0) return packages;
  const selected = packages.filter(item =>
    selectedPackageNames.has(item.manifest.name)
  );
  if (selectedPackageNames.size !== selected.length) {
    const found = new Set(selected.map(item => item.manifest.name));
    const missing = [...selectedPackageNames].filter(name => !found.has(name));
    fail(`Unknown release packages: ${missing.join(", ")}`);
  }
  return selected;
}

export function assertCandidateVersionsAvailable(
  repositoryRoot,
  registry,
  candidates
) {
  for (const candidate of candidates) {
    const spec = `${candidate.name}@${candidate.version}`;
    if (isReleaseVersionPublished(repositoryRoot, registry, spec)) {
      fail(`${spec} was published while validation was running; refusing to continue`);
    }
  }
}

export function resolveReleaseRegistry(repositoryRoot, configured) {
  const value =
    configured ||
    process.env.OPENXIANGDA_NPM_REGISTRY ||
    process.env.npm_config_registry ||
    process.env.NPM_CONFIG_REGISTRY;
  if (value) return String(value).replace(/\/$/, "");
  return runCaptured(
    "npm",
    ["config", "get", "registry"],
    repositoryRoot
  ).replace(/\/$/, "");
}

export function isReleaseVersionPublished(repositoryRoot, registry, spec) {
  const result = spawnSync(
    "npm",
    ["view", spec, "version", "--json", "--registry", registry],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: releaseNpmEnvironment(),
    }
  );
  if (result.status === 0) return true;
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (isNpmPackageNotFound(output)) return false;
  fail(`Cannot inspect ${spec} in ${registry}: ${redact(output).trim()}`);
}

function latestPublishedVersion(repositoryRoot, registry, name, currentVersion) {
  const result = spawnSync(
    "npm",
    ["view", name, "versions", "--json", "--registry", registry],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: releaseNpmEnvironment(),
    }
  );
  if (result.error) throw result.error;
  const diagnostic = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    if (isNpmPackageNotFound(diagnostic)) return null;
    fail(
      `Cannot inspect version history for ${name} in ${registry}: ${redact(
        diagnostic
      ).trim()}`
    );
  }
  const output = String(result.stdout || "").trim();
  let versions;
  try {
    versions = JSON.parse(output);
  } catch {
    fail(`npm view returned invalid version history for ${name}`);
  }
  const values = Array.isArray(versions)
    ? versions
    : typeof versions === "string"
      ? [versions]
      : [];
  const current = parseReleaseVersion(currentVersion);
  return (
    values
      .filter(value => value !== currentVersion)
      .filter(value => sameReleaseLine(parseReleaseVersion(value), current))
      .filter(value => compareReleaseVersions(value, currentVersion) < 0)
      .sort(compareReleaseVersions)
      .at(-1) || null
  );
}

export function isNpmPackageNotFound(output) {
  return /(?:\bE404\b|\b404 Not Found\b|is not in this registry)/i.test(
    String(output || "")
  );
}

function sameReleaseLine(left, right) {
  return left.core.every((value, index) => value === right.core[index]);
}

export function compareReleaseVersions(left, right) {
  const a = parseReleaseVersion(left);
  const b = parseReleaseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (!a.pre.length && b.pre.length) return 1;
  if (a.pre.length && !b.pre.length) return -1;
  const length = Math.max(a.pre.length, b.pre.length);
  for (let index = 0; index < length; index += 1) {
    if (a.pre[index] === undefined) return -1;
    if (b.pre[index] === undefined) return 1;
    const aNumber = /^\d+$/.test(a.pre[index]) ? Number(a.pre[index]) : null;
    const bNumber = /^\d+$/.test(b.pre[index]) ? Number(b.pre[index]) : null;
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) {
      return aNumber - bNumber;
    }
    if (aNumber !== null && bNumber === null) return -1;
    if (aNumber === null && bNumber !== null) return 1;
    const compared = a.pre[index].localeCompare(b.pre[index]);
    if (compared) return compared;
  }
  return 0;
}

export function parseReleaseVersion(value) {
  const [corePart, prePart = ""] = String(value).replace(/^v/, "").split("-");
  return {
    core: [...corePart.split(".").map(item => Number(item) || 0), 0, 0, 0].slice(0, 3),
    pre: prePart.split(".").filter(Boolean),
  };
}

function packCurrent(repositoryRoot, packageName, destination, quiet) {
  const before = new Set(readdirSync(destination));
  run(
    "pnpm",
    ["--filter", packageName, "pack", "--pack-destination", destination],
    repositoryRoot,
    quiet
  );
  const created = readdirSync(destination).filter(
    name => name.endsWith(".tgz") && !before.has(name)
  );
  if (created.length !== 1) {
    fail(`Expected one current tarball for ${packageName}, received ${created.length}`);
  }
  return join(destination, created[0]);
}

function packPublished(repositoryRoot, registry, spec, destination) {
  const output = runCaptured(
    "npm",
    [
      "pack",
      spec,
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      destination,
      "--registry",
      registry,
    ],
    repositoryRoot
  );
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    fail(`npm pack returned invalid JSON for ${spec}`);
  }
  const filename = result?.[0]?.filename;
  if (!filename || !existsSync(join(destination, basename(filename)))) {
    fail(`npm pack did not create the published tarball for ${spec}`);
  }
  return join(destination, basename(filename));
}

function unpackAndDigest(repositoryRoot, tarball, destination) {
  mkdirSync(destination, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", destination], repositoryRoot, true);
  const root = join(destination, "package");
  if (!existsSync(root)) fail(`Invalid npm tarball: ${tarball}`);
  const files = new Map();
  walk(root, path => {
    const name = relative(root, path);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      files.set(name, `link:${readlinkSync(path)}`);
      return;
    }
    if (!stat.isFile()) return;
    const content = readFileSync(path);
    files.set(
      name,
      createHash("sha256")
        .update(
          name === "package.json"
            ? canonicalJson(JSON.parse(content.toString("utf8")))
            : content
        )
        .digest("hex")
    );
  });
  return files;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function assertPortablePackageFiles(files) {
  const invalid = [...files.keys()].filter(name => /(?:^|\/)(?:node_modules|\.turbo|\.git|coverage|test-results|playwright-report)(?:\/|$)/.test(name));
  if (invalid.length) throw new Error(`RELEASE_PACKAGE_LOCAL_ARTIFACT_FORBIDDEN: ${invalid.slice(0, 12).join(', ')}`);
}

function readPackageManifest(root) {
  return JSON.parse(readFileSync(join(root, "package", "package.json"), "utf8"));
}

export function manifestSemanticDifferences(current, previous) {
  const differences = [];
  walkJson(current, previous, "", differences);
  return differences
    .filter(path => path && path !== "version")
    .filter(path => !isPropagatedInternalDependency(path, current, previous))
    .map(path => `package.json#${path}`);
}

function walkJson(current, previous, path, differences) {
  if (Object.is(current, previous)) return;
  if (Array.isArray(current) && Array.isArray(previous)) {
    if (current.length !== previous.length) {
      differences.push(path);
      return;
    }
    for (let index = 0; index < current.length; index += 1) {
      walkJson(current[index], previous[index], `${path}[${index}]`, differences);
    }
    return;
  }
  if (
    current === null ||
    previous === null ||
    typeof current !== "object" ||
    typeof previous !== "object" ||
    Array.isArray(current) ||
    Array.isArray(previous)
  ) {
    differences.push(path);
    return;
  }
  const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  for (const key of [...keys].sort()) {
    walkJson(current[key], previous[key], path ? `${path}.${key}` : key, differences);
  }
}

function isPropagatedInternalDependency(path, current, previous) {
  const match = /^(dependencies|optionalDependencies|peerDependencies)\.(openxiangda-[^.]+)$/.exec(
    path
  );
  if (!match) return false;
  const [section, name] = match.slice(1);
  const currentValue = current?.[section]?.[name];
  const previousValue = previous?.[section]?.[name];
  return (
    typeof currentValue === "string" &&
    typeof previousValue === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(currentValue) &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(previousValue)
  );
}

function walk(root, visit) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path, visit);
    else visit(path);
  }
}

function compareFiles(current, published) {
  const differences = [];
  const names = new Set([...current.keys(), ...published.keys()]);
  for (const name of [...names].sort()) {
    if (!current.has(name)) differences.push({ name, kind: "missing-locally" });
    else if (!published.has(name)) differences.push({ name, kind: "added-locally" });
    else if (current.get(name) !== published.get(name)) {
      differences.push({ name, kind: "content-changed" });
    }
  }
  return differences;
}

function describeDifference(difference) {
  if (difference.kind === "missing-locally") return `${difference.name}: missing locally`;
  if (difference.kind === "added-locally") return `${difference.name}: added locally`;
  return `${difference.name}: content changed`;
}

function run(command, args, cwd, quiet = false) {
  const result = spawnSync(command, args, {
    cwd,
    env: command === "npm" ? releaseNpmEnvironment() : process.env,
    stdio: quiet ? "ignore" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

function runCaptured(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: command === "npm" ? releaseNpmEnvironment() : process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} failed: ${redact(
        `${result.stdout || ""}\n${result.stderr || ""}`
      ).trim()}`
    );
  }
  return String(result.stdout || "").trim();
}

function redact(value) {
  return String(value).replace(/(token|password|secret)=\S+/gi, "$1=[redacted]");
}

function fail(message) {
  throw new Error(message);
}
