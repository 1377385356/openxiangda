import {
  createToolchainCapsule,
  isOpenXiangdaPackageName,
  TOOLCHAIN_CAPSULE_MAX_MANIFEST_BYTES,
  TOOLCHAIN_CAPSULE_MAX_PACKAGE_FILES,
  ToolchainCapsuleScanLimitError,
  type ToolchainCapsule,
} from "openxiangda-devkit-core";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveCliToolchainCapsule(
  templateRoot = resolveDefaultTemplate()
): ToolchainCapsule {
  const localVersions = readLocalPackageVersions();
  const versions = new Map<string, string>();

  for (const dependency of readTemplateDependencies(templateRoot)) {
    const value = dependency.specifier.startsWith("workspace:")
      ? localVersions.get(dependency.name)
      : dependency.specifier;
    if (!value || /[<>=*^~| ]/.test(value)) {
      throw new Error(
        `OPENXIANGDA_TEMPLATE_CAPSULE_VERSION_UNRESOLVED: ${dependency.name}`
      );
    }
    const previous = versions.get(dependency.name);
    if (previous && previous !== value) {
      throw new Error(
        `OPENXIANGDA_TEMPLATE_CAPSULE_SPLIT: ${dependency.name}`
      );
    }
    versions.set(dependency.name, value);
  }
  return createToolchainCapsule(versions, "cli-template");
}

export function resolveDefaultTemplate() {
  const repository = resolve(packageRoot, "../../templates/application");
  if (existsSync(repository)) return repository;
  return join(packageRoot, "template");
}

function readLocalPackageVersions() {
  const packagesRoot = resolve(packageRoot, "..");
  const versions = new Map<string, string>();
  const self = readManifest(join(packageRoot, "package.json"));
  if (
    self &&
    typeof self.name === "string" &&
    typeof self.version === "string" &&
    isOpenXiangdaPackageName(self.name)
  ) {
    versions.set(self.name, self.version);
  }
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name)
  )) {
    if (!entry.isDirectory()) continue;
    const manifest = readManifest(join(packagesRoot, entry.name, "package.json"));
    if (
      manifest &&
      typeof manifest.name === "string" &&
      typeof manifest.version === "string" &&
      isOpenXiangdaPackageName(manifest.name)
    ) {
      versions.set(manifest.name, manifest.version);
    }
  }
  return versions;
}

interface TemplateDependency {
  name: string;
  specifier: string;
  packageFile: string;
  section: string;
}

function readTemplateDependencies(root: string) {
  const dependencies: TemplateDependency[] = [];
  let packageFileCount = 0;
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name)
    )) {
      if (["node_modules", "dist", ".openxiangda"].includes(entry.name)) {
        continue;
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile() || entry.name !== "package.json") continue;
      packageFileCount += 1;
      if (packageFileCount > TOOLCHAIN_CAPSULE_MAX_PACKAGE_FILES) {
        throw new ToolchainCapsuleScanLimitError(
          `template package.json count exceeds ${TOOLCHAIN_CAPSULE_MAX_PACKAGE_FILES}`
        );
      }
      if (statSync(path).size > TOOLCHAIN_CAPSULE_MAX_MANIFEST_BYTES) {
        throw new ToolchainCapsuleScanLimitError(
          `${relative(root, path)} exceeds ${TOOLCHAIN_CAPSULE_MAX_MANIFEST_BYTES} bytes`
        );
      }
      const manifest = readManifest(path);
      if (!manifest) continue;
      for (const section of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const values = manifest[section];
        if (!values || typeof values !== "object") continue;
        for (const [name, specifier] of Object.entries(
          values as Record<string, unknown>
        )) {
          if (!isOpenXiangdaPackageName(name)) {
            continue;
          }
          dependencies.push({
            name,
            specifier: String(specifier),
            packageFile: relative(root, path).replaceAll("\\", "/"),
            section,
          });
        }
      }
    }
  };
  visit(resolve(root));
  return dependencies.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.packageFile.localeCompare(right.packageFile) ||
      left.section.localeCompare(right.section)
  );
}

function readManifest(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
