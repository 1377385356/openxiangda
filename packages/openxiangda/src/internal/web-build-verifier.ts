import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const MAX_ASSET_FILES = 512;
const MAX_HTML_BYTES = 100_000;
const MAX_INITIAL_JAVASCRIPT_GZIP_BYTES = 2_000_000;

export interface OpenXiangdaWebBuildVerification {
  assetFiles: number;
  totalBytes: number;
  totalJavaScriptGzipBytes: number;
  initialJavaScriptGzipBytes: number;
}

export function verifyOpenXiangdaWebBuild(
  distInput: string | URL
): OpenXiangdaWebBuildVerification {
  const dist = resolve(
    typeof distInput === 'string' ? distInput : fileURLToPath(distInput)
  );
  const assets = join(dist, 'assets');
  const entries = readdirSync(assets, { withFileTypes: true });
  if (entries.length > MAX_ASSET_FILES) {
    throw new Error(
      `WEB_ASSET_FILE_COUNT_EXCEEDED:${entries.length}>${MAX_ASSET_FILES}`
    );
  }
  if (entries.some(entry => !entry.isFile())) {
    throw new Error('WEB_ASSET_TREE_INVALID');
  }

  const names = entries.map(entry => entry.name);
  const files = names.map(name => join(assets, name));
  const sizes = files.map(file => statSync(file).size);
  const totalBytes = sizes.reduce((total, size) => total + size, 0);
  if (names.some(name => name.endsWith('.map'))) {
    throw new Error('WEB_SOURCE_MAP_FORBIDDEN');
  }

  const javascript = files.filter(file => file.endsWith('.js'));
  const totalJavaScriptGzipBytes = javascript.reduce(
    (total, file) =>
      total + gzipSync(readFileSync(file), { level: 9 }).byteLength,
    0
  );

  const htmlPath = join(dist, 'index.html');
  const htmlBytes = statSync(htmlPath).size;
  if (htmlBytes > MAX_HTML_BYTES) {
    throw new Error(`WEB_HTML_BUDGET_EXCEEDED:${htmlBytes}>${MAX_HTML_BYTES}`);
  }
  const html = readFileSync(htmlPath, 'utf8');
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('WEB_ROOT_MISSING');
  }
  const initialNames = [
    ...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g),
  ].map(match => match[1]!);
  const initialJavaScriptGzipBytes = [...new Set(initialNames)].reduce(
    (total, name) => {
      if (!names.includes(name)) throw new Error(`WEB_INITIAL_ASSET_MISSING:${name}`);
      return (
        total +
        gzipSync(readFileSync(join(assets, name)), { level: 9 }).byteLength
      );
    },
    0
  );
  if (initialJavaScriptGzipBytes > MAX_INITIAL_JAVASCRIPT_GZIP_BYTES) {
    throw new Error(
      `WEB_INITIAL_JS_GZIP_BUDGET_EXCEEDED:${initialJavaScriptGzipBytes}>${MAX_INITIAL_JAVASCRIPT_GZIP_BYTES}`
    );
  }

  return {
    assetFiles: entries.length,
    totalBytes,
    totalJavaScriptGzipBytes,
    initialJavaScriptGzipBytes,
  };
}
