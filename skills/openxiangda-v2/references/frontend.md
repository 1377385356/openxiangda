# 前端架构

状态：Vite/Refine 已成为 OpenXiangda 2.0 唯一默认前端栈。决策与实测见
[核心架构](concepts.md)。

## 默认技术栈

- Vite 7：开发服务器与生产构建，只监听 `127.0.0.1`；
- React 19 + React Router：普通应用路由；
- Refine Core：资源查询、分页、排序和 mutation 状态；
- Ant Design 6：B 端页面组件。

不维护 Umi/Pro 双栈，也不在新模板中依赖已退休的前端框架包或旧身份 Provider。

## 数据和权限

`modules/` 中的业务模型由编译器派生 DataResource 契约，`openxiangda.config.ts` 声明页面
capability、应用角色和数据策略。前端只根据当前登录用户完整应用角色并集的
`capabilityCodes` 隐藏页面、按钮和只读字段；这些只是展示保护，平台 Data API
每次请求仍按同一角色并集做权威的行、字段和操作授权。

自定义角色管理页只调用 `openxiangda/core` 的角色管理 SDK。目录搜索使用
`searchRoleManagementUsers`，页面按钮按 `loadRoleManagementCatalog()` 返回的
`roleManagement` 投影显示，但前端显示不能替代服务端复核。不要在应用中复制角色表、
权限表或通过 NestJS 转发开发者凭据。

列表查询必须使用服务端过滤、排序和分页；新增、读取、更新、删除和文件上传都经过
可替换 Data API adapter。不要调用自定义 Nest CRUD、Function 或 Workflow 来绕过
Data API。只有真正需要事务或外部系统的动作才使用同源 `/api`。

默认仪器模块有 30 个字段，其中 `id/revision` 是 Data API 系统字段，28 个业务
字段由资源声明。新增、编辑和详情共用同一份字段元数据。五个边界字段使用五个独立
capability，不使用角色名或影子字段判断。

字段策略用 `create` / `update` 分别声明能力；显式空数组表示拒绝。学校管理员通过
`unrestrictedRoleCodes` 跳过行谓词，但仍受资源和字段能力
约束；学院管理员创建时可填写五个边界字段，更新时禁止修改 `collegeId`；仪器管理员
更新时禁止修改这五个字段。表单提交必须从 payload 删除无权字段。

DataQuery 使用有界 where 条件树，支持 and/or/not。标准列表的筛选、关键词、分页和导出共用已声明字段与同一查询条件，不在页面重写查询协议。

## 标准后台扩展

默认 CRUD、统一 Shell、current-user 权限和 Data Provider 都由 `openxiangda/react`
维护；应用拥有后台信息架构声明。页面实现、路由可达、菜单可见是三个不同合同：

- `resource.generated` 与 `frontend.routes` 决定有哪些标准页或 operation route；
- 编译器把全部可达页生成到 `adminPages`，detail/new/edit/handoff 可以存在但默认不进菜单；
- `frontend.admin.navigation` 是菜单的唯一权威声明，Shell 只渲染其中引用的页面，最后再按
  current-user 权限过滤。权限不能发现或创建菜单项。

生成式资源后台固定使用 `/admin/resources/<resourceCode>` 命名空间，detail、create、
update 分别追加 `/:id`、`/new`、`/:id/edit`；独立移动后台面使用同一编译目录投影出的
`/m/admin/resources/<resourceCode>...`。所有桌面生成页由平台放进唯一 `Shell`，页面内部
跳转也只消费生成路径。普通 `/activities`、`/m/activities` 等产品路径留给 `user`
route。显式 route 与任何平台生成 route 的路径形状冲突时编译失败；即使动态参数名不同，
例如 `/:id` 与 `/:recordId`，也视为同一路径。不要添加旧根路径别名、重定向或通过注册顺序
解决冲突。

使用 typed helper 声明业务分组、用户名称、顺序、图标与页面引用，不维护 raw JSON：

```ts
import {
  adminNavigationGroup,
  adminOperationPage,
  adminResourcePage,
  defineAdminNavigation,
  defineOpenXiangdaApp,
} from 'openxiangda/config';

export default defineOpenXiangdaApp({
  // ...
  frontend: {
    root: 'apps/web',
    routes: [{
      code: 'instrument-import',
      path: '/admin/operations/instrument-import',
      label: '仪器导入',
      surface: 'admin',
    }],
    user: { applicationTodoCenter: true },
    admin: {
      access: { anyOf: ['app:example:admin:view'] },
      navigation: defineAdminNavigation([
        adminNavigationGroup('instrument-center', '仪器管理', [
          adminResourcePage('instruments'),
          adminOperationPage('instrument-import'),
        ], { icon: 'database', order: 100 }),
      ]),
    },
  },
});
```

AI 先读取 `openxiangda://workspace/contracts` 的有界索引，再调用
`contract_describe` 并传入 `{ "selector": "navigation" }`，从 `data.selection.adminNavigationAuthoring.suggestion` 取得确定性的首次建议：
`proposal` 是有界机器可读声明，`imports` 是 `openxiangda/config` 的 typed helper，
`expression` 可一次性写入
`frontend.admin.navigation`，然后由应用正常编辑。该结果明确标记
`applyMode: "copy-once"` 和 `automaticRuntimeDiscovery: false`；compiler 和 runtime
从不调用建议器，也不会在以后新增内部资源时偷偷扩展生产菜单。直接使用 compiler API 的
tooling 也可调用 `renderAdminNavigationSuggestion(config)` 获得同一 proposal。

用 `defineApplicationContributions` 将每个生成的 `appRoutes` route 精确绑定到一个本地
React page。`admin` page 由 runtime 放入唯一的 `Shell`，component 不再次嵌套；`user`
page 不套 admin Shell，可独立实现移动/用户端布局，但仍共享当前用户、权限和 Router：

```tsx
import {
  defineApplicationContributions,
  OpenXiangdaApplication,
} from 'openxiangda/react';
import {
  adminNavigation,
  adminAccess,
  adminPages,
  appRoutes,
  routeManifest,
} from '@app/contracts/generated';
import { InstrumentCalibrationPage } from './operations/InstrumentCalibrationPage';

const contributions = defineApplicationContributions(appRoutes, {
  pages: {
    instrumentCalibration: InstrumentCalibrationPage,
  },
});

<OpenXiangdaApplication
  adminNavigation={adminNavigation}
  adminAccess={adminAccess}
  adminPages={adminPages}
  routeManifest={routeManifest}
  contributions={contributions}
/>;
```

`pages` 的键必须与生成的 `appRoutes` 完全一致。隐藏 route 仍执行同一 `capability` 或
`access.allOf/anyOf`，子 route 同时继承全部祖先约束。页面代码随应用不可变前端制品构建，
不能从平台下载 component/module URL。admin operation page 固定使用
`/admin/operations` 或其子路径；带参数 route 只可直接访问，不能被导航引用。
`defineAdminContributions` 是保留的 admin-only helper，会主动拒绝 `user` routes。

应用登录使用可选 `frontend.authentication` 声明：仅允许现有平台用户、拒绝注册，桌面
固定 `/login`、移动固定 `/m/login`，并分别引用同设备的静态 user 默认 route。登录面由
编译器生成到独立 `authenticationSurfaces`，不进入受保护 `appRoutes`。应用通过
`defineApplicationContributions({ routes: appRoutes, authenticationSurfaces },
{ pages, authentication })` 绑定独立 PC/移动 renderer；renderer 只拥有品牌视觉和本地
展示状态，并调用 `ApplicationLoginSurfaceProps` 的平台回调。密码、租户 provider、一次性
OAuth state/callback、Secure HttpOnly 会话与 refresh family、当前身份和 AuthZ 始终由平台
唯一持有。禁止调用 v1 auth API、在浏览器保存 Token、把登录页塞入受保护路由或创建第二
Router/identity provider。生成的 `platformAuthManifest` 是独立登录 QA 清单，不改变用户路由
覆盖数。

## 匿名公开用户页

没有平台账号的外部用户不进入应用登录或角色并集。此类页面使用专门的
[`frontend.publicAccess` 匿名公开访问合同](public-access.md)，由平台生成 HttpOnly 浏览器凭证，
并通过 `createAnonymousPublicClient` 提供草稿、附件、具名重复校验、幂等提交和同一浏览器的
本人列表/详情。不要创建 guest 账号、公开一般 Data API、保存本地身份或使用 IP/指纹判断所有权。

这也是完整应用的一等组合边界：`OpenXiangdaApplication` 始终唯一持有
`BrowserRouter`、`RuntimeBoundary`、Refine、generated resource/workflow routes
和后台 `Shell`。应用不要把它包在第二个 Router/Shell 中。桌面/移动用户端可以绑定不同
组件并拥有各自布局，但仍共享同一个 runtime identity 和 capability ancestor guard。

通用应用级待办中心通过用户 Surface 声明开启：

```ts
frontend: {
  user: { applicationTodoCenter: true },
  // ...
}
```

编译器生成 `/todos` 和 `/m/todos`。页面只读取当前登录用户的
Notification Hub 收件人投影；不调用 management API，不复制消息状态库。桌面端使用
无常驻详情的全宽列表，移动端使用独立卡片列表；`查看详情` 统一进入平台解析后的
Workflow/custom application route。

编译器同时生成必填的 `routeManifest`。它是 Workflow/Todo 标准页的唯一桌面/移动成对路由来源，
每个 entry 都携带稳定 `routeCode`、参数名、访问能力和 `requiresAuthentication: true`，顶层
`digest` 绑定完整 catalog。模板把该产物直接传给 `OpenXiangdaApplication`；runtime 在注册
Router 和页面前校验成对 user surface、参数与访问元数据。应用不得重新声明 `/todos`、
`/m/todos` 或标准 Workflow 路径，也不得添加别名、重定向或第二份
路由状态。digest 的计算与合同校验由 compiler/platform preflight 负责，浏览器只接受有效格式并
fail-closed 校验 entry/pair 元数据。

标准 Workflow 详情页直接渲染 Surface 的 `presentation.businessDetail`、`summary`、
typed timeline 和 operation descriptors。业务字段继续使用平台 `SurfaceFieldValue` 语义；
父子表、附件、富文本图片和签名不由应用另写 renderer 或拼接 Data API 文件 URL。
PC canonical 路径为 `/tasks/:taskId` 和 `/workflows/:instanceId`，使用独立全屏页面而不进入
后台 Shell；旧 admin 详情路径不存在。桌面和移动使用独立
renderer，但共享同一授权与命令生命周期。主决策操作固定在底部，
低频操作统一进入“更多操作”；意见输入延迟到动作确认层，页面不常驻空白意见表单。
页面只显示非系统业务字段与节点内操作，不展示 UUID、revision、事件序列或技术信息区；
`stale` 不产生常驻提示，真实命令冲突才显示刷新提示。
应用只有在业务交互确实不能由标准页表达时才声明成对的 custom detail route。

标准流程提交使用浏览器客户端的 `loadBusinessProcessReceipt(commandId)` 和
`pollBusinessProcessCommand(commandId, afterRevision)`（Nest 使用对应的
`OpenXiangdaBusinessProcessService.receipt/poll`）。首个回执可能是 `accepted`；按
`nextPoll` 继续读取直到 `terminal`，再消费 typed command/surface。不要把 accepted 当作提交失败，
也不要对平台端点发起未类型化的 `fetch`。

从列表重新进入业务详情、尚未收到流程投影时，用
`listBusinessProcessCommands({ resourceCode, recordId, workflowCode, operationCode })`
查找原命令。环境由当前平台入口提供，只返回当前用户原本可读的命令。默认 20 条，
`pageSize` 最大 50；用返回的 `nextCursor` 作为下一页的 `beforeCommandId`。
结果按创建时间和 ID 倒序排列，不自动认定最新一条就是本次提交；按业务约束确认
原命令后继续原 receipt/poll/surface。同一记录可能有多次流程，不能任意取首条，
也不能为恢复 ID 再创建一次流程。此能力需要 `business-process.durable-command` 1.1.0，
新包通过现有发布前检查核对平台版本。拥有业务记录读取权限不代表拥有他人的流程命令权限。

资源用 `mutationOwner: 'native' | 'action' | 'readonly' | 'workflow'` 声明 mutation owner，
并可用 `generated.list/detail/create/update/delete` 精确选择标准 surface。非 Native owner
不能生成或向应用角色授予 Native mutation；零可写业务字段不能开放 create/update。
Workflow definition 用 `launch.mode` 声明 `standalone`、`custom-page`、`hidden-handoff` 或
`work-center-only`；只有 `standalone` 可进入菜单，`hidden-handoff` 保留同一标准 PC/移动路由
但不进菜单。缺省 submission 使用 compiler 生成的标准 process operation。action-owned 资源
则在 `standalone`/`hidden-handoff` 上声明 `submission.kind: 'named-operation'`，把 create/existing
表单字段、平台幂等键、当前用户、subject id/revision 和响应结果显式绑定到原 named operation。
标准页仍使用 generated field components，但最终由应用服务端完成业务校验、原子写入并决定
是否返回 durable process command；缺少或返回 null command 表示本次无需审批。浏览器不提供
save callback，也不直接调用 prepare/start。`custom-page` 仍只能由 verified Named Action 注入
`OpenXiangdaBusinessProcessService` 发起。

标准资源页提供 `toolbar`、`row`、`detail` 三类 action slot。slot 声明稳定 code、label、
可选 order 和 capability/access，render 只获得当前 resource、已授权 record/selection 与
受控 `refresh()`：

```tsx
const contributions = defineApplicationContributions(appRoutes, {
  pages: { instrumentCalibration: InstrumentCalibrationPage },
  resources: {
    instruments: {
      row: [{
        code: 'calibrate',
        label: '校准',
        capability: 'instrument.calibration.run',
        render: ({ record, refresh }) => (
          <CalibrationButton recordId={String(record.id)} onDone={refresh} />
        ),
      }],
    },
  },
});
```

slot 只扩展动作区域，不接管查询、字段策略、revision、保存或审计。跨资源事务、外部副作用
和业务不变量仍调用有 `@OpenXiangdaOperation` 门禁的 Nest App Operation；普通 CRUD 继续
直接使用 Native Data API。UI 隐藏不是服务端授权。

学院是应用自有 `colleges` Native Resource，仪器 `collegeId` 保存该资源的系统 UUID。
人员和部门选择器调用平台 Directory 的分页 search，并用 exact resolve 恢复已选 ID；学院
选择器调用 membership-bound scope-values search/resolve。空结果和错误直接展示，不回退
静态人员、部门或学院。组织部门与学院属于不同 owner，不能互相推断。

发布态 app/environment 只读取平台为每个 index 注入的
`openxiangda-runtime-base`、`openxiangda-app-code` 和
`openxiangda-environment` meta；不得使用 Vite 构建变量或手填环境覆盖它。
当前用户使用同源 `openxiangda.runtime-authorization/v2` 合同，每个 Data API query/body
都显式携带 environmentKey。标准客户端读取当前用户角色并集，不保存 Token，也不持久化
授权结果。该角色并集合同未部署的平台版本
必须在应用写入前 fail closed。

## 本地与浏览器门禁

```bash
openxiangda dev
pnpm --filter @app/web check
pnpm --filter @app/web test
pnpm --filter @app/web test:e2e
pnpm --filter @app/web build
```

测试必须真实断言 Vite LAN 不可达、production 警示 DOM 常驻、Data/Directory/App API
使用同一当前用户角色并集、Perspective 读取投影协议，并约束源码文件数、LOC、构建
体积和 gzip 体积。
