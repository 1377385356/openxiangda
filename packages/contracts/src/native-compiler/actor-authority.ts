import type { DataTransactionActorAuthorityGuard, DataActorAuthorityRequirement } from '../types.js';

const rolePattern = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max && value.trim().length > 0 && value === value.trim();
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));

/** Shape only. This never grants authority or accepts an actor/capability from input. */
export function isDataTransactionActorAuthorityGuard(value: unknown): value is DataTransactionActorAuthorityGuard {
  if (!object(value) || !keys(value, ['kind', 'errorCode', 'anyOf'], ['allowAppSuperAdmin']) ||
    value.kind !== 'actor-authority' || !text(value.errorCode, 110) ||
    !/^OPENXIANGDA_[A-Z0-9_]{1,96}$/.test(value.errorCode) ||
    (Object.hasOwn(value, 'allowAppSuperAdmin') && typeof value.allowAppSuperAdmin !== 'boolean') ||
    !Array.isArray(value.anyOf) || value.anyOf.length < 1 || value.anyOf.length > 20) return false;
  const seen = new Set<string>();
  return value.anyOf.every(requirement => {
    if (!object(requirement) || !keys(requirement, ['roleCode'], ['scope']) ||
      !text(requirement.roleCode, 100) || !rolePattern.test(requirement.roleCode)) return false;
    if (Object.hasOwn(requirement, 'scope')) {
      const scope = requirement.scope;
      if (!object(scope) || !keys(scope, ['dimensionCode', 'value', 'operation']) ||
        !text(scope.dimensionCode, 100) || !rolePattern.test(scope.dimensionCode) ||
        !text(scope.value, 255) || !text(scope.operation, 64) || !/^[A-Za-z0-9*][A-Za-z0-9*._:-]*$/.test(scope.operation)) return false;
    }
    const scope = requirement.scope as DataActorAuthorityRequirement['scope'];
    const key = JSON.stringify([requirement.roleCode, scope?.dimensionCode, scope?.value, scope?.operation]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Apply only to a current, locked platform membership; facts stay platform-owned. */
export function matchesDataActorAuthorityMembership(
  requirement: DataActorAuthorityRequirement,
  membership: { roleCode: string; roleSource: string; capabilityCodes: readonly string[]; scopeGrantsJson: string },
  requiredCapability: string,
): boolean {
  if (membership.roleSource !== 'package' || membership.roleCode !== requirement.roleCode ||
    !requiredCapability || !membership.capabilityCodes.includes(requiredCapability)) return false;
  if (!requirement.scope) return true;
  let grants: unknown;
  try { grants = JSON.parse(membership.scopeGrantsJson); } catch { return false; }
  if (!Array.isArray(grants)) return false;
  const scope = requirement.scope;
  return grants.some(grant => object(grant) && grant.dimensionCode === scope.dimensionCode &&
    Array.isArray(grant.values) && grant.values.includes(scope.value) &&
    (grant.operations === undefined || grant.operations === null ||
      (Array.isArray(grant.operations) && (!grant.operations.length ||
        grant.operations.includes('*') || grant.operations.includes(scope.operation)))));
}
