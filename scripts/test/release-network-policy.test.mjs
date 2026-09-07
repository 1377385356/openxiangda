import assert from "node:assert/strict";
import test from "node:test";
import {
  isTransientRegistryFailure,
  releaseNpmEnvironment,
  runTransientRegistryOperation,
} from "../lib/release-network-policy.mjs";

test("release npm requests have bounded defaults and respect explicit overrides", () => {
  const defaults = releaseNpmEnvironment({ PATH: "/bin" });
  assert.equal(defaults.NPM_CONFIG_FETCH_TIMEOUT, "30000");
  assert.equal(defaults.NPM_CONFIG_FETCH_RETRIES, "2");
  assert.equal(defaults.NPM_CONFIG_FETCH_RETRY_MINTIMEOUT, "1000");
  assert.equal(defaults.NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT, "5000");

  const configured = releaseNpmEnvironment({
    NPM_CONFIG_FETCH_TIMEOUT: "45000",
    npm_config_fetch_retries: "4",
  });
  assert.equal(configured.NPM_CONFIG_FETCH_TIMEOUT, "45000");
  assert.equal(configured.NPM_CONFIG_FETCH_RETRIES, "4");
});

test("only transient registry and transport failures are retryable", () => {
  for (const output of [
    "ERR_PNPM_FETCH_503 Service Unavailable",
    "code ECONNRESET",
    "Client network socket disconnected before secure TLS connection",
    "npm error code ETIMEDOUT",
  ]) {
    assert.equal(isTransientRegistryFailure(output), true, output);
  }
  assert.equal(isTransientRegistryFailure("ERR_PNPM_OUTDATED_LOCKFILE"), false);
  assert.equal(isTransientRegistryFailure("authentication required"), false);
});

test("a registry operation resumes twice in place and then succeeds", async () => {
  let calls = 0;
  const retries = [];
  const outcome = await runTransientRegistryOperation(
    () => {
      calls += 1;
      return calls < 3
        ? { status: 1, stderr: "ERR_PNPM_FETCH_503" }
        : { status: 0, stdout: "installed" };
    },
    {
      delaysMs: [0, 0],
      onRetry: value => retries.push(value.nextAttempt),
    }
  );
  assert.equal(calls, 3);
  assert.deepEqual(retries, [2, 3]);
  assert.equal(outcome.result.stdout, "installed");
});

test("deterministic failures run once and transient exhaustion is bounded", async () => {
  let deterministicCalls = 0;
  const deterministic = await runTransientRegistryOperation(() => {
    deterministicCalls += 1;
    return { status: 1, stderr: "ERR_PNPM_OUTDATED_LOCKFILE" };
  });
  assert.equal(deterministicCalls, 1);
  assert.equal(deterministic.attempts, 1);

  let transientCalls = 0;
  const transient = await runTransientRegistryOperation(
    () => {
      transientCalls += 1;
      return { status: 1, stderr: "ECONNRESET" };
    },
    { delaysMs: [0, 0, 0, 0] }
  );
  assert.equal(transientCalls, 5);
  assert.equal(transient.attempts, 5);
});
