export function load(url, context, nextLoad) {
  return url.endsWith('.css')
    ? { format: 'module', source: 'export default {};', shortCircuit: true }
    : nextLoad(url, context);
}
