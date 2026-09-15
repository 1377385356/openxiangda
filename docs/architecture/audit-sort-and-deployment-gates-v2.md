# 平台审计列排序与部署 Workflow Head 预检（2026-09-15）

## 问题证据

1. `list.defaultSort.field` 在 app 配置校验中只接受同资源已声明业务字段（`APP_CONFIG_DATA_RESOURCE_SORT_FIELD_INVALID`），而平台系统列 `created_at`/`updated_at` 等是保留字段码，禁止声明为业务字段。两层规则叠加后，"标准 Admin 列表默认按真实平台创建时间倒序"无法表达；应用被迫复制一份业务 `createdAt` 字段，带来历史回填与排序不可靠问题。平台 Data API 的 `order[].field` 本身已接受全部 `PUBLIC_SYSTEM_FIELDS`（`openxiangda-native-data-api-v2.service.ts` `field()`），能力只缺声明合同与标准列表 UI。
2. deploy 提交的 `workflows.activations` 是完整 desired set，平台直接盲覆盖 `workflow2_environment_heads`，无版本比较：提交低于当前 Head 的 `definitionVersion` 会静默回退环境激活版本；`definition` 以 (workflow_code, version)+digest 不可变。`openxiangda check` 与 `deploy --dry-run` 均不拉取环境 Head 做差异预检，2026-09-15 szgh-v2 预发（v3/v3/v4）与 main 源码（v2/v1/v2）的差异因此未被任何门拦截。

## 能力归属

- 排序字段合同：`openxiangda-contracts`（系统列码表与视图校验）+ `openxiangda-devkit-core`（app 配置编译校验）+ `openxiangda`（标准 Admin 列表内置列排序）。
- Workflow Head 预检：`openxiangda-devkit-core` deploy/deployment.plan 阶段，数据源为平台 `GET /openxiangda/apps/:appCode/workflow-v2/management/definitions`（只读）。

## 稳定不变量

- 平台系统列码 `id/revision/created_by/updated_by/created_at/updated_at` 仍禁止声明为业务字段；本变更不引入第二份审计时间存储。
- `defaultSort.field` 合法取值 = 同资源已声明字段 ∪ 平台系统列码；未知字段仍编译失败。
- `searchableFields`/`filterFields` 仍只接受已声明字段（关键词搜索与筛选部件依赖字段声明）。
- 平台激活语义不变：activations 仍是完整 desired set，definition 仍按版本号+digest 不可变；预检只做提交前拦截，不改变服务端行为。

## 受影响合同

- `openxiangda-contracts`：`data-audit-access` 新增 `DATA_SYSTEM_SORT_FIELD_CODES` / `isDataSystemSortField`；`validateDataResourceViews` 的 `list.defaultSort.field` 接受系统列码。
- `openxiangda-devkit-core`：`config.ts` 资源级 defaultSort 校验、`application-model.ts` 视图 `sortableFields`/`defaultSort` 选择接受系统列码；`deploy`/`deploymentPlan` 新增 Workflow Head 预检诊断 `DEPLOY_WORKFLOW_ACTIVATION_VERSION_REGRESSION`（error）与 `DEPLOY_WORKFLOW_ACTIVATION_ABSENT`（warning）。
- `openxiangda`：标准 Admin 列表内置"创建时间/更新时间"列获得与业务列一致的受控排序，排序面板提供系统列选项；defaultSort 为系统列时直接生效。

## 失败与并发行为

- Head 预检在 deploy 构建前执行（fail fast）：出现版本回退诊断即停止，不构建不提交。预检与平台激活写入之间存在竞态窗口（他人同时激活更高版本），窗口内由平台的 desired-set 覆盖语义兜底，行为与现状一致。
- 预检接口不可达或无管理权限时，deploy 以 `WORKFLOW_HEAD_PREFLIGHT_UNAVAILABLE` error 终止——无法验证时宁可失败，不允许盲部署回退环境。

## 安全与资源边界

- 预检为一次只读分页查询（limit≤100，按 workflow 总量分页），复用现有 connected-developer 管理权限，不新增写路径。
- 系统列排序沿用平台审计列默认可读规则（`fieldPolicies` 收紧逻辑不变），不新增数据暴露面。

## 回退边界

- 三包独立回退：contracts 校验回退后，配置里的系统列 defaultSort 重新变为编译错误（fail-closed，无运行时影响）；devkit-core 预检回退后回到"无预检"现状；浏览器包回退后内置列失去排序交互，查询行为不变。

## 可证伪验证

- contracts/devkit-core 测试：`defaultSort: { field: 'created_at', order: 'desc' }` 通过资源级与视图级校验；未知字段 `nope` 仍报 `APP_CONFIG_DATA_RESOURCE_SORT_FIELD_INVALID`；`searchableFields: ['created_at']` 仍失败。
- devkit-core 测试：fake control-plane client 返回 Head v3 时，源码 activation v2 产生 error 诊断且 deploy 不进入构建；源码 v3/v4 通过；Head 有激活而源码缺 activation 产生 warning；management 查询抛错产生 `WORKFLOW_HEAD_PREFLIGHT_UNAVAILABLE`。
- `pnpm verify:affected` 全绿后按 changeset 发布。
