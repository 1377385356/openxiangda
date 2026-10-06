import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnectedDevelopmentVitePlugin } from '../src/connected-development-vite.js';

const browser = {
  OPENXIANGDA_CONNECTED_DEV: 'true',
  OPENXIANGDA_CONNECTED_DEV_IDENTITY: 'browser',
  OPENXIANGDA_APP_CODE: 'source-test',
  OPENXIANGDA_ENVIRONMENT_KEY: 'preproduction',
};

test('browser source HTML selects the existing ordinary runtime without copying credentials', () => {
  const plugin = createConnectedDevelopmentVitePlugin({ ...browser, AUTHORIZATION: 'must-not-be-rendered' });
  assert.equal(plugin.apply, 'serve');
  const tags = plugin.transformIndexHtml('<html><head></head><body></body></html>');
  assert.deepEqual(Object.fromEntries(tags.map(tag => [tag.attrs.name, tag.attrs.content])), {
    'openxiangda-runtime-base': '/',
    'openxiangda-app-code': 'source-test',
    'openxiangda-environment': 'preproduction',
  });
  assert.equal(JSON.stringify(tags).includes('must-not-be-rendered'), false);
});

test('default developer mode and nonconnected serving have no ordinary mount override', () => {
  for (const environment of [{}, { ...browser, OPENXIANGDA_CONNECTED_DEV: 'false' },
    { ...browser, OPENXIANGDA_CONNECTED_DEV_IDENTITY: 'developer' }]) {
    assert.deepEqual(createConnectedDevelopmentVitePlugin(environment).transformIndexHtml('<html></html>'), []);
  }
});

test('invalid browser source scope and an existing mount fail without rendering ambiguous tags', () => {
  for (const environment of [{ ...browser, OPENXIANGDA_APP_CODE: undefined },
    { ...browser, OPENXIANGDA_APP_CODE: '<script>' }, { ...browser, OPENXIANGDA_ENVIRONMENT_KEY: 'production' }]) {
    assert.throws(() => createConnectedDevelopmentVitePlugin(environment).transformIndexHtml('<html></html>'),
      /OPENXIANGDA_CONNECTED_BROWSER_MOUNT_INVALID/);
  }
  for (const name of ['runtime-base', 'app-code', 'environment']) {
    assert.throws(() => createConnectedDevelopmentVitePlugin(browser).transformIndexHtml(
      `<html><head><meta name='openxiangda-${name}' content='old'></head></html>`),
      /OPENXIANGDA_CONNECTED_BROWSER_MOUNT_CONFLICT/);
  }
});
