import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts';
import { compileApplicationSources, defineOpenXiangdaApp } from '../src/index.js';

test('generated resource map compiles against the SDK and rejects common integration mistakes', async () => {
  const generated = compileApplicationSources(defineOpenXiangdaApp({
    schemaVersion: 3, app: { code: 'typed-example', name: 'Typed example' },
    frontend: { root: 'apps/web' }, backend: { root: 'apps/server', runtime: 'node', framework: 'nestjs' },
    platform: { root: 'platform' },
    data: { resources: [{ code: 'requests', name: 'Requests', fields: [
      { code: 'title', type: 'text.short', label: 'Title', required: true },
      { code: 'owners', type: 'user.multiple', label: 'Owners' },
    ] }] },
  })).contracts.typescript;
  const directory = await mkdtemp(path.join(tmpdir(), 'oxa-typed-resource-'));
  try {
    const sdk = fileURLToPath(new URL('../../nest/src/typed-resources.js', import.meta.url));
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(directory, 'generated.ts'), generated);
    await writeFile(path.join(directory, 'consumer.ts'), `
import type { ResourceTypes } from './generated.js';
import { bindOpenXiangdaResources } from ${JSON.stringify(sdk)};
declare const transport: Parameters<typeof bindOpenXiangdaResources>[0];
const resources = bindOpenXiangdaResources<ResourceTypes>(transport);
const requests = resources('requests');
await requests.create({ title: 'First', owners: [{ value: 'user-1', label: 'User' }] });
const result = await requests.get('record-1');
const revision: number = result.data.revision;
await requests.update(result.data.id, { expectedRevision: revision, data: { title: 'Second' } });
await requests.query({ schemaVersion: ${JSON.stringify(SCHEMA_VERSIONS.dataQuery)}, select: ['title'], order: [{ field: 'title' }] });
// @ts-expect-error unknown resource
resources('requestz');
// @ts-expect-error snapshot array, not a raw ID
await requests.create({ title: 'Bad', owners: 'user-1' });
// @ts-expect-error generated system fields cannot be written
await requests.create({ title: 'Bad', owners: [], revision: 1 });
// @ts-expect-error revision is inside the wire envelope
result.revision;
// @ts-expect-error field permissions can omit business fields
const title: string = result.data.title;
// @ts-expect-error wrong field
await requests.update('record-1', { expectedRevision: 1, data: { titel: 'Bad' } });
// @ts-expect-error expectedRevision is mandatory
await requests.update('record-1', { data: { title: 'Bad' } });
// @ts-expect-error query fields must belong to the resource
await requests.query({ schemaVersion: ${JSON.stringify(SCHEMA_VERSIONS.dataQuery)}, select: ['titel'] });
`);
    const program = ts.createProgram([path.join(directory, 'consumer.ts')], {
      strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
      exactOptionalPropertyTypes: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: name => name, getCurrentDirectory: () => directory, getNewLine: () => '\n',
    }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('large generated resource catalogs emit declarations while keeping literal keys and field types', async () => {
  const generated = compileApplicationSources(defineOpenXiangdaApp({
    schemaVersion: 3, app: { code: 'large-typed', name: 'Large typed catalog' },
    frontend: { root: 'apps/web' }, backend: { root: 'apps/server', runtime: 'node', framework: 'nestjs' }, platform: { root: 'platform' },
    data: { resources: Array.from({ length: 180 }, (_, index) => ({ code: `resource-${index}`, name: `Resource ${index}`,
      fields: Array.from({ length: 45 }, (_, field) => ({ code: `field${field}`, type: 'text.short' as const, label: `Field ${field}`, required: field === 0 })) })) },
  })).contracts.typescript;
  const directory = await mkdtemp(path.join(tmpdir(), 'oxa-large-typed-'));
  try {
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(directory, 'generated.ts'), generated);
    const consumerSource = `
import { resourceDefinitions, resourceSurfaces } from './generated.js';
export const code: 'resource-179' = resourceDefinitions['resource-179'].code;
export const capability: 'app:large-typed:data:resource-179:read' = resourceDefinitions['resource-179'].capabilities.read;
export const field: 'text.short' = resourceSurfaces['resource-179'].fields.field0.type;
// @ts-expect-error keys remain closed
resourceDefinitions.missing;
// @ts-expect-error values remain readonly
resourceDefinitions['resource-179'].code = 'resource-179';
`;
    await writeFile(path.join(directory, 'consumer.ts'), consumerSource);
    const program = ts.createProgram([path.join(directory, 'consumer.ts')], { strict: true, skipLibCheck: true,
      declaration: true, emitDeclarationOnly: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
    const emitted = new Map<string, string>();
    const result = program.emit(undefined, (file, content) => emitted.set(path.basename(file), content));
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: name => name, getCurrentDirectory: () => directory, getNewLine: () => '\n',
    }));
    assert.equal(result.emitSkipped, false); assert.ok(emitted.get('generated.d.ts'));
    const consumer = emitted.get('consumer.d.ts'); assert.ok(consumer?.includes('"resource-179"') || consumer?.includes("'resource-179'"));
    await writeFile(path.join(directory, 'published.d.ts'), emitted.get('generated.d.ts')!);
    await writeFile(path.join(directory, 'published-consumer.ts'), consumerSource.replace('./generated.js', './published.js'));
    const published = ts.createProgram([path.join(directory, 'published-consumer.ts')], {
      strict: true, noEmit: true, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    });
    const publishedDiagnostics = ts.getPreEmitDiagnostics(published);
    assert.equal(publishedDiagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(publishedDiagnostics, {
      getCanonicalFileName: name => name, getCurrentDirectory: () => directory, getNewLine: () => '\n',
    }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
