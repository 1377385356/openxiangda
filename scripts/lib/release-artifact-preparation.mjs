import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  assertPublicArtifactManifest,
  loadReleaseArtifactManifest,
  writeReleaseArtifactManifest,
} from "./release-artifacts.mjs";
import {
  inspectReleasePackages,
  resolveReleaseRegistry,
} from "./release-package-state.mjs";

/**
 * Prepare the immutable candidate set once and keep it outside the source tree.
 * A later plan, verify or publish invocation can consume the exact same bytes.
 */
export function ensureReleaseArtifacts(
  repositoryRoot,
  {
    head,
    artifactRoot,
    registry,
    quiet = false,
    prepare = true,
    inspectPackages = inspectReleasePackages,
    registryResolver = resolveReleaseRegistry,
  } = {}
) {
  if (!head || !artifactRoot) throw new Error("RELEASE_ARTIFACT_CONTEXT_REQUIRED");
  const resolvedRegistry = registryResolver(repositoryRoot, registry);
  const artifactManifestPath = join(artifactRoot, "manifest.json");

  if (existsSync(artifactManifestPath)) {
    const manifest = assertPublicArtifactManifest(
      loadReleaseArtifactManifest(artifactManifestPath, {
        head,
        registry: resolvedRegistry,
      })
    );
    return packageStateFromManifest(manifest);
  }

  rmSync(artifactRoot, { recursive: true, force: true });
  const packageState = inspectPackages(repositoryRoot, {
    registry: resolvedRegistry,
    artifactRoot,
    prepare,
    quiet,
  });
  const manifest = assertPublicArtifactManifest(
    writeReleaseArtifactManifest({
      path: artifactManifestPath,
      head,
      registry: resolvedRegistry,
      packages: packageState.packages,
    })
  );
  return packageStateFromManifest(manifest);
}

export function packageStateFromManifest(manifest) {
  return {
    schema: "openxiangda.release-package-state/v1",
    registry: manifest.registry,
    packages: manifest.packages.map(item => ({
      name: item.name,
      version: item.version,
      status: item.status,
      previousVersion: item.previousVersion,
      changedFiles: item.changedFiles,
      tarball: item.tarball,
    })),
  };
}
