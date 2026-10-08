import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireReleaseProcessLock } from "./lib/release-process-lock.mjs";
import { assertReleaseVersionsMaterialized } from "./lib/release-changeset-state.mjs";
import { ensureReleaseArtifacts } from "./lib/release-artifact-preparation.mjs";
import { createReleaseValidationPlan } from "./lib/release-validation-plan.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const json = process.argv.includes("--json");
assertReleaseVersionsMaterialized(repositoryRoot);
const head = runCaptured("git", ["rev-parse", "HEAD"]);
const gitCommonDirectory = resolve(
  repositoryRoot,
  runCaptured("git", ["rev-parse", "--git-common-dir"])
);
const artifactRoot = resolve(
  gitCommonDirectory,
  `openxiangda-release-artifacts-${head}`
);
const releaseLock = acquireReleaseProcessLock(
  resolve(gitCommonDirectory, "openxiangda-release.lock")
);
let plan;
try {
  // The first plan invocation performs the expensive build/pack work. Its
  // manifest is persisted so verify/publish can consume the same bytes.
  const packageState = ensureReleaseArtifacts(repositoryRoot, {
    head,
    artifactRoot,
    quiet: json,
  });
  plan = createReleaseValidationPlan(packageState, { full });
} finally {
  releaseLock();
}

if (json) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else {
  process.stdout.write(`Release validation mode: ${plan.mode}\n`);
  process.stdout.write(
    `Candidates: ${plan.candidates.map(item => `${item.name}@${item.version}`).join(", ")}\n`
  );
  process.stdout.write(`Fresh application: ${plan.gates.freshApplication}\n`);
  process.stdout.write(
    `Reference application: ${plan.gates.referenceApplication ? "required" : "skipped"}\n`
  );
  process.stdout.write(`Skills: ${plan.gates.skills ? "required" : "skipped"}\n`);
  process.stdout.write(
    `Documentation: ${plan.gates.documentation ? "required" : "skipped"}\n`
  );
  for (const reason of plan.reasons) process.stdout.write(`- ${reason}\n`);
  process.stdout.write(`Artifacts: ${artifactRoot}/manifest.json\n`);
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
