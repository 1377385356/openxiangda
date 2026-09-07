import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scopeMobileCss } from './scope-mobile-css.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'dist/browser'), { recursive: true });
cpSync(
  resolve(root, 'src/browser/styles.css'),
  resolve(root, 'dist/browser/styles.css')
);
cpSync(resolve(root, 'src/browser/mobile-fields.css'), resolve(root, 'dist/browser/mobile-fields.css'));
cpSync(resolve(root, 'src/browser/record-detail.css'), resolve(root, 'dist/browser/record-detail.css'));
const require = createRequire(import.meta.url);
writeFileSync(resolve(root, 'dist/browser/mobile-base.css'), scopeMobileCss(
  readFileSync(require.resolve('antd-mobile/es/global/global.css'), 'utf8')
));
cpSync(
  resolve(root, 'src/browser/assets'),
  resolve(root, 'dist/browser/assets'),
  { recursive: true }
);
