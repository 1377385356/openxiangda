import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
import { runReleaseCommand, stopAllReleaseCommands } from "./lib/release-command.mjs";
import { createReleaseValidationPlan } from "./lib/release-validation-plan.mjs";
import {
  canReuseReleaseStage,
  releaseStageFingerprint,
  runCachedStageAsync,
} from "./lib/release-stage-cache.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const configuredArtifactManifest =
  process.env.OPENXIANGDA_RELEASE_ARTIFACT_MANIFEST?.trim();
const artifactManifestPath = configuredArtifactManifest
  ? resolve(repositoryRoot, configuredArtifactManifest)
  : undefined;
assertReleaseVersionsMaterialized(repositoryRoot);
const packageState = artifactManifestPath
  ? packageStateFromArtifacts(artifactManifestPath)
  : inspectReleasePackages(repositoryRoot, { quiet: true });
const plan = createReleaseValidationPlan(packageState, { full });
const candidateNames = plan.candidates.map(item => item.name);
const validationPackageNames = full
  ? packageState.packages.map(item => item.name)
  : candidateNames;

const gitCommonDirectory = resolve(
  repositoryRoot,
  runCaptured("git", ["rev-parse", "--git-common-dir"])
);
const stageCacheDirectory = resolve(
  gitCommonDirectory,
  "openxiangda-release-stage-cache"
);
const stageCacheEnabled = !full && canReuseReleaseStage(process.env);

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
await runStage("boundary", () => run("node", ["scripts/verify-v2-boundary.mjs"]));
await runStage("orchestration", () => run("node", ["scripts/verify-workspace-orchestration.mjs"]));
const releaseScriptTests = readdirSync(resolve(repositoryRoot, "scripts", "test"))
  .filter(name => name.endsWith(".test.mjs")).sort().map(name => `scripts/test/${name}`);
if (!releaseScriptTests.length) throw new Error("RELEASE_SCRIPT_TESTS_MISSING");
await runStage("script-tests", () => run("node", ["--test", ...releaseScriptTests]));

// 作业化验证（D1+D2）：OPENXIANGDA_RELEASE_STAGES 选择本次执行的腿
// （core / packed / reference，逗号分隔；缺省 all）。拆分后的 workflow
// 让每条腿在独立 job 里运行（独立超时、日志与进程树），冻结字节通过
// OPENXIANGDA_RELEASE_ARTIFACT_MANIFEST 复用同一份候选制品。
const stageFilter = (process.env.OPENXIANGDA_RELEASE_STAGES || "all")
  .split(",").map(stage => stage.trim()).filter(Boolean);
const stageEnabled = stage => stageFilter.includes("all") || stageFilter.includes(stage);

// Build required dependencies, then reject cheap guidance/doc errors before any
// package test, fresh-application/browser suite or reference registry setup.
await runStage(
  "build",
  () => run("pnpm", ["exec", "turbo", "run", "build", ...candidateNames.flatMap(name => ["--filter", `${name}...`])])
);
// 构建完成后各门禁互不依赖，并发执行：候选 tarball 从 freeze/plan manifest
// 物化，不在验证阶段重打包；参考应用已在验证开始前完成物化与钉版；浏览器阶段缓存只有一个写者
// （打包分发腿）。并发腿共享同一总预算；任一腿失败立即整体失败，
// 其余子进程由运行环境（CI job / 本地终端）回收。
// OPENXIANGDA_RELEASE_SERIAL_GATES=1 保留串行路径作为逃生通道（调试或
// 低内存执行环境）。
const serialGates = process.env.OPENXIANGDA_RELEASE_SERIAL_GATES === "1";
const gates = [];
const addGate = (stage, execute, extra = {}) => gates.push(() => runStage(stage, execute, extra));
if (stageEnabled("core")) {
  if (plan.gates.skills) addGate("skills", () => run("pnpm", ["skills:check:from-build"]));
  if (plan.gates.documentation) addGate("documentation", () => run("pnpm", ["docs:build:from-build"]));
  addGate("workspace", () =>
    full
      ? run("pnpm", ["verify"])
      : plan.workspacePackages.length
        ? run("pnpm", ["exec", "turbo", "run", "check", "test", ...plan.workspacePackages.flatMap(name => ["--filter", name])])
        : Promise.resolve(),
    { workspacePackages: plan.workspacePackages }
  );
  if (plan.gates.templateGeneratedCheck) addGate("template-generated", () => run("pnpm", ["template:generated:check"]));
}
if (stageEnabled("packed")) {
  addGate("packed-distribution", () =>
    run("node", ["scripts/verify-packed-distribution.mjs"], {
      env: {
        ...process.env,
        OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(","),
        OPENXIANGDA_PACK_SMOKE_LEVEL: plan.gates.freshApplication,
      },
    }),
    { validationPackageNames, smokeLevel: plan.gates.freshApplication }
  );
}
if (stageEnabled("reference") && plan.gates.referenceApplication) {
  addGate("reference-application", () =>
    run("pnpm", ["reference:smoke:from-build"], {
      env: { ...process.env, OPENXIANGDA_RELEASE_PACKAGES: validationPackageNames.join(",") },
    }),
    { validationPackageNames }
  );
}
if (serialGates) {
  for (const gate of gates) await gate();
} else {
  // 任一门禁失败立即杀死其余门禁的进程组：孤儿持有 stdout 管道会把
  // CI 步骤拖入数分钟静默挂起，掩盖真实失败（见 release-command.mjs）。
  try {
    await Promise.all(gates.map(gate => gate()));
  } catch (error) {
    stopAllReleaseCommands();
    throw error;
  }
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
      tarball: item.tarball,
    })),
  };
}

async function runStage(stage, execute, extra = {}) {
  const context = () => ({
    head: runCaptured("git", ["rev-parse", "HEAD"]),
    artifactManifest: artifactManifestPath && existsSync(artifactManifestPath)
      ? sha256(readFileSync(artifactManifestPath))
      : null,
    lockfile: sha256(readFileSync(join(repositoryRoot, "pnpm-lock.yaml"))),
    plan,
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
    environment: Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PLAYWRIGHT_|OPENXIANGDA_(?:E2E_|LIVE_|RELEASE_(?:PACKAGES|VERIFY_|FULL_VALIDATION)|PACK_SMOKE_LEVEL)|TZ$|NODE_OPTIONS$|LANG$|CI$)/.test(key)
      )
    ),
    reference: stage === "reference-application" ? referenceFingerprint() : null,
    extra,
  });
  const fingerprint = releaseStageFingerprint({ stage, context: context() });
  return runCachedStageAsync({
    directory: stageCacheDirectory,
    stage,
    fingerprint,
    currentFingerprint: () => releaseStageFingerprint({ stage, context: context() }),
    enabled: stageCacheEnabled,
    execute,
  });
}

function referenceFingerprint() {
  const root = process.env.OPENXIANGDA_REFERENCE_APP_ROOT?.trim();
  if (!root || !existsSync(root)) return null;
  try {
    return {
      head: runCaptured("git", ["-C", root, "rev-parse", "HEAD"]),
      packageJson: sha256(readFileSync(join(root, "package.json"))),
      lockfile: sha256(readFileSync(join(root, "pnpm-lock.yaml"))),
    };
  } catch {
    return { unavailable: true };
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
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
