import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBootstrapReleaseCoupling,
  assertBootstrapVersionToken,
} from "./lib/cli-bootstrap-state.mjs";
import { pendingChangesetIds } from "./lib/release-changeset-state.mjs";
import { materializeReleaseNotes, validatePlannedReleaseNotes } from './lib/release-notes.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assertAuthoritativeCleanMainline();

const pending = pendingChangesetIds(repositoryRoot);
if (!pending.length) {
  fail("RELEASE_VERSION_EMPTY: no reviewed Changesets are waiting to be materialized");
}
assertBootstrapReleaseCoupling(
  pending.map(id =>
    readFileSync(resolve(repositoryRoot, ".changeset", `${id}.md`), "utf8")
  )
);

const planDirectory = mkdtempSync(resolve(tmpdir(), 'openxiangda-version-plan-'));
try {
  const planPath = resolve(planDirectory, 'plan.json');
  run('pnpm', ['exec', 'changeset', 'status', '--output', planPath]);
  validatePlannedReleaseNotes(repositoryRoot, JSON.parse(readFileSync(planPath, 'utf8')));
} finally {
  rmSync(planDirectory, { recursive: true, force: true });
}

run("pnpm", ["exec", "changeset", "version"]);
materializeReleaseNotes(repositoryRoot);
run("pnpm", ["install", "--lockfile-only", "--ignore-scripts"]);
assertBootstrapSkill();

const remaining = pendingChangesetIds(repositoryRoot);
if (remaining.length) {
  fail(
    "RELEASE_VERSION_INCOMPLETE: Changesets remained after version materialization:\n" +
      remaining.map(id => `  - ${id}`).join("\n")
  );
}

const changedFiles = git(["status", "--short"]);
if (!changedFiles) {
  fail("RELEASE_VERSION_NO_DIFF: Changesets completed without producing a version diff");
}

process.stdout.write(
  `Materialized ${pending.length} reviewed Changeset(s):\n` +
    pending.map(id => `  - ${id}`).join("\n") +
    "\nReview the generated package/template versions, commit and push master, " +
    "then run `pnpm release:plan`. No package was published.\n"
);

function assertAuthoritativeCleanMainline() {
  const status = git(["status", "--porcelain"]);
  if (status) fail(`Release version worktree is not clean:\n${status}`);
  const branch = git(["branch", "--show-current"]);
  if (branch !== "master") {
    fail(`Release versions must be materialized from master, received ${branch || "detached HEAD"}`);
  }
  run("git", ["fetch", "--quiet", "origin", "master"]);
  const upstream = git(["rev-parse", "--abbrev-ref", "@{upstream}"]);
  if (upstream !== "origin/master") {
    fail(`Release master must track origin/master, received ${upstream || "no upstream"}`);
  }
  const currentHead = git(["rev-parse", "HEAD"]);
  const upstreamHead = git(["rev-parse", "@{upstream}"]);
  if (currentHead !== upstreamHead) {
    fail(`Release HEAD ${currentHead} does not exactly match ${upstream} ${upstreamHead}`);
  }
}

function assertBootstrapSkill() {
  const skillPath = resolve(repositoryRoot, "skills/openxiangda-v2/SKILL.md");
  assertBootstrapVersionToken(readFileSync(skillPath, "utf8"));
}

function git(args) {
  return runCaptured("git", args);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} exited with ${result.status}`);
}

function runCaptured(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(" ")} exited with ${result.status}`);
  return String(result.stdout || "").trim();
}

function fail(message) {
  throw new Error(message);
}
