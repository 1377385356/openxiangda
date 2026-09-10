import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration, compileRequiredPlatformCapabilitiesV3 } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities } from '../src/index.js';

test('explicit capture policy survives authoring, canonical configuration and platform compilation', () => {
  const app = defineOpenXiangdaApp({
    app: { code: 'capture-app', name: 'Capture example' },
    modules: [{ code: 'records', models: [{ code: 'items', name: 'Items', fields: [{ code: 'name', type: 'text.short', label: 'Name' }] }], crud: [] }],
    events: { subscriptions: [], capturePolicies: [{ resourceCode: 'items', mode: 'subscribed' }] },
  });
  const compiled = compileApplicationSources(app);
  assert.deepEqual(compiled.config.value.events.capturePolicies, [{ resourceCode: 'items', mode: 'subscribed' }]);
  assert.ok(compiled.config.value.runtime.protocolCapabilities.includes('events.capture-policy'));
  const platform = compileNativeApplicationConfiguration({
    appCode: app.app.code, configBytes: canonicalJson(compiled.config.value),
    contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: compiled.config.digest, expectedContractDigest: compiled.contracts.digest,
  });
  assert.deepEqual(platform.projections.events.value.capturePlans[0].capturedEventTypes, []);
  assert.deepEqual(requiredPlatformCapabilities(app), compileRequiredPlatformCapabilitiesV3(compiled.config.value));
  assert.equal(platform.requiredPlatformCapabilities.find(capability => capability.code === 'events.capture-policy')?.contractVersion, '1.0.0');
});
