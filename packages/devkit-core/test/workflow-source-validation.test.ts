import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { OpenXiangdaAppConfig } from '../src/compiler/config.js';
import { validateWorkflowSourceReferences } from '../src/workflow-source-validation.js';

test('published explanations are tied to source bytes and reject changes or inaccessible references', () => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-source-'));
  try {
    mkdirSync(join(root, 'apps/server/src'), { recursive: true });
    const source = 'export const calculate = (value: number) => value * 100;\n';
    const reference = { path: 'apps/server/src/calculate.ts', digest: `sha256:${createHash('sha256').update(source).digest('hex')}` };
    const config = { workflows: { definitions: [{ definition: { code: 'calculation', readability: { logic: [{ code: 'calculate', source: reference }] } } }] } } as unknown as OpenXiangdaAppConfig;
    const file = join(root, reference.path);
    writeFileSync(file, source);
    validateWorkflowSourceReferences(root, config);
    writeFileSync(file, source.replace('* 100', '* 10'));
    assert.throws(() => validateWorkflowSourceReferences(root, config), { code: 'WORKFLOW_LOGIC_DESCRIPTION_STALE' });
    rmSync(file);
    assert.throws(() => validateWorkflowSourceReferences(root, config), { code: 'WORKFLOW_LOGIC_SOURCE_UNAVAILABLE' });
    symlinkSync(join(root, 'outside.ts'), file);
    assert.throws(() => validateWorkflowSourceReferences(root, config), { code: 'WORKFLOW_LOGIC_SOURCE_SYMLINK_FORBIDDEN' });
    reference.path = '../private.ts';
    assert.throws(() => validateWorkflowSourceReferences(root, config), { code: 'WORKFLOW_LOGIC_SOURCE_PATH_INVALID' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
