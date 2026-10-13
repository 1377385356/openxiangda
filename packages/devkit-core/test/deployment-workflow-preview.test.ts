import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, OPENXIANGDA_CONTRACT_VERSION } from 'openxiangda-contracts';
import { OpenXiangdaControlPlaneClient } from '../src/control-plane-client.js';
import { parseDeploymentWorkflowPreview } from '../src/deployment-workflow-preview.js';
import { OpenXiangdaDeveloperSession, saveSession, workspaceSessionPath } from '../src/session.js';

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

test('a separate diagnostic client reads an old workspace session without loading its CLI, config, lock or seal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'frozen-workspace-preview-'));
  try {
    const files = { 'package.json': '{"dependencies":{"openxiangda":"2.68.0"}}', 'pnpm-lock.yaml': 'frozen-lock', 'openxiangda.config.ts': 'throw new Error("Configuration must not execute")' };
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(root, name), bytes);
    await saveSession({ baseUrl: 'https://example.invalid/service', accessToken: 'old-workspace-token', accessTokenExpiresAt: Date.now() + 600_000 }, workspaceSessionPath(root));
    const link = join(root, '.openxiangda/link.json');
    writeFileSync(link, JSON.stringify({ appCode: 'app', baseUrl: 'https://example.invalid/service' }));
    const sealPath = join(root, '.openxiangda/sealed-package.json');
    writeFileSync(sealPath, '{"originalRun":"unchanged"}');
    const sessionBefore = readFileSync(workspaceSessionPath(root), 'utf8');
    const binding = JSON.parse(readFileSync(link, 'utf8'));
    let identityReads = 0;
    const session = await OpenXiangdaDeveloperSession.load({ sessionPath: workspaceSessionPath(root), fetch: async (input, init) => {
      identityReads++; assert.ok(String(input).endsWith('/auth/whoami')); assert.equal(init?.method || 'GET', 'GET');
      return envelope({ user: { id: 'actor' }, tenant: { id: 'tenant' }, manageableAppTypes: ['app'], isPlatformAdmin: false });
    } });
    assert.ok(session); session.assertPlatform(binding.baseUrl);
    let calls = 0;
    const client = new OpenXiangdaControlPlaneClient({ baseUrl: session.baseUrl, tokenProvider: session, fetch: async (input, init) => {
      calls++; assert.equal(init?.method || 'GET', 'GET'); assert.equal(init?.body, undefined);
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer old-workspace-token');
      return envelope(String(input).endsWith('/capabilities') ? caps : receipt());
    } });
    assert.equal((await client.deploymentWorkflowPreview(binding.appCode, id)).deploymentId, id);
    assert.equal(calls, 2); assert.equal(identityReads, 1);
    for (const [name, bytes] of Object.entries(files)) assert.equal(readFileSync(join(root, name), 'utf8'), bytes);
    assert.equal(readFileSync(sealPath, 'utf8'), '{"originalRun":"unchanged"}');
    assert.equal(readFileSync(workspaceSessionPath(root), 'utf8'), sessionBefore);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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
