import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as runtime from '../src/react';
import { initializeAntdMobileRuntimeGlobal } from '../src/browser/mobile-runtime-global';
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
  assert.match(scoped, /--adm-color-primary: var\(--oxa-mobile-color-primary, #1677ff\);/);
  assert.match(scoped, /body\.adm-overflow-hidden/);
  assert.match(scoped, /div\.adm-px-tester/);
  assert.throws(() => scopeMobileCss(`${source}\ninput { color: red; }`), /Unreviewed/);
});

test('mobile component graph starts with the minimal runtime measurement prelude', () => {
  const source = readFileSync(new URL('../src/browser/mobile.tsx', import.meta.url), 'utf8');
  const prelude = readFileSync(new URL('../src/browser/mobile-runtime-global.css', import.meta.url), 'utf8');
  assert.match(source, /^import '\.\/mobile-runtime-global\.css';/);
  assert.match(prelude, /^div\.adm-px-tester \{/);
  assert.match(prelude, /position: fixed;/);
  assert.match(prelude, /height: calc\(var\(--size\) \/ 2 \* 2px\);/);
  assert.doesNotMatch(prelude, /(?:^|\n)(?:html|body|a|button|:root)[\s{,:]/);
});

test('react entry initializes only the document mechanics required by Ant Design Mobile', () => {
  const appended: Array<{ id: string; textContent: string | null }> = [];
  const listeners: Array<{ type: string; capture: boolean }> = [];
  const ids = new Set<string>();
  const target = {
    getElementById: (id: string) => (ids.has(id) ? {} : null),
    createElement: () => ({ id: '', textContent: null }),
    head: {
      appendChild: (node: { id: string; textContent: string | null }) => {
        ids.add(node.id);
        appended.push(node);
      },
    },
    documentElement: { appendChild: () => undefined },
    addEventListener: (type: string, _listener: () => void, capture: boolean) => {
      listeners.push({ type, capture });
    },
  } as unknown as Document;

  initializeAntdMobileRuntimeGlobal(target);
  initializeAntdMobileRuntimeGlobal(target);

  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.id, 'openxiangda-antd-mobile-runtime-global');
  assert.match(appended[0]?.textContent || '', /div\.adm-px-tester/);
  assert.doesNotMatch(appended[0]?.textContent || '', /(?:^|\n)(?:html|body|a|button)[\s{,:]/);
  assert.deepEqual(listeners, [{ type: 'touchstart', capture: true }]);
});
