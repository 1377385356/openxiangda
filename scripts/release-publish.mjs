import { acquireReleaseProcessLock } from './lib/release-process-lock.mjs';
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseChannelPolicy,
  releaseDistTagsMatch,
  releaseDistTagsAreRecoverable,
} from "./lib/release-channel-policy.mjs";
import {
  artifactDigests,
  assertPublicArtifactManifest,
  loadReleaseArtifactManifest,
  writeReleaseArtifactManifest,
} from "./lib/release-artifacts.mjs";
import {
  inspectReleasePackages,
  isReleaseVersionPublished,
  resolveReleaseRegistry,
} from "./lib/release-package-state.mjs";
import { assertReleaseVersionsMaterialized } from "./lib/release-changeset-state.mjs";
import {
  isSupersededPrepublicationReceipt,
  isSupersededReferencePrepublicationReceipt,
  releaseInvocationAction,
  releasePublicationHasStarted,
  supersededCandidateArtifactIsCompatible,
} from "./lib/release-receipt-state.mjs";
import {
  assertReferenceReleaseEvidence,
  assertReferenceReleaseEvidenceMatches,
  assertReferencePackageVersions,
  expectedPublicPackageVersions,
  inspectReferenceReleaseEvidence,
  resolveReferenceApplicationRoot,
} from "./lib/reference-application-state.mjs";
import { createReleaseValidationPlan, receiptRequiresReference, assertReceiptReferenceRequirement } from "./lib/release-validation-plan.mjs";
import { runPackagePublicationStage } from "./lib/release-publication-stage.mjs";
import { planGithubRelease, synchronizeGithubRelease } from './lib/release-github.mjs';
import { releaseNpmEnvironment } from "./lib/release-network-policy.mjs";
import { archiveCompletedRelease } from "./lib/release-history.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const validateOnly = process.argv.includes("--validate-only");
const head = git(["rev-parse", "HEAD"]);
const receiptPath = resolve(
  repositoryRoot,
  git(["rev-parse", "--git-path", "openxiangda-release-receipt.json"])
);
const releaseProcessLock = acquireReleaseProcessLock(join(dirname(receiptPath), 'openxiangda-release.lock'));
process.once('exit', releaseProcessLock);
process.once('SIGINT', () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));
const artifactRoot = resolve(
  dirname(receiptPath),
  `openxiangda-release-artifacts-${head}`
);
const artifactManifestPath = join(artifactRoot, "manifest.json");

let receipt = loadReceipt();
assertAuthoritativeMainline({
  allowContained: releasePublicationHasStarted(receipt),
});
receipt = discardSupersededPrepublicationReceipt(receipt);
assertReleaseVersionsMaterialized(repositoryRoot);
const initialAction = releaseInvocationAction(receipt, { validateOnly });
let referenceApplicationRoot;
let referenceEvidenceAtStart;
if (
  receipt && receiptRequiresReference(receipt) && validateOnly &&
  (initialAction === "validate" || initialAction === "verified")
) {
  referenceApplicationRoot = resolveReferenceApplicationRoot(
    repositoryRoot,
    process.env.OPENXIANGDA_REFERENCE_APP_ROOT
  );
  referenceEvidenceAtStart = inspectReferenceReleaseEvidence(
    referenceApplicationRoot
  );
  assertReferencePackageVersions(
    referenceApplicationRoot,
    expectedPublicPackageVersions(repositoryRoot)
  );
  receipt = discardSupersededReferencePrepublicationReceipt(
    receipt,
    referenceEvidenceAtStart
  );
}
if (!receipt) {
  const registry = resolveReleaseRegistry(repositoryRoot);
  rmSync(artifactRoot, { recursive: true, force: true });
  const packageState = inspectReleasePackages(repositoryRoot, {
    registry,
    artifactRoot,
  });
  const candidates = packageState.packages.filter(
    item => item.status === "candidate"
  );
  if (!candidates.length) fail("No unpublished package versions were found; refusing an empty release.");
  const artifactManifest = writeReleaseArtifactManifest({
    path: artifactManifestPath,
    head,
    registry,
    packages: packageState.packages,
  });
  assertPublicArtifactManifest(artifactManifest);
  const artifactsByName = new Map(
    artifactManifest.packages.map(item => [item.name, item])
  );
  const referenceRequired = createReleaseValidationPlan(packageState, { full }).gates.referenceApplication;
  if (referenceRequired && !referenceEvidenceAtStart) {
    referenceApplicationRoot = resolveReferenceApplicationRoot(repositoryRoot, process.env.OPENXIANGDA_REFERENCE_APP_ROOT);
    referenceEvidenceAtStart = inspectReferenceReleaseEvidence(referenceApplicationRoot);
    assertReferencePackageVersions(referenceApplicationRoot, expectedPublicPackageVersions(repositoryRoot));
  }
  receipt = {
    schema: "openxiangda.release-receipt/v2",
    head,
    registry,
    full,
    phase: "planned",
    artifactManifestPath,
    artifactManifestSha256: artifactDigests(artifactManifestPath).sha256,
    referenceRequired,
    referenceApplication: referenceEvidenceAtStart,
    prereleaseTag: configuredPrereleaseTag(),
    candidates: candidates.map(candidate => {
      const artifact = artifactsByName.get(candidate.name);
      const priorTags =
        npmJson(
          ["view", candidate.name, "dist-tags", "--json"],
          {},
          registry
        ) || {};
      return {
        name: candidate.name,
        version: candidate.version,
        artifact: {
          sha256: artifact.sha256,
          integrity: artifact.integrity,
          size: artifact.size,
        },
        priorTags,
        channelPolicy: releaseChannelPolicy({
          candidateVersion: candidate.version,
          prereleaseTag: configuredPrereleaseTag(),
          priorTags,
        }),
      };
    }),
  };
  receipt.githubRelease = planGithubRelease(repositoryRoot, receipt);
  saveReceipt(receipt);
}
assertReceiptMatchesInvocation(receipt);
let action = releaseInvocationAction(receipt, { validateOnly });

if (action === "validate") {
  if (receiptRequiresReference(receipt)) {
    assertReferenceReleaseEvidenceMatches(receipt.referenceApplication, referenceEvidenceAtStart);
  }
  assertReceiptArtifacts(receipt);
  assertReceiptCandidatesUnpublished(receipt);
  assertRecoverableDistTags(receipt);
  run(
    "node",
    ["scripts/release-validate.mjs", ...(full ? ["--full"] : [])],
    {
      env: {
        ...process.env,
        OPENXIANGDA_RELEASE_ARTIFACT_MANIFEST:
          receipt.artifactManifestPath,
      },
    }
  );
  assertAuthoritativeMainline();
  assertReceiptCandidatesUnpublished(receipt);
  assertRecoverableDistTags(receipt);
  if (receiptRequiresReference(receipt)) {
    const referenceEvidenceAtEnd = inspectReferenceReleaseEvidence(referenceApplicationRoot);
    assertReferenceReleaseEvidenceMatches(referenceEvidenceAtStart, referenceEvidenceAtEnd);
    assertReferenceReleaseEvidenceMatches(receipt.referenceApplication, referenceEvidenceAtEnd);
  }
  receipt.phase = "validated";
  saveReceipt(receipt);
  action = "verified";
}

if (validateOnly) {
  if (action !== "verified" || receipt.phase !== "validated") {
    fail(`Release validation stopped in unexpected phase ${receipt.phase}`);
  }
  assertAuthoritativeMainline();
  assertReceiptCandidatesUnpublished(receipt);
  assertRecoverableDistTags(receipt);
  if (receiptRequiresReference(receipt)) {
    assertReferenceReleaseEvidenceMatches(receipt.referenceApplication,
      inspectReferenceReleaseEvidence(resolveReferenceApplicationRoot(repositoryRoot, process.env.OPENXIANGDA_REFERENCE_APP_ROOT)));
  }
  process.stdout.write(
    `Validated ${receipt.candidates.map(item => `${item.name}@${item.version}`).join(", ")} ` +
      `from ${receipt.head}; receipt ${receiptPath} is ready for release:publish${full ? ":full" : ""}.\n`
  );
} else {
  receipt = runPackagePublicationStage(receipt, {
    referenceRoot:
      receipt.phase === "validated" && receiptRequiresReference(receipt)
        ? resolveReferenceApplicationRoot(
            repositoryRoot,
            process.env.OPENXIANGDA_REFERENCE_APP_ROOT
          )
        : undefined,
    preflightInitialPublication: () => {
      assertAuthoritativeMainline();
      assertReceiptCandidatesUnpublished(receipt);
      assertRecoverableDistTags(receipt);
    },
    persistReceipt: saveReceipt,
    publishPackages: value => {
      assertAuthoritativeMainline({ allowContained: true });
      assertRecoverableDistTags(value);
      publishCandidateTarballs(value);
      assertPublishedContents(value);
      const published = { ...value, phase: "packages-published" };
      saveReceipt(published);
      return published;
    },
  });

  if (receipt.phase === "packages-published") {
    assertAuthoritativeMainline({ allowContained: true });
    assertRecoverableDistTags(receipt);
    for (const candidate of receipt.candidates) applyDistTags(candidate, receipt);
    waitForDistTags(receipt);
    receipt.phase = "dist-tags-synchronized";
    saveReceipt(receipt);
  }

  if (receipt.phase === "dist-tags-synchronized") {
    assertAuthoritativeMainline({ allowContained: true });
    synchronizeGitTags(receipt);
    receipt.githubReleaseResult = synchronizeGithubRelease(receipt.githubRelease);
    receipt.phase = "complete";
    saveReceipt(receipt);
  }

  const historyDirectory = archiveCompletedRelease({
    receiptPath,
    historyDirectory: resolve(repositoryRoot, git(["rev-parse", "--git-common-dir"]), "openxiangda-release-history"),
  });
  process.stdout.write(`发布回执与制品清单已归档：${historyDirectory}\n`);
  process.stdout.write(
    `Published ${receipt.candidates.map(item => `${item.name}@${item.version}`).join(", ")} from ${receipt.head}.\n` +
      "Run pnpm release:sync-reference separately when the independent reference application should adopt the public lockfile.\n"
  );
  rmSync(receiptPath, { force: true });
  rmSync(artifactRoot, { recursive: true, force: true });
}

function assertAuthoritativeMainline({ allowContained = false } = {}) {
  const status = git(["status", "--porcelain"]);
  if (status) fail(`Release worktree is not clean:\n${status}`);
  const branch = git(["branch", "--show-current"]);
  if (branch !== "master") fail(`Release must run from master, received ${branch || "detached HEAD"}`);
  run("git", ["fetch", "--quiet", "origin", "master"]);
  const upstream = git(["rev-parse", "--abbrev-ref", "@{upstream}"]);
  if (!upstream) fail("Release branch has no upstream");
  const upstreamHead = git(["rev-parse", "@{upstream}"]);
  const currentHead = git(["rev-parse", "HEAD"]);
  if (allowContained) {
    const contained = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", currentHead, upstreamHead],
      { cwd: repositoryRoot }
    );
    if (contained.status !== 0) {
      fail(`Release HEAD ${currentHead} is not contained in ${upstream} ${upstreamHead}`);
    }
  } else if (currentHead !== upstreamHead) {
    fail(`Release HEAD ${currentHead} does not exactly match ${upstream} ${upstreamHead}`);
  }
}

function discardSupersededPrepublicationReceipt(value) {
  if (!isSupersededPrepublicationReceipt(value, head)) return value;
  return discardPrepublicationReceipt(
    value,
    `source commit changed; rebuilding from ${head}`
  );
}

function discardSupersededReferencePrepublicationReceipt(value, currentEvidence) {
  if (!isSupersededReferencePrepublicationReceipt(value, currentEvidence)) {
    return value;
  }
  return discardPrepublicationReceipt(
    value,
    `reference application changed to ${currentEvidence.head}`
  );
}

function discardPrepublicationReceipt(value, reason) {
  if (value.schema !== "openxiangda.release-receipt/v2") {
    fail("Unsupported release receipt");
  }
  if (!/^[0-9a-f]{40}$/.test(String(value.head || ""))) {
    fail("Pending release has an invalid source commit");
  }
  if (!Array.isArray(value.candidates) || !value.candidates.length) {
    fail("Release receipt has no candidates");
  }
  const supersededArtifactRoot = resolve(
    dirname(receiptPath),
    `openxiangda-release-artifacts-${value.head}`
  );
  if (
    resolve(value.artifactManifestPath || "") !==
    join(supersededArtifactRoot, "manifest.json")
  ) {
    fail("Pending release artifact path does not match its source commit");
  }
  assertSupersededReceiptRegistryCompatibility(value);
  rmSync(supersededArtifactRoot, { recursive: true, force: true });
  rmSync(receiptPath, { force: true });
  process.stdout.write(
    `Discarded superseded ${value.phase} release ${value.head}: ${reason}.\n`
  );
  return null;
}

function assertSupersededReceiptRegistryCompatibility(value) {
  for (const candidate of value.candidates) {
    const spec = `${candidate.name}@${candidate.version}`;
    const published = isReleaseVersionPublished(
      repositoryRoot,
      value.registry,
      spec
    );
    const actualIntegrity = published
      ? npmJson(["view", spec, "dist.integrity", "--json"], null, value.registry)
      : null;
    if (
      !supersededCandidateArtifactIsCompatible({
        published,
        expectedIntegrity: candidate.artifact?.integrity,
        actualIntegrity,
      })
    ) {
      fail(
        `${spec} registry artifact does not match the superseded validated receipt`
      );
    }
  }
}

function assertReceiptMatchesInvocation(value) {
  if (value.schema !== "openxiangda.release-receipt/v2") fail("Unsupported release receipt");
  if (value.head !== head) fail(`Pending release belongs to ${value.head}, not ${head}`);
  if (Boolean(value.full) !== full) fail("Pending release validation mode differs from this invocation");
  if (!Array.isArray(value.candidates) || !value.candidates.length) fail("Release receipt has no candidates");
  const artifactState = loadReleaseArtifactManifest(value.artifactManifestPath, { head });
  const expectedPlan = createReleaseValidationPlan(artifactState, { full });
  const referenceRequired = assertReceiptReferenceRequirement(value, expectedPlan);
  if (!releasePublicationHasStarted(value) && referenceRequired) {
    assertReferenceReleaseEvidence(value.referenceApplication);
  }
  if (resolve(value.artifactManifestPath || "") !== artifactManifestPath) {
    fail("Pending release artifact path does not match this source commit");
  }
  assertReceiptArtifacts(value);
}

function assertPublishedContents(value) {
  waitForPublishedVersions(value);
  for (const candidate of value.candidates) {
    const integrity = npmJson(
      ["view", `${candidate.name}@${candidate.version}`, "dist.integrity", "--json"],
      null,
      value.registry
    );
    if (integrity !== candidate.artifact.integrity) {
      fail(
        `${candidate.name}@${candidate.version} registry integrity ${integrity} ` +
          `does not match validated artifact ${candidate.artifact.integrity}`
      );
    }
  }
}

function assertReceiptArtifacts(value) {
  const actualManifestSha256 = artifactDigests(
    value.artifactManifestPath
  ).sha256;
  if (actualManifestSha256 !== value.artifactManifestSha256) {
    fail("Release artifact manifest changed after the receipt was created");
  }
  const manifest = loadReleaseArtifactManifest(value.artifactManifestPath, {
    head: value.head,
    registry: value.registry,
    packageNames: value.candidates.map(item => item.name),
  });
  assertPublicArtifactManifest(manifest);
  const byName = new Map(manifest.packages.map(item => [item.name, item]));
  for (const candidate of value.candidates) {
    const artifact = byName.get(candidate.name);
    if (
      artifact?.version !== candidate.version ||
      artifact?.status !== "candidate" ||
      artifact?.sha256 !== candidate.artifact?.sha256 ||
      artifact?.integrity !== candidate.artifact?.integrity ||
      artifact?.size !== candidate.artifact?.size
    ) {
      fail(`${candidate.name}@${candidate.version} does not match its release receipt`);
    }
  }
  return manifest;
}

function publishCandidateTarballs(value) {
  const manifest = assertReceiptArtifacts(value);
  const byName = new Map(manifest.packages.map(item => [item.name, item]));
  for (const candidate of value.candidates) {
    const spec = `${candidate.name}@${candidate.version}`;
    if (isReleaseVersionPublished(repositoryRoot, value.registry, spec)) {
      const integrity = npmJson(
        ["view", spec, "dist.integrity", "--json"],
        null,
        value.registry
      );
      if (integrity !== candidate.artifact.integrity) {
        fail(`${spec} was published with different contents during this release`);
      }
      continue;
    }
    const artifact = byName.get(candidate.name);
    npm([
      "publish",
      artifact.tarball,
      "--access",
      "public",
      "--tag",
      candidate.channelPolicy.prerelease?.tag || "latest",
    ]);
  }
}

function waitForPublishedVersions(value) {
  waitForObservation({
    description: "published package metadata",
    observe: () =>
      value.candidates.every(candidate => {
        const version = npmJson(
          ["view", `${candidate.name}@${candidate.version}`, "version", "--json"],
          null,
          value.registry
        );
        return version === candidate.version;
      }),
  });
}

function assertReceiptCandidatesUnpublished(value) {
  for (const candidate of value.candidates) {
    const spec = `${candidate.name}@${candidate.version}`;
    if (isReleaseVersionPublished(repositoryRoot, value.registry, spec)) {
      fail(`${spec} was published concurrently before this release began writing packages`);
    }
  }
}

function assertRecoverableDistTags(value) {
  for (const candidate of value.candidates) {
    const actualTags =
      npmJson(
        ["view", candidate.name, "dist-tags", "--json"],
        {},
        value.registry
      ) || {};
    const candidatePublished = isReleaseVersionPublished(
      repositoryRoot,
      value.registry,
      `${candidate.name}@${candidate.version}`
    );
    if (
      !releaseDistTagsAreRecoverable({
        candidateVersion: candidate.version,
        prereleaseTag: value.prereleaseTag,
        priorTags: candidate.priorTags,
        actualTags,
        candidatePublished,
      })
    ) {
      fail(
        `${candidate.name} dist-tags changed outside the recoverable release states: ` +
          `${JSON.stringify(candidate.priorTags)} -> ${JSON.stringify(actualTags)}`
      );
    }
  }
}

function applyDistTags(candidate, value) {
  const expectedPolicy = releaseChannelPolicy({
    candidateVersion: candidate.version,
    prereleaseTag: value.prereleaseTag,
    priorTags: candidate.priorTags,
  });
  if (JSON.stringify(candidate.channelPolicy) !== JSON.stringify(expectedPolicy)) {
    fail(`${candidate.name} release channel policy no longer matches its receipt`);
  }
  const policy = candidate.channelPolicy;
  const spec = `${candidate.name}@${candidate.version}`;
  if (policy.prerelease) {
    npm(["dist-tag", "add", spec, policy.prerelease.tag]);
  }
  if (policy.stable) npm(['dist-tag', 'add', spec, policy.stable.tag]);
  npm(["dist-tag", "add", `${candidate.name}@${policy.latest}`, "latest"]);
}

function waitForDistTags(value) {
  waitForObservation({
    description: "npm dist-tags",
    observe: () =>
      value.candidates.every(candidate => {
        const actualTags = npmJson(
          ["view", candidate.name, "dist-tags", "--json"],
          {},
          value.registry
        );
        return releaseDistTagsMatch({
          policy: candidate.channelPolicy,
          actualTags,
        });
      }),
  });
}

function waitForObservation({ description, observe }) {
  const attempts = 10;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (observe()) return;
    if (attempt < attempts) wait(Math.min(4_000, 250 * 2 ** (attempt - 1)));
  }
  fail(`${description} did not converge before the bounded release timeout`);
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function synchronizeGitTags(value) {
  const refs = [];
  for (const candidate of value.candidates) {
    const tag = `${candidate.name}@${candidate.version}`;
    const local = gitOptional(["rev-list", "-n", "1", tag]);
    if (local && local !== value.head) fail(`Local tag ${tag} points to ${local}, not ${value.head}`);
    if (!local) git(["tag", tag, value.head]);
    const remote = gitOptional(["ls-remote", "--tags", "origin", `refs/tags/${tag}`])
      ?.split(/\s+/)[0];
    if (remote && remote !== value.head) fail(`Remote tag ${tag} points to ${remote}, not ${value.head}`);
    if (!remote) refs.push(`refs/tags/${tag}:refs/tags/${tag}`);
  }
  if (refs.length) run("git", ["push", "origin", ...refs]);
}

function configuredPrereleaseTag() {
  const path = resolve(repositoryRoot, ".changeset", "pre.json");
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, "utf8"));
  return value.mode === "pre" ? String(value.tag || "").trim() || null : null;
}

function loadReceipt() {
  if (!existsSync(receiptPath)) return null;
  return JSON.parse(readFileSync(receiptPath, "utf8"));
}

function saveReceipt(value) {
  const temporary = `${receiptPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, receiptPath);
}

function npm(args) {
  run("npm", [...args, "--registry", receipt.registry]);
}

function npmJson(args, fallback, registry = receipt?.registry || "https://registry.npmjs.org") {
  const result = spawnSync("npm", [...args, "--registry", registry], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: releaseNpmEnvironment(),
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (/E404|404 Not Found|is not in this registry/i.test(output)) return fallback;
    fail(`npm ${args.join(" ")} failed: ${output.trim()}`);
  }
  try {
    return JSON.parse(result.stdout || "null");
  } catch {
    fail(`npm ${args.join(" ")} returned invalid JSON`);
  }
}

function git(args) {
  const value = runCaptured("git", args);
  return value.trim();
}

function gitOptional(args) {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env:
      command === "npm"
        ? releaseNpmEnvironment(options.env || process.env)
        : options.env || process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} exited with ${result.status}`);
}

function runCaptured(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: command === "npm" ? releaseNpmEnvironment() : process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  return String(result.stdout || "");
}

function fail(message) {
  throw new Error(message);
}
