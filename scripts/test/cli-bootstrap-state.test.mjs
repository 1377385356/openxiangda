import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBootstrapReleaseCoupling,
  assertBootstrapVersionToken,
} from "../lib/cli-bootstrap-state.mjs";

test("rejects a physical CLI release without the coupled root release", () => {
  assert.throws(
    () =>
      assertBootstrapReleaseCoupling([
        '---\n"openxiangda-cli": patch\n---\n',
      ]),
    /CLI_BOOTSTRAP_ROOT_CHANGESET_REQUIRED/
  );
  assert.doesNotThrow(() =>
    assertBootstrapReleaseCoupling([
      '---\n"openxiangda-cli": patch\n"openxiangda": patch\n---\n',
    ])
  );
});

test("requires the root-package version token in every source Skill", () => {
  const source = "pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ login";
  assert.equal(
    assertBootstrapVersionToken(source),
    source
  );
  assert.throws(
    () => assertBootstrapVersionToken("pnpm dlx openxiangda@latest login"),
    /ROOT_BOOTSTRAP_VERSION_TOKEN_MISSING/
  );
  assert.throws(
    () =>
      assertBootstrapVersionToken(
        "openxiangda@__OPENXIANGDA_VERSION__ openxiangda-cli@2.0.0-alpha.1"
      ),
    /ROOT_BOOTSTRAP_MOVING_OR_PHYSICAL_COORDINATE_FORBIDDEN/
  );
});
