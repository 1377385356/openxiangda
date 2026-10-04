import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import { canonicalDataBusinessIntent } from '../src/native-compiler/data-business-command.js';
import * as esm from '../dist/native-compiler/index.js';
const cjs = createRequire(import.meta.url)('../dist/native-compiler/index.cjs') as typeof esm;

test('intent sorts nested object keys, preserves array order and rejects lossy JSON', () => {
  const canonical = canonicalDataBusinessIntent({ z: [1, null, '中'], a: { b: 2, a: true } });
  assert.equal(canonical, '{"a":{"a":true,"b":2},"z":[1,null,"中"]}');
  assert.equal(canonical, canonicalDataBusinessIntent({ a: { a: true, b: 2 }, z: [1, null, '中'] }));
  assert.notEqual(canonical, canonicalDataBusinessIntent({ a: { a: true, b: 2 }, z: ['中', null, 1] }));
  const cycle: any = {}; cycle.self = cycle;
  for (const value of [undefined, null, [], { x: undefined }, { x: NaN }, { x: Infinity }, { x: 1n }, { x: new Date() }, { x: new Array(3) }, cycle]) {
    assert.throws(() => canonicalDataBusinessIntent(value), /INTENT_INVALID/);
  }
});

test('intent enforces independent bytes, nodes and nesting budgets', () => {
  assert.equal(canonicalDataBusinessIntent({ a: 'x'.repeat(65528) }).length, 65536);
  for (const value of [{ a: 'x'.repeat(65529) }, { a: '中'.repeat(22000) }, { a: Array(10000).fill(0) },
    Array.from({ length: 33 }).reduce<object>(x => ({ x }), {})]) {
    assert.throws(() => canonicalDataBusinessIntent(value), /INTENT_INVALID/);
  }
});

test('both compiler distributions require the capability only for an exact named-action declaration', () => {
  const corpus = JSON.parse(readFileSync(new URL('./fixtures/configuration-compatibility-corpus.json', import.meta.url), 'utf8'));
  const config = JSON.parse(corpus.configuration.canonical);
  const contract = JSON.parse(corpus.contract.canonical);
  function input() {
    contract.configDigest = sha256Digest(config);
    contract.operations[0].platformAccess = config.backend.operations[0].platformAccess;
    return { appCode: corpus.appCode, configBytes: canonicalJson(config), contractBytes: canonicalJson(contract),
      expectedConfigDigest: sha256Digest(config), expectedContractDigest: sha256Digest(contract) };
  }
  for (const compiler of [esm, cjs]) {
    assert.equal(compiler.compileNativeApplicationConfiguration(input()).requiredPlatformCapabilities.some(x => x.code === 'data.business-commands'), false);
  }
  config.backend.operations[0].platformAccess.dataCommands = { mode: 'recoverable-native' };
  for (const compiler of [esm, cjs]) {
    assert.equal(compiler.compileNativeApplicationConfiguration(input()).requiredPlatformCapabilities.find(x => x.code === 'data.business-commands')?.contractVersion, '1.0.0');
  }
  for (const declaration of [{}, { mode: 'retry' }, { mode: 'recoverable-native', actor: 'admin' }]) {
    config.backend.operations[0].platformAccess.dataCommands = declaration;
    for (const compiler of [esm, cjs]) assert.throws(() => compiler.compileNativeApplicationConfiguration(input()));
  }
});
