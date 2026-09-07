import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bootstrapSupport, loadSupportChannel, runSupportProcess, selectSupportProfile, supportOperation, supportVersion } from '../bin/distribution/support.js';

const channel = { schemaVersion: 'openxiangda.support-channel/v1', id: 'test-channel', name: 'Test Support', corpId: 'test-corp', conversationId: 'cidTestOnly', inviteUrl: 'https://qr.dingtalk.com/action/joingroup?code=test%2Bonly&x=%2f', revision: 1 };
const profile = { profile: 'test-corp:test-user', corpId: 'test-corp', userId: 'test-user', isOrgCurrent: true };
function fixture(t: any) {
  const root = mkdtempSync(join(tmpdir(), 'oxa-support-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const stateFile = join(root, 'config/support.json'), skillsHome = join(root, 'skills');
  const calls: Array<{ command: string; args: string[] }> = [];
  const put = (file: string, value: unknown = '') => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  put(join(root, 'launcher-skill/openxiangda-support/SKILL.md'), 'Support guidance');
  const populate = () => { for (const file of ['dingtalk-shared/SKILL.md', 'dingtalk-misc/references/profile.md', 'dingtalk-chat/SKILL.md', 'dingtalk-event/SKILL.md']) put(join(skillsHome, file), 'Official test fixture'); };
  const behavior: any = { version: '1.0.61', profiles: [profile], group: { conversationId: channel.conversationId, users: [{ openDingtalkId: 'opaque-id' }], complete: true, failures: [] }, auth: { success: true, authenticated: true, token_valid: true, corp_id: channel.corpId, user_id: profile.userId }, setupStatus: 0, installStatus: 0, loginStatus: 0 };
  const run = async (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === 'npm' || command === 'npm.cmd') { if (!behavior.installStatus) behavior.version = '1.0.61'; return { status: behavior.installStatus, stdout: '' }; }
    if (command !== 'dws') throw Error('Unexpected external command');
    if (args[0] === '--version') return { status: behavior.version ? 0 : -1, stdout: behavior.version ? `dws version v${behavior.version} (fixture)` : '' };
    if (args[0] === 'skill') { if (!behavior.setupStatus) populate(); return { status: behavior.setupStatus, stdout: '' }; }
    if (args[0] === 'profile') return { status: 0, stdout: JSON.stringify({ success: true, profiles: behavior.profiles }) };
    if (args[0] === 'auth' && args[1] === 'login') return { status: behavior.loginStatus, stdout: '{}' };
    if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify(behavior.auth) };
    if (args[0] === 'chat') return { status: 0, stdout: JSON.stringify(behavior.group) };
    throw Error('Unexpected DWS command');
  };
  return { root, put, stateFile, skillsHome, calls, behavior, populate, deps: { stateFile, skillsHome, home: root, run, loadChannel: async () => channel } };
}

test('external channel contract preserves invitation bytes, bounds input and rejects executable schemes', async () => {
  assert.deepEqual(await loadSupportChannel(async () => new Response(JSON.stringify(channel))), channel);
  await assert.rejects(loadSupportChannel(async () => new Response('x'.repeat(16385))), /TOO_LARGE/);
  await assert.rejects(loadSupportChannel(async () => new Response(JSON.stringify({ ...channel, inviteUrl: 'javascript:alert(1)' }))), /INVITE_URL_INVALID/);
  await assert.rejects(loadSupportChannel(async () => new Response(JSON.stringify({ ...channel, revision: 0 }))), /CHANNEL_INVALID/);
  await assert.rejects(loadSupportChannel(async () => new Response('', { status: 503 })), /CHANNEL_UNAVAILABLE/);
});

test('stable version and profile selection reject prereleases, old DWS and ambiguous or wrong-organization identities', () => {
  assert.equal(supportVersion('dws version v1.0.61 (revision)'), '1.0.61');
  assert.equal(supportVersion('dws version v1.0.62 (revision)'), '1.0.62');
  assert.equal(supportVersion('dws version v1.0.61-alpha.1'), null);
  assert.equal(supportVersion('dws version v1.0.60'), null);
  assert.equal(selectSupportProfile([{ ...profile, isOrgCurrent: false }], channel.corpId), null);
  assert.equal(selectSupportProfile([profile, profile], channel.corpId), null);
  assert.throws(() => selectSupportProfile([profile], channel.corpId, 'other:user'), /ORGANIZATION_MISMATCH/);
  assert.equal(selectSupportProfile([profile], channel.corpId, profile.profile), profile);
});

test('bootstrap installs missing official stable DWS and complete multi bundle, persists only an identity pointer', async t => {
  const f = fixture(t); f.behavior.version = null;
  const result = await supportOperation(f.root, ['support', 'bootstrap'], f.deps);
  assert.equal(result.state, 'ready');
  assert.ok(f.calls.some(call => call.args.includes('dingtalk-workspace-cli@1.0.61')));
  assert.deepEqual(f.calls.find(call => call.args[0] === 'skill')?.args, ['skill', 'setup', '--mode', 'multi', '--target', 'all', '--yes']);
  assert.ok(existsSync(join(f.skillsHome, 'openxiangda-support/SKILL.md')));
  const saved = JSON.parse(readFileSync(f.stateFile, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['profile', 'schemaVersion', 'skillsTarget', 'skillsVersion']);
  assert.equal(saved.profile, profile.profile);
  for (const call of f.calls.filter(call => ['auth', 'chat'].includes(call.args[0]))) assert.equal(call.args[call.args.indexOf('--profile') + 1], profile.profile);
  assert.equal(f.calls.some(call => call.args.includes('login') || call.args.includes('use')), false);
  assert.equal(result.group.membership, 'not_independently_verified');
  assert.equal(existsSync(`${f.stateFile}.lock`), false);
  f.calls.length = 0;
  await supportOperation(f.root, ['support', 'bootstrap'], f.deps);
  assert.equal(f.calls.some(call => call.command.startsWith('npm') || call.args[0] === 'skill'), false);
});

test('saved exact profile takes precedence over organization default and auth mismatch cannot become ready', async t => {
  const f = fixture(t); f.populate();
  f.behavior.profiles = [{ ...profile, isOrgCurrent: false }, { ...profile, profile: 'test-corp:other', userId: 'other', isOrgCurrent: true }];
  f.put(f.stateFile, { profile: profile.profile });
  const result = await supportOperation(f.root, ['support', 'status'], f.deps);
  assert.equal(result.profile, profile.profile); assert.equal(result.state, 'ready');
  f.behavior.auth.user_id = 'other';
  assert.equal((await supportOperation(f.root, ['support', 'status'], f.deps)).code, 'SUPPORT_AUTH_IDENTITY_MISMATCH');
});

test('unavailable auth and multiple accounts return pending without default changes, login uses explicit organization', async t => {
  const f = fixture(t); f.behavior.profiles = [];
  assert.equal((await supportOperation(f.root, ['support', 'bootstrap'], f.deps)).state, 'profile_required');
  assert.equal(f.calls.some(call => call.args.includes('login')), false);
  await supportOperation(f.root, ['support', 'login', '--device'], f.deps);
  assert.deepEqual(f.calls.find(call => call.args[1] === 'login')?.args, ['auth', 'login', '--profile', channel.corpId, '--device', '--format', 'json']);
  f.behavior.profiles = [profile]; f.behavior.auth.authenticated = false;
  assert.equal((await supportOperation(f.root, ['support', 'status'], f.deps)).state, 'authorization_required');
});

test('opening an unavailable group preserves exact invitation and remains pending user action', async t => {
  const f = fixture(t); f.populate(); f.behavior.group = { error: { code: 'forbidden' } };
  let opened: string | undefined;
  const result = await supportOperation(f.root, ['support', 'join'], { ...f.deps, openUrl: async (url: string) => { opened = url; return true; } });
  assert.equal(opened, channel.inviteUrl); assert.equal(result.inviteUrl, channel.inviteUrl);
  assert.equal(result.state, 'pending_user_action'); assert.equal(result.group.access, 'unverified');
  assert.equal(f.calls.some(call => call.args.some(arg => /invite|add-member|send/.test(arg))), false);
});

test('partial member reads prove only access; failures and wrong conversations remain unverified', async t => {
  const f = fixture(t); f.populate(); f.behavior.group.complete = false;
  const partial = await supportOperation(f.root, ['support', 'status'], f.deps);
  assert.equal(partial.group.access, 'verified'); assert.equal(partial.group.complete, false);
  f.behavior.group.failures = [{ code: 'upstream_failed' }];
  assert.equal((await supportOperation(f.root, ['support', 'status'], f.deps)).state, 'group_unavailable');
  f.behavior.group = { conversationId: 'wrong', users: [{}] };
  assert.equal((await supportOperation(f.root, ['support', 'status'], f.deps)).state, 'group_unavailable');
});

test('installation, config and locking failures remain independently recoverable and dry runs perform no operations', async t => {
  const f = fixture(t); f.behavior.version = null; f.behavior.installStatus = 1;
  assert.equal((await bootstrapSupport(f.root, [], f.deps)).state, 'dws_unavailable');
  f.behavior.version = '1.0.61'; f.behavior.setupStatus = 1;
  assert.equal((await bootstrapSupport(f.root, [], f.deps)).state, 'setup_required');
  f.behavior.setupStatus = 0;
  assert.equal((await bootstrapSupport(f.root, [], { ...f.deps, loadChannel: async () => { throw Error('offline'); } })).state, 'channel_unavailable');
  mkdirSync(`${f.stateFile}.lock`);
  assert.equal((await bootstrapSupport(f.root, [], f.deps)).code, 'SUPPORT_BUSY');
  assert.equal(existsSync(`${f.stateFile}.lock`), true);
  f.calls.length = 0;
  assert.equal((await bootstrapSupport(f.root, ['--skip-support'], f.deps)).state, 'skipped');
  assert.equal((await supportOperation(f.root, ['support', 'bootstrap', '--dry-run'], f.deps)).state, 'planned');
  assert.equal(f.calls.length, 0);
});

test('support commands bypass project engine resolution and emit exactly one JSON result', t => {
  const f = fixture(t); f.put(join(f.root, 'package.json'), { name: 'openxiangda', version: '2.1.1' });
  f.put(join(f.root, 'openxiangda.config.ts'), 'must not be executed');
  const launcher = pathToFileURL(join(import.meta.dirname, '../bin/distribution/launcher.js')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {launch} from ${JSON.stringify(launcher)}; await launch(${JSON.stringify(f.root)}, ['support','bootstrap','--dry-run','--json']);`], { cwd: f.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).data.state, 'planned');
});

test('support subprocesses enforce a deadline and bounded output without invoking a shell', async () => {
  const stalled = await runSupportProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 30 });
  assert.notEqual(stalled.status, 0);
  const noisy = await runSupportProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(2 * 1024 * 1024)); setInterval(() => {}, 1000)'], { timeout: 1000 });
  assert.notEqual(noisy.status, 0);
  assert.ok(Buffer.byteLength(noisy.stdout) <= 1024 * 1024);
  const originalSource = process.env.DWS_SKILL_SOURCE;
  try {
    process.env.DWS_SKILL_SOURCE = '/untrusted/custom-bundle';
    const official = await runSupportProcess(process.execPath, ['-e', 'process.stdout.write(process.env.DWS_SKILL_SOURCE || "embedded")'], { officialSkills: true });
    assert.equal(official.stdout, 'embedded');
    assert.equal(process.env.DWS_SKILL_SOURCE, '/untrusted/custom-bundle');
  } finally {
    if (originalSource === undefined) delete process.env.DWS_SKILL_SOURCE;
    else process.env.DWS_SKILL_SOURCE = originalSource;
  }
});
