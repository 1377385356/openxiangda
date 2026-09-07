import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assertReleaseCiEntrypoints } from "../lib/release-ci-boundary.mjs";
const gitlabSource = 'verify_affected:\n  script:\n    - pnpm verify:affected\n';
const mirrorSource = 'steps:\n  - run: pnpm verify:affected\n';
test('Git hosting verifies source without controlling npm publication', () => {
  assert.doesNotThrow(() => assertReleaseCiEntrypoints({ gitlabSource, mirrorSource }));
  assert.doesNotThrow(() => assertReleaseCiEntrypoints({ gitlabSource: readFileSync(new URL('../../.gitlab-ci.yml', import.meta.url), 'utf8'), mirrorSource }));
});
test('neither host can silently reintroduce a publisher or npm credential', () => {
  for (const command of ['pnpm release:publish', 'pnpm verify:release', 'npm publish', 'pnpm changeset publish', 'node scripts/release-publish.mjs', 'NPM_TOKEN: secret']) {
    for (const key of ['gitlabSource', 'mirrorSource']) {
      const sources = { gitlabSource, mirrorSource };
      sources[key] += `  - ${command}\n`;
      assert.throws(() => assertReleaseCiEntrypoints(sources), /CI_REGISTRY_PUBLICATION_FORBIDDEN/);
    }
  }
});
test('both source verification entrypoints remain required', () => {
  for (const key of ['gitlabSource', 'mirrorSource']) {
    const sources = { gitlabSource, mirrorSource, [key]: '' };
    assert.throws(() => assertReleaseCiEntrypoints(sources), /CI_SOURCE_VERIFICATION_MISSING/);
  }
});
