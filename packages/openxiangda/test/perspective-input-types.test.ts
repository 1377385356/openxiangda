import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

test('public application props accept nonempty readonly compiler perspectives and mutable wire contracts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'oxa-perspective-types-'));
  try {
    const sdk = fileURLToPath(new URL('../dist/react.js', import.meta.url));
    const contracts = fileURLToPath(new URL('../../contracts/dist/index.js', import.meta.url));
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(directory, 'consumer.ts'), `
import type { OpenXiangdaApplicationProps } from ${JSON.stringify(sdk)};
import type { AppPerspectiveContract } from ${JSON.stringify(contracts)};
const generated = [{ code: 'management', name: 'Management',
  roleCodes: ['manager'], capabilityCodes: ['app:example:data:requests:read'] }] as const;
const props: Pick<OpenXiangdaApplicationProps, 'perspectives'> = { perspectives: generated };
declare const mutable: AppPerspectiveContract[];
const original: Pick<OpenXiangdaApplicationProps, 'perspectives'> = { perspectives: mutable };
type Perspective = NonNullable<OpenXiangdaApplicationProps['perspectives']>[number];
declare const input: Perspective;
// @ts-expect-error runtime cannot mutate generated capability arrays
input.capabilityCodes.push('broadened');
// @ts-expect-error runtime cannot mutate generated role arrays
input.roleCodes.push('other-role');
// @ts-expect-error invalid wire field type remains rejected
const wrong: Perspective = { ...generated[0], capabilityCodes: [123] };
// @ts-expect-error required role list remains mandatory
const missing: Perspective = { code: 'missing', name: 'Missing', capabilityCodes: [] };
void props; void original; void wrong; void missing;
`);
    const program = ts.createProgram([path.join(directory, 'consumer.ts')], {
      strict: true, noEmit: true, skipLibCheck: true,
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      exactOptionalPropertyTypes: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: name => name,
      getCurrentDirectory: () => directory,
      getNewLine: () => '\n',
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
