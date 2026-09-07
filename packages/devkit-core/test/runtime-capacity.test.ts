import assert from 'node:assert/strict';
import test from 'node:test';
import { RUNTIME_CAPACITY_PREFLIGHT_SCHEMA, type RuntimeCapacityPreflight, type PlatformCapabilities } from 'openxiangda-contracts';
import { assertRuntimeCapacityPreflight } from '../src/deployment.js';
import { OpenXiangdaControlPlaneClient } from '../src/control-plane-client.js';

function result(): RuntimeCapacityPreflight {
  return {
    schemaVersion: RUNTIME_CAPACITY_PREFLIGHT_SCHEMA,
    observedAt: '2026-09-07T12:00:00Z', environmentKey: 'preproduction', environmentId: 'test-env',
    basis: 'new-candidate', existingRun: null, sufficient: true,
    capacity: { checked: true, namespace: 'test', additionalReplicas: 1, profile: 'light', required: { pods: '1' }, quotas: [{ name: 'runtime', available: { pods: '1' } }], shortages: [] },
  };
}

test('capacity evidence rejects mismatched environment and inconsistent availability', () => {
  assert.doesNotThrow(() => assertRuntimeCapacityPreflight(result(), 'test-env'));
  const invalid: RuntimeCapacityPreflight[] = [
    { ...result(), environmentId: 'other-env' },
    { ...result(), observedAt: 'invalid' },
    { ...result(), sufficient: false },
    { ...result(), capacity: null },
    { ...result(), capacity: { ...result().capacity!, checked: false } },
    { ...result(), capacity: { ...result().capacity!, shortages: [{ quota: 'runtime', resource: 'pods', required: '1', available: '0' }] } },
  ];
  for (const value of invalid) assert.throws(() => assertRuntimeCapacityPreflight(value, 'test-env'), { code: 'OPENXIANGDA_RUNTIME_CAPACITY_PREFLIGHT_RESULT_INVALID' });
  const shortage = result();
  shortage.sufficient = false;
  shortage.capacity!.shortages.push({ quota: 'runtime', resource: 'pods', required: '1', available: '0' });
  assert.doesNotThrow(() => assertRuntimeCapacityPreflight(shortage));
});

test('same-run recovery has no fabricated fresh-capacity guarantee', () => {
  const value: RuntimeCapacityPreflight = { ...result(), basis: 'existing-run', existingRun: { id: 'run-1', status: 'preparing' }, capacity: null, sufficient: null };
  assert.doesNotThrow(() => assertRuntimeCapacityPreflight(value));
  assert.throws(() => assertRuntimeCapacityPreflight({ ...value, sufficient: true }));
  assert.throws(() => assertRuntimeCapacityPreflight({ ...value, existingRun: null }));
});

test('missing capacity capability fails before any HTTP write', async () => {
  let calls = 0;
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://platform.example', fetch: async () => { calls++; throw new Error('unexpected request'); } });
  await assert.rejects(client.runtimeCapacityPreflight('demo', { deployment: {} } as PlatformCapabilities, { schemaVersion: RUNTIME_CAPACITY_PREFLIGHT_SCHEMA, environmentKey: 'preproduction', backend: null }), { code: 'OPENXIANGDA_RUNTIME_CAPACITY_PREFLIGHT_REQUIRED' });
  assert.equal(calls, 0);
});

test('maintenance plans require a matching explicit strategy and predecessor evidence', () => {
  const value: RuntimeCapacityPreflight = { ...result(), deploymentStrategy: 'maintenance-replace', maintenance: { downtime: true, estimatedAfterStop: true, previousAppVersionId: 'old', previousDeploymentId: 'old-run', headRevision: 2 } };
  assert.doesNotThrow(() => assertRuntimeCapacityPreflight(value, 'test-env', 'maintenance-replace'));
  assert.throws(() => assertRuntimeCapacityPreflight(value));
  assert.throws(() => assertRuntimeCapacityPreflight({ ...value, maintenance: null }, undefined, 'maintenance-replace'));
  assert.throws(() => assertRuntimeCapacityPreflight(result(), undefined, 'maintenance-replace'));
});
