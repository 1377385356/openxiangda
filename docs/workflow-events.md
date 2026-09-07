# Workflow 与 Notification Hub 2.0 边界

标准 Workflow 与 Notification Hub 已作为 OpenXiangda 2.0 可选平台模块重新开放。它们不属于默认 CRUD 模板，也不兼容或复用 1.x 工作流、消息中心、模板、卡片、回调、表和 API。

## 标准详情与当前用户入口

普通记录、流程记录、任务和实例复用同一详情框架。流程详情提供申请内容、审批历史和变更记录三个标签页；管理员在当前抽屉或页面中切换到普通表单编辑，直接保存并自动留下变更记录，审批结果保持不变。PC 子表在表格内编辑，父表提交时统一校验。

待办中心通过 Workflow 查询 `pending`、`handled`、`created`、`cc` 四种视图；消息中心默认向 Notification Hub 查询 `view=all`，沿用应用声明的渲染扩展。各入口按服务端 `detailNavigation` 打开详情，页面不自行拼接人员范围。

抄送由动态 Surface 提供 `cc` 操作，使用 `user_select` 多选组件收集 1 至 20 位人员。任务 Surface 可以正式包含实例抄送命令；前端按 `operation.execute.href` 和该 Surface 的 token 提交，不另造任务命令或 token。公共事件为 `openxiangda.workflow.instance.cc_added.v2`。

## 能力 owner

- Workflow Kernel v2 唯一拥有定义、实例、任务、参与人、命令、流转、委托、加签和流程审计。
- Application Events v2 唯一拥有已提交事实的 journal/outbox、顺序、投递和回执。
- Notification Hub v2 唯一拥有逻辑消息、模板、规则、渠道路由、渲染、发送、更新、关闭、外部绑定、动作收据和消息运维。
- Data API/App API 唯一拥有业务记录；Workflow 只保存 `dataRef` 和 revision-bound facts，消息只保存允许展示的安全投影。
- Native Identity/AuthZ v2 唯一拥有当前用户、当前应用角色并集和数据范围；Perspective 只影响读取展示，不改变 Workflow 的发起、任务与操作授权。

Workflow 发起只接受 `{ resourceCode, id }` 形式的 `dataRef`，并要求独立的
正整数 `dataRevision`。definition 的 `inputSchema` 根对象必须显式
`additionalProperties: false`，未声明的 facts/answers 直接拒绝。Provider
回调只接受带完整业务/数据/definition/binding/fact digest 的
`openxiangda.workflow-assignee-request/v2.1`。

## 标准工作流范围

首期只支持 `approval`、`condition`、`end`，以及 `single`、`any`、`all`、`sequence` 审批模式。标准操作为提交、同意、拒绝、退回、重新提交、转交、委托、前/后加签、撤回、管理员改派、管理员终止和不改变流程状态的催办。

复杂业务状态机继续放在应用领域服务。不要把任意 JavaScript、Service Task、BPMN、通用长事务或业务记录复制进 Workflow。

所有页面和消息动作必须来自后端 Workflow Surface 的 `operations[]`。前端、模板和渠道 Adapter 不自行推断操作权限。
Surface 同时签发短期、一次性的 `commandToken`，绑定当前用户/会话、应用环境
Head、实例/任务版本、允许的命令集合与 CSRF。命令请求只提交
`commandToken + idempotencyKey + input`；旧的 caller-authored
`expectedTaskVersion`/`expectedInstanceVersion` 不再是合同。冲突必须刷新 Surface，
不得自动重放旧意图。

## 事实和消息投影

Workflow 在同一 PostgreSQL 事务中提交状态、fact 和 outbox。每个实例使用严格单调的 `instanceSequence`，每位审批人拥有独立 participant 生命周期。

Native Data 事件的 capture plan 由当前 Head 的 Event、Data、AuthZ revision
与 resource 四元组共同确定。新增快照字段或扩展 RLS 会形成新的不可变 plan，
不会与旧 plan 冲突；历史 replay/re-emission 复制原 fact 的数据与 plan digest，
不会用当前 Head 重新投影历史事实。

每条 Workflow fact v2 都必须携带不可变实例身份信封：`workflowCode`、
`definitionVersion`、`bindingVersion`、`instanceId`、`generation`、
`businessKey`、`instanceSequence`、`revision`、`dataRef`、`dataRevision`、
`actor` 与 `cause`。消费者不得从当前 Workflow Head 反推历史事实版本。

配置中的 `workflows.activations` 是完整 desired set；删除声明即停用新发起，
不是增量 patch。definition 和 activation 必须一致声明
`acceptedCommandDeactivationPolicy`：`finish-pinned` 让已接受的 durable process
command 按固定版本完成，`cancel-on-deactivate` 在声明删除后取消尚未启动的命令；
既有 Workflow instance 始终按固定版本继续。所有审批人 Provider 的 `min/max`
默认 1/200，最大 200。
需要按流程实例串行投递时只声明 `ordering: 'workflow-instance'`，不接受下划线别名。

Notification Hub 消费事实：

- `participant.activated` 创建待处理消息；
- participant 完成、转交、委托、加签、暂停或恢复时更新对应收件人的逻辑消息；
- instance 完成、拒绝、撤回或终止时更新该实例全部历史消息；
- 消息回调必须调用 Workflow 命令，等待 Workflow 新事实后再更新卡片。

发送采用至少一次语义，以 `messageKey + recipient + channel` 幂等。RabbitMQ 只负责唤醒，PostgreSQL fact、message projection、outbox 和 receipt 才是恢复事实。

## 详情跳转

消息使用 canonical `navigationTarget`，而不是模板拼接环境 URL。它可以描述平台路由、应用路由或白名单外部地址，由平台按 tenant、environment 和 channel 解析 desktop/mobile/deep link。

详情地址不能携带登录 Token、Cookie 或任何身份替换凭据。点击后必须重新认证，并由 Data/AuthZ/Workflow 执行真实权限校验；当前 Perspective 只能重新应用读取投影。

“跳回业务记录”和“完全接管流程详情”是两个不同合同。标准 Workflow 页需要提供
“查看业务详情”时，在 subject resource 上声明明确的 route code 对：

```ts
const purchaseResource = {
  code: 'purchases',
  name: '采购申请',
  detailRouteCode: {
    desktop: 'purchase-record-detail',
    mobile: 'purchase-record-detail-mobile',
  },
  fields: [/* ... */],
} satisfies AppDataResourceDeclaration;
```

两条 route 都必须是已认证的 `surface: 'user'` 页面并要求该资源的 read capability；
桌面 path 不得进入 `/m`，移动 path 必须以 `/m/` 开头，且各自只能包含一个动态记录参数。
参数名可以是业务语义名，例如 `:purchaseId` 或 `:applicationId`。编译器把映射写入
不可变资源 Contract 和生成的 `resourceDefinitions`，平台从同一环境 active Contract
读取并代入 Workflow Surface 已授权的 recordId。未声明时返回空业务记录目标；已发布
映射畸形时严格失败。平台和浏览器都不得再按 `resourceCode` 猜路径，也不得用别名补洞。

流程需要完全接管详情页时，在 definition declaration 上声明桌面端与移动端 route code：

```ts
{
  version: 1,
  definition: purchaseApproval,
  launch: { mode: 'work-center-only' },
  detailRouteCode: {
    desktop: 'purchase-detail',
    mobile: 'purchase-detail-mobile',
  },
}
```

`desktop` 必须引用 `surface: 'admin'` 的 route，`mobile` 必须引用
`surface: 'user'` 的 route；两个 path 都必须且只能包含
`:instanceId`。任务入口由平台追加有界 `taskId` query。应用使用
`defineApplicationContributions(appRoutes, { pages })` 绑定桌面和移动组件，
页面通过 `openxiangda/core` 的 `loadWorkflowInstanceDetail`、
`loadWorkflowTaskDetail` 读取修订一致的聚合详情，只渲染 Surface 返回的操作。
旧 Surface 与 timeline 读取继续供兼容客户端使用。

平台在当前环境 Head 的不可变 Contract Bundle 上统一解析：桌面/移动工作台、
Notification Hub 的 `workflow.detail` 逻辑目标、钉钉卡片以及其他渠道快照得到
同一组自定义路径。未声明时保留标准详情；声明存在但 route 缺失、surface 错误或
path 不合法时严格失败，不退回标准页掩盖合同错误。

标准详情由平台统一渲染，不要求应用复制资源详情页。Workflow Surface 的
`presentation.businessDetail` 按实例固定的 Data logical revision、资源声明 digest 和
physical resource 定位结构，但每次读取同一 Native Data record 的当前字段值；发起时
`requestedRevision` 只用于命令 token/CAS，当前 `sourceRevision` 和当前值始终随重新读取更新，
禁止把业务字段值改成流程启动快照。字段投影同时应用当前用户策略并统一排除
`system: true`、平台内部字段与过滤后为空的分组；
父子表按同一 logical revision 和父记录外键读取，单表最多 200 行。页面同时消费
`presentation.summary`、服务端 timeline `display.entries` 和 operation descriptors。
桌面端与移动端拥有独立 DOM；同意/拒绝等决策操作固定在底部主操作区，转交、退回、
加签等低频操作进入“更多操作”，意见只在点击动作后的确认弹窗或移动端底部抽屉中输入。
`stale` 只是 revision 元数据，不显示常驻横幅也不预先阻断操作；只有服务端命令 token/CAS
返回真实 `freshSurface` 冲突时才提示“内容已更新，请刷新后重试”，且绝不自动重放命令。
同意、拒绝、退回、转交和加签记录并入对应纵向节点；实例撤回/终止是独立终态事件，
展示操作者、动作、意见和唯一 `primaryDisplayTime`，
不另设“操作记录”。标准业务页不渲染流程/任务/资源/记录 UUID、事件序列、revision 或失败指针。
申请人、审批人和操作者显示目录/快照解析名称、可选部门以及真实头像；缺失或加载失败时
统一使用平台默认头像，不生成姓名首字，也不回退 userId。

PC 标准任务与实例详情的 canonical 路径分别为 `/tasks/:taskId` 和
`/workflows/:instanceId`，使用独立全屏页面，不进入后台 Shell；不提供旧 admin 路径的
别名或重定向。移动端继续使用独立的 `/m/tasks/:taskId` 和 `/m/workflows/:instanceId` 页面。

流程详情中的附件、富文本图片和签名不直接复用普通 Data API 文件地址。浏览器调用
Workflow instance-scoped preview/content 路由，平台在每次文件读取时重新校验当前身份、
实例参与权限、固定业务记录、资源、字段和 file id；URL 不携带登录态或替代身份。

标准发起页使用独立的 `WorkflowLaunchSurface` 读取当前激活合同：桌面路径为
`/workflows/:workflowCode/start`，移动路径为
`/m/workflows/:workflowCode/start`。`standalone`/`hidden-handoff` 缺省使用同一个
compiler-owned `processOperationCode`、subject declaration 和标准 process commit；平台在一个
事务中写业务数据和 durable command。action-owned 资源改为声明
`launch.submission.kind: 'named-operation'`，显式绑定 create/existing 请求来源、响应 subject/
processCommand 路径和 allowlisted context 预填。标准页调用原 Named Action，由应用服务端保留
业务校验、幂等与原子提交；缺少/null processCommand 是成功的免审结果，不生成流程。页面只在
确实返回 command 时把 `commandId` 写入 URL，刷新、跨设备和 worker 恢复都重新读取
`ProcessCommandSurface`；`awaiting_input` 只回答已生成 requirement，`started` 再进入 pinned
instance entry。浏览器不再导出 prepare/start 发起协议。

通用应用待办页通过 `frontend.user.applicationTodoCenter: true` 启用，平台同时提供
`/todos` 和 `/m/todos`。它只投影当前登录用户的 Notification Hub 收件人数据，
`查看详情` 使用上述统一导航解析；待办页不常驻业务详情，审批命令仍在目标 Workflow
Surface 上执行。

## 应用声明

应用只在明确启用可选模块时，在 `openxiangda.config.ts` 声明 workflow definition、binding、assignee provider、notification profile、template reference 和安全字段投影。Git 声明是拓扑事实源；平台管理页面只负责版本、激活、预览、诊断和有界运行参数，不建立第二份活动定义。

事件处理器调用 `OpenXiangdaBusinessNotificationService.sendFromEvent()` 时，
对应订阅还必须声明
`platformAccess: { notification: { mode: 'business-standard' } }`。编译器将该声明写入
不可变 Configuration/Contract Bundle，并据此生成精确的 `notification-hub-v2`
能力闭包；不发送通知的订阅不得声明该依赖，未知 access 或 mode 直接失败。

## 验证

至少验证：完整标准详情投影、父子表边界、流程附件读取、桌面/移动独立渲染、全部标准操作、多人模式、重复/并发命令、stale revision、重启 replay、乱序事件、重复回调、消息终态全量更新、详情跳转、错用户/错租户/过期动作、渠道超时/unknown、死信重放和 1.x 零触碰。
