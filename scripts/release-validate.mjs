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
run("node", ["scripts/verify-v2-boundary.mjs"]);
const releaseScriptTests = readdirSync(
  resolve(repositoryRoot, "scripts", "test")
)
  .filter(name => name.endsWith(".test.mjs"))
  .sort()
  .map(name => `scripts/test/${name}`);
if (!releaseScriptTests.length) {
  throw new Error("RELEASE_SCRIPT_TESTS_MISSING: no release planner tests were found");
}
run("node", ["--test", ...releaseScriptTests]);

if (full) {
  run("pnpm", ["verify"]);
} else {
  run("pnpm", ["exec", "turbo", "run", "check", "test", "build", ...candidateNames.flatMap(name => ["--filter", `${name}...`])]);
}

if (plan.gates.templateGeneratedCheck) {
  run("pnpm", ["template:generated:check"]);
}

run("node", ["scripts/verify-packed-distribution.mjs"], {
  env: {
    ...process.env,
    OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(","),
    OPENXIANGDA_PACK_SMOKE_LEVEL: plan.gates.freshApplication,
  },
});

if (plan.gates.referenceApplication) {
  run("pnpm", ["reference:smoke:from-build"], {
    env: {
      ...process.env,
      OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(","),
    },
  });
}
if (plan.gates.skills) run("pnpm", ["skills:check:from-build"]);
if (plan.gates.documentation) run("pnpm", ["docs:build:from-build"]);

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
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: options.env || process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
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
