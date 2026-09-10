import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { discoverOpenDesign, verifyOpenDesign, desktopRuntime } from '../src/design-native.js';

const root = resolve(import.meta.dirname, '../../..');
const launcher = join(root, 'packages/openxiangda/bin/run.js');

function fixture(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'openxiangda native design '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = join(dir, 'native cli.mjs');
  writeFileSync(cli, `
const args = process.argv.slice(2);
if (args.includes('--open-design-cli-probe')) console.log('open-design-cli:mcp-install:v1');
else if (args[0] === 'wait') {
  process.on('SIGTERM', () => process.exit(23));
  console.log('ready'); setInterval(() => {}, 1000);
} else {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  console.log(JSON.stringify({ args, input }));
  process.stderr.write('native diagnostic\\n');
  process.exitCode = args[0] === 'fail' ? 17 : 0;
}
`);
  const env = { ...process.env, OPENXIANGDA_OPENDESIGN_CLI: cli, OD_BIN: '', OD_NODE_BIN: '' };
  return { dir, cli, env };
}

test('explicit OpenDesign entry is verified; system od and bad overrides never fall back', t => {
  const f = fixture(t);
  const installation = discoverOpenDesign({ env: f.env });
  assert.equal(installation.cli, realpathSync(f.cli));
  verifyOpenDesign(installation, f.env);
  assert.throws(() => discoverOpenDesign({ env: {}, platform: 'linux' }), /OPENDESIGN_NOT_INSTALLED/);
  assert.throws(() => discoverOpenDesign({ env: { OPENXIANGDA_OPENDESIGN_CLI: '/missing/od' } }), /OPENDESIGN_ENTRY_INVALID/);
  assert.throws(() => discoverOpenDesign({ env: { OD_BIN: 'od' } }), /OPENDESIGN_ENTRY_INVALID/);
  writeFileSync(f.cli, 'console.log("not OpenDesign")');
  assert.throws(() => verifyOpenDesign(installation, f.env), /OPENDESIGN_ENTRY_UNRECOGNIZED/);
});

test('unified launcher preserves arbitrary native flags, stdin, JSON and exit code', t => {
  const f = fixture(t);
  const args = ['fail', '--cwd', '/not-an-openxiangda-workspace', '--json', '--mcp-stdio', '--new-upstream-flag', 'a b;$(touch nope)'];
  const result = spawnSync(process.execPath, [launcher, 'design', 'cli', ...args], { cwd: f.dir, env: f.env, input: 'native stdin', encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 17, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { args, input: 'native stdin' });
  assert.equal(result.stderr, 'native diagnostic\n');
});

test('SIGTERM reaches the native process through both launchers', { timeout: 15000 }, async t => {
  const f = fixture(t);
  const child = spawn(process.execPath, [launcher, 'design', 'cli', 'wait'], { cwd: f.dir, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  const exit = once(child, 'exit');
  const ready = await once(child.stdout!, 'data');
  assert.match(String(ready[0]), /ready/);
  child.kill('SIGTERM');
  const [code, signal] = await exit;
  assert.equal(code, 23);
  assert.equal(signal, null);
});

test('desktop discovery uses the installed config and upstream status instead of a fixed port', async t => {
  const f = fixture(t);
  const app = join(f.dir, 'Open Design.app');
  const resources = join(app, 'Contents/Resources');
  const sidecar = join(resources, 'app/node_modules/@open-design/sidecar/dist');
  mkdirSync(sidecar, { recursive: true });
  const release = join(resources, 'app/node_modules/@open-design/release/dist');
  mkdirSync(release, { recursive: true });
  writeFileSync(join(release, 'index.mjs'), `export function releaseChannelFromNamespace(namespace) { return namespace === 'release-stable' ? 'stable' : null }`);
  writeFileSync(join(resources, 'app/cli.mjs'), '');
  writeFileSync(join(resources, 'app/package.json'), JSON.stringify({ name: 'open-design-packaged-app', version: '0.22.2' }));
  writeFileSync(join(resources, 'open-design-config.json'), JSON.stringify({ namespace: 'release-stable', appVersion: '0.22.2', daemonCliEntryRelative: 'app/cli.mjs' }));
  writeFileSync(join(sidecar, 'index.mjs'), `export async function getSidecarStatus(stamp) { if(stamp.namespace !== 'release-stable') throw new Error('bad namespace'); return {state:'running',url:'http://127.0.0.1:54321',pid:42} }`);
  const installation = discoverOpenDesign({ env: {}, desktopPaths: [app] });
  assert.equal(installation.version, '0.22.2');
  assert.deepEqual(await desktopRuntime(installation), { url: 'http://127.0.0.1:54321', pid: 42, mode: 'runtime' });
  writeFileSync(join(resources, 'open-design-config.json'), JSON.stringify({ namespace: 'release-stable', daemonCliEntryRelative: '../../../../../native cli.mjs' }));
  assert.throws(() => discoverOpenDesign({ env: {}, desktopPaths: [app] }), /OPENDESIGN_/);
});
