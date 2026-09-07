import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as runtime from '../src/react';
import { scopeMobileCss } from '../scripts/scope-mobile-css.mjs';

test('runtime exposes component infrastructure without visual preference APIs', () => {
  assert.equal(typeof runtime.OpenXiangdaUiProvider, 'function');
  assert.deepEqual(Object.keys(runtime).filter(key => /appearance|theme/i.test(key)), []);
});

test('platform CSS keeps the host document unchanged and uses library defaults', () => {
  const source = readFileSync(new URL('../src/browser/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:^|\n)(?:html|body|#root|\*)[\s{,]/);
  const variables = [...source.matchAll(/var\((--[\w-]+)/g)].map(match => match[1]!);
  assert.ok(variables.length > 0);
  assert.ok(variables.every(name => name.startsWith('--ant-')));
});

test('mobile base CSS scopes only upstream defaults and retains scroll/measurement mechanics', () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve('antd-mobile/es/global/global.css'), 'utf8');
  const scoped = scopeMobileCss(source);
  assert.doesNotMatch(scoped, /:root|(?:^|\n)(?:html|body|a|button)[\s{,:]/);
  assert.doesNotMatch(scoped, /prefers-color-scheme|data-.*theme|--color-user-/);
  assert.match(scoped, /--adm-color-primary: #1677ff;/);
  assert.match(scoped, /body\.adm-overflow-hidden/);
  assert.match(scoped, /div\.adm-px-tester/);
  assert.throws(() => scopeMobileCss(`${source}\ninput { color: red; }`), /Unreviewed/);
});
