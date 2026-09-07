import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { readRuntimeMount, resolveApplicationBasename } from 'openxiangda/core';
import {
  notificationTemplateCodes,
  platformAuthManifest,
  resourceCodes,
  resourceDefinitions,
} from '../../../templates/application/packages/contracts/src/generated.js';

const templateTestRoot = new URL('../../../templates/application/apps/web/test/', import.meta.url);
const browserFixtureRoot = new URL('../../../scripts/fixtures/platform-browser/', import.meta.url);

test('clean template contains application declarations, document reset and one React entry', () => {
  const config = readFileSync(
    new URL('../../../openxiangda.config.ts', templateTestRoot),
    'utf8'
  );
  const source = readFileSync(new URL('../src/main.tsx', templateTestRoot), 'utf8');
  const productionSources = readdirSync(new URL('../src', templateTestRoot), {
    withFileTypes: true,
  })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(productionSources, ['document.css', 'main.tsx']);
  assert.deepEqual(Object.keys(resourceDefinitions).sort(), [...resourceCodes].sort());
  assert.equal(
    notificationTemplateCodes.applicationInformational,
    'application.informational.standard'
  );
  assert.equal(platformAuthManifest?.protectedUserRouteCount, 2);
  assert.equal(platformAuthManifest?.surfaces.length, 2);
  assert.match(config, /defineOpenXiangdaApp/);
  assert.match(source, /OpenXiangdaApplication/);
  assert.match(source, /routes: appRoutes, authenticationSurfaces/);
  assert.match(source, /DefaultDesktopApplicationLoginSurface/);
  assert.match(source, /DefaultMobileApplicationLoginSurface/);
  assert.match(source, /contributions=\{applicationContributions\}/);
  assert.match(source, /publicAccess=\{anonymousPublicAccess\}/);
  assert.match(source, /from 'openxiangda\/react'/);
  assert.match(source, /openxiangda\/react\/styles\.css/);
  const legacyMarkers = [
    'instruments',
    'colleges',
    '仪器' + '资源管理',
    '学院' + '字典',
    'HGY',
    'Instrument',
  ];
  assert.doesNotMatch(`${config}\n${source}`, new RegExp(legacyMarkers.join('|')));
});

test('application manifests expose one direct OpenXiangda dependency', () => {
  for (const relative of [
    '../../../package.json',
    '../package.json',
    ...(existsSync(new URL('../../server/package.json', templateTestRoot)) ? ['../../server/package.json'] : []),
  ]) {
    const manifest = JSON.parse(
      readFileSync(new URL(relative, templateTestRoot), 'utf8')
    ) as Record<string, Record<string, string>>;
    const dependencies = Object.entries({
      ...(manifest.dependencies || {}),
      ...(manifest.devDependencies || {}),
      ...(manifest.peerDependencies || {}),
    }).filter(([name]) =>
      name === 'openxiangda' || name.startsWith('openxiangda-')
    );
    assert.deepEqual(
      dependencies.map(([name]) => name),
      dependencies.length ? ['openxiangda'] : []
    );
  }
});

test('runtime metadata stays mount-scoped', () => {
  const mount = readRuntimeMount(
    name =>
      ({
        'openxiangda-runtime-base': '/view/example-app/',
        'openxiangda-app-code': 'example-app',
        'openxiangda-environment': 'preproduction',
      })[name]
  );
  assert.equal(resolveApplicationBasename(mount), '/view/example-app');
});

test('resource E2E harness owns the standard export download response', () => {
  const source = readFileSync(
    new URL('platform-e2e/resource-platform-mock.ts', browserFixtureRoot),
    'utf8'
  );
  assert.match(source, /\/native\\\/data\\\/\(\[\^\/\]\+\)\\\/export\$/);
  assert.match(source, /content-disposition/);
  assert.match(source, /text\/csv/);
});

test('published E2E harnesses do not write evidence into the platform source repository', () => {
  const workflowSource = readFileSync(
    new URL('platform-e2e/workflow.spec.ts', browserFixtureRoot),
    'utf8'
  );
  assert.doesNotMatch(workflowSource, /docs\/architecture|evidenceDirectory/);
});

test('E2E experience fixtures explicitly own every tested route', () => {
  const resourceFixture = readFileSync(
    new URL('platform-e2e/resource-experience-fixture.tsx', browserFixtureRoot),
    'utf8'
  );
  for (let index = 1; index <= 12; index += 1) {
    const code = `resource-${String(index).padStart(2, '0')}`;
    const pageCode = `resource:${code}:list`;
    assert.match(resourceFixture, new RegExp(`pageCode: '${pageCode}'`));
    assert.match(resourceFixture, new RegExp(`code: '${pageCode}'`));
  }

  const workflowFixture = readFileSync(
    new URL('platform-e2e/workflow-experience-fixture.tsx', browserFixtureRoot),
    'utf8'
  );
  assert.match(workflowFixture, /code: 'workflow:work-center'/);
  assert.match(workflowFixture, /code: 'workflow:task'/);
  assert.match(workflowFixture, /code: 'workflow:instance'/);
  assert.match(workflowFixture, /path: '\/work-center'/);
  assert.match(workflowFixture, /path: '\/tasks\/:taskId'/);
  assert.match(workflowFixture, /path: '\/workflows\/:instanceId'/);
  assert.doesNotMatch(
    workflowFixture,
    /path: '\/(?:m\/)?admin\/(?:todos|work-center|tasks|workflows)/
  );
});

test('browser acceptance serializes the prewarmed Vite HTML entrypoints', () => {
  const viteConfig = readFileSync(new URL('vite.platform-e2e.config.ts', browserFixtureRoot), 'utf8');
  const playwrightConfig = readFileSync(
    new URL('playwright.platform.config.ts', browserFixtureRoot),
    'utf8'
  );
  const htmlEntries = readdirSync(browserFixtureRoot)
    .filter(name => name.endsWith('.e2e.html'))
    .sort();
  assert.ok(htmlEntries.length > 0, 'browser acceptance requires maintainer HTML entrypoints');
  for (const entry of htmlEntries) {
    assert.ok(viteConfig.includes(`'${entry}'`), `missing optimizeDeps entry ${entry}`);
  }
  assert.match(playwrightConfig, /workers:\s*1/);
});

test('the platform package owns Web build verification policy', () => {
  const verifier = readFileSync(
    new URL('../scripts/verify-build.mjs', templateTestRoot),
    'utf8'
  );
  assert.match(verifier, /verifyOpenXiangdaWebBuild/);
  assert.doesNotMatch(verifier, /2_650_000|800_000|600_000/);
});
