import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;
const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
function input(config = JSON.parse(corpus.configuration.canonical)) {
  return {
    appCode: corpus.appCode,
    configBytes: canonicalJson(config), contractBytes: corpus.contract.canonical,
    expectedConfigDigest: sha256Digest(config), expectedContractDigest: corpus.contract.digest,
  };
}

test('one shared validator preserves the original platform golden projection across ESM and CJS', () => {
  const expected = 'cc1d97030a4d59489d8281eb607689d59e77844f9f1f3facfe3d097398da439e';
  const a = esm.compileNativeApplicationConfiguration(input());
  const b = cjs.compileNativeApplicationConfiguration(input());
  assert.deepEqual(a, b);
  assert.equal(a.aggregateDigest, expected);
  assert.equal(a.projections.data.value.resources.length, corpus.counts.resources);
  assert.equal(a.projections.events.value.producers.length, corpus.counts.eventProducers);
  assert.deepEqual(a.requiredPlatformCapabilities, corpus.requiredPlatformCapabilities);
  assert.match(esm.NATIVE_CONFIGURATION_VALIDATOR_DIGEST, /^[a-f0-9]{64}$/);
  assert.equal(esm.NATIVE_CONFIGURATION_VALIDATOR_DIGEST, cjs.NATIVE_CONFIGURATION_VALIDATOR_DIGEST);
});

test('both distributions preserve rejection codes and pointers without database or network setup', () => {
  const config = JSON.parse(corpus.configuration.canonical);
  const cases = [
    { ...input(), expectedConfigDigest: '0'.repeat(64) },
    { ...input(), configBytes: '{invalid' },
    input({ ...config, unexpected: true }),
    input({ ...config, data: { ...config.data, resources: [{ ...config.data.resources[0], unknownField: 'invalid' }] } }),
  ];
  for (const value of cases) {
    const errors = [esm, cjs].map(implementation => {
      try { implementation.compileNativeApplicationConfiguration(value); assert.fail('invalid input accepted'); }
      catch (error) {
        assert.ok(error instanceof implementation.NativeConfigurationCompilerError);
        assert.match(error.code, /^NATIVE_/); assert.ok(error.pointer.startsWith('/'));
        return { code: error.code, pointer: error.pointer, identifiers: error.identifiers };
      }
    });
    assert.deepEqual(errors[0], errors[1]);
  }
});
