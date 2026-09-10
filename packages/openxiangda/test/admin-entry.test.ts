import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdminInformationArchitecture,
  resolveAdminEntry,
} from '../src/browser/admin-information-architecture';

const pages = [{
  code: 'resource:records:list', kind: 'resource-list',
  path: '/admin/resources/records', label: '记录', navigationEligible: true,
  resourceCode: 'records', capability: 'records:read',
}, {
  code: 'operation:report', kind: 'operation', routeCode: 'report',
  path: '/admin/operations/report', label: '报表', navigationEligible: true,
  capability: 'report:view',
}] as const;
const navigation = [{
  code: 'business', label: '业务', order: 0,
  items: [{ pageCode: 'resource:records:list', order: 0 }, { pageCode: 'operation:report', order: 1 }],
}] as const;

test('models and reachable pages do not imply a configured admin entry', () => {
  const architecture = createAdminInformationArchitecture(pages, []);
  assert.deepEqual(resolveAdminEntry(architecture, () => true, () => true, () => true), { kind: 'not-configured' });
});

test('configured navigation with no allowed page is forbidden, not missing resources', () => {
  const architecture = createAdminInformationArchitecture(pages, navigation);
  assert.deepEqual(resolveAdminEntry(architecture, () => false, () => false, () => false), { kind: 'forbidden' });
});

test('admin entry preserves authorized navigation order and read projection', () => {
  const architecture = createAdminInformationArchitecture(pages, navigation);
  assert.deepEqual(resolveAdminEntry(architecture, () => false, capability => capability === 'records:read', () => true), { kind: 'page', path: '/admin/resources/records' });
  assert.deepEqual(resolveAdminEntry(architecture, () => true, () => false, code => code === 'report'), { kind: 'page', path: '/admin/operations/report' });
});

test('a custom report can be the only admin page without generated resource CRUD', () => {
  const architecture = createAdminInformationArchitecture([pages[1]], [{
    code: 'reports', label: '统计', order: 0,
    items: [{ pageCode: pages[1].code, order: 0 }],
  }]);
  assert.deepEqual(resolveAdminEntry(architecture, () => true, () => true, () => false), { kind: 'forbidden' });
  assert.deepEqual(resolveAdminEntry(architecture, () => true, () => true, () => true), { kind: 'page', path: '/admin/operations/report' });
});
