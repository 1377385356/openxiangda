import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import {
  compileNativeEventCapturePlansV2 as compile, DATA_EVENT_TYPES_V2,
} from '../dist/native-compiler/index.js';

const resources = ['parents', 'children', 'copies'].map(code => ({
  code, schema: { fields: [{ code: 'name', type: 'text.short' }] },
}));
const base = { resources, dataPolicies: [], subscriptions: [] };
const policies = resources.map(resource => ({ resourceCode: resource.code, mode: 'subscribed' }));

test('legacy all mode preserves the exact pre-policy plan and digest', () => {
  const expected = { resourceCode: 'parents', filterFields: [], projectionFields: [], authorizationFields: [], captureFields: [] };
  for (const capturePolicies of [undefined, [], [{ resourceCode: 'parents', mode: 'all' }]]) {
    assert.deepEqual(compile({ ...base, capturePolicies }).find(plan => plan.resourceCode === 'parents'),
      { ...expected, digest: sha256Digest(expected) });
  }
});

test('immutable declared event types select operations without live status or filter evaluation', () => {
  const input = { ...base, capturePolicies: policies, subscriptions: [{
    eventTypes: [DATA_EVENT_TYPES_V2[0]], status: 'disabled',
    filter: { resourceCodes: ['parents'], changedFields: { anyOf: ['name'] } },
    payload: { fields: ['name'] },
  }] };
  const plans = compile(input);
  assert.deepEqual(plans.find(plan => plan.resourceCode === 'parents')?.capturedEventTypes, [DATA_EVENT_TYPES_V2[0]]);
  assert.deepEqual(plans.find(plan => plan.resourceCode === 'children')?.capturedEventTypes, []);
  assert.deepEqual(plans.find(plan => plan.resourceCode === 'copies')?.capturedEventTypes, []);
  const broad = compile({ ...input, subscriptions: [{ eventTypes: [...DATA_EVENT_TYPES_V2], filter: {}, payload: {} }] });
  for (const plan of broad) assert.deepEqual(plan.capturedEventTypes, [...DATA_EVENT_TYPES_V2].sort());
  assert.notEqual(plans[0]?.digest, broad[0]?.digest);
  assert.equal(canonicalJson(compile(input)), canonicalJson(plans));
});

test('unknown resources, duplicate policies and modes fail closed', () => {
  for (const capturePolicies of [false, null, {}]) {
    assert.throws(() => compile({ ...base, capturePolicies: capturePolicies as any }));
  }
  for (const [capturePolicies, code] of [
    [[{ resourceCode: 'missing', mode: 'subscribed' }], 'NATIVE_EVENT_CAPTURE_RESOURCE_NOT_FOUND'],
    [[policies[0], policies[0]], 'NATIVE_EVENT_CAPTURE_POLICY_DUPLICATE'],
    [[{ resourceCode: 'parents', mode: 'none' }], 'NATIVE_EVENT_CAPTURE_MODE_INVALID'],
  ] as const) {
    assert.throws(() => compile({ ...base, capturePolicies: structuredClone(capturePolicies) as any }), (error: any) => error.code === code);
  }
});
