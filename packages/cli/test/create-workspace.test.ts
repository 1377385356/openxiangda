import assert from 'node:assert/strict';
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import {
  calculateTemplateDigest,
  createWorkspace,
  ensureStudioWorkspaceBinding,
  isPlatformUuid,
  prepareWorkspace,
  readStudioWorkspaceBinding,
  studioWorkspaceBindingDigest,
  studioWorkspaceInitializationDigest,
} from '../src/create-workspace.js';

const repositoryTemplate = resolve(
  import.meta.dirname,
  '../../../templates/application'
);

test('installs and generates by default unless maintenance code opts out', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/create-workspace.ts'),
    'utf8'
  );
  assert.match(source, /const install = input\.install !== false/);
  const manifest = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../openxiangda/package.json'), 'utf8')
  );
  assert.deepEqual(manifest.bin, { openxiangda: './bin/run.js' });
});

test('preflights the workspace capsule before package installation', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'openxiangda-cli-preflight-'));
  const originalPath = process.env.PATH;
  try {
    const root = join(temporary, 'stale-app');
    const bin = join(temporary, 'bin');
    const marker = join(temporary, 'install-ran');
    writeFixture(
      root,
      'package.json',
      JSON.stringify({
        name: 'stale-app',
        devDependencies: {
          'openxiangda-devkit-core': '2.0.0-alpha.49',
        },
      })
    );
    mkdirSync(bin, { recursive: true });
    const fakePnpm = join(bin, 'pnpm');
    writeFileSync(
      fakePnpm,
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 0\n`,
      { mode: 0o755 }
    );
    chmodSync(fakePnpm, 0o755);
    process.env.PATH = `${bin}:${originalPath || ''}`;

    await assert.rejects(
      () => prepareWorkspace(root),
      /OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH/
    );
    assert.equal(existsSync(marker), false);
  } finally {
    process.env.PATH = originalPath;
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('creates the compact Vite/Refine instrument workspace', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'openxiangda-cli-create-'));
  try {
    const root = join(temporary, 'reference-app');
    const result = await createWorkspace({
      directory: root,
      appCode: 'reference-app',
      name: 'Reference App',
      templateRoot: repositoryTemplate,
      install: false,
    });
    assert.equal(result.generationDeferred, true);
    assert.equal(result.template.schemaVersion, 'openxiangda.workspace-template-binding/v1');
    assert.equal(result.template.ref.startsWith('file:'), true);
    assert.equal(result.template.digest, calculateTemplateDigest(repositoryTemplate));
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, '.openxiangda/template.json'), 'utf8')),
      result.template
    );
    const config = readFileSync(join(root, 'openxiangda.config.ts'), 'utf8');
    assert.match(config, /reference-app/);
    assert.match(config, /Reference App/);
    assert.doesNotMatch(config, /instrument-center|仪器资源管理/);
    const dockerignore = readFileSync(join(root, '.dockerignore'), 'utf8');
    for (const generatedTree of [
      'node_modules',
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      '.openxiangda',
      '.turbo',
      '.turbopack',
      '.umi',
      '.umi-production',
    ]) {
      assert.match(
        dockerignore,
        new RegExp(`^\\*\\*/${generatedTree.replace('.', '\\.')}$`, 'm'),
        `recursive Docker ignore: ${generatedTree}`
      );
    }
    const webPackage = readFileSync(
      join(root, 'apps/web/package.json'),
      'utf8'
    );
    assert.match(webPackage, /"@refinedev\/core"/);
    assert.match(webPackage, /"vite"/);
    assert.doesNotMatch(webPackage, /@umijs|openxiangda-admin|openxiangda-user/);
    const playwrightConfig = readFileSync(
      join(root, 'apps/web/playwright.config.ts'),
      'utf8'
    );
    assert.match(playwrightConfig, /OPENXIANGDA_E2E_PORT/);
    assert.match(playwrightConfig, /process\.cwd\(\)/);
    assert.match(playwrightConfig, /30_000/);
    assert.doesNotMatch(playwrightConfig, /127\.0\.0\.1:4173/);
    const webSource = collectFiles(join(root, 'apps/web/src'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n');
    assert.doesNotMatch(
      webSource,
      /instrument_query|instrument_save|function\.invoke/
    );
    assert.match(webSource, /OpenXiangdaApplication/);
    assert.match(webSource, /from 'openxiangda\/react'/);
    assert.match(webSource, /openxiangda\/react\/styles\.css/);
    assert.equal(existsSync(join(root, 'apps/server')), false);
    assert.doesNotMatch(readFileSync(join(root, 'package.json'), 'utf8'), /@nestjs|dev:server/);
    assert.equal(existsSync(join(root, 'packages/domain')), false);
    for (const path of [
      'dist',
      'coverage',
      'apps/web/.turbopack',
      'apps/web/src/.umi',
      'playwright-report',
    ]) {
      assert.equal(existsSync(join(root, path)), false, path);
    }
    const files = collectFiles(root);
    const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
    // 只约束新发行的初始脚手架体积，不限制应用后续的文件数或业务规模。
    assert.ok(files.length <= 84, `workspace files: ${files.length}`);
    assert.ok(bytes <= 500_000, `source bytes: ${bytes}`);
    assert.equal(existsSync(join(root, 'apps/web/test/contracts.test.ts')), false);
    assert.equal(existsSync(join(root, 'apps/web/scripts/check.mjs')), false);
    assert.equal(existsSync(join(root, 'apps/web/e2e/resource-platform-mock.ts')), false);
    assert.equal(readdirSync(join(root, 'apps/web')).some(name => name.endsWith('.e2e.html')), false);
    assertTemplateUsesCurrentWorkspaceVersions(root);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('rejects a mutable template whose content no longer matches its digest', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'openxiangda-cli-template-'));
  try {
    const template = join(temporary, 'template');
    writeFixture(template, 'package.json', '{"name":"openxiangda-application"}');
    writeFixture(
      template,
      'openxiangda.config.ts',
      "export default { app: { code: 'instrument-center', name: '仪器资源管理' } };\n"
    );
    const digest = calculateTemplateDigest(template);
    writeFixture(template, 'README.md', 'changed after catalog resolution\n');
    await assert.rejects(
      () =>
        createWorkspace({
          directory: join(temporary, 'created'),
          appCode: 'digest-check',
          name: 'Digest Check',
          templateRef: template,
          templateDigest: digest,
          install: false,
        }),
      /TEMPLATE_DIGEST_MISMATCH/
    );
    assert.equal(existsSync(join(temporary, 'created')), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('never copies generated trees from a polluted template', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'openxiangda-cli-filter-'));
  try {
    const template = join(temporary, 'template');
    writeFixture(template, 'package.json', '{"name":"openxiangda-application"}');
    writeFixture(
      template,
      'openxiangda.config.ts',
      "export default { app: { code: 'instrument-center', name: '仪器资源管理' } };\n"
    );
    writeFixture(template, 'apps/web/src/main.ts', 'export {};\n');
    for (const directory of [
      'node_modules',
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      '.openxiangda/report',
      '.turbo',
      'apps/web/.turbopack',
      'apps/web/src/.umi',
      'apps/web/src/.umi-production',
    ]) {
      writeFixture(template, `${directory}/leak.txt`, 'generated');
    }
    const root = join(temporary, 'created');
    await createWorkspace({
      directory: root,
      appCode: 'clean-app',
      name: 'Clean App',
      templateRoot: template,
      install: false,
    });
    assert.equal(
      readFileSync(join(root, 'apps/web/src/main.ts'), 'utf8'),
      'export {};\n'
    );
    for (const file of collectFiles(root)) {
      assert.doesNotMatch(relative(root, file), /leak\.txt$/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('rejects invalid app codes and non-empty targets', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'openxiangda-cli-invalid-'));
  try {
    await assert.rejects(
      () =>
        createWorkspace({
          directory: join(temporary, 'bad'),
          appCode: 'Bad Code',
          name: 'Bad',
          templateRoot: repositoryTemplate,
        }),
      /APP_CODE_INVALID/
    );
    const target = join(temporary, 'not-empty');
    writeFixture(target, 'keep.txt', 'keep');
    await assert.rejects(
      () =>
        createWorkspace({
          directory: target,
          appCode: 'valid-app',
          name: 'Valid',
          templateRoot: repositoryTemplate,
        }),
      /TARGET_DIRECTORY_NOT_EMPTY/
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('persists one fail-closed Studio project binding and compiler summary', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'openxiangda-studio-binding-'));
  try {
    const root = join(temporary, 'workspace');
    const template = {
      schemaVersion: 'openxiangda.workspace-template-binding/v1' as const,
      ref: 'builtin:application',
      digest: `sha256:${'1'.repeat(64)}` as const,
    };
    const input = {
      siteBaseUrl: 'https://site.example/openxiangda',
      projectId: '11111111-1111-4111-8111-111111111111',
      provisioningRunId: '22222222-2222-4222-8222-222222222222',
      appType: 'studio-app',
      appName: 'Studio App',
      template,
    };
    const prepared = ensureStudioWorkspaceBinding(root, input);
    assert.equal(prepared.state, 'prepared');
    assert.equal(prepared.compiler, null);
    assert.equal(prepared.applicationAuthority, 'site-project-provisioning-run');
    assert.equal(
      statSync(join(root, '.openxiangda/studio-binding.json')).mode & 0o777,
      0o600
    );

    const compiler = {
      toolchainVersion: '2.0.0-alpha.50',
      contractVersion: '2.0.0-alpha.5',
      compilerContractVersion: 'native-4',
      configurationDigest: '2'.repeat(64),
      contractDigest: '3'.repeat(64),
      aiCatalogDigest: '4'.repeat(64),
    };
    const compiled = ensureStudioWorkspaceBinding(root, { ...input, compiler });
    assert.equal(compiled.state, 'compiled');
    assert.deepEqual(compiled.compiler, compiler);
    assert.deepEqual(readStudioWorkspaceBinding(root), compiled);
    assert.equal(
      studioWorkspaceBindingDigest(compiled),
      studioWorkspaceBindingDigest(
        ensureStudioWorkspaceBinding(root, { ...input, compiler })
      )
    );
    const initializationFacts = {
      schemaVersion: 'openxiangda.studio-workspace-initialization/v1' as const,
      applicationAuthority: 'site-project-provisioning-run' as const,
      siteBaseUrl: input.siteBaseUrl,
      projectId: input.projectId,
      provisioningRunId: input.provisioningRunId,
      appType: input.appType,
      appName: input.appName,
      workspace: { reused: false },
      cliVersion: compiler.toolchainVersion,
      protocolVersion: 'openxiangda.studio-workspace/v2' as const,
      template,
      compiler,
      bindingDigest: studioWorkspaceBindingDigest(compiled),
    };
    assert.equal(
      studioWorkspaceInitializationDigest(initializationFacts),
      studioWorkspaceInitializationDigest({
        ...initializationFacts,
        compiler: {
          aiCatalogDigest: compiler.aiCatalogDigest,
          contractDigest: compiler.contractDigest,
          configurationDigest: compiler.configurationDigest,
          compilerContractVersion: compiler.compilerContractVersion,
          contractVersion: compiler.contractVersion,
          toolchainVersion: compiler.toolchainVersion,
        },
      })
    );
    assert.equal(
      studioWorkspaceInitializationDigest(initializationFacts),
      studioWorkspaceInitializationDigest({
        ...initializationFacts,
        workspace: { reused: true },
      })
    );

    assert.throws(
      () =>
        ensureStudioWorkspaceBinding(root, {
          ...input,
          projectId: '33333333-3333-4333-8333-333333333333',
        }),
      /STUDIO_WORKSPACE_BINDING_MISMATCH/
    );
    assert.throws(
      () =>
        ensureStudioWorkspaceBinding(root, {
          ...input,
          compiler: { ...compiler, contractDigest: '5'.repeat(64) },
        }),
      /STUDIO_WORKSPACE_COMPILER_DRIFT/
    );
    assert.throws(
      () =>
        ensureStudioWorkspaceBinding(join(temporary, 'insecure'), {
          ...input,
          siteBaseUrl: 'http://site.example',
        }),
      /STUDIO_WORKSPACE_BINDING_INPUT_INVALID/
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('accepts only RFC versioned and variant-qualified platform UUIDs', () => {
  assert.equal(isPlatformUuid('11111111-1111-4111-8111-111111111111'), true);
  assert.equal(isPlatformUuid('11111111-1111-0111-8111-111111111111'), false);
  assert.equal(isPlatformUuid('11111111-1111-4111-7111-111111111111'), false);
  assert.equal(isPlatformUuid('11111111-1111-6111-8111-111111111111'), false);
});

function writeFixture(root: string, path: string, source: string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, 'utf8');
}

function collectFiles(root: string) {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files;
}

function assertTemplateUsesCurrentWorkspaceVersions(workspaceRoot: string) {
  const packagesRoot = resolve(import.meta.dirname, '../..');
  const versions = new Map<string, string>();
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(packagesRoot, entry.name, 'package.json');
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
      name?: string;
      version?: string;
    };
    if ((manifest.name === 'openxiangda' || manifest.name?.startsWith('openxiangda-')) && manifest.version) {
      versions.set(manifest.name, manifest.version);
    }
  }
  for (const file of collectFiles(workspaceRoot).filter(file =>
    file.endsWith('package.json')
  )) {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >;
    for (const section of ['dependencies', 'devDependencies']) {
      for (const [name, version] of Object.entries(manifest[section] || {})) {
        if (name !== 'openxiangda' && !name.startsWith('openxiangda-')) continue;
        assert.equal(version, versions.get(name), `${name} in ${file}`);
      }
    }
  }
}
