import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  PUBLIC_PACKAGE_HARD_CAP,
  PUBLIC_PACKAGE_NAMES,
  PUBLIC_SKILL_NAME,
  RETIRED_PACKAGE_NAMES,
  RETIRED_SKILL_NAMES,
  assertPublicPackagePolicy,
} from "../lib/public-package-policy.mjs";
import { publicPackages } from "../lib/release-package-state.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("source discovery is the exact seven-package release surface with one root bin", () => {
  const packages = publicPackages(repositoryRoot);
  assert.deepEqual(
    packages.map(item => item.manifest.name),
    [...PUBLIC_PACKAGE_NAMES].sort()
  );
  const versions = new Map(
    packages.map(item => [item.manifest.name, item.manifest.version])
  );
  for (const item of packages) {
    for (const [dependency, version] of Object.entries(
      item.manifest.dependencies || {}
    )) {
      if (!versions.has(dependency)) continue;
      assert.equal(
        version,
        versions.get(dependency),
        `${item.manifest.name} -> ${dependency}`
      );
      assert.equal(String(version).startsWith("workspace:"), false);
    }
  }
  assert.deepEqual(
    readdirSync(resolve(repositoryRoot, "packages"), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort(),
    ["cli", "contracts", "devkit-core", "mcp", "nest", "openxiangda", "skill-kit"]
  );
  for (const retired of RETIRED_PACKAGE_NAMES) {
    assert.equal(
      existsSync(
        resolve(repositoryRoot, "packages", retired.replace(/^openxiangda-/, ""))
      ),
      false,
      retired
    );
  }
  assert.equal(packages.length <= PUBLIC_PACKAGE_HARD_CAP, true);
  assert.deepEqual(
    packages.flatMap(item =>
      Object.keys(item.manifest.bin || {}).map(name => [item.manifest.name, name])
    ),
    [["openxiangda", "openxiangda"]]
  );
  assert.throws(
    () =>
      assertPublicPackagePolicy([
        ...packages,
        { manifest: { name: "openxiangda-extra", version: "2.0.0-alpha.1" } },
      ]),
    /PUBLIC_PACKAGE_SET_INVALID|PUBLIC_PACKAGE_BUDGET_EXCEEDED/
  );
});

test("active manifests, current docs and lockfile contain no retired package", () => {
  const files = [
    "package.json",
    "pnpm-lock.yaml",
    "README.md",
    "docs/.vitepress/config.ts",
    "docs/index.md",
    "docs/llms.txt",
    "docs/getting-started.md",
    "docs/concepts.md",
    "docs/frontend.md",
    "docs/public-access.md",
    "docs/field-components.md",
    "docs/backend.md",
    "docs/data-authz.md",
    "docs/delivery.md",
    "docs/reference/cli.md",
    "docs/reference/mcp.md",
    "skills/manifest.json",
    "skills/openxiangda-v2/SKILL.md",
    "skills/openxiangda-v2/references/concepts.md",
    "skills/openxiangda-v2/references/backend.md",
    "skills/openxiangda-v2/references/data-authz.md",
    "skills/openxiangda-v2/references/delivery.md",
    "skills/openxiangda-v2/references/development.md",
    "skills/openxiangda-v2/references/frontend.md",
    "skills/openxiangda-v2/references/public-access.md",
    "skills/openxiangda-v2/references/testing.md",
    "skills/openxiangda-v2/references/workflow-events.md",
    "skills/openxiangda-v2/references/upgrading.md",
    ...PUBLIC_PACKAGE_NAMES.map(name =>
      `packages/${name.replace(/^openxiangda-/, "")}/package.json`
    ),
  ];
  for (const file of files) {
    const source = readFileSync(resolve(repositoryRoot, file), "utf8");
    for (const retired of RETIRED_PACKAGE_NAMES) {
      assert.equal(source.includes(retired), false, `${file} -> ${retired}`);
    }
    for (const retired of RETIRED_SKILL_NAMES) {
      assert.equal(source.includes(retired), false, `${file} -> ${retired}`);
    }
  }
});

test("current Skill surfaces expose exactly one installable entry", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, "skills/manifest.json"), "utf8")
  );
  assert.deepEqual(
    manifest.skills?.map(skill => skill.name),
    [PUBLIC_SKILL_NAME]
  );
  for (const retired of RETIRED_SKILL_NAMES) {
    assert.equal(existsSync(resolve(repositoryRoot, "skills", retired)), false);
  }
});
