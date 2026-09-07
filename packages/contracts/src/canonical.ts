import { createHash } from 'node:crypto';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJsonAt(value: unknown, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`JSON number must be finite: ${path}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item, index) => canonicalJsonAt(item, `${path}[${index}]`))
      .join(',')}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort((left, right) => (left === right ? 0 : left < right ? -1 : 1))
      .map(
        key =>
          `${JSON.stringify(key)}:${canonicalJsonAt(
            value[key],
            `${path}.${key}`
          )}`
      );
    return `{${entries.join(',')}}`;
  }
  const type =
    value instanceof Date
      ? 'Date'
      : (value as { constructor?: { name?: string } })?.constructor?.name ||
        typeof value;
  throw new TypeError(`Value is not JSON serializable: ${path} (${type})`);
}

export function canonicalJson(value: unknown): string {
  return canonicalJsonAt(value, '$');
}

export function sha256Digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
