# OpenXiangda 2.0 最佳实践模板重建计划

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-16 已确认，正在实施

本计划把现有“企业采购申请”从生命周期验收应用提升为 OpenXiangda 2.0 官方最佳实践模板。当前线上版本只证明身份、数据、文件、流程和部署链路可运行，不满足视觉、交互和平台字段完整性要求，在本计划完成前不得再标记为最终模板。

## 1. 设计读取与目标

- 页面类型：企业内部管理和流程协作应用。
- 目标用户：PC 管理人员、移动端业务申请人与审批人。
- 设计语言：Ant Design 默认组件。
- 设计参数：视觉变化 3/10，动效 2/10，信息密度 6/10。
- PC Admin 只服务桌面视口；移动用户端使用独立 UI 树，不缩放或响应式复用 Admin DOM。
- 已评审设计稿是页面结构、视觉层级、间距、状态和操作顺序的可执行验收合同。业务数据可以变化，但不得以“组件库默认样式”或“仅参考信息架构”为理由偏离设计。

### 1.1 冻结设计基线（2026-08-16 用户确认）

下列四张评审稿是后续实现与截图回归的唯一视觉基线。文件名和 SHA-256 用于避免附件顺序或会话压缩后误认图稿。

| 基线 | 评审附件 | SHA-256 | 不可降级的页面合同 |
| --- | --- | --- | --- |
| PC 工作台 | `codex-clipboard-5e1710a0-1104-562f-97ef-99d4a590b69f.png` | `007935119779d48e2bb82297035a2ccf9ae86bbfc2ae0960db209ed981dc79be` | 220px 分组侧栏、56px 顶栏、44px 标签栏；问候、四色指标、待办表、四宫格快捷入口、折线趋势和最近活动完整出现 |
| PC 标准列表 | `codex-clipboard-57d853a2-b763-5f26-9f68-d3458f613d9c.png` | `9e8f40af155c47e846350eb626e07c174426030b1753670f42ed8bd2aa1a4424` | 页标题与主动作、两行结构化搜索区、工具栏、紧凑表格、状态标签、行操作和完整分页几何对齐 |
| PC 表单与提交预览 | `codex-clipboard-5f6f4206-1251-5237-92b3-f613330627dd.png` | `024eac21eadea7807ab077b80c1dcfa426f6d8fdd3434955ae0744629392956b` | 表单保持一个主提交动作；保存业务数据并 prepare 后才弹出 Modal；Modal 包含摘要、真实审批路径、返回修改和确认提交 |
| 移动五核心页 | `codex-clipboard-2e040551-82ea-56f6-954b-6dddde2b2d78.png` | `99f6abe17fd7cd1be10f3534d268aa1c8f10f1ad31b3739126597b5d1b6172aa` | 独立工作台、数据列表、表单提交、底部审批预览、流程任务详情；卡片、状态、附件、时间线、底部安全区操作栏和正式图标必须齐全 |

每页实现必须同时通过结构断言、交互断言和指定视口截图回归。字段内容可以换成真实业务数据，页面区块、相对层级、对齐、主动作顺序和语义色不得擅自删减。

### 1.2 线上复核增量基线（2026-08-17）

P1-P5 的技术链路交付不等于产品模板验收。用户在 reference-environment preproduction 复核后发现页面仍存在重复信息、列表交互退化、文件组件能力退化、环境入口和流程业务引用错误，因此 P1-P5 的产品状态重新打开；以下七张实拍图与本节合同覆盖 1.1 中冲突的旧描述。

| 复核基线 | 评审附件 | SHA-256 | 新增或修正合同 |
| --- | --- | --- | --- |
| 当前模板问题页 | `codex-clipboard-b5ffafbe-341b-5f5e-be41-d9287d22eb28.png` | `8ce67f32f9c69d51fd985f8a1623a6c41fcf8760775001a62736ab6fd3d6ddc3` | 顶栏和缓存标签已表达当前位置时，内容区不得重复面包屑、页标题和说明；全局顶栏不显示搜索框 |
| 参考 Shell | `codex-clipboard-c75fa20f-ddb3-5414-90b1-7f200a1b07da.png` | `46bd393288080486a573aba9a09768a4f2647badc6fdc76c93d9358041ea14ac` | 侧栏分组、图标、选中态、顶栏与标签几何采用成熟企业后台密度 |
| 参考侧栏 | `codex-clipboard-438dc27b-2ce3-5611-8447-149f150df483.png` | `40d851713e2f4eaf4c029fc8234d636e6c0f654fc63658fdf10ac322683eb2c5` | 分组、子项、折叠和滚动区可辨识，图标统一使用语义色和正式图标 |
| 参考标准列表 | `codex-clipboard-a089cc96-bd43-50d1-95d7-1562a20a9d2e.png` | `cb3945283db167c4aeb747d8fd5613cf7107d356db72e73d824d56d50170916c` | 筛选默认一行并可展开更多；筛选下方左侧为业务操作，右侧为刷新和列表设置；表格支持服务端排序 |
| 参考列表设置 | `codex-clipboard-4d240f9b-002d-5f12-b70d-c4ca9ab360fa.png` | `0bb7c01364cb5161b2fe0591409cb0e97132bdf8ea32f37fcc71b155001e317d` | 设置抽屉固定包含“搜索项、列设置、排序、显示”四类账号级偏好，不修改资源合同 |
| 当前流程预览问题 | `codex-clipboard-2abe61fe-f85b-530a-b110-491d3657d25d.png` | `421d011f1d939763b02f8b1ff0c7a5c15a0134e38d5129770631d8a26a85d81c` | 提交预览只展示审批路径，不重复业务表单摘要；审批节点必须展示内核解析出的具体审批人，不能用“无需指定审批人”掩盖未解析状态 |
| 当前流程详情错误 | `codex-clipboard-c6b4faaa-d839-54fa-b3bc-2887735b617c.png` | `4263041dddd7307ce69f390f8a36b9195f9d1314d846b47f415fcb5e959268d7` | 流程 Surface 必须提供可验证的 DataRef，详情只能据此读取业务数据；缺失引用是合同错误并须在提交链路修复 |

本轮另外冻结三项行为合同：应用列表打开时优先进入已激活 production，否则自动进入已激活 preproduction；preproduction 顶栏在 production 已发布时提供快捷切换；官方模板必须提供覆盖全部稳定字段类型的验收表单。附件和图片继续由 `openxiangda-field-kit` 消费 Files API，迁移 1.x 已验证的上传、下载、预览、缩略图、进度、失败重试和删除交互，但 2.0 不依赖 1.x 运行包、不新增第二份文件协议。

## 2. 问题证据

1. `ProLayout` 未显式提供唯一菜单选中键，`/admin` 与其子路径可能同时高亮。
2. 缓存标签直接使用 `Tabs editable-card` 并以局部 CSS 修补，标签、侧栏、顶栏和页面边界没有共同几何基准。
3. 工作台、数据列表和移动页面只完成通用组件拼接，没有落实已评审稿的信息层级、色彩、图标和状态设计；线上复核还发现内容区重复标题、顶栏冗余搜索和标准列表能力退化。
4. 部门字段只提供关键词扁平搜索。平台后端能返回真实部门和路径，但当前 2.0 Field Kit 没有根组织浏览、树展开、懒加载、面包屑和完整路径展示。
5. 参考应用把用户 ID 同时写入目录值的 `label` 与 `value`，导致列表出现裸 UUID。
6. Chromium 测试只验证可见与可点击，没有唯一菜单选中、裸 ID、组织树、视觉截图和布局几何门禁。
7. 应用入口固定打开 production，未发布 production 时没有回退到 preproduction；用户端快捷入口丢失应用基础路径并错误跳转到 `/m`。
8. 流程预览重复展示业务摘要且没有稳定呈现具体审批人；流程详情收到的 DataRef 不完整时只能展示“业务数据加载失败”。
9. 2.0 文件控件只保留最简上传路径，未达到 1.x 已稳定的预览、下载、缩略图、进度、失败恢复和删除体验。

## 3. 能力所有者与稳定不变量

| 能力 | 唯一所有者 | 不变量 |
| --- | --- | --- |
| 路由、菜单、缓存标签描述 | 应用 route manifest，经 `openxiangda-admin` 投影 | 不维护第二套路由或菜单树；任一路径只选中一个最具体菜单项 |
| Admin 布局和标准页面 | `openxiangda-admin` | 应用不能复制 Shell、ProTable、ProForm、详情和流程标准壳；内容区不重复顶栏已有上下文 |
| 移动页面组合 | `openxiangda-user/mobile` | 与 Admin 分离，只消费同一身份、Data、Workflow 和 Field Kit 合同 |
| 字段值和渲染 | `openxiangda-contracts` + `openxiangda-field-kit` | 保持已经运行稳定的值协议，不以显示字符串替换平台值 |
| 人员和部门目录 | Platform Server Directory API | Field Kit 不复制组织数据；平台 API 是唯一事实来源 |
| 文件 | Platform Server Files API + Field Kit | 上传、下载、鉴权、预览和稳定文件值不得由应用自建 |
| 环境 head 与默认应用入口 | Platform Server Environment Head + 平台管理前端 | production 存在时优先，否则回退 preproduction；前端不维护第二份发布状态 |
| 显示身份 | Native Principal/RoleSession/Directory | 默认页面不得显示 UUID、内部 code 或原始 JSON |
| 业务数据和流程状态 | Data/App API 与 Workflow Kernel | 页面只解释合同，不复制权限、审批或状态机规则 |

1.x View、1.x 工作流、1.x 自动化和 `tools/openxiangda` 不依赖本轮包，也不接受本轮修改。

## 4. 实施阶段

### P0 设计合同和门禁

- 修正 PC、移动设计文档，删除“只参考信息架构、不还原设计”的降级条款。
- 为工作台、列表、表单、流程预览、详情和移动五屏记录布局、颜色、间距、状态和唯一主动作。
- 建立与冻结稿同尺寸的 1536x1024 PC 基线，以及 390x844、375x812 移动视口基线。

完成条件：设计基线可以转换为机器断言，当前线上页面应明确失败。

### P1 Admin Shell

- 由最具体的可见菜单路径确定唯一 `selectedKey`。
- 统一 56px 顶栏、44px 标签栏、220px 侧栏和页面内容网格。
- 用 Ant Design 公开 Tabs API 和语义槽实现有界缓存标签，不使用默认 editable-card 外观。
- 完成品牌、折叠、通知、个人中心、身份切换和环境标识的固定位置；移除当前没有完整能力闭环的全局搜索框。

完成条件：菜单唯一选中；标签、顶栏和内容区边界对齐；直接 URL、详情路由和身份切换均保持正确。

### P2 平台 Field Kit

- 保持现有人员、部门、地址、附件等稳定值协议。
- 将 1.x 已验证的部门树交互迁移或桥接到 2.0：根组织、懒加载、关键词搜索、面包屑、完整路径、单选/多选和移动底部面板。
- 人员选择支持按组织浏览和搜索；列表、详情和表单共享显示解析。
- 附件与图片继续只走平台文件组件；日期、区间、下拉、级联和地址逐项验证移动体验。

人员按组织浏览本轮决策：

- 平台 Directory API 是人员和部门的唯一事实来源，不在应用、Devkit 或浏览器建立组织副本。
- 新增的人员浏览合同以部门 ID、页码和页大小为输入，直接复用平台现有 `getDepartmentMembersPage(..., true)` 可见范围检查；每页最多 100 人。
- 关键词搜索保持原合同，按部门浏览是独立的加法合同；失败必须显示可重试错误，不能降级为自由文本或裸 ID。
- Field Kit 继续持久化 `{ label, value }`，组织路径只作为显示元数据；身份 epoch 变化后丢弃旧请求。
- 回滚以 Directory 加法路由、Devkit 方法和 Field Kit 消费提交为边界，不迁移数据库、不修改 1.x 控制器。

完成条件：真实平台组织数据可从根节点浏览；源码没有 ID-only 目录值；未知内部编码在开发阶段失败而不是进入页面。

### P3 标准 PC 页面

- 工作台：问候、四个有界指标、待办、快捷入口、趋势与最近活动。
- 数据管理：默认一行筛选、更多筛选、服务端搜索/排序/分页、搜索项/列/排序/显示设置、密度、刷新、导出和有界行操作。
- 表单：分组、字段策略、附件和一个主提交动作。
- 流程：点击提交并保存业务数据后才打开真实审批预览 Modal；Modal 只展示含具体审批人的真实路径，不重复业务表单摘要。
- 详情：业务字段、审批时间线、审计记录和 Surface 允许的操作。

完成条件：设计稿中的层级与操作顺序逐页面通过截图和交互验收，采购领域代码不进入通用包。

Admin 工作台还原本轮决策：

- 问题证据是冻结基线中的 PC 工作台与当前实现在顶栏信息层级、快捷入口数量、待办表格、指标变化信息和卡片几何上不一致；设计附件是唯一验收源。
- `openxiangda-admin` 是 Shell 和工作台结构的唯一所有者；模板 HomePage 只提供真实有界数据、图标、文案和跳转，不复制布局 CSS。
- 稳定合同是 56px 顶栏、44px 标签栏、220px 侧栏、四列指标、左待办/右快捷入口、左趋势/右最近活动；业务数据变化不得导致布局跳动或裸 ID。
- 请求失败分区降级为可读空态，不阻断 Shell；身份 epoch 变化后废弃旧请求。待办最多 5 条、最近活动最多 5 条、快捷入口最多 4 个、图表最多 7 个时间点。
- 回滚边界是 `openxiangda-admin` 工作台/Shell 提交和模板 HomePage 组合提交；不修改 Data、Workflow、Directory 或 1.x 运行时。
- 可证伪验证包括 1536x1024 几何断言、工作台截图基线、唯一菜单选中、四指标/两工作区/两活动区可见与页面无运行时错误。

标准列表、表单、流程与详情本轮决策：

- 问题证据是冻结基线中的标准列表和提交预览拥有明确的搜索、工具栏、表格、分页、单一主动作与审批 Modal 层级，而当前实现仍以组件默认排版为主，缺少冻结视口截图门禁。
- `openxiangda-admin` 唯一拥有标准列表、表单、详情、审批预览与流程详情的页面结构；应用只提供资源/字段定义、业务数据保存函数、文案、图标和路由，不复制通用页面 CSS，也不在页面内重建权限或流程规则。
- Data/App API 唯一拥有业务数据，Workflow Kernel 唯一拥有 preparation、Surface 和任务状态；页面必须先保存业务数据再 prepare，只有用户点击主提交按钮后才能打开预览，确认后使用同一 preparation token 发起流程。
- 列表只发有界的服务端分页、筛选和排序请求；搜索提交覆盖旧请求，身份 epoch 变化后旧响应无效。列配置只保存显示偏好，不改变资源合同。删除与流程动作保留 revision/idempotency 并显示明确冲突或失败。
- 页面不显示裸 ID、内部 code、原始 JSON、token 或未经 Directory/Field Kit 解析的平台值；附件和图片只经 Files/Field Kit，人员、部门、地址、日期、选项等继续保持稳定值协议。
- 回滚边界是 `openxiangda-admin` 标准页组件与模板组合提交；不修改 Data、Workflow、Directory、Files 后端合同，不触碰 1.x 页面、流程和自动化。
- 可证伪验证包括 1536x1024 列表和表单/审批预览截图，搜索/重置/排序/分页/列配置交互，提交前预览不存在，保存与 prepare 后 Modal 出现，确认后进入详情，以及流程 Surface 只渲染后端允许操作。

### P4 独立移动用户端

- 重建工作台、申请列表、申请表单、提交预览、流程任务详情。
- 使用正式图标、状态标签、移动卡片、底部导航与安全区操作栏，不使用字符图标。
- 所有持久化字段经 `openxiangda-field-kit/mobile`。

完成条件：390x844 真机视口下完成申请与审批主路径，不加载桌面 `antd` 或 Admin DOM。

独立移动五页本轮决策：

- 问题证据是冻结移动五核心页基线与当前页面在品牌顶栏、正式图标、卡片层级、列表状态、表单密度、审批预览和任务时间线上均不一致；当前模板仍出现字符图标和业务 ID，不能作为官方最佳实践。
- `openxiangda-user/mobile` 唯一拥有移动 Shell、工作台、列表、表单、审批预览和任务详情结构；模板只提供有界业务数据、字段定义、文案、图标语义和路由，不复制移动页面壳与通用 CSS。
- 移动端是独立 DOM 与路由树，不加载 `openxiangda-admin` 或桌面 `antd`；所有持久化输入和值展示继续经 `openxiangda-field-kit/mobile`，不得绕过既有人员、部门、地址、日期、选项、附件和图片值协议。
- Data/App API 唯一拥有业务数据，Workflow Kernel 唯一拥有 preparation、Surface、时间线和操作。提交页只有一个主动作，点击并保存业务数据、完成 prepare 后才显示底部审批预览；详情底栏只展示 Surface 返回且允许的操作。
- 首页待办、最近使用和快捷入口均有界；列表保持服务端分页、筛选与下拉刷新。身份 epoch 变化后废弃旧响应。目录或文件能力失败时展示可重试状态，不能退化为自由文本、字符占位或裸 ID。
- 资源边界是 390x844 与 375x812 两个目标视口、底部安全区、列表单页 20 条、首页最近事项最多 5 条、快捷入口最多 4 个；不为桌面宽度增加响应式分支。
- 回滚边界是 `openxiangda-user`、`openxiangda-field-kit` 移动渲染和模板移动组合提交；不修改稳定字段存储协议、Data/Workflow/Directory/Files 后端合同，也不触碰 1.x View、流程或自动化。
- 可证伪验证包括五个独立页面结构断言、提交前无预览、prepare 后底部预览、确认后进入流程详情、无裸 UUID/内部 code/字符图标，以及 390x844 和 375x812 截图回归；本地 fixture 只稳定视觉，真实能力仍在 P5 preproduction 验收。

### P5 候选、发布和在线验收

- 工具链执行 `pnpm verify:affected`；正式候选执行 `pnpm verify:release` 和 Changesets。
- 从候选 tarball 在空目录创建新应用并完成 generate/check/test/build。
- 同步独立参考应用，以同一 AppPackage 部署 reference-environment preproduction。
- 线上验证 OAuth2、RoleSession、真实 Directory、Data/App API、Workflow 和 Files；通过后才把同一 AppVersion 晋级 production。

## 5. 失败、并发、安全与资源边界

- 身份 epoch 变化后取消或丢弃旧请求；菜单、标签和显示缓存不得跨 identity scope。
- 标签最多 12 个，保活页面最多 6 个；截图基线不能依赖随机数据或内部 ID。
- 组织树按需加载，单页搜索和子节点都有界；目录失败显示可重试错误，不降级成自由文本输入。
- 列表只使用服务端分页、排序和筛选；工作台图表只消费受限聚合。
- 浏览器不持久化 token、权限结论、组织副本、业务响应或流程 preparation token。
- 任何裸 UUID、原始 JSON、内部环境 key、角色 code 或流程节点 key进入默认页面都视为构建或 E2E 失败。

## 6. 回滚边界

- P1-P4 分别以 `openxiangda-admin`、`openxiangda-field-kit`、`openxiangda-user` 和模板提交为源码回滚单元，但不发布混合代际包。
- 远端回滚以完整 AppVersion 为单位；不在运行时保留旧 Shell、旧移动页面或目录自由输入兼容开关。
- 目录 API 若需要扩展，只增加有界浏览合同；现有搜索合同保持可用。不得建立第二份组织存储。
- 1.x 不参与发布、迁移或回滚。

## 7. 可证伪验收矩阵

| 范围 | 必须通过 |
| --- | --- |
| Shell | 任一路径恰好一个菜单选中；标签边界对齐；无全局搜索和内容区重复标题；直接 URL、关闭、恢复、身份/环境切换正确 |
| 视觉 | PC 冻结稿尺寸 1536x1024（并补充 1280x800 结构检查）；移动 390x844、375x812 截图回归 |
| 数据 | 默认一行与更多筛选、服务端搜索/排序/分页、四类列表设置、空/错/加载、revision 冲突 |
| 字段 | 官方验收表单覆盖 `text/textarea/number/money/percent/boolean/date/datetime/dateRange/option/options/radio/checkbox/cascade/user/users/department/departments/attachments/images/address/location/richtext/signature/subtable/json/serial/workflowStatus`；关联表单组件弃用 |
| 目录 | 打开即能看到真实根组织；树展开、搜索、路径、单选/多选和失败重试 |
| 身份 | 页面显示真实姓名/部门；正则扫描页面不存在裸 UUID |
| 流程 | 提交前没有预览；保存和 prepare 后弹窗；预览仅含具体审批人路径；Surface DataRef 可读业务数据；同意、拒绝、转交、回退、加签和代理按 Surface 展示 |
| 边界 | 移动包没有 Admin/桌面录入依赖；应用没有自建人员、部门和文件协议 |
| 发布 | 新建应用与独立参考应用使用相同候选包；preproduction 在线通过后才允许 production 晋级 |
| 环境 | 应用列表 production 不存在时自动进入 preproduction；preproduction 可切换到已发布 production；用户端跳转保留应用 base path |

## 8. 交付记录

| 日期 | 阶段 | 状态 | 证据 |
| --- | --- | --- | --- |
| 2026-08-16 | P0 | 已完成 | 完成线上问题审计；PC/移动设计文档已从“信息架构参考”升级为可执行设计合同；本计划已记录所有权、不变量、失败边界、回滚和验收矩阵 |
| 2026-08-17 | P1 | 已完成 | Admin 按最长可见路径保持唯一菜单激活并支持无路径菜单组；Shell 固定为 220px 侧栏、56px 顶栏、44px 标签栏，具备折叠、面包屑、菜单搜索、通知入口、环境、身份切换和个人中心；工作台完成四色指标、真实待办、四宫格快捷入口、7 日趋势与最近活动。Playwright 在 1536x1024 验证几何、交互、无运行时错误，并冻结 `admin-workbench-1536x1024-chromium-darwin.png` 截图基线 |
| 2026-08-16 | P2 | 已完成 | Directory v2 已提供按层部门树和按部门分页人员浏览，直接复用平台已有的可见范围，不建立第二份组织存储；Desktop 以左树右人员列表和全局搜索消费合同，Mobile 以独立组织钻取和本部门人员面板消费合同；Field Kit 对仅含 ID 的历史稳定值调用 Directory resolve，未知值显示语义占位而不暴露内部 ID。平台定向 4 测试、Devkit 50 测试、Local Platform 21 测试、Field Kit 8 测试与 `verify:affected` 35/35 任务通过 |
| 2026-08-17 | P3 | 已完成 | 标准列表将主动作、搜索卡、表格工具、服务端分页与行操作分层；详情统一字段渲染与审计；流程表单按 section 分组且只有一个主提交动作，保存业务数据并 prepare 后才展示含业务摘要和真实节点的确认 Modal，确认后进入无裸 ID/code 的流程详情。已冻结 `admin-data-list`、`admin-data-detail`、`admin-workflow-form`、`admin-workflow-preview`、`admin-workflow-detail` 五张 1536x1024 Chromium 基线，并以第二次不更新快照的运行证明基线稳定；边界 fixture 仅用于视觉确定性，真实 PostgreSQL/NestJS 和 preproduction 验收仍保留在 P5 |
| 2026-08-17 | P4 | 已完成 | 独立移动用户端已按冻结稿重建工作台、数据列表、表单提交、底部审批预览和流程任务详情；使用正式 SVG 图标、语义状态、移动卡片、安全区操作栏和独立路由树，人员、部门、日期、选项、地址、附件与图片仍全部经 `openxiangda-field-kit/mobile`。已冻结五张 390x844 核心页基线和一张 375x812 工作台基线；连续不更新快照运行 2/2 通过，页面无裸 ID/code，`verify:affected` 19/19 任务通过，移动入口依赖门禁确认未加载桌面 Admin/Ant Design。视觉 fixture 只用于确定性截图，真实 OAuth2、Directory、Data、Workflow 与 Files 保留到 P5 reference-environment preproduction 验收 |
| 2026-08-17 | P5 | 已完成 | 平台后端不可变版本 `20260817-043631-6fd2f6136179abca` 已部署 reference-environment，102 条 SQL migration 预检为 0 pending/0 conflict，K3s 后端 1/1 Ready；参考应用 AppVersion `4d2de2a1-e228-5a2c-84b6-db8e35b3eb9f` 只部署 preproduction。真实 OAuth2 用户和应用管理员 RoleSession 验证 Directory 根部门/部门人员/裸 ID 解析、Data/App API 用户审计字段、Files 完整下载；Workflow 实例 `8fcac474-7b31-5f04-828c-1f59b4f5200b` 完成部门负责人、财务复核员、采购管理员三角色切换和审批，最终 `approved`，时间线与 created/completed 工作中心均通过。独立参考应用 `da67d7d` 固化了仅允许 preproduction、默认只读且不输出凭据的可重复验收脚本和收据；production 保持停止，平台入口、参考应用 Admin 与 1.x instrument reference app Admin 均返回 HTTP 200 |
| 2026-08-17 | 产品复核 | 重新打开 | reference-environment 实拍证明 P1/P3/P5 仍有可见回归：重复页面上下文、列表设置缺失、文件控件退化、流程预览与 DataRef 错误、环境入口错误。此前“已完成”仅保留为技术链路证据，不再代表官方模板验收通过；按 1.2 增量基线重新开发、截图和在线验收 |
| 2026-08-17 | 产品复核本地修复 | 已完成，待线上 | 已关闭内容区重复 PageHeader 与全局搜索；标准列表具备默认单行/更多筛选、平台目录筛选、左右工具区和四类账号级设置；Files Field Kit 恢复拖拽、图片、进度、取消、鉴权预览、下载和未绑定清理；审批预览只展示具体审批人路径，Surface 统一 `dataRef`；应用入口 production 不存在时回退 preproduction，用户端链接保留应用 base path；组件验收页覆盖全部稳定字段类型。Admin Chromium 主链路 1/1、Mobile 2/2、Admin/Field Kit 单元测试与模板生产构建已通过，新增 `admin-field-gallery-*`、更新 `admin-data-*` 与 `admin-workflow-*` 1536x1024 基线；尚未替代 reference-environment 真实 OAuth2/Directory/Data/Workflow/Files 验收。 |
