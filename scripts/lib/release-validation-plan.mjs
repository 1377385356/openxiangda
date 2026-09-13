const METADATA_FILES = new Set([
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
]);

const CORE_APPLICATION_PACKAGES = new Set([
  "openxiangda-cli",
  "openxiangda-contracts",
  "openxiangda-devkit-core",
  "openxiangda-nest",
]);

const BROWSER_CRITICAL_PACKAGES = new Set([
  "openxiangda-cli",
  "openxiangda-contracts",
]);

/**
 * 浏览器应用实际加载的字节：openxiangda 根包（src/browser 等前端入口）与
 * contracts 的浏览器入口。devkit-core/cli/nest/mcp/skill-kit 是 Node 侧依赖，
 * 其字节不可能进入浏览器运行时。
 */
const BROWSER_RUNTIME_PREFIXES = {
  openxiangda: [
    "src/browser/",
    "src/react",
    "src/mobile",
    "src/field-kit",
    "src/core",
    "src/styles",
  ],
  "openxiangda-contracts": null,
};

function isBrowserRuntimeChange(name, files) {
  if (name === "openxiangda-contracts") {
    // contracts 浏览器入口仅从 native-compiler 引 data-audit-access；
    // 其余 native-compiler 改动是 Node 侧共享校验器，不影响浏览器字节。
    return files.some(file =>
      !file.startsWith("src/native-compiler/")
      || file.startsWith("src/native-compiler/data-audit-access"));
  }
  const prefixes = BROWSER_RUNTIME_PREFIXES[name];
  if (!prefixes) return false;
  return files.some(file => prefixes.some(prefix => file.startsWith(prefix)) || file.endsWith(".css"));
}

export const RELEASE_PLAN_SCHEMA = "openxiangda.release-validation-plan/v1";

export function isGuidanceFile(file) {
  return /^(documentation\/|skills\/|launcher-skill\/|releases\/|docs\/)/.test(file)
    || /(?:^|\/)(?:README|CHANGELOG|AGENTS|SKILL)\.md$/.test(file)
    || /^package\.json#openxiangdaRelease(?:\.|$)/.test(file);
}

function hasRuntimeChange(candidate) {
  return !candidate.previousVersion || normalizedChangedFiles(candidate)
    .some(file => !METADATA_FILES.has(file) && !isGuidanceFile(file));
}

export function receiptRequiresReference(receipt) {
  if (receipt.referenceRequired !== undefined && typeof receipt.referenceRequired !== 'boolean') {
    throw new Error('RELEASE_REFERENCE_REQUIREMENT_INVALID');
  }
  return receipt.referenceRequired !== false; // Old receipts retain their original reference boundary.
}

export function assertReceiptReferenceRequirement(receipt, plan) {
  const required = receiptRequiresReference(receipt);
  if (receipt.referenceRequired !== undefined && required !== plan.gates.referenceApplication) {
    throw new Error('RELEASE_REFERENCE_REQUIREMENT_MISMATCH');
  }
  return required;
}

export function createReleaseValidationPlan(packageState, options = {}) {
  const full = options.full === true;
  const candidates = packageState.packages.filter(
    item => item.status === "candidate"
  );
  if (!candidates.length) {
    throw new Error(
      "RELEASE_VALIDATION_EMPTY: no unpublished package versions were found"
    );
  }

  let packedSmokeLevel = "build";
  let referenceApplication = false;
  let skills = false;
  let documentation = false;
  let templateGeneratedCheck = false;
  const reasons = new Set([
    "Every release installs real candidate tarballs into a newly generated application and completes the unified application check.",
  ]);

  for (const candidate of candidates) {
    const files = normalizedChangedFiles(candidate);
    const substantiveFiles = files.filter(file => !METADATA_FILES.has(file));
    if (!candidate.previousVersion || files.includes("*")) {
      packedSmokeLevel = "e2e";
      referenceApplication = true;
      skills = true;
      documentation = true;
      templateGeneratedCheck = true;
      reasons.add(
        `${candidate.name} has no comparable published predecessor; all gates are required.`
      );
      continue;
    }
    if (!substantiveFiles.length) {
      reasons.add(
        `${candidate.name} changes only package metadata or propagated dependency versions.`
      );
      continue;
    }

    if (substantiveFiles.every(isGuidanceFile)) {
      skills = true;
      documentation = true;
      reasons.add(`${candidate.name} changes guidance; validate content and fresh installation.`);
      continue;
    }

    if (substantiveFiles.every(file => file.startsWith("package.json#"))) {
      packedSmokeLevel = maxSmokeLevel(packedSmokeLevel, "build");
      reasons.add(`${candidate.name} changes package semantics or exports.`);
      continue;
    }

    if (candidate.name === "openxiangda" && substantiveFiles.every(file => file.startsWith("documentation/") || file.startsWith("skills/"))) {
      skills = true;
      documentation = true;
      reasons.add("Root package guidance changed; validate packaged content and fresh installation.");
      continue;
    }

    if (candidate.name === "openxiangda-skill-kit") {
      skills = true;
      documentation = true;
      reasons.add("Packaged Skills or guidance changed.");
      continue;
    }

    if (candidate.name === "openxiangda-mcp") {
      skills = true;
      documentation = true;
      reasons.add("MCP runtime changed; package tests and candidate installation are required.");
      continue;
    }

    if (candidate.name === "openxiangda-cli") {
      skills = true;
      documentation = true;
      packedSmokeLevel = maxSmokeLevel(packedSmokeLevel, "build");
      templateGeneratedCheck = true;
      if (
        substantiveFiles.some(
          file =>
            file.startsWith("template/apps/web/") ||
            file.startsWith("template/apps/server/") ||
            file.startsWith("template/platform/data/") ||
            file.startsWith("template/packages/contracts/") ||
            file.startsWith("template/packages/domain/")
        )
      ) {
        packedSmokeLevel = "e2e";
        reasons.add("The generated browser application or its contracts changed.");
      } else {
        reasons.add("The CLI-owned application creator or packaged template changed.");
      }
      continue;
    }

    if (CORE_APPLICATION_PACKAGES.has(candidate.name)) {
      packedSmokeLevel = maxSmokeLevel(packedSmokeLevel, "build");
      referenceApplication = true;
      templateGeneratedCheck = true;
      if (BROWSER_CRITICAL_PACKAGES.has(candidate.name) && isBrowserRuntimeChange(candidate.name, substantiveFiles)) {
        packedSmokeLevel = "e2e";
        reasons.add(`${candidate.name} changes bytes loaded by the generated browser application.`);
      }
      reasons.add(`${candidate.name} affects generated application toolchain behavior.`);
      continue;
    }

    if (candidate.name === "openxiangda") {
      packedSmokeLevel = maxSmokeLevel(packedSmokeLevel, "build");
      referenceApplication = true;
      if (isBrowserRuntimeChange(candidate.name, substantiveFiles)) {
        packedSmokeLevel = "e2e";
        reasons.add("Root package changes bytes loaded by the generated browser application.");
      } else {
        reasons.add("Root package changes only Node-side or launcher surfaces.");
      }
      continue;
    }

    packedSmokeLevel = "e2e";
    referenceApplication = true;
    skills = true;
    documentation = true;
    templateGeneratedCheck = true;
    reasons.add(`${candidate.name} is unmapped; fail-closed full validation is required.`);
  }

  if (full) {
    packedSmokeLevel = "e2e";
    referenceApplication = true;
    skills = true;
    documentation = true;
    templateGeneratedCheck = true;
    reasons.add("Full release audit was explicitly requested.");
  }

  // Core changes validate candidate consumers too. Metadata propagation alone
  // does not re-run every dependency's tests; Turbo still builds dependencies.
  const consumerValidation = candidates.some(candidate =>
    CORE_APPLICATION_PACKAGES.has(candidate.name) && hasRuntimeChange(candidate));
  const workspacePackages = full
    ? packageState.packages.map(item => item.name).sort()
    : candidates.filter(candidate => consumerValidation || hasRuntimeChange(candidate)).map(item => item.name).sort();

  return {
    schema: RELEASE_PLAN_SCHEMA,
    mode: full ? "full" : "incremental",
    registry: packageState.registry,
    candidates: candidates.map(candidate => ({
      name: candidate.name,
      version: candidate.version,
      previousVersion: candidate.previousVersion || null,
      changedFiles: normalizedChangedFiles(candidate),
    })),
    workspacePackages,
    gates: {
      sourceBoundary: true,
      releaseScriptTests: true,
      candidateWorkspace: true,
      candidateTarballs: true,
      freshApplication: packedSmokeLevel,
      templateGeneratedCheck,
      referenceApplication,
      skills,
      documentation,
    },
    reasons: [...reasons].sort(),
  };
}

function normalizedChangedFiles(candidate) {
  const files = Array.isArray(candidate.changedFiles)
    ? candidate.changedFiles
        .map(item => (typeof item === "string" ? item : item?.name))
        .filter(Boolean)
    : [];
  return [...new Set(files)].sort();
}

function maxSmokeLevel(left, right) {
  const rank = { install: 0, build: 1, e2e: 2 };
  return rank[left] >= rank[right] ? left : right;
}
