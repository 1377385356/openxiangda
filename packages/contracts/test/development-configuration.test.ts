import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDevelopmentConfigurationManifest,
  assertDevelopmentConfigurationResult,
  createDevelopmentConfigurationManifest,
  DEVELOPMENT_CONFIGURATION_SCHEMA,
  developmentConfigurationKey,
  type DevelopmentConfigurationInput,
} from "../src/native-compiler/development-configuration.js";

const input = {
  configDigest: "a".repeat(64),
  contractDigest: "b".repeat(64),
  expectedHeadRevision: 4,
  source: { repository: null, commit: null, dirty: true },
  toolchainVersion: "2.49.1",
} as DevelopmentConfigurationInput;

test("development configuration preserves uncommitted provenance and cannot masquerade as a deployed runtime", () => {
  const manifest = createDevelopmentConfigurationManifest(
    "reference-app",
    input
  );
  assert.deepEqual(manifest.source, {
    repository: null,
    commit: null,
    dirty: true,
  });
  assert.deepEqual(
    manifest.artifacts.map((x) => x.kind),
    ["config", "contracts"]
  );
  assert.throws(() =>
    assertDevelopmentConfigurationManifest({
      ...manifest,
      backend: "https://backend.invalid",
    })
  );
  assert.throws(() =>
    assertDevelopmentConfigurationManifest({
      ...manifest,
      artifacts: [...manifest.artifacts, { kind: "frontend" }],
    })
  );
  assert.throws(() =>
    createDevelopmentConfigurationManifest("reference-app", {
      ...input,
      source: { ...input.source, commit: "inferred" },
    })
  );
});

test("configuration retries bind both canonical content and the captured Head", () => {
  const a = createDevelopmentConfigurationManifest("reference-app", input);
  const b = createDevelopmentConfigurationManifest("reference-app", {
    ...input,
    contractDigest: "c".repeat(64),
  });
  assert.equal(
    developmentConfigurationKey(a, 4),
    developmentConfigurationKey(structuredClone(a), 4)
  );
  assert.notEqual(
    developmentConfigurationKey(a, 4),
    developmentConfigurationKey(a, 5)
  );
  assert.notEqual(
    developmentConfigurationKey(a, 4),
    developmentConfigurationKey(b, 4)
  );
});

test("configuration results must prove the same app and closure, an unchanged published Head and an independent session selection, and an undeployed runtime", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  const result = {
    schemaVersion: DEVELOPMENT_CONFIGURATION_SCHEMA,
    appCode: "reference-app",
    environmentKey: "preproduction",
    environmentId: uuid,
    appVersionId: uuid,
    configurationRunId: uuid,
    headRevision: 4,
    publishedAppVersionId: "22222222-2222-4222-8222-222222222222",
    selection: "session",
    configDigest: input.configDigest,
    contractDigest: input.contractDigest,
    reused: false,
    runtimeArtifactsDeployed: false,
    backendEventsAvailable: false,
  };
  assert.equal(
    assertDevelopmentConfigurationResult(result, "reference-app", input),
    result
  );
  for (const patch of [
    { schemaVersion: "openxiangda.development-configuration/v1" },
    { selection: "published" },
    { publishedAppVersionId: "fabricated" },
    { publishedAppVersionId: uuid },
    { appCode: "another-app" },
    { environmentKey: "production" },
    { configDigest: "c".repeat(64) },
    { headRevision: 5 },
    { headRevision: 6 },
    { configurationRunId: "fabricated" },
    { runtimeArtifactsDeployed: true },
    { backendEventsAvailable: true },
    { sessionToken: "unexpected" },
  ]) {
    assert.throws(() =>
      assertDevelopmentConfigurationResult(
        { ...result, ...patch },
        "reference-app",
        input
      )
    );
  }
});

test("configuration reuse is isolated by its requesting manager", () => {
  const manifest = createDevelopmentConfigurationManifest("reference-app", input);
  assert.equal(developmentConfigurationKey(manifest,4,"manager-a"), developmentConfigurationKey(manifest,4,"manager-a"));
  assert.notEqual(developmentConfigurationKey(manifest,4,"manager-a"), developmentConfigurationKey(manifest,4,"manager-b"));
});
