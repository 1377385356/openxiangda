import assert from "node:assert/strict";
import test from "node:test";
import { referenceRegistryConfiguration } from "../lib/reference-registry.mjs";

function packageSection(configuration, packageName) {
  return configuration
    .split(`  '${packageName}':`)[1]
    ?.split(/\n  (?:'|#)/)[0];
}

test("reference registry keeps exact candidates local and proxies other packages", () => {
  const configuration = referenceRegistryConfiguration([
    "openxiangda-cli",
    "openxiangda-mcp",
    "openxiangda-cli",
  ]);
  for (const packageName of ["openxiangda-cli", "openxiangda-mcp"]) {
    const section = packageSection(configuration, packageName);
    assert.ok(section, `${packageName} configuration is missing`);
    assert.match(section, /\n\s+publish: \$all/);
    assert.doesNotMatch(section, /\n\s+proxy:/);
  }

  assert.equal(configuration.match(/  'openxiangda-cli':/g)?.length, 1);
  assert.doesNotMatch(configuration, /  'openxiangda-\*':/);
  assert.match(packageSection(configuration, "**"), /\n\s+proxy: npmjs/);
  assert.match(configuration, /^max_body_size: 100mb$/m);
});

test("reference registry rejects package names that could alter YAML", () => {
  assert.throws(
    () => referenceRegistryConfiguration(["openxiangda-cli'\n  '**"]),
    /INVALID_REFERENCE_CANDIDATE_PACKAGE/
  );
});
