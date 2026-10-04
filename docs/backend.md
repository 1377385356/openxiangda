# NestJS 后端

默认模板只包含 Web 和共享契约。只有需要执行服务端业务动作时才增加 NestJS。记录列表、详情、新增、编辑和删除直接由浏览器调用平台 Data API，不在 controller 中重写一遍。启用前先按[判定是否真的需要 Nest 后端](./development.md#backend-decision)逐行核对：幂等、时间窗、状态前置、角色核对、聚合、导入导出都有声明式答案；只有真实外部副作用或无法声明的跨资源不变量才是启用理由。`check` 会拒绝未以 `@OpenXiangdaOperation(appOperations.<code>)` 绑定已声明 operation 的应用路由。

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

业务记录已创建但详情缺少原流程命令 ID 时，使用
`OpenXiangdaBusinessProcessService.list({ resourceCode, recordId, workflowCode, operationCode })`。
`workflowCode` 必须显式提供且属于当前 Named Action 的 `platformAccess.workflow.codes`；
SDK 继承当前环境与身份，平台沿用发起人或既有超级管理员的命令权限。返回有界
`items/nextCursor`，分页与多次流程的选择规则见[前端](frontend.md)。找回后使用原
`receipt/poll/surface`；查询不重放提交、不生成第二份命令状态。

连 commandId 都没收到时，用同一动作的 `businessProcess.resolveOriginal({ workflowCode,
 idempotencyKey })` 查询原操作。此能力需要 `business-process.original-resolution` 1.0.0。
`committed` 才有可信回执；`not_observed` 可能仍在提交，不能据此生成新键或宣称回滚。
前端可用 `resolveBusinessProcessOriginal`（`openxiangda/react`），传原 workflowCode、
operationCode、idempotencyKey；SDK 绑定当前环境并核验返回关联。Named Action 如果业务无需
审批，使用下面的 Native 数据命令恢复；没有流程回执并不代表业务没写入。
标准 PC/移动发起页在响应未知时保留原操作定位信息，刷新可继续查询；同一页面、原身份和
版本内可手动重试冻结的标准输入，绝不自动重发或悄悄换键。

### 数据修改的原结果恢复 {#data-business-commands}

仅修改业务资料的具名动作，在 `platformAccess` 声明
`dataCommands: { mode: 'recoverable-native' }`，使用请求作用域的
`OpenXiangdaBusinessDataApiService.commitCommand` 与 `resolveOriginalCommand`。
编译器自动要求 `data.business-commands` 1.0.0；平台初始化默认提供，无额外开关。
此声明不授予用户普通 UPDATE，也不替代应用的业务校验、同成员数据范围或附件输入授权。

```ts
// 固定动作代码从原请求组装；目标、原 revision、字段与原因共同构成稳定意图。
const original = {
  idempotencyKey: input.idempotencyKey,
  intent: { id: input.id, expectedRevision: input.expectedRevision,
    name: input.name, reason: input.reason },
};
const observed = await businessData.resolveOriginalCommand(original);
if (observed.outcome === 'committed') return observed.receipt;

// 这是用户明确提交或同键重试的动作处理器；只查询结果的接口在上面直接返回。
// 在此读取合法字典/人员，并把业务规则转为原 Native guards，避免读写竞争。
const committed = await businessData.commitCommand({
  ...original,
  data: { operations: [{ operation: 'update', resourceCode: 'requests',
    id: input.id, expectedRevision: input.expectedRevision, data: { name: input.name } }] },
});
return committed.receipt;
```

响应丢失时保留原输入和原键，调用只读恢复。`not_observed` 仅表示本次未看到已提交回执，
另一请求仍可能正在执行；SDK 不自动重放、更换键或提交。显式同键重试在事务锁内最多生效一次，
相同键但不同意图返回 `OPENXIANGDA_DATA_COMMAND_IDEMPOTENCY_CONFLICT`。
恢复发生在当前业务校验之前，因此原资料或字典后来变化不会遮蔽已成功结果。

身份、应用、环境和动作来自原验证证明；普通用户直调、Worker、未声明动作与伪造请求拒绝。
平台另外核对当前动作能力，失权后拒绝读取。用户、动作、能力或环境不同均不能复用原结果。
同环境升级后可用当前同动作查询，回执保留原 `appVersionId`、`environmentHeadRevision`
和事务条目；不会把原结果重写为当前版本。恢复不要求原资料仍然存在。

意图只允许 JSON 对象，最多 64 KiB、32 层、10000 个值；不接受 undefined、循环对象或 Date。
键最多 128 字符；数据仍沿 Native 1000 操作/2 MiB、CAS、guard 和文件规则。
服务端只持久保存意图和公开键的摘要，复用原 Native 回执，不建立第二份状态表。
结果仅返回可信应用后端，应用按已声明的 responseSchema 向用户投影。

自定义表单页若先用 `createResourceFormDraftClient` 保存认证草稿，并由 Named Action
提交业务记录和流程，则在同一次 `OpenXiangdaBusinessProcessService.commit` 中传入
`formDraft: { resourceCode, id, expectedRevision, mode, recordId?, viewCode? }`。草稿必须
与 `workflow.subject.fromOperation` 指向的 create/update 操作完全同资源、同模式和同
记录；平台按当前真实用户、应用与环境锁定 revision，在业务写入和 durable command
同一事务中消费。失败或未知结果时不要先删草稿，也不要换幂等键；使用原
`idempotencyKey` 重放或读取 `receipt/poll`。成功后也不要再做 best-effort 删除。

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



### 事务内写入快照字段 {#snapshot-values}

option / user / department / resource-ref 字段在 Data API 与事务写入里保存 `{ label, value }` 显示快照，`value` 是比较键。写裸字符串会被字段校验拒绝（`OPENXIANGDA_NATIVE_DATA_OBJECT_REQUIRED`）。使用助手函数避免手写形状：

```ts
import { optionSnapshot, userSnapshot, resourceSnapshot } from 'openxiangda/nest';

data: {
  status: optionSnapshot('处理中', 'processing'),
  assignedTechnician: userSnapshot(input.technicianId),
  requestId: resourceSnapshot('repair-requests', input.requestId, title),
}
```

读取判断状态用 `record.data.status?.value === 'pending'`。

### 幂等冲突复核 {#idempotency-recovery}

同一 `idempotencyKey` 要求内容指纹一致。冻结首次请求的 operations、guards、expectedRevision、主体、环境和版本上下文；重试不能重新计算这些值。平台原回执的 `replayed` 才是重放成功证据。业务记录已经变化，本身不会导致原请求的幂等内容冲突；重新读取 revision 并改变请求才会。

`isIdempotencyConflict(error)` 只识别 409 `OPENXIANGDA_NATIVE_DATA_IDEMPOTENCY_CONFLICT`，不证明首次请求已成功。保留原操作并核对原回执；结果不明时显示“结果待确认”，不能把当前记录状态拼成伪造的成功回执，也不能换新键重试。部署 Head 改变时先恢复原上下文，不把同一键发送到另一版本当作原请求恢复。

### 使用生成类型绑定资源 {#typed-resources}

工具生成的共享契约导出 `ResourceTypes`；使用项目锁定版本的 `pnpm openxiangda check` 验证接入。三种 Nest 数据服务均保留原主体；当前用户业务优先用当前用户服务，具名业务动作使用业务服务。

```ts
import type { ResourceTypes } from '@app/contracts';

const resources = this.data.resources<ResourceTypes>();
const requests = resources('repair-requests');
const record = await requests.get(input.id);
return requests.update(record.data.id, {
  expectedRevision: record.data.revision,
  data: { assignedTechnician: userSnapshot(input.technicianId) },
});
```

资源名、写入字段、引用形状和 query 的字段/排序键会在 TypeScript 检查时验证；示例字段须由自己的模型声明。get/create/update/delete 保留 `data` 信封，revision 位于 `record.data.revision`。query 返回分页的 `items`。字段权限可能隐藏业务字段，所以读取类型保留这些字段可缺失的事实；应用必须按权限和必需字段做有意义的提示。该包装不会自动重试、修改 revision 或提升权限。运行时仍由平台校验所有输入。

事务守卫的 `errorCode` 必须匹配 `^OPENXIANGDA_[A-Z0-9_]{1,96}$`，例如 `OPENXIANGDA_REPAIR_REQUEST_NOT_PENDING`。

## 在同一事务中引用前序 create 生成的 id {#transaction-references}

一个事务内"先建主记录、再建引用它的子记录"不需要预先分配 id，也不需要两段式
暂存。后续 create/update 的 `data` 字段值可以直接写
`{ operationIndex, field: 'id' }` 引用本事务中**之前的 create** 生成的主键，
平台在提交前解析替换：

```ts
await businessData.transaction({
  schemaVersion: 'openxiangda.data-transaction-request/v2',
  idempotencyKey: input.idempotencyKey,
  operations: [
    { operation: 'create', resourceCode: 'clubs', data: { name: input.name } },
    { operation: 'create', resourceCode: 'club-memberships',
      data: { clubId: { operationIndex: 0, field: 'id' }, userId: input.ownerId, role: 'owner' } },
    { operation: 'create', resourceCode: 'club-memberships',
      data: { clubId: { operationIndex: 0, field: 'id' }, userId: input.memberId, role: 'member' } },
  ],
});
```

引用约束：引用对象只含 `operationIndex`（0..99 的整数）与 `field: 'id'` 两个键；
只能指向索引更小的 create 操作；引用不得嵌套在数组或对象里。违反形状报
`OPENXIANGDA_NATIVE_DATA_TRANSACTION_REFERENCE_INVALID`，嵌套报
`..._NESTED`，目标不可解析报 `..._UNRESOLVED`。任一操作失败时整个事务回滚，
不会留下无成员的 club。

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
不自动代表维修角色。经办人使用请求作用域 `OpenXiangdaBusinessDirectoryService` 查询
本动作声明的候选，无需成员管理权：

```ts
const page = await businessDirectory.assignmentCandidates({
  roleCode: 'technician', keyword: input.keyword, limit: 20,
  ...(input.cursor ? { cursor: input.cursor } : {}),
});
// page.items 仅有 value/label；下一页沿用同一关键词和 page.nextCursor。
```

这项可选能力需要目标平台 `directory.assignment-candidates` 1.0.0。环境由 SDK 绑定，
禁止传入任意环境或账号。平台只返回生效、未过期、正常且未锁定的成员，验证账号与正式
账号隔离。游标绑定环境 Head、调用者、动作和角色，收到上下文变化错误后清空游标重新查询。
候选结果只用于选人；提交时仍使用下面的事务条件，不能凭查询结果绕过重新核验。

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

## AI 能力目录与 MCP Facade {#ai-catalog}

编译器为每个应用生成不可变的 AI 能力目录：资源的标准 CRUD 面（query/get/create/update/delete，
按 `generated` 与 `mutationOwner` 实际开放的操作）自动成为 `generatedCrud` 能力；`backend.operations[]`
中带 `ai` 声明的操作成为 `customAction` 能力。目录摘要（`aiCatalogDigest`）随当前声明生成并进入契约；
平台 `GET .../native/ai/catalog` 按当前用户角色与字段权限裁剪后返回。为操作声明 `ai` 即把它加入目录：

```ts
operations: [{
  code: 'dispatch-repair', method: 'POST', path: '/dispatch', capability: dispatchCapability,
  ai: {
    name: '受理派单', description: '把报修单派给指定技师并写入派工记录',
    risk: 'write', resources: ['repair-requests'],
    sideEffects: ['更新报修单状态为处理中', '写入一条派工记录'],
  },
}],
```

`ai` 的规则：`name` 与 `description` 必填；`risk` 取 `read | write | destructive | external`，
`read` 等价于 `method: 'GET'`，DELETE 方法只能是 `destructive` 或 `external`；`resources`
引用 1–16 个已声明资源；`sideEffects` 最多 20 条——只读必须为零，写操作至少一条具体副作用；
`concurrency` 可选 `none | revision`，`timeoutMs` 限 100–30000。
普通 `write` 操作可显式声明 `confirmation: 'none'`：用户明确要求办理、输入齐全且无歧义时，平台 Agent 可直接调用并返回真实回执，不生成统一预览。省略时仍为 `required`；`destructive` 和 `external` 必须为 `required`，只读必须为 `none`。免二次确认不取消当前用户授权、AppVersion 绑定、输入校验、幂等键及应用业务校验。需要用户补齐字段、消除歧义或应用业务规则要求确认时，Agent 仍应先询问。

### 面向普通用户的 Agent 任务

`ai` 使操作进入技术能力目录；只有显式声明 `ai.agent` 才把操作交给普通用户的业务 Agent 发现。`visibility: 'task'` 是可办理的任务，`visibility: 'support'` 是该任务需要的只读查询。平台仍按当前用户的应用权限过滤，声明本身不授予权限。生成的资源 CRUD、没有 `agent` 的操作和 `support` 操作都不是普通用户首页的独立任务。

以下示例中，应用自己负责地点搜索与预约规则。给模型和用户的是“地点名称”，稳定地点引用只作为操作参数，用户无需填写地点编码。

```ts
const locations = {
  code: 'reservation.locations', method: 'GET', path: '/api/reservations/locations',
  capability: 'app:visitor-app:reservation:locations',
  requestSchema: { type: 'object', properties: { keyword: { type: 'string' } } },
  responseSchema: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: {
    items: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false,
      required: ['value', 'label'], properties: { value: { type: 'string' }, label: { type: 'string' } } } },
    nextCursor: { type: ['string', 'null'] },
  } },
  ai: {
    name: '查找可预约地点', description: '按名称搜索当前用户可选择的地点',
    risk: 'read', resources: ['reservations'], sideEffects: [],
    agent: { visibility: 'support' },
  },
};
const enroll = {
  code: 'reservation.enroll', method: 'POST', path: '/api/reservations/enroll',
  capability: 'app:visitor-app:reservation:enroll',
  requestSchema: {
    type: 'object', required: ['location', 'purpose'],
    properties: { location: { type: 'string' }, purpose: { type: 'string' } },
  },
  responseSchema: { type: 'object', properties: {
    ticketNo: { type: 'string' }, locationName: { type: 'string' },
  } },
  ai: {
    name: '发起访客预约', description: '校验访客信息、地点与时间后创建预约',
    risk: 'write', resources: ['reservations'], sideEffects: ['创建访客预约'],
    agent: {
      visibility: 'task',
      examples: ['帮我预约访客', '明天下午邀请张老师来访'],
      aliases: ['发起邀约'],
      supportOperations: ['reservation.locations'],
      inputLookups: { location: 'reservation.locations' },
      inputCard: { title: '补全访客预约', submitLabel: '发起预约', fields: [
        { path: 'location', label: '预约地点', control: 'select', help: '搜索地点名称后选择' },
        { path: 'purpose', label: '来访事由', control: 'textarea' },
      ] },
      resultCard: { title: '预约已提交', fields: [
        { path: 'ticketNo', label: '预约单号' },
        { path: 'locationName', label: '地点' },
      ] },
    },
  },
};
```

两个 `capability` 必须在 `authz.capabilities` 中声明为 `kind: 'backend'`，再授予相应角色。`supportOperations` 和 `inputLookups` 引用同一应用中的操作 code；被引用操作必须声明 `visibility: 'support'`、`risk: 'read'` 且使用 GET。`inputLookups` 的键必须存在于任务的 `requestSchema.properties`。示例问法最多 12 条、别名最多 20 条、辅助操作最多 12 个、字段绑定最多 32 个；运行时辅助查询仍应分页、有界，并返回业务标签与稳定引用。

`inputCard` 是平台标准填写卡片，只能用于 `customAction` 任务。字段必须是同一请求 Schema 的顶层字符串，所有必填字段必须包含在卡片中；首版控件为 `text`、`textarea`、`select`，最多 12 项。`select` 必须绑定 `inputLookups`，辅助 GET 操作接受可选 `keyword`，返回最多 20 项 `{items:[{value,label}],nextCursor:null|string}`。`label` 面向用户，`value` 是稳定引用，业务 handler 仍须校验该引用。模型只创建等待卡并预填已确定的值；刷新后从会话快照恢复，提交后平台以当前用户身份和固定任务创建后台 Run，不再次请求模型。提交检查权限、AppVersion/目录摘要、完整请求 Schema 和幂等键；旧卡、权限撤销、版本变化和未知结果均不能静默重放。

`resultCard` 是已完成任务的只读结果卡片：只允许引用 `responseSchema.properties` 中明确声明的顶层字符串、数字或布尔字段，最多 8 项。应用须确保这些字段可向当前用户显示。填写卡与结果卡可选声明 `resource: 'agent-cards/repair.js'` 使用隔离的应用自定义 UI；未声明或加载失败时保留标准卡片。资源必须是同一前端制品中的单文件 IIFE，`deploy` 会拒绝声明了却未打包的资源。开发 SDK、构建配置和 Host 消息边界见 [应用 Agent 卡片](agent-cards.md)。本声明不改变既有 MCP Facade 的写入确认协议。

业务规则必须在后端操作中验证；提示词、卡片预填和前端校验不能取代权限与业务校验。完整输入、缺失输入、同名地点、权限不足、重复提交和结果未知都应有应用测试与回执核对。任务声明随 AppVersion 的 AI Catalog 一起发布，不能另建手工目录。

宿主（平台 AI 网关）用该目录装配 MCP Facade，应用不自己实现协议：

- **单应用 Facade**（`createApplicationAiMcpServer`）：每个能力一个工具，只读能力直接以
  `capability.code` 命名执行；写能力命名为 `capability.code + '.preview'`，只生成预览不落库；
  存在写能力时额外提供 `openxiangda.ai.confirm`（入参 `previewId`），在用户明确确认预览摘要后
  由宿主重新校验身份、权限、版本和幂等性再执行。目录本体通过资源 `openxiangda://ai/catalog`
  读取。
- **平台聚合 Facade**（`createAggregatedAiMcpServer`）：跨应用统一工具面
  `apps.search`、`resources.describe`、`records.query`、`records.get`、`records.create`、
  `records.update`、`records.delete`、`actions.invoke`、`mutations.confirm`；聚合器只把工具
  路由到所属应用的执行器，不合并权限、不产生第二个数据或授权边界。

这套 Facade 服务平台侧 AI 入口，与应用工作区开发用的 MCP（见[MCP 参考](./reference/mcp.md)）
是两组互不重叠的工具。

## 启动与依赖注入 {#bootstrap}

```ts
import 'reflect-metadata';
import { bootstrapOpenXiangdaApplication } from 'openxiangda/nest';
import { AppModule } from './app.module.js';
await bootstrapOpenXiangdaApplication(AppModule);
```

使用标准启动器保留原始请求体校验、代理信任和关闭处理。可注入依赖使用明确的 Nest 注入 token/装饰器，遵循生成后端的现有模式；不另建网关身份验证或自行转发授权 JSON。请求关联使用平台传入的 request ID。

## 通知与事件 {#notifications}

运营查询与恢复使用用户态 `OpenXiangdaNotificationService.listMessages({ correlationId, limit, offset })`、`listDeadLetters({ messageId, limit, offset })` 和 `replayDeadLetter(deadLetterId)`。应用保留原平台 messageId，按业务来源定位原通知；恢复只重试原投递，禁止重新 `send` 整个批次。平台保持 `app:notification2:read`、`app:notification2:content:read`、`app:notification2:delivery:retry` 分离授权，应用通常仅向管理员授予需要的管理权限。接口固定当前应用和环境，不接受应用服务身份代替用户。

死信返回 messageId、deliveryId、correlationId；投影阶段尚无消息时为 null。若较新修订已投递，重放返回 `superseded: true` 而不再次发送。重复或未知结果应刷新原消息/死信状态，不能更换业务通知幂等键绕过。

具名动作的 `platformAccess.managedFiles` 可精确声明 `file`、`image`、`signature` 和 `text.rich` 字段。富文本内嵌图片必须绑定实际富文本字段，不能借封面字段的权限。创建和更新意图分别声明；Connected Dev 同样逐请求验证开发会话，再对既有记录生成短时精确附件证明，不开放资源普通 CRUD。

具名用户动作发送通知使用 `OpenXiangdaBusinessNotificationService.send()`，携带稳定 eventId、messageKey、sourceSequence 和 idempotencyKey。重放同一事件返回已有消息；同一 messageKey 的更高序列用于收敛状态。通知目标使用声明的 PC/移动路由代码及参数，不拼接环境域名或身份凭据。

签名事件处理器使用 `sendFromEvent()`，在声明中指定事件 data 内的收件人与文案路径，由平台验证不可变事件后解析。普通业务动作不需要平台通知管理权限。需要高级钉钉卡片时才使用已授权的管理服务和已启用通道，不能把它设为普通审批的默认依赖。

事件处理器可正常注入请求作用域的通知服务或瞬态依赖。SDK 先验证签名、应用、环境、
事件 Schema 并认领回执，再从处理器所属 Nest 模块创建本次投递的依赖作用域。
静态单例仍由 Nest 复用；失败重试创建新作用域并保留原事件幂等键。处理器中的
`REQUEST` 不含用户授权，不能用 `send()` 冒充具名用户动作；事件身份仅来自当前
已验证的 `handle(event, context)` 执行，离开该执行后调用 `sendFromEvent()` 会拒绝。

通知协议常量也从同一个公开入口导入：

```ts
import {
  OpenXiangdaBusinessNotificationService,
  OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2,
  OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2,
} from 'openxiangda/nest';
```

用户动作 send 的 schemaVersion 使用 OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2；事件处理 sendFromEvent 使用 OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2。二者的调用上下文和收件人来源不同，不能混用。
## 外部处理受控文件

需要水印或归档处理时，Nest DataApi 可签发短期对象下载地址。不要把要求登录态的 content URL 或用户 Cookie 交给外部服务。

```ts
const source = await data.createFileDownloadSession('documents', sourceFileId, {
  purpose: 'watermark', expiresInSeconds: 120,
});
const output = await data.initiateFileOutput('documents', {
  fieldCode: 'file', fileName: 'processed.pdf', contentType: 'application/pdf',
  maxFileSize: 20 * 1024 * 1024, idempotencyKey: jobKey,
});
if (output.status === 'pending') {
  // 交给受信任服务：source.downloadUrl、output.uploadUrl、uploadMethod、formFields。
  // 服务须按 POST multipart 原样提交 formFields，并将 file 字段放最后。
  // 服务确认上传后，再调用 completeFileOutput；不要预估或伪造 fileSize。
  const file = await data.completeFileOutput('documents', output.fileId);
} else {
  const file = output.file; // 同一意图已经完成，复用回执。
}
```

这些方法适用于当前用户、具名业务动作和应用服务身份，沿用各自权限；业务记录绑定仍需正式数据事务。输出目前支持 OSS/MinIO，受字段上限与100MiB硬上限约束，上传凭据五分钟后过期，完成须在额外十分钟内进行。过期错误应由调用者建立新的处理意图，不能无限重试相同过期计划。下载最长五分钟，签发后到期前为短期委托，不能即时撤回。不要在日志、持久草稿或业务数据中保存签名地址、POST policy 或签名字段。

主子记录共享精确金额额度、撤回修订和审批释放，请使用[精确金额占用](decimal-reservations.md)的受管提交及终态事务。


## 本人业务联系信息

本人报名等确需联系电话的具名动作，显式声明
`platformAccess: { directory: { mode: 'current-initiator', fields: ['displayName', 'primaryDepartment', 'phone'] } }`，
然后调用 `businessDirectory.currentInitiator()`。平台从当前账号返回只读 `phone: string | null`，
修剪空白且最多80字符；未设置时返回 null，由业务规则处理资料缺失。调用方不能指定人员 ID
或信任浏览器提交的联系信息，关键提交仍须核对 `snapshotRevision`；电话变化会改变该修订。

`phone` 只在该动作显式声明时查询和返回；默认 SubjectProfile、人员搜索和 `selected-user`
不提供此投影。使用此字段需要平台能力 `directory.current-initiator-phone` 1.0.0，编译器从声明
自动派生，不手写能力目录。受管 `backend-plan` 命令可在 execution.directory 中以相同方式
声明本人电话；平台保留执行证明和有效 lease 边界。本能力不提供电话查人或联系方式修改。

## 解析管理员选定的组织人员

管理员补录或身份订正应使用平台目录，不创建第二份人员主数据。具名动作声明
`platformAccess: { directory: { mode: 'selected-user', fields: ['displayName', 'employeeNumber', 'primaryDepartment', 'departments'] } }`
后，调用 `businessDirectory.selectedUser(userId)`。仅传标准人员选择器返回的确定 ID；姓名、工号和部门均由平台返回，不能相信表单传入快照。

此动作的调用者还需要既有 `app:<appCode>:directory:read` 权限；平台复核当前租户、环境、目录范围和人员有效期，一次只解析一人。普通用户本人报名继续使用 `currentInitiator()`。身份快照不是永久授权凭据，后续业务事务仍需检查角色、状态与额度。平台能力为 `directory.selected-user` 1.0.0；失败时保留原操作，不回退姓名匹配或应用人员表。
## 具名资料编辑的字段输入

action-owned 资源需要跨字段业务校验时，可在具名动作声明
`platformAccess: { dataCommands: { mode: 'recoverable-native' }, recordEdit: { resourceCode: 'requests', fieldCodes: ['name', 'reason'] } }`。
只允许一个资源、最多200个已声明可更新的普通字段；系统字段、流水号和子表不适用。普通CRUD权限不会因此开放。
声明自动要求 `data.record-edit` 1.0.0 平台能力；仅支持旧具名数据命令的平台需要先升级。

Field Kit 的 `SurfaceFieldRenderers.recordEditInput` 接受 `{ operationCode, recordId, expectedRevision }`，
字典与受限人员通过现有接口读取保存资料的范围，不能用浏览器bindings替代。
上传继续使用 `uploadOperationManagedFile` 的update意图及同记录ID。
平台验证同一成员同时拥有动作能力与资料read，再按原RLS读取；首次commitCommand仅接受同资源的一条update和声明字段，
CAS与写后范围检查同事务执行。应用仍负责业务规则和字典guards。

保存与核对共用同一operation，首次业务读取前先resolveOriginalCommand；not_observed只表示观察时未见回执，
不自动重试或换键。管理员资料修改不会重写已完成意见、已走路径或已派审批人，后续任务按平台原Native修订协议处理。
