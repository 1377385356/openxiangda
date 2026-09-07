import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertReferencePackageVersions,
  updateReferencePackageVersions,
} from "../lib/reference-application-state.mjs";

test("reference package pins fail before expensive release gates and can be aligned", () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-reference-pins-"));
  try {
    for (const directory of [
      "apps/server",
      "apps/web",
      "packages/contracts",
    ]) {
      mkdirSync(join(root, directory), { recursive: true });
    }
    for (const file of [
      "package.json",
      "apps/server/package.json",
      "apps/web/package.json",
      "packages/contracts/package.json",
    ]) {
      writeFileSync(
        join(root, file),
        `${JSON.stringify({ dependencies: { "openxiangda-contracts": "2.0.0-alpha.1" } }, null, 2)}\n`
      );
    }
    const expected = new Map([["openxiangda-contracts", "2.0.0-alpha.2"]]);

    assert.throws(
      () => assertReferencePackageVersions(root, expected),
      /pins openxiangda-contracts@2\.0\.0-alpha\.1/
    );
    assert.deepEqual(updateReferencePackageVersions(root, expected), {
      dependencyCount: 4,
      changedManifestCount: 4,
    });
    assert.doesNotThrow(() => assertReferencePackageVersions(root, expected));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
