import assert from "node:assert/strict";
import test from "node:test";
import { createReleaseValidationPlan } from "../lib/release-validation-plan.mjs";

function state(...packages) {
  return {
    schema: "openxiangda.release-package-state/v1",
    registry: "https://registry.npmjs.org",
    packages,
  };
}

function candidate(name, changedFiles, previousVersion = "2.0.0-alpha.12") {
  return {
    name,
    version: "2.0.0-alpha.13",
    previousVersion,
    status: "candidate",
    changedFiles,
  };
}

test("skill guidance release skips browser and reference suites", () => {
  const plan = createReleaseValidationPlan(
    state(
      candidate("openxiangda-skill-kit", ["package.json", "docs/delivery.md"]),
      candidate("openxiangda-cli", ["package.json"])
    )
  );
  assert.equal(plan.gates.freshApplication, "build");
  assert.equal(plan.gates.skills, true);
  assert.equal(plan.gates.documentation, true);
  assert.equal(plan.gates.referenceApplication, false);
  assert.equal(plan.gates.templateGeneratedCheck, false);
});

test("CLI-owned web template release requires a new browser application", () => {
  const plan = createReleaseValidationPlan(
    state(candidate("openxiangda-cli", ["template/apps/web/src/App.tsx"]))
  );
  assert.equal(plan.gates.freshApplication, "e2e");
  assert.equal(plan.gates.referenceApplication, false);
  assert.equal(plan.gates.templateGeneratedCheck, true);
});

test("Devkit runtime release requires browser and reference validation", () => {
  const plan = createReleaseValidationPlan(
    state(candidate("openxiangda-devkit-core", ["package.json", "dist/index.js"]))
  );
  assert.equal(plan.gates.freshApplication, "e2e");
  assert.equal(plan.gates.referenceApplication, true);
  assert.equal(plan.gates.templateGeneratedCheck, true);
  assert.match(
    plan.reasons.join("\n"),
    /generated application runtime behavior/
  );
});

test("MCP release stays inside the shared Devkit and packed installation boundary", () => {
  const plan = createReleaseValidationPlan(
    state(candidate("openxiangda-mcp", ["package.json", "dist/index.js"]))
  );
  assert.equal(plan.gates.freshApplication, "build");
  assert.equal(plan.gates.referenceApplication, false);
  assert.equal(plan.gates.templateGeneratedCheck, false);
  assert.equal(plan.gates.skills, true);
  assert.equal(plan.gates.documentation, true);
});

test("core contract release requires browser and reference validation", () => {
  const plan = createReleaseValidationPlan(
    state(candidate("openxiangda-contracts", ["package.json", "dist/index.js"]))
  );
  assert.equal(plan.gates.freshApplication, "e2e");
  assert.equal(plan.gates.referenceApplication, true);
});

test("server-only release still builds a fresh app and reference app", () => {
  const plan = createReleaseValidationPlan(
    state(candidate("openxiangda-nest", ["package.json", "dist/index.js"]))
  );
  assert.equal(plan.gates.freshApplication, "build");
  assert.equal(plan.gates.referenceApplication, true);
});

test("a package without a comparable predecessor fails closed to every gate", () => {
  const plan = createReleaseValidationPlan(
    state(candidate("new-openxiangda-package", ["*"], null))
  );
  assert.equal(plan.gates.freshApplication, "e2e");
  assert.equal(plan.gates.referenceApplication, true);
  assert.equal(plan.gates.skills, true);
  assert.equal(plan.gates.documentation, true);
});

test("explicit full audit enables every expensive gate", () => {
  const plan = createReleaseValidationPlan(
    state(candidate("openxiangda-skill-kit", ["docs/delivery.md"])),
    { full: true }
  );
  assert.equal(plan.mode, "full");
  assert.equal(plan.gates.freshApplication, "e2e");
  assert.equal(plan.gates.referenceApplication, true);
  assert.equal(plan.gates.skills, true);
  assert.equal(plan.gates.documentation, true);
});

test("empty release is rejected before any validation work", () => {
  assert.throws(
    () =>
      createReleaseValidationPlan(
        state({
          name: "openxiangda-contracts",
          version: "2.0.0-alpha.12",
          status: "published-unchanged",
          changedFiles: [],
        })
      ),
    /RELEASE_VALIDATION_EMPTY/
  );
});
