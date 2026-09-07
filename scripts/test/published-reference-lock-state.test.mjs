import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { unexpectedReferenceChanges } from "../lib/published-reference-lock-state.mjs";

test("published reference synchronization permits only its lockfile update", () => {
  assert.deepEqual(unexpectedReferenceChanges(""), []);
  assert.deepEqual(unexpectedReferenceChanges(" M pnpm-lock.yaml"), []);
  assert.deepEqual(
    unexpectedReferenceChanges(" M pnpm-lock.yaml\n M package.json\n?? local.txt"),
    [" M package.json", "?? local.txt"]
  );
});

test("published reference synchronization uses the bounded release registry policy", () => {
  const source = readFileSync(
    new URL("../sync-published-reference-lock.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /releaseNpmEnvironment\(\)/);
  assert.match(source, /runTransientRegistryOperation\(/);
  assert.match(source, /resuming reference synchronization/);
});
