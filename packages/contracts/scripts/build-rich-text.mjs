import { build } from 'esbuild';
import { resolve } from 'node:path';
// 浏览器/Node 使用同一 HTML5 解析与清洗代码，CJS 供 Midway 消费。
await build({
  absWorkingDir: resolve(import.meta.dirname, '..'),
  entryPoints: ['src/rich-text.ts'], bundle: true, platform: 'neutral',
  format: 'cjs', target: 'es2022', outfile: 'dist/rich-text.cjs',
});
