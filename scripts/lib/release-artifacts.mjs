import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { PUBLIC_PACKAGE_NAMES } from "./public-package-policy.mjs";

export const RELEASE_ARTIFACT_MANIFEST_SCHEMA =
  "openxiangda.release-artifacts/v1";

export function artifactDigests(path) {
  const content = readFileSync(path);
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    integrity: `sha512-${createHash("sha512")
      .update(content)
      .digest("base64")}`,
    size: content.byteLength,
  };
}

export function writeReleaseArtifactManifest({
  path,
  head,
  registry,
  packages,
}) {
  const manifestRoot = dirname(resolve(path));
  mkdirSync(manifestRoot, { recursive: true });
  const entries = packages
    .map(item => {
      const tarball = resolve(item.tarball);
      if (dirname(tarball) !== manifestRoot) {
        throw new Error(
          `RELEASE_ARTIFACT_OUTSIDE_MANIFEST: ${tarball} is not in ${manifestRoot}`
        );
      }
      return {
        name: item.name,
        version: item.version,
        status: item.status,
        previousVersion: item.previousVersion || null,
        changedFiles: Array.isArray(item.changedFiles)
          ? [...item.changedFiles]
          : [],
        file: basename(tarball),
        ...artifactDigests(tarball),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const manifest = {
    schema: RELEASE_ARTIFACT_MANIFEST_SCHEMA,
    head,
    registry,
    packages: entries,
  };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function loadReleaseArtifactManifest(path, options = {}) {
  const manifestPath = resolve(path);
  if (!existsSync(manifestPath)) {
    throw new Error(`RELEASE_ARTIFACT_MANIFEST_MISSING: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== RELEASE_ARTIFACT_MANIFEST_SCHEMA) {
    throw new Error(`RELEASE_ARTIFACT_MANIFEST_UNSUPPORTED: ${manifest.schema}`);
  }
  if (options.head && manifest.head !== options.head) {
    throw new Error(
      `RELEASE_ARTIFACT_HEAD_MISMATCH: ${manifest.head} != ${options.head}`
    );
  }
  if (options.registry && manifest.registry !== options.registry) {
    throw new Error(
      `RELEASE_ARTIFACT_REGISTRY_MISMATCH: ${manifest.registry} != ${options.registry}`
    );
  }
  if (!Array.isArray(manifest.packages) || !manifest.packages.length) {
    throw new Error("RELEASE_ARTIFACT_PACKAGES_MISSING");
  }
  const root = dirname(manifestPath);
  const names = new Set();
  for (const item of manifest.packages) {
    if (!item?.name || !item?.version || names.has(item.name)) {
      throw new Error(`RELEASE_ARTIFACT_PACKAGE_INVALID: ${item?.name || "unknown"}`);
    }
    names.add(item.name);
    const tarball = resolve(root, String(item.file || ""));
    if (dirname(tarball) !== root || !existsSync(tarball) || !statSync(tarball).isFile()) {
      throw new Error(`RELEASE_ARTIFACT_TARBALL_MISSING: ${item.name}`);
    }
    const actual = artifactDigests(tarball);
    for (const field of ["sha256", "integrity", "size"]) {
      if (actual[field] !== item[field]) {
        throw new Error(
          `RELEASE_ARTIFACT_DIGEST_MISMATCH: ${item.name} ${field}`
        );
      }
    }
    item.tarball = tarball;
  }
  const requested = new Set(options.packageNames || []);
  if (requested.size) {
    const missing = [...requested].filter(name => !names.has(name));
    if (missing.length) {
      throw new Error(`RELEASE_ARTIFACT_PACKAGE_MISSING: ${missing.join(", ")}`);
    }
  }
  return manifest;
}

export function assertPublicArtifactManifest(manifest) {
  const names = (manifest.packages || []).map(item => item.name).sort();
  const expected = [...PUBLIC_PACKAGE_NAMES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `RELEASE_ARTIFACT_PUBLIC_PACKAGE_SET_INVALID: expected ${expected.join(", ")}; received ${names.join(", ")}`
    );
  }
  return manifest;
}

export function selectReleaseArtifacts(manifest, packageNames = []) {
  const requested = new Set(packageNames || []);
  return manifest.packages.filter(
    item => requested.size === 0 || requested.has(item.name)
  );
}

export function materializeReleaseArtifact(artifact, destination) {
  mkdirSync(destination, { recursive: true });
  const target = resolve(destination, artifact.file);
  if (target !== artifact.tarball) copyFileSync(artifact.tarball, target);
  const actual = artifactDigests(target);
  for (const field of ["sha256", "integrity", "size"]) {
    if (actual[field] !== artifact[field]) {
      throw new Error(
        `RELEASE_ARTIFACT_COPY_MISMATCH: ${artifact.name} ${field}`
      );
    }
  }
  return target;
}
