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
