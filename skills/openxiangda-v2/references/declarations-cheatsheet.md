# 声明速查：一次写对 openxiangda.config.ts {#cheatsheet}

按"错误码 → 规则 → 正确片段"组织。这些规则全部来自真实返工：先扫一遍本页，再写声明，能省掉绝大多数首轮校验迭代。普通 CRUD 的完整可过检骨架见文末。

## 模块与 CRUD 视图

| 规则 | 正确写法 |
| --- | --- |
| `crud[].model` 必须引用本模块已声明的模型 | `crud: [{ model: 'repair-requests', ... }]` |
| `user: true` 一行声明即可生成用户端标准面（“我的记录”列表 + 提交表单，双端），并自动成为登录落地页 | `crud: [{ model: 'supply-requests', user: true, ... }]`；多资源时 `user: { home: true }` 指定落地资源，“仅本人”是展示过滤，行级隔离仍用 dataPolicies |
| 视图 `list`/`form`/`detail` 的 `model` 可省略（继承视图模型）；显式声明时必须与 `crud[].model` 一致 | `list: { fields: [...] }` 即可，不必写 `model` |
| 每个模型最多 20 个命名视图；命名视图需要稳定 `code` + `name` | `crud: [{ model: 'x', code: 'x-active', name: '进行中', ... }]` |
| 新建视图的 `form.fields` 必须覆盖全部无默认必填字段，或显式 `generated.create: false` | 检查器会列出缺失字段 |
| Workflow 详情接管的资源路由用模型级 `detailRouteCode` 表达（desktop/mobile 各引用一条 user surface 路由） | `defineDataModel({ code: 'x', detailRouteCode: { desktop: 'x-detail', mobile: 'x-detail-mobile' }, ... })` |
| 迁移工具/验收脚本需要看模块投影结果时，用公共出口的 `materializeApplicationModules`，不要引用 devkit 的 dist 文件路径 | `import { defineApplicationModule, materializeApplicationModules } from 'openxiangda/config';` → `const { resources } = materializeApplicationModules([module])` |
| system 字段（服务端赋值）可以进入查询与分组类选择（filterFields/searchableFields/sortableFields/defaultSort/sections.fields），不可进入展示与可写选择（list/form/detail.fields） | `filterFields: ['campaignId']`（system 外键筛选合法）；hidden 字段任何选择都拒绝 |
| 平台审计列（created_at/updated_at/created_by/updated_by/id/revision）可直接作 `defaultSort`/`sortableFields`，无需声明；不可进入 filterFields/searchableFields/展示/可写选择 | `defaultSort: { field: 'created_at', order: 'desc' }`（按真实创建时间倒序，勿复制业务时间字段） |

## 字段声明

| 规则 | 正确片段 |
| --- | --- |
| `option.*` 字段的值是 `{ label, value }` 快照（比较键是 `value`） | `options: [{ label: '教学设备', value: 'teaching' }]` |
| `number.integer` 可省略精度；只允许 `precision`（位数），不允许 `scale` | `{ code: 'qty', type: 'number.integer' }` |
| `number.decimal` 的 `precision` 必填、`scale` 0 到 precision | `{ type: 'number.decimal', precision: 12, scale: 2 }` |
| `audit.read` 可写 `true`（绑定本资源读能力）或能力数组 | `audit: { read: true }` |
| `resource-ref.*` 必须带 `source` 来源协议 | `{ type: 'resource-ref.single', source: { kind: 'resource', resourceCode: 'repair-requests', labelField: 'title', searchFields: ['title'], pageSize: 20, loadMode: 'search' } }` |
| `labelField` 必须指向目标资源的 `text.short` / `text.long` 字段 | 不要用流水号/选项字段当 label |
| 列表可排序列用视图级 `sortableFields` 表达（`defaultSort.field` 隐式可排序）；平台审计列（如 `created_at`）同样合法 | `list: { sortableFields: ['capacity'], defaultSort: { field: 'name', order: 'asc' } }`；`defaultSort: { field: 'created_at', order: 'desc' }` |
| 每个字段都必须带中文/业务 `label`（含子表外键与排序字段） | `{ code: 'requestId', type: 'uuid', label: '所属申请', required: true }` |
| 子表 `subtable` 的外键是子资源的 **uuid** 字段，排序字段是**可写 number.integer** | 子资源：`{ code: 'requestId', type: 'uuid', required: true }` + `{ code: 'sortOrder', type: 'number.integer', required: true }`；父表：`subtable: { resourceCode: 'repair-items', foreignKey: 'requestId', orderField: 'sortOrder', maxRows: 20 }` |
| 图片/附件的 `file` 限定数量与大小 | `file: { maxCount: 3, maxSizeMb: 10, accept: ['image/png', 'image/jpeg'] }` |

## 权限声明

| 规则 | 正确片段 |
| --- | --- |
| 平台保留能力（如 `app:<app>:directory:read`）**不能**在 `capabilities` 里重复声明，直接在角色中引用即可 | `const directoryRead = \`app:\${APP_CODE}:directory:read\`` → `roles: [{ code: 'admin', capabilities: [directoryRead] }]` |
| 资源 CRUD 能力码用 `resourceCapabilityCodes(appCode, resourceCode)` 生成 | `const crud = resourceCapabilityCodes(APP_CODE, 'repair-requests')` → `capabilities: [crud.read, crud.create]` |
| `authenticatedUserRoleCode` 是平台登录用户的基线角色 | `authz: { authenticatedUserRoleCode: 'app-user', ... }` |

## 后端操作（Nest）

| 规则 | 正确片段 |
| --- | --- |
| 写操作的 `ai.sideEffects` 至少一条具体副作用 | `ai: { name: '受理派单', ..., risk: 'write', sideEffects: ['更新报修单状态为处理中', '写入一条派工记录'] }` |
| GET 操作的 `ai.risk` 只能是 `read`；写操作不能是 `read` | `risk: 'read'` ↔ `method: 'GET'` |
| controller 路由必须绑定 `@OpenXiangdaOperation(appOperations.<code>)`，普通 CRUD 不写 controller | check 门禁会拒绝未绑定路由 |
| 事务守卫 `errorCode` 必须匹配 `^OPENXIANGDA_[A-Z0-9_]{1,96}$` | `errorCode: 'OPENXIANGDA_REPAIR_REQUEST_NOT_PENDING'` |

## 事务写入快照字段

option / user / department / resource-ref 字段在事务和普通写入里都必须写快照对象，不能写裸字符串：

```ts
import { optionSnapshot, userSnapshot, resourceSnapshot } from 'openxiangda/nest';

await this.data.transaction(idempotentTransaction(input.idempotencyKey, [
  {
    operation: 'update',
    resourceCode: 'repair-requests',
    id: input.requestId,
    expectedRevision: revision,
    data: {
      status: optionSnapshot('处理中', 'processing'),      // 不是 'processing'
      assignedTechnician: userSnapshot(input.technicianId), // 不是裸 userId
    },
  },
  {
    operation: 'create',
    resourceCode: 'repair-assignments',
    data: {
      requestId: resourceSnapshot('repair-requests', input.requestId, requestTitle),
      technician: userSnapshot(input.technicianId),
    },
  },
]));
```

读取时状态判断用 `record.data.status?.value === 'pending'`（存储值是快照对象）。

## 幂等冲突复核模式

update 事务必须携带 `expectedRevision`；重试时 revision 已前进会让同一幂等键的内容指纹漂移，平台返回 409 `OPENXIANGDA_NATIVE_DATA_IDEMPOTENCY_CONFLICT`（而非 `replayed: true`）。标准处理：

```ts
import { isIdempotencyConflict } from 'openxiangda/nest';

try {
  result = await this.data.transaction(idempotentTransaction(key, operations, guards));
} catch (error) {
  if (isIdempotencyConflict(error)) {
    const current = await this.data.get('repair-requests', input.requestId);
    if (/* 状态已离开 pending，说明本键的效果已生效 */) {
      return { idempotencyKey: key, replayed: true, ... 当前状态 };
    }
  }
  throw error;
}
```

不要用新生成的幂等键重试冲突——那会绕过幂等保护重复执行业务动作。

## 两模型起步骨架（可直接改造）

```ts
import {
  adminNavigationGroup, adminResourcePage, defineAdminNavigation,
  defineApplicationModule, defineOpenXiangdaApp, resourceCapabilityCodes,
} from 'openxiangda/config';

const APP_CODE = 'my-app';
const requestCrud = resourceCapabilityCodes(APP_CODE, 'requests');

const requests = {
  code: 'requests', name: '申请单',
  audit: { read: true },
  fields: [
    { code: 'title', type: 'text.short', label: '标题', required: true },
    { code: 'category', type: 'option.single', label: '类别', required: true,
      options: [{ label: '普通', value: 'normal' }, { label: '紧急', value: 'urgent' }] },
    { code: 'status', type: 'option.single', label: '状态', required: true,
      options: [{ label: '待受理', value: 'pending' }, { label: '已完成', value: 'done' }] },
    { code: 'photo', type: 'image', label: '照片', file: { maxCount: 3, maxSizeMb: 10 } },
  ],
};
const items = {
  code: 'request-items', name: '明细',
  fields: [
    // 所有字段（含子表外键/排序）都必须声明中文 label。
    { code: 'requestId', type: 'uuid', label: '所属申请', required: true },
    { code: 'sortOrder', type: 'number.integer', label: '排序', required: true },
    { code: 'name', type: 'text.short', label: '名称', required: true },
    { code: 'qty', type: 'number.integer', label: '数量' },
    { code: 'price', type: 'number.decimal', label: '单价', precision: 12, scale: 2 },
  ],
};

export default defineOpenXiangdaApp({
  app: { code: APP_CODE, name: '我的应用' },
  frontend: {
    root: 'apps/web',
    devicePolicy: { kind: 'viewport-family', mobileMaxWidthPx: 900, desktopMinWidthPx: 901 },
    routes: [
      { code: 'application-home', path: '/home', label: '应用首页', surface: 'user' },
      { code: 'application-home-mobile', path: '/m/home', label: '移动首页', surface: 'user' },
    ],
    authentication: {
      accountMode: 'existing-platform-users-only',
      registration: { mode: 'reject' },
      methods: [{ code: 'password', type: 'password', label: '账号密码登录', presentation: 'primary', required: true }],
      surfaces: {
        desktop: { routeCode: 'application-login', path: '/login', defaultRouteCode: 'application-home' },
        mobile: { routeCode: 'application-login-mobile', path: '/m/login', defaultRouteCode: 'application-home-mobile' },
      },
    },
    admin: {
      navigation: defineAdminNavigation([
        adminNavigationGroup('main', '业务管理', [adminResourcePage('requests', { label: '申请单' })], { icon: 'database', order: 100 }),
      ]),
    },
  },
  modules: [defineApplicationModule({
    code: 'main',
    models: [requests, items],
    crud: [
      {
        model: 'requests',
        list: {
          fields: ['title', 'category', 'status'],
          filterFields: ['category', 'status'],
          searchableFields: ['title'],
          defaultPageSize: 20,
          defaultSort: { field: 'title', order: 'asc' },
        },
        mobile: { enabled: true },
      },
    ],
  })],
  authz: {
    authenticatedUserRoleCode: 'app-user',
    capabilities: [],
    roles: [
      { code: 'app-user', name: '应用用户', capabilities: [requestCrud.read, requestCrud.create] },
      { code: 'admin', name: '管理员', capabilities: [requestCrud.read, requestCrud.create, requestCrud.update, requestCrud.delete] },
    ],
    scopeDimensions: [], scopeSources: [], dataPolicies: [], authorizationTransitions: [],
  },
});
```

`request-items` 不出现在 `crud` 里：子表行随 `requests` 表单的 `subtable` 字段写入（在 `requests.fields` 里补 `{ code: 'items', type: 'subtable', subtable: { resourceCode: 'request-items', foreignKey: 'requestId', orderField: 'sortOrder', maxRows: 20 } }`）。

## 图片上传的像素上限

image/signature/富文本图片字段在上传计划（initiate）里返回 `maxPixels`；超过上限的图片会被标准组件自动压缩后重新发起上传。用 API 直传时自行按 `maxPixels` 预检。当前平台上限覆盖主流手机主摄（48/50/64MP）；超出会得到带实际尺寸的 `OPENXIANGDA_NATIVE_DATA_IMAGE_PIXEL_LIMIT_EXCEEDED` 错误。
