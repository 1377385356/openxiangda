import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { developmentLifecycle, lifecycleAtCommit, verifyBusinessAcceptance } from '../src/development-lifecycle.js';
import { initializeAppSpec, inspectAppSpec } from '../src/app-spec.js';
import { writeDevelopmentFixture, writeVerificationFixture } from '../../../scripts/lib/development-records-fixture.mjs';

const contract = { appCode: 'booking-app', resourceCodes: [], actionCodes: [] };
function root() { return mkdtempSync(join(tmpdir(), 'oxa-lifecycle-')); }

test('空总纲和草稿不能正式发布；具体设计与计划允许首次测试部署，尚无需线上验收', () => {
  const directory = root();
  try {
    initializeAppSpec({ root: directory, appCode: contract.appCode, appName: '预约应用' });
    assert.equal(developmentLifecycle(directory, contract).readyForTest, false);
    writeDevelopmentFixture(directory, contract.appCode);
    const ready = developmentLifecycle(directory, contract);
    assert.equal(ready.readyForTest, true, JSON.stringify(ready.diagnostics));
    assert.deepEqual(ready.acceptanceIds, ['AC-APP-001']);
    const path = join(directory, 'appspec/changes/active/initial-delivery.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('status: implementing', 'status: draft'));
    assert.ok(developmentLifecycle(directory, contract).diagnostics.some(item => item.code === 'APPSPEC_CHANGE_NOT_READY'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('生产报告绑定原测试源码与包；不能借后续修改覆盖原计划、缺失场景或伪造空通过标记', () => {
  const directory = root();
  const git = (...args: string[]) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    writeDevelopmentFixture(directory, contract.appCode);
    git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    git('add', '.'); git('commit', '-m', 'AppSpec: initial-delivery');
    const commit = git('rev-parse', 'HEAD');
    const change = join(directory, 'appspec/changes/active/initial-delivery.md');
    writeFileSync(change, readFileSync(change, 'utf8').replaceAll('AC-APP-001', 'AC-APP-002'));
    const plan = lifecycleAtCommit(directory, commit, contract);
    assert.deepEqual(plan.acceptanceIds, ['AC-APP-001']);
    const run = { id: 'test-run-1', appCode: contract.appCode, packageDigest: 'a'.repeat(64), status: 'succeeded', environment: { kind: 'preproduction' } } as any;
    const report = writeVerificationFixture(directory, run);
    assert.equal(verifyBusinessAcceptance(directory, run, plan).ok, true);
    assert.equal(verifyBusinessAcceptance(directory, { ...run, packageDigest: 'b'.repeat(64) }, plan).ok, false);
    const path = join(directory, `appspec/verification/${run.id}.json`);
    writeFileSync(path, JSON.stringify({ ...report, scenarios: [{ id: 'AC-APP-001', status: 'passed' }] }));
    assert.equal(verifyBusinessAcceptance(directory, run, plan).ok, false);
    writeFileSync(path, JSON.stringify({ ...report, scenarios: report.scenarios.map(item => ({ ...item, id: 'AC-APP-002' })) }));
    assert.equal(verifyBusinessAcceptance(directory, run, plan).ok, false);
    writeFileSync(path, JSON.stringify({ ...report, performance: [{ ...report.performance[0], observedMs: 3000 }] }));
    assert.equal(verifyBusinessAcceptance(directory, run, plan).ok, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('历史独立分页，超过旧文件预算不挤占当前资料；稳定 ID 可读页外正文', () => {
  const directory = root();
  try {
    writeDevelopmentFixture(directory, contract.appCode);
    mkdirSync(join(directory, 'appspec/changes/history/2025'), { recursive: true });
    for (let index = 0; index < 140; index++) writeFileSync(join(directory, `appspec/changes/history/2025/history-${index}.md`), `---\nschema: openxiangda.appspec/change/v1\nid: history-${index}\ntitle: 历史变更\nstatus: archived\ncurrentSpec: merged\nrisk: L1\n---\n# 历史正文 ${index}\n\n${'历史原因。'.repeat(2000)}`);
    const first = inspectAppSpec(directory, contract);
    assert.equal(first.index.history.length, 50);
    assert.equal(first.historyPage.total, 140);
    assert.equal(first.historyPage.nextOffset, 50);
    assert.equal(first.index.activeChanges.length, 1);
    assert.ok(!first.diagnostics.some(item => item.severity === 'error'), JSON.stringify(first.diagnostics));
    const second = inspectAppSpec(directory, contract, undefined, 50);
    assert.equal(second.index.history.length, 50);
    assert.equal(first.workspaceDigest, second.workspaceDigest);
    const selected = inspectAppSpec(directory, contract, 'history-99');
    assert.match(selected.archivedChanges[0]?.content || '', /历史正文 99/);
    assert.ok(selected.contextBudget.contentBytes <= selected.contextBudget.maximumBytes);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('显式查询前一变更时生命周期不被最近提交的后阶段替换，发布默认关联保持不变', () => {
  const directory = root();
  try {
    writeDevelopmentFixture(directory, contract.appCode);
    const initial = readFileSync(join(directory, 'appspec/changes/active/initial-delivery.md'), 'utf8');
    writeFileSync(join(directory, 'appspec/changes/active/second-delivery.md'), initial.replaceAll('initial-delivery', 'second-delivery').replace('status: implementing', 'status: draft'));
    const message = '准备下一阶段\n\nAppSpec: second-delivery';
    assert.equal(developmentLifecycle(directory, contract, message).changeId, 'second-delivery');
    const selected = developmentLifecycle(directory, contract, message, 'initial-delivery');
    assert.equal(selected.changeId, 'initial-delivery');
    assert.equal(selected.nextCommand, 'openxiangda spec context initial-delivery --json');
    assert.equal(selected.context.selector, 'initial-delivery');
    assert.ok(!selected.diagnostics.some(item => item.code === 'APPSPEC_CHANGE_NOT_READY'));
    const missing = developmentLifecycle(directory, contract, message, 'missing-delivery');
    assert.equal(missing.changeId, null);
    assert.ok(missing.diagnostics.some(item => item.code === 'APPSPEC_DELIVERY_CHANGE_REQUIRED'));
    assert.equal(developmentLifecycle(directory, contract, message).changeId, 'second-delivery');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
