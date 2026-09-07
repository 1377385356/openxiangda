export const PUBLIC_PACKAGE_HARD_CAP = 7;

export const PUBLIC_PACKAGE_NAMES = Object.freeze([
  "openxiangda",
  "openxiangda-cli",
  "openxiangda-contracts",
  "openxiangda-devkit-core",
  "openxiangda-mcp",
  "openxiangda-nest",
  "openxiangda-skill-kit",
]);

export const RETIRED_PACKAGE_NAMES = Object.freeze([
  "create-openxiangda",
  "openxiangda-admin",
  "openxiangda-compiler",
  "openxiangda-field-kit",
  "openxiangda-testing",
  "openxiangda-user",
  "openxiangda-workflow",
]);

export const PUBLIC_SKILL_NAME = "openxiangda-v2";

export const RETIRED_SKILL_NAMES = Object.freeze([
  "openxiangda-v2-architecture",
  "openxiangda-v2-backend",
  "openxiangda-v2-data-authz",
  "openxiangda-v2-delivery",
  "openxiangda-v2-frontend",
  "openxiangda-v2-workflow-events",
]);

export function assertPublicPackagePolicy(packages) {
  const names = packages.map(item => item.manifest.name).sort();
  const expected = [...PUBLIC_PACKAGE_NAMES].sort();
  if (names.length > PUBLIC_PACKAGE_HARD_CAP) {
    fail(`PUBLIC_PACKAGE_BUDGET_EXCEEDED: ${names.length}>${PUBLIC_PACKAGE_HARD_CAP}`);
  }
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    fail(
      `PUBLIC_PACKAGE_SET_INVALID: expected ${expected.join(", ")}; received ${names.join(", ")}`
    );
  }

  const binaries = packages.flatMap(item => {
    const value = item.manifest.bin;
    if (!value) return [];
    if (typeof value === "string") return [[item.manifest.name, item.manifest.name, value]];
    return Object.entries(value).map(([name, target]) => [
      item.manifest.name,
      name,
      String(target),
    ]);
  });
  const expectedBinary = [["openxiangda", "openxiangda", "./bin/run.js"]];
  if (JSON.stringify(binaries) !== JSON.stringify(expectedBinary)) {
    fail(`PUBLIC_BINARY_SET_INVALID: ${JSON.stringify(binaries)}`);
  }
  return packages;
}

function fail(message) {
  throw new Error(message);
}
