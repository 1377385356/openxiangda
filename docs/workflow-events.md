# Workflow 与 Notification Hub 2.0 边界

标准 Workflow 与 Notification Hub 已作为 OpenXiangda 2.0 可选平台模块重新开放。它们不属于默认 CRUD 模板，也不兼容或复用 1.x 工作流、消息中心、模板、卡片、回调、表和 API。

## 数据事件捕获与历史

默认保存全部数据增删改事件。没有完整事件审计或历史回放要求的资源，可在
`events.capturePolicies` 声明 `{ resourceCode: 'items', mode: 'subscribed' }`。
共享编译器据发布版本中的订阅声明生成固定计划，仅捕获需要的操作事件；没有
`resourceCodes` 限制的订阅覆盖全部资源，暂时禁用的订阅仍计入需求。该策略需要
平台 `events.capture-policy` 能力，不能只升级本地 SDK。

未声明策略或使用 `mode: 'all'` 保持原行为。`subscribed` 不提供完整变更事件
历史，回放只针对实际保存的事实；改回 `all` 只恢复今后的捕获。需要完整事件
审计或未来任意历史回放时保留 `all`。数据库审计字段与事件历史是不同的契约。

必要事件仍与数据同事务提交；没有必要事件时不写事件事实、outbox 或唤醒投递。
权限、记录修订约束、文件引用、日期触发和流程命令继续生效，自定义 `emitEvent`
也不受该策略影响。策略通过正常应用版本发布、测试和生产晋级生效。

## 平台原生数据自动化

只涉及平台表单数据增删改的自动化，可以直接声明 `execution`，无需应用 Nest
服务和事件 HTTP 接收器。需要平台 `events.native-data-actions` 1.0.0 能力。
例如已声明 `items`、`copies` 模型及相应字段后：

```ts
events: {
  capturePolicies: [
    { resourceCode: 'items', mode: 'subscribed' },
    { resourceCode: 'copies', mode: 'subscribed' },
  ],
  subscriptions: [{
    code: 'copy-item',
    eventTypes: ['openxiangda.data.record.created.v2'],
    filter: { resourceCodes: ['items'] },
    execution: {
      kind: 'native-data', version: 1,
      operations: [{
        operation: 'create', resourceCode: 'copies',
        data: {
          name: { source: 'event', path: 'data.projection.name' },
          sourceId: { source: 'event', path: 'data.recordId' },
        },
      }],
    },
  }],
},
```

编译器自动收集必需的事件字段并固定目标资源摘要。动作效果与执行结果同事务
提交，重复消息和人工重放使用同一个效果标记。更新、删除还必须映射 `id` 和
`expectedRevision`，冲突不会覆盖新数据。常量使用 `{ source: 'literal', value }`。
首版支持数据事件、明确的源资源、最多 16 个操作、每次最多 32 个映射字段和
64 KiB 输入，不执行脚本、SQL、HTTP 或应用代码。目标模型发生不兼容变化时停止
旧动作并报告错误；关闭并排空此类动作后才能回退到不支持该能力的平台镜像。

外部 Webhook 和自定义代码仍使用已有签名、回执、重试及接收端幂等协议，按至少
一次投递处理。轻量操作历史仍通过已有审计 API 查询，不依赖是否订阅了事件。

## 定时与日期触发

除订阅平台数据事件外，`events` 还能声明两类自有时程触发器；两者都只负责在到期时
发出应用事件，业务效果仍由订阅（含 `execution: native-data`）或应用后端处理。

`events.timers` 按 cron 周期发事件。`code` 为 kebab-case 且唯一；`eventType` 必须是
`events.schemas` 已声明的应用事件；`cronExpression` 为六段 cron（秒 分 时 日 月 周），
`timezone` 使用 IANA 名称（如 `Asia/Shanghai`），最短触发间隔为 60 秒；`misfirePolicy`
目前仅支持 `coalesce_one`（错过合并为一次）；`payload` 是普通对象，必须完整满足所引用
事件的 JSON Schema 且不超过 64 KiB。定时声明属于环境中立的 AppVersion，不写
`environmentKey`；启用/暂停和下次触发时间由平台按环境管理。

```ts
events: {
  schemas: [{
    eventType: 'app.report.digest.v1',
    dataSchemaVersion: '1',
    jsonSchema: {
      type: 'object', additionalProperties: false,
      required: ['kind'], properties: { kind: { type: 'string' } },
    },
  }],
  timers: [{
    code: 'daily-digest',
    eventType: 'app.report.digest.v1',
    cronExpression: '0 0 9 * * *',
    timezone: 'Asia/Shanghai',
    payload: { kind: 'daily' },
  }],
},
```

`events.dateTriggers` 相对记录的 date/datetime 字段发事件：字段值加 `offset`（ISO-8601
时长，十年内，如 `-PT1H` 表示提前一小时）到达时触发。适合到期提醒、超期升级等场景；
同一条记录的字段更新后按新值重算。`code` 唯一，`eventType` 同样引用已声明应用事件。

两类触发器各最多 100 条。事件 Schema 用 `events.schemas` 声明
（`{ eventType, dataSchemaVersion, jsonSchema, sensitiveFields? }`），`eventType` 遵循
`xxx.yyy.v1` 版本后缀模式；触发器只发事件，不直接写数据或调用流程。

## 标准详情与当前用户入口

普通记录、流程记录、任务和实例复用同一详情框架。流程详情提供申请内容、审批历史和变更记录三个标签页；管理员在当前抽屉或页面中切换到普通表单编辑，直接保存并自动留下变更记录，审批结果保持不变。PC 子表在表格内编辑，父表提交时统一校验。

待办中心通过 Workflow 查询 `pending`、`handled`、`created`、`cc` 四种视图；消息中心默认向 Notification Hub 查询 `view=all`，沿用应用声明的渲染扩展。各入口按服务端 `detailNavigation` 打开详情，页面不自行拼接人员范围。

标准任务和实例详情的“返回”由应用 Router 使用同一份 route manifest 中对应设备的流程中心路径；没有中心条目时返回已声明门户。普通用户无需管理后台权限。应用独立消费 `WorkflowTaskPage` 或 `WorkflowInstancePage` 时，可以传入本应用已声明的 `returnPath`，例如 `<WorkflowInstancePage variant="mobile" returnPath="/m/work-center" />`。抽屉的 `onDismiss` 仍负责关闭当前抽屉；返回导航不授予目标页面权限。

抄送由动态 Surface 提供 `cc` 操作，使用 `user_select` 多选组件收集 1 至 20 位人员。任务 Surface 可以正式包含实例抄送命令；前端按 `operation.execute.href` 和该 Surface 的 token 提交，不另造任务命令或 token。公共事件为 `openxiangda.workflow.instance.cc_added.v2`。

## 钉钉卡片已读查询

Notification Hub 提供单投递的查询基础能力。钉钉一次请求一个 `processQueryKey`，最多返回同一条单聊消息 20 名接收者的状态；平台不提供跨 20 个独立查询标识的批量接口。应用自行选择消息、分组、展示和决定再次查询的时机。

浏览器应用直接使用 `openxiangda/core`，不需要新增应用后端：

```ts
import {
  getNotificationMessage,
  getDingTalkCardReadReceipt,
  refreshDingTalkCardReadReceipt,
} from 'openxiangda/core';

const message = await getNotificationMessage(messageId);
const delivery = message.deliveries.find(item => item.channelType === 'DINGTALK_CARD');
if (delivery) {
  const cached = await getDingTalkCardReadReceipt(message.id, delivery.id);
  if (cached.canRefresh) {
    await refreshDingTalkCardReadReceipt(message.id, delivery.id);
  }
}
```

Nest 的 `OpenXiangdaNotificationService` 提供同样的 `getDingTalkCardReadReceipt(messageId, deliveryId)`、`refreshDingTalkCardReadReceipt(messageId, deliveryId)` 以及 `getMessage(messageId)`。SDK 继承当前用户、应用和环境，不接收钉钉 token 或查询标识。需要平台通知读取及内容读取权限，跨应用或环境的投递不可查询。

GET 只读缓存；refresh 提交一次持久化任务，重复的待处理请求合并，有限重试后结束。`readState` 为 `unknown/unread/read`；`queryState` 为 `idle/pending/querying/succeeded/failed/expired/unavailable`。只有提供方明确返回未读才是 `unread`，已读不会倒退。任务完成后可再次读取缓存；SDK 不自动扫描或持续轮询业务消息。

`readAt` 统一为 ISO 时间，`lastCheckedAt` 记录查询尝试完成时间，结合执行状态判断结果新鲜度。查询窗口为发送后 24 小时；缺失原回执标识的旧消息保持不可查询。发送状态与已读状态独立。需要包含本能力的平台服务端版本，单独更新 SDK 不会创建服务端能力。

## 能力所有者

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

标准节点支持 `approval`、`condition`、`cc`、`end`，以及 `single`、`any`、`all`、`sequence` 审批模式。标准操作为提交、同意、拒绝、退回、重新提交、转交、委托、前/后加签、撤回、管理员改派、管理员终止和不改变流程状态的催办。

除命令集之外，平台为实例管理员提供两个维护动作：`admin_jump`（把处于运行或退回状态的实例跳转到指定节点）与 `admin_delete`（删除实例，可选同时删除表单数据、是否触发自动化）。两者走平台管理端点的预览/执行两步流程并要求同源浏览器请求，不属于应用声明的工作流命令，也不占用 `commandToken` 命令合同。

复杂业务状态机继续放在应用领域服务。不要把任意 JavaScript、Service Task、BPMN、通用长事务或业务记录复制进 Workflow。

所有页面和消息动作必须来自后端 Workflow Surface 的 `operations[]`。前端、模板和渠道 Adapter 不自行推断操作权限。

### 自动抄送 {#automatic-cc}

在固定拓扑中声明 `cc` 节点，进入时解析接收人、保存抄送事实，然后继续 `next`。
完整声明例子见 `examples/workflow-administration/automatic-cc.ts`：

```ts
copy: {
  id: 'copy', kind: 'cc', title: '抄送办理负责人',
  binding: 'readers', next: 'approved', emptyPolicy: 'block',
  administration: { assigneeProviders: ['app_role', 'fixed_users'] },
},
```

接收 binding 支持 `fixed_users`、`initiator`、`input_users`、`form_field_users`、
`app_role`、`app_role_in_scope`、`previous_node_actor`。仅使用事务内原生来源，
不支持 `application_provider` 或需要申请人交互的 `initiator_select`。名单按用户去重，
每次进入最多 20 人；`min/max` 默认 1/20，非空名单仍必须符合声明的下限。
角色查询超过 200 条有效成员行时明确拒绝，不能使用截断后的名单。
范围角色要求对应范围的 `cc` 授权（或未限制操作、`*`），仅 `approve` 不满足。
抄送不套用审批代理。

`emptyPolicy: 'block'` 在真实空名单时回滚触发动作，补齐人员后可重试原申请或任务；
`'skip'` 记录无人跳过并继续。未知角色、失效账号、非法输入和超限均属于错误，
不会被 skip 吞掉。通知默认开启；`notify: false` 仍保存抄送审计、事件和实例阅读关系，
Notification Hub 不生成该次抄送消息。渠道失败通过原 Hub 恢复，不回滚流程。

进入记录、系统抄送日志及事件在同一事务提交。原命令重放不重复抄送；退回等导致实际
再次进入时产生新轮次，可采用新的兼容节点配置，过去名单和配置保持冻结。时间线显示
“流程自动抄送”，不会把系统动作记为发起人的人工操作。

接收人可以使用既有抄送列表及实例详情，不获得审批权、后台权限或通用业务数据读取权。
标准流程详情由服务器按页面代码声明的固定详情字段投影读取；需要排除敏感字段时，
在 `crud.detail` 和 `subject.factProjection` 中明确选择允许字段，不能仅在浏览器隐藏。
通用 Data API 继续核验当前数据授权，流程节点不提供字段权限配置。

含 cc 的包自动声明 `workflow.automatic-cc@1.0.0`，平台正式迁移后自动提供该能力，
没有额外开关。管理员仅可修改名称、说明及代码显式开放的接收来源，
`next/emptyPolicy/notify` 保持代码所有；配置 SDK 见[应用管理](./administration.md#node-administration)。

### 工作流命令

Surface 同时签发短期、一次性的 `commandToken`，绑定当前用户/会话、应用环境
Head、实例/任务版本、允许的命令集合与 CSRF。命令请求只提交
`commandToken + idempotencyKey + input`；旧的 caller-authored
`expectedTaskVersion`/`expectedInstanceVersion` 不再是合同。冲突必须刷新 Surface，
不得自动重放旧意图。

### 撤回与业务终止策略

需要按业务时间限制取消时，在固定 Workflow definition 中声明：

```ts
instanceCommands: {
  withdraw: { beforeFact: 'startsAt' },
  terminate: {
    capability: 'app:reservation-center:meeting:cancel',
    beforeFact: 'startsAt',
  },
},
```

`beforeFact` 必须是 `inputSchema` 中 required 的根字段，类型为
`string`、格式为 `date-time`，并通过 `subject.factProjection` 映射到非空
`datetime` 业务字段。例如定义与模型的相关部分为：

```ts
// Workflow definition
inputSchema: {
  type: 'object',
  additionalProperties: false,
  required: ['startsAt'],
  properties: { startsAt: { type: 'string', format: 'date-time' } },
},
subject: {
  resourceCode: 'meetings',
  factProjection: { startsAt: 'startsAt' },
},
// meetings 模型字段
fields: [{ code: 'startsAt', label: '开始时间', type: 'datetime', required: true }],
```

时间值必须携带 `Z` 或 `±HH:mm` 时区，可省略秒的小数部分或使用 1–3 位小数，
例如 `2026-09-08T09:00:00+08:00`、`2026-09-08T01:00:00.000Z`。
标准字段和 Data API 将 datetime 规范化为毫秒 ISO 字符串后冻结为事实。
平台在锁定实例后，
按数据库当前时间严格判断 `当前时间 < 截止时间`；事先取得 token 不能绕过
后续的时限或授权检查。缺失或非法事实拒绝执行。Surface 到期禁用操作，
应用收到冲突后刷新详情，不自动换幂等键重试。

撤回始终只允许发起人。终止允许原应用超级管理员，或当前角色并集拥有
所声明精确 capability 的用户；capability 必须在同一应用显式声明，不支持
通配符。该授权同时允许读取对应流程实例的详情及时间线，包括完成后查阅；
不授予审批、抄送、改派、删除、普通数据读取或管理后台权限。撤销 capability
后读取和终止权限都失效。撤回、终止均要求填写原因；超级管理员也遵守已声明时限。

不声明 `instanceCommands` 时沿用既有行为；只为终止授权时可以省略其
`beforeFact`。声明策略的交付包自动要求平台能力
`workflow.instance-cancellation-policy`，旧平台无法激活该应用版本。
已经固定该策略的实例存在期间，平台回滚也必须保留策略执行能力。
发布新 definition 不会改写旧实例固定的 definition 版本，因此不会给旧实例
补上截止时间或业务管理员终止授权。升级前应盘点存量实例，按各自原定义完成
或由原有授权主体处置；不要通过重发事件或改写事实迁移策略。已使用新策略的
实例在截止后及终态仍允许当前被授权的业务管理员查阅，撤销其 capability
也会撤销这些存量实例的详情读取权限。

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
既有 Workflow instance 始终按固定版本继续。审批人 Provider 的 `min/max`
默认 1/200，最大 200；自动抄送默认 1/20，最大 20。
需要按流程实例串行投递时只声明 `ordering: 'workflow-instance'`，不接受下划线别名。

平台按 desired set 直接覆盖环境 Head，不做版本比较。因此 `openxiangda deploy`
与 `deploy --dry-run` 会在构建前只读比对源码激活声明与环境 Head：
源码 `definitionVersion` 低于当前已激活版本时以
`DEPLOY_WORKFLOW_ACTIVATION_VERSION_REGRESSION` 拒绝部署——把高版本定义与激活
声明合入源码后再发，版本号与 digest 必须与已注册版本一致（同版本不同内容会被
平台以 `WORKFLOW_V2_DEFINITION_VERSION_IMMUTABLE` 拒绝）；Head 已激活而源码
缺声明的流程给出 `DEPLOY_WORKFLOW_ACTIVATION_ABSENT` 警告（本次部署会停用它）；
目录查询不可用时以 `WORKFLOW_HEAD_PREFLIGHT_UNAVAILABLE` 拒绝盲部署。

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
`/m/workflows/:workflowCode/start`。definition 必须显式声明
`launch: { mode: 'standalone' | 'hidden-handoff' | ... }`，缺失会被编译器拒绝；
factProjection 把 option/user/department/resource-ref/cascade 字段投影为
`{ label, value }` 对象，对应 inputSchema 属性必须声明为 `type: 'object'`
（multiple 类字段为 array + object items），条件表达式用 `path: '<fact>.value'`
比较；声明成标量会在运行时 INPUT_SCHEMA_MISMATCH 并无限重试，编译器现已拦截。`standalone`/`hidden-handoff` 缺省使用同一个
compiler-owned `processOperationCode`、subject declaration 和标准 process commit；平台在一个
事务中写业务数据和 durable command。action-owned 资源改为声明
`launch.submission.kind: 'named-operation'`，显式绑定 create/existing 请求来源、响应 subject/
processCommand 路径和 allowlisted context 预填。标准页调用原 Named Action，由应用服务端保留
业务校验、幂等与原子提交；缺少/null processCommand 是成功的免审结果，不生成流程。页面只在
确实返回 command 时把 `commandId` 写入 URL，刷新、跨设备和 worker 恢复都重新读取
`ProcessCommandSurface`；`awaiting_input` 只回答已生成 requirement，`started` 再进入 pinned
instance entry。浏览器不再导出 prepare/start 发起协议。

### 标准提交页的业务表单扩展

应用读取获授权的业务资料后，可将 canonical 预填值和同步字段规则传给公开
`WorkflowSubmissionPage` 的 `formOptions`。PC和手机复用同一个组件及Field Kit；
上传、具名动作、幂等操作和未知结果恢复继续由标准页处理，应用不要复制提交生命周期。

```tsx
import { WorkflowSubmissionPage, type WorkflowSubmissionFormOptions } from 'openxiangda/react';

const formOptions: WorkflowSubmissionFormOptions = {
  initialValues: { phone: profile.phone, className: profile.className },
  fieldState: values => {
    const medical = (values.reason as { value?: string } | undefined)?.value === 'illness';
    return {
      recoveryEvidence: { visible: medical, required: medical, hiddenValue: [] },
      medicalReviewer: { visible: medical, required: medical, hiddenValue: null },
    };
  },
  intro: <p>请核对预填资料；因病申请需要康复证明。</p>,
};
return <WorkflowSubmissionPage workflowCode="reinstatement" variant="mobile" formOptions={formOptions} />;
```

初值仅在当前匹配的发起合同内应用到未触碰字段，每字段一次；后到资料和父组件重新渲染
不会覆盖已填写或手动清空的内容。日期和范围使用canonical值，标准页通过原codec转换。
`fieldState`读取canonical值，`required`只能增加校验，不能撤销原必填或隐藏原必填字段；
可选字段隐藏时清为`hiddenValue`或undefined，提交也使用同一投影，不发送旧材料/人员。
初值或规则引用范围外字段会阻断表单。`intro`只提供页面说明，不拥有身份、授权或提交。
资料加载/失败或业务资格提示可传`preparation`内容，它仅阻断尚未提交的表单；原请求查询
及已接受命令的展示优先于该提示。应用应始终挂载标准页，避免当前资格变化遮蔽原结果恢复。
这些规则属于应用代码，不能通过管理员节点配置修改；服务器仍独立校验实际业务资格与字段。

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

## 流程说明与变量来源 {#workflow-readability}

`definition.readability` 是可选说明，随不可变定义及其摘要发布。变量来源从实际 `inputSchema` 和 `subject.factProjection` 推导；不另行声明一个可编辑的条件图。例如，条件路径 `amountCents` 对应业务字段 `amountCents`，单选条件通常读取 `reason.value`：

```ts
readability: {
  variables: {
    amountCents: { label: '申请金额', unit: '分', description: '提交记录中的非负整数金额' },
    'reason.value': { label: '休学原因值' },
  },
  logic: [{
    code: 'submission-validation', title: '核验申请',
    description: '提交时校验已声明字段；金额由表单直接提供',
    phase: 'submission', inputPaths: ['amountCents'],
  }],
}
```

说明的执行位置只能是 submission、某节点的 node_input 或 completion。它是对已有逻辑的注释，不会自动执行计算或产生新流程节点。没有实际计算步骤时，不应写成“系统已计算总金额”。条件的变量必须存在于输入 Schema；对旧未标注定义，读取投影会明确给出未知来源诊断。

流程图的条件卡直接摘要参与判断的变量与分支数，业务步骤卡摘要声明的产出。管理详情在条件旁显示申请字段、流程输入或固定步骤来源；业务步骤优先展示输出说明，缺少说明时明确提示。来源节点只有与当前图的 handler 代码和版本一致才可跳转，历史实例使用自己的固定定义。界面不根据节点标题推断公式，也不加载或执行源码引用。

长图首次打开会保留可读比例；可用“适应全图”查看全貌，再通过搜索、来源链接、缩略导航或方向键定位。手机使用同一结构的节点列表和详情。图的连线、条件和代码始终只读，审批/抄送配置沿已声明的管理员能力修改，字段行为仍由页面代码定义。

可选 `source: { path, symbol?, digest }` 只返回源码位置和 SHA256，不返回源码内容。path 指向工作区 apps/packages/platform 下的代码文件，digest 为 `sha256:<原始文件字节摘要>`。工作区加载时核对文件存在、无符号链接、大小和摘要；源码变化后以 WORKFLOW_LOGIC_DESCRIPTION_STALE 阻止封装，开发者应核实说明并更新引用。32 个文件、单文件 2MiB、总量 8MiB 为上限。元数据不能验证任意 TypeScript 的业务含义，业务说明及验收仍由开发者维护。

## 持久业务步骤

必须收到业务计算或外部操作结果后才继续的流程，用固定 `action` 节点。平台自动
提供 `workflow.durable-business-step@1.0.0`；应用包含动作时自动声明能力需求并
按需引导标准 Nest 后端，普通无动作应用保持原合同。字段显隐/编辑/必填继续由
页面代码负责；动作版本、Schema、条件和连线只由开发者发布。

```ts
const amountSchema = { type: 'object', additionalProperties: false,
  required: ['amountCents'], properties: { amountCents: { type: 'integer', minimum: 0 } } };
// 放入已声明流程的 nodes；amount-route 必须是同一固定定义中的真实目标。
const calculate = {
  id: 'calculate', kind: 'action', title: '核算金额', next: 'amount-route',
  handler: { code: 'calculate-v1', version: 1, mode: 'pure' },
  inputSchema: amountSchema, outputSchema: amountSchema,
  inputs: { amountCents: { source: 'fact', path: 'amountCents' } },
};
// 放入 events.subscriptions；应用 backend.enabled=true，消费 generated manifest。
const subscription = {
  code: 'calculate-v1', eventTypes: ['openxiangda.workflow.step.requested.v2'],
  filter: { workflowStep: { handlerCode: 'calculate-v1' } },
  payload: { includeChanges: false, fields: [] },
};
```

成功输出写入 `steps.calculate.amountCents`。后续条件或动作只能读取每条路径上
已经完成的生产者；前向/自引用、非法路径和输入类型不兼容会拒绝编译。步骤后
需要 HTTP provider 或发起人选人的组合暂不支持，先在动作中产生有 Schema 的
人员数据，再使用原生人员字段/角色分派。示例见
`examples/workflow-administration/business-step.ts`。

Nest 使用 `@OpenXiangdaEventHandler(generatedContract)` 注册实现，`handle` 返回
`{ output, receipt? }`；上下文 `workflowStep` 包含验证过的固定请求，
`idempotencyKey` 是稳定 executionId。不得通过返回值任意指定下一节点或调用
Workflow 跳转。使用标准 `PlatformOpenXiangdaEventReceiptStore`；内存 receipt
不能完成业务步骤。

`pure` 用于无外部效果的计算；`reconciled-effect` 必须实现 `reconcile(event,
context)`：成功返回 `{ status:'succeeded', result:{output,receipt?} }`，确定未执行
返回 `{status:'not-executed'}`，无法确定返回 `{status:'unknown'}`。每次尝试先
核对原执行键，未知结果需要人工核对后重放原事件。增加v2时保留v1合同及代码；
旧具名版本合同不可变，缺失实现明确失败，不自动改用最新版本。

输入输出各16KiB、回执2KiB，最多32映射、200节点；Schema闭合且有界，无远端
引用或正则执行。平台先持久保存合法结果，再尝试流转；下游缺人等失败保留
`result_ready`，恢复仅推进，不再次执行处理器。自动恢复最多5次，每批20；
outbox容量等事务故障会回滚，处理器按原键核对后重交，不承诺跨服务绝对一次。
撤回后的未领取步骤拒绝执行，已开始的外部操作仍需原键核对。

管理员在标准实例管理页或 `WorkflowBusinessStepRecoveryPanel` 查看并继续受阻
步骤；公开客户端为 `loadWorkflowBusinessStepRecovery`、
`previewWorkflowBusinessStepRecovery`、`executeWorkflowBusinessStepRecovery`。
复用原管理权限/token/CAS/CSRF/审计，提交失败保留相同token/input/idempotencyKey。
组件通过 `onDraftStateChange` 报告 dirty/busy/unknown；宿主将其接入已有导航保护，
提交中或结果未知时保留组件和实例。未知结果只允许显式重试原恢复请求；首次明确
的4xx拒绝可保留原因并重新预览。宿主刷新失败不改变已经确认的提交结果。
等待处理器的失败从原事件管理受控重放，保留原执行键。普通详情只显示安全状态
摘要；原输入、输出和外部回执不放入普通时间线。

## 代码任务页面与补填 {#task-page-submit}

需要办理人补填时，在定义的 `taskPages` 声明命名页面，审批节点以
`taskPageCode` 引用。页面字段顺序、`readonly`、`required`、`visibleWhen` 和
`requiredWhen` 属于应用代码；流程管理员不能覆盖页面字段、条件或连线。
字段类型和编码来自同一个 Native 模型。例子见
`examples/workflow-administration/task-page.ts`。

页面表达式只读取本页 `values.*`，平台以合并后的业务值强制显隐和必填。
最多16页、每页64字段、单次值1MiB，表达式8层/64节点。
系统、流水号和隐藏字段不可作为补填入口。根附件、图片复用平台托管文件；
签名和富文本同样保留 Native 字段协议；普通 owned 子行以固定页面白名单和行 CAS 提交。

### 标准流程的主子表发起

标准发起页复用 Field Kit 的 PC/手机子表，通过原 `standard-commands` 的
`mutation.data` 一次提交完整表单。子表字段值沿用表单行结构：
`{ key, state, data, id?, revision? }`；日期等子字段按字段 codec 编码，
界面快照与原值不作为授权或并发依据。声明关系、行序和父记录引用由 Native 生成。
创建主表、所有子行和持久流程发起命令在同一个事务中完成；失败不留下部分申请。

发起仍执行当前用户的父、子资源及字段授权。拥有主表权限不会自动得到通用子表权限。
已有记录提交核对父 CAS 和完整已读子行集合，包括未修改行；删除显式保留原 id/revision，
跨单、遗漏、重复或陈旧行均拒绝。原命令已提交时先返回同一回执，再也不重新展开当前行。
每表100/累计400、完整意图双倍、整请求2MiB及展开后1000操作与 Native 预算一致。
普通显式 Named Action 的16个业务操作预算不变；其自定义子表提交仍按自身合同实现。

### 任务 owned 子表

在主模型的 subtable 字段上声明 `subtable: { fields, create, delete, reorder }`，例如：

```ts
{ code: 'items', required: true, subtable: {
  create: true, delete: true, reorder: true,
  fields: [{ code: 'name', required: true }, { code: 'quantity', required: true },
    { code: 'originalNote', readonly: true }],
} }
```

关系沿用模型的 `resourceCode/foreignKey/orderField/maxRows`，不接受任务调用者自报。
子字段可声明同样的只读、可见和条件必填规则；这些属于页面代码，管理员不能覆盖。
`create/delete/reorder` 省略时关闭。仅一层，每表 maxRows 最多100，父资源及任务页
声明总量最多400；默认仍20。完整意图最多为每表 maxRows 的两倍，可在一次提交中
删除满表旧行并新增同等数量，仍按有效行数校验上限。整个 form/任务私有草稿值限1MiB，
页面定义仍64KiB/64根字段；系统、隐藏、关系键和顺序字段不进入子字段白名单。
标准主子表提交复用同一个 Native 原子事务，最多1000操作/2MiB（400行全量替换加主表为801操作），
任一行失败全单回滚，不静默截断或分批提交。普通表单草稿values最多2MiB，含原值与当前值；
状态字段的独立配额不变。附件上传数量/字节与详情读取预算仍独立执行，行数容量不豁免文件配额。
子行支持 file/image/signature/text.rich，使用同一个任务上传入口并绑定准确行；普通
子行字段和已授权只读展示不降为 JSON 编辑框。例子见 `examples/workflow-administration/task-owned-subtable.ts`。

标准 PC/手机控件自动消费 `surface.taskForm.subtables`，不会调用普通 child CRUD。
自定义客户端提交 `values.items` 的完整行意图数组：
`{key,state,values,id?,revision?}`；state为created/persisted/deleted，key为小写UUID，
持久行key等于id。删除显式列出原id/revision与空values，遗漏不代表删除。
所有观察到的行版本都核对，包括未修改行；新行key作为其业务行ID。
values只能写白名单的当前可编辑字段，关系键与顺序由服务器维护。

原save_form/approve/resubmit同时提交主子数据、事实与决定，失败全部回滚。
子表提交推进主版本；普通child操作仍各自拥有行版本，不能仅用主版本判断子表并发。
私有草稿保存相同行意图，不改业务。CAS拒绝保留输入，核对后明确保留编辑或采用最新资料；
正在编辑的行被别人删除时不会静默丢弃或复活。未知命令沿原请求/原回执恢复。
能力 `workflow.task-owned-subtables@1.0.0` 从声明自动推导，正式 SQL
`AuthorizeWorkflowTaskOwnedSubtablesV2` 随初始化迁移自动生效，无新增默认关闭开关。

子行上传时在原 `WorkflowTaskFileUpload` 上增加
`row: { subtableFieldCode: 'items', rowKey }`，`fieldCode` 是该行中的材料字段。
rowKey 是新建或已持久化行的稳定小写 UUID；新行上传不会提前写入业务记录，排序也不会
改变文件归属。不能自行指定子资源或父记录，也不能把任务私有文件交给普通 child CRUD。
草稿递归保留有效行文件，删除意图不保留文件；原流程命令统一提交数据、引用和草稿消费。

条件文件的上传资格依据已保存业务值。若本地编辑才使字段可见，标准页面提示先保存补填，
再上传；私有草稿不会改变已经生效的业务事实。无条件材料可直接在尚未保存的新行上传。
上传未知时保留原行地址、ID、规格和字节，核对 ready 回执只读恢复，不再 PUT；处理中
禁用行修改、删除、排序和提交。标准 PC/手机控件自动处理四类值和准确行恢复。
声明可写子行材料自动要求 `workflow.task-owned-files@1.0.0` 及适用的 managed/rich 能力；
平台正式迁移 `AddWorkflowTaskOwnedFilesV2` 自动扩展绑定列，无需另开功能开关。

标准 PC/手机任务页和 `WorkflowTaskOperationsPanel` 自动显示当前参与人的
`surface.taskForm`。`save_form` 表示“提交补填，继续办理”，不是私有草稿。
approve/resubmit 携带 `form: { expectedRevision, values }` 时，Native 业务更新、
事实刷新、任务决定和下游流转同事务提交。reject/return/transfer 等操作不得
夹带表单。审批人仅获得当前任务对应的单记录/页面字段入口，不获得通用 CRUD。

相同幂等键不同输入拒绝；结果未知时保留原 token/input/key。共享组件锁定
编辑，只重试原请求或调用 `loadWorkflowTaskCommandReceipt(taskId, key, tokenDigest)`
查询本人原回执。重载只保存定位信息和 SHA256 token 摘要，不保存凭据或表单。
`not_observed` 仍然未知；只有平台锁住确切凭证、确认数据库时间已过期且未使用
的 `expired_unconsumed` 才能解除等待，供用户核对资料后重新确认。
组件复用宿主的 `OpenXiangdaApplication` 导航保护；成功后刷新失败不变成提交失败。

嵌入自定义详情时，可用 `renderLayout={({ content, actions, surface }) => ...}` 将补填表单和
恢复提示放在可滚动正文，将操作按钮放在底栏。两部分始终使用同一个任务面板，
不要分别创建两个面板或复制其表单、请求和回执状态。`surface` 是面板当前实际展示的
资料，自定义详情用它显示刷新后的字段；加载或无可用资料时为空。标准详情已采用该布局。

多人补填与管理纠错使用 Native 记录 CAS，冲突保留输入。首次请求的明确拒绝会只读刷新，
修订变化时对照最新已保存值和本人输入，核对前锁住字段与操作；可选择保留输入或采用最新值。
拒绝后的读取失败明确提示本次未提交，锁住旧操作，恢复读取后再核对；未知结果仍只能恢复原请求。
操作确认表单使用同一 Surface 的必填、字符数与非空白规则校验意见和原因。
`commentRequired` 只配置同意/拒绝的 `comment`；转交、委托、加签、退回与管理员改派
继续使用原合同的必填 `reason`，不用再填写第二份意见。
明确拒绝后，实例、任务版本及操作签名仍一致且操作仍可用时，对话框保留输入供人工核对；
任务、权限、字段规则或版本变化时不能沿用旧操作。刷新和保留输入都不会自动重发请求。
补填刷新固定事实投影；
修改已计算步骤的输入时清除当前失效输出及依赖输出。仅退回 replay 且所有前向
审批路径确定重经生产者时允许；resume_current 或后置补填跳过重算会返回
`WORKFLOW_TASK_FORM_RECOMPUTATION_REQUIRED` 并回滚，历史结果与签名保持。
自动能力为 `workflow.task-page-submit@1.0.0`，平台初始化无需额外开关。

### 任务私有草稿

标准PC/手机任务页和嵌入面板提供“保存私有草稿”“我的草稿”。暂存仅本人可见，
不会更新业务资料、事实、待办或推进任务；可以保存尚未完成必填的标量输入。
页面的显隐/只读规则和Native类型仍强制，管理员没有字段覆盖或读取他人草稿的入口。

自定义页面从 `openxiangda/core` 或 `openxiangda/react` 调用
`loadWorkflowTaskDrafts(taskId)`、`saveWorkflowTaskDraft(taskId, input)` 和
`removeWorkflowTaskDraft(taskId, { id, expectedRevision })`。
保存输入为 `{ id, expectedRevision, recordRevision, values }`：首写前固定UUID及
`expectedRevision: 0`；recordRevision来自当前taskForm.expectedRevision。
身份、环境、业务记录和固定页面由平台派生，不传actor/resource/page作为授权。
可编译例子见 `examples/workflow-administration/task-draft.ts`。

最多20份/90天与同用户、应用、环境、资源的其他表单草稿共享，单份最多64根字段/1MiB。
字段支持根附件、图片、完整业务签名和富文本，暂不包含 owned 子表。读到不兼容草稿时只返回安全标识与诊断，
不静默丢弃或泄露旧值。失去任务、角色或代理资格后不能继续读/用。

读取不会自动覆盖输入；采用前确认，业务基线变化先核对并再次保存。相同输入暂存成功后
可安全离开，后续新编辑恢复导航保护；浏览器持久存储不保存字段值。
结果未知保留原id/CAS/values，仅核对同id或重试原保存；同一次最后保存确认不新增修订，
其他CAS冲突保留输入。新id必须是用户明确另存，不能用自动另存掩盖未知结果。

正式 `form: { expectedRevision, values, draft: { id, expectedRevision } }` 可以包含暂存之后的新编辑。
平台锁住本人草稿及业务基线，再沿原save_form/approve/resubmit命令同事务更新业务并消费，
失败全部回滚。原成功命令重试先返回唯一Workflow回执，不因草稿已消费重复写入。
任务真正关闭才过期未消费草稿，all/sequence任务仍可办理时保留其他人的有效草稿。
能力 `workflow.task-private-drafts@1.0.0` 自动提供，无额外配置开关。

### 任务附件与图片

当前任务的可编辑 `file/image` 字段自动接入标准 PC/手机上传、缩略图、预览和下载。
当前处理资格不授通用资源 CRUD；平台从固定任务派生记录、页面、身份和环境，
上传时还核验**已保存业务资料对应的页面状态**。局部修改才显示附件字段时，
先“保存补填”使字段生效，再上传；组件说明此边界，不自动提交业务值。

自定义页面可从 `openxiangda/core` 或 `openxiangda/react` 调用：

```ts
const input = { id: crypto.randomUUID(), fieldCode: 'evidence',
  fileName: file.name, fileSize: file.size, contentType: file.type };
const plan = await initiateWorkflowTaskFileUpload(taskId, input);
// pending 才按 plan.uploadMethod/uploadUrl/headers 上传原 File；ready 直接采用 plan.file。
const readyFile = await completeWorkflowTaskFileUpload(taskId, input.id);
// 结果未知时：loadWorkflowTaskFileUploadPlan(taskId, input.id)，或重试同 ID/规格。
```

上传 ID 必须在第一次请求前固定。标准组件一次处理一个文件；上传中或结果未知时
保留原 File、ID、规格和当前输入，锁住新任务动作与草稿写入，提供“核对原上传”
和“重试原上传”。ready 结果不再 PUT；完成响应丢失后只恢复原完成结果。
文件字节、签名地址与表单值不进入浏览器持久存储。离开未完成上传时需先确认结果。

预览字段组件传入 `workflowFileBinding: { taskId, resourceCode, recordId, fieldCode }`；
正式实例详情使用原 `instanceId` binding。同一 binding 只提供一种范围。
仅本人当前任务可读私有暂存文件，其他处理人和管理员没有私有读取特权。
当前根业务记录已经引用的文件可按该任务页面规则读取；隐藏、资格失效或任务关闭后拒绝。
通用 Native 完成、删除和未绑定文件读取不能绕过此范围。

附件完成后仍只是当前输入；私有草稿延长文件保留至该草稿到期，业务绑定再移除引用
仍尊重该保留期。原 save_form/approve/resubmit 验证真实文件状态、字段、范围与元数据，
同事务提交业务引用、事实、任务决定和草稿消费；失败全回滚。完成上传时平台复制为
独占正式对象，旧上传地址不能再修改正式字节。

单文件不超过字段限制与100MiB；每账号/应用/环境最多100个尚未业务绑定的任务文件，
声明大小合计200MiB。此大小是上传容量预算，staging/正式对象与缩略图另有存储开销。
复用既有 Native 文件引用 worker 和 GC；流式正式复制限时10秒。
需要服务端正式 SQL `AddWorkflowTaskManagedFilesV2` 和自动能力
`workflow.task-managed-files@1.0.0`，初始化无需新增开关。

### 任务业务签名与富文本

任务页面声明可编辑 `signature/text.rich` 时，标准 PC/手机字段控件自动使用同一任务
文件、私有草稿和原流程提交入口。编译器同时要求 `workflow.task-rich-fields@1.0.0`；
平台初始化自动提供，无新增配置开关。只有只读展示时不要求上传能力。

业务签名保留完整 Native 值：`file: { id, name, size, contentType }`、可选 `signer`、
`signedAt`、可选 `points` 和 `hash`，清空为 `null`。PNG、时间、笔迹与 SHA-256 在上传前
固定，未知结果恢复只采用原文件，不重新签署。任务控件最多采样512个笔迹点并保留首尾；
原 PNG 字节不改，仍受任务值1MiB限制。这些是业务采集信息，不代表平台认证的签署人、
可信时间或法律电子签章。

富文本保存清洗后的 HTML 和 Native 稳定托管图片地址，支持最多20图、单图10MiB、100MP。
PC/手机保留格式、图片和前后文字；插图未知时锁住编辑，恢复采用原插入位置并只插入一次。
`blob:` 仅用于授权预览，不进入保存值。新任务签名/富文本图片完成时核验实际图片解码与
声明格式。完整值经 Native 校验后，草稿和正式审批共用排序文件锁、引用验证、保留期及事务。

自定义 Field Kit 上传 renderer 的第四参数为可选 `onRecovered(file)`，仅在恢复原任务上传
时采用完整字段值；正常上传仍返回 `DataFileRef`。非数组字段必须提供该回调；不能用文件数组
append 处理签名或 HTML。当前任务、实例、记录或字段改变时清理旧图片预览，重新按范围读取。

### 发起人同时参与审批

审批节点可声明 `initiatorApprovalPolicy: 'auto_approve'`；省略或声明 `manual` 时由本人办理。
该策略由流程代码固定，管理员可以调整已开放的审批方式与人员，不能修改此策略。
仅当前已激活、由原人员解析或授权解析重试产生的发起人直接席位自动同意。
单人/或签按正常同意规则完成；会签仍等待其他席位；依次审批只有轮到本人时才自动处理。
发起人代理给他人、他人代理给发起人、转交、加签、管理员重分配及退回补正均需人工。

带 `taskPageCode`、可写字段或强制同意意见的节点不能使用自动同意。需要补选负责人等
业务输入的节点继续采用人工办理；配置也不能给自动节点增加强制同意意见。
实际自动票使用原审批依赖与事务，历史显示“发起人自动同意”，事件包含 `automatic: true`
及流程内核主体；没有伪造人工意见。后续解析失败会回滚本次自动票、任务与事件。
每个事务最多进入 200 个节点、处理 200 个自动席位，业务步骤仍等待原业务结果。
前一办理人来源保留原发起人；重启或原命令重放不重复自动票。

此声明要求 `workflow.initiator-approval-policy@1.0.0`，缺少实现的目标平台会拒绝应用。

### 审批人为空时的节点策略

审批节点可声明 `emptyPolicy: 'skip'`，省略或声明 `block` 时保持阻塞。第一版 skip 支持 fixed_users、input_users、form_field_users、app_role、app_role_in_scope；编译器拒绝其他来源与 skip 组合。表单人员明确为 `[]`，或存在的角色在有效范围内没有成员，且解析成功、没有警告，才允许自动继续到 `onApprove`。缺失/null 字段、不存在的角色、无效账号、缺少范围、解析失败和非零人数不满足 min/max 都不能跳过。

该策略由代码固定。每次实际跳过记录节点访问、当时配置、解析依据和 `openxiangda.workflow.node.skipped.v2` 事件；图和 PC/手机历史显示“已跳过”。连续节点推进受 200 节点上限约束，业务步骤仍等待其正式结果。后续失败与业务变更在原事务一起回滚，重试沿用原命令。

退回补正（return_review）必须有人实际处理，不能靠空人跳过；重提后的正常 replay/resume 流转继续采用原节点策略。使用此声明时，生成契约要求目标平台支持 `workflow.approval-empty-policy@1.0.0`，缺少该能力的旧服务端不能接收。

## 按业务资料权限查看办理历史 {#record-history-read}

发起人、审批人、抄送人使用既有 Workflow 详情。业务查看人员需要根据当前资料范围读取办理记录时，模型可显式声明：

```ts
workflowHistory: { read: ['app:my-app:history:read'] },
```

`read: true` 绑定本资源的 read 能力，`false` 关闭入口；省略也关闭。能力数组引用已声明能力，最多20项，必须由同一角色成员全部持有，同时具备资源read。ALL资料读取角色与本人历史角色组合时，历史仍限本人行；Perspective和Native RLS继续收窄范围。此声明不授予审批、转交、后台或流程图管理能力，且独立于 `audit.read` 的资料变更记录。

标准Native详情按声明提供折叠的“流程办理记录”。自定义用户端PC/手机页面可复用 `WorkflowRecordHistoryPanel`（`openxiangda/react`），传入 `resourceCode`、`recordId` 和 `variant`。通过 `loadWorkflowRecordHistory`（`openxiangda/core` 或 `openxiangda/react`）直接读取时，可传 `instanceId` 查看该记录的原固定实例，以及 `limit`（默认20、最多100）、`offset`（最多500）。环境来自当前平台runtime；接口不提供办理Surface或操作令牌。

结果仅包含原流程版本、实际节点访问、人员、操作时间和意见，不返回条件事实、业务字段、代码、角色席位、原始log detail或授权摘要。每次请求重新授权；无权、没有可读实例、容量超限及读取中资料/实例变化分别保留明确失败。组件清除失败后的旧数据并提供手动重试，不自动重放写入。单实例最多500操作、200访问、1000审批/自动抄送席位，响应最多2MiB；历史较大时返回413，不静默截断。

本能力要求平台 `workflow.record-history-read@1.0.0`。只读历史不提供评论发布、源系统打印或删除；这些行为需分别声明、授权和验收。
