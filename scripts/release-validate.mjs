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
  (full ? 1800 : plan.gates.freshApplication === "e2e" ? 1500 : 1200));
if (!Number.isSafeInteger(budgetSeconds) || budgetSeconds < 1) throw new Error("RELEASE_VERIFICATION_BUDGET_INVALID");
// 预算不足要在烧掉二十分钟之前就失败：fresh application 与参考应用
// 验证在冷缓存机器上需要数分钟起步，预算过小时给出可行动的失败信息。
const heavyweightGates = plan.gates.freshApplication !== "install" || plan.gates.referenceApplication;
if (heavyweightGates && budgetSeconds < 600) {
  throw new Error(
    `RELEASE_VERIFICATION_BUDGET_TOO_SMALL: this plan needs fresh-application/reference gates but the budget is ${budgetSeconds}s. ` +
      "Set OPENXIANGDA_RELEASE_VERIFY_TIMEOUT_SECONDS (>= 600) before starting."
  );
}
await run("node", ["scripts/verify-v2-boundary.mjs"]);
await run("node", ["scripts/verify-workspace-orchestration.mjs"]);
const releaseScriptTests = readdirSync(resolve(repositoryRoot, "scripts", "test"))
  .filter(name => name.endsWith(".test.mjs")).sort().map(name => `scripts/test/${name}`);
if (!releaseScriptTests.length) throw new Error("RELEASE_SCRIPT_TESTS_MISSING");
await run("node", ["--test", ...releaseScriptTests]);

// Build required dependencies, then reject cheap guidance/doc errors before any
// package test, fresh-application/browser suite or reference registry setup.
await run("pnpm", ["exec", "turbo", "run", "build", ...candidateNames.flatMap(name => ["--filter", `${name}...`])]);
// 构建完成后各门禁互不依赖，并发执行：候选 tarball 由打包分发腿自行生成；
// 参考应用已在验证开始前完成物化与钉版；浏览器阶段缓存只有一个写者
// （打包分发腿）。并发腿共享同一总预算；任一腿失败立即整体失败，
// 其余子进程由运行环境（CI job / 本地终端）回收。
const parallelGates = [];
if (plan.gates.skills) {
  parallelGates.push(run("pnpm", ["skills:check:from-build"]));
}
if (plan.gates.documentation) {
  parallelGates.push(run("pnpm", ["docs:build:from-build"]));
}
parallelGates.push(
  full
    ? run("pnpm", ["verify"])
    : plan.workspacePackages.length
      ? run("pnpm", ["exec", "turbo", "run", "check", "test", ...plan.workspacePackages.flatMap(name => ["--filter", name])])
      : Promise.resolve()
);
if (plan.gates.templateGeneratedCheck) {
  parallelGates.push(run("pnpm", ["template:generated:check"]));
}
parallelGates.push(
  run("node", ["scripts/verify-packed-distribution.mjs"], {
    env: {
      ...process.env,
      OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(","),
      OPENXIANGDA_PACK_SMOKE_LEVEL: plan.gates.freshApplication,
    },
  })
);
if (plan.gates.referenceApplication) {
  parallelGates.push(
    run("pnpm", ["reference:smoke:from-build"], {
      env: { ...process.env, OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(",") },
    })
  );
}
await Promise.all(parallelGates);
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
