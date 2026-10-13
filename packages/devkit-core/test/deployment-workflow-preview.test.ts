import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, OPENXIANGDA_CONTRACT_VERSION } from 'openxiangda-contracts';
import { OpenXiangdaControlPlaneClient } from '../src/control-plane-client.js';
import { parseDeploymentWorkflowPreview } from '../src/deployment-workflow-preview.js';

const id = '11111111-1111-4111-8111-111111111111';
const digest = 'a'.repeat(64);
const seal = (body: any) => ({ ...body, previewDigest: createHash('sha256').update(canonicalJson(body)).digest('hex') });
const receipt = () => seal({ schemaVersion: 'openxiangda.deployment-workflow-preview/v1', deploymentId: id, appCode: 'app',
  environmentId: id, environmentKey: 'preproduction', packageDigest: digest, appVersionId: id,
  attempt: 1, headRevision: 280, activeAppVersionId: id, projectionDigest: digest, prepareResultDigest: digest,
  workflows: [{ workflowCode: 'review', headRevision: 11, definitionVersion: 12, definitionDigest: digest,
    bindingVersion: 12, bindingDigest: digest, total: 1, counts: { excepted: 1 }, exceptionCount: 1,
    exceptions: [{ instanceId: id, fromVersion: 11, definitionVersionId: id, bindingVersionId: id, currentNodeId: 'review', reason: 'schema changed' }],
    exceptionSetDigest: digest, truncated: false }], truncated: false, activationPermission: 'not-granted' });
const caps = { contractVersion: OPENXIANGDA_CONTRACT_VERSION, features: { 'deployment.workflow-adoption-preview': { status: 'available', contractVersion: '1.0.0' } } };
const envelope = (data: unknown) => new Response(JSON.stringify({ code: 200, data }), { headers: { 'Content-Type': 'application/json' } });

test('preview uses authenticated bounded GET for the explicit original run without retrying', async () => {
  const requests: string[] = [];
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://example.invalid/service', token: 'fixture', fetch: async (input, init) => {
    requests.push(String(input)); assert.equal(init?.method || 'GET', 'GET'); assert.equal(init?.body, undefined);
    assert.ok(init?.signal); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture');
    return envelope(String(input).endsWith('/capabilities') ? caps : receipt());
  } });
  assert.deepEqual(await client.deploymentWorkflowPreview('app', id), receipt());
  assert.equal(requests.length, 2); assert.ok(requests[1]!.endsWith(`/applications/app/deployments/${id}/workflow-adoption-preview`));
});
test('old platform and denied reads stop without any write or fallback', async () => {
  for (const unavailable of [true, false]) {
    let calls = 0;
    const client = new OpenXiangdaControlPlaneClient({ baseUrl: 'https://example.invalid', fetch: async input => {
      calls++;
      if (String(input).endsWith('/capabilities')) return envelope(unavailable ? { ...caps, features: {} } : caps);
      return new Response(JSON.stringify({ code: 403, message: 'denied' }), { status: 403 });
    } });
    await assert.rejects(client.deploymentWorkflowPreview('app', id)); assert.equal(calls, unavailable ? 1 : 2);
  }
});
test('wrong owner, altered digest, false permission and incomplete counts are rejected', () => {
  for (const alter of [
    (r: any) => { r.deploymentId = 'another'; },
    (r: any) => { r.appCode = 'another'; },
    (r: any) => { r.previewDigest = 'b'.repeat(64); },
    (r: any) => { r.activationPermission = 'granted'; },
    (r: any) => { r.workflows[0].exceptions = []; },
    (r: any) => { r.workflows[0].counts.excepted = 2; },
  ]) {
    const value = receipt(); alter(value);
    assert.throws(() => parseDeploymentWorkflowPreview(value, 'app', id), /PREVIEW_INVALID/);
  }
});
