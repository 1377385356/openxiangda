import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function pendingChangesetIds(repositoryRoot) {
  const changesetRoot = join(repositoryRoot, ".changeset");
  if (!existsSync(changesetRoot)) return [];

  const consumed = consumedPrereleaseChangesets(changesetRoot);
  return readdirSync(changesetRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
    .map(entry => basename(entry.name, ".md"))
    .filter(id => id.toLowerCase() !== "readme" && !consumed.has(id))
    .sort();
}

export function assertReleaseVersionsMaterialized(repositoryRoot) {
  const pending = pendingChangesetIds(repositoryRoot);
  if (!pending.length) return;

  throw new Error(
    "RELEASE_VERSION_NOT_MATERIALIZED: reviewed Changesets still need to be " +
      "materialized into package versions before release planning. Run " +
      "`pnpm release:version`, review and commit the generated version diff, " +
      "push master, then rerun the release command.\n" +
      pending.map(id => `  - ${id}`).join("\n")
  );
}

function consumedPrereleaseChangesets(changesetRoot) {
  const preStatePath = join(changesetRoot, "pre.json");
  if (!existsSync(preStatePath)) return new Set();

  const preState = JSON.parse(readFileSync(preStatePath, "utf8"));
  if (preState.mode !== "pre") return new Set();
  return new Set(
    Array.isArray(preState.changesets)
      ? preState.changesets.map(value => String(value))
      : []
  );
}
