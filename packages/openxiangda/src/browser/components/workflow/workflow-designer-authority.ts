import { workflowManagementActions, NATIVE_WORKFLOW_MANAGEMENT_ACTIONS, type NativeWorkflowManagementAction } from 'openxiangda-contracts/browser';

/** UI projection only; every server operation independently checks current authority. */
export function workflowDesignerAllowedActions(value: unknown, nativeSuperAdmin: boolean): {
  actions: NativeWorkflowManagementAction[]; legacy: boolean;
} {
  const row = value && typeof value === 'object' ? value as Record<string, any> : {};
  if (!Object.hasOwn(row, 'authority')) return {
    actions: nativeSuperAdmin ? [...NATIVE_WORKFLOW_MANAGEMENT_ACTIONS] : ['definition.read'], legacy: true,
  };
  if (!['published','draft'].includes(row.view) || !row.authority || !Array.isArray(row.authority.actions))
    return { actions: [], legacy: false };
  const actions = workflowManagementActions(row.authority.actions);
  return { actions: row.view === 'published' ? actions.filter(action => action === 'definition.read' || action === 'handling.configure') : actions,legacy: false };
}

export function isWorkflowDesignerAuthorityLoss(error: unknown): boolean {
  const failure = error as { code?: string; status?: number };
  return failure?.status === 403 || ['WORKFLOW_DESIGNER_NOT_FOUND','WORKFLOW_DESIGNER_DELEGATED_CLIENT_REQUIRED'].includes(failure?.code || '');
}

/** A NOWAIT refusal is definite, not a lost response. Keep its key for an explicit retry. */
export function isWorkflowDesignerAuthorityBusy(error: unknown): boolean {
  const failure = error as { code?: string; status?: number };
  return failure?.status === 503 && ['WORKFLOW_DESIGNER_AUTHORITY_BUSY', 'OPENXIANGDA_ACTOR_AUTHORITY_BUSY'].includes(failure.code || '');
}
