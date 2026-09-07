# NestJS 后端

默认模板只包含 Web 和共享契约。只有需要执行服务端业务动作时才增加 NestJS。记录列表、详情、新增、编辑和删除直接由浏览器调用平台 Data API，不在 controller 中重写一遍。

平台网关验证当前用户完整的应用角色并集，并把经平台重验的角色、capability 与可选 Perspective 交给 Nest SDK。业务 controller 使用生成的 operation 合同和 capability 装饰器；平台仍是身份与授权的唯一所有者。请求作用域 `OpenXiangdaDataApiService` 自动继承 Perspective 读取投影；绕过 Data API 的自定义读取才使用 `@CurrentPerspective()` 显式投影。应用代码不替换身份、不保存平台凭据，也不建立第二套用户或权限状态。

```bash
pnpm openxiangda dev
pnpm openxiangda check
```

在 `openxiangda.config.ts` 声明 `backend: { enabled: true }`，或添加需要执行应用代码的
operation、事件消费者、人员提供器，然后运行 `pnpm openxiangda check` 或 `pnpm dev`。
工具从当前版本的内置模板初始化后端源码并安装依赖；后续不会覆盖业务代码。
标准表单、流程定义/激活和平台待办通知使用平台运行时，不会隐式启用 Nest。

依赖安装失败会保留新源码并报告 `OPENXIANGDA_BACKEND_INSTALL_FAILED`；重试相同命令
即可继续。关闭 backend 不自动删除用户源码。仅删除已经确认不用的后端目录和其依赖。
本地 `/api` 经过 connected proxy 进入 Nest；发布态由同源应用网关转发。

| 需求 | 使用的 SDK | 权威边界 |
| --- | --- | --- |
| 当前用户与角色并集 | `@CurrentUser()` | 网关验证结果，业务不管理凭据 |
| 当前用户范围的数据 | `OpenXiangdaDataApiService` | 平台行/字段权限和读取 Perspective |
| 已授权业务动作的跨模型读写 | `OpenXiangdaBusinessDataApiService` | 声明的 operation；平台保留发起人审计 |
| 原子写入与幂等回执 | `.transaction(idempotentTransaction(...))` | 同一平台事务，不读后再写 |
| 分派对象必须具有指定角色 | 事务 `role-member` 条件 | 具名动作声明允许核对的角色；平台核对有效成员与并发 |
| 托管文件 | Data SDK 的 `initiateFileUpload` / `completeFileUpload` / `copyManagedFile` | 平台文件归属和操作授权 |
| 标准流程 | `OpenXiangdaWorkflowService`；带业务提交用 `OpenXiangdaBusinessProcessService` | 平台命令 token、版本和回执 |
| 当前用户待办 | `OpenXiangdaTodoService` | 平台投影，不另建待办表 |
| 通知 | `OpenXiangdaBusinessNotificationService` | 平台收件人、通道、投递和幂等 |
| 域事件 | 事务 `emitEvent` / `@OpenXiangdaEventHandler` | 平台 outbox 与消费回执 |
| 请求和动作日志 | `OpenXiangdaLoggerService`、`OpenXiangdaPlatformError.request` | Nest 日志输出和平台请求关联 |

下方代码是接入片段，模型与角色需要在应用中显式声明。独立的完整示例由工具链维护者在新建应用中做打包验收。

自定义 operation 的 capability 必须先在 `authz.capabilities` 以
`kind: 'backend'` 声明，再由 operation 和允许调用它的角色共同引用。普通资源 CRUD
能力仍由编译器生成，不写入显式 capability catalog。

访客重复预约统一使用 `OpenXiangdaStandardOperations.createVisitorReservation`。
`duplicateMatch` 是字段代码到本次提交值的非空对象，不是字段名数组；它与 `data`
必须来自同一个不可变请求，并连同 `idempotencyKey` 一次提交给平台事务。应用不先查
重、不自行加锁、不在重试时重新生成业务时间。

只读前置条件使用 `record-exists` 或 `record-match`，它们不要求同记录 mutation，
但仍执行 read capability、字段权限与行级授权。需要与数据库当前时间比较时使用
`databaseNowAssertion('publishAt', 'lte')`；平台在守卫行锁及写入前校验完成后，
用一次 PostgreSQL `clock_timestamp()` 完成所有动态断言，并把该接受时刻作为
`evaluatedAt` 存入幂等回执。它不是最终提交时刻。相同幂等键重放不会重新
读取当前时间。不得把 `Date.now()`、SQL 表达式、时区偏移或调用方时钟塞入断言。

新建或更新的时间窗口使用 `operation-time`，直接引用本次操作提交的 datetime 字段：

```ts
const guards = [
  { kind: 'operation-time', operationIndex: 0, field: 'startsAt',
    operator: 'gt', offsetMilliseconds: 0, errorCode: 'OPENXIANGDA_NOT_FUTURE' },
  { kind: 'operation-time', operationIndex: 0, field: 'startsAt',
    operator: 'lte', offsetMilliseconds: 2592000000, errorCode: 'OPENXIANGDA_TOO_FAR' },
];
```

上述规则表示第一个 create/update 操作的 startsAt 必须晚于平台接受时刻，
且最多提前 30 天。字段须已声明、可写，并在操作 data 中提供带 Z 或显式偏移的
ISO 时间字符串；不接受空值、嵌套路径、引用或表达式。offsetMilliseconds 是
最多正负 366 天的整数，所有时间条件共享一个接受时刻。需要平台 Data API 1.1.0。


## 业务动作与普通查询 {#business-action}

`OpenXiangdaDataApiService` 按当前用户的普通资源、行和字段权限执行。具名业务动作使用 `OpenXiangdaBusinessDataApiService`：入口先检查该动作 capability，平台在精确应用和环境内以受信任后端执行，并保留发起人与动作审计。业务动作不能接受任意模型/字段/用户 ID 后不做业务校验；应用负责该动作的输入约束和业务不变量。

同一业务变更用一次受限事务表达。断言、派生计数、写入和事件保持原子性；遇到可重试响应时复用不可变 payload 和 idempotencyKey，不先读取可变状态再决定写入。

## 在分派事务中核对目标角色 {#role-member}

维修派单、指定审核人等规则不能只依赖页面筛选或先查成员再写入。先在对应
`backend.operations[]` 的 `platformAccess` 声明允许核对的应用角色：

```ts
platformAccess: { roleAssertions: { roleCodes: ['technician'] } }
```

`technician` 必须存在于本应用 `authz.roles`，最多声明 20 个角色。应用管理员身份
不自动代表维修角色。人员候选可以使用已有且已委托管理范围的成员查询；这项声明
本身不授予成员管理或人员目录权限。

在 `OpenXiangdaBusinessDataApiService` 的同一次事务中表达业务状态与目标角色：

```ts
await businessData.transaction({
  schemaVersion: 'openxiangda.data-transaction-request/v2',
  idempotencyKey: input.idempotencyKey,
  guards: [
    { kind: 'role-member', userId: input.technicianId, roleCode: 'technician',
      errorCode: 'OPENXIANGDA_ASSIGNEE_INVALID' },
    { kind: 'record-assert', resourceCode: 'service-orders', id: input.id,
      lockKey: `service-order:${input.id}`, errorCode: 'OPENXIANGDA_ORDER_STATE_INVALID',
      assertions: [{ kind: 'value', field: 'status', operator: 'eq', value: 'approved' }] },
  ],
  operations: [{ operation: 'update', resourceCode: 'service-orders', id: input.id,
    expectedRevision: input.revision, data: { assignedTo: input.technicianId, status: 'assigned' } }],
});
```

以上是接入片段；模型、字段、角色、动作 capability 和请求输入仍需在应用中声明。
角色条件只有 `kind/userId/roleCode/errorCode`，不接受环境、成员快照、调用者锁名或
调用者时间。所有 guard 合计最多 20 项。带业务写入的流程提交同样可以使用这一条件。
普通用户 Data SDK、应用凭据和事件处理器不能使用；伪造操作请求头不能获得授权。

平台在同一事务内核对当前租户、应用、环境和版本，以数据库取得的统一时间检查
显式成员是否生效、过期或已撤销，并核对授权投影就绪。条件不成立返回指定失败码，
无业务写入；没有声明返回 `OPENXIANGDA_ROLE_ASSERTION_NOT_DECLARED`。并发角色撤销、
投影或环境切换返回 `OPENXIANGDA_ROLE_ASSERTION_CONFLICT`，锁等待最多 1 秒，整笔回滚。
保留原请求和幂等键，根据当前业务状态决定是否重试。成功请求重放只返回已有结果；
同一幂等请求绑定原发起人和业务动作，换人或换动作不能复用该回执。

分派已接受后撤销角色，不会自动撤销历史分派；后续处理动作必须重新验证当前权限，
由管理员重新分派。此规则应写入 AppSpec，并实测撤销先发生和分派先发生两种顺序。

## 启动与依赖注入 {#bootstrap}

```ts
import 'reflect-metadata';
import { bootstrapOpenXiangdaApplication } from 'openxiangda/nest';
import { AppModule } from './app.module.js';
await bootstrapOpenXiangdaApplication(AppModule);
```

使用标准启动器保留原始请求体校验、代理信任和关闭处理。可注入依赖使用明确的 Nest 注入 token/装饰器，遵循生成后端的现有模式；不另建网关身份验证或自行转发授权 JSON。请求关联使用平台传入的 request ID。

## 通知与事件 {#notifications}

具名用户动作发送通知使用 `OpenXiangdaBusinessNotificationService.send()`，携带稳定 eventId、messageKey、sourceSequence 和 idempotencyKey。重放同一事件返回已有消息；同一 messageKey 的更高序列用于收敛状态。通知目标使用声明的 PC/移动路由代码及参数，不拼接环境域名或身份凭据。

签名事件处理器使用 `sendFromEvent()`，在声明中指定事件 data 内的收件人与文案路径，由平台验证不可变事件后解析。普通业务动作不需要平台通知管理权限。需要高级钉钉卡片时才使用已授权的管理服务和已启用通道，不能把它设为普通审批的默认依赖。

通知协议常量也从同一个公开入口导入：

```ts
import {
  OpenXiangdaBusinessNotificationService,
  OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2,
  OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2,
} from 'openxiangda/nest';
```

用户动作 send 的 schemaVersion 使用 OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2；事件处理 sendFromEvent 使用 OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2。二者的调用上下文和收件人来源不同，不能混用。
