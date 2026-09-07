import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseVersionsMaterialized } from "./lib/release-changeset-state.mjs";
import { inspectReleasePackages } from "./lib/release-package-state.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = process.argv.includes("--json");
assertReleaseVersionsMaterialized(repositoryRoot);
const state = inspectReleasePackages(repositoryRoot, { quiet: json });
const candidates = state.packages.filter(item => item.status === "candidate");

if (!candidates.length) {
  throw new Error("No unpublished package versions were found; refusing an empty release.");
}

if (json) {
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
} else {
  for (const item of state.packages) {
    if (item.status === "candidate") {
      process.stdout.write(
        `release candidate: ${item.name}@${item.version} (previous ${item.previousVersion || "none"})\n`
      );
    } else {
      process.stdout.write(`unchanged published package: ${item.name}@${item.version}\n`);
    }
  }
  process.stdout.write(
    `Release immutability check passed for ${candidates.length} unpublished package version(s).\n`
  );
}
