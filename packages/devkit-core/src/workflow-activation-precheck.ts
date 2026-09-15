import { SCHEMA_VERSIONS, type Diagnostic } from 'openxiangda-contracts';
import type {
  WorkflowManagementDefinitionEntry,
  WorkflowManagementDefinitionsPage,
} from './control-plane-client.js';

export interface WorkflowActivationDeclaration {
  workflowCode: string;
  definitionVersion: number;
  bindingVersion: number;
}

export interface WorkflowHeadReader {
  workflowManagementDefinitions(
    appCode: string,
    environmentKey: 'preproduction',
    limit: number,
    offset: number
  ): Promise<WorkflowManagementDefinitionsPage>;
}

/**
 * 源码激活声明与环境 Head 的只读对比。平台把 activations 当完整 desired set
 * 盲覆盖 workflow2_environment_heads，因此：
 * - 源码 definitionVersion 低于当前激活 Head → error：部署会静默回退环境激活版本。
 * - 环境已激活而源码 desired set 缺失该流程 → warning：本次部署将停用它。
 */
export function compareWorkflowActivationsWithHeads(
  activations: WorkflowActivationDeclaration[],
  heads: WorkflowManagementDefinitionEntry[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const headEntryByCode = new Map(
    heads.map(entry => [entry.workflowCode, entry])
  );
  const sourceCodes = new Set(activations.map(item => item.workflowCode));
  for (const activation of activations) {
    const head = headEntryByCode.get(activation.workflowCode)?.head;
    if (
      head &&
      head.status === 'active' &&
      Number(activation.definitionVersion) < Number(head.definitionVersion)
    ) {
      diagnostics.push({
        schemaVersion: SCHEMA_VERSIONS.diagnostic,
        code: 'DEPLOY_WORKFLOW_ACTIVATION_VERSION_REGRESSION',
        severity: 'error',
        message: `${activation.workflowCode} 源码激活 definitionVersion ${activation.definitionVersion} 低于当前环境 Head ${head.definitionVersion}，部署会静默回退已激活定义`,
        path: `workflows.activations.${activation.workflowCode}`,
        retryable: false,
        remediation:
          '把高版本 workflows.definitions/activations 合入当前源码（版本号与 digest 必须与已注册版本一致），或先经管理端显式降级 Head 后再部署',
        details: {
          workflowCode: activation.workflowCode,
          sourceDefinitionVersion: Number(activation.definitionVersion),
          headDefinitionVersion: Number(head.definitionVersion),
        },
      });
    }
  }
  for (const entry of heads) {
    const head = entry.head;
    if (head && head.status === 'active' && !sourceCodes.has(entry.workflowCode)) {
      diagnostics.push({
        schemaVersion: SCHEMA_VERSIONS.diagnostic,
        code: 'DEPLOY_WORKFLOW_ACTIVATION_ABSENT',
        severity: 'warning',
        message: `${entry.workflowCode} 当前环境已激活 v${head.definitionVersion}，但源码 activations 未声明；activations 是完整 desired set，本次部署会停用该流程`,
        path: `workflows.activations.${entry.workflowCode}`,
        retryable: false,
        remediation:
          '如非有意停用，请在 app-workspace.config.ts 的 workflows.activations 中补齐该流程',
        details: {
          workflowCode: entry.workflowCode,
          headDefinitionVersion: Number(head.definitionVersion),
        },
      });
    }
  }
  return diagnostics;
}

/** 平台 management/definitions 单页上限 100；按 total 翻页直至取全量 Head。 */
export async function fetchWorkflowManagementDefinitionHeads(
  client: WorkflowHeadReader,
  appCode: string,
  environmentKey: 'preproduction' = 'preproduction'
): Promise<WorkflowManagementDefinitionEntry[]> {
  const items: WorkflowManagementDefinitionEntry[] = [];
  const limit = 100;
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.workflowManagementDefinitions(
      appCode,
      environmentKey,
      limit,
      offset
    );
    const pageItems = result.items || [];
    items.push(...pageItems);
    offset += pageItems.length;
    if (!pageItems.length || offset >= Number(result.total || 0)) break;
  }
  return items;
}
