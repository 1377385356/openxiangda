import type { NativeScopeDimensionApplicability } from 'openxiangda-contracts/browser';

export function scopeAppliesToRole(
  applicability: NativeScopeDimensionApplicability,
  roleCode: string
): boolean {
  return Boolean(
    applicability.candidateFields?.some((field) => field.roleCode === roleCode) ||
    applicability.workflowBindings?.some((binding) => binding.roleCode === roleCode) ||
    applicability.rules.some((rule) =>
      !rule.unrestrictedRoleCodes.includes(roleCode) &&
      (rule.allRoles || rule.roleCodes.includes(roleCode))
    )
  );
}
