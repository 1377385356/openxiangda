import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Button, Input, Modal, Select, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  defineApplicationContributions,
  OpenXiangdaAdminPage,
  OpenXiangdaApplication,
} from 'openxiangda/react';
import type { DataFieldSurface, DataResourceSurface } from 'openxiangda/core';
import 'openxiangda/react/styles.css';
import './component-defaults-fixture.css';

const field = (
  label: string,
  type: DataFieldSurface['type'] = 'text.short',
  widget: DataFieldSurface['widget'] = 'text',
  extra: Partial<DataFieldSurface> = {}
): DataFieldSurface => ({
  label,
  type,
  widget,
  readCapabilities: [],
  createCapabilities: [],
  updateCapabilities: [],
  ...extra,
});

const fields: DataResourceSurface['fields'] = {
  departmentMultiple: field('构成部门', 'department.multiple', 'directory-department', {
    list: true,
    section: '组织信息',
  }),
  departmentSingle: field('牵头部门', 'department.single', 'directory-department', {
    list: true,
    section: '组织信息',
  }),
  userMultiple: field('小组成员', 'user.multiple', 'directory-user', {
    list: true,
    section: '组织信息',
  }),
  resourceMultiple: field('关联资源', 'resource-ref.multiple', 'resource', {
    list: true,
    section: '组织信息',
    source: {
      kind: 'resource',
      resourceCode: 'resource-01',
      labelField: 'name',
      searchFields: ['name'],
    },
  }),
  enabled: field('启用状态', 'boolean', 'switch', {
    list: true,
    section: '组织信息',
  }),
  displayOrder: field('显示顺序', 'number.integer', 'number', {
    list: true,
    section: '组织信息',
  }),
  description: field('栏目说明', 'text.long', 'textarea', {
    section: '栏目设置',
  }),
  status: field('状态', 'option.single', 'select', {
    options: [
      { label: '启用', value: 'enabled' },
      { label: '停用', value: 'disabled' },
    ],
    section: '栏目设置',
  }),
  name: field('栏目名称', 'text.short', 'text', { section: '栏目设置' }),
  code: field('栏目编码', 'text.short', 'text', { section: '栏目设置' }),
  contentType: field('内容类型', 'option.single', 'select', {
    options: [
      { label: '文章', value: 'article' },
      { label: '图集', value: 'gallery' },
    ],
    section: '栏目设置',
  }),
  manager: field('栏目管理员', 'user.single', 'directory-user', {
    section: '管理信息',
  }),
  facility: field('配套设施', 'option.multiple', 'multi-select', {
    options: [
      { label: '投影仪', value: 'projector' },
      { label: '白板', value: 'whiteboard' },
    ],
    section: '管理信息',
  }),
  openingDay: field('开放星期', 'option.single', 'select', {
    options: [
      { label: '工作日', value: 'weekday' },
      { label: '周末', value: 'weekend' },
    ],
    section: '管理信息',
  }),
};

const routeManifest = {
  schemaVersion: 'openxiangda.application-route-manifest/v3',
  appCode: 'openxiangda-application',
  devicePolicy: {
    kind: 'viewport-family',
    mobileMaxWidthPx: 900,
    desktopMinWidthPx: 901,
  },
  rootEntry: { code: 'application-root', desktop: '/', mobile: '/m/' },
  authentication: {
    desktop: { routeCode: 'application-login', path: '/login' },
    mobile: { routeCode: 'application-login-mobile', path: '/m/login' },
  },
  routes: [],
  digest:
    '88831760f6e672a77babbf039b35a6febca7852092f1579c2721c99596a265c4',
} as const;

const surface: DataResourceSurface = {
  mutationOwner: 'native',
  generated: {
    list: true,
    detail: true,
    create: true,
    update: true,
    delete: true,
  },
  fields,
  list: {
    defaultPageSize: 20,
    searchableFields: ['name', 'code'],
    filterFields: ['contentType', 'status', 'manager', 'facility', 'openingDay'],
    defaultSort: { field: 'code', order: 'asc' },
  },
  form: {
    layout: 'sections',
    fieldOrder: [
      'code',
      'name',
      'contentType',
      'description',
      'status',
      'manager',
      'facility',
      'openingDay',
    ],
  },
  detail: {
    layout: 'sections',
    fieldOrder: [
      'code',
      'name',
      'contentType',
      'description',
      'status',
      'manager',
      'facility',
      'openingDay',
    ],
  },
  mobile: { enabled: true },
};

const { enabled, displayOrder, ...remainingFields } = fields;
const fixtureMode = new URLSearchParams(location.search).get('primary') || (location.pathname.includes('/views/') ? 'named' : location.pathname.endsWith('.html') ? null : 'business');
const acceptanceSurface: DataResourceSurface = fixtureMode === 'falsy'
  ? { ...surface, fields: { enabled, displayOrder, ...remainingFields } }
  : fixtureMode === 'business' || fixtureMode === 'named'
    ? {
        ...surface,
        fields: { ...fields, name: { ...fields.name, list: true, requiredHint: true, sortable: true }, displayOrder: { ...fields.displayOrder, sortable: true } },
        list: { ...surface.list, fieldOrder: ['name', 'enabled', 'displayOrder'], filterFields: ['name', 'enabled', 'displayOrder', ...surface.list!.filterFields!], defaultPageSize: 10 },
      }
    : surface;

if (fixtureMode === 'named') acceptanceSurface.views = [
  { code: 'quick', name: '简要登记', generated: { list: true, detail: true, create: true, update: true, delete: false },
    list: { fieldOrder: ['name', 'code'], defaultPageSize: 10, searchableFields: ['name'] },
    form: { layout: 'sections', fieldOrder: ['name', 'code'] }, detail: { layout: 'sections', fieldOrder: ['name', 'code'] },
    sections: [{ title: '登记信息', fields: ['name', 'code'] }], mobile: { enabled: true } },
  { code: 'complete', name: '完整管理', generated: { list: true, detail: true, create: true, update: true, delete: true },
    list: { fieldOrder: ['name', 'enabled', 'displayOrder'], defaultPageSize: 10, searchableFields: ['name'] },
    form: { layout: 'sections', fieldOrder: ['name', 'code', 'description', 'enabled', 'displayOrder'] },
    detail: { layout: 'sections', fieldOrder: ['name', 'code', 'description', 'enabled', 'displayOrder'] },
    sections: [{ title: '栏目信息', fields: ['name', 'code', 'description'] }, { title: '管理设置', fields: ['enabled', 'displayOrder'] }],
    mobile: { enabled: true } },
];

const transferMode = new URLSearchParams(location.search).get('transfers');
if (transferMode === 'hidden' || transferMode === 'enabled') {
  const actions = { import: transferMode === 'enabled', export: transferMode === 'enabled' };
  acceptanceSurface.list = { ...acceptanceSurface.list, actions };
  if (acceptanceSurface.views) acceptanceSurface.views[0].list.actions = actions;
}
if (new URLSearchParams(location.search).get('owner') === 'readonly') {
  acceptanceSurface.mutationOwner = 'readonly';
  acceptanceSurface.generated = {list: true, detail: true, create: false, update: false, delete: false};
}

const names = [
  '内容栏目',
  '内容文章',
  '内容专题',
  '会员档案',
  '门户轮播',
  '工会小组',
  '场地预约',
  '场地不可用时段',
  '场地档案',
  '通知公告',
  '活动报名',
  '资料下载',
];
const resourceDefinitions = Object.fromEntries(
  names.map((name, index) => {
    const code = `resource-${String(index + 1).padStart(2, '0')}`;
    return [
      code,
      {
        code,
        name,
        capabilities: {
          read: `app:openxiangda-application:data:${code}:read`,
          create: `app:openxiangda-application:data:${code}:create`,
          update: `app:openxiangda-application:data:${code}:update`,
          delete: `app:openxiangda-application:data:${code}:delete`,
        },
        surface: acceptanceSurface,
      },
    ];
  })
);

function ContentOperationsPage() {
  const navigate = useNavigate();
  return (
    <OpenXiangdaAdminPage
      className="component-defaults-page"
      data-testid="custom-admin-page"
    >
      <Typography.Title level={2}>内容业务操作</Typography.Title>
      <div className="component-defaults-panel">
        自定义后台页默认组件面板
        <Button onClick={() => navigate('/resource-01')}>打开用户端</Button>
      </div>
    </OpenXiangdaAdminPage>
  );
}

function ResourcePortalPage() {
  const [open, setOpen] = useState(false);
  return <main>
    <Typography.Title level={2}>用户端内容门户</Typography.Title>
    <Input aria-label="用户端输入" />
    <Select options={[{ label: '可用选项', value: 'available' }]} style={{ width: 200 }} />
    <Button onClick={() => setOpen(true)}>打开用户弹窗</Button>
    <Modal open={open} title="用户端确认" onCancel={() => setOpen(false)} onOk={() => setOpen(false)}>
      默认组件保持可用
    </Modal>
  </main>;
}

const applicationContributions = defineApplicationContributions(
  {
    contentOperations: {
      code: 'content-operations',
      path: '/admin/operations/content',
      label: '内容业务操作',
      surface: 'admin',
      capability: 'app:openxiangda-application:operations:read',
      tabPersistence: 'session',
      keepAlive: 'none',
    },
    resourcePortal: {
      code: 'resource-portal',
      path: '/resource-01',
      label: '用户端内容门户',
      surface: 'user',
      tabPersistence: 'session',
      keepAlive: 'none',
    },
  } as const,
  {
    pages: {
      contentOperations: ContentOperationsPage,
      resourcePortal: ResourcePortalPage,
    },
    resources: {
      'resource-01': {
        toolbar: [
          {
            code: 'publish-selected',
        requiresSelection: true,
            label: '发布选中栏目',
            capability: 'app:openxiangda-application:operations:read',
            render: ({ selectedRecords }) => (
              <Button>发布选中栏目（{selectedRecords.length}）</Button>
            ),
          },
        ],
      },
    },
  },
);

const timeZone = new URLSearchParams(location.search).get('timeZone') || undefined;
if (location.pathname.endsWith('/resource-experience.e2e.html')) {
  history.replaceState({}, '', '/admin/resources/resource-01');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OpenXiangdaApplication
      appCode="openxiangda-application"
      appName="资源体验验收"
      timeZone={timeZone}
      adminNavigation={[
        {
          code: 'resources',
          label: '数据管理',
          icon: 'database',
          order: 0,
          items: [
            ...(acceptanceSurface.views || []).map((view, index) => ({
              pageCode: `resource:resource-01:view:${view.code}:list`, label: view.name, order: index - 2,
            })),
            { pageCode: 'resource:resource-01:list', label: '内容栏目', order: 0 },
            { pageCode: 'resource:resource-02:list', label: '内容文章', order: 1 },
            { pageCode: 'resource:resource-03:list', label: '内容专题', order: 2 },
            { pageCode: 'resource:resource-04:list', label: '会员档案', order: 3 },
            { pageCode: 'resource:resource-05:list', label: '门户轮播', order: 4 },
            { pageCode: 'resource:resource-06:list', label: '工会小组', order: 5 },
            { pageCode: 'resource:resource-07:list', label: '场地预约', order: 6 },
            {
              pageCode: 'resource:resource-08:list',
              label: '场地不可用时段',
              order: 7,
            },
            { pageCode: 'resource:resource-09:list', label: '场地档案', order: 8 },
            { pageCode: 'resource:resource-10:list', label: '通知公告', order: 9 },
            { pageCode: 'resource:resource-11:list', label: '活动报名', order: 10 },
            { pageCode: 'resource:resource-12:list', label: '资料下载', order: 11 },
            { pageCode: 'operation:content-operations', order: 12 },
          ],
        },
      ]}
      adminPages={[
        ...(acceptanceSurface.views || []).flatMap(view => (['list', 'detail', 'create', 'update'] as const).map(operation => ({
          code: `resource:resource-01:view:${view.code}:${operation}`,
          kind: `resource-${operation}` as const,
          path: `/admin/resources/resource-01/views/${view.code}${({ list: '', detail: '/:id', create: '/new', update: '/:id/edit' })[operation]}`,
          label: `${({ list: '', detail: '', create: '新增', update: '编辑' })[operation]}${view.name}`,
          navigationEligible: operation === 'list',
          capability: resourceDefinitions['resource-01'].capabilities[operation === 'list' || operation === 'detail' ? 'read' : operation],
          resourceCode: 'resource-01', viewCode: view.code,
        }))),
        {
          code: 'resource:resource-01:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-01',
          label: '资源 01',
          navigationEligible: true,
          capability: resourceDefinitions['resource-01'].capabilities.read,
          resourceCode: 'resource-01',
        },
        {
          code: 'resource:resource-01:detail',
          kind: 'resource-detail',
          path: '/admin/resources/resource-01/:id',
          label: '资源 01 详情',
          navigationEligible: false,
          capability: resourceDefinitions['resource-01'].capabilities.read,
          resourceCode: 'resource-01',
        },
        {
          code: 'resource:resource-01:create',
          kind: 'resource-create',
          path: '/admin/resources/resource-01/new',
          label: '新增资源 01',
          navigationEligible: false,
          capability: resourceDefinitions['resource-01'].capabilities.create,
          resourceCode: 'resource-01',
        },
        {
          code: 'resource:resource-01:update',
          kind: 'resource-update',
          path: '/admin/resources/resource-01/:id/edit',
          label: '编辑资源 01',
          navigationEligible: false,
          capability: resourceDefinitions['resource-01'].capabilities.update,
          resourceCode: 'resource-01',
        },
        {
          code: 'resource:resource-02:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-02',
          label: '内容文章',
          navigationEligible: true,
          capability: resourceDefinitions['resource-02'].capabilities.read,
          resourceCode: 'resource-02',
        },
        {
          code: 'resource:resource-03:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-03',
          label: '内容专题',
          navigationEligible: true,
          capability: resourceDefinitions['resource-03'].capabilities.read,
          resourceCode: 'resource-03',
        },
        {
          code: 'resource:resource-04:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-04',
          label: '会员档案',
          navigationEligible: true,
          capability: resourceDefinitions['resource-04'].capabilities.read,
          resourceCode: 'resource-04',
        },
        {
          code: 'resource:resource-05:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-05',
          label: '门户轮播',
          navigationEligible: true,
          capability: resourceDefinitions['resource-05'].capabilities.read,
          resourceCode: 'resource-05',
        },
        {
          code: 'resource:resource-06:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-06',
          label: '工会小组',
          navigationEligible: true,
          capability: resourceDefinitions['resource-06'].capabilities.read,
          resourceCode: 'resource-06',
        },
        {
          code: 'resource:resource-07:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-07',
          label: '场地预约',
          navigationEligible: true,
          capability: resourceDefinitions['resource-07'].capabilities.read,
          resourceCode: 'resource-07',
        },
        {
          code: 'resource:resource-08:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-08',
          label: '场地不可用时段',
          navigationEligible: true,
          capability: resourceDefinitions['resource-08'].capabilities.read,
          resourceCode: 'resource-08',
        },
        {
          code: 'resource:resource-09:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-09',
          label: '场地档案',
          navigationEligible: true,
          capability: resourceDefinitions['resource-09'].capabilities.read,
          resourceCode: 'resource-09',
        },
        {
          code: 'resource:resource-10:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-10',
          label: '通知公告',
          navigationEligible: true,
          capability: resourceDefinitions['resource-10'].capabilities.read,
          resourceCode: 'resource-10',
        },
        {
          code: 'resource:resource-11:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-11',
          label: '活动报名',
          navigationEligible: true,
          capability: resourceDefinitions['resource-11'].capabilities.read,
          resourceCode: 'resource-11',
        },
        {
          code: 'resource:resource-12:list',
          kind: 'resource-list',
          path: '/admin/resources/resource-12',
          label: '资料下载',
          navigationEligible: true,
          capability: resourceDefinitions['resource-12'].capabilities.read,
          resourceCode: 'resource-12',
        },
        {
          code: 'operation:content-operations',
          kind: 'operation',
          path: '/admin/operations/content',
          label: '内容业务操作',
          navigationEligible: true,
          capability: 'app:openxiangda-application:operations:read',
          routeCode: 'content-operations',
        },
      ]}
      contributions={applicationContributions}
      resourceDefinitions={resourceDefinitions}
      routeManifest={routeManifest}
    />
  </React.StrictMode>
);
