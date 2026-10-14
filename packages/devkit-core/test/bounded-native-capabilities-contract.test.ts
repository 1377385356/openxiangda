import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration as esm } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, requiredPlatformCapabilities } from '../src/index.js';
const cjs = createRequire(import.meta.url)('openxiangda-contracts/native-compiler').compileNativeApplicationConfiguration;
const codes = ['directory.current-classes', 'data.transaction-time-values', 'data.record-set-assertions'];
function source(): any {
  return {
    app: { code: 'bounded-actions', name: '有界动作' },
    frontend: { root: 'apps/web' },
    data: { resources: [{ code: 'requests', name: '申请', fields: [
      { code: 'acceptedAt', label: '接受时刻', type: 'datetime' },
    ] }] },
    authz: { roles: [], capabilities: [{ code: 'app:bounded-actions:submit', kind: 'backend', name: '提交' }] },
    backend: { enabled: true, operations: [{
      code: 'request.submit', method: 'POST', path: '/api/submit', capability: 'app:bounded-actions:submit',
      requestSchema: { type: 'object' }, responseSchema: { type: 'object' },
      platformAccess: {
        dataCommands: { mode: 'recoverable-native' }, directoryClasses: { maxIds: 20 },
        transactionTime: { mode: 'database-accepted', recordSetAssertions: true },
      },
    }] },
  };
}
function compile(value = source()) {
  const app = defineOpenXiangdaApp(value), compiled = compileApplicationSources(app);
  return { app, compiled };
}
function input(app: any, compiled: any) {
  return {
    appCode: app.app.code, configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: sha256Digest(compiled.config.value),
    expectedContractDigest: sha256Digest(compiled.contracts.value),
  };
}
test('authoring preserves both declarations, both bundles and ESM/CJS capabilities', () => {
  const { app, compiled } = compile();
  const expected = source().backend.operations[0].platformAccess;
  assert.deepEqual(compiled.config.value.backend.operations[0]?.platformAccess, expected);
  assert.deepEqual(compiled.contracts.value.operations[0]?.platformAccess, expected);
  assert.match(compiled.contracts.typescript, /directoryClasses/);
  assert.match(compiled.contracts.typescript, /transactionTime/);
  const native = esm(input(app, compiled));
  assert.deepEqual(native.requiredPlatformCapabilities, cjs(input(app, compiled)).requiredPlatformCapabilities);
  assert.deepEqual(requiredPlatformCapabilities(app), native.requiredPlatformCapabilities);
  for (const code of codes) {
    assert.equal(native.requiredPlatformCapabilities.find(c => c.code === code)?.contractVersion, '1.0.0');
    assert.ok(compiled.config.value.runtime.protocolCapabilities.includes(code));
  }
  assert.ok(compiled.config.value.runtime.protocolCapabilities.includes('directory-v2'));
});
test('time-only and ordinary actions acquire no undeclared directory or assertions', () => {
  for (const hasTime of [true, false]) {
    const value = source();
    delete value.backend.operations[0].platformAccess.directoryClasses;
    delete value.backend.operations[0].platformAccess.transactionTime.recordSetAssertions;
    if (!hasTime) delete value.backend.operations[0].platformAccess;
    const { app, compiled } = compile(value), native = esm(input(app, compiled));
    assert.deepEqual(requiredPlatformCapabilities(app), native.requiredPlatformCapabilities);
    for (const code of codes) {
      const expected = hasTime && code === 'data.transaction-time-values';
      assert.equal(native.requiredPlatformCapabilities.some(c => c.code === code), expected);
      assert.equal(compiled.config.value.runtime.protocolCapabilities.includes(code), expected);
    }
    assert.equal(compiled.config.value.runtime.protocolCapabilities.includes('directory-v2'), false);
    if (hasTime) {
      assert.deepEqual(compiled.config.value.backend.operations[0]?.platformAccess?.transactionTime, { mode: 'database-accepted' });
      assert.deepEqual(compiled.contracts.value.operations[0]?.platformAccess?.transactionTime, { mode: 'database-accepted' });
    }
  }
});
for (const [field, invalids] of [
  ['directoryClasses', [null, {}, [], { maxIds: 0 }, { maxIds: 21 }, { maxIds: 1.5 }, { maxIds: '20' }, { maxIds: 20, scope: 'all' }]],
  ['transactionTime', [null, {}, [], { mode: 'client' }, { mode: 'database-accepted', recordSetAssertions: false },
    { mode: 'database-accepted', recordSetAssertions: 'true' }, { mode: 'database-accepted', clock: 'client' }]],
] as const) {
  for (const declaration of invalids) test(field + ' rejects ' + JSON.stringify(declaration), () => {
    const value = source();
    value.backend.operations[0].platformAccess[field] = declaration;
    assert.throws(() => defineOpenXiangdaApp(value));
    const { app, compiled } = compile();
    (compiled.config.value.backend.operations[0]!.platformAccess as any)[field] = declaration;
    (compiled.contracts.value.operations[0]!.platformAccess as any)[field] = declaration;
    assert.throws(() => esm(input(app, compiled)));
    assert.throws(() => cjs(input(app, compiled)));
  });
}
test('accepted time requires recoverable Native commands', () => {
  const value = source();
  delete value.backend.operations[0].platformAccess.dataCommands;
  assert.throws(() => defineOpenXiangdaApp(value));
  const { app, compiled } = compile();
  delete compiled.config.value.backend.operations[0]!.platformAccess!.dataCommands;
  delete compiled.contracts.value.operations[0]!.platformAccess!.dataCommands;
  assert.throws(() => esm(input(app, compiled)));
  assert.throws(() => cjs(input(app, compiled)));
});
test('capability omission in either bundle fails instead of silently changing authority', () => {
  for (const field of ['directoryClasses', 'transactionTime']) for (const target of ['config', 'contracts']) {
    const { app, compiled } = compile();
    const operations = target === 'config' ? compiled.config.value.backend.operations : compiled.contracts.value.operations;
    delete (operations[0]!.platformAccess as any)[field];
    assert.throws(() => esm(input(app, compiled)));
    assert.throws(() => cjs(input(app, compiled)));
  }
});
