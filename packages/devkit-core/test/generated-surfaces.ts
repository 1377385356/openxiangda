import ts from 'typescript';

export function generatedSurfaces(source: string): Record<string, any> {
  const exports = {} as { resourceSurfaces: Record<string, any> };
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', javascript)(exports);
  return exports.resourceSurfaces;
}

