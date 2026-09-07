# Ant Design Pro v6 Admin 全量切换决策（已废弃）

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

> **SUPERSEDED / 历史证据（2026-08-21）**：本文不再是产品、模板、CLI、Skill 或 AI 开发合同。相同 instrument reference app 仪器模块的真浏览器 A/B 结果已选择 [Vite / React Router / Refine / Ant Design](./frontend-stack-decision-v2.md)，并依据[产品北极星](./product-north-star-v2.md)破坏性删除 Umi/Pro 默认路径。以下正文仅保留用于审计旧决策为何被废弃，不得继续实施其中的 Umi、ProComponents、RoleSession 或已删除命令。

历史状态：2026-08-16 曾确认；2026-08-21 已被仪器模块 A/B 证据和新北极星废弃

适用范围：`openxiangda-admin`、`create-openxiangda` 官方模板、2.0 CLI/生成器/MCP/Skills、2.0 参考应用与前端验收。OpenXiangda 1.x 不在范围内。

## 1. 决策

OpenXiangda 2.0 的默认 Admin 基础彻底切换到官方 Ant Design Pro v6 Simple 模板体系：React 19、Ant Design 6、Umi Max 4、ProComponents 3，以及 Pro v6 采用的样式与构建方案。`openxiangda-admin` 只保留新的包名与职责边界，`src`、测试和样式从空目录重建；旧实现不作为迁移源，也不复制其组件、路由器、缓存器、页面结构或 CSS。新包是平台集成层和经过约束的标准业务组件集合，不再自行实现一套与 Ant Design Pro 竞争的布局、路由承载、搜索表格、表单和详情框架。

这是直接替换，不建立双框架、双路由、运行时开关或 2.0 兼容适配层。当前 2.0 只有内部测试应用，可以重新生成或废弃；正式的 2.0 包只在旧实现删除、完整验收通过后发布。

采用以下官方能力作为默认实现：

- `ProLayout` 与 Umi 路由承担 Admin 桌面布局、导航和面包屑；
- `PageContainer`、`ProCard`、`StatisticCard` 承担标准页面和工作台骨架；
- `ProTable` 承担搜索、服务端列表、列配置、排序和分页交互；
- `ProForm` 承担标准业务表单和操作表单；
- `ProDescriptions` 承担标准详情信息展示；
- ECharts React 适配层承担受限聚合图表，不把完整业务数据下载到浏览器聚合。

实施基线固定为 Ant Design Pro `v6.0.2`（commit `2b453c67b535b76f5f95d6542397a4b987b61de2`）。依赖精确锁定为 `@umijs/max@4.6.51`、`@ant-design/pro-components@3.1.12-0`、`antd@6.4.3`；React 保持当前仓库已经验证的 `19.2.8`。安装结果由 `pnpm-lock.yaml` 固定，不使用浮动 `latest`，也不把 Ant Design Pro 作为 Git submodule。任何版本升级都必须作为新的架构主题重新完成 API、构建与浏览器验收。

实现只复用官方源码的公开包、配置结构与页面范式，不复制官方示例登录、Mock 用户、演示 API 或业务页面。上游 tag/commit、精确依赖和本仓库 lockfile 三者共同构成可复现基线。

参考：

- [Ant Design Pro](https://github.com/ant-design/ant-design-pro)
- [Ant Design Pro v6 发布说明](https://github.com/ant-design/ant-design-pro/releases)
- [ProComponents](https://github.com/ant-design/pro-components)

## 2. 为什么替换

### 2.1 问题证据

当前自研 Admin 已经实现了身份、路由、标签、数据页、表单、工作流页面等大量能力，但产品层仍出现以下问题：

- 默认页面视觉和交互粗糙，内部编码、协议字段和错误容易直接暴露；
- 布局、表格、表单、详情、工作台都由平台重复实现，成熟度和一致性不足；
- 页面基础能力与平台业务协议耦合，单点修复容易影响壳层、查询或生命周期；
- 当前方案建立在旧的 ProComponents 兼容性判断上，而 ProComponents 3 已进入 Ant Design 6 技术栈；
- 流程提交把审批预览长期放在页面中，偏离普通用户“填写并提交”的主任务。

因此继续修补当前表现层会延长自研框架维护成本。2.0 没有稳定外部应用包袱，适合在公开发布前一次性换到底层成熟框架，同时保留已经验证的平台协议和业务内核。

### 2.2 能力所有者

| 能力 | 唯一所有者 |
| --- | --- |
| 布局、导航承载、基础页面交互 | Ant Design Pro v6 / Umi Max / ProComponents |
| 用户端桌面/移动页面表现 | 应用仓库的 Desktop Renderer 与 Mobile Renderer；共享 OpenXiangda 2.0 页面协议 |
| 表单字段、附件与业务值渲染 | OpenXiangda 2.0 Field Kit；平台合同是唯一数据语义来源 |
| OAuth2、Principal、RoleSession、角色切换 | OpenXiangda Platform |
| capability、数据范围与最终授权 | OpenXiangda Platform；浏览器只消费投影 |
| 路由与菜单业务声明 | 应用仓库 route manifest，经 OpenXiangda 确定性生成 |
| Data API/App API 查询、事务与业务数据 | OpenXiangda Platform / 应用 NestJS 后端 |
| Workflow 状态机、Surface、允许操作和字段策略 | Workflow Kernel v2 |
| 标签边界、保活、脏状态和身份失效 | `openxiangda-admin` 平台集成层 |
| 环境、AppVersion、构建和发布状态 | OpenXiangda Platform 与 2.0 CLI |

Ant Design Pro 的 `access` 只能作为 capability 结果的 UI 投影，不能成为授权事实源。Umi `initialState`、浏览器缓存和模板 Mock 都不能成为身份、权限、业务数据或平台运行状态的第二存储。

## 3. 稳定不变量

1. 一个应用版本仍由前端、NestJS 后端、配置合同、生成类型和构建摘要共同构成不可变 AppVersion。
2. 远程环境仍只有 `preproduction` 与按需创建的 `production`；本地是运行模式，不是第三个远程环境。
3. 服务端始终是身份、授权、数据、流程动作与部署状态的最终裁决者。
4. 业务字段始终由 Data API/App API 保存；Workflow Kernel 只保存流程状态、参与者、动作、字段策略和不可变审计。
5. 当前角色是稳定、显式的 RoleSession；同一用户的多个角色不隐式合并。应用管理员保留明确的最高授权声明。
6. 路由、菜单和直接 URL 访问使用同一份应用 route manifest 与同一 capability 结果。
7. 标签持久化、组件保活、数据查询和业务草稿仍是四类不同状态；身份 epoch 改变时旧请求、实例和选择必须失效。
8. 1.x 应用、流程、自动化、View 和发布工具不引用本决策中的包或运行时。
9. Admin 是桌面 B 端产品，默认验收宽度为 1280px 及以上，不为手机端维护抽屉导航、压缩表格或触摸版后台交互。
10. 用户端共享数据、表单、校验和流程合同，但 Desktop UI 与 Mobile UI 是两个独立 renderer；设备只在应用入口判定一次，不在同一组件树中堆叠响应式分支。

## 4. 前端合同

### 4.1 工程与路由

官方模板的 `apps/web` 从 Vite/手写 React Router 切换为 Umi Max。应用继续声明 OpenXiangda route manifest；`openxiangda generate` 将其确定性编译成 Umi 路由和 ProLayout 菜单元数据。生成结果必须可重复，人工维护的第二份路由树、菜单树或权限树视为构建错误。

Pro 模板自带的登录页、Mock 用户、示例 API、演示菜单和无用页面全部删除。身份启动只调用平台 RoleSession bootstrap；失败时显示可恢复的壳层错误界面，不能白屏，也不能回退到模板假用户。

应用业务路由按模块 lazy load。标签和保活由新的 `openxiangda-admin` 对 Umi 生命周期做薄封装：默认最多 12 个标签、6 个保活实例，按身份和 manifest fingerprint 隔离；动态详情、任务和编辑页默认不持久化、不保活。这里只保留产品不变量，不保留旧标签或保活实现代码。

### 4.2 标准数据管理

`DataListPage` 使用 ProTable，但只允许通过 OpenXiangda request adapter 访问类型化 Data API/App API。adapter 把 ProTable 参数转换成现有 DataQuery 的服务端分页、排序和有界筛选；不增加第二套查询 DSL，不在浏览器下载全量数据后过滤。

列显隐、密度、页大小与搜索展开状态可以按 `tenant + app + environment + roleSubject + resource + configVersion` 保存为 UI 偏好。Token、权限判定、行数据、查询结果、选择结果和业务字段不得持久化。字段策略决定列表、搜索、导入、导出、查看和编辑是否可见或可写。

### 4.3 标准表单与详情

`DataFormPage` 使用 ProForm，由 DataResource、字段策略和应用的业务标签生成控件。创建和修改经类型化客户端提交，revision 冲突、幂等失败、服务端字段错误和脏状态由标准适配层处理。

`DataRecordPage` 使用 PageContainer、ProDescriptions、附件和业务审计时间线。普通用户只看到业务标签和值；resource code、workflow code、node id、revision 和原始 JSON 只在开发/诊断边界按权限展示。

### 4.4 流程页面

流程提交页的正常状态只展示业务表单和一个主按钮“提交”。用户点击后按以下顺序执行：

1. 校验并通过 Data API/App API 保存业务数据，取得 `businessKey` 与 revision-bound `dataRef`；
2. 调用 Workflow prepare；
3. 在 Modal 中展示真实审批路径、条件分支、审批人，并仅在必要时收集主部门或未解析审批人；
4. 用户确认后以稳定幂等键发起流程。

审批预览不常驻页面，不把“预览流程”“保存并生成预览”“发起”暴露成三个主要步骤。业务字段、主部门或审批人答案变化后旧 preparation token 立即失效。保存草稿可以作为应用显式贡献，但不是所有流程页的第二主操作。

任务和流程详情使用 PageContainer、ProDescriptions、Timeline 与标准 Action Surface。允许按钮、字段读写、操作表单和下一处理人只消费后端 Surface；同意、拒绝、转交、回退、加签和代理不在浏览器复制状态机规则。

### 4.5 工作台与个人中心

默认工作台使用 ProCard/StatisticCard 组织指标、趋势、待办、快捷入口和最近访问。统计只来自带 RoleSession 和数据范围的服务端受限聚合；无真实数据时展示空态，不伪造数字。

个人中心统一展示资料、当前环境、稳定角色、数据范围、退出和角色切换。流程代理作为 Workflow 的可选贡献，不让 Core 静态依赖 Workflow。切换角色后更新 identity epoch，取消或丢弃旧请求，并恢复该角色自己的有界 UI 偏好。

### 4.6 用户端双 UI 与 Field Kit

Admin 与用户端是两个产品入口。Admin 只提供桌面管理体验；用户端由应用声明同一份页面、字段、动作和流程协议，再分别交给 Desktop Renderer 与 Mobile Renderer。两个 renderer 共享请求状态机、表单值、校验规则、字段策略、幂等键和错误模型，但不共享页面布局组件。平台在入口根据设备能力和用户显式偏好选择 renderer；切换 renderer 不改变 URL 业务语义、RoleSession 或业务草稿标识。

移动端不是桌面页缩放：表单采用单列、触摸目标、移动日期/选择器、底部安全区动作栏、图片拍摄/选择和适合小屏的分步反馈；桌面用户端可以使用栅格、侧栏详情和批量能力。需要同时支持两端的应用页面必须提供两套 view composition；纯管理页面无需生成移动版本。

新增独立的 OpenXiangda 2.0 Field Kit，按[稳定字段数据协议采用与声明分层决策](./stable-field-protocol-adoption.md)提供桌面与移动 renderer。物理存储、值形状、查询和索引协议不重新设计；V1 低代码组件名和展示 Schema 不作为 2.0 数据合同，新的可选 Surface Definition 只负责默认 UI。允许移植 1.x 中已经验证的平台能力控制器和测试，但禁止把 1.x Admin、页面壳、发布生命周期或样式运行时带入 2.0。

移动端的强制平台组件边界覆盖全部已支持的标准持久化字段，而不是只覆盖有独立后台接口的复杂类型。文本、数值、单/多选、下拉、级联、日期、日期区间、地址、人员、部门、附件、图片、富文本、签名和子表等都由 Mobile Field Kit 输入和规范化；其中选择面板、日期流程、地址级联、键盘、触摸目标和安全区沿用并升级平台已经验证的移动体验。页面可以自由使用移动组件库完成布局、导航、按钮和普通弹层，但不得直接用 Ant Design 桌面字段、原生输入控件或临时移动控件替代标准平台字段。缺失能力通过显式 Field Kit 扩展补齐，不在业务页面内形成第二套字段协议。

图片和附件字段只能使用 Field Kit 的平台附件组件。组件继续使用稳定附件值、上传、下载、鉴权预览、图片压缩和未绑定文件清理协议；应用不得直接使用 Ant Design `Upload`、原生文件输入或自行拼接对象存储 URL。生成器、ESLint 规则和模板静态审计把绕过行为视为构建错误。

列表、详情和表单使用同一 Field Renderer Registry。基础类型覆盖文本、长文本、布尔、日期时间、数值、金额、百分比、链接和枚举；平台类型覆盖成员、部门、角色主体、图片、附件和流程状态。成员/部门展示头像、名称和辅助组织信息，枚举使用声明色彩和标签，多选采用有界折叠，数值按精度、单位和 locale 格式化；未知类型使用安全文本降级并在开发诊断中报告，不能直接渲染 `[object Object]` 或原始内部编码。

## 5. 本地开发、构建与发布

`openxiangda dev` 继续是一条命令的生命周期入口，但改为监督 Umi 开发服务、NestJS 和独立本地平台服务。真实 PostgreSQL 仍由本地平台按工作区隔离管理，不要求开发者在电脑中手工安装数据库。Umi Mock 不能承载平台事实；本地平台与远程平台消费同构的身份、Data、Workflow 和 Event HTTP 合同。

AppPackage 的边界不变：生产构建仍输出静态前端 `dist`、NestJS OCI 镜像、配置合同和摘要。构建入口从 Vite 迁移到 Umi/utoopack；同一源代码连续构建必须闭包一致，生产包静态证明不包含本地 Mock、测试用户或开发凭据。

生产体积门禁按浏览器实际传输成本和解析上限分别约束：每个异步 JavaScript 块 gzip 后不得超过 420KB、解压后不得超过 1.5MB，首屏脚本解压总量不得超过 1.5MB。Ant Design/Pro 的异步共享块不再沿用 Vite 时代 800KB 的单一原始文本阈值；路由拆分数量、首屏闭包和开发标记扫描仍独立失败关闭。

正式切换完成时删除：

- Vite 配置和只服务旧模板的插件；
- 手写 React Router 路由树和重复菜单树；
- 自研 `AdminShell` 布局及其专用 CSS；
- 与 ProTable、ProForm、ProDescriptions 重复的通用搜索、列表、表单和详情壳；
- 旧流程提交常驻预览布局；
- 模板中的仪器业务演示和所有兼容开关。

不删除平台服务端身份、Data/Workflow HTTP 合同、route manifest 合同和运行诊断协议。旧前端中的 Provider、DirtyStateRegistry、受限偏好存储、路由匹配和生命周期实现全部删除；需要的产品行为在新的 Pro/Umi 边界重新实现，不允许通过 import、包装或复制旧源码继续使用。

允许复用的代码仅限不含 React、DOM、路由、样式或页面状态的生成契约与 HTTP 客户端。凡位于旧 `openxiangda-admin/src` 或旧模板 `apps/web/src` 的实现，一律视为待删除前端代码。

## 6. 默认参考应用

新参考应用改为“企业采购申请”，避免用仪器系统代表通用框架。默认覆盖：

- 采购申请人、部门负责人、财务、采购管理员和应用管理员；
- 采购单 CRUD、服务端搜索/排序/分页、附件、金额统计和部门数据范围；
- 多角色稳定切换、应用管理员授权声明和字段读写策略；
- 金额条件分支、审批预览 Modal、同意/拒绝/转交/回退/加签/代理；
- 流程事件消费、一个应用自定义 App API 动作与幂等回执；
- preproduction 默认运行，只有执行发布正式功能后才创建 production workload。

参考应用是验收载体，不向 `openxiangda-admin` 引入采购领域代码。

## 7. 失败、并发与资源边界

- route manifest 生成不一致、重复路径、缺 renderer 或权限漂移必须在 generate/check/build 阶段失败。
- Umi 开发服务唯一拥有 `src/.umi`；普通类型检查复用已存在的开发类型，只在目录缺失时初始化。生产构建只使用 `src/.umi-production`，不得通过 `max setup` 删除正在运行的开发工件。
- RoleSession bootstrap 失败时 fail closed，并提供重试、重新登录和 request id；页面不能以无权限空态掩盖系统错误。
- identity epoch 变化后中止旧请求；无法中止的 ProTable/React Query 响应按 generation 丢弃。
- 表单保存、流程 prepare/start 和自定义动作使用 revision/CAS 与稳定幂等键，重复点击或网络重试不能重复创建。
- 异步 chunk 加载失败使用路由级错误边界和就地重试，不能把整个应用变成白屏。
- 浏览器持久存储只允许有界 UI 偏好和逻辑路由，不保存 token、capability、业务响应或表单草稿。
- 删除 Pro 模板无用依赖和页面，业务模块按路由拆包；为首屏、单 chunk、总 JavaScript 和可选 Workflow chunk 建立预算。

## 8. 回滚边界

在首个正式 2.0 包发布前，回滚单位是整个工具链/模板/Admin 提交或 AppVersion，不在运行时保留旧 Shell。实现可以分提交，但对外只发布已删除旧实现且通过门禁的完整版本。

已经生成的 2.0 测试应用直接重新初始化或迁移源码贡献，不承诺 UI 组件 API 兼容。1.x 保持在 `tools/openxiangda` 与原平台运行时中，既不迁移也不回滚。

## 9. 可证伪验收

全量切换只有同时满足以下条件才算完成：

1. 从已打包工件在空目录创建企业采购参考应用，`openxiangda generate/check/test`、类型检查和 Umi production build 全部通过；
2. 依赖与源码审计证明没有 Vite、手写 React Router、旧 AdminShell、常驻流程预览或模板 Mock 进入生产包；
3. Ant Design lint、单元测试和 Playwright 覆盖 Admin 的 1280/1440px 桌面布局，以及用户端独立 Desktop/Mobile Renderer 的身份、字段、表单和流程主路径；Mobile 验收必须包含单/多选、下拉、级联、日期/日期区间、地址、人员/部门、数值、附件/图片和子表，且证明未加载桌面数据录入控件；
4. ProTable 覆盖服务端搜索、排序、分页、列配置、字段裁剪、修订冲突、导入导出和身份切换旧响应隔离；
5. ProForm/详情覆盖新建、编辑、脏状态、附件、审计、内部编码隐藏和服务端错误；
6. 流程页覆盖“业务表单 → 点击提交 → Modal 预览/补充选择 → 确认发起”，以及任务的完整标准动作；
7. `openxiangda dev/status/stop/reset` 在真实 PostgreSQL 上通过，前端与 Nest 热更新、本地重启保留和显式 reset 清理均有证据；
8. production bundle 不含 local canary、假用户、Mock API 或原始 Secret，并通过 chunk/首屏预算；
9. 同一 AppVersion 先部署 preproduction，再原样创建/晋级 production；失败可回滚上一 AppVersion；
10. 1.x View、流程、自动化与 1.x 发布回归无变化。

## 10. 实施顺序

1. 冻结官方 Pro v6 基线、依赖和新版页面设计验收稿；
2. 删除旧 Admin 与旧模板前端源码，建立空白 Umi Max / ProComponents 工程边界；
3. 从零实现 ProLayout、Umi route generator、身份启动、ProTable/ProForm/ProDescriptions、工作台和新的有界生命周期能力；
4. 改造流程提交 Modal、工作中心、任务和详情 Surface；
5. 从空白边界实现 2.0 Field Kit、用户端 Desktop/Mobile Renderer 与附件绕过门禁；
6. 更新本地开发编排、CLI/MCP/Skills、打包和发布门禁；
7. 用正式候选 tarball 创建企业采购参考应用并完成真实浏览器、NestJS、PostgreSQL、preproduction 验收；
8. 静态证明发布包没有旧源码、旧领域代码和兼容开关，通过 Changesets 物化一次正式候选版本。

上述步骤是一个发布单元内的实现顺序，不代表对外提供双框架。任一步不能达到可逆和可验证状态时，停止在源码提交边界修正，不把半成品发布给新应用。

## 11. 2026-08-16 实现轮门禁

### 问题证据与影响范围

- 当前模板仍受旧手写 `ApplicationShell`、路由匹配器、生命周期和仪器示例结构影响；局部替换为 ProLayout 后，真实浏览器验收出现身份操作被旧侧栏生命周期挤到底部的结构性冲突，证明渐进改造路线不可接受。
- `WorkflowSubmissionPage` 把审批预览常驻在页面，并把保存、预览、确认拆成多个主要动作。
- 影响范围限定为 `tools/openxiangda-v2` 的 Admin 包、模板、生成器、CLI/MCP/Skills 和新参考应用；1.x 仓库、1.x View、流程和自动化不引用本轮包。

### 稳定合同与失败语义

- route manifest 是路由、菜单和 capability 投影的唯一业务声明；生成器只产生 Umi/ProLayout 所需工件，不建立人工维护的第二棵树。
- RoleSession、DataQuery、Workflow Surface、AppVersion 与环境 Head 的服务端合同保持唯一事实源；Pro 组件只负责表现和参数适配。
- 身份初始化、异步 chunk、数据查询和流程 prepare 任一失败都显示带 request id 和重试动作的语义错误态，不允许白屏或伪装成空数据。
- 流程 prepare token 绑定业务数据 revision、主部门/审批人答案和身份 epoch；任一变化使旧 token 失效。重复确认使用稳定幂等键。

### 安全、资源与并发边界

- 浏览器不持久化 token、capability、业务响应、流程 token 或表单草稿；只保存有界 UI 偏好和逻辑路由。
- 标签最多 12 个、保活实例最多 6 个；身份 epoch 切换取消或丢弃旧请求与选择状态。
- 列表只做服务端分页、排序和有界筛选；图表只消费服务端受限聚合。
- production bundle 禁止包含模板 Mock、假用户、开发凭据和原始 Secret。

### 设计评审与回滚边界

本轮形成 3 张独立横向设计基线，见 [Admin Pro v6 设计说明](../design/admin-pro-v6/README.md)：工作台、标准数据管理、流程提交 Modal。设计参数为视觉变化 3/10、动效 2/10、信息密度 5/10；实现以 Pro v6 token 和真实浏览器证据为准。首个新包发布前的回滚单位是整个 Admin/模板提交与 AppVersion，不保留旧 Shell 运行时开关。

### 可证伪检查

1. 空目录新建应用后不存在 Vite、手写路由树、旧 Shell、旧 Admin 源码引用和仪器领域代码；Umi production build 可重复通过。
2. ProTable、ProForm、ProDescriptions 和 ProLayout 的 API 均来自锁定版本，Ant Design lint、类型检查、单测和 Chromium 验收通过。
3. 流程提交页面静态审计只有一个主提交动作；审批路径只在 prepare 成功后的 Modal 中出现。
4. 直接 URL、菜单裁剪、标签恢复和 capability 使用同一生成 manifest；身份切换后旧请求不能回写当前页面。
5. `openxiangda-admin/src` 与模板 `apps/web/src` 的新实现不存在对被删除前端文件的 import、包装或复制；门禁不通过时只回滚整个绿地提交或候选 AppVersion，不发布半成品。

## 12. 2026-08-16 本地 Workflow Kernel 清单驱动决策

### 问题证据与能力所有者

- 本地平台已经接收编译后的 Workflow Definition、Binding 与 Activation，但准备、发起、条件分支、审批推进、退回、字段策略和参与人校验仍写死为旧“仪器预约”节点。这会让新应用的页面与清单看似正确，而真实提交执行另一套隐藏状态机。
- Workflow Definition/Binding 是节点、转移、操作、字段策略和审批角色的唯一所有者；Activation 是本地生效版本的唯一所有者；应用 NestJS 是 App API 业务逻辑的唯一所有者。本地平台不得再保存示例领域路由或第二份流程规则。

### 稳定不变量与失败语义

1. 本地 prepare、start、approve、reject、return、resubmit 与 Surface 全部读取当前 Activation 指向的 Definition/Binding；条件表达式复用 `openxiangda-workflow` 的解释器。
2. 业务数据继续由 Data API/App API 保存。完整模式的 App API 只代理当前 NestJS；纯前端模式仅提供平台诊断端点，业务接口明确返回不存在，不伪造成功。
3. 未激活流程、无效节点、不可解析审批角色、不允许的退回目标和并发版本冲突均失败关闭，且不写入一半实例或任务。
4. 代理、转交与加签仍校验当前节点 Binding 的角色和数据范围；应用管理员仍可按最高授权声明处理任务，但不改变原审批角色事实。
5. 变更只存在于 OpenXiangda 2.0 本地平台与新模板；1.x 流程、自动化、View 和发布链路没有依赖关系。

### 资源、并发与回滚边界

- 单次无人工节点解析最多 200 步，沿用 Workflow 编译器的无环校验；准备令牌继续绑定首个审批身份，发起前身份或分派变化必须重新预览。
- PostgreSQL 模式继续通过版本/CAS、幂等回执和单事务写入实例、任务与时间线；内存模式保持同样的可观察结果。
- 回滚单位是本地平台包、模板和生成清单的同一候选提交，不保留旧领域分支或兼容开关。

### 可证伪验证

1. 采购参考流程的低额路径直接进入采购审批，高额或专项复核路径依次进入部门、财务、采购审批；节点、标题与字段策略均与清单一致。
2. 退回目标只能来自当前审批节点的 `returnTargets`，重提回到原任务节点；非 `sequence` 审批模式不被本地运行时强制改写。
3. 更换为测试用的另一套节点名称和角色后，本地平台无需改代码即可 prepare/start/approve。
4. 源码与打包审计不再包含 `reservation-approval`、`college-review`、`instrument-review` 或示例 App API 路由。

### 本地代理身份夹具边界

- 问题证据：本地 Workflow Kernel 曾在运行时代码中内置“学院管理员/仪器管理员”和固定用户，导致代理、加签与身份切换只对旧示例成立，也让本地平台成为应用角色的第二个定义源。
- 能力归属：角色 code、名称和能力只由应用 `authz.roles` 声明；`openxiangda.local.json` 仅声明本地外部用户对应哪个既有角色成员身份及其测试范围。
- 稳定约束：本地代理目标必须引用已声明角色、已声明范围维度和 Directory 中的用户；平台不得生成行业角色或猜测用户授权。
- 契约：本地夹具新增可选 `workflowDelegationTargets[]`，每项使用稳定 code、userId、roleCode、scopeGrants；其本地 RoleSubject key 由平台确定性派生，不进入应用包或远端环境。
- 失败与并发：重复 code、未知用户、未知角色或未知范围维度在本地平台启动时立即失败；代理规则的重叠、幂等和版本竞争仍由 Workflow Kernel/PostgreSQL 事务负责。
- 安全与资源边界：该夹具只在 `local` 环境生效，不产生远端授权；应用超级管理员仍可做本地验收，但不会改变代理目标的正式角色能力。
- 回滚边界：删除 `workflowDelegationTargets` 只会关闭本地外部代理模拟，不影响清单、业务数据或远端环境；旧的内置行业目标不保留兼容分支。
- 可证伪验证：通用采购模板可将部门负责人代理给 Directory 用户并完成代理、加签、重启恢复和并发命令验收；运行时代码和打包模板不再出现旧行业角色常量。

### 加签参与者完成语义

- 问题证据：`any`/`single` 审批模式在用户执行后加签后仍会由原参与者的一次同意直接完成节点，等待中的加签参与者被取消，违背“显式加签必须处理”的用户意图。
- 能力归属：Workflow Kernel 是参与者队列与审批完成判定的唯一所有者；页面只提交 `add_assignee` 命令并渲染后端返回的参与者状态。
- 稳定约束：任何处于 `pending` 且 `required` 的参与者都是显式建立的顺序义务；当前参与者通过后必须先激活该参与者，不能被节点的 `single`/`any` 原始审批模式跳过。
- 失败与并发：参与者推进与任务/实例版本在同一 Workflow 命令事务内 CAS；重复命令走幂等回执，竞争命令只有一个版本胜出。
- 回滚边界：变更只影响 2.0 Kernel 的参与者完成规划，不修改 1.x 流程，也不增加兼容开关。
- 可证伪验证：`single`/`any` 节点的前加签和后加签均先推进必需参与者，所有必需参与者完成后才允许节点流转；完整 PostgreSQL 生命周期覆盖代理后加签和重启恢复。

## 13. 2026-08-16 候选包与独立参考应用一致性决策

### 问题证据与能力所有者

- 绿地 Admin 删除旧源码后，候选 tarball 仍包含旧 `dist` 文件；原因是 TypeScript 增量构建不会删除已经失去源码的历史输出。tarball 验证只检查入口存在，无法证明包内没有旧实现。
- 独立参考应用只更新依赖版本但仍保留旧仪器/预约源码，安装新 Admin 候选后类型检查失败。模板仓库与长期参考应用之间缺少“同代应用源码”约束。
- 每个公开包自己的 `build/prepack` 是发布字节的唯一所有者；`create-openxiangda` 模板是新建应用结构的唯一所有者；独立参考应用只拥有自身 app code、名称、仓库历史和线上 AppVersion，不另行维护一套框架源码。

### 稳定不变量、失败与并发

1. 所有公开包必须提供 `build:release`，在完整构建前删除已经没有对应 TypeScript 源文件的孤儿输出，且 `prepack` 必须执行该构建；修剪脚本只允许处理当前仓库 `packages/*/dist` 的文件，路径不匹配立即失败。它不删除仍有源码的当前输出，避免另一个 Turbo 任务或本地消费者在打包窗口读不到依赖类型。
2. 新建应用验收与独立参考应用验收使用同一组不可变候选 tarball。新建应用证明模板完整，独立应用证明真实仓库、锁文件与升级/部署链路完整。
3. Admin/模板发生绿地代际切换时，参考应用必须从当前模板重新生成并只保留自己的身份和业务增量；禁止靠兼容导出让旧示例继续编译。
4. 版本、参考应用源码或 lockfile 任一不一致时 release plan 失败关闭；不得发布部分包或让 registry tag 指向混合版本。
5. 同一候选的普通 build/check 与其他包的 release-build 可以并行；release-build 只修剪自己包内的孤儿文件，不制造当前入口缺失窗口。发布仍由单一 release plan 串行提交 registry tag，避免不同会话覆盖候选字节。

### 安全、资源与回滚边界

- 清理范围固定为直接包工作区下的 `dist`，不接受参数、环境变量、通配符或仓库根目录；不会接触源码、用户数据和 1.x 工件。
- 独立参考应用的绿地同步只删除其 Git 可恢复的旧 2.0 示例源码，不保留运行时兼容开关；线上回滚仍以最后一个健康 AppVersion 为单位。
- 回滚工具链时回滚构建不变量提交和对应 alpha 版本；参考应用可以从 Git 历史恢复上一提交。1.x 应用、流程、自动化和发布链路不在影响范围。

### 可证伪验证

1. 先构建含已删除源码的包，再执行 `pnpm pack`，tarball 中不存在对应历史 `dist` 文件。
2. 工作区编排门禁枚举所有公开包，缺少独立 release-build 或 prune-before-pack 任一约束即失败；并行 affected gate 中 pack 不会删除下游正在读取的当前输出。
3. 从候选 tarball 新建空目录应用以及绿地同步后的独立参考应用均通过 generate/check/test/build；旧 `ApplicationShell`、仪器和预约源码不再存在。
4. release plan 只在参考应用 manifest 与全部公开包候选版本完全一致时生成；正式发布前重新校验 lockfile 与 registry 工件一致。
5. 参考验收调用标准 CLI 命令而不要求应用增加仓库私有的 generate 脚本；显式安装候选到参考工作树时先写入一次生成契约，后续隔离副本和普通发布验收只允许 `generate --check`。生成模板必须从 Git 与 OCI 构建上下文排除 `.codegraph`、`.openxiangda`、`.env` 等本地状态。

## 14. 2026-08-17 导航 JSX 双运行时一致性

### 问题证据与能力所有者

- 使用当前 `master` 和本地 SDK 在空目录创建应用后，`generate --check` 与类型检查通过，但 `openxiangda test` 在 Node/tsx 加载 `navigation.tsx` 时以 `React is not defined` 失败。
- 同一文件既是 Umi Admin 的导航事实源，也是模板单测读取的导航事实源；React/Umi 继续唯一拥有 JSX 生命周期，不增加测试专用导航副本。

### 稳定不变量与受影响合同

- `applicationRoutes` 和 `adminNavigation` 仍分别是路由与菜单的单一事实源，菜单结构、路径、capability 与运行时行为不变。
- 不改变 React 19、Umi Max、TypeScript JSX 模式或公开包 API；只让 JSX 模块显式具备在 Umi 与 Node/tsx 两种受支持执行器中的运行时依赖。
- 影响只限 `create-openxiangda` 生成的新 2.0 应用。1.x、平台服务、既有 AppVersion 与其他租户均不加载该模板源文件。

### 失败、并发、安全与资源边界

- 新应用的 `openxiangda test` 继续直接导入生产导航模块；若运行时依赖再次缺失，必须在首次测试中失败，不能用 Mock 或条件分支绕过。
- 变更不引入网络、持久状态、并发状态或额外浏览器资源，也不改变身份、授权和数据边界。

### 回滚与可证伪验证

- 回滚单位是 `create-openxiangda` 的单个补丁提交，不要求迁移已生成应用。
- 模板单测必须断言导航模块保留显式 React 运行时导入；从本地 SDK 创建的全新应用必须通过 `generate --check`、`check`、`test`、Umi production build 与 Chromium E2E。
