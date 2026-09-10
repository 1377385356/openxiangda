import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration, compileNativeEventAction } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities } from '../src/index.js';

const action = {
  kind: 'native-data' as const, version: 1 as const,
  operations: [{ operation: 'create' as const, resourceCode: 'copies', data: {
    name: { source: 'event' as const, path: 'data.projection.name' },
    sourceId: { source: 'event' as const, path: 'data.recordId' },
  } }],
};
function fixture(execution: any = action) {
  return defineOpenXiangdaApp({
    app: { code: 'native-actions', name: 'Native actions' },
    modules: [{ code: 'records', models: [
      { code: 'items', name: 'Items', fields: [{ code: 'name', type: 'text.short', label: 'Name' }] },
      { code: 'copies', name: 'Copies', fields: [{ code: 'name', type: 'text.short', label: 'Name' }, { code: 'sourceId', type: 'uuid', label: 'Source' }] },
    ], crud: [] }],
    events: {
      capturePolicies: ['items', 'copies'].map(resourceCode => ({ resourceCode, mode: 'subscribed' as const })),
      subscriptions: [{ code: 'copy-item', eventTypes: ['openxiangda.data.record.created.v2'],
        filter: { resourceCodes: ['items'] }, execution }],
    },
  });
}

test('platform Native actions require no Nest backend and derive a pinned capture/execution contract', () => {
  const app = fixture();
  assert.equal(app.backend.enabled, false);
  const compiled = compileApplicationSources(app);
  const consumer = compiled.contracts.value.eventConsumers[0]!;
  assert.deepEqual(consumer.payload, { includeChanges: false, fields: ['name'] });
  assert.deepEqual(compiled.contracts.value.eventHandlerManifest.handlers, []);
  assert.equal(consumer.execution?.resourceDigests.copies, sha256Digest(compiled.config.value.data.resources.find(resource => resource.code === 'copies')));
  const platform = compileNativeApplicationConfiguration({ appCode: app.app.code,
    configBytes: canonicalJson(compiled.config.value), contractBytes: canonicalJson(compiled.contracts.value),
    expectedConfigDigest: compiled.config.digest, expectedContractDigest: compiled.contracts.digest });
  assert.deepEqual(platform.projections.events.value.consumers[0].execution, consumer.execution);
  const capture = platform.projections.events.value.capturePlans;
  assert.deepEqual(capture.find((item: any) => item.resourceCode === 'items').projectionFields, ['name']);
  assert.deepEqual(capture.find((item: any) => item.resourceCode === 'copies').capturedEventTypes, []);
  assert.deepEqual(requiredPlatformCapabilities(app), platform.requiredPlatformCapabilities);
  assert.ok(platform.requiredPlatformCapabilities.some(item => item.code === 'events.native-data-actions'));
});

test('invalid action authority, fields, paths and bounds are rejected', () => {
  const compiled = compileApplicationSources(fixture());
  const subscription = compiled.config.value.events.subscriptions[0]!;
  for (const change of [
    { kind: 'sql' }, { version: 2 }, { operations: [] }, { operations: Array(17).fill(action.operations[0]) },
    { operations: [{ ...action.operations[0], resourceCode: 'missing' }] },
    { operations: [{ ...action.operations[0], data: { missing: { source: 'literal', value: 1 } } }] },
    { operations: [{ ...action.operations[0], data: { name: { source: 'event', path: 'data.projection.secret' } } }] },
    { operations: [{ ...action.operations[0], data: { name: { source: 'event', path: '__proto__.name' } } }] },
    { operations: [{ operation: 'update', resourceCode: 'copies', data: {} }] },
    { operations: [{ ...action.operations[0], data: { name: { source: 'literal', value: 'a'.repeat(65537) } } }] },
  ]) assert.throws(() => compileNativeEventAction({ ...subscription, execution: { ...action, ...change } }, compiled.config.value.data.resources));
  assert.throws(() => compileNativeEventAction({ ...subscription, platformAccess: { notification: { mode: 'business-standard' } } }, compiled.config.value.data.resources));
  assert.throws(() => compileNativeEventAction({ ...subscription, filter: {} }, compiled.config.value.data.resources));
});

test('a legacy webhook retains its generated handler and does not gain an internal plan', () => {
  const compiled = compileApplicationSources(fixture(undefined));
  // Explicitly remove the optional declaration after building the native fixture.
  const app = fixture();
  delete app.events!.subscriptions[0]!.execution;
  app.backend.enabled = true;
  const legacy = compileApplicationSources(app);
  assert.equal(legacy.contracts.value.eventConsumers[0]!.execution, undefined);
  assert.equal(legacy.contracts.value.eventHandlerManifest.handlers.length, 1);
  assert.notEqual(legacy.contracts.digest, compiled.contracts.digest);
});
