import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJson,
  assertPortablePackageFiles,
  compareReleaseVersions,
  isNpmPackageNotFound,
  manifestSemanticDifferences,
  parseReleaseVersion,
  selectReleasePackages,
} from "../lib/release-package-state.mjs";

test("npm package absence is distinct from registry or authentication failure", () => {
  assert.equal(
    isNpmPackageNotFound(
      "npm error code E404\nnpm error 404 Not Found - GET registry/package"
    ),
    true
  );
  assert.equal(
    isNpmPackageNotFound("npm error code E401\nnpm error Unable to authenticate"),
    false
  );
  assert.equal(isNpmPackageNotFound("npm error code ETIMEDOUT"), false);
});

test("canonical package JSON ignores object key order", () => {
  assert.equal(
    canonicalJson({ dependencies: { beta: "1", alpha: "2" }, name: "x" }),
    canonicalJson({ name: "x", dependencies: { alpha: "2", beta: "1" } })
  );
});

test("candidate packages cannot capture local template dependencies or verification outputs", () => {
  assert.doesNotThrow(() => assertPortablePackageFiles(new Map([['templates/backend/src/main.ts', 'digest'], ['templates/backend/test/smoke.test.ts', 'digest']])));
  for (const path of ['templates/backend/node_modules/.bin/tsc', 'templates/backend/.turbo/turbo-build.log', 'dist/coverage/index.html', 'template/.git/config', 'template/test-results/report.json']) {
    assert.throws(() => assertPortablePackageFiles(new Map([[path, 'digest']])), /RELEASE_PACKAGE_LOCAL_ARTIFACT_FORBIDDEN/);
  }
});

test("release version ordering selects earlier alpha versions", () => {
  assert.ok(compareReleaseVersions("2.0.0-alpha.12", "2.0.0-alpha.13") < 0);
  assert.ok(compareReleaseVersions("2.0.0-alpha.14", "2.0.0-alpha.13") > 0);
  assert.deepEqual(parseReleaseVersion("2.0.0-alpha.13"), {
    core: [2, 0, 0],
    pre: ["alpha", "13"],
  });
});

test("semantic manifest diff ignores version and propagated internal pins", () => {
  const previous = {
    name: "openxiangda-cli",
    version: "2.0.0-alpha.13",
    dependencies: {
      "openxiangda-skill-kit": "2.0.0-alpha.12",
      external: "1.0.0",
    },
    files: ["bin/", "dist/", "README.md"],
  };
  const current = {
    name: "openxiangda-cli",
    version: "2.0.0-alpha.14",
    dependencies: {
      "openxiangda-skill-kit": "2.0.0-alpha.13",
      external: "1.1.0",
    },
    files: ["bin/", "dist/", "README.md"],
  };
  assert.deepEqual(manifestSemanticDifferences(current, previous), [
    "package.json#dependencies.external",
  ]);
});

test("an empty release package filter selects all public packages", () => {
  const packages = [
    { manifest: { name: "openxiangda-cli" } },
    { manifest: { name: "openxiangda-devkit-core" } },
  ];
  assert.equal(selectReleasePackages(packages), packages);
  assert.deepEqual(selectReleasePackages(packages, ["openxiangda-cli"]), [
    packages[0],
  ]);
  assert.throws(
    () => selectReleasePackages(packages, ["missing-package"]),
    /Unknown release packages: missing-package/
  );
});
