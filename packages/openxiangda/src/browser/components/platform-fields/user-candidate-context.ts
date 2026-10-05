import type { DataFieldSourceLaunchBinding, DataRecordEditInput, UserCandidatePage, UserCandidateSearch } from 'openxiangda-contracts/browser';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts/browser';
import { queryFieldUserCandidates, queryWorkflowTaskUserCandidates } from '../../platform-client';

export interface WorkflowCandidateBinding {
  taskId: string;
  expectedTaskVersion: number | undefined;
}

export type UserCandidateFieldContext =
  | { kind: 'native'; resourceCode: string; fieldCode: string; operation: 'create'; launch?: DataFieldSourceLaunchBinding; scopeValue?: string }
  | { kind: 'native'; resourceCode: string; fieldCode: string; operation: 'update'; recordId: string; expectedRevision: number; action?: DataRecordEditInput; launch?: DataFieldSourceLaunchBinding }
  | { kind: 'workflow-task'; taskId: string; fieldCode: string; expectedRevision: number; expectedTaskVersion: number };

const revision = (value: number | undefined): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export function userCandidateFieldContext(input: {
  resourceCode?: string; fieldCode: string; operation: 'create' | 'update';
  recordId?: string; expectedRevision?: number; workflowCandidateBinding?: WorkflowCandidateBinding;
  action?: DataRecordEditInput; launch?: DataFieldSourceLaunchBinding; requiresSavedScope?: boolean;
  prospectiveScope?: boolean; scopeValue?: unknown;
}): { context?: UserCandidateFieldContext; error?: string } {
  if (input.action && (input.operation !== 'update' || input.launch || input.workflowCandidateBinding ||
      input.action.recordId !== input.recordId || input.action.expectedRevision !== input.expectedRevision))
    return { error: '当前修改资料上下文已变化，请重新打开页面。' };
  const task = input.workflowCandidateBinding;
  if (task) {
    if (!task.taskId || !revision(task.expectedTaskVersion) || !revision(input.expectedRevision))
      return { error: '请刷新任务资料后再选择人员，当前输入已保留。' };
    return { context: { kind: 'workflow-task', taskId: task.taskId, fieldCode: input.fieldCode,
      expectedTaskVersion: task.expectedTaskVersion, expectedRevision: input.expectedRevision } };
  }
  if (!input.resourceCode) return { error: '当前字段缺少选人上下文，请重新打开页面。' };
  if (input.operation === 'create') {
    let scopeValue: string | undefined;
    if (input.requiresSavedScope) {
      if (!input.prospectiveScope || !input.launch) return { error: '请先保存资料，再选择人员。' };
      const raw = input.scopeValue && typeof input.scopeValue === 'object' && !Array.isArray(input.scopeValue)
        ? (input.scopeValue as { value?: unknown }).value : input.scopeValue;
      if (typeof raw !== 'string' || !raw || raw.trim() !== raw || raw.length > 255)
        return { error: '请先完成所属范围资料，再选择人员。' };
      scopeValue = raw;
    }
    return { context: { kind: 'native', operation: 'create', resourceCode: input.resourceCode,
      fieldCode: input.fieldCode, ...(input.launch ? { launch: input.launch } : {}), ...(scopeValue ? { scopeValue } : {}) } };
  }
  if (!input.recordId || !revision(input.expectedRevision)) return { error: '请刷新已保存的资料后再选择人员，当前输入已保留。' };
  return { context: { kind: 'native', operation: 'update', resourceCode: input.resourceCode,
    fieldCode: input.fieldCode, recordId: input.recordId, expectedRevision: input.expectedRevision,
    ...(input.action ? { action: input.action } : {}),
    ...(input.launch ? { launch: input.launch } : {}) } };
}

export function queryUserCandidateField(context: UserCandidateFieldContext, search: Omit<UserCandidateSearch, 'schemaVersion'>): Promise<UserCandidatePage> {
  const query: UserCandidateSearch = { schemaVersion: SCHEMA_VERSIONS.userCandidatesQuery,
    ...(search.keyword ? { keyword: search.keyword } : {}), ...(search.cursor ? { cursor: search.cursor } : {}),
    ...(search.selectedIds ? { selectedIds: search.selectedIds } : {}) };
  if (context.kind === 'workflow-task') return queryWorkflowTaskUserCandidates(context.taskId, context.fieldCode, {
    ...query, expectedRevision: context.expectedRevision, expectedTaskVersion: context.expectedTaskVersion,
  });
  return queryFieldUserCandidates(context.resourceCode, context.fieldCode, context.operation === 'create'
    ? { ...query, operation: 'create', ...(context.launch ? { launch: context.launch } : {}), ...(context.scopeValue ? { scopeValue: context.scopeValue } : {}) }
    : { ...query, operation: 'update', recordId: context.recordId, expectedRevision: context.expectedRevision,
        ...(context.action ? { action: context.action } : {}),
        ...(context.launch ? { launch: context.launch } : {}) });
}

export type CandidateSelection = { value: string; label: string; status?: 'valid' | 'invalid' };

/** Invalid names come only from the existing value, never another directory. */
export function reconcileUserCandidateSelection(selected: CandidateSelection[], inspected: UserCandidatePage['selected']): CandidateSelection[] {
  const byId = new Map(inspected.map(item => [item.value, item]));
  return selected.map(item => {
    const current = byId.get(item.value);
    return current ? { value: item.value, label: current.status === 'valid' ? current.label : item.label, status: current.status } : item;
  });
}

export function userCandidateError(error: unknown): string {
  const code = error && typeof error === 'object' ? String((error as { code?: string }).code || '') : '';
  if (/REVISION|TASK_VERSION|TASK_CONTEXT_CHANGED|HEAD_CHANGED|CURSOR|OWNER|TASK_NOT|NOT_ASSIGNED|CONFLICT/.test(code))
    return '资料或任务已更新，请关闭选择页并刷新资料。当前输入已保留。';
  if (/SAVED_SCOPE|SCOPE_VALUE_REQUIRED/.test(code)) return '请先保存完整的所属范围，再选择人员。';
  if (/FORBIDDEN|DENIED|UNAUTHORIZED/.test(code)) return '当前没有读取这些候选人的权限，请刷新页面或联系管理员。';
  return '候选人员读取失败，请重试。当前选择已保留。';
}
