export const V2_REGISTRY = 'https://npm.syedu.tech';
export const V1_REGISTRY = 'https://registry.npmjs.org';
export function defaultRegistry(selector = 'v2') {
  return selector === 'v1' || selector === 'legacy-v1' || /^1\./.test(selector) ? V1_REGISTRY : V2_REGISTRY;
}
