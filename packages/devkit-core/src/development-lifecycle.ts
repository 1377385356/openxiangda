import { inspectDesignReadiness } from './design-readiness.js';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SCHEMA_VERSIONS, type DeploymentRun, type Diagnostic } from 'openxiangda-contracts';
import { inspectAppSpec, type AppSpecContractIndex, type AppSpecDocument } from './app-spec.js';

const APP_SECTIONS = ['业务目标', '角色', '架构与数据关系', '业务任务与页面', '权限矩阵与确认', '性能与容量预算'];
const CHANGE_SECTIONS = ['为什么', '需求依据', '方案与影响', '任务与实现', '验收', '性能与容量预算'];

function issue(code: string, message: string, path: string): Diagnostic {
  return { schemaVersion: SCHEMA_VERSIONS.diagnostic, severity: 'error', retryable: false, code, message, path, remediation: '依据实际业务补齐对应记录；运行 openxiangda spec context --json 查看阶段缺口，不能填写虚假确认或通过结果' };
}
function section(content: string, title: string) {
  const source = content.replace(/<!--[\s\S]*?-->/g, '');
  const start = source.indexOf(`\n## ${title}\n`);
  if (start < 0) return '';
  return source.slice(start + title.length + 5).split(/\n## /)[0] || '';
}
function meaningful(content: string) {
  return content.split('\n').map(line => line.replace(/^\s*[-*]\s*(?:\[[ x]\]\s*)?/, '').trim())
    .filter(line => line && !line.startsWith('|') && !line.startsWith('#') && !/^(待补充|待确认|TBD|TODO|无。?|一个可观察的正向结果|需要时补充拒绝、异常或权限反例)$/.test(line)).join('\n').length >= 8
    || content.split('\n').filter(line => line.trim().startsWith('|') && !/^[|\s:-]+$/.test(line)).length >= 2;
}
function boundedGit(root: string, args: string[], maxBuffer = 2 * 1024 * 1024) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10_000, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function headMessage(root: string) {
  try { return boundedGit(root, ['log', '-1', '--format=%B']); } catch { return ''; }
}

/** 按发布阶段评估事实完整性；不推断用户确认，也不将章节存在当作业务验收。 */
export function developmentLifecycle(root: string, contract: AppSpecContractIndex, message = headMessage(root), selector?: string) {
  const index = inspectAppSpec(root, contract);
  const explicit = message.match(/^AppSpec:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/m)?.[1];
  const changeId = selector || explicit || (index.index.activeChanges.length === 1 ? index.index.activeChanges[0]?.id : undefined);
  const context = changeId ? inspectAppSpec(root, contract, changeId) : index;
  const change = [...context.activeChanges, ...context.archivedChanges].find(item => item.id === changeId);
  const diagnostics = context.diagnostics.filter(item => item.severity === 'error');
  const app = context.application;
  if (!app) diagnostics.push(issue('APPSPEC_APPLICATION_REQUIRED', '正式发布需要应用总纲；运行 openxiangda spec init 后填写实际目标、权限、架构和容量', 'appspec/app.md'));
  else for (const title of APP_SECTIONS) {
    if (!meaningful(section(app.content, title))) diagnostics.push(issue('APPSPEC_APPLICATION_SECTION_INCOMPLETE', `应用总纲“${title}”尚无具体记录`, `${app.path}#${title}`));
  }
  const design = inspectDesignReadiness(context, change);
  diagnostics.push(...design.diagnostics);
  const designDiagnostics = [...diagnostics];
  if (!change) diagnostics.push(issue('APPSPEC_DELIVERY_CHANGE_REQUIRED', '需要关联本轮变更；有多个活动变更或引用历史记录时，在提交说明加入 AppSpec: <变更ID>', 'appspec/changes/active'));
  else {
    for (const title of CHANGE_SECTIONS) {
      if (!meaningful(section(change.content, title))) diagnostics.push(issue('APPSPEC_CHANGE_SECTION_INCOMPLETE', `变更“${title}”尚无具体记录`, `${change.path}#${title}`));
    }
    if (change.status === 'draft' || change.status === 'cancelled') diagnostics.push(issue('APPSPEC_CHANGE_NOT_READY', '变更仍是草稿或已取消；先澄清业务含义并记录实际依据，再进入 implementing', change.path));
  }
  for (const document of [app, change].filter((item): item is AppSpecDocument => !!item)) {
    if (/^\s*[-*] \[ \]/m.test(section(document.content, '未确认问题'))) {
      const blocking = issue('APPSPEC_BLOCKING_QUESTIONS', '仍有影响正式交付的未确认问题；非阻断假设单独记录，不冒充用户确认', `${document.path}#未确认问题`);
      diagnostics.push(blocking); designDiagnostics.push(blocking);
    }
  }
  const acceptanceIds = [...new Set([...(app?.acceptanceIds || []), ...(change?.acceptanceIds || []), ...context.capabilities.flatMap(item => item.acceptanceIds), ...context.designs.flatMap(item => item.acceptanceIds)])];
  if (change && !acceptanceIds.length) diagnostics.push(issue('APPSPEC_ACCEPTANCE_PLAN_REQUIRED', '至少定义一个 #### AC-* 可观察验收场景，供测试部署后逐项验证', `${change.path}#验收`));
  const readyForImplementation = design.readyForImplementation && !designDiagnostics.length;
  return {
    schemaVersion: 'openxiangda.development-lifecycle/v2' as const,
    stage: !readyForImplementation ? 'design-incomplete' as const : diagnostics.length ? 'ready-for-implementation' as const : 'ready-for-test' as const,
    readyForImplementation, design,
    readyForTest: !diagnostics.length, changeId: change?.id || null, acceptanceIds,
    currentSpecDigest: context.selectionDigest,
    diagnostics,
    nextCommand: changeId ? `openxiangda spec context ${changeId} --json` : 'openxiangda spec context --json',
    context,
  };
}

export function summarizeLifecycle(value: ReturnType<typeof developmentLifecycle>) {
  const { context, ...summary } = value;
  return summary;
}

/** 生产验收按测试版本中的需求计划核对，当前主线后来增加的规则不会冒充已测规则。 */
export function lifecycleAtCommit(root: string, commit: string, contract: AppSpecContractIndex) {
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('APPSPEC_SOURCE_COMMIT_INVALID');
  const scratch = mkdtempSync(join(tmpdir(), 'openxiangda-spec-source-'));
  try {
    const message = boundedGit(root, ['log', '-1', '--format=%B', commit]);
    const selected = message.match(/^AppSpec:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/m)?.[1];
    const paths = boundedGit(root, ['ls-tree', '-r', '--name-only', commit, '--', 'appspec']).split('\n').filter(path =>
      /^appspec\/(?:app\.md|capabilities\/[^/]+\.md|(?:decisions|product|experience|design|reviews)\/[^/]+\.md|changes\/active\/[^/]+\.md)$/.test(path)
      || (selected && new RegExp(`^appspec/changes/history/[^/]+/${selected}\\.md$`).test(path)));
    if (paths.length > 128) throw new Error('APPSPEC_SOURCE_FILE_LIMIT');
    let bytes = 0;
    for (const path of paths) {
      const content = execFileSync('git', ['-C', root, 'show', `${commit}:${path}`], { encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      bytes += Buffer.byteLength(content);
      if (bytes > 2 * 1024 * 1024) throw new Error('APPSPEC_SOURCE_SIZE_LIMIT');
      const target = join(scratch, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return developmentLifecycle(scratch, contract, message);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function verifyBusinessAcceptance(root: string, run: DeploymentRun, expected: { changeId: string | null; acceptanceIds: string[] }, pathInput?: string) {
  const defaultPath = `appspec/verification/${run.id}.json`;
  const path = resolve(root, pathInput || defaultPath);
  const local = relative(root, path).replaceAll('\\', '/');
  const diagnostics: Diagnostic[] = [];
  function evidenceExists(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return false;
    if (value.startsWith('https://')) { try { return !!new URL(value).hostname; } catch { return false; } }
    const path = resolve(root, value);
    const local = relative(root, path);
    if (!local || local.startsWith('..')) return false;
    try {
      let current = root;
      for (const name of local.split(/[\\/]/)) {
        current = join(current, name);
        if (lstatSync(current).isSymbolicLink()) return false;
      }
      return lstatSync(path).isFile();
    } catch { return false; }
  }
  try {
    if (!/^appspec\/verification\/[a-zA-Z0-9._-]+\.json$/.test(local)) throw new Error('验收报告应位于 appspec/verification/ 中');
    for (const part of ['appspec', 'appspec/verification', local]) {
      if (lstatSync(join(root, part)).isSymbolicLink()) throw new Error('验收报告路径不能使用符号链接');
    }
    if (!existsSync(path) || lstatSync(path).size > 1024 * 1024) throw new Error('验收报告缺失或超过 1 MiB');
    const report = JSON.parse(readFileSync(path, 'utf8'));
    if (report.schemaVersion !== 'openxiangda.business-verification/v1' || report.appCode !== run.appCode || report.sourceDeploymentId !== run.id || report.packageDigest !== run.packageDigest || !expected.changeId || report.changeId !== expected.changeId || run.status !== 'succeeded' || run.environment.kind !== 'preproduction') throw new Error('验收报告未绑定指定成功测试运行、包摘要与变更');
    if (!Number.isFinite(Date.parse(report.recordedAt)) || !Array.isArray(report.scenarios) || !report.scenarios.length || report.scenarios.length > 500 || !Array.isArray(report.performance) || report.performance.length > 100) throw new Error('报告需要记录时间、具体场景与性能测量数组');
    const seen = new Set<string>();
    for (const scenario of report.scenarios) {
      if (!/^AC-[A-Z0-9-]+$/.test(scenario.id) || seen.has(scenario.id) || scenario.status !== 'passed' || !meaningful(String(scenario.observation || '')) || !String(scenario.actor || '').trim() || !Array.isArray(scenario.evidence) || !scenario.evidence.some((value: unknown) => typeof value === 'string' && value.trim().length >= 4)) throw new Error('验收场景必须有唯一 AC ID、已通过结果、实际角色、观察与证据引用；失败或未测场景不能晋级');
      seen.add(scenario.id);
      if (!scenario.evidence.every(evidenceExists)) throw new Error('场景证据需要工作区内实际存在的文件或 HTTPS 引用');
    }
    if (expected.acceptanceIds.some(id => !seen.has(id))) throw new Error('测试版本计划中的验收场景尚未全部覆盖');
    const deferral = report.performanceDeferral;
    if (deferral !== undefined) {
      const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 4000 && !/^(TBD|TODO|待确认|待补充|无。?)$/i.test(value.trim());
      if (!deferral || deferral.status !== 'deferred'
        || !text(deferral.reason) || !meaningful(deferral.reason)
        || !text(deferral.followUp) || !meaningful(deferral.followUp)
        || !text(deferral.authorizedBy) || !text(deferral.authorizationSource)
        || typeof deferral.authorizedAt !== 'string' || !Number.isFinite(Date.parse(deferral.authorizedAt))
        || Date.parse(deferral.authorizedAt) > Date.parse(report.recordedAt)
        || !Array.isArray(deferral.evidence) || !deferral.evidence.length || deferral.evidence.length > 100
        || !deferral.evidence.every(evidenceExists)) throw new Error('性能延期需要 deferred 状态、具体原因与后续安排、真实授权人/时间/来源及有效证据；不得将延期写成通过');
    }
    if (!report.performance.length && !deferral) throw new Error('报告需要实际性能测量；用户明确延期时记录 performanceDeferral，不能用空数组冒充通过');
    let overBudget = 0;
    for (const measurement of report.performance) {
      if (!measurement || !meaningful(String(measurement.scenario || '')) || !meaningful(String(measurement.sample || '')) || typeof measurement.targetMs !== 'number' || !Number.isFinite(measurement.targetMs) || measurement.targetMs <= 0 || typeof measurement.observedMs !== 'number' || !Number.isFinite(measurement.observedMs) || measurement.observedMs < 0 || !Array.isArray(measurement.evidence) || !measurement.evidence.length) throw new Error('性能记录需要真实样本、目标毫秒数、实测毫秒数及证据；延期也不能省略或伪造已有测量');
      if (!measurement.evidence.every(evidenceExists)) throw new Error('性能证据需要工作区内实际存在的文件或 HTTPS 引用');
      if (measurement.observedMs > measurement.targetMs) overBudget++;
    }
    if (overBudget && !deferral) throw new Error('性能测量超出目标；先评估并修复，或记录用户实际授权的 performanceDeferral，不得改写原失败');
    const performance = { status: deferral ? 'deferred' as const : 'passed' as const, measurements: report.performance.length, overBudget, ...(deferral ? { deferral } : {}) };
    return { ok: true, path: local, sourceDeploymentId: run.id, packageDigest: run.packageDigest, scenarios: report.scenarios.length, performance, diagnostics };
  } catch (error) {
    diagnostics.push(issue('APPSPEC_BUSINESS_ACCEPTANCE_REQUIRED', `生产晋级前需要该测试版本的实际验收报告：${(error as Error).message}`, local));
    return { ok: false, path: local, sourceDeploymentId: run.id, packageDigest: run.packageDigest, scenarios: 0, diagnostics };
  }
}
