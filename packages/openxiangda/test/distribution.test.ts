import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverWorkspace, resolveEngine, flagValue } from '../bin/distribution/workspace.js';
import { updatePlan } from '../bin/distribution/update.js';
import { assessMigration } from '../bin/distribution/migrate.js';
import { compareVersions, bundledRelease } from '../bin/distribution/releases.js';

test('V1 version results expose migration guidance without polluting JSON or advising V2 projects', t => {
  const f = fixture(t);
  const commands = pathToFileURL(join(import.meta.dirname, '../bin/distribution/commands.js')).href;
  for (const generation of ['v1', 'v2']) {
    const context = { manifest: { version: '2.10.0' }, workspace: { generation }, engine: { generation, version: generation === 'v1' ? '1.0.268' : '2.10.0' } };
    for (const json of [true, false]) {
      const args = ['version', ...(json ? ['--json'] : [])];
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {distributionCommand} from ${JSON.stringify(commands)}; await distributionCommand(${JSON.stringify(context)}, ${JSON.stringify(args)});`], { cwd: f.root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      const data = json ? payload.data : payload;
      assert.equal(Boolean(data.migrationAdvice), generation === 'v1');
      if (generation === 'v1' && !json) assert.match(result.stderr, /建议评估升级到 OpenXiangda 2\.0/);
      else assert.equal(result.stderr, '');
    }
  }
});

function fixture(t: any) {
  const root = mkdtempSync(join(tmpdir(), 'oxa-distribution-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path: string, value: any = '') => {
    const file = join(root, path); mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const engine = (path: string, version: string) => {
    put(`${path}/package.json`, { name: 'openxiangda', version, bin: { openxiangda: 'bin/run.cjs' } });
    put(`${path}/bin/run.cjs`, "process.stdout.write(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),version:'v1',documentation:process.env.OPENXIANGDA_DOCUMENTATION_ROOT||null})); process.exitCode=7;");
    if (version.startsWith('2.')) {
      put(`${path}/node_modules/openxiangda-cli/package.json`, { name: 'openxiangda-cli', version: '2.0.0', exports: { './run': './run.cjs' } });
      put(`${path}/node_modules/openxiangda-cli/run.cjs`, "process.stdout.write(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),version:process.env.OPENXIANGDA_DISTRIBUTION_VERSION}));");
    }
  };
  engine('launcher', '2.0.0'); engine('launcher/node_modules/openxiangda-legacy', '1.0.267');
  return { root, put, engine, launcher: join(root, 'launcher') };
}

test('nearest workspace wins without executing configuration, mixed markers stop', t => {
  const f = fixture(t);
  f.put('outer/app-workspace.config.ts', 'throw new Error("MUST_NOT_EXECUTE")');
  f.put('outer/nested/openxiangda.config.ts', 'throw new Error("MUST_NOT_EXECUTE")');
  f.put('outer/nested/apps/web/placeholder');
  assert.equal(discoverWorkspace(join(f.root, 'outer/nested/apps/web')).generation, 'v2');
  assert.equal(discoverWorkspace(join(f.root, 'outer')).generation, 'v1');
  f.put('outer/nested/.openxiangda/state.json', { version: 1, profiles: {} });
  assert.throws(() => discoverWorkspace(join(f.root, 'outer/nested')), /WORKSPACE_GENERATION_CONFLICT/);
  assert.equal(discoverWorkspace(f.root), null);
});

test('local declared engines are authoritative; missing, wrong generation and wrong pins fail', t => {
  const f = fixture(t);
  f.put('old/app-workspace.config.ts');
  const workspace = discoverWorkspace(join(f.root, 'old'));
  assert.equal(resolveEngine(workspace, f.launcher).source, 'bundled-v1');
  f.put('old/package.json', { devDependencies: { openxiangda: '1.0.260' } });
  assert.throws(() => resolveEngine(workspace, f.launcher), /WORKSPACE_ENGINE_NOT_INSTALLED/);
  f.engine('old/node_modules/openxiangda', '1.0.260');
  assert.equal(resolveEngine(workspace, f.launcher).version, '1.0.260');
  f.engine('old/node_modules/openxiangda', '1.0.267');
  assert.throws(() => resolveEngine(workspace, f.launcher), /WORKSPACE_ENGINE_PIN_MISMATCH/);
  f.engine('old/node_modules/openxiangda', '2.0.0');
  assert.throws(() => resolveEngine(workspace, f.launcher), /WORKSPACE_ENGINE_GENERATION_MISMATCH/);
  assert.equal(resolveEngine(null, f.launcher).generation, 'v2');
});

test('workspace login selects missing or auth-only targets without inheriting a parent engine', t => {
  const f = fixture(t);
  f.put('old/app-workspace.config.ts');
  const target = join(f.root, 'old/new-app');
  assert.equal(discoverWorkspace(target, { allowMissing: true, exact: true }), null);
  const launcher = pathToFileURL(join(import.meta.dirname, '../bin/distribution/launcher.js')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {launch} from ${JSON.stringify(launcher)}; await launch(${JSON.stringify(f.launcher)}, ['login', '--cwd', ${JSON.stringify(target)}, '--base-url', 'https://example.test', '--json']);`], { cwd: f.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).version, '2.0.0');
  assert.deepEqual(JSON.parse(result.stdout).argv, ['login', '--cwd', target, '--base-url', 'https://example.test', '--json']);
  f.put('old/new-app/.openxiangda/session.json', 'INVALID_SECRET_DO_NOT_PARSE');
  assert.equal(discoverWorkspace(target).generation, 'v2');
  assert.equal(discoverWorkspace(target).root, realpathSync(target));
});

test('subdirectory V1 execution preserves arguments, exit code and login environment isolation', t => {
  const f = fixture(t);
  f.put('old/app-workspace.config.ts'); f.put('old/src/placeholder');
  const launcher = pathToFileURL(join(import.meta.dirname, '../bin/distribution/launcher.js')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {launch} from ${JSON.stringify(launcher)}; await launch(${JSON.stringify(f.launcher)}, ['check', '--json', '--cwd', ${JSON.stringify(join(f.root, 'old/src'))}]);`], { encoding: 'utf8', cwd: f.root, env: { ...process.env, OPENXIANGDA_DOCUMENTATION_ROOT: '/incorrect-v2-docs' } });
  assert.equal(result.status, 7);
  const data = JSON.parse(result.stdout);
  assert.equal(data.cwd, realpathSync(join(f.root, 'old'))); assert.deepEqual(data.argv, ['check', '--json']);
  assert.equal(data.documentation, null); assert.equal(data.version, 'v1');
});

test('pnpm-linked workspace resolves the CLI beside the physical selected package', t => {
  const f = fixture(t);
  f.put('app/openxiangda.config.ts');
  f.put('app/package.json', { devDependencies: { openxiangda: '2.0.0' } });
  f.put('app/node_modules/.pnpm/openxiangda@2.0.0/node_modules/openxiangda/package.json', {
    name: 'openxiangda', version: '2.0.0',
  });
  f.put('app/node_modules/.pnpm/openxiangda@2.0.0/node_modules/openxiangda-cli/package.json', {
    name: 'openxiangda-cli', version: '2.0.0', exports: { './run': './run.cjs' },
  });
  f.put('app/node_modules/.pnpm/openxiangda@2.0.0/node_modules/openxiangda-cli/run.cjs', '');
  symlinkSync('.pnpm/openxiangda@2.0.0/node_modules/openxiangda', join(f.root, 'app/node_modules/openxiangda'));
  const engine = resolveEngine(discoverWorkspace(join(f.root, 'app')), f.launcher);
  assert.equal(engine.source, 'workspace');
  assert.equal(engine.packageRoot, realpathSync(join(f.root, 'app/node_modules/openxiangda')));
  assert.equal(engine.entry, join(engine.packageRoot, '../openxiangda-cli/run.cjs'));
});

test('workspace and launcher updates stay in their intended generation and dependency scope', t => {
  const f = fixture(t); f.put('old/app-workspace.config.ts');
  f.put('old/package.json', { dependencies: { openxiangda: '1.0.267' } });
  const context = { manifest: { version: '2.0.0' }, engine: { version: '1.0.267' }, workspace: discoverWorkspace(join(f.root, 'old')) };
  const legacy = updatePlan(context, ['update', 'install'], { version: '1.0.268' });
  assert.equal(legacy.target, 'workspace'); assert.ok(!legacy.args.includes('--global'));
  assert.equal(legacy.channel, 'legacy-v1');
  assert.ok(legacy.args.includes('--save-prod')); assert.ok(legacy.args.includes('openxiangda@1.0.268'));
  assert.throws(() => updatePlan(context, ['update', 'install'], { version: '2.0.0' }), /GENERATION_MISMATCH/);
  const global = updatePlan(context, ['update', 'install', '--target=launcher'], { version: '2.0.1' });
  assert.equal(global.generation, 'v2'); assert.ok(global.args.includes('--global'));
  assert.equal(global.channel, 'stable-v2');
  f.put('old/pnpm-lock.yaml'); f.put('old/package-lock.json');
  assert.throws(() => updatePlan(context, ['update'], { version: '1.0.268' }), /PACKAGE_MANAGER_CONFLICT/);
});

test('V2 pnpm upgrade updates existing consumers across the workspace, without adding packages', t => {
  const f = fixture(t); f.put('app/openxiangda.config.ts'); f.put('app/pnpm-workspace.yaml', 'packages:\n  - apps/*\n');
  f.put('app/package.json', { packageManager: 'pnpm@10.15.1', devDependencies: { openxiangda: '2.0.0' } });
  const plan = updatePlan({ manifest: { version: '2.0.0' }, engine: { version: '2.0.0' }, workspace: discoverWorkspace(join(f.root, 'app')) }, ['update'], { version: '2.0.1' });
  assert.equal(plan.command, 'pnpm'); assert.ok(plan.args.includes('--recursive')); assert.ok(plan.args.includes('--include-workspace-root')); assert.ok(plan.args.includes('update')); assert.ok(!plan.args.includes('add'));
});

test('migration assessment inventories only source pointers, stays read-only and bounds incomplete scans', t => {
  const f = fixture(t); f.put('old/app-workspace.config.ts', 'export default {}');
  f.put('old/resources/orders.ts', 'const permissionGroup = "private-token";');
  f.put('old/workflows/approval.ts', 'JS_CODE'); f.put('old/.env', 'SECRET=do-not-read');
  f.put('old/.agents/skills/openxiangda/agents/openai.yaml', 'formUuid JS_CODE permissionCode');
  f.put('old/.codex/skills/references/pages.json', { approver: 'installed-skill' });
  symlinkSync(join(f.root, 'old/.env'), join(f.root, 'old/linked.json'));
  const before = readFileSync(join(f.root, 'old/app-workspace.config.ts'), 'utf8');
  const result = assessMigration({ workspace: discoverWorkspace(join(f.root, 'old')), engine: { version: '1.0.267' } }, ['migrate', 'assess', '--to', 'v2']);
  assert.equal(result.migrated, false); assert.equal(result.complete, false);
  assert.deepEqual(result.inventory.workflows, ['workflows/approval.ts']);
  assert.ok(!JSON.stringify(result).includes('private-token')); assert.ok(!JSON.stringify(result).includes('do-not-read'));
  assert.equal(readFileSync(join(f.root, 'old/app-workspace.config.ts'), 'utf8'), before);
});

test('version comparisons and offline release metadata handle alpha to stable without downgrade', t => {
  const f = fixture(t);
  assert.equal(compareVersions('2.0.0', '2.0.0-alpha.114'), 1);
  assert.equal(compareVersions('2.0.0-alpha.9', '2.0.0-alpha.114'), -1);
  assert.equal(compareVersions('1.0.268', '1.0.267'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
  assert.equal(bundledRelease(f.launcher, '2.0.0').available, false);
  assert.throws(() => flagValue(['--cwd'], '--cwd'), /ARGUMENT_REQUIRED/);
  assert.throws(() => flagValue(['--cwd=a', '--cwd=b'], '--cwd'), /ARGUMENT_INVALID/);
});

test('successful create keeps engine JSON and exit status when support installation is unavailable', t => {
  const f = fixture(t);
  const launcher = pathToFileURL(join(import.meta.dirname, '../bin/distribution/launcher.js')).href;
  const run = (extra: string[]) => spawnSync(process.execPath, ['--input-type=module', '-e', `import {launch} from ${JSON.stringify(launcher)}; await launch(${JSON.stringify(f.launcher)}, ['create','example','--json',...${JSON.stringify(extra)}]);`], {
    cwd: f.root, encoding: 'utf8', env: { ...process.env, PATH: '', XDG_CONFIG_HOME: join(f.root, 'config') },
  });
  const result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).argv, ['create', 'example', '--json']);
  assert.equal(JSON.parse(result.stderr).data.state, 'dws_unavailable');
  const skipped = run(['--skip-support']);
  assert.equal(skipped.status, 0);
  assert.deepEqual(JSON.parse(skipped.stdout).argv, ['create', 'example', '--json']);
  assert.equal(skipped.stderr, '');
});
