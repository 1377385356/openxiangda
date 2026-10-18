/** Coordination only: no identity, credential or authorization comes from this value. */
export function platformSessionCoordination(scope?: string) {
  if (scope && !/^entry-[a-f0-9]{24}$/.test(scope)) throw new Error('OPENXIANGDA_RUNTIME_META_INVALID');
  const suffix = scope ? `:${scope}` : '';
  return {
    channel: `auth-session-v2${suffix}`,
    logout: `auth_session_v2:logout${suffix}`,
    organization: `auth_session_v2:organization${suffix}`,
  };
}
