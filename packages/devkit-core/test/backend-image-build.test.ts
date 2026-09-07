import { NATIVE_CONFIGURATION_VALIDATOR_DIGEST } from 'openxiangda-contracts/native-compiler';
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  SCHEMA_VERSIONS,
  type PlatformCapabilities,
} from "openxiangda-contracts";
import {
  BackendImageBuildError,
  backendImageBuildTarget,
  publishBackendImage,
} from "../src/backend-image-build.js";

const digest = `sha256:${"a".repeat(64)}`;

test("derives one app-scoped repository from the platform-owned prefix", () => {
  assert.deepEqual(
    backendImageBuildTarget(capabilities(), "instrument-center"),
    {
      repository: "registry.example.invalid/openxiangda/instrument-center-server",
      platform: "linux/amd64",
    }
  );
});

test("accepts the same canonical OCI repository prefix grammar as the platform", () => {
  for (const repositoryPrefix of [
    "registry.example.com/openxiangda",
    "registry.example.com:5000/app--images/component__cache",
    "localhost:5000/apps",
    "team/app--images/component__cache",
    "127.0.0.1:5000/apps",
    "[2001:db8::1]:5000/apps",
    "registry.example.com",
    "localhost:5000",
    Array.from({ length: 32 }, () => "a").join("/"),
  ]) {
    assert.equal(
      backendImageBuildTarget(
        capabilities({ repositoryPrefix }),
        "instrument-center"
      ).repository,
      `${repositoryPrefix}/instrument-center-server`,
      repositoryPrefix
    );
  }
});

test("fails closed for unavailable or malicious backend image targets", () => {
  const incomplete = capabilities();
  delete (incomplete.deployment as Partial<PlatformCapabilities["deployment"]>)
    .backendImageBuild;
  assert.throws(
    () => backendImageBuildTarget(incomplete, "instrument-center"),
    errorCode("OPENXIANGDA_BACKEND_IMAGE_BUILD_CONFIG_INVALID")
  );
  assert.throws(
    () =>
      backendImageBuildTarget(
        capabilities({ available: false, repositoryPrefix: null }),
        "instrument-center"
      ),
    errorCode("OPENXIANGDA_BACKEND_IMAGE_BUILD_UNAVAILABLE")
  );
  assert.throws(
    () =>
      backendImageBuildTarget(
        capabilities({
          available: false,
          repositoryPrefix: "registry.example.invalid/openxiangda",
        }),
        "instrument-center"
      ),
    errorCode("OPENXIANGDA_BACKEND_IMAGE_BUILD_UNAVAILABLE")
  );
  for (const repositoryPrefix of [
    "https://registry.example.invalid/apps",
    "user@registry.example.invalid/apps",
    "registry.example.invalid/apps:latest",
    "registry.example.invalid//apps",
    "Registry.example.invalid/apps",
    "registry.example.invalid/apps/",
    "/registry.example.invalid/apps",
    "registry.example.invalid/../apps",
    "registry.example.invalid/%2e%2e/apps",
    "registry.example.invalid\\apps",
    "registry.example.invalid/apps?tag=latest",
    "registry.example.invalid:0/apps",
    "registry.example.invalid:65536/apps",
    "registry_example.com/team",
    "[2001:db8::gg]:5000/apps",
    `registry.example.invalid/${"a".repeat(180)}`,
    Array.from({ length: 33 }, (_, index) => `part${index}`).join("/"),
  ]) {
    assert.throws(
      () =>
        backendImageBuildTarget(
          capabilities({ repositoryPrefix }),
          "instrument-center"
        ),
      errorCode("OPENXIANGDA_BACKEND_IMAGE_REPOSITORY_INVALID"),
      repositoryPrefix
    );
  }
});

test("uses the official Dockerfile, fixed platform and Buildx metadata digest", async () => {
  const fixture = workspace();
  try {
    const docker = fakeDocker(
      fixture.root,
      `fs.writeFileSync(args[args.indexOf("--metadata-file") + 1], JSON.stringify({"containerimage.digest": ${JSON.stringify(
        digest
      )}}));`
    );
    const published = await publishBackendImage({
      root: fixture.root,
      backendRoot: "apps/server",
      sourceRevision: "0123456789abcdef",
      target: backendImageBuildTarget(capabilities(), "instrument-center"),
      dockerExecutable: docker,
    });
    assert.equal(
      published.reference,
      `registry.example.invalid/openxiangda/instrument-center-server@${digest}`
    );
    const calls = readFileSync(join(fixture.root, "docker-calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(line => JSON.parse(line) as string[]);
    assert.deepEqual(calls[0], ["buildx", "version"]);
    const build = calls[1]!;
    assert.deepEqual(build.slice(0, 2), ["buildx", "build"]);
    assert.equal(build[build.indexOf("--platform") + 1], "linux/amd64");
    assert.equal(build.includes("--provenance=false"), true);
    assert.equal(
      build[build.indexOf("--file") + 1],
      join(fixture.root, "apps/server/Dockerfile")
    );
    assert.match(
      build[build.indexOf("--tag") + 1]!,
      /^registry\.example\.invalid\/openxiangda\/instrument-center-server:ox2-0123456789ab-[a-f0-9-]+$/
    );
    assert.equal(build.includes("--push"), true);
    assert.equal(build.at(-1), fixture.root);
  } finally {
    fixture.cleanup();
  }
});

test("redacts registry output and returns stable auth and metadata errors", async () => {
  const authFixture = workspace();
  try {
    const docker = fakeDocker(
      authFixture.root,
      `process.stderr.write("unauthorized password=must-not-leak"); process.exit(1);`
    );
    await assert.rejects(
      () =>
        publishBackendImage({
          root: authFixture.root,
          backendRoot: "apps/server",
          target: backendImageBuildTarget(capabilities(), "instrument-center"),
          dockerExecutable: docker,
        }),
      (error: unknown) => {
        assert.equal(
          (error as BackendImageBuildError).code,
          "OPENXIANGDA_REGISTRY_AUTH_REQUIRED"
        );
        assert.equal(String((error as Error).message).includes("must-not-leak"), false);
        return true;
      }
    );
  } finally {
    authFixture.cleanup();
  }

  const metadataFixture = workspace();
  try {
    const docker = fakeDocker(
      metadataFixture.root,
      `fs.writeFileSync(args[args.indexOf("--metadata-file") + 1], "{}");`
    );
    await assert.rejects(
      () =>
        publishBackendImage({
          root: metadataFixture.root,
          backendRoot: "apps/server",
          target: backendImageBuildTarget(capabilities(), "instrument-center"),
          dockerExecutable: docker,
        }),
      errorCode("OPENXIANGDA_BACKEND_IMAGE_DIGEST_MISSING")
    );
  } finally {
    metadataFixture.cleanup();
  }
});

test("reports a missing Docker CLI before attempting a build", async () => {
  const fixture = workspace();
  try {
    await assert.rejects(
      () =>
        publishBackendImage({
          root: fixture.root,
          backendRoot: "apps/server",
          target: backendImageBuildTarget(capabilities(), "instrument-center"),
          dockerExecutable: join(fixture.root, "missing-docker"),
        }),
      errorCode("OPENXIANGDA_DOCKER_REQUIRED")
    );
  } finally {
    fixture.cleanup();
  }
});

test("returns stable Buildx, daemon, network and generic build failures", async () => {
  const missingBuildx = workspace();
  try {
    const docker = fakeDocker(
      missingBuildx.root,
      "process.exit(97);",
      "process.exit(1);"
    );
    await assert.rejects(
      () =>
        publishBackendImage({
          root: missingBuildx.root,
          backendRoot: "apps/server",
          target: backendImageBuildTarget(capabilities(), "instrument-center"),
          dockerExecutable: docker,
        }),
      errorCode("OPENXIANGDA_DOCKER_BUILDX_REQUIRED")
    );
  } finally {
    missingBuildx.cleanup();
  }

  for (const fixtureCase of [
    {
      output: "Cannot connect to the Docker daemon",
      code: "OPENXIANGDA_DOCKER_DAEMON_UNAVAILABLE",
      retryable: true,
    },
    {
      output: "network is unreachable",
      code: "OPENXIANGDA_BACKEND_IMAGE_PUSH_FAILED",
      retryable: true,
    },
    {
      output:
        "TypeError: fetch failed; Client network socket disconnected before secure TLS connection was established; code ECONNRESET",
      code: "OPENXIANGDA_BACKEND_IMAGE_PUSH_FAILED",
      retryable: true,
    },
    {
      output: "Dockerfile syntax error",
      code: "OPENXIANGDA_BACKEND_IMAGE_BUILD_FAILED",
      retryable: false,
    },
  ]) {
    const fixture = workspace();
    try {
      const docker = fakeDocker(
        fixture.root,
        `process.stderr.write(${JSON.stringify(
          fixtureCase.output
        )}); process.exit(1);`
      );
      await assert.rejects(
        () =>
          publishBackendImage({
            root: fixture.root,
            backendRoot: "apps/server",
            target: backendImageBuildTarget(capabilities(), "instrument-center"),
            dockerExecutable: docker,
          }),
        (error: unknown) => {
          assert.equal((error as BackendImageBuildError).code, fixtureCase.code);
          assert.equal(
            (error as BackendImageBuildError).retryable,
            fixtureCase.retryable
          );
          return true;
        }
      );
      const buildCalls = readFileSync(
        join(fixture.root, "docker-calls.jsonl"),
        "utf8"
      )
        .trim()
        .split("\n")
        .map(line => JSON.parse(line) as string[])
        .filter(args => args[0] === "buildx" && args[1] === "build");
      assert.equal(
        buildCalls.length,
        fixtureCase.code === "OPENXIANGDA_BACKEND_IMAGE_PUSH_FAILED" ? 3 : 1
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test("retries a transient network failure with one stable tag before succeeding", async () => {
  const fixture = workspace();
  try {
    const marker = join(fixture.root, "network-build-attempts");
    const docker = fakeDocker(
      fixture.root,
      `const marker = ${JSON.stringify(marker)};
const attempt = fs.existsSync(marker) ? Number(fs.readFileSync(marker, "utf8")) + 1 : 1;
fs.writeFileSync(marker, String(attempt));
if (attempt < 3) {
  process.stderr.write("TypeError: fetch failed code ECONNRESET");
  process.exit(1);
}
fs.writeFileSync(args[args.indexOf("--metadata-file") + 1], JSON.stringify({"containerimage.digest": ${JSON.stringify(
        digest
      )}}));`
    );
    const published = await publishBackendImage({
      root: fixture.root,
      backendRoot: "apps/server",
      sourceRevision: "abcdef0123456789",
      target: backendImageBuildTarget(capabilities(), "instrument-center"),
      dockerExecutable: docker,
    });
    assert.equal(published.digest, digest);
    const builds = readFileSync(join(fixture.root, "docker-calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(line => JSON.parse(line) as string[])
      .filter(args => args[0] === "buildx" && args[1] === "build");
    assert.equal(builds.length, 3);
    assert.equal(new Set(builds.map(args => args[args.indexOf("--tag") + 1])).size, 1);
  } finally {
    fixture.cleanup();
  }
});

function capabilities(
  build: Partial<
    PlatformCapabilities["deployment"]["backendImageBuild"]
  > = {}
): PlatformCapabilities {
  return {
    schemaVersion: SCHEMA_VERSIONS.platformCapabilities,
    apiVersion: "v2",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    platformVersion: "2.0.0-test",
    features: {},
    configurationCompatibility: {
      schemaVersion: SCHEMA_VERSIONS.configurationCompatibility,
      capability: {
        code: "configuration.compatibility-preflight",
        version: "native-2",
        status: "available",
      },
      requestSchemaVersion: SCHEMA_VERSIONS.configurationValidationRequest,
      resultSchemaVersion: SCHEMA_VERSIONS.configurationValidationResult,
      endpointTemplate:
        "/openxiangda-api/v2/applications/{appCode}/configuration-compatibility",
      limits: {
        configurationCanonicalBytes: 4 * 1024 * 1024,
        contractCanonicalBytes: 8 * 1024 * 1024,
        requestBytes: 10 * 1024 * 1024,
      },
      supportedApplicationContracts: [{ ...CURRENT_APPLICATION_CONTRACT }],
      validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST,
    },
    deployment: {
      executionOwner: "platform",
      durableRuns: true,
      clientCanCheckpoint: false,
      backendImageBuild: {
        owner: "developer-cli",
        available: true,
        repositoryPrefix: "registry.example.invalid/openxiangda",
        platform: "linux/amd64",
        ...build,
      },
    },
  };
}

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-backend-image-test-"));
  mkdirSync(join(root, "apps/server"), { recursive: true });
  writeFileSync(join(root, "apps/server/Dockerfile"), "FROM scratch\n");
  writeFileSync(join(root, ".dockerignore"), "node_modules\n.openxiangda\n");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function fakeDocker(
  root: string,
  buildBody: string,
  versionBody = "process.exit(0);"
) {
  const path = join(root, "docker");
  const marker = join(root, "docker-calls.jsonl");
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(marker)}, JSON.stringify(args) + "\\n");
if (args[0] === "buildx" && args[1] === "version") { ${versionBody} }
${buildBody}
`,
    { mode: 0o755 }
  );
  chmodSync(path, 0o755);
  return path;
}

function errorCode(code: string) {
  return (error: unknown) => {
    assert.equal((error as BackendImageBuildError).code, code);
    return true;
  };
}
