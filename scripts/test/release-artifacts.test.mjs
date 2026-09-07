import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadReleaseArtifactManifest,
  materializeReleaseArtifact,
  selectReleaseArtifacts,
  assertPublicArtifactManifest,
  writeReleaseArtifactManifest,
} from "../lib/release-artifacts.mjs";

test("one release manifest preserves and revalidates exact tarball bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-release-artifacts-"));
  try {
    const tarball = join(root, "openxiangda-contracts-2.0.0-alpha.13.tgz");
    const manifestPath = join(root, "manifest.json");
    writeFileSync(tarball, "validated-package-bytes", "utf8");
    const written = writeReleaseArtifactManifest({
      path: manifestPath,
      head: "abc123",
      registry: "https://registry.npmjs.org",
      packages: [
        {
          name: "openxiangda-contracts",
          version: "2.0.0-alpha.13",
          status: "candidate",
          previousVersion: "2.0.0-alpha.12",
          changedFiles: ["dist/index.js"],
          tarball,
        },
      ],
    });
    const loaded = loadReleaseArtifactManifest(manifestPath, {
      head: "abc123",
      registry: "https://registry.npmjs.org",
      packageNames: ["openxiangda-contracts"],
    });
    assert.equal(loaded.packages[0].sha256, written.packages[0].sha256);
    assert.equal(selectReleaseArtifacts(loaded)[0].tarball, tarball);
    const copied = materializeReleaseArtifact(
      loaded.packages[0],
      join(root, "short")
    );
    assert.equal(
      loadReleaseArtifactManifest(manifestPath).packages[0].sha256,
      written.packages[0].sha256
    );
    assert.equal(
      readFileSync(copied, "utf8"),
      "validated-package-bytes"
    );

    writeFileSync(tarball, "modified-package-bytes", "utf8");
    assert.throws(
      () => loadReleaseArtifactManifest(manifestPath),
      /RELEASE_ARTIFACT_DIGEST_MISMATCH/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("formal release artifacts reject a stale thirteen-package receipt", () => {
  assert.throws(
    () =>
      assertPublicArtifactManifest({
        packages: [
          { name: "openxiangda-cli" },
          { name: "openxiangda-contracts" },
          { name: "openxiangda-devkit-core" },
          { name: "openxiangda-mcp" },
          { name: "openxiangda-nest" },
          { name: "openxiangda-skill-kit" },
          { name: "openxiangda-admin" },
        ],
      }),
    /RELEASE_ARTIFACT_PUBLIC_PACKAGE_SET_INVALID/
  );
});

test("release manifest is bound to the source commit and registry", () => {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-release-artifacts-"));
  try {
    const tarball = join(root, "openxiangda-devkit-core-2.0.0-alpha.17.tgz");
    const manifestPath = join(root, "manifest.json");
    writeFileSync(tarball, "devkit", "utf8");
    writeReleaseArtifactManifest({
      path: manifestPath,
      head: "release-head",
      registry: "https://registry.npmjs.org",
      packages: [
        {
          name: "openxiangda-devkit-core",
          version: "2.0.0-alpha.17",
          status: "candidate",
          tarball,
        },
      ],
    });
    assert.throws(
      () => loadReleaseArtifactManifest(manifestPath, { head: "other-head" }),
      /RELEASE_ARTIFACT_HEAD_MISMATCH/
    );
    assert.throws(
      () =>
        loadReleaseArtifactManifest(manifestPath, {
          registry: "https://registry.example.invalid",
        }),
      /RELEASE_ARTIFACT_REGISTRY_MISMATCH/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
