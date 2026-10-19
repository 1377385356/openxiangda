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


test("task uplink proxy affects official upstream and keeps candidates local", () => {
  const configuration = referenceRegistryConfiguration(["openxiangda-cli"], { uplinkProxy: "http://192.168.2.181:19390" });
  assert.match(configuration, /url: https:\/\/npm\.syedu\.tech\//);
  assert.match(configuration, /http_proxy: "http:\/\/192\.168\.2\.181:19390"/);
  assert.match(configuration, /https_proxy: "http:\/\/192\.168\.2\.181:19390"/);
  assert.doesNotMatch(packageSection(configuration, "openxiangda-cli"), /proxy:/);
  assert.doesNotMatch(referenceRegistryConfiguration([]), /https?_proxy/);
});

test("task uplink proxy rejects credentials and URL content that could alter configuration", () => {
  for (const proxy of ["file:///etc/passwd", "http://user:password@localhost:1234", "http://localhost:1234/other", "http://localhost:1234/?option=value", "http://localhost:1234/#fragment"]) {
    assert.throws(() => referenceRegistryConfiguration([], { uplinkProxy: proxy }), /INVALID_REFERENCE_UPLINK_PROXY/);
  }
});
