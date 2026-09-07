import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfigurationCompatibilityCorpus } from './lib/configuration-compatibility-corpus.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = `${JSON.stringify(buildConfigurationCompatibilityCorpus(), null, 2)}\n`;
const outputs = [
  resolve(
    repositoryRoot,
    'packages/contracts/test/fixtures/configuration-compatibility-corpus.json'
  ),
];
if (process.argv.includes('--sync-platform-server')) {
  const serverRoot = resolve(repositoryRoot, '../../sy-lowcode-platform-server');
  if (!existsSync(serverRoot)) {
    throw new Error('OPENXIANGDA_PLATFORM_SERVER_SIBLING_REQUIRED');
  }
  outputs.push(
    resolve(
      serverRoot,
      'test/fixtures/configuration-compatibility-corpus.json'
    )
  );
}
for (const output of outputs) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, source, 'utf8');
}
process.stdout.write(
  `Wrote ${outputs.map(output => output.replace(`${repositoryRoot}/`, '')).join(', ')}\n`
);
