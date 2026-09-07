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
  "openxiangda-devkit-core",
]);

export const RELEASE_PLAN_SCHEMA = "openxiangda.release-validation-plan/v1";

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
      if (BROWSER_CRITICAL_PACKAGES.has(candidate.name)) {
        packedSmokeLevel = "e2e";
      }
      reasons.add(`${candidate.name} affects generated application runtime behavior.`);
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

  const workspacePackages = full
    ? packageState.packages.map(item => item.name).sort()
    : candidates.map(item => item.name).sort();

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
