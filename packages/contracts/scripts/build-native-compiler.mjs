import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// 摘要来自实际打包的纯规则；类型、文档和无关导出变化不使其失效。
const root = resolve(import.meta.dirname, '..');
const options = {
  absWorkingDir: root, entryPoints: ['src/native-compiler/index.ts'],
  bundle: true, platform: 'node', target: 'node20', minify: true,
  legalComments: 'none', write: false, metafile: true,
};
const esm = await build({ ...options, format: 'esm' });
for (const source of Object.keys(esm.metafile.inputs)) {
  if (!source.startsWith('src/native-compiler/') && !['src/canonical.ts', 'src/native-version.ts'].includes(source)) {
    throw new Error(`共享规则必须与其他协议和运行时隔离：${source}`);
  }
}
for (const output of Object.values(esm.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (!['crypto', 'node:crypto'].includes(dependency.path)) throw new Error(`共享纯规则不能引入运行时依赖：${dependency.path}`);
  }
}
const digest = createHash('sha256').update(esm.outputFiles[0].contents).digest('hex');
const cjs = await build({ ...options, format: 'cjs' });
for (const [format, result] of [['js', esm], ['cjs', cjs]]) {
  await writeFile(resolve(root, `dist/native-compiler/index.${format}`), result.outputFiles[0].text.replaceAll('__OPENXIANGDA_NATIVE_VALIDATOR_DIGEST__', digest));
}
await rm(resolve(root, 'dist/native-compiler/index.js.map'), { force: true });
console.log(`共享纯校验器 ${digest.slice(0, 12)}：ESM/CJS 同源构建完成`);
