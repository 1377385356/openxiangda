import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
test('strict release tasks keep explicit Linux install configuration while excluding unrelated environment', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'openxiangda-release-env-'));
  const keys = ['npm_config_registry', 'npm_config_store_dir', 'npm_config_cache_dir',
    'npm_config_prefer_offline', 'npm_config_network_concurrency', 'npm_config_fetch_retries',
    'npm_config_fetch_timeout', 'npm_config_fetch_retry_mintimeout', 'npm_config_fetch_retry_maxtimeout'];
  const values = ['https://registry.npmjs.org/', join(fixture, 'store'), join(fixture, 'metadata'),
    'true', '3', '2', '30000', '1000', '5000'];
  const configured = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  try {
    mkdirSync(join(fixture, 'consumer'));
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'release-environment-fixture', private: true, packageManager: 'pnpm@10.15.1' }));
    writeFileSync(join(fixture, 'pnpm-workspace.yaml'), 'packages:\n  - consumer\n');
    writeFileSync(join(fixture, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  consumer: {}\n");
    const releaseConfig = JSON.parse(readFileSync(join(root, 'turbo.json'), 'utf8'));
    writeFileSync(join(fixture, 'turbo.json'), JSON.stringify({ globalPassThroughEnv: releaseConfig.globalPassThroughEnv, tasks: { probe: { cache: false } } }));
    writeFileSync(join(fixture, 'consumer/package.json'), JSON.stringify({ name: 'consumer', private: true, scripts: { probe: 'node probe.mjs' } }));
    writeFileSync(join(fixture, 'consumer/probe.mjs'), `console.log('RELEASE_ENV_PROBE:' + JSON.stringify({ install: Object.fromEntries(${JSON.stringify(keys)}.map(key => [key, process.env[key] ?? null])), excluded: process.env.OPENXIANGDA_UNDECLARED_FIXTURE ?? null }));`);
    const result = spawnSync(join(root, 'node_modules/.bin/turbo'), ['run', 'probe', '--env-mode=strict'], {
      cwd: fixture, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, ...configured, OPENXIANGDA_UNDECLARED_FIXTURE: 'must-remain-excluded', TURBO_TELEMETRY_DISABLED: '1' },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const probe = result.stdout.split('\n').find(line => line.includes('RELEASE_ENV_PROBE:'));
    assert(probe, 'Real strict Turbo child must report its environment');
    const actual = JSON.parse(probe.slice(probe.indexOf('RELEASE_ENV_PROBE:') + 'RELEASE_ENV_PROBE:'.length));
    assert.deepEqual(actual.install, configured);
    assert.equal(actual.excluded, null);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
