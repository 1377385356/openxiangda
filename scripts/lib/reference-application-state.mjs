import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertPublicPackagePolicy } from "./public-package-policy.mjs";

const REFERENCE_MANIFEST_FILES = [
  "package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
];

const GIT_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function resolveReferenceApplicationRoot(repositoryRoot, explicit) {
  if (explicit?.trim()) return resolve(explicit);
  let parent = dirname(repositoryRoot);
  while (true) {
    const candidate = join(parent, "openxiangda-v2-reference-app");
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  return resolve(repositoryRoot, "..", "openxiangda-v2-reference-app");
}

export function inspectReferenceReleaseEvidence(root) {
  const referenceRoot = resolve(root);
  assertReferenceFile(referenceRoot, "package.json");
  assertReferenceFile(referenceRoot, "pnpm-lock.yaml");
  assertReferenceWorktreeClean(referenceRoot);

  const branch = referenceGit(referenceRoot, ["branch", "--show-current"]);
  if (branch !== "master") {
    throw new Error(
      `REFERENCE_RELEASE_BRANCH_INVALID: expected master; received ${branch || "detached HEAD"}`
    );
  }

  referenceGit(referenceRoot, ["fetch", "--quiet", "origin", "master"]);
  const head = referenceGit(referenceRoot, ["rev-parse", "HEAD"]);
  const originHead = referenceGit(referenceRoot, [
    "rev-parse",
    "refs/remotes/origin/master",
  ]);
  if (head !== originHead) {
    throw new Error(
      `REFERENCE_RELEASE_HEAD_NOT_SYNCHRONIZED: ${head} != origin/master ${originHead}`
    );
  }

  const evidence = {
    head,
    packageJsonSha256: referenceFileSha256(referenceRoot, "package.json"),
    pnpmLockSha256: referenceFileSha256(referenceRoot, "pnpm-lock.yaml"),
  };

  assertReferenceWorktreeClean(referenceRoot);
  const finalHead = referenceGit(referenceRoot, ["rev-parse", "HEAD"]);
  if (finalHead !== head) {
    throw new Error(
      `REFERENCE_RELEASE_CHANGED_DURING_INSPECTION: ${head} != ${finalHead}`
    );
  }
  return assertReferenceReleaseEvidence(evidence);
}

export function assertReferenceReleaseEvidence(value) {
  if (
    !value ||
    !GIT_HEAD_PATTERN.test(String(value.head || "")) ||
    !SHA256_PATTERN.test(String(value.packageJsonSha256 || "")) ||
    !SHA256_PATTERN.test(String(value.pnpmLockSha256 || ""))
  ) {
    throw new Error("REFERENCE_RELEASE_EVIDENCE_INVALID");
  }
  return value;
}

export function assertReferenceReleaseEvidenceMatches(expected, actual) {
  assertReferenceReleaseEvidence(expected);
  assertReferenceReleaseEvidence(actual);
  for (const [field, code] of [
    ["head", "REFERENCE_RELEASE_HEAD_MISMATCH"],
    ["packageJsonSha256", "REFERENCE_RELEASE_PACKAGE_JSON_MISMATCH"],
    ["pnpmLockSha256", "REFERENCE_RELEASE_PNPM_LOCK_MISMATCH"],
  ]) {
    if (expected[field] !== actual[field]) {
      throw new Error(`${code}: ${expected[field]} != ${actual[field]}`);
    }
  }
  return actual;
}

export function expectedPublicPackageVersions(repositoryRoot) {
  const versions = new Map();
  const packages = [];
  const packagesRoot = join(repositoryRoot, "packages");
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(packagesRoot, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    if (manifest.private === true) continue;
    if (!manifest.name || !manifest.version) {
      throw new Error(`REFERENCE_PACKAGE_IDENTITY_MISSING: ${manifestPath}`);
    }
    versions.set(manifest.name, manifest.version);
    packages.push({ manifest });
  }
  assertPublicPackagePolicy(packages);
  return versions;
}

export function assertReferencePackageVersions(root, expectedVersions) {
  let count = 0;
  for (const file of REFERENCE_MANIFEST_FILES) {
    const manifest = readJson(join(root, file));
    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const [name, value] of Object.entries(manifest[section] || {})) {
        if (!isOpenXiangdaPackage(name)) continue;
        count += 1;
        const expected = expectedVersions.get(name);
        if (!expected) {
          throw new Error(`Reference application depends on unknown package ${name}`);
        }
        if (value !== expected) {
          throw new Error(
            `${file} pins ${name}@${value}; current source package is ${expected}。` +
              "先运行 pnpm build 和 pnpm reference:install:from-build，" +
              "评审参考仓库差异并提交推送 master，再执行 pnpm release:plan"
          );
        }
      }
    }
  }
  if (!count) {
    throw new Error("Reference application has no OpenXiangda package dependencies");
  }
}

export function updateReferencePackageVersions(root, expectedVersions) {
  let dependencyCount = 0;
  let changedManifestCount = 0;
  for (const file of REFERENCE_MANIFEST_FILES) {
    const manifestPath = join(root, file);
    const manifest = readJson(manifestPath);
    let changed = false;
    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const [name, value] of Object.entries(manifest[section] || {})) {
        if (!isOpenXiangdaPackage(name)) continue;
        dependencyCount += 1;
        const expected = expectedVersions.get(name);
        if (!expected) {
          throw new Error(`Reference application depends on unknown package ${name}`);
        }
        if (value === expected) continue;
        manifest[section][name] = expected;
        changed = true;
      }
    }
    if (!changed) continue;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    changedManifestCount += 1;
  }
  if (!dependencyCount) {
    throw new Error("Reference application has no OpenXiangda package dependencies");
  }
  return { dependencyCount, changedManifestCount };
}

function isOpenXiangdaPackage(name) {
  return name === "openxiangda" || name.startsWith("openxiangda-");
}

function assertReferenceFile(root, file) {
  if (!existsSync(join(root, file))) {
    throw new Error(`REFERENCE_RELEASE_FILE_MISSING: ${file}`);
  }
}

function assertReferenceWorktreeClean(root) {
  const status = referenceGit(root, ["status", "--porcelain"]);
  if (status) throw new Error("REFERENCE_RELEASE_WORKTREE_DIRTY");
}

function referenceFileSha256(root, file) {
  return createHash("sha256")
    .update(readFileSync(join(root, file)))
    .digest("hex");
}

function referenceGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`REFERENCE_RELEASE_GIT_FAILED: git ${args.join(" ")}`);
  }
  return String(result.stdout || "").trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
