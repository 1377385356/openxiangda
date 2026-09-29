import { ControlPlaneError } from './control-plane-client.js';

export interface DeploymentPrerequisites {
  schemaVersion: 'openxiangda.deployment-prerequisites/v1';
  appCode: string;
  backend: boolean;
  observedAt: string;
  ready: boolean;
  checks: Array<{ key: 'kernel' | 'source' | 'registry'; state: 'ready' | 'failed' | 'skipped'; code: string; remediation: string }>;
}

export function assertDeploymentPrerequisites(value: unknown, appCode: string, backend: boolean): asserts value is DeploymentPrerequisites {
  const result = value as DeploymentPrerequisites | null;
  if (!result || result.schemaVersion !== 'openxiangda.deployment-prerequisites/v1' || result.appCode !== appCode || result.backend !== backend ||
    typeof result.observedAt !== 'string' || !Number.isFinite(Date.parse(result.observedAt)) ||
    !Array.isArray(result.checks) || result.checks.length !== 3 ||
    new Set(result.checks.map(check => check?.key)).size !== 3 ||
    result.checks.some(check => !check || !['kernel', 'source', 'registry'].includes(check.key) || !['ready', 'failed', 'skipped'].includes(check.state) ||
      typeof check.code !== 'string' || !/^[A-Z_]{1,80}$/.test(check.code) || typeof check.remediation !== 'string' || check.remediation.length > 1000 ||
      (check.key === 'kernel' && check.state === 'skipped') || (check.key === 'registry' && backend && check.state === 'skipped')) ||
    result.ready !== result.checks.every(check => check.state !== 'failed')) {
    throw new ControlPlaneError(502, 'APPLICATION_PREREQUISITES_RESULT_INVALID', '平台前置条件诊断响应无效，未开始构建');
  }
  if (!result.ready) {
    const failures = result.checks.filter(check => check.state === 'failed');
    throw new ControlPlaneError(409, 'APPLICATION_PREREQUISITES_FAILED',
      `平台部署前置条件未满足：${failures.map(check => ({ kernel: '内核初始化', source: '源码托管', registry: '镜像仓库' })[check.key]).join('、')}。请平台管理员修复后重试，尚未开始构建。`,
      { checks: failures, observedAt: result.observedAt });
  }
}
