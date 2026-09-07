import type { DeploymentStrategy } from 'openxiangda-contracts';
import { realpathSync } from 'node:fs';
import { discoverWorkspace } from './workspace-loader.js';
import { withWorkspaceOperation } from './workspace-operation.js';
import type { OpenXiangdaApplicationServices } from './application-services.js';
import type { DevkitResult } from 'openxiangda-contracts';
import { withOperationProgress, type OperationProgressListener } from './operation-progress.js';
import { observeDeployment } from './deployment-observer.js';

export const DEVELOPER_ENVIRONMENTS = ['test', 'production'] as const;
export type DeveloperEnvironment = (typeof DEVELOPER_ENVIRONMENTS)[number];

export function developerEnvironment(value: string = 'test') {
  if (value === 'test') return 'preproduction' as const;
  if (value === 'production') return 'production' as const;
  throw new Error(`DEVELOPER_ENVIRONMENT_INVALID: 环境必须为 test 或 production，收到 ${value}`);
}

export function checkApplication(
  services: OpenXiangdaApplicationServices,
  input: { root?: string; environment?: string; local?: boolean; onProgress?: OperationProgressListener } = {}
) {
  const environment = developerEnvironment(input.environment);
  if (input.local && input.environment === 'production') throw new Error('LOCAL_CHECK_TARGET_CONFLICT: 本地检查不验证生产环境，请分别执行');
  return withOperationProgress('check', input.onProgress, () => withWorkspaceOperation(realpathSync(discoverWorkspace(input.root).root), 'check', async () => {
    const result = await services.check(input.root, input.local ? undefined : environment);
    return { ...result, data: { ...result.data, validationScope: input.local ? 'local' : 'target', targetEnvironment: input.local ? null : environment } };
  }));
}

export interface DeveloperDeploymentInput {
  deploymentStrategy?: DeploymentStrategy;
  root?: string;
  environment?: string;
  from?: string;
  environmentId?: string;
  idempotencyKey?: string;
  dryRun?: boolean;
  wait?: boolean;
  onProgress?: OperationProgressListener;
}

export function deployApplication(
  services: OpenXiangdaApplicationServices,
  input: DeveloperDeploymentInput
): Promise<DevkitResult<unknown>> {
  validateDeploymentInput(input);
  return withOperationProgress(input.dryRun ? 'deployment.plan' : 'deploy', input.onProgress, async () => {
    const result = await executeDeployment(services, input);
    return input.dryRun || input.wait === false ? result : observeDeployment(services, result, input);
  });
}

function validateDeploymentInput(input: DeveloperDeploymentInput) {
  if (input.deploymentStrategy !== undefined && !['rolling', 'maintenance-replace'].includes(input.deploymentStrategy)) throw new Error('DEPLOYMENT_STRATEGY_INVALID');

  const environment = developerEnvironment(input.environment);
  if (environment === 'production') {
    if (!input.from) throw new Error('PRODUCTION_TEST_DEPLOYMENT_REQUIRED: 使用 from 指定成功测试运行，复用已验证版本');
    if (input.environmentId || input.idempotencyKey || input.deploymentStrategy) {
      throw new Error('PRODUCTION_DEPLOYMENT_OPTIONS_INVALID: 生产晋级由指定测试运行确定目标版本和幂等身份');
    }
  } else if (input.from) throw new Error('DEPLOY_TEST_FROM_INVALID: from 仅用于 production 晋级');
}

async function executeDeployment(services: OpenXiangdaApplicationServices, input: DeveloperDeploymentInput): Promise<DevkitResult<unknown>> {
  const environment = developerEnvironment(input.environment);
  if (environment === 'production') {
    return input.dryRun
      ? services.productionDeploymentPlan(input.root, input.from!)
      : services.deployProduction(input.root, input.from!);
  }
  return input.dryRun
    ? services.deploymentPlan({ ...(input.root ? { root: input.root } : {}), environment,
        ...(input.environmentId ? { environmentId: input.environmentId } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.deploymentStrategy ? { deploymentStrategy: input.deploymentStrategy } : {}),
      })
    : withWorkspaceOperation(realpathSync(discoverWorkspace(input.root).root), 'deploy', () => services.deploy({
        ...(input.root ? { root: input.root } : {}),
        environment,
        ...(input.environmentId ? { environmentId: input.environmentId } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.deploymentStrategy ? { deploymentStrategy: input.deploymentStrategy } : {}),
      }));
}
