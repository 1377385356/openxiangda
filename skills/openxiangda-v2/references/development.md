# 需求与开发流程

先确认用户要完成的任务，再选择数据模型、页面和权限。使用项目锁定的 `pnpm openxiangda`，读取 `context --json` 与相关专题。现有项目的代码和实时契约优先于其他项目的样例。

## 新应用先完成设计基线

从模糊想法开始时，按[对话发现与产品设计](product-design.md)分析已有资料、提出可解释的模块建议，用少量自然语言问题持续沟通确认。完整首发范围的 PRD、旅程、页面交互、原型、权限和架构设计齐备后，再制定实施计划和编写业务实现。用户已给出完整材料时先核对矛盾和遗漏，不重复访谈；已有确认持续有效。

## 根据任务决定工作量 {#risk}

| 变化 | 需要明确的内容 | 验证 |
| --- | --- | --- |
| 格式、无行为重构 | 保留现有行为，无需创建需求记录 | 受影响静态检查和现有测试 |
| 文案、字段展示、局部规则 | 业务含义、影响页面和预期结果 | 对应数据和交互 |
| 跨模型、权限、状态变化 | 用户角色、正反场景、数据和恢复边界 | 真实角色、API 和浏览器 |
| 身份、迁移、并发、外部副作用 | 所有者、失败与幂等、资源边界、回滚和架构决定 | 所涉及契约的专项验证 |

技术命名、可逆布局等在已有要求内决定。新的业务含义、权限扩大或尚未授权的外部操作需要用户决定；已经明确授权的范围不重复询问。用户只要求分析时，不自动创建应用或发布。

## 选择平台能力 {#capabilities}

- 普通数据管理：通过 `defineDataModel`、`defineApplicationModule` 和显式 CRUD 视图声明；模型不自动生成菜单或写权限。
- 界面工作先按[OpenDesign 工作流](design-workflow.md)形成具体设计；设备范围按真实任务选择。复用平台导航和字段行为，自定义报表/工具使用 admin 页面与显式导航。详见[页面归属](frontend.md#surface-selection)。
- 用户页面按实际旅程选择独立 PC/移动布局，手机端只覆盖已确认的用户任务。
- 图表等专业交互先检查已有依赖，再评估成熟组件或开源库；报表优先评估 ECharts，记录选型理由和加载/销毁边界。详见[组件选型](frontend.md#component-selection)。
- 无平台账号的外部表单：使用[匿名公开访问](public-access.md)，不用普通 RBAC 角色冒充匿名主体。
- 标准审批、待办与通知：按需声明平台能力，见[工作流](workflow-events.md)。
- 真实事务或外部集成：使用[按需后端](backend.md)，不为每张表重写 CRUD 控制器。

### 判定是否真的需要 Nest 后端 {#backend-decision}

想写后端接口时，先按顺序核对平台已有的声明式答案；命中前几行的需求不得启用 Nest。
普通数据增删改查永远由浏览器直接调用平台 Data API 或标准 CRUD 页面完成，
应用 controller 不做记录列表、详情、新增、编辑、删除的转发。

| 你以为需要写后端 | 平台已有的声明式答案 | 参考 |
| --- | --- | --- |
| 列表、筛选、排序、分页接口 | `createNativeResourceClient` 的 `list`，服务端条件树与分页 | [前端数据访问](frontend.md#data-access) |
| 新增 / 编辑 / 删除接口 | 标准 CRUD 页面，或同一客户端的 `create` / `update` / `remove`（`expectedRevision` 乐观锁） | [前端数据访问](frontend.md#data-access) |
| 提交防重、幂等重试 | `transactNativeData` / 事务请求自带 `idempotencyKey` 幂等回执 | [前端数据访问](frontend.md#data-access)、[按需后端](backend.md#business-action) |
| 时间窗、状态前置、指定人角色校验 | 平台事务守卫：`operation-time`、`record-assert`、`record-exists`、`role-member` | [按需后端](backend.md#business-action) |
| 统计报表数据 | Data API 服务端聚合 `batchAggregateNativeResources`（单个指标也用它），前端不拉全量求和 | [前端](frontend.md#component-selection) |
| 导入 / 导出 | 标准 CRUD 的 `import` / `export` 动作声明 | [业务模块](application-foundation.md) |
| 跨模型原子写、外部 API、硬件或第三方推送 | Nest 具名 operation + 平台事务，必要时事务内 `emitEvent` | [按需后端](backend.md) |

启用 Nest 的唯一充分条件是：真实外部副作用，或现有守卫无法声明的跨资源业务不变量，
且该动作已作为 operation 声明能力（`kind: 'backend'`）并由角色显式引用。
"需要一点校验""需要默认值""需要联动查询"不是启用理由；校验优先字段规则与事务守卫，
默认值优先服务端字段责任，联动查询优先 Data API 条件树。

## 实施与交接 {#iteration}

开发使用 `pnpm openxiangda dev`，过程中运行必要的聚焦测试。交接前按[检查与验收](testing.md)验证；授权发布后按[交付](delivery.md)部署。失败保留错误码、位置和原始候选，依据平台恢复指令继续。

[AppSpec](appspec.md)保存业务意图、设计与交付记录，不复制字段 Schema、生成契约和部署状态。新应用维护具体设计和评审，复杂度随业务展开；既有小变更沿用有效设计，仅修订受影响记录，无行为变化可引用已有记录。每轮先读取当前规则、澄清业务、评估架构、权限和性能，随后实施与验证，发布后更新当前规格及交接。测试部署前需要设计和验收计划，生产晋级前需要绑定测试运行及包摘要的实际验收报告。
