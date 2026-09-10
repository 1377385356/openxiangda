import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import './verify-application-template.mjs';
import { generateDesignTopics } from './design-capabilities.mjs';
generateDesignTopics(undefined, true);

const files = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'packages',
    'templates/application/apps',
    'templates/application/packages',
    'scripts/fixtures/platform-browser',
    'skills',
  ],
  { encoding: 'utf8' }
)
  .split('\n')
  .map(value => value.trim())
  .filter(Boolean);

const forbidden = [
  ['V1_API_PATH', /openxiangda-api\/v1/],
  ['LEGACY_WORKFLOW_CLIENT', /workflowLegacy/],
  ['LEGACY_WORKFLOW_ROUTE', /legacy-definitions/],
  ['LEGACY_AUTHORIZATION_MODE', /legacy_user/],
  ['V1_SKILL', /openxiangda-v1-maintenance/],
  ['V1_ENGINE_BRANCH', /engineVersion\s*(?::|===?)\s*['"]1\.x/],
  ['SCHOOL_CONTACT_PUBLIC_SURFACE', /school-contact|SchoolContact/],
];

const violations = [];
for (const file of files) {
  if (!existsSync(file) || !/\.(?:[cm]?[jt]sx?|md|json|ya?ml)$/.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const [code, pattern] of forbidden) {
    if (pattern.test(source)) violations.push(`${code}: ${file}`);
  }
}

const supersededArchitectureDocuments = [
  'docs/architecture/admin-shell-v2.md',
  'docs/architecture/ant-design-pro-v6-admin-foundation.md',
  'docs/architecture/frontend-runtime-mount-v2.md',
  'docs/architecture/implementation-roadmap.md',
  'docs/architecture/local-development-v2.md',
  'docs/architecture/school-contact-default-access-v2.md',
  'docs/architecture/school-contact-directory-membership-v2.md',
  'docs/architecture/school-contact-head-teacher-v2.md',
];
for (const file of supersededArchitectureDocuments) {
  const firstScreen = readFileSync(file, 'utf8')
    .split('\n')
    .slice(0, 12)
    .join('\n');
  if (!firstScreen.includes('SUPERSEDED')) {
    violations.push(`SUPERSEDED_MARKER_MISSING: ${file}`);
  }
}

const productNorthStar = readFileSync(
  'docs/architecture/product-north-star-v2.md',
  'utf8'
)
  .split('\n')
  .slice(0, 8)
  .join('\n');
if (!productNorthStar.includes('当前权威实施方向')) {
  violations.push('PRODUCT_NORTH_STAR_NOT_AUTHORITATIVE');
}

const connectedDevelopmentDecision = readFileSync(
  'docs/architecture/connected-development-default-v2.md',
  'utf8'
);
if (
  connectedDevelopmentDecision.includes('旧 local-development 代码暂不删除') ||
  !connectedDevelopmentDecision.includes('已破坏性删除')
) {
  violations.push('CONNECTED_DEVELOPMENT_DELETION_STATUS_STALE');
}

const currentDocumentationEntrypoints = [
  'docs/.vitepress/config.ts',
  'docs/llms.txt',
];
const retiredArchitectureEntrypoints = [
  'admin-shell-v2',
  'ant-design-pro-v6-admin-foundation',
  'frontend-runtime-mount-v2',
  'implementation-roadmap',
  'local-development-v2',
  'school-contact-default-access-v2',
  'school-contact-directory-membership-v2',
  'school-contact-head-teacher-v2',
];
for (const file of currentDocumentationEntrypoints) {
  const source = readFileSync(file, 'utf8');
  for (const retiredPath of retiredArchitectureEntrypoints) {
    if (source.includes(retiredPath)) {
      violations.push(`SUPERSEDED_DOCUMENT_LINKED: ${file} -> ${retiredPath}`);
    }
  }
}

const documentationConfig = readFileSync('docs/.vitepress/config.ts', 'utf8');
for (const match of documentationConfig.matchAll(/link:\s*'\/([^']*)'/g)) {
  const route = match[1];
  const source = route === '' ? 'docs/index.md' : `docs/${route}.md`;
  if (!existsSync(source)) {
    violations.push(`DOCUMENTATION_LINK_MISSING: ${source}`);
  }
}

const serverBoundaryManifests = [
  'packages/contracts/package.json',
  'packages/nest/package.json',
  'packages/devkit-core/templates/backend/package.json',
  'templates/application/packages/domain/package.json',
];
const forbiddenServerDependencies = new Set([
  '@ant-design/icons',
  'antd',
  'antd-mobile',
  'openxiangda-admin',
  'openxiangda-field-kit',
  'openxiangda-user',
  'react',
  'react-dom',
]);

for (const file of serverBoundaryManifests) {
  if (!existsSync(file)) continue;
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const [name] of Object.entries({
    ...(manifest.dependencies || {}),
    ...(manifest.optionalDependencies || {}),
  })) {
    if (
      forbiddenServerDependencies.has(name) ||
      name.startsWith('@umijs/')
    ) {
      violations.push(`SERVER_UI_DEPENDENCY: ${file} -> ${name}`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`OpenXiangda 2.0 boundary violations:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Verified native 2.0 and server/UI boundaries across ${files.length} files.\n`
  );
}
