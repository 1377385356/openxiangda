import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts';
import { backendRuntimeRequired, compileApplicationSources, defineOpenXiangdaApp } from '../src/compiler/index.js';
import { initializeOptionalBackend } from '../src/optional-backend.js';
import { loadAppConfig } from '../src/workspace-loader.js';

const app = (enabled = false) => defineOpenXiangdaApp({
  app: { code: 'extension-test', name: 'Extension' }, backend: { enabled },
});
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'openxiangda-optional-backend-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { openxiangda: '2.0.0-alpha.95' } }));
  return root;
}

test('plain application needs no source or installation; enabling later creates one ordinary backend', () => {
  const root = workspace();
  let installs = 0;
  try {
    const options = { install: () => { installs += 1; } };
    assert.equal(initializeOptionalBackend(root, app(), options).required, false);
    assert.equal(existsSync(join(root, 'apps')), false);
    assert.equal(installs, 0);
    assert.deepEqual(initializeOptionalBackend(root, app(true), options), {
      root: 'apps/server', required: true, created: true, installed: true,
    });
    const main = readFileSync(join(root, 'apps/server/src/main.ts'), 'utf8');
    assert.match(main, /bootstrapOpenXiangdaApplication\(AppModule\)/);
    const manifest = JSON.parse(readFileSync(join(root, 'apps/server/package.json'), 'utf8'));
    assert.equal(manifest.dependencies.openxiangda, '2.0.0-alpha.95');
    writeFileSync(join(root, 'apps/server/src/app.module.ts'), '// application-owned edits\n');
    assert.equal(initializeOptionalBackend(root, app(true), options).created, false);
    assert.equal(installs, 1);
    assert.equal(readFileSync(join(root, 'apps/server/src/app.module.ts'), 'utf8'), '// application-owned edits\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dependency failure is retryable without discarding the new source or app edits', () => {
  const root = workspace();
  try {
    assert.throws(() => initializeOptionalBackend(root, app(true), { install: () => { throw new Error('network interrupted'); } }), /network interrupted/);
    writeFileSync(join(root, 'apps/server/src/app.module.ts'), '// keep this\n');
    assert.equal(existsSync(join(root, '.openxiangda/backend-install-pending.json')), true);
    assert.equal(existsSync(join(root, '.openxiangda/backend-initialization.lock')), false);
    const result = initializeOptionalBackend(root, app(true), { install: () => {} });
    assert.equal(result.created, false);
    assert.equal(result.installed, true);
    assert.equal(readFileSync(join(root, 'apps/server/src/app.module.ts'), 'utf8'), '// keep this\n');
    assert.equal(existsSync(join(root, '.openxiangda/backend-install-pending.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('path escapes, symlink paths and concurrent initialization cannot overwrite files', () => {
  const root = workspace();
  const outside = workspace();
  try {
    const invalid = app(true);
    invalid.backend.root = '../outside';
    assert.throws(() => initializeOptionalBackend(root, invalid), /BACKEND_PATH_INVALID/);
    symlinkSync(outside, join(root, 'apps'));
    assert.throws(() => initializeOptionalBackend(root, app(true)), /BACKEND_PATH_INVALID/);
    rmSync(join(root, 'apps'));
    mkdirSync(join(root, '.openxiangda'));
    writeFileSync(join(root, '.openxiangda/backend-initialization.lock'), 'busy');
    assert.throws(() => initializeOptionalBackend(root, app(true)), /BACKEND_INITIALIZATION_BUSY/);
    assert.equal(existsSync(join(root, 'apps/server')), false);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('a standard activated workflow stays platform-owned without Nest', () => {
  const config = defineOpenXiangdaApp({
    app: { code: 'extension-test', name: 'Extension' },
    modules: [{ code: 'requests', models: [{ code: 'requests', name: 'Requests', fields: [
      { code: 'title', type: 'text.short', label: 'Title', required: true },
    ] }] }],
    workflows: {
      definitions: [{ version: 1, launch: { mode: 'standalone' }, definition: {
        schemaVersion: SCHEMA_VERSIONS.workflowDefinition, code: 'request-approval', title: 'Review',
        acceptedCommandDeactivationPolicy: 'finish-pinned',
        subject: { resourceCode: 'requests', factProjection: { title: 'title' } },
        startAt: 'done', inputSchema: { type: 'object', additionalProperties: false },
        nodes: { done: { id: 'done', kind: 'end', title: 'Done', outcome: 'approved' } },
      } }],
      bindings: [{ version: 1, binding: { schemaVersion: SCHEMA_VERSIONS.workflowBinding, workflowCode: 'request-approval', bindings: {} } }],
      activations: [{ workflowCode: 'request-approval', definitionVersion: 1, bindingVersion: 1, acceptedCommandDeactivationPolicy: 'finish-pinned' }],
    },
  });
  assert.equal(config.backend.enabled, false);
  assert.equal(backendRuntimeRequired(config), false);
  assert.equal(compileApplicationSources(config).config.value.workflows.activations.length, 1);
});

test('workspace config loads public model and permission helpers before enabling an extension', async () => {
  const root = workspace();
  const configPath = join(root, 'openxiangda.config.ts');
  try {
    writeFileSync(configPath, `
      import { defineOpenXiangdaApp, defineApplicationModule, defineDataModel, defineResourceForm, defineResourceList, resourceRoleCapabilities } from 'openxiangda/config';
      const model = defineDataModel({ code: 'requests', name: 'Requests', fields: [{ code: 'title', label: 'Title', type: 'text.short', required: true }] });
      export default defineOpenXiangdaApp({
        app: { code: 'extension-test', name: 'Extension' },
        modules: [defineApplicationModule({ code: 'requests', models: [model], crud: [{ model: model.code, form: defineResourceForm(model), list: defineResourceList(model) }] })],
        authz: { capabilities: [], roles: [{ code: 'reader', name: 'Reader', capabilities: resourceRoleCapabilities('extension-test', model.code, 'read') }] },
      });
    `);
    const config = await loadAppConfig(configPath);
    assert.equal(config.backend.enabled, false);
    assert.equal(config.data?.resources[0]?.code, 'requests');
    assert.deepEqual(config.authz?.roles[0]?.capabilities, ['app:extension-test:data:requests:read']);
    assert.equal(compileApplicationSources(config).config.value.data.resources.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
