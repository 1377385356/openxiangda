import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { developerAuthorizationStatus, saveSession } from '../src/session.js';

test('authorization status isolates sites, never rotates or writes, and distinguishes failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'oxa-auth-status-'));
  const sessionPath = join(directory, 'session.json');
  const prior = { base: process.env.OPENXIANGDA_BASE_URL, token: process.env.OPENXIANGDA_TOKEN };
  delete process.env.OPENXIANGDA_BASE_URL;
  delete process.env.OPENXIANGDA_TOKEN;
  try {
    let calls = 0;
    let mode = 'ok';
    const input = { baseUrl: 'https://target.example/platform', sessionPath, now: () => 1000,
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        calls++;
        assert.equal(String(url), 'https://target.example/service/openxiangda-api/v2/auth/whoami');
        assert.equal(init?.method, 'GET');
        assert.equal(init?.redirect, 'error');
        assert.ok(init?.signal);
        if (mode === 'network') throw new Error('access-secret refresh-secret');
        if (mode === 'http') return new Response('access-secret', { status: 401 });
        return Response.json(mode === 'envelope' ? { code: 401, message: 'refresh-secret' } :
          mode === 'malformed' ? { code: 200, data: null } :
          { code: 200, data: { user: { id: 'user', secret: 'access-secret' }, tenant: { id: 'tenant' } } });
      } };
    assert.equal((await developerAuthorizationStatus(input)).data.state, 'missing');
    await saveSession({ baseUrl: 'https://other.example', accessToken: 'access-secret' }, sessionPath);
    assert.equal((await developerAuthorizationStatus(input)).data.state, 'platform_mismatch');
    await saveSession({ baseUrl: input.baseUrl, accessToken: 'access-secret', refreshToken: 'refresh-secret', accessTokenExpiresAt: 500 }, sessionPath);
    assert.equal((await developerAuthorizationStatus(input)).data.state, 'refresh_required');
    assert.equal(calls, 0);
    await saveSession({ baseUrl: input.baseUrl, accessToken: 'access-secret', refreshToken: 'refresh-secret', accessTokenExpiresAt: 5000 }, sessionPath);
    const before = await readFile(sessionPath, 'utf8');
    for (const [value, expected] of [['ok', 'authorized'], ['http', 'unauthorized'], ['envelope', 'unauthorized'], ['network', 'unavailable'], ['malformed', 'unavailable']]) {
      mode = value!;
      const result = await developerAuthorizationStatus(input);
      assert.equal(result.data.state, expected);
      assert.doesNotMatch(JSON.stringify(result), /access-secret|refresh-secret/);
      assert.equal(await readFile(sessionPath, 'utf8'), before);
    }
    assert.equal(calls, 5);
  } finally {
    if (prior.base === undefined) delete process.env.OPENXIANGDA_BASE_URL;
    else process.env.OPENXIANGDA_BASE_URL = prior.base;
    if (prior.token === undefined) delete process.env.OPENXIANGDA_TOKEN;
    else process.env.OPENXIANGDA_TOKEN = prior.token;
    await rm(directory, { recursive: true, force: true });
  }
});
