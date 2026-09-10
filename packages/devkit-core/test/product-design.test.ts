import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspectAppSpec } from '../src/app-spec.js';
import { developmentLifecycle, lifecycleAtCommit } from '../src/development-lifecycle.js';
import { writeDevelopmentFixture } from '../../../scripts/lib/development-records-fixture.mjs';
import { DESIGN_ASSET_LIMITS } from '../src/design-assets.js';

const contract = { appCode: 'booking-app', resourceCodes: [], actionCodes: [] };
const change = 'appspec/changes/active/initial-delivery.md';
const review = 'appspec/reviews/initial.md';
const page = 'appspec/experience/catalog.md';
function fixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'oxa-product-design-'));
  try { writeDevelopmentFixture(root, contract.appCode); run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function edit(root: string, file: string, update: (value: string) => string) {
  writeFileSync(join(root, file), update(readFileSync(join(root, file), 'utf8')));
}
function refreshTestDigest(root: string) {
  const digest = developmentLifecycle(root, contract).design.baselineDigest;
  edit(root, review, value => value.replace(/baselineDigest: .+/, `baselineDigest: ${digest}`));
}

function prototype(root: string) {
  const base = 'appspec/design/prototypes/request';
  mkdirSync(join(root, base), { recursive: true });
  writeFileSync(join(root, base, 'index.html'), '<main>可以操作的示例</main>');
  writeFileSync(join(root, base, 'tokens.css'), '.prototype { color: #153e35; }');
  writeFileSync(join(root, base, 'image.bin'), Buffer.from([0, 127, 128, 255]));
  edit(root, page, value => value.replace('status:', `assets: [${base}]\nstatus:`));
  refreshTestDigest(root);
  return base;
}

test('原型目录内 HTML、样式、二进制和新增依赖绑定评审及工作区摘要', () => fixture(root => {
  const base = prototype(root);
  const initial = developmentLifecycle(root, contract);
  assert.equal(initial.readyForImplementation, true, JSON.stringify(initial.diagnostics));
  const digest = inspectAppSpec(root, contract).workspaceDigest;
  for (const file of ['index.html', 'tokens.css', 'image.bin', 'new.css']) {
    writeFileSync(join(root, base, file), 'changed');
    const next = developmentLifecycle(root, contract);
    assert.ok(next.diagnostics.some(item => item.code === 'APPSPEC_DESIGN_BASELINE_STALE'), file);
    assert.notEqual(inspectAppSpec(root, contract).workspaceDigest, digest);
    refreshTestDigest(root);
  }
  rmSync(join(root, base, 'tokens.css'));
  assert.ok(developmentLifecycle(root, contract).diagnostics.some(item => item.code === 'APPSPEC_DESIGN_BASELINE_STALE'));
}));

test('缺失、越界、空目录、符号链接和超预算资源明确失败，不执行原型', () => fixture(root => {
  const base = prototype(root);
  const fail = () => assert.ok(developmentLifecycle(root, contract).diagnostics.some(item => item.code === 'APPSPEC_DESIGN_ASSET_UNAVAILABLE'));
  edit(root, page, value => value.replace(base, '../../outside'));
  fail();
  edit(root, page, value => value.replace('../../outside', `${base}/absent.css`));
  fail();
  edit(root, page, value => value.replace(`${base}/absent.css`, base));
  symlinkSync(join(root, 'appspec/app.md'), join(root, base, 'linked.md'));
  fail();
  rmSync(join(root, base, 'linked.md'));
  writeFileSync(join(root, base, 'huge.bin'), Buffer.alloc(DESIGN_ASSET_LIMITS.fileBytes + 1));
  fail();
  rmSync(join(root, base), { recursive: true });
  mkdirSync(join(root, base));
  fail();
}));

test('冻结提交保留原型二进制；当前修改不能冒充原测试设计，Git 链接失败', () => fixture(root => {
  const base = prototype(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'test@example.test'); git('config', 'user.name', 'Test');
  const unrelated = join(root, 'appspec/design/assets/unreferenced.bin');
  mkdirSync(join(root, 'appspec/design/assets'), { recursive: true });
  writeFileSync(unrelated, Buffer.alloc(DESIGN_ASSET_LIMITS.fileBytes + 1));
  git('add', '.'); git('commit', '-qm', 'Design\n\nAppSpec: initial-delivery');
  const commit = git('rev-parse', 'HEAD');
  const before = developmentLifecycle(root, contract).design.baselineDigest;
  assert.equal(lifecycleAtCommit(root, commit, contract).readyForTest, true);
  writeFileSync(join(root, base, 'image.bin'), Buffer.from([2, 250, 255]));
  assert.equal(lifecycleAtCommit(root, commit, contract).design.baselineDigest, before);
  assert.notEqual(developmentLifecycle(root, contract).design.baselineDigest, before);
  symlinkSync(join(root, 'appspec/app.md'), join(root, base, 'linked.md'));
  git('add', '.'); git('commit', '-qm', 'Invalid link\n\nAppSpec: initial-delivery');
  assert.throws(() => lifecycleAtCommit(root, git('rev-parse', 'HEAD'), contract), /APPSPEC_SOURCE_FILE_INVALID/);
}));

test('设计索引不倾倒全部正文；稳定 ID 和变更可以恢复设计引用闭包', () => fixture(root => {
  const index = inspectAppSpec(root, contract);
  assert.equal(index.index.designs.length, 7);
  assert.equal(index.designs.length, 0);
  const selected = inspectAppSpec(root, contract, 'initial-delivery');
  assert.equal(selected.designs.length, 7);
  assert.ok(selected.designs.some(item => item.id === 'DES-PAGE-CATALOG'));
  const single = inspectAppSpec(root, contract, 'DES-PAGE-CATALOG');
  assert.deepEqual(single.designs.map(item => item.id), ['DES-PAGE-CATALOG']);
  const digest = index.workspaceDigest;
  edit(root, page, value => value.replace('名称优先', '状态优先'));
  assert.notEqual(inspectAppSpec(root, contract).workspaceDigest, digest);
}));

test('完整受评设计可先就绪；缺实施计划时不能测试发布', () => fixture(root => {
  edit(root, change, value => value.replace(/## 任务与实现\n[\s\S]*?\n## 性能与容量预算/, '## 任务与实现\n\n## 性能与容量预算'));
  const lifecycle = developmentLifecycle(root, contract);
  assert.equal(lifecycle.readyForImplementation, true, JSON.stringify(lifecycle.diagnostics));
  assert.equal(lifecycle.readyForTest, false);
  assert.equal(lifecycle.stage, 'ready-for-implementation');
  edit(root, change, value => value.replace('- 无。', '- [ ] 跨部门管理员是否可以修改尚未得到答复'));
  assert.equal(developmentLifecycle(root, contract).readyForImplementation, false);
}));

test('未确认评审、未决设计与缺失页面状态不能通过；刷新摘要不是质量豁免', () => fixture(root => {
  edit(root, review, value => value.replace('status: confirmed', 'status: draft'));
  assert.ok(developmentLifecycle(root, contract).diagnostics.some(item => item.code === 'APPSPEC_DESIGN_CONFIRMATION_REQUIRED'));
  edit(root, review, value => value.replace('status: draft', 'status: confirmed'));
  edit(root, page, value => value.replace(/## 页面状态\n[\s\S]*?\n## 写入与恢复/, '## 页面状态\n<!-- 只有一张效果图 -->\n\n## 写入与恢复'));
  refreshTestDigest(root);
  let lifecycle = developmentLifecycle(root, contract);
  assert.equal(lifecycle.readyForImplementation, false);
  assert.ok(lifecycle.diagnostics.some(item => item.code === 'APPSPEC_DESIGN_SECTION_INCOMPLETE' && item.path?.includes('页面状态')));
  edit(root, page, value => value.replace('- 无。', '- [ ] 退回后允许修改哪些字段尚未决定'));
  refreshTestDigest(root);
  lifecycle = developmentLifecycle(root, contract);
  assert.ok(lifecycle.diagnostics.some(item => item.code === 'APPSPEC_DESIGN_BLOCKING_QUESTIONS'));
}));

test('只提供原型不满足完整首发；既有局部变更可以引用受影响页面', () => fixture(root => {
  edit(root, review, value => value.replace(/documents: \[.*\]/, 'documents: [DES-VISUAL]'));
  refreshTestDigest(root);
  assert.ok(developmentLifecycle(root, contract).diagnostics.some(item => item.code === 'APPSPEC_DESIGN_COVERAGE_INCOMPLETE'));
  edit(root, review, value => value.replace('scope: initial', 'scope: change').replace('documents: [DES-VISUAL]', 'documents: [DES-PAGE-CATALOG]'));
  refreshTestDigest(root);
  assert.equal(developmentLifecycle(root, contract).readyForImplementation, true);
  edit(root, 'appspec/design/architecture.md', value => `${value}\n不影响本次页面文案的架构研究。\n`);
  assert.equal(developmentLifecycle(root, contract).readyForImplementation, true);
}));

test('设计变化使原确认失效；任务与验收进展不改变受评设计摘要', () => fixture(root => {
  const first = developmentLifecycle(root, contract);
  assert.equal(first.readyForTest, true, JSON.stringify(first.diagnostics));
  edit(root, change, value => `${value}\n本轮任务已完成本地验证，尚未进行线上业务验收。\n`);
  const planned = developmentLifecycle(root, contract);
  assert.equal(planned.design.baselineDigest, first.design.baselineDigest);
  assert.equal(planned.readyForTest, true);
  edit(root, 'appspec/app.md', value => value.replace('成员只读', '成员可写'));
  assert.equal(developmentLifecycle(root, contract).readyForImplementation, false);
  edit(root, 'appspec/app.md', value => value.replace('成员可写', '成员只读'));
  edit(root, 'appspec/design/permissions.md', value => value.replace('成员只读列表详情', '成员可以编辑全部记录'));
  const changed = developmentLifecycle(root, contract);
  assert.equal(changed.readyForImplementation, false);
  assert.ok(changed.diagnostics.some(item => item.code === 'APPSPEC_DESIGN_BASELINE_STALE'));
}));

test('缺失引用、重复 ID、符号链接和超预算正文均有确定性诊断', () => fixture(root => {
  edit(root, page, value => value.replace('documents: []', 'documents: [DES-MISSING]'));
  assert.ok(inspectAppSpec(root, contract, 'initial-delivery').diagnostics.some(item => item.code === 'APPSPEC_DESIGN_REFERENCE_UNKNOWN'));
  edit(root, page, value => value.replace('documents: [DES-MISSING]', 'documents: []'));
  writeFileSync(join(root, 'appspec/experience/duplicate.md'), readFileSync(join(root, page)));
  assert.ok(inspectAppSpec(root, contract).diagnostics.some(item => item.code === 'APPSPEC_DOCUMENT_ID_DUPLICATED'));
  rmSync(join(root, 'appspec/experience/duplicate.md'));
  symlinkSync(join(root, page), join(root, 'appspec/experience/linked.md'));
  assert.ok(inspectAppSpec(root, contract).diagnostics.some(item => item.code === 'APPSPEC_SYMLINK_FORBIDDEN'));
  rmSync(join(root, 'appspec/experience/linked.md'));
  for (const file of [page, 'appspec/product/product.md']) edit(root, file, value => `${value}\n${'x'.repeat(140_000)}\n`);
  const context = inspectAppSpec(root, contract, 'initial-delivery');
  assert.equal(context.contextBudget.truncated, true);
  assert.ok(context.contextBudget.contentBytes <= context.contextBudget.maximumBytes);
  assert.equal(developmentLifecycle(root, contract).readyForImplementation, false);
}));

test('传递与循环引用有界恢复，未知类型失败且不执行原型附件', () => fixture(root => {
  edit(root, page, value => value.replace('documents: []', 'documents: [DES-PRODUCT]'));
  edit(root, 'appspec/product/product.md', value => value.replace('documents: []', 'documents: [DES-PAGE-CATALOG]'));
  assert.equal(inspectAppSpec(root, contract, 'DES-PAGE-CATALOG').designs.length, 2);
  mkdirSync(join(root, 'appspec/design/prototype'), { recursive: true });
  writeFileSync(join(root, 'appspec/design/prototype/index.html'), '<script>throw new Error("must not execute")</script>');
  refreshTestDigest(root);
  assert.equal(developmentLifecycle(root, contract).readyForImplementation, true);
  edit(root, page, value => value.replace('type: page', 'type: executable'));
  assert.ok(inspectAppSpec(root, contract).diagnostics.some(item => item.code === 'APPSPEC_DESIGN_TYPE_INVALID'));
}));

test('生产源版本读取设计原始字节；当前权限变更不能改写原基线', () => fixture(root => {
  edit(root, page, value => `${value}\n\n`);
  refreshTestDigest(root);
  const original = developmentLifecycle(root, contract);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Protocol Test'); git('config', 'user.email', 'test@example.invalid');
  git('add', '.'); git('commit', '-m', 'AppSpec: initial-delivery');
  const commit = git('rev-parse', 'HEAD');
  edit(root, 'appspec/design/permissions.md', value => value.replace('成员只读', '成员可写'));
  assert.equal(developmentLifecycle(root, contract).readyForImplementation, false);
  const source = lifecycleAtCommit(root, commit, contract);
  assert.equal(source.readyForTest, true, JSON.stringify(source.diagnostics));
  assert.equal(source.design.baselineDigest, original.design.baselineDigest);
  assert.equal(source.context.designs.find(item => item.id === 'DES-PAGE-CATALOG')?.content, original.context.designs.find(item => item.id === 'DES-PAGE-CATALOG')?.content);
}));
