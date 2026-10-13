import { createHash } from 'node:crypto';
import { canonicalJson } from 'openxiangda-contracts';

export interface DeploymentWorkflowException {
  instanceId: string;
  fromVersion: number;
  definitionVersionId: string;
  bindingVersionId: string;
  currentNodeId: string | null;
  reason: string;
}
export interface DeploymentWorkflowPreview {
  schemaVersion: 'openxiangda.deployment-workflow-preview/v1';
  deploymentId: string;
  appCode: string;
  environmentId: string;
  environmentKey: 'preproduction' | 'production';
  packageDigest: string;
  appVersionId: string;
  attempt: number;
  headRevision: number;
  activeAppVersionId: string;
  projectionDigest: string;
  prepareResultDigest: string;
  workflows: Array<{
    workflowCode: string;
    headRevision: number;
    definitionVersion: number;
    definitionDigest: string;
    bindingVersion: number;
    bindingDigest: string;
    counts: Record<string, number>;
    total: number;
    exceptions: DeploymentWorkflowException[];
    exceptionCount: number;
    exceptionSetDigest: string;
    truncated: boolean;
  }>;
  truncated: boolean;
  activationPermission: 'not-granted';
  previewDigest: string;
}

/** Validate the scoped readback; it is never an acknowledgement or permission to retry. */
export function parseDeploymentWorkflowPreview(value: unknown, appCode: string, deploymentId: string): DeploymentWorkflowPreview {
  const fail = (): never => { throw Object.assign(new Error('DEPLOYMENT_WORKFLOW_PREVIEW_INVALID'), { code: 'DEPLOYMENT_WORKFLOW_PREVIEW_INVALID' }); };
  const record = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
  const hash = (v: any) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const text = (v: any, max = 128) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const integer = (v: any, min = 0) => Number.isSafeInteger(v) && v >= min;
  if (!record(value) || JSON.stringify(value).length > 1048576 || value.schemaVersion !== 'openxiangda.deployment-workflow-preview/v1' ||
      value.deploymentId !== deploymentId || value.appCode !== appCode || !['preproduction', 'production'].includes(value.environmentKey) ||
      !['environmentId', 'appVersionId', 'activeAppVersionId'].every(key => text(value[key])) ||
      !['packageDigest', 'projectionDigest', 'prepareResultDigest', 'previewDigest'].every(key => hash(value[key])) ||
      !integer(value.attempt, 1) || !integer(value.headRevision, 1) || value.activationPermission !== 'not-granted' ||
      typeof value.truncated !== 'boolean' || !Array.isArray(value.workflows) || value.workflows.length > 32) fail();
  const preview = value as Record<string, any>;
  const codes = new Set<string>();
  for (const workflow of preview.workflows) {
    if (!record(workflow) || !text(workflow.workflowCode) || codes.has(workflow.workflowCode) ||
        !['headRevision', 'definitionVersion', 'bindingVersion'].every(key => integer(workflow[key], 1)) ||
        !['definitionDigest', 'bindingDigest', 'exceptionSetDigest'].every(key => hash(workflow[key])) ||
        !integer(workflow.total) || !integer(workflow.exceptionCount) || !record(workflow.counts) ||
        typeof workflow.truncated !== 'boolean' || !Array.isArray(workflow.exceptions) || workflow.exceptions.length > 200 ||
        workflow.exceptions.length !== Math.min(workflow.exceptionCount, 200) ||
        workflow.exceptionCount !== (workflow.counts.excepted || 0)) fail();
    codes.add(workflow.workflowCode);
    const allowed = ['eligible', 'migrated', 'deferred', 'excepted', 'held', 'failed', 'superseded', 'completed'];
    if (Object.entries(workflow.counts).some(([key, count]) => !allowed.includes(key) || !integer(count)) ||
        Object.values(workflow.counts).reduce((sum: number, count: any) => sum + count, 0) !== workflow.total ||
        workflow.exceptionCount > 200 && !workflow.truncated) fail();
    const ids = new Set<string>();
    for (const item of workflow.exceptions) {
      if (!record(item) || !['instanceId', 'definitionVersionId', 'bindingVersionId'].every(key => text(item[key])) ||
          !integer(item.fromVersion, 1) || !text(item.reason, 1024) || item.currentNodeId !== null && !text(item.currentNodeId) || ids.has(item.instanceId)) fail();
      ids.add(item.instanceId);
    }
  }
  if (preview.truncated !== preview.workflows.some((item: any) => item.truncated)) fail();
  const { previewDigest, ...body } = preview;
  if (createHash('sha256').update(canonicalJson(body)).digest('hex') !== previewDigest) fail();
  return value as DeploymentWorkflowPreview;
}
