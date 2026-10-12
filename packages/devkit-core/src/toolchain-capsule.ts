import {
  SCHEMA_VERSIONS,
  type Diagnostic,
} from "openxiangda-contracts";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative } from "node:path";
import { OPENXIANGDA_TOOLCHAIN_VERSION } from "./version.js";
import { workspacePackageInputs, WORKSPACE_MAX_PACKAGE_FILES, WORKSPACE_MAX_MANIFEST_BYTES } from "./workspace-inputs.js";
export { WorkspaceInputLimitError as ToolchainCapsuleScanLimitError, WorkspaceInputError as ToolchainCapsuleInputError } from "./workspace-inputs.js";

export const TOOLCHAIN_CAPSULE_SCHEMA_VERSION =
  "openxiangda.toolchain-capsule/v1" as const;
export const TOOLCHAIN_CAPSULE_MAX_PACKAGE_FILES = WORKSPACE_MAX_PACKAGE_FILES;
export const TOOLCHAIN_CAPSULE_MAX_MANIFEST_BYTES = WORKSPACE_MAX_MANIFEST_BYTES;

/**
 * These are the minimum app-facing packages owned by the official application
 * template. This is a contract boundary, not a version table: versions are
 * always read from the current template/package manifests. Additional
 * openxiangda-* packages discovered in the template are included as well.
 */
export const TOOLCHAIN_CAPSULE_PACKAGE_NAMES = ["openxiangda"] as const;

export function isOpenXiangdaPackageName(name: string) {
  return name === "openxiangda" || name.startsWith("openxiangda-");
}

export type ToolchainCapsulePackageName =
  (typeof TOOLCHAIN_CAPSULE_PACKAGE_NAMES)[number];

export interface ToolchainCapsule {
  readonly schemaVersion: typeof TOOLCHAIN_CAPSULE_SCHEMA_VERSION;
  readonly owner: "cli-template" | "devkit-core";
  readonly packages: Readonly<Record<string, string>>;
}

export interface WorkspaceToolchainDependency {
  readonly name: string;
  readonly specifier: string;
  readonly packageFile: string;
  readonly section: string;
}

export interface ToolchainCapsuleMismatch {
  readonly expected: string | null;
  readonly actual: string;
  readonly packageFile: string;
  readonly section: string;
}

export function createToolchainCapsule(
  packages: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  owner: ToolchainCapsule["owner"] = "cli-template"
): ToolchainCapsule {
  const entries = packages instanceof Map
    ? [...packages.entries()]
    : Object.entries(packages);
  const normalized = Object.fromEntries(
    entries
      .filter(([name, version]) =>
        isOpenXiangdaPackageName(name) && Boolean(String(version).trim())
      )
      .map(([name, version]) => [name, String(version).trim()])
      .sort(([left], [right]) => left.localeCompare(right))
  );
  return Object.freeze({
    schemaVersion: TOOLCHAIN_CAPSULE_SCHEMA_VERSION,
    owner,
    packages: Object.freeze(normalized),
  });
}

/**
 * A framework-neutral devkit caller has no CLI template owner. It can still
 * reject a stale core/contracts pair using the two versions it actually
 * executes and imports.
 */
export function defaultDevkitCoreToolchainCapsule(): ToolchainCapsule {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as {
    dependencies?: Record<string, unknown>;
  };
  const contractsVersion = String(
    manifest.dependencies?.["openxiangda-contracts"] || ""
  ).trim();
  if (!contractsVersion || /[<>=*^~| ]/.test(contractsVersion)) {
    throw new Error("OPENXIANGDA_CONTRACT_DEPENDENCY_NOT_EXACT");
  }
  return createToolchainCapsule(
    new Map([
      ["openxiangda-contracts", contractsVersion],
      ["openxiangda-devkit-core", OPENXIANGDA_TOOLCHAIN_VERSION],
    ]),
    "devkit-core"
  );
}

export function collectWorkspaceToolchainDependencies(
  root: string,
  options: { dockerfile?: string } = {}
): WorkspaceToolchainDependency[] {
  const dependencies: WorkspaceToolchainDependency[] = [];
  if (!existsSync(root)) return dependencies;
  root = realpathSync(root);
  for (const [path, packageJson] of workspacePackageInputs(root, options)) {
    for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const values = packageJson[section];
      if (!values || typeof values !== "object") continue;
      for (const [name, specifier] of Object.entries(values as Record<string, unknown>)) {
        if (!isOpenXiangdaPackageName(name)) continue;
        dependencies.push({ name, specifier: String(specifier), packageFile: relative(root, path).replaceAll("\\", "/"), section });
      }
    }
  }
  return dependencies.sort((a, b) => a.name.localeCompare(b.name) || a.packageFile.localeCompare(b.packageFile) || a.section.localeCompare(b.section));
}

export function toolchainCapsuleMismatches(
  dependencies: readonly WorkspaceToolchainDependency[],
  capsule: ToolchainCapsule
): ToolchainCapsuleMismatch[] {
  const expected = capsule.packages;
  const relevant = dependencies.filter(
    item =>
      isOpenXiangdaPackageName(item.name) &&
      (capsule.owner === "cli-template" ||
        Object.prototype.hasOwnProperty.call(expected, item.name))
  );
  const actualByName = new Map<string, Set<string>>();
  for (const dependency of relevant) {
    const values = actualByName.get(dependency.name) || new Set<string>();
    values.add(dependency.specifier);
    actualByName.set(dependency.name, values);
  }
  const mismatches: ToolchainCapsuleMismatch[] = [];
  for (const dependency of relevant) {
    const expectedVersion = String(expected[dependency.name] || "");
    const values = actualByName.get(dependency.name) || new Set<string>();
    if (
      dependency.specifier !== expectedVersion ||
      values.size > 1
    ) {
      mismatches.push({
        expected: expectedVersion || null,
        actual: dependency.specifier,
        packageFile: dependency.packageFile,
        section: dependency.section,
      });
    }
  }
  return mismatches;
}

export function toolchainCapsuleDiagnostic(
  dependencies: readonly WorkspaceToolchainDependency[],
  capsule: ToolchainCapsule
): Diagnostic | undefined {
  const mismatches = toolchainCapsuleMismatches(dependencies, capsule);
  if (mismatches.length === 0) return undefined;
  return {
    schemaVersion: SCHEMA_VERSIONS.diagnostic,
    code: "OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH",
    severity: "error",
    message: "工作区 OpenXiangda 依赖与当前 CLI 模板版本胶囊不一致",
    path: "package.json",
    retryable: false,
    remediation:
      "使用当前 CLI 重新 create，或将所有 OpenXiangda 包更新为胶囊中的精确版本后运行 pnpm install --frozen-lockfile",
    details: {
      owner: capsule.owner,
      schemaVersion: capsule.schemaVersion,
      expected: capsule.packages,
      mismatches,
    },
  };
}
