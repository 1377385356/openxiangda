export const AUTHORIZATION_TRANSITION_KEYS = [
  'fromAuthzDigest',
  'removeRoleCodes',
  'removeCapabilityCodes',
  'reason',
] as const;

export const AUTHORIZATION_TRANSITION_ROLE_CODE_PATTERN =
  /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
export const AUTHORIZATION_TRANSITION_CAPABILITY_CODE_PATTERN =
  /^[A-Za-z*][A-Za-z0-9:._*-]{0,254}$/;

export function exactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every(key => allowed.has(key));
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isExactStringArray(
  value: unknown,
  pattern: RegExp,
  maxItemLength: number,
  maxItems = 2000
) {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every(
      item =>
        typeof item === 'string' &&
        item.length <= maxItemLength &&
        pattern.test(item)
    ) &&
    new Set(value).size === value.length
  );
}
