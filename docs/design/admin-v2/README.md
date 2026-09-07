# OpenXiangda Admin v2 标准页面设计基线

状态：2026-08-16 已退役，仅保留为历史评审记录。当前实现基线是 [Vite / Refine 前端决策](../../architecture/frontend-stack-decision-v2.md)与[产品北极星](../../architecture/product-north-star-v2.md)；本目录不再是验收或 AI 开发输入。

> 本目录关于“不引入 ProComponents 运行时”和“流程提交常驻双栏审批预览”的结论已经废止，图片不得再用于实现验收。保留图片只为解释过去的产品判断和迁移输入。

适用范围：OpenXiangda 2.0 新应用。本文和配套设计稿不承担 1.x 兼容，不改变 1.x 页面、流程或自动化运行时。

## 1. 设计结论

OpenXiangda 2.0 的 Admin 使用一套平台官方 React 管理端框架。应用声明路由、菜单、字段、数据资源、流程定义与业务扩展；框架提供壳层、身份、导航、标签、页面生命周期和标准页面。

- 主设计系统：Ant Design 6.4.2。
- 交互参考：ProLayout、ProTable、ProForm 的成熟模式；不引入与 Ant Design 6 没有声明兼容的 ProComponents 运行时，也不建立第二套查询和页面状态。
- 视觉方向：企业级 B 端，低到中信息密度，单一蓝色主色，冷灰背景，白色内容面，边框优先、阴影克制。
- 设计参数：视觉变化度 4/10、动效 2/10、信息密度 5/10。
- 桌面基线：1440×900；侧栏 232px，顶栏 56px，标签栏 40px。中等宽度变为单列，移动端使用抽屉导航与非粘性操作区。
- 圆角只使用两级：控件 6px、内容面 8px；不使用胶囊按钮、玻璃拟态、渐变背景或无业务含义的彩色图标。
- 一个操作面只保留一个主按钮。危险操作、流程拒绝和高级操作使用语义样式与明确确认。

## 2. 已评审页面

| 页面 | 设计稿 | 实现归属 | 评审决定 |
| --- | --- | --- | --- |
| 工作台与壳层 | [workbench.png](./workbench.png) | `ApplicationShell`、`DashboardPage` | 固定导航、身份与范围、标签缓存、四项指标、趋势、待办、快捷入口和最近访问形成统一首屏。侧栏使用组件默认外观。 |
| 数据管理 | [data-management.png](./data-management.png) | `DataListPage` | 页头、显式搜索、工具栏、跨页选择、列设置、密度、服务端排序与分页属于一个标准工作台；Data API 是查询事实源。 |
| 表单提交 | [form-submit.png](./form-submit.png) | `DataFormPage` | 支持分区、两列/整行字段、文件、字段帮助、脏状态和稳定操作区；右侧说明是可选 contribution，不强制简单表单双栏。 |
| 表单详情 | [form-detail.png](./form-detail.png) | `DataRecordPage` | 业务字段、文件和操作记录分层；不显示 revision、数据库字段或内部协议值。快捷业务动作由应用贡献。 |
| 流程提交 | [workflow-submit.png](./workflow-submit.png) | `WorkflowSubmissionPage` | 左侧保存业务数据，右侧预览审批节点、条件分支、审批人和主部门；隐藏事件、服务任务和内部自动化节点。 |
| 流程详情/任务 | [workflow-detail.png](./workflow-detail.png) | `WorkflowSurfacePage` | 业务字段、审批记录与当前任务三层清晰；字段策略和允许操作只消费后端 Surface，前端不复制流程规则。 |

设计图是信息架构和视觉协议，不是要求逐像素复制的静态页面。图片中的示例名字、数量和日期都是演示数据，不得进入平台默认业务事实。

## 3. 组件与协议映射

| 设计区域 | Ant Design 基础 | OpenXiangda 所有权 |
| --- | --- | --- |
| 应用壳 | `Layout`、`Menu`、`Tabs`、`Drawer`、`Dropdown`、`Avatar` | 路由 manifest、菜单裁剪、标签持久化、keepAlive、身份 epoch、个人中心 |
| 页面标题 | `Typography`、`Button`、`Space/Flex` | `PageHeader`：返回、标题、描述、状态与单一主操作 |
| 工作台 | `Statistic`、`Card`、`List`，ECharts 按需加载 | 指标独立请求/错误/重试，流程待办使用服务端 `total` |
| 数据页 | `Form`、`Table`、`Pagination`、`Popover/Dropdown` | Data API 服务端筛选、排序、分页、字段策略、revision CAS、资源失效 |
| 表单/详情 | `Form`、`Descriptions`、`Upload`、`Tabs`、`Timeline` | 字段声明、文件适配、脏状态、审计读取和应用动作 contribution |
| 流程页 | `Steps/Timeline`、`Descriptions`、`Form`、`Alert`、`Button` | Workflow Kernel preview/surface、参与者解析、字段策略、后端允许操作 |

## 4. 状态与可访问性

每个标准页面都必须具备 loading、empty、error、retry、disabled 和 permission-denied 状态。加载失败不能伪装成空数据；权限隐藏不能替代后端授权。

- 所有输入具备可见标签，必填、帮助和校验信息不只依赖颜色。
- 表格行点击只能是鼠标快捷方式，必须提供可聚焦的“查看/处理”操作。
- 图表必须有可访问名称，并在无数据或失败时回退为语义状态组件。
- 隐藏保活页面必须同时 `hidden`、`inert` 与 `aria-hidden`。
- 身份、角色、租户、环境或授权 epoch 变化时，旧页面实例、查询和选择状态必须失效。
- 移动端不固定底部操作区，不让流程操作遮挡字段或浏览器安全区域。

## 5. 设计生成与评审记录

本组图片使用内置图片生成能力分别生成，每张图只对应一个标准页面。提示词共同约束为：`production-realistic Ant Design 6 enterprise admin UI, Chinese B2B, 1440x900, medium-low density, solid deep navy navigation, one cobalt primary color, flat-first borders, no gradients/glassmorphism/marketing hero`，再分别补充工作台、数据列表、表单提交、表单详情、流程提交和流程任务的真实字段与操作。

工作台首稿在评审后又做了一次定向编辑：侧栏改为纯色，快捷入口去除绿/紫装饰色，指标只保留必要语义色。其余五张的结构与视觉约束一次通过；实现阶段仍以 Ant Design 默认组件、真实协议和响应式验收为最终证据。
