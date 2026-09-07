import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runPackagePublicationStage } from "../lib/release-publication-stage.mjs";
import { inspectReferenceReleaseEvidence } from "../lib/reference-application-state.mjs";

test("reference release evidence is stable, path-free, and bound to synchronized master", () => {
  const fixture = createReferenceRepository();
  try {
    const evidence = inspectReferenceReleaseEvidence(fixture.root);
    assert.deepEqual(Object.keys(evidence).sort(), [
      "head",
      "packageJsonSha256",
      "pnpmLockSha256",
    ]);
    assert.match(evidence.head, /^[0-9a-f]{40}$/);
    assert.match(evidence.packageJsonSha256, /^[0-9a-f]{64}$/);
    assert.match(evidence.pnpmLockSha256, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(evidence).includes(fixture.root), false);
  } finally {
    fixture.remove();
  }
});

test("dirty reference refuses initial publication with zero npm writes", () => {
  const fixture = createReferenceRepository();
  try {
    const evidence = inspectReferenceReleaseEvidence(fixture.root);
    writeFileSync(join(fixture.root, "dirty.txt"), "dirty\n");
    let npmWrites = 0;
    assert.throws(
      () =>
        runPackagePublicationStage(
          validatedReceipt(evidence),
          stageOptions(fixture.root, () => {
            npmWrites += 1;
          })
        ),
      /REFERENCE_RELEASE_WORKTREE_DIRTY/
    );
    assert.equal(npmWrites, 0);
  } finally {
    fixture.remove();
  }
});

test("HEAD, package, lock, and missing evidence drift all refuse before npm writes", () => {
  const fixture = createReferenceRepository();
  try {
    const original = inspectReferenceReleaseEvidence(fixture.root);
    writeFileSync(join(fixture.root, "revision.txt"), "next\n");
    git(fixture.root, ["add", "revision.txt"]);
    git(fixture.root, ["commit", "-m", "test: advance reference"]);
    git(fixture.root, ["push", "origin", "master"]);
    const current = inspectReferenceReleaseEvidence(fixture.root);

    for (const [name, evidence, pattern] of [
      ["head", original, /REFERENCE_RELEASE_HEAD_MISMATCH/],
      [
        "package",
        { ...current, packageJsonSha256: "0".repeat(64) },
        /REFERENCE_RELEASE_PACKAGE_JSON_MISMATCH/,
      ],
      [
        "lock",
        { ...current, pnpmLockSha256: "0".repeat(64) },
        /REFERENCE_RELEASE_PNPM_LOCK_MISMATCH/,
      ],
      ["missing", undefined, /REFERENCE_RELEASE_EVIDENCE_INVALID/],
    ]) {
      let npmWrites = 0;
      assert.throws(
        () =>
          runPackagePublicationStage(
            validatedReceipt(evidence),
            stageOptions(fixture.root, () => {
              npmWrites += 1;
            })
          ),
        pattern,
        name
      );
      assert.equal(npmWrites, 0, name);
    }
  } finally {
    fixture.remove();
  }
});

test("publication already started resumes without resolving external reference", () => {
  let preflights = 0;
  let persisted = 0;
  let npmWrites = 0;
  const receipt = { phase: "publishing-packages" };
  const result = runPackagePublicationStage(receipt, {
    referenceRoot: "/reference/does/not/exist",
    preflightInitialPublication: () => {
      preflights += 1;
    },
    persistReceipt: () => {
      persisted += 1;
    },
    publishPackages: value => {
      npmWrites += 1;
      return { ...value, phase: "packages-published" };
    },
  });
  assert.equal(result.phase, "packages-published");
  assert.equal(preflights, 0);
  assert.equal(persisted, 0);
  assert.equal(npmWrites, 1);
});

test("initial publication persists the started phase before the first npm write", () => {
  const fixture = createReferenceRepository();
  try {
    const evidence = inspectReferenceReleaseEvidence(fixture.root);
    const events = [];
    const result = runPackagePublicationStage(validatedReceipt(evidence), {
      referenceRoot: fixture.root,
      preflightInitialPublication: () => events.push("preflight"),
      persistReceipt: receipt => events.push(`persist:${receipt.phase}`),
      publishPackages: receipt => {
        events.push("npm-write");
        return { ...receipt, phase: "packages-published" };
      },
    });
    assert.deepEqual(events, [
      "preflight",
      "persist:publishing-packages",
      "npm-write",
    ]);
    assert.equal(result.phase, "packages-published");
  } finally {
    fixture.remove();
  }
});

function validatedReceipt(referenceApplication) {
  return { phase: "validated", referenceApplication };
}

function stageOptions(referenceRoot, onNpmWrite) {
  return {
    referenceRoot,
    preflightInitialPublication: () => {},
    persistReceipt: () => {},
    publishPackages: receipt => {
      onNpmWrite();
      return { ...receipt, phase: "packages-published" };
    },
  };
}

function createReferenceRepository() {
  const sandbox = mkdtempSync(join(tmpdir(), "openxiangda-reference-evidence-"));
  const remote = join(sandbox, "origin.git");
  const root = join(sandbox, "reference");
  git(sandbox, ["init", "--bare", "--initial-branch=master", remote]);
  git(sandbox, ["init", "--initial-branch=master", root]);
  git(root, ["config", "user.email", "release-test@openxiangda.invalid"]);
  git(root, ["config", "user.name", "OpenXiangda Release Test"]);
  git(root, ["remote", "add", "origin", remote]);
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "reference", private: true }, null, 2)}\n`
  );
  writeFileSync(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n"
  );
  git(root, ["add", "package.json", "pnpm-lock.yaml"]);
  git(root, ["commit", "-m", "test: initialize reference"]);
  git(root, ["push", "--set-upstream", "origin", "master"]);
  return {
    root,
    remove: () => rmSync(sandbox, { recursive: true, force: true }),
  };
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${String(result.stderr || "").trim()}`
    );
  }
  return String(result.stdout || "").trim();
}
