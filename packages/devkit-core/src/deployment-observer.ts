import { setTimeout as delay } from 'node:timers/promises';
import { SCHEMA_VERSIONS, type DeploymentRun, type DevkitResult } from 'openxiangda-contracts';
import type { OpenXiangdaApplicationServices } from './application-services.js';
import { operationStage, updateOperationStage, withOperationProgress, type OperationProgressListener } from './operation-progress.js';

export interface DeploymentObservationOptions {
  root?: string;
  deploymentId?: string;
  onProgress?: OperationProgressListener;
  timeoutMs?: number;
  pollIntervalMs?: number;
}
const labels: Record<DeploymentRun['status'], string> = {
  queued: '平台部署排队', preparing: '平台准备配置与运行环境', deploying: '平台部署应用',
  activating: '平台切换应用版本', verifying: '平台检查运行健康',
  succeeded: '平台部署完成', failed: '平台部署失败', cancelled: '平台部署已取消',
};

/** 只观察原运行；观察失败绝不重新提交、取消或修改平台状态。 */
export async function observeDeployment(
  services: Pick<OpenXiangdaApplicationServices, 'deploymentStatus'>,
  initial: DevkitResult<unknown>,
  options: DeploymentObservationOptions = {}
): Promise<DevkitResult<unknown>> {
  if (!initial.ok || !isRun(initial.data)) return initial;
  let latest = initial as DevkitResult<DeploymentRun>;
  const started = Date.now();
  return operationStage('platform', '跟踪平台部署运行', async () => {
    let previous = '';
    for (;;) {
      const run = latest.data!;
      const fingerprint = `${run.status}:${run.stage}:${run.attempt}`;
      if (fingerprint !== previous) {
        updateOperationStage('platform', labels[run.status] || '跟踪平台部署运行', {
          deploymentId: run.id, status: run.status, serverStage: run.stage, attempt: run.attempt,
        });
        previous = fingerprint;
      }
      if (run.status === 'succeeded') return { ...latest, operation: initial.operation };
      if (run.status === 'failed' || run.status === 'cancelled') {
        const failure = run.latestFailure || run.failure || run.rootFailure;
        return incomplete(failure?.code || 'DEPLOYMENT_CANCELLED', failure?.message || '部署运行已取消', failure?.retryable || false);
      }
      if (Date.now() - started >= (options.timeoutMs ?? 15 * 60_000)) {
        return incomplete('DEPLOYMENT_OBSERVATION_TIMEOUT', '观察达到时限；平台运行仍保留，请继续查询原部署 ID', true);
      }
      await delay(Math.min(options.pollIntervalMs ?? 3_000, Math.max(0, (options.timeoutMs ?? 15 * 60_000) - (Date.now() - started))));
      try {
        const result = await services.deploymentStatus(options.root, run.id);
        if (!result.ok || !isRun(result.data) || result.data.id !== run.id) {
          return incomplete('DEPLOYMENT_OBSERVATION_UNAVAILABLE', '本次未能读取原部署状态；请继续查询原部署 ID', true);
        }
        latest = result as DevkitResult<DeploymentRun>;
      } catch {
        return incomplete('DEPLOYMENT_OBSERVATION_UNAVAILABLE', '部署状态连接中断；平台运行可能仍在继续，请查询原部署 ID', true);
      }
    }
  });

  function incomplete(code: string, message: string, retryable: boolean): DevkitResult<DeploymentRun> {
    const command = `openxiangda status ${latest.data!.id} --watch`;
    const terminal = ['failed', 'cancelled'].includes(latest.data!.status);
    return {
      ...latest, ok: false, operation: initial.operation,
      diagnostics: [...(latest.diagnostics || []), {
        schemaVersion: SCHEMA_VERSIONS.diagnostic, code, severity: 'error', message, retryable,
        remediation: terminal ? '查看本次运行的日志与平台恢复建议后处理' : `运行 ${command}，不需要重新构建或提交`,
        details: { deploymentId: latest.data!.id, status: latest.data!.status, recovery: latest.data!.recovery },
      }],
      nextActions: terminal ? latest.nextActions : [{ code: 'status', label: '继续跟踪原部署运行', command }],
    };
  }
}

export function watchDeployment(services: Pick<OpenXiangdaApplicationServices, 'deploymentStatus'>, options: DeploymentObservationOptions = {}) {
  return withOperationProgress('status', options.onProgress, async () => observeDeployment(
    services, await services.deploymentStatus(options.root, options.deploymentId), options
  ));
}
function isRun(value: unknown): value is DeploymentRun {
  return Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && 'status' in value && typeof value.status === 'string');
}
