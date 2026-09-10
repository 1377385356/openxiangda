import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseVersionsMaterialized } from "./lib/release-changeset-state.mjs";
import { inspectReleasePackages } from "./lib/release-package-state.mjs";
import { createReleaseValidationPlan } from "./lib/release-validation-plan.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const json = process.argv.includes("--json");
assertReleaseVersionsMaterialized(repositoryRoot);
const packageState = inspectReleasePackages(repositoryRoot, { quiet: json });
const plan = createReleaseValidationPlan(packageState, { full });

if (json) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else {
  process.stdout.write(`Release validation mode: ${plan.mode}\n`);
  process.stdout.write(
    `Candidates: ${plan.candidates.map(item => `${item.name}@${item.version}`).join(", ")}\n`
  );
  process.stdout.write(`Fresh application: ${plan.gates.freshApplication}\n`);
  process.stdout.write(
    `Reference application: ${plan.gates.referenceApplication ? "required" : "skipped"}\n`
  );
  process.stdout.write(`Skills: ${plan.gates.skills ? "required" : "skipped"}\n`);
  process.stdout.write(
    `Documentation: ${plan.gates.documentation ? "required" : "skipped"}\n`
  );
  for (const reason of plan.reasons) process.stdout.write(`- ${reason}\n`);
}
