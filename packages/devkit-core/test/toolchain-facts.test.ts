import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installedToolchainFacts, preflightIssueOwner } from '../src/toolchain-facts.js';

test('reads actual root BOM, installation paths and exact-version integrity without loading package code', () => {
  const root = mkdtempSync(join(tmpdir(), 'oxa-bom-'));
  const names = ['openxiangda-cli', 'openxiangda-contracts', 'openxiangda-devkit-core', 'openxiangda-mcp', 'openxiangda-nest', 'openxiangda-skill-kit'];
  try {
    const write = (name: string, value: object) => {
      const path = join(root, 'node_modules', name); mkdirSync(path, { recursive: true }); writeFileSync(join(path, 'package.json'), JSON.stringify(value));
    };
    write('openxiangda', { name: 'openxiangda', version: '2.66.0', dependencies: Object.fromEntries(names.map(name => [name, '2.1.0'])) });
    for (const name of names) write(name, { name, version: name === 'openxiangda-contracts' ? '2.0.0' : '2.1.0' });
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'packages:\n  openxiangda-contracts@2.0.0:\n    resolution:\n      integrity: sha512-actual\n');
    const facts = installedToolchainFacts(root);
    assert.equal(facts.state, 'observed');
    assert.equal('complete' in facts && facts.complete, false);
    const contracts = facts.packages.find(pkg => pkg.name === 'openxiangda-contracts');
    assert.equal(contracts?.state, 'mismatch');
    assert.equal(contracts?.actual, '2.0.0');
    assert.equal(contracts?.integrity, 'sha512-actual');
    assert.match(contracts?.path || '', /node_modules\/openxiangda-contracts\/package.json/);
    assert.ok(facts.validatorDigest);
    rmSync(join(root, 'node_modules/openxiangda-nest'), { recursive: true });
    assert.equal(installedToolchainFacts(root).packages.find(pkg => pkg.name === 'openxiangda-nest')?.state, 'missing');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing SDK stays unavailable and owner projection keeps domain-specific remediation', () => {
  const root = mkdtempSync(join(tmpdir(), 'oxa-bom-missing-'));
  try { assert.equal(installedToolchainFacts(root).state, 'unavailable'); }
  finally { rmSync(root, { recursive: true, force: true }); }
  assert.equal(preflightIssueOwner({ pointer: '/backend/operations/managedFiles' }).owner, 'platform-files');
  assert.equal(preflightIssueOwner({ pointer: '/workflows/activations' }).owner, 'platform-workflow');
  assert.equal(preflightIssueOwner({ code: 'UNKNOWN' }).owner, 'configuration-compiler');
});
