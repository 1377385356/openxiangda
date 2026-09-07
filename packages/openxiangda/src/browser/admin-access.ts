import type { AppFrontendRouteAccess } from 'openxiangda-contracts/browser';

/**
 * Evaluate the compiler-owned application-wide admin boundary. Resource and
 * operation checks still run after this predicate succeeds.
 */
export function isAdminAccessAllowed(
  access: Readonly<AppFrontendRouteAccess> | undefined,
  hasCapability: (capability: string) => boolean,
) {
  if (!access) return true;
  const allOf = access.allOf || [];
  const anyOf = access.anyOf || [];
  return (
    allOf.every(hasCapability) &&
    (anyOf.length === 0 || anyOf.some(hasCapability))
  );
}
