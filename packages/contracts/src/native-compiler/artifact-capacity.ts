import { canonicalJson } from '../canonical.js';

/** Shared by the ESM SDK compiler and the platform's CommonJS compiler. */
export const NATIVE_ARTIFACT_CAPACITY_V2 = Object.freeze({
  legacyConfigBytes: 4 * 1024 * 1024,
  configBytes: 8 * 1024 * 1024,
  contractBytes: 8 * 1024 * 1024,
  depth: 40,
  stringBytes: 1024 * 1024,
  legacyNodes: 100_000,
  extendedNodes: 250_000,
} as const);

/** Derive the requirement from the actual canonical configuration, not its contract. */
export function requiresExtendedConfigurationBytes(config: unknown): boolean {
  return Buffer.byteLength(canonicalJson(config), 'utf8') >
    NATIVE_ARTIFACT_CAPACITY_V2.legacyConfigBytes;
}

/** Count JSON values without copying the artifact; stop at the legacy boundary. */
export function requiresExtendedArtifactCapacity(config: unknown): boolean {
  let nodes = 0;
  const pending: Iterator<unknown>[] = [[config][Symbol.iterator]()];
  while (pending.length) {
    const next = pending[pending.length - 1]!.next();
    if (next.done) { pending.pop(); continue; }
    if (++nodes > NATIVE_ARTIFACT_CAPACITY_V2.legacyNodes) return true;
    if (Array.isArray(next.value)) pending.push(next.value.values());
    else if (next.value && typeof next.value === 'object') {
      const object = next.value as Record<string, unknown>;
      // Canonical objects omit undefined; arrays serialize it as a null value.
      pending.push((function* () { for (const key of Object.keys(object)) if (object[key] !== undefined) yield object[key]; })());
    }
  }
  return false;
}
