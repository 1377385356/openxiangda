import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Template size is a toolchain quality gate, not a limit on authored applications.
const root = resolve(import.meta.dirname, '../templates/application');
const generated = /(?:^|\/)(?:node_modules|dist|coverage|playwright-report|test-results|\.openxiangda|\.turbo|\.turbopack|\.umi|\.umi-production)(?:\/|$)/;
const sourceExtensions = /\.(?:[cm]?[jt]sx?|css|html|json|md|ya?ml)$/;
const files = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = relative(root, path).replaceAll('\\', '/');
    if (
      generated.test(name) ||
      name === 'pnpm-lock.yaml' ||
      name === 'packages/contracts/src/generated.ts'
    ) continue;
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile() && sourceExtensions.test(name)) files.push(path);
  }
}
visit(root);
const bytes = files.reduce((total, file) => total + statSync(file).size, 0);
if (files.length > 50) throw new Error(`TEMPLATE_SOURCE_FILE_BUDGET_EXCEEDED:${files.length}>50`);
if (bytes > 500_000) throw new Error(`TEMPLATE_SOURCE_BYTE_BUDGET_EXCEEDED:${bytes}>500000`);
const productionFiles = files.filter(file => {
  const name = relative(root, file).replaceAll('\\', '/');
  return (
    name === 'package.json' ||
    name === 'openxiangda.config.ts' ||
    name.startsWith('platform/') ||
    (name.startsWith('apps/') &&
      !name.includes('/test/') &&
      !name.includes('/e2e/') &&
      !name.includes('/scripts/'))
  );
});
const source = productionFiles.map(file => readFileSync(file, 'utf8')).join('\n');
const agents = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
if (!agents.includes('pnpm openxiangda')) throw new Error('TEMPLATE_AGENT_PINNED_CLI_MISSING');
if (!agents.includes('docs data-authz')) throw new Error('TEMPLATE_AGENT_AUTHORIZATION_GUIDE_MISSING');

for (const marker of ['@umijs/', 'openxiangda-' + 'admin', 'openxiangda-' + 'user', 'instrument_query', 'instrument_save', 'function.invoke', 'departmentScopeKey', 'instrumentScopeKey', 'adminUserIds', 'college-' + 'am', 'user-' + 'wang', 'dept-' + 'am-test']) {
  if (source.includes(marker)) throw new Error(`TEMPLATE_FORBIDDEN_MARKER:${marker}`);
}
process.stdout.write(`Verified compact template: ${files.length} source files, ${bytes} bytes.\n`);
