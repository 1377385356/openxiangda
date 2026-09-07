import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReferencePackageVersions,
  expectedPublicPackageVersions,
  resolveReferenceApplicationRoot,
} from "./lib/reference-application-state.mjs";
import { resolveReleaseRegistry } from "./lib/release-package-state.mjs";
import { unexpectedReferenceChanges } from "./lib/published-reference-lock-state.mjs";
import {
  registryCommandOutput,
  releaseNpmEnvironment,
  runTransientRegistryOperation,
} from "./lib/release-network-policy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = resolveReferenceApplicationRoot(
  repositoryRoot,
  process.env.OPENXIANGDA_REFERENCE_APP_ROOT
);
const registry = resolveReleaseRegistry(repositoryRoot);
const write = process.argv.includes("--write");
const check = process.argv.includes("--check");

if (write === check) {
  fail("Choose exactly one mode: --write or --check");
}
assertReferencePackageVersions(
  referenceRoot,
  expectedPublicPackageVersions(repositoryRoot)
);
assertReferenceMainline(referenceRoot);

const scratchRoot = mkdtempSync(
  join(tmpdir(), "openxiangda-published-reference-lock-")
);
try {
  copyReferenceWorktree(referenceRoot, scratchRoot);
  const registryEnvironment = {
    ...releaseNpmEnvironment(),
    npm_config_registry: registry,
    NPM_CONFIG_REGISTRY: registry,
  };
  await runWithRegistryRetry(
    "pnpm",
    [
      "install",
      "--lockfile-only",
      "--fix-lockfile",
      "--registry",
      registry,
    ],
    scratchRoot,
    registryEnvironment
  );
  await runWithRegistryRetry(
    "pnpm",
    ["install", "--frozen-lockfile", "--prefer-offline", "--registry", registry],
    scratchRoot,
    registryEnvironment
  );

  const sourceLock = join(referenceRoot, "pnpm-lock.yaml");
  const publishedLock = join(scratchRoot, "pnpm-lock.yaml");
  const before = existsSync(sourceLock)
    ? readFileSync(sourceLock)
    : Buffer.alloc(0);
  const after = readFileSync(publishedLock);
  const beforeSha256 = sha256(before);
  const afterSha256 = sha256(after);

  if (before.equals(after)) {
    process.stdout.write(
      `Reference lock already matches published packages (${afterSha256}).\n`
    );
  } else if (check) {
    fail(
      `REFERENCE_PUBLISHED_LOCK_STALE: ${beforeSha256} != ${afterSha256}; ` +
        "run pnpm release:sync-reference"
    );
  } else {
    copyFileSync(publishedLock, sourceLock);
    process.stdout.write(
      `Synchronized reference lock from published packages: ${beforeSha256} -> ${afterSha256}.\n`
    );
  }
} finally {
  rmSync(scratchRoot, { recursive: true, force: true });
}

function assertReferenceMainline(root) {
  if (git(root, ["branch", "--show-current"]) !== "master") {
    fail("Reference lock synchronization requires the reference master branch");
  }
  run("git", ["fetch", "--quiet", "origin", "master"], root);
  const head = git(root, ["rev-parse", "HEAD"]);
  const upstream = git(root, ["rev-parse", "origin/master"]);
  if (head !== upstream) {
    fail(`Reference master is not synchronized with origin/master: ${head} != ${upstream}`);
  }
  const status = runCaptured("git", ["status", "--porcelain"], root).trimEnd();
  const unexpected = unexpectedReferenceChanges(status);
  if (unexpected.length) {
    fail(`Reference worktree has unrelated changes:\n${unexpected.join("\n")}`);
  }
}

function copyReferenceWorktree(source, target) {
  cpSync(source, target, {
    recursive: true,
    filter(path) {
      const value = relative(source, path).replaceAll("\\", "/");
      return !/(?:^|\/)(?:\.git|\.codegraph|\.openxiangda|\.turbo|node_modules|dist|coverage|playwright-report|test-results)(?:\/|$)/.test(
        value
      );
    },
  });
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function git(root, args) {
  return runCaptured("git", args, root).trim();
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

function runCaptured(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return String(result.stdout || "");
}

async function runWithRegistryRetry(command, args, cwd, env) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const outcome = await runTransientRegistryOperation(
    () => spawnSync(command, args, { cwd, env, encoding: "utf8" }),
    {
      onRetry: ({ nextAttempt, attempts }) => {
        process.stderr.write(
          `Transient registry failure; resuming reference synchronization (${nextAttempt}/${attempts}).\n`
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
      `${command} ${args.join(" ")} exited with ${result?.status}; attempts=${outcome.attempts}; ${registryCommandOutput(result)}`
    );
  }
}

function fail(message) {
  throw new Error(message);
}
