# 缓存、排队与整数配额

`data.concurrency` 是可选的平台声明，用于限量申领、抢票和预约。平台负责缓存回源、等待资格、持久受理、受控 Native 事务及整数配额；应用通过 `openxiangda/react` 或 `openxiangda/mobile` 调用。平台必须声明能力 `data.managed-concurrency@1.0.0`。旧平台会在编译/发布能力检查阶段拒绝此声明。

页面开发参见[并发能力的前端接入](managed-concurrency-frontend.md)：按热点详情、一键申请、填完再提交、短确认入口、预占确认和原结果恢复选择交互方式，并核对当前 API 与尚未提供的封装边界。

## 声明与权限

完整且由双编译器测试验证的示例位于源码 `examples/managed-concurrency/declaration.ts`。调用 `defineOpenXiangdaApp(concurrencyExample())` 即可编译。把示例中的 `data.concurrency` 合入应用配置，并按实际业务配置模型和参与权限。

| 声明 | 作用 |
| --- | --- |
| `reads` | 命名读取、有限参数、字段、条件、权限范围、新鲜期、旧值期限、失效字段和回源预算 |
| `admission` | 本应用/环境所有命令共享的每秒速率、突发额度、在途上限 |
| `commands` | 当前用户的能力、按资源分队列、最长等待、处理截止、Native 守卫和原子写入 |
| `quotas` | 容量来源、业务记录上的分配 ID、可选的预占到期时间 |

默认 permit 模式的参数限于 UUID、有限字符串枚举和有限整数范围；绑定只接受 `input`、可信 `actor`、字面量和平台生成的 `allocation`。permit 命令最多 8 个操作、8 个记录守卫。permit 模式不执行应用任意 JS/SQL，也不在锁内调用外部系统。通知和外部副作用接已有事务后事件。

配额来源模型的容量字段必须是整数；分配记录模型的引用字段必须是必填 UUID，模型设置 `mutationOwner: 'queued-command'`。角色仍须具备来源读取、分配模型创建和命令能力。普通 CRUD、导入、应用凭据均不能绕过命令所有权。用户身份由 `actor` 绑定，不能使用用户填写的人员编号决定名额归属。

`database-now` 条件使用数据库时间，并按“字段 操作符 当前时间”解释。例如截止前允许报名：`{ kind: 'database-now', field: 'closesAt', operator: 'gt' }`。资格和业务截止在执行时重验，因此等待或已受理不等于一定成功。

## 展示读取

```ts
const client = createManagedConcurrencyClient();
const snapshot = await client.read('offer', { id: selectedOfferId });
// snapshot.items、generatedAt、freshUntil、staleUntil、version、freshness
```

在平台身份初始化完成后创建并保持 `client` 实例稳定。它绑定应用、环境和当前用户；切换身份后旧客户端拒绝继续操作。组织内共享内容也要求登录与当前权限。`scope: 'application'` 不允许行策略或 actor 条件；个人/有行策略的数据使用 `scope: 'subject'`。

每次访问仍通过平台现有身份、版本与字段权限链路。缓存减少内容查询；不能据此宣称整个请求零 SQL。活动内容和余量使用不同读取声明与依赖，避免每次报名使详情失效。`dependencies` 必须覆盖返回和过滤字段。Native 提交在同一事务写失效事实，恢复任务负责可靠推进；变更传播有延迟，要求即时资格或即时关闭的判断必须放在命令守卫中。

冷缓存使用进程请求合并与跨副本刷新租约，短暂争用返回可重试响应。负缓存最长 5 秒，TTL 带随机抖动。可在应用版本激活后，用正常授权的 `read` 调用预热有限的热点 ID。首版提供认证后的 Redis/进程缓存，不提供公共 CDN 发布或自动扫描全量数据预热。

## 提交与原结果恢复

```tsx
import { useMemo } from 'react';
import { createManagedConcurrencyClient, useManagedCommand,
  ManagedCommandStatus } from 'openxiangda/react';

export function Claim({ offerId }: { offerId: string }) {
  // 父级在平台身份就绪后挂载；身份变化时重新挂载此子树。
  const client = useMemo(() => createManagedConcurrencyClient(), []);
  const command = useManagedCommand({ client, command: 'claim',
    input: { id: offerId }, storageKey: offerId });
  return <>
    <button disabled={command.state !== 'idle'}
      onClick={() => void command.start().catch(() => {})}>申请</button>
    <ManagedCommandStatus snapshot={command} />
    {command.state === 'error' && <button
      onClick={() => void command.resume().catch(() => {})}>恢复原操作</button>}
  </>;
}
```

挂载只恢复已有请求，用户调用 `start()` 才创建新意图。默认以 `sessionStorage` 保存原请求键及恢复资料，刷新后继续查原结果；浏览器禁止存储时明确失败，不自动改用易丢失的内存状态。可传入同接口的可靠存储。不要另写循环换请求键重试。

等待阶段只轮询签名票据，不重复查业务数据。SDK 遵守建议间隔并加抖动，故障时逐步退避至约 30 秒。组件卸载或 `stop()` 只停止观察，不取消已受理命令。取消使用 `cancel()`，会核对原命令并处理与受理竞争的情况。只有已知终态才能 `clear()` 开始新意图。

需要先排队再加载重型页面时，设置 `autoAccept: false`，用 `ManagedCommandGate` 的 `children={() => <HeavyContent />}` 延迟构建子树；用户确认后调用 `submit()`。命令输入在排队时固定。它不替代整站认证、应用启动元数据或未使用此能力的接口预算，也不能保护提前在父组件发起的请求。

| 状态 | 含义 |
| --- | --- |
| `waiting` / `admitted` | 等待/获准受理，尚未占名额 |
| `accepted` / `executing` / `retry_wait` | 已持久受理，平台继续处理 |
| `succeeded` | 权威事务已提交，原结果可恢复 |
| `rejected` / `expired` / `cancelled` | 明确终态 |
| `recovering` / `error` | 正在核对/暂时无法确认，保留原请求键 |

## 配额和发布边界

立即分配用 `quota.action: 'allocate', mode: 'committed'`；需要预占时声明 `reservationSeconds` 并用 `mode: 'reserved'`。另声明 `confirm`、`release` 命令，绑定原 `allocation`，该命令的 `operations` 为空。只有原主体可确认/释放；到期与确认竞争使用数据库时间及固定锁顺序。

原命令回执不可变。预占之后到期或释放，应调用 `client.allocation(allocationId)` 获取当前分配状态，不能用旧成功回执证明仍持有名额。内置 quota 模式同一池/主体保留永久去重事实，释放后不会自动重新报名；应用若需要新一轮，应使用新的权威资源/配额池，不能删除历史分配。

容量减少不能低于已预占加已确认数量。存在配额历史时，禁止删除来源、改写分配引用或发布移除配额映射的版本。应用激活先排空所有非终态命令；不会让旧任务在新 Head 上执行。连接开发消费已激活测试版本的并发声明，未激活的本地模型覆盖层不能作为持久命令契约。

## 资源上限与故障处理

| 边界 | 首版硬上限 |
| --- | --- |
| 每应用/环境等待 | 128 个资源队列、合计 10000 人，同时受声明的更小上限约束 |
| 缓存 | 单值 256 KiB；应用/环境累计 32 MiB、2048 个有效键；进程 L1 最多 256 个条目 |
| 回源 | 每进程 2 个、每应用跨副本 2 个；应用合计 20 次/秒并受声明预算限制 |
| HTTP | 并发能力普通入口每进程 8 个，查原结果独立 4 个 |
| worker | 每进程最多 2 个，同一资源通过数据库事务锁协调 |

Redis 不可用会停止新准入和缓存回源，绝不把所有请求直接放到数据库。已持久受理命令依赖 PostgreSQL 和现有 RabbitMQ 恢复；原结果在 Redis 故障时每进程最多 4 次/秒、4 个并发可回查。Redis 丢失会重建在途事实并换票据世代，临时等待位置可能变化。

RabbitMQ 的消息只是唤醒提示；队列丢失或发布失败由数据库恢复，重复消息读取同一命令。锁等待或慢执行触发有界重试与应用短暂暂停放行。系统并不承诺跨队列严格公平，也不承诺一旦排队就必定获票。

管理员可使用同源 POST `/openxiangda-api/v2/applications/:appCode/native/concurrency/status`，请求带 `environmentKey`，查看非终态数量/最早时间、最多 100 个配额池及当前进程缓存指标。`control` 接收 `{ environmentKey, paused: true }` 停止新受理；只允许应用超级管理员。停用或回滚前停止受理、排空命令、保留配额与原结果；不得通过删锁、删队列数据补偿业务。

暂停/恢复按同一个环境锁串行传播；Redis 不可用时控制接口明确报错。控制值是绝对值，可以使用相同 `paused` 重试并核对状态。数据库提交确认丢失时不猜测控制结果；受理始终复查数据库的暂停状态。

验证应包括内容 SQL 与授权 SQL 占比、每秒完成数、P95/P99、最老等待、连接数、锁等待和恢复时间。仓库故障测试证明协议边界，不代表任何客户环境的生产吞吐。部署者仍需使用目标硬件、真实权限和活动规模做容量验收。


## 持久排队的应用业务计划（durable）

需要「受理后关闭浏览器仍继续」或取消后再次申请的业务，声明 `mode: 'durable'` 和 `execution.kind: 'backend-plan'`，额外要求 `data.managed-concurrency.durable@1.0.0`。默认省略 mode 仍走原 permit 协议，不能混用 wait/accept 和 enqueue。持久受理先提交数据库；MQ 只唤醒，Redis 只保存可重建的预算和位置投影。受理成功不是报名成功。

```ts
{
  code: 'registration-enroll', mode: 'durable', capability: 'app:arts:registration:submit',
  parameters: { activity: {type:'uuid'}, channel: {type:'uuid'},
    agreed: {type:'boolean'}, phone: {type:'string',maxLength:32} },
  resourceKey: {from:'input',key:'activity'}, deadlineSeconds:3600,
  intake: {perSecond:100,burst:100,maxInFlight:50},
  admission: {perSecond:2,burst:2,maxInFlight:2,maxQueue:5000,maxWaitSeconds:3600},
  execution: {kind:'backend-plan',handlerCode:'registration-enroll',timeoutMs:10000,
    resources:[{resourceCode:'registrations',readFields:['id','activityId','person'],
      writeOperations:['create'],writeFields:['activityId','person']}],
    directory:{mode:'current-initiator',fields:['displayName','employeeNumber','primaryDepartment','departments']}}
}
```

这是声明片段，资源/字段、角色能力和应用总 admission 必须与实际模型一致。示例预算不是吞吐量承诺。durable 参数最多 8 个、编码最多 8 KiB；自由字符串 maxLength 最大 256，boolean 只允许 durable。intake 的 perSecond/burst/maxInFlight 各为 1..1000，独立限制新受理；admission 三项限制执行，不能超过应用共享预算。maxQueue 最大 10000，maxWaitSeconds 最大 3600，deadlineSeconds 为 10..3600，处理期限从最初数据库 acceptedAt 起算，重试不延长。

resources 最多 32 个，每项 readFields/writeFields 各最多 64 字段，writeOperations 仅 create/update/increment；不声明即不可访问。directory 仅允许当前发起人及四种现有字段，不接受 userId。不得同时声明静态 operations/guards/quota。普通业务模型不必改为 queued-command 所有权；管理员取消等正常业务动作仍使用原权限。已有内置 quota 的独占分配模型不允许通过 backend-plan 改写。

### 后端只读计划

从应用 generated 导入 `managedCommandHandlerManifest`，传给 `OpenXiangdaModule.forApplication({managedCommandHandlerManifest})`。使用 `OpenXiangdaManagedCommandHandler({commandCode,handlerCode})` 注册实现 `plan(input, context)` 的 Nest provider。声明会启用后端；显式禁用 backend 会编译失败。SDK 生成固定 `POST /__platform/managed-commands/:handlerCode/plan`，不可自定义 URL。

context 提供 commandId/commandCode/generation、actor.userId、acceptedAt/deadlineAt、data.get/query 和 directory.currentInitiator()。get 无记录抛 404；query 返回标准 DataPage。handler 强制 request scope，构造函数和依赖只在网关签名与在线执行证明核实之后解析。执行证明保存在 SDK 私有 ALS，普通 SDK 事务、写入、通知和 OAuth 调用在该上下文内拒绝。应用只返回：

```ts
return {
  schemaVersion:'openxiangda.managed-command-plan/v1',
  guards:[{kind:'record-match',resourceCode:'channels',id:channel.id,
    lockKey:`channel:${channel.id}`,errorCode:'OPENXIANGDA_REGISTRATION_CLOSED',
    assertions:[{kind:'command-accepted-at',field:'closesAt',operator:'gte'}]}],
  operations:[{operation:'create',resourceCode:'registrations',data:{activityId,person:context.actor.userId}}],
  result:{registrationId:{operationIndex:0,field:'id'}}
};
```

对应读取和写入字段必须列入 declaration。guard 比较方向为「字段 operator acceptedAt」，不使用客户端时间，也不改变普通 database-now 含义。最多 99 操作、20 守卫、64 KiB 完整响应；仅 create/update/increment。result 中的 `{operationIndex,field:'id'}` 必须指向本计划的 create，由平台提交后替换真实 ID。禁止事务 key、任意副作用或调用回调。应用仍需实时容量、活动开关与活动周期去重守卫，不能把受理时间当作名额保证。

平台在短事务中复核 generation/租约/head/期限/当前命令资格，执行 Native 计划并原子落终态。冲突重新运行只读 handler；网络重试不会重复业务效果。通知以业务事务中的待发送事实或已有事务事件触发，不能在 plan 中直接发送。

### 本人结果与恢复

`client.enqueue(code,input,requestKey)` 返回持久回执；`client.mine(code,{resourceKey,cursor?,limit})` 只查询当前主体，最多 20 条；`client.result` 延续原 ID/原 key。回执包含 resourceKey、updatedAt，可选 queue `{position:number|null,observedAt}`，位置是近似投影，缺失不代表请求丢失。结果终态只说明那次业务事务；管理员取消后仍应读当前业务记录，用户明确操作才发起新周期。

浏览器使用 `useDurableCommand`，详见[前端接入](managed-concurrency-frontend.md#durable)。部署先发布新 SDK/编译器并确认平台能力；回退前暂停新受理、排空或核对所有原命令，不让旧镜像消费未知执行模式。不能用 SDK 单测替代真实多用户并发、关闭浏览器、跨设备结果和原子事务验收。
