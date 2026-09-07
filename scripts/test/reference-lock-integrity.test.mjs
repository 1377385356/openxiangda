import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertReferenceLockArtifactIntegrities } from "../lib/reference-lock-integrity.mjs";

test("formal reference evidence accepts the frozen candidate integrity", () => {
  const fixture = referenceLockFixture("sha512-frozen-candidate");
  try {
    assert.deepEqual(
      assertReferenceLockArtifactIntegrities(fixture.lockPath, [
        artifact("sha512-frozen-candidate"),
      ]),
      { checked: 1 }
    );
  } finally {
    fixture.remove();
  }
});

test("formal reference evidence rejects a candidate tarball integrity mismatch", () => {
  const fixture = referenceLockFixture("sha512-old-separate-pack");
  try {
    assert.throws(
      () =>
        assertReferenceLockArtifactIntegrities(fixture.lockPath, [
          artifact("sha512-frozen-candidate"),
        ]),
      /REFERENCE_LOCK_ARTIFACT_INTEGRITY_MISMATCH: openxiangda-cli@2\.0\.0-alpha\.54/
    );
  } finally {
    fixture.remove();
  }
});

test("formal reference gate preserves the authoritative lock and runs the full app suite", () => {
  const source = readFileSync(
    new URL("../verify-reference-application.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /"install",\s*"--frozen-lockfile"/);
  assert.match(source, /"--prefer-offline"/);
  assert.doesNotMatch(source, /"--store-dir"/);
  assert.doesNotMatch(
    source,
    /rmSync\(join\(applicationRoot,\s*"pnpm-lock\.yaml"\)/
  );
  assert.match(
    source,
    /rmSync\(join\(resolutionRoot,\s*"pnpm-lock\.yaml"\)/
  );
  assert.match(
    source,
    /applyResolvedReferenceWorktree\(resolutionRoot, referenceRoot\)/
  );
  for (const command of ["check", "test", "build", "test:e2e"]) {
    assert.match(
      source,
      new RegExp(`run\\(\\"pnpm\\", \\[\\"${command.replace(":", "\\:")}\\"\\]`)
    );
  }
});

function artifact(integrity) {
  return {
    name: "openxiangda-cli",
    version: "2.0.0-alpha.54",
    integrity,
  };
}

function referenceLockFixture(integrity) {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-reference-lock-"));
  const lockPath = join(root, "pnpm-lock.yaml");
  writeFileSync(
    lockPath,
    [
      "lockfileVersion: '9.0'",
      "",
      "packages:",
      "",
      "  openxiangda-cli@2.0.0-alpha.54:",
      `    resolution: {integrity: ${integrity}}`,
      "    hasBin: true",
      "",
      "snapshots:",
      "",
      "  openxiangda-cli@2.0.0-alpha.54: {}",
      "",
    ].join("\n")
  );
  return {
    lockPath,
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
