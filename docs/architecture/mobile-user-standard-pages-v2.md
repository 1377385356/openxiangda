# OpenXiangda 2.0 移动用户端标准页面

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-16 已确认并进入实现

> 2026-08-30 路由运行时修订：标准 `routeManifest` pair 的设备协商改为按
> viewport family 实时处理（`<=768px` 为 mobile，`>=769px` 为 desktop），视口族
> 改变时允许 desktop/mobile 双向 `replace`，保留参数、query、hash、router state，
> 并在 `BrowserRouter` history listener 建立后执行。本文下方“自动识别只在应用根入口
> 执行一次”“缩放或旋转不切换 UI”等 session-fixed 文字仅作为旧设计证据；对标准
> manifest pair 以 [Application route composition v2](./application-route-composition-v2.md)
> 的本修订为准。该修订不引入 RoleSession、第二身份或第二路由表。

适用范围：OpenXiangda 2.0 新应用的移动用户端、`openxiangda-user/mobile`、生成模板和移动 Chromium 验收。PC Admin、1.x View、稳定字段数据协议和平台数据库不在本轮修改范围内。

## 1. 实现门禁

| 项目 | 决策 |
| --- | --- |
| 问题证据 | `openxiangda-field-kit/mobile` 已覆盖移动字段交互，但 2.0 只有 PC Admin 标准页面。应用若直接组合桌面 ProForm、原生 `select/file` 或临时流程页面，会重新产生字段值漂移、移动端难用、审批预览常驻和操作协议分叉。 |
| 能力所有者 | Platform Server 继续唯一拥有身份、授权、Data/App API、Workflow Surface 和文件/目录能力；`openxiangda-user` 只持有当前 React 页面生命周期内的身份快照和 UI 状态；Field Kit 唯一拥有平台字段值归一化及移动控件。 |
| 稳定不变量 | 移动端与 PC Admin 提交完全相同的稳定字段值；页面必填不冒充服务端业务校验；一个用户同时只使用一个稳定 RoleSubject；应用管理员仍由平台授权；Workflow 业务字段始终由 Data/App API 保存，Kernel 只保存流程状态和字段策略。 |
| 上下游契约 | Provider 只消费 Native RoleSession context/switch；数据页面只消费 Data API 的服务端分页、revision/CAS 与审计；流程提交先保存业务数据，再 prepare，点击提交后才打开审批预览；任务/实例页只解释 Workflow Surface 的可见操作和 JSON input schema。 |
| 并发与失败 | 身份请求以 generation 丢弃迟到响应，RoleSubject 切换使用 expected RoleSession CAS 并推进 identity epoch；列表分页请求丢弃旧响应；更新带 revision；流程命令带 task/instance version 和幂等键；页面卸载后不提交状态。 |
| 安全与资源上限 | 浏览器不保存平台 Token、授权结论、服务地址或业务响应；最多展示 50 条移动列表、30 条审计和 100 条工作中心记录；文件、人员、部门、地址和关联数据必须走 Field Kit/平台 API；移动包不得依赖 `antd`、`@ant-design/pro-components` 或 `openxiangda-admin`。 |
| 回滚边界 | 本轮是新增前端包和生成模板能力，不改平台表或远端 API。可回滚移动 AppVersion 或移除模板入口；字段协议、PC Admin 和 1.x 不受影响。 |
| 可证伪验收 | 静态依赖扫描证明移动包没有桌面 UI；SSR/单测覆盖身份 gate、角色选择、字段渲染、列表和流程操作协议；真实移动 Chromium 覆盖工作台、列表、表单、提交后审批预览、详情和流程任务；桌面 Admin 回归通过。 |

## 2. 产品与视觉基线

本轮先生成并评审了五屏移动设计板：工作台、数据列表、表单提交、提交后的审批预览、流程任务详情。设计板是页面结构、视觉层级、间距、状态和操作顺序的可执行合同；业务示例数据可以变化，但实现不能退化成移动组件库默认皮肤或只保留信息架构：

- 接受白底卡片、浅灰页面底色、中低信息密度、44px 以上触摸目标和底部安全区；
- 接受首页指标与快捷入口、记录卡片列表、分区表单、底部主操作、纵向审批路径和任务页固定操作栏；
- 流程预览只在点击“提交”并完成业务保存/prepare 后出现，不能常驻表单；
- 页面只保留一个主操作。退回、拒绝、转交、代理、加签等由 Surface 决定，并收纳到任务页底部操作区或“更多”；
- 不采用设计图中偶发的渐变按钮，正式实现使用单色主按钮；不把设计图中的示例字段、状态或角色名称写死到框架；
- 不使用桌面侧栏、缩小后的 ProTable/ProForm、玻璃拟态、大面积装饰插画或以颜色替代文字状态。

基础 token：页面背景 `#f5f7fa`、卡片 `#ffffff`、主文字 `#172033`、次文字 `#667085`、边框 `#e6eaf0`、主色 `#1677ff`、成功 `#12a594`、警告 `#ed8b2c`、危险 `#e5484d`；卡片圆角 12px，页面水平间距 12px，区块间距 12px，底部操作栏包含 `env(safe-area-inset-bottom)`。

## 3. 包和运行时边界

新增 `openxiangda-user`：

- 包根导出无 UI 的 `OpenXiangdaUserProvider`、context/types 和身份生命周期；
- `openxiangda-user/mobile` 导出独立的 Mobile Identity Gate、App Shell、Workbench、Data List/Form/Detail、Workflow Submission/Work Center/Task/Instance；
- `openxiangda-user/mobile.css` 只提供移动 token、页面结构和安全区样式；
- Mobile 子入口可以依赖 `antd-mobile` 与 `openxiangda-field-kit/mobile`，不得引用 PC Admin；
- 后续 Desktop 用户端使用独立子入口。自动识别入口只动态加载一个 UI 子树，并在一次页面会话内固定 experience；窗口缩放不把已填写表单热切到另一棵 UI。

Provider 不建立第二套身份事实源。它只缓存平台返回的当前 context，暴露 `loading/error/identity/identityEpoch/reloadIdentity/switchRole/appApi`；所有授权仍由服务端重新判断。

## 4. 标准页面合同

### 4.1 工作台

工作台只做展示组合：问候、最多四个指标、最多八个快捷入口和有界最近事项。指标由应用通过受限聚合/App API 加载；框架不生成假统计，也不按角色名称推断数字。

### 4.2 数据列表、表单与详情

移动列表使用搜索、可选状态筛选、卡片和游标式“加载更多”体验；底层仍是 Data API `limit/offset`，不会把全量记录拉到浏览器。列表字段、标题字段、摘要字段和状态字段由页面 Surface 指定，所有值使用 `MobileFieldValue`。

表单用移动分区和固定底部提交栏，所有持久化字段用 `MobileFieldControl`。创建调用 Data API create；编辑先读当前记录并以 revision 更新。页面层 required 只负责即时提示，服务端字段错误仍需原样呈现。

详情按 Field Kit 只读 renderer 展示业务字段，并显示有界审计时间线。附件/图片的下载预览继续由 Field Kit 和平台 API 负责。

### 4.3 流程提交与详情

流程提交页初始只显示业务表单和一个“提交”按钮。点击后顺序固定为：

1. 归一化字段值并通过应用提供的 `saveBusiness` 保存业务记录；
2. 使用同一稳定保存幂等键准备流程；
3. 在底部弹层展示 Kernel 返回的审批节点、条件说明、候选审批人与主部门问题；
4. 需要输入时提交答案并重新 prepare；ready 后使用 preparation token 和独立 start 幂等键确认发起。

任务/实例页同时展示流程摘要、业务数据、审批时间线和 Surface 允许的操作。框架不复制同意、拒绝、退回、转交、加签或代理规则；操作输入只按后端 JSON schema 构建基础移动表单，复杂业务操作由应用通过 `app_action` 扩展且不能覆盖 Kernel 操作。

## 5. 分阶段交付

1. 新增 `openxiangda-user` Provider、移动标准页面、样式、单测和包边界门禁；
2. 生成模板新增独立用户端入口和通用采购申请示例，不复用 PC Admin 页面；
3. 启动本地平台/PostgreSQL/NestJS，在移动 Chromium 验收真实字段、角色切换、Data API 和 Workflow；
4. 经 Changeset、正式 release receipt 发布，再以全新应用在 reference-environment 预发验收；只有明确发布时才创建/晋级 production。

## 6. 生成模板接入门禁

| 项目 | 决策 |
| --- | --- |
| 问题证据 | AppPackage v3 只有一个不可变 `frontend` 制品和入口文件；为移动端另建第二个前端根会迫使编译器、部署状态和网关同时理解两套制品，超出页面问题本身。现有 Umi 已支持顶层路由懒加载，可在一个制品中承载互不嵌套的 Admin 与移动用户端 UI 树。 |
| 能力所有者 | `apps/web` 仍是唯一 frontend 构建和制品根；`Application` 只拥有桌面 Admin 树，新增 `MobileApplication` 只拥有移动用户树；`openxiangda.config.ts` 是 admin/user route surface 的发布事实源；平台继续只部署一个 frontend digest。 |
| 稳定不变量 | 两棵 UI 树不互相包裹或复用 DOM；移动路由不得进入 `AdminLayout`；显式 `/m` 路由始终选择移动 UI；自动识别只在应用根入口执行一次，表单填写期间的缩放或旋转不切换 UI；现有显式桌面业务 URL 始终进入 Admin。 |
| 上下游契约 | Umi 顶层路由分别挂载 `Application` 和 `MobileApplication`；移动树使用同一个平台相对 `/service` 客户端、Native RoleSession、Data/App API 与 Workflow 合同；AppPackage route manifest 为移动路由声明 `surface: user`。 |
| 并发与失败 | 入口识别为同步纯函数，不请求远端、不持久化选择；无法识别时默认桌面 Admin。身份、列表、详情和流程请求继续使用 `openxiangda-user` 的 generation/CAS/idempotency 语义；移动路由卸载不得接收迟到响应。 |
| 安全与资源上限 | 自动识别不参与授权，任何 route 仍由平台 capability/Data/Workflow 授权；不保存 Token 或设备指纹；移动树路由级懒加载，首屏不得渲染 `.oxa-admin-root`，标准列表/审计/工作中心上限保持不变。 |
| 回滚边界 | 仅新增模板移动路由、页面和同一 frontend 制品内的入口选择；不改平台数据库、网关或 AppPackage 格式。可回滚 `create-openxiangda`/`openxiangda-user` 候选和目标 AppVersion，桌面 Admin 与 1.x 不变。 |
| 可证伪验收 | 纯函数测试覆盖手机、触屏窄屏、普通桌面与缺失浏览器信息；桌面 Chromium 继续通过原套件；移动 Chromium 从根入口自动进入 `/m`，覆盖工作台、列表、详情、字段表单、角色切换和“提交前无审批预览”；完整本地模式再验证业务保存、prepare/start 与任务操作；构建门禁验证 user surface 和路由拆分。 |
