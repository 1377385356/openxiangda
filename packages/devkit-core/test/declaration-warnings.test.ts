import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineOpenXiangdaApp, validateAppConfig, type OpenXiangdaAppDeclaration } from '../src/compiler/config.js';
import { compileApplicationSources } from '../src/compiler/bundle.js';
import { loadAppConfig } from '../src/workspace-loader.js';

function declaration(): OpenXiangdaAppDeclaration {
  const capability = 'app:canvas-warning:action:probe-model';
  return {
    app: { code: 'canvas-warning', name: '模型协议测试' }, frontend: {},
    data: { resources: [{ code: 'records', name: '测试记录',
      fields: [{ code: 'name', label: '名称', type: 'text.short' }] }] },
    backend: { operations: [{
      code: 'probe-model', method: 'POST', path: '/model/probe', capability,
      requestSchema: { type: 'object', additionalProperties: false, properties: {} },
      responseSchema: { type: 'object', additionalProperties: false, properties: {} },
      ai: { name: '探测模型', description: '只探测模型协议，不修改业务记录',
        risk: 'external', resources: ['records'], sideEffects: ['调用受管模型'], timeoutMs: 30000 },
    }] },
    authz: { capabilities: [{ code: capability, name: '探测模型', kind: 'backend' }],
      roles: [{ code: 'operator', name: '测试员', capabilities: [capability] }],
      scopeDimensions: [], scopeSources: [], dataPolicies: [] },
  };
}

test('external AI reconciliation warning does not invalidate construction, and remains visible', () => {
  const config = defineOpenXiangdaApp(declaration());
  const diagnostics = validateAppConfig(config);
  assert.equal(diagnostics.filter(item => item.severity === 'error').length, 0);
  assert.equal(diagnostics.find(item => item.code === 'AI_EXTERNAL_RECONCILIATION_MISSING')?.severity, 'warning');
  assert.equal(config.backend.operations[0].ai?.reconcile, undefined, 'no fictitious reconciliation is invented');
  assert.doesNotThrow(() => compileApplicationSources(config));
});

test('a real declaration error still blocks alongside warnings', () => {
  const source = declaration();
  source.app.code = 'Invalid app code';
  assert.throws(() => defineOpenXiangdaApp(source), (error: unknown) => {
    const diagnostics = (error as { diagnostics: Array<{ severity: string; code: string }> }).diagnostics;
    assert.ok(diagnostics.length > 0);
    assert.ok(diagnostics.every(item => item.severity === 'error'));
    return true;
  });
});

test('workspace loading also accepts warnings without weakening the later checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oxa-declaration-warnings-'));
  try {
    writeFileSync(join(root, 'openxiangda.config.ts'),
      `export default ${JSON.stringify(declaration())};\n`);
    const config = await loadAppConfig(join(root, 'openxiangda.config.ts'));
    assert.equal(config.app.code, 'canvas-warning');
    assert.ok(validateAppConfig(config).some(item => item.code === 'AI_EXTERNAL_RECONCILIATION_MISSING' && item.severity === 'warning'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
