import assert from 'node:assert/strict';
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultSessionPath, workspaceSessionPath, saveSession, loadSession, OpenXiangdaDeveloperSession, authorizeDeveloperSession } from '../src/session.js';

test('workspace files isolate identities, beat environment and pin refresh/logout across cwd changes', async () => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-auth-')));
  const previous = process.cwd();
  const environment = { ...process.env };
  try {
    const home = join(temporary, 'home');
    const a = join(temporary, 'a');
    const b = join(temporary, 'b');
    const nested = join(a, 'nested');
    for (const root of [a, b, nested]) {
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, 'openxiangda.config.ts'), 'export default {}');
    }
    mkdirSync(join(home, '.config/openxiangda-v2'), { recursive: true });
    const global = join(home, '.config/openxiangda-v2/session.json');
    writeFileSync(global, '{"accessToken":"GLOBAL_SECRET"}');
    process.env.HOME = home;
    delete process.env.OPENXIANGDA_BASE_URL;
    delete process.env.OPENXIANGDA_TOKEN;
    process.chdir(a);
    assert.equal(await loadSession(), null);
    await saveSession({ baseUrl: 'https://a.example', accessToken: 'A', refreshToken: 'RA', accessTokenExpiresAt: 1 });
    await saveSession({ baseUrl: 'https://b.example', accessToken: 'B' }, workspaceSessionPath(b));
    const relativeRead = loadSession('.openxiangda/session.json');
    process.chdir(b);
    assert.equal((await relativeRead)?.accessToken, 'A');
    process.chdir(join(a, 'src'));
    assert.equal(defaultSessionPath(), workspaceSessionPath(a));
    process.env.OPENXIANGDA_TOKEN = 'ENV_SECRET';
    assert.equal((await loadSession())?.accessToken, 'A');
    const manager = await OpenXiangdaDeveloperSession.load({ fetch: async () => Response.json({ code: 200, data: { accessToken: 'A2', refreshToken: 'RA2', accessTokenExpiresAt: Date.now() + 600000 } }) });
    process.chdir(b);
    await manager!.getAccessToken();
    assert.equal((await loadSession(workspaceSessionPath(a)))?.accessToken, 'A2');
    assert.equal((await loadSession())?.accessToken, 'B');
    await manager!.logout();
    assert.equal(existsSync(workspaceSessionPath(a)), false);
    assert.equal((await loadSession())?.accessToken, 'B');
    delete process.env.OPENXIANGDA_TOKEN;
    process.chdir(join(nested, 'src'));
    assert.equal(defaultSessionPath(), workspaceSessionPath(nested));
    assert.equal(await loadSession(), null);
    assert.equal(readFileSync(global, 'utf8'), '{"accessToken":"GLOBAL_SECRET"}');
    assert.equal(statSync(workspaceSessionPath(b)).mode & 0o777, 0o600);
    assert.match(readFileSync(join(b, '.openxiangda/.gitignore'), 'utf8'), /\/session.json\.\*/);
    process.env.OPENXIANGDA_BASE_URL = 'https://env.example';
    process.env.OPENXIANGDA_TOKEN = 'ENV_SECRET';
    assert.equal((await loadSession())?.source, 'environment');
    mkdirSync(join(nested, '.openxiangda'));
    writeFileSync(workspaceSessionPath(nested), '{broken');
    await assert.rejects(loadSession(), /OPENXIANGDA_SESSION_INVALID|无法解析/);
    rmSync(workspaceSessionPath(nested));
    symlinkSync(workspaceSessionPath(b), workspaceSessionPath(nested));
    await assert.rejects(saveSession({ baseUrl: 'https://a.example', accessToken: 'X' }), /普通文件/);
    assert.equal((await loadSession(workspaceSessionPath(b)))?.accessToken, 'B');
  } finally {
    process.chdir(previous);
    process.env = environment;
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('login retains a pair rotated during identity validation at its original workspace', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workspace-auth-rotation-'));
  const sessionPath = workspaceSessionPath(root);
  try {
    const result = await authorizeDeveloperSession({ baseUrl: 'https://login.example', sessionPath, pollIntervalMs: 1,
      fetch: async input => {
        const path = new URL(String(input)).pathname;
        const data = path.endsWith('/cli-sessions')
          ? { sessionId: 'test', loginUrl: 'https://login.example/authorize', qrText: '', expireIn: 60, pollSecret: 'poll-secret' }
          : path.endsWith('/cli-sessions/test')
            ? { status: 'authorized', accessToken: 'old-access', refreshToken: 'old-refresh', accessTokenExpiresAt: 1 }
            : path.endsWith('/refresh')
              ? { accessToken: 'rotated-access', refreshToken: 'rotated-refresh', accessTokenExpiresAt: Date.now() + 600000 }
              : { user: { id: 'user' }, tenant: { id: 'tenant' }, isPlatformAdmin: false, manageableAppTypes: [] };
        return Response.json({ code: 200, data });
      },
    });
    assert.equal(result.session.path, sessionPath);
    assert.equal((await loadSession(sessionPath))?.refreshToken, 'rotated-refresh');
    assert.equal((await loadSession(sessionPath))?.accessToken, 'rotated-access');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
