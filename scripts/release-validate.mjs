import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseVersionsMaterialized } from "./lib/release-changeset-state.mjs";
import {
  assertCandidateVersionsAvailable,
  inspectReleasePackages,
} from "./lib/release-package-state.mjs";
import {
  assertPublicArtifactManifest,
  loadReleaseArtifactManifest,
} from "./lib/release-artifacts.mjs";
import { runReleaseCommand } from "./lib/release-command.mjs";
import { createReleaseValidationPlan } from "./lib/release-validation-plan.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const artifactManifestPath =
  process.env.OPENXIANGDA_RELEASE_ARTIFACT_MANIFEST?.trim();
assertReleaseVersionsMaterialized(repositoryRoot);
const packageState = artifactManifestPath
  ? packageStateFromArtifacts(artifactManifestPath)
  : inspectReleasePackages(repositoryRoot, { quiet: true });
const plan = createReleaseValidationPlan(packageState, { full });
const candidateNames = plan.candidates.map(item => item.name);
const validationPackageNames = full
  ? packageState.packages.map(item => item.name)
  : candidateNames;

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
const verificationStarted = Date.now();
const budgetSeconds = Number(process.env.OPENXIANGDA_RELEASE_VERIFY_TIMEOUT_SECONDS ||
  (full ? 1800 : plan.gates.freshApplication === "e2e" ? 900 : 300));
if (!Number.isSafeInteger(budgetSeconds) || budgetSeconds < 1) throw new Error("RELEASE_VERIFICATION_BUDGET_INVALID");
await run("node", ["scripts/verify-v2-boundary.mjs"]);
await run("node", ["scripts/verify-workspace-orchestration.mjs"]);
const releaseScriptTests = readdirSync(resolve(repositoryRoot, "scripts", "test"))
  .filter(name => name.endsWith(".test.mjs")).sort().map(name => `scripts/test/${name}`);
if (!releaseScriptTests.length) throw new Error("RELEASE_SCRIPT_TESTS_MISSING");
await run("node", ["--test", ...releaseScriptTests]);

// Build required dependencies, then reject cheap guidance/doc errors before any
// package test, fresh-application/browser suite or reference registry setup.
await run("pnpm", ["exec", "turbo", "run", "build", ...candidateNames.flatMap(name => ["--filter", `${name}...`])]);
if (plan.gates.skills) await run("pnpm", ["skills:check:from-build"]);
if (plan.gates.documentation) await run("pnpm", ["docs:build:from-build"]);
if (full) {
  await run("pnpm", ["verify"]);
} else if (plan.workspacePackages.length) {
  await run("pnpm", ["exec", "turbo", "run", "check", "test", ...plan.workspacePackages.flatMap(name => ["--filter", name])]);
}
if (plan.gates.templateGeneratedCheck) await run("pnpm", ["template:generated:check"]);
await run("node", ["scripts/verify-packed-distribution.mjs"], {
  env: {
    ...process.env,
    OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(","),
    OPENXIANGDA_PACK_SMOKE_LEVEL: plan.gates.freshApplication,
  },
});
if (plan.gates.referenceApplication) {
  await run("pnpm", ["reference:smoke:from-build"], {
    env: { ...process.env, OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(",") },
  });
}
process.stdout.write(`[release-validation] total=${Math.round((Date.now() - verificationStarted) / 1000)}s budget=${budgetSeconds}s\n`);

assertCandidateVersionsAvailable(
  repositoryRoot,
  packageState.registry,
  plan.candidates
);
process.stdout.write("Release validation plan completed successfully.\n");

function packageStateFromArtifacts(path) {
  const head = runCaptured("git", ["rev-parse", "HEAD"]);
  const manifest = assertPublicArtifactManifest(
    loadReleaseArtifactManifest(path, { head })
  );
  return {
    schema: "openxiangda.release-package-state/v1",
    registry: manifest.registry,
    packages: manifest.packages.map(item => ({
      name: item.name,
      version: item.version,
      status: item.status,
      previousVersion: item.previousVersion,
      changedFiles: item.changedFiles,
    })),
  };
}

function run(command, args, options = {}) {
  return runReleaseCommand(command, args, {
    cwd: repositoryRoot,
    env: { ...(options.env || process.env), OPENXIANGDA_RELEASE_FULL_VALIDATION: full ? "1" : "0" },
    timeoutMs: budgetSeconds * 1000 - (Date.now() - verificationStarted),
  });
}

function runCaptured(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return String(result.stdout || "").trim();
}
