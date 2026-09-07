# ADR: OpenXiangda 2.0 标准后台 Contribution API

状态：Superseded（菜单 owner 已由 `admin-information-architecture-v2.md` 替换）
日期：2026-08-27
范围：`openxiangda/react`、官方应用模板与 `openxiangda-v2` 前端 Skill reference

## 问题证据

- 编译器已经把 `frontend.routes` 规范化为生成的 `appRoutes`，其合同包含稳定 code/path、菜单可见性、父路由、访问表达式和标签策略；官方模板没有导入该产物，`OpenXiangdaApplication` 也只注册资源 CRUD 与 Workflow 固定路由。因此应用声明的 operation page 不能进入统一 Shell、菜单或直接 URL 权限门禁。
- `GeneratedResourceCrud.tsx` 直接拥有新增、导入、导出、查看、编辑、删除与详情操作，没有 toolbar、row、detail 的有类型扩展槽。应用若要加入少数业务动作，只能复制标准页面或自建后台框架，破坏产品北极星的三档页面扩展模型。
- `Shell.tsx` 的菜单、历史标签和当前标题只识别资源与 Workflow。单独让应用调用 React Router 或 Ant Design Menu 会形成第二份导航事实。

## 决定与能力 owner

1. `AppFrontendRouteContract` 只拥有 operation page 的路由存在与访问；菜单 owner 已收敛到应用显式的 `frontend.admin.navigation`，详见后续 ADR。
2. `openxiangda/react` 提供 `defineAdminContributions(appRoutes, input)`。生成 routes 与应用本地 React page component 必须一一配对，统一交给 `OpenXiangdaApplication` 注册；Shell 从生成的 `adminPages/adminNavigation` 生成菜单、标题与历史。
3. 标准 CRUD 提供 `toolbar`、`row`、`detail` 三类有类型 action slot。每个 action 只声明稳定 code、label、访问表达式、顺序和 render 函数；标准 renderer 负责权限裁剪并传入当前 resource/record/refresh 上下文。
4. Shell、React Router 生命周期、current-user 角色并集与 capability 裁剪由 `openxiangda/react` 拥有；平台仍是登录、权限和 Data API 的唯一权威 owner；应用只拥有业务页面组件与业务动作 UI，不创建后台框架、权限 store、Data API client 或菜单 store。

## 稳定不变量

- UI 裁剪不能授予权限。Data API 与 App API 必须在服务端独立授权；应用 contribution 不能覆盖 Shell 的 current-user/capability provider。
- route component 是随不可变应用前端制品构建的本地代码；平台不下发组件或可执行代码。
- generated route 与 page component 一一对应。缺页、额外页、重复 code/path、非 admin surface、悬空/循环 parent 在开发或渲染前 fail closed。
- operation page 固定在 `/admin/operations` 命名空间；带参数 route 只能 hidden，避免与资源 CRUD、Workflow、文件预览或不可解析菜单链接冲突。
- route 的直接 URL 与菜单使用同一访问判定；子 route 同时受全部祖先约束。隐藏菜单不表示允许绕过页面门禁。
- slots 只扩展标准页面的动作区域，不接管列表查询、分页、字段权限、保存、revision 或记录生命周期。
- 当前用户继续使用其完整应用角色并集；Perspective 只影响读取投影，不改变 access 判定。

## 公共合同

```tsx
const adminContributions = defineAdminContributions(appRoutes, {
  pages: {
    instrumentCalibration: InstrumentCalibrationPage,
  },
  resources: {
    instruments: {
      toolbar: [calibrationBatchAction],
      row: [calibrateInstrumentAction],
      detail: [calibrationHistoryAction],
    },
  },
});

<OpenXiangdaApplication contributions={adminContributions} />
```

`pages` 的键集合必须与生成的 `appRoutes` 完全相同。action access 复用 `capability` 或 `access.allOf/anyOf`；不接受角色名判断。route page 自动处于统一 Shell 内，应用 page 不嵌套 Shell。

## 失败、并发与资源边界

- 定义错误同步抛出稳定的 `OPENXIANGDA_ADMIN_CONTRIBUTIONS_INVALID:*`，不静默丢弃或退回无权限页面。
- route/access 只读取当前 Runtime provider；身份加载失败时 RuntimeBoundary 先 fail closed。身份刷新后的 React 重渲染重新计算菜单、路由与 slots，不保存权限结果。
- 最多消费编译器已有上限 500 条 route；每个 resource 的每类 action 最多 50 项，code 唯一，order 必须为有限整数。渲染层不创建新的常驻缓存或后台请求。
- action 的 `refresh()` 只触发当前标准 query 的受控 refetch；重复点击、幂等、revision 与副作用仍由对应 Data/App API 合同负责。

## 安全边界

- capability/access 是 UI 体验门禁，不是授权凭据；render context 不暴露 token、RoleSession、平台地址或任意权限写入能力。
- page path 只能来自已经编译验证的生成 route；不接受运行时远程 URL、HTML 或动态 module specifier。
- record slot 只收到当前 Data API 已授权返回的记录；字段仍按平台字段策略裁剪。应用不得借 slot 拉取全量数据或绕过标准 provider。

## 回滚与 blast radius

该变更只增加 `openxiangda/react` props/API，并让空模板显式装配空 generated routes；无平台数据、数据库或服务端迁移。旧应用不传 `contributions` 时行为不变。可单独回滚公开包与模板提交，不影响 1.x、Workflow/Notification 实现或已发布 AppVersion 数据。

## 可证伪验证

1. generated routes 缺 page、额外 page、重复 path、非 admin surface、悬空/循环 parent 时定义失败；route/action 数量越界失败。
2. capability、allOf、anyOf 与祖先访问在菜单和直接 URL 使用同一纯函数；拒绝项不会调用 render。
3. operation page 由 `OpenXiangdaApplication` 注册并自动嵌入同一个 Shell；模板显式传入由 `appRoutes` 定义的 contributions。
4. toolbar/row/detail slot 获得正确 resource、record 与 refresh context；无权限 action 不渲染。
5. `openxiangda/react` 真实 exports、类型检查、包测试、模板 check/test/build、Skill/reference 门禁同步通过。

## 明确不在本轮

- 不修改平台 Shell 服务端、Data API、权限 evaluator、Workflow 或 Notification。
- 不提供远程插件市场、动态 JS、应用自建 layout/menu/auth provider。
- 不增加新的页面 schema；表单/布局扩展继续使用现有 Resource Surface，复杂 operation page 使用本 API 的本地 React component。
