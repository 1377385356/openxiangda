import type { RuntimeIdentity } from './platform-client';
export function hasRuntimeReadCapability(identity: Pick<RuntimeIdentity, 'isAppSuperAdmin' | 'capabilityCodes'>, perspective: { capabilityCodes: readonly string[] } | null, code: string): boolean {
  return identity.isAppSuperAdmin || (identity.capabilityCodes.includes(code) && (!perspective || perspective.capabilityCodes.includes(code)));
}
