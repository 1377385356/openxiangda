/** The ordered roles own one union; membership and delegation remain runtime facts. */
export const WORKFLOW_ROLE_UNION_MAX_ROLES = 8;
export const workflowRoleCodesSchema = {
  type: 'array', minItems: 2, maxItems: WORKFLOW_ROLE_UNION_MAX_ROLES, uniqueItems: true,
  items: { type: 'string', maxLength: 128, pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$' },
} as const;

type Source = { provider?: string; roleCode?: string; roleCodes?: string[]; candidateField?: string; scope?: unknown };

/** Validate even unused entries so an invalid source cannot become a later task. */
export function validateWorkflowRoleUnion(entry: Source): string[] {
  if (entry.roleCodes === undefined) return [];
  const roles = entry.roleCodes;
  if (!['app_role', 'app_role_in_scope'].includes(entry.provider || '') || entry.roleCode !== undefined || entry.candidateField !== undefined ||
      !Array.isArray(roles) || roles.length < 2 || roles.length > WORKFLOW_ROLE_UNION_MAX_ROLES || new Set(roles).size !== roles.length ||
      roles.some(code => typeof code !== 'string' || code.length > 128 || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(code))) {
    return ['WORKFLOW_V2_BINDING_ROLE_UNION_INVALID'];
  }
  if (entry.provider === 'app_role_in_scope') {
    const scope = entry.scope as Record<string, unknown> | undefined;
    const literal = typeof scope?.value === 'string' && scope.value.length > 0 && scope.value.length <= 255 && scope.valueFrom === undefined;
    const path = typeof scope?.valueFrom === 'string' && scope.valueFrom.length <= 255 && /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/.test(scope.valueFrom) &&
      !scope.valueFrom.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part)) && scope.value === undefined;
    if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).some(key => !['dimension', 'value', 'valueFrom'].includes(key)) ||
        typeof scope.dimension !== 'string' || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(scope.dimension) || (!literal && !path)) {
      return ['WORKFLOW_V2_BINDING_ROLE_UNION_SCOPE_INVALID'];
    }
  } else if (entry.scope !== undefined) return ['WORKFLOW_V2_BINDING_ROLE_UNION_SCOPE_INVALID'];
  return [];
}

/** Call after validation; order also declares the primary duty for overlapping users. */
export function workflowBindingRoleCodes(entry: Pick<Source, 'roleCode' | 'roleCodes'>): string[] {
  return entry.roleCodes ? [...entry.roleCodes] : entry.roleCode ? [entry.roleCode] : [];
}

export function requiresWorkflowRoleUnion(bindings: Array<{ binding: { bindings: Record<string, Source> } }>): boolean {
  return bindings.some(item => Object.values(item.binding.bindings).some(entry => entry.roleCodes !== undefined));
}
