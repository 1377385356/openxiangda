import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import * as esm from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities } from '../src/index.js';
const cjs = createRequire(import.meta.url)('openxiangda-contracts/native-compiler') as typeof esm;

function configuration(count: number) {
  return defineOpenXiangdaApp({
    app: { code: 'role-capacity', name: 'Independent duties' },
    frontend: { root: 'apps/web' },
    data: { resources: [] },
    authz: { capabilities: [], roles: Array.from({ length: count }, (_, index) => ({
      code: `duty-${index}`, name: `Duty ${index}`, capabilities: [],
    })) },
  });
}
function compiled(count: number) {
  const app = configuration(count);
  const source = compileApplicationSources(app);
  return { app, source, input: {
    appCode: app.app.code, configBytes: canonicalJson(source.config.value),
    contractBytes: canonicalJson(source.contracts.value),
    expectedConfigDigest: sha256Digest(source.config.value),
    expectedContractDigest: sha256Digest(source.contracts.value),
  } };
}
test('257 through 512 independent roles explicitly negotiate support in authoring and both Native formats', () => {
  for (const count of [256, 257, 512]) {
    const { app, input } = compiled(count);
    assert.equal(requiredPlatformCapabilities(app).some(item => item.code === 'application.extended-role-capacity'), count > 256);
    const projections = [esm, cjs].map(implementation => implementation.compileNativeApplicationConfiguration(input));
    assert.deepEqual(projections[0], projections[1]);
    assert.equal(projections[0]!.requiredPlatformCapabilities.find(item => item.code === 'application.extended-role-capacity')?.contractVersion,
      count > 256 ? '1.0.0' : undefined);
  }
});
test('513 roles and duplicate duties still fail before Native preparation', () => {
  const oversized = compiled(513);
  for (const implementation of [esm, cjs]) {
    assert.throws(() => implementation.compileNativeApplicationConfiguration(oversized.input),
      (error: any) => error.code === 'NATIVE_ARRAY_LIMIT_EXCEEDED' && error.pointer === '/config/authz/roles');
  }
  const { source, input } = compiled(512);
  source.config.value.authz.roles[511]!.code = source.config.value.authz.roles[0]!.code;
  const configDigest = sha256Digest(source.config.value);
  const contract = { ...source.contracts.value, configDigest };
  for (const implementation of [esm, cjs]) {
    assert.throws(() => implementation.compileNativeApplicationConfiguration({ ...input,
      configBytes: canonicalJson(source.config.value), expectedConfigDigest: configDigest,
      contractBytes: canonicalJson(contract), expectedContractDigest: sha256Digest(contract),
    }), /NATIVE_ROLE_DUPLICATE/);
  }
});
