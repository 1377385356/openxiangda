import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertReleaseVersionsMaterialized,
  pendingChangesetIds,
} from "../lib/release-changeset-state.mjs";

test("prerelease state ignores consumed Changesets and reports only pending IDs", () => {
  withChangesets(
    {
      "README.md": "fixture",
      "already-consumed.md": "---\n\"pkg\": patch\n---\n",
      "awaiting-version.md": "---\n\"pkg\": patch\n---\n",
      "pre.json": JSON.stringify({
        mode: "pre",
        tag: "alpha",
        changesets: ["already-consumed"],
      }),
    },
    root => {
      assert.deepEqual(pendingChangesetIds(root), ["awaiting-version"]);
      assert.throws(
        () => assertReleaseVersionsMaterialized(root),
        error =>
          error.message.includes("RELEASE_VERSION_NOT_MATERIALIZED") &&
          error.message.includes("pnpm release:version") &&
          error.message.includes("awaiting-version")
      );
    }
  );
});

test("non-prerelease state treats every Changeset markdown file as pending", () => {
  withChangesets(
    {
      "README.md": "fixture",
      "first-change.md": "---\n\"pkg\": patch\n---\n",
      "second-change.md": "---\n\"pkg\": minor\n---\n",
    },
    root => {
      assert.deepEqual(pendingChangesetIds(root), ["first-change", "second-change"]);
    }
  );
});

test("materialized prerelease Changesets pass the release gate", () => {
  withChangesets(
    {
      "old-change.md": "---\n\"pkg\": patch\n---\n",
      "pre.json": JSON.stringify({ mode: "pre", changesets: ["old-change"] }),
    },
    root => assert.doesNotThrow(() => assertReleaseVersionsMaterialized(root))
  );
});

function withChangesets(files, run) {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-changesets-"));
  const changesetRoot = join(root, ".changeset");
  mkdirSync(changesetRoot, { recursive: true });
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(changesetRoot, name), contents);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
