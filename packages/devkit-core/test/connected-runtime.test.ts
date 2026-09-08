import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runConnectedDevelopment, type ConnectedDevelopmentOptions } from '../src/connected-development.js';

const target = { id: 'environment-test', key: 'preproduction' as const, activeAppVersionId: 'version-1', headRevision: 3 };
const activeHead = {
  activeAppVersionId: 'version-1', activatedByDeploymentId: 'deployment-1', revision: 3,
  revisions: { backend: null },
  activeAppVersion: { id: 'version-1', appCode: 'connected-app', version: '0.1.0-source123' },
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openxiangda-real-connected-'));
  const revoked: string[] = [];
  let created = 0;
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, scripts: { 'dev:web': 'node web.cjs' } }));
  writeFileSync(join(root, 'web.cjs'), `
const http = require('node:http');
if (JSON.stringify(process.env).includes('private-session-token')) process.exit(91);
const server = http.createServer((req, res) => {
  res.end('web ready');
  if (req.url === '/stop') res.on('finish', () => server.close(() => process.exit(0)));
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
server.listen(Number(process.env.OPENXIANGDA_WEB_PORT), '127.0.0.1');
`);
  const grant = {
    id: 'session-1', token: 'private-session-token', expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
    mode: 'manifest-overlay' as const, manifestOverlay: true, manifestDigest: 'a'.repeat(64), environment: target,
  };
  const options: ConnectedDevelopmentOptions = {
    root, appCode: 'connected-app', platformBaseUrl: 'http://127.0.0.1:9/service',
    environment: { id: target.id, environmentKey: target.key, status: 'active', activeHead } as any,
    developerSession: { getAccessToken: async () => 'developer-token' } as any,
    remoteSession: {
      create: async () => { created++; return grant; },
      current: async () => grant,
      refresh: async () => grant,
      revoke: async token => { revoked.push(token); },
    },
    noOpen: true, readinessTimeoutMs: 15_000,
  };
  return { root, options, grant, revoked, created: () => created, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('actual Nest boots against a frontend-only Head from a configured package without root dev:server', async () => {
  const f = fixture();
  try {
    const backendRoot = join(f.root, 'services/business');
    mkdirSync(backendRoot, { recursive: true });
    writeFileSync(join(backendRoot, 'package.json'), JSON.stringify({ private: true, scripts: { dev: 'node main.mjs' } }));
    const nestPackage = resolve(import.meta.dirname, '../../nest/package.json');
    const nestEntry = pathToFileURL(resolve(import.meta.dirname, '../../nest/dist/index.js')).href;
    writeFileSync(join(backendRoot, 'main.mjs'), `
import {createRequire} from 'node:module';
const require = createRequire(${JSON.stringify(nestPackage)});
require('reflect-metadata');
const {Module} = require('@nestjs/common');
const sdk = await import(${JSON.stringify(nestEntry)});
class TestModule {}
Module({imports: [sdk.OpenXiangdaModule.forApplication({})]})(TestModule);
await sdk.bootstrapOpenXiangdaApplication(TestModule);
`);
    const result = await runConnectedDevelopment({ ...f.options, backendRoot: 'services/business', onReady: async session => {
      assert.ok(session.urls.app);
      const ready = await (await fetch(`${session.urls.app}/__platform/ready`)).json() as any;
      assert.equal(ready.status, 'ready');
      assert.equal(ready.appVersionId, 'version-1');
      assert.equal(ready.backendRevisionId, 'connected-development:session-1');
      assert.equal(ready.environmentHeadRevision, 3);
      const version = await (await fetch(`${session.urls.app}/__platform/version`)).json() as any;
      assert.equal(version.version, '0.1.0-source123');
      // Exercise the same intentional shutdown handler as the real CLI.
      process.emit('SIGTERM');
    } });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(f.revoked, ['private-session-token']);
    assert.doesNotMatch(JSON.stringify(result), /private-session-token/);
  } finally { f.close(); }
});

test('frontend-only connected development starts no Nest and rejects application API routes', async () => {
  const f = fixture();
  try {
    const result = await runConnectedDevelopment({ ...f.options, onReady: async session => {
      assert.equal(session.urls.app, null);
      assert.equal(session.ports.app, null);
      for (const route of ['/api/probe', '/service/openxiangda-app-api/v2/connected-app/preproduction/api/probe']) {
        const response = await fetch(`${session.urls.proxy}${route}`);
        assert.equal(response.status, 404);
        assert.equal((await response.json() as any).code, 'OPENXIANGDA_CONNECTED_BACKEND_DISABLED');
      }
      await fetch(`${session.urls.web}/stop`);
    } });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(f.revoked, ['private-session-token']);
  } finally { f.close(); }
});

test('missing or mismatched active application descriptor fails before creating a Dev Session', async () => {
  const f = fixture();
  try {
    for (const head of [
      { ...activeHead, activeAppVersion: null },
      { ...activeHead, activeAppVersion: { ...activeHead.activeAppVersion, id: 'other-version' } },
      { ...activeHead, activeAppVersion: { ...activeHead.activeAppVersion, version: '' } },
    ]) {
      await assert.rejects(() => runConnectedDevelopment({ ...f.options, backendRoot: 'services/business',
        environment: { ...f.options.environment, activeHead: head as any } }), /CONNECTED_RUNTIME_DESCRIPTOR_REQUIRED/);
    }
    assert.equal(f.created(), 0);
  } finally { f.close(); }
});

test('a moved Head in the created grant revokes the original token before startup', async () => {
  const f = fixture();
  try {
    f.options.remoteSession.create = async () => ({ ...f.grant, environment: { ...target, headRevision: 4 } });
    await assert.rejects(() => runConnectedDevelopment(f.options), /CONNECTED_HEAD_CHANGED/);
    assert.deepEqual(f.revoked, ['private-session-token']);
  } finally { f.close(); }
});

test('a moved Head during refresh stops local processes and revokes the original session', async () => {
  const f = fixture();
  try {
    f.grant.expiresAt = new Date(Date.now() + 30_000).toISOString();
    f.options.remoteSession.refresh = async () => ({ ...f.grant, environment: { ...target, headRevision: 4 } });
    await assert.rejects(() => runConnectedDevelopment({ ...f.options, onReady: async session => {
      await fetch(`${session.urls.proxy}/service/probe`).catch(() => undefined);
    } }), /CONNECTED_HEAD_CHANGED/);
    assert.deepEqual(f.revoked, ['private-session-token']);
  } finally { f.close(); }
});

test('local backend selection cannot traverse a directory or symbolic link outside the workspace', async () => {
  const f = fixture();
  try {
    symlinkSync(tmpdir(), join(f.root, 'external'));
    for (const backendRoot of ['..', '.', 'external/backend']) {
      await assert.rejects(() => runConnectedDevelopment({ ...f.options, backendRoot }), /CONNECTED_BACKEND_PATH_INVALID/);
    }
    assert.equal(f.created(), 0);
  } finally { f.close(); }
});
