import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyOpenXiangdaWebBuild } from '../src/testing.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openxiangda-web-build-'));
  const assets = join(root, 'assets');
  mkdirSync(assets);
  writeFileSync(join(assets, 'index.js'), 'globalThis.__OPENXIANGDA__ = true;');
  writeFileSync(
    join(root, 'index.html'),
    '<div id="root"></div><script src="./assets/index.js"></script>'
  );
  return root;
}

function largeJavaScript(byteLength: number) {
  const prefix = "globalThis.__OPENXIANGDA_LARGE__='";
  const suffix = "';";
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const payload = Buffer.alloc(byteLength - prefix.length - suffix.length);
  let state = 0x12345678;
  for (let index = 0; index < payload.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    payload[index] = alphabet.charCodeAt((state >>> 0) % alphabet.length);
  }
  return `${prefix}${payload.toString('ascii')}${suffix}`;
}

test('owns the canonical deployable and initial Web build budgets', () => {
  const root = fixture();
  try {
    assert.deepEqual(verifyOpenXiangdaWebBuild(root), {
      assetFiles: 1,
      totalBytes: 34,
      totalJavaScriptGzipBytes: 54,
      initialJavaScriptGzipBytes: 54,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports large lazy chunks without applying a fixed total build budget', () => {
  const root = fixture();
  try {
    writeFileSync(
      join(root, 'assets', 'lazy.js'),
      largeJavaScript(3_000_000)
    );
    const result = verifyOpenXiangdaWebBuild(root);
    assert.ok(result.totalBytes > 2_650_000);
    assert.ok(result.totalJavaScriptGzipBytes > 800_000);
    assert.equal(result.initialJavaScriptGzipBytes, 54);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts an initial JavaScript chunk above the former gzip budget', () => {
  const root = fixture();
  try {
    writeFileSync(
      join(root, 'assets', 'index.js'),
      largeJavaScript(1_000_000)
    );
    const result = verifyOpenXiangdaWebBuild(root);
    assert.ok(result.initialJavaScriptGzipBytes > 600_000);
    assert.ok(result.initialJavaScriptGzipBytes < 2_000_000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed above the two-megabyte initial JavaScript gzip budget', () => {
  const root = fixture();
  try {
    writeFileSync(
      join(root, 'assets', 'index.js'),
      largeJavaScript(3_000_000)
    );
    assert.throws(
      () => verifyOpenXiangdaWebBuild(root),
      /WEB_INITIAL_JS_GZIP_BUDGET_EXCEEDED/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed on source maps without relying on an application-owned rule', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'assets', 'index.js.map'), '{}');
    assert.throws(
      () => verifyOpenXiangdaWebBuild(root),
      /WEB_SOURCE_MAP_FORBIDDEN/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
