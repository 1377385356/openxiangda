import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PUBLIC_PACKAGE_NAMES } from "../lib/public-package-policy.mjs";
import {
  ensureReleaseArtifacts,
  packageStateFromManifest,
} from "../lib/release-artifact-preparation.mjs";
import {
  loadReleaseArtifactManifest,
  writeReleaseArtifactManifest,
} from "../lib/release-artifacts.mjs";

const registry = "https://registry.example.test";
const head = "a".repeat(40);

function packageFixtures(root) {
  mkdirSync(root, { recursive: true });
  return PUBLIC_PACKAGE_NAMES.map((name, index) => {
    const file = join(root, `${name.replaceAll("/", "-")}.tgz`);
    writeFileSync(file, `candidate-${index}`, "utf8");
    return {
      name,
      version: "2.20.1",
      status: "candidate",
      previousVersion: "2.20.0",
      changedFiles: ["dist/index.js"],
      tarball: file,
    };
  });
}

test("release artifacts are reused and remain bound to head and registry", () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-artifact-preparation-"));
  try {
    const artifactRoot = join(root, "artifacts");
    const packages = packageFixtures(artifactRoot);
    writeReleaseArtifactManifest({
      path: join(artifactRoot, "manifest.json"),
      head,
      registry,
      packages,
    });
    let inspected = false;
    const state = ensureReleaseArtifacts(root, {
      head,
      artifactRoot,
      registry,
      inspectPackages: () => {
        inspected = true;
        throw new Error("must reuse manifest");
      },
    });
    assert.equal(inspected, false);
    assert.deepEqual(state, packageStateFromManifest(
      loadReleaseArtifactManifest(join(artifactRoot, "manifest.json"), { head, registry })
    ));
    assert.throws(
      () => ensureReleaseArtifacts(root, { head: "b".repeat(40), artifactRoot, registry }),
      /RELEASE_ARTIFACT_HEAD_MISMATCH/
    );
    assert.throws(
      () => ensureReleaseArtifacts(root, { head, artifactRoot, registry: "https://other.example.test" }),
      /RELEASE_ARTIFACT_REGISTRY_MISMATCH/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prebuilt preparation skips build hooks but still writes a complete manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-artifact-preparation-"));
  try {
    const artifactRoot = join(root, "artifacts");
    let received;
    const state = ensureReleaseArtifacts(root, {
      head,
      artifactRoot,
      registry,
      prepare: false,
      inspectPackages: (_repositoryRoot, options) => {
        received = options;
        return { registry, packages: packageFixtures(options.artifactRoot) };
      },
    });
    assert.equal(received.prepare, false);
    assert.equal(state.packages.length, PUBLIC_PACKAGE_NAMES.length);
    assert.equal(loadReleaseArtifactManifest(join(artifactRoot, "manifest.json"), { head, registry }).packages.length, PUBLIC_PACKAGE_NAMES.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
