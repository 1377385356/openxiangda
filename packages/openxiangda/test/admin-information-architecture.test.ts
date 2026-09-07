import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  adminNavigationGroup,
  adminOperationPage,
  adminResourcePage,
  defineAdminNavigation,
  renderAdminNavigationSuggestion,
  suggestAdminNavigation,
} from '../src/config';
import {
  createAdminInformationArchitecture,
  firstAllowedAdminPath,
  isAdminPageAllowed,
} from '../src/react';

test('exports the typed admin navigation authoring helpers', () => {
  for (const helper of [
    defineAdminNavigation,
    adminNavigationGroup,
    adminResourcePage,
    adminOperationPage,
    suggestAdminNavigation,
    renderAdminNavigationSuggestion,
  ]) {
    assert.equal(typeof helper, 'function');
  }
});

const pages = [
  {
    code: 'resource:members:list',
    kind: 'resource-list',
    path: '/admin/resources/members',
    label: '会员档案',
    navigationEligible: true,
    capability: 'app:demo:data:members:read',
    resourceCode: 'members',
  },
  {
    code: 'resource:members:create',
    kind: 'resource-create',
    path: '/admin/resources/members/new',
    label: '新增会员档案',
    navigationEligible: false,
    capability: 'app:demo:data:members:create',
    resourceCode: 'members',
  },
  {
    code: 'resource:internal-records:list',
    kind: 'resource-list',
    path: '/admin/resources/internal-records',
    label: '内部记录',
    navigationEligible: true,
    capability: 'app:demo:data:internal-records:read',
    resourceCode: 'internal-records',
  },
  {
    code: 'operation:member-import',
    kind: 'operation',
    path: '/admin/operations/member-import',
    label: '会员导入',
    navigationEligible: true,
    capability: 'app:demo:member-import:run',
    routeCode: 'member-import',
  },
] as const;

const navigation = [
  {
    code: 'members',
    label: '会员管理',
    icon: 'members',
    order: 0,
    items: [
      { pageCode: 'resource:members:list', order: 0 },
      { pageCode: 'operation:member-import', order: 1 },
    ],
  },
] as const;

test('keeps page existence separate from explicit navigation', () => {
  const architecture = createAdminInformationArchitecture(pages, navigation);
  assert.equal(architecture.pagesByCode.has('resource:members:create'), true);
  assert.equal(
    architecture.pagesByCode.has('resource:internal-records:list'),
    true,
  );
  assert.deepEqual(
    architecture.navigation.flatMap(group =>
      group.items.map(item => item.pageCode),
    ),
    ['resource:members:list', 'operation:member-import'],
  );
});

test('permission only filters declared pages and never invents navigation', () => {
  const architecture = createAdminInformationArchitecture(pages, navigation);
  const grants = new Set(['app:demo:member-import:run']);
  const allowed = (capability: string) => grants.has(capability);
  assert.equal(
    firstAllowedAdminPath(
      architecture,
      allowed,
      allowed,
      routeCode => routeCode === 'member-import',
    ),
    '/admin/operations/member-import',
  );
  assert.equal(
    firstAllowedAdminPath(architecture, allowed, allowed, () => false),
    undefined,
    'operation menu filtering delegates to the authoritative route closure',
  );
  assert.equal(
    isAdminPageAllowed(
      architecture.pagesByCode.get('resource:internal-records:list')!,
      () => true,
      () => true,
    ),
    true,
    'authorization can allow a page without adding it to navigation',
  );
  assert.equal(
    architecture.navigation.some(group =>
      group.items.some(item => item.pageCode.includes('internal-records')),
    ),
    false,
  );
});

test('fails closed when hidden or missing pages are inserted into navigation', () => {
  for (const pageCode of ['resource:members:create', 'resource:missing:list']) {
    assert.throws(
      () =>
        createAdminInformationArchitecture(pages, [
          {
            code: 'invalid',
            label: '错误分组',
            order: 0,
            items: [{ pageCode, order: 0 }],
          },
        ]),
      /OPENXIANGDA_ADMIN_NAVIGATION_PAGE_INVALID/,
    );
  }
});

test('keeps standard resource details and list values visually neutral', () => {
  const detailSource = readFileSync(
    new URL(
      '../src/browser/components/resource/StandardResourcePages.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const resourceSource = readFileSync(
    new URL(
      '../src/browser/components/resource/GeneratedResourceCrud.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const fieldSource = readFileSync(
    new URL(
      '../src/browser/components/resource/SurfaceFields.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(detailSource, /<RecordDetailFrame/);
  assert.doesNotMatch(detailSource, /HistoryOutlined/);
  assert.doesNotMatch(resourceSource, /最近更新/);
  assert.match(resourceSource, /aria-label="新增"/);
  assert.match(resourceSource, /type === 'number\.integer' \|\| field\.type === 'number\.decimal'/);
  assert.match(fieldSource, /return <WorkflowPlainReferenceValue value=\{value\} \/>/);
});
