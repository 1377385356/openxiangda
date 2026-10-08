/** Pure budget values shared by browser schemas and both compiler module formats. */
export const NATIVE_ARTIFACT_CAPACITY_V2 = Object.freeze({
  legacyConfigBytes: 4 * 1024 * 1024,
  configBytes: 8 * 1024 * 1024,
  contractBytes: 8 * 1024 * 1024,
  depth: 40,
  stringBytes: 1024 * 1024,
  legacyNodes: 100_000,
  extendedNodes: 250_000,
} as const);

/** Additional density is negotiated independently from the prior extension. */
export const NATIVE_HIGH_DENSITY_ARTIFACT_CAPACITY_V2 = Object.freeze({
  nodes: 500_000,
} as const);
