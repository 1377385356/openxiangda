# 并发能力的前端接入

适用于活动报名、限量申领、抢票和预约。permit API 从 `openxiangda@2.31.0` 引入；目标平台必须支持 `data.managed-concurrency@1.0.0`。先按[缓存、排队与整数配额](./managed-concurrency.md)声明读取、命令、配额和权限，再选择页面接入形式。

推荐体验是正常浏览内容，在用户明确提交时按需等待，并持续核对同一次申请的结果。低负载时可以很快完成，不需要人为添加等待页。

## 选择接入形式 {#patterns}

| 形式 | 适用场景 | 用户流程 | 当前接入方式 |
| --- | --- | --- | --- |
| 持久受理后可离开 | 后台自动完成、跨设备恢复 | 填写 → 明确提交 → 持久受理 → 查询结果 | `useDurableCommand`，需 durable 独立能力 |
| 热点内容直接浏览 | 详情、场次、活动说明 | 浏览 → 按需刷新 | `client.read`，应用处理读取状态 |
| 按钮发起、原地等待 | 一键报名、限量申领 | 点击 → 排队 → 处理 → 结果 | `useManagedCommand` + `ManagedCommandStatus` |
| 先填写、再排队提交 | 有选项的预约和申请 | 填写校验 → 确认内容 → 排队提交 | 有界参数组合现有 hook；复杂资料需要额外冻结契约 |
| 放行后短确认 | 输入已确定、加载成本较高的确认步骤 | 进入 → 等待 → 短确认 → 提交 | `autoAccept: false` + `ManagedCommandGate` + `submit()` |
| 预占后确认 | 暂留名额、时段预约 | 预占 → 核实有效期 → 确认或释放 | 应用声明预占/确认/释放命令，配合 `client.allocation` |
| 返回后恢复原申请 | 刷新、断网、查看本人结果 | 恢复原请求 → 核对 → 结果 | hook 挂载恢复，或 `client.result` 查询已知操作 |

常见报名页面可以组合前三种：详情走缓存，用户确认活动和选项后提交，按钮附近展开状态；成功后进入本人记录。PC 状态区、抽屉和移动端底部区域可以使用不同外观，共用同一个操作状态。

## 页面与平台的分工 {#ownership}

页面负责内容、选项、字段校验、业务文案和结果路由。平台负责当前用户身份、准入、幂等、事务、配额和权威结果。身份使用声明中的可信 `actor`，不使用用户填写的工号决定记录归属。

平台身份就绪后创建 `createManagedConcurrencyClient()`，并保持实例稳定。它绑定当前应用、环境和主体；身份/环境变化时重新挂载对应页面子树，不能复用旧客户端或旧视图。

一次操作只使用一个 `useManagedCommand`。按钮、状态条和弹层消费同一个快照，不要各自调用 hook 创建观察循环。当前 SDK 通过 `openxiangda/react` 和 `openxiangda/mobile` 导出相同的受管并发能力；普通字段仍复用[Field Kit](./field-components.md)，界面遵循[前端组件与页面归属](./frontend.md)。

不要把受管模型继续绑定到普通 CRUD 提交按钮，也不要传入任意 `async onSubmit` 并假设它会自动获得排队和原子保证。最终动作必须是已发布的受管命令。

## 热点详情读取 {#cached-read}

以下示例对应源码 `examples/managed-concurrency/declaration.ts` 中的 `offer` 命名读取。`offerId` 必须是该应用真实资源的 UUID：

```ts
import { createManagedConcurrencyClient } from 'openxiangda/react';

type Client = ReturnType<typeof createManagedConcurrencyClient>;
type Offer = { id: string; title: string; closesAt: string };

export async function readOffer(
  client: Client,
  offerId: string,
  signal?: AbortSignal,
) {
  return client.read<Offer>('offer', { id: offerId }, signal);
}
```

将读取接入应用已有的异步查询状态：初次加载显示局部骨架，空数组显示无可展示内容，失败提供局部重试。组件卸载或资源变化时中止旧请求，迟到响应不能覆盖新资源。同页多个观察者可复用应用已有查询层，查询键包含 `client.scope`、读取 code 和规范化参数，身份变化时清除旧主体视图；当前没有内置的 `useManagedRead` hook。

### 只读预算繁忙恢复

`read`、`mine`、`result`、`allocation` 共用有界恢复：单次调用默认含 HTTP 和等待的总预算 120 秒，最多 12 次总请求。只重试 HTTP 429 的 `CONCURRENCY_API_BUSY`、`CONCURRENCY_RESULT_BUSY`、`CONCURRENCY_RATE_LIMITED`、`CONCURRENCY_SOURCE_BUSY`；兼容旧平台的 HTTP 503 仅限前两个已知预算错误。明确 `retryable: false`、未知 429、权限拒绝、Redis/数据库/授权依赖失败和网络失败直接返回，不用繁忙重试掩盖。

第一次失败后的基础等待为 2 秒，之后指数增加到最多 30 秒；取其与有效服务端提示的较大值，再加 0% 至 25% 随机抖动。提示优先使用合法 `Retry-After`（秒或 HTTP 日期），缺失时使用 `data.retryAfterMs`。若等待达到剩余预算，不提前查询，直接返回最后一次繁忙错误；12 次用完也保留最后繁忙响应。正在进行的请求超过总预算则中止并返回 `CONCURRENCY_READ_RECOVERY_EXHAUSTED`，不以之前的繁忙响应掩盖悬挂请求。

可以传入更短的剩余预算，不能扩展单次 120 秒上限：

```ts
// budgetMs 含本次请求和所有预算繁忙退避；服务端事实仍为最终依据。
const receipt = await client.result({ operationId }, signal, {
  budgetMs: Math.max(0, originalDeadline - Date.now()),
});
const offer = await client.read<Offer>('offer', { id: offerId }, signal, { budgetMs: 30_000 });
```

每次调用在第一次请求前冻结完整参数、环境、主体及权限视角；后续修改表单不会改变重试内容。身份或视角变化时停止旧调用并返回 `CONCURRENCY_IDENTITY_CHANGED`。`AbortSignal` 可以中止请求和等待；组件卸载应中止旧读取。`enqueue`、`accept`、`cancel` 等写方法不使用这层自动重试，持久申请的原键受理恢复由下述控制器单独管理。普通 Data API 也不自动获得此策略。

`freshness: 'stale'` 表示返回的是允许使用的旧内容，并不证明后台刷新已经成功。保留内容并提示“当前展示最近一次可用信息”；按新鲜期和有界退避刷新，超过 `staleUntil` 后不能继续无限展示。手动刷新仍调用同一命名读取，不绕回普通 CRUD。

详情与余量使用不同读取声明。页面倒计时本地显示，不能每秒重查活动；资格、开放时间和扣减仍由服务端决定。缓存余量不保证获票；允许补量或释放的业务，也不能因旧余量为零永久阻止新的有效申请。等待期间不要重复读取详情或表单。

## 一键申请与原结果恢复 {#one-click}

示例对应官方声明中的 `claim` 命令。父级在身份就绪后挂载，用户、环境或 `offerId` 变化时重新挂载本组件：

```tsx
import { useMemo } from 'react';
import {
  createManagedConcurrencyClient,
  useManagedCommand,
  ManagedCommandStatus,
} from 'openxiangda/react';

export function ClaimAction({ offerId }: { offerId: string }) {
  const client = useMemo(() => createManagedConcurrencyClient(), []);
  const command = useManagedCommand({
    client,
    command: 'claim',
    input: { id: offerId },
    storageKey: `claim:${offerId}`,
  });
  // start / resume 的失败进入快照；保留原请求，按错误原因恢复。
  const observe = (action: () => Promise<void>) => {
    void action().catch(() => {});
  };
  return (
    <section>
      <button disabled={command.state !== 'idle'}
        onClick={() => observe(() => command.start())}>
        申请
      </button>
      <ManagedCommandStatus snapshot={command} />
      {command.state === 'error' && (
        <div>
          <p>暂时无法确认结果，请核对原申请。</p>
          <button onClick={() => observe(() => command.resume())}>
            核对原申请
          </button>
        </div>
      )}
      {command.state === 'succeeded' && <p>可查看本次申请记录。</p>}
    </section>
  );
}
```

挂载只恢复已有意图；用户点击 `start()` 才创建新意图。默认放行后自动受理，适合点击已经明确表达提交意愿的动作。不要在 `useEffect` 中调用 `start()` 自动报名，不要手写循环换请求键重试。

等待只轮询票据，受理后查询原命令结果；SDK 遵守建议间隔并退避。按钮禁用只是体验，服务端仍执行幂等和业务去重。成功时可从 `receipt.result.items` 定位已创建的业务记录；不要在成功回调里再次写订单、扣名额或发通知。导航和视图刷新应允许重复执行。

## 填写后再提交 {#form-submit}

先校验字段，向用户展示确认摘要，再将输入固定并启动命令。受管 hook 使用固定后的输入，不要直接绑定每次键入都变化的表单对象。提交后刷新页面，要从本次意图的稳定资料恢复相同输入，再挂载 hook；不能用空表单覆盖原请求。

排队后需要修改资料时，先请求取消并核实结果，再允许编辑和创建新意图。取消与受理、执行、成功可能竞争；服务端返回已经成功时，应展示原结果，不能继续当作草稿编辑或假定取消成功。组件卸载或关闭面板仅停止观察，不取消命令。

当前命令参数仅支持 UUID、枚举字符串和有限整数。场次、规格等可以按声明接入；配额 `units` 由命令声明固定，传入整数参数不会自动改变扣减数量。姓名、任意备注、附件及整份表单 JSON 不属于当前参数范围。

复杂资料需要先定义并验证“草稿 → 不可变资料版本 → 命令引用版本 ID”的契约，核实作者、目标资源、版本和字段权限，并阻止冻结资料被普通 CRUD 改写。只传 `draftId` 而允许原稿继续变化不满足要求。该通用冻结机制和表单桥接尚未提供，不能把任意表单保存接口包进 hook 就当作已支持；草稿保存本身也需要独立预算。

## 放行后的短确认 {#confirmation-gate}

此形式要求排队前已确定命令参数，用户明确请求进入确认步骤。沿用前例的身份/client 生命周期，创建命令时设置 `autoAccept: false`；入口按钮调用 `start()`，获准后的确认按钮调用 `submit()`：

```tsx
// command 已由 useManagedCommand 创建，并设置 autoAccept: false。
// Confirmation 是应用组件；它只核对已经固定的输入。
<ManagedCommandGate snapshot={command}>
  {() => (
    <Confirmation
      onConfirm={() => void command.submit().catch(handleActionError)}
    />
  )}
</ManagedCommandGate>
```

`ManagedCommandGate` 从与 hook 相同的公开入口导入。上例是前例中的组合片段，`Confirmation` 和 `handleActionError` 由应用定义；错误处理必须保留原请求，不能直接清除并重提。耗时请求和懒加载应在子树内发生，父组件提前发请求会失去保护。

`admitted` 是短期受理许可，不是名额预占，也不是长时间填写表单的许可证。当前 Gate 只按快照状态决定是否挂载，没有内建到期倒计时；应用按 `waiting.expiresAt` 提示并核实，最终提交时服务端校验许可，SDK 沿原请求恢复。

“先进入页面，再任意决定最终输入”需要与命令输入解耦的页面准入契约，当前 Gate 不提供这个语义。它在应用启动、身份就绪后工作，不能替代静态资源、登录、启动元数据和整个站点入口的保护。

## 预占与最终确认 {#reservation}

应用先声明 `quota.action: 'allocate'`、`mode: 'reserved'` 和 `reservationSeconds`，另声明确认/释放命令。三个动作分别使用稳定恢复键，并按[配额生命周期](./managed-concurrency.md#配额和发布边界)绑定原分配 ID。

预占命令 `succeeded` 只证明预占事务曾成功。先读取 `receipt.result.allocation.id`，再调用 `client.allocation(allocationId)` 核实当前状态，界面显示“已暂留名额”。确认或释放后也要核对当前分配，不能用旧成功回执证明仍持有名额。

进入页面、回到前台和临近到期时有界核实。`expiresAt` 用于展示估算倒计时；当前回执没有 `serverNow`，浏览器时间不能作为最终过期依据。归零显示“正在核实有效期”，确认和到期竞争以服务端结果为准。关闭窗口不自动释放。

同池/主体永久去重；释放后不会自动允许同一主体重申同一池。需要下一轮申请时使用新的权威资源/池，不删除分配记录或换请求键绕过限制。

## 状态文案与用户动作 {#states}

| 状态 | 界面含义 | 动作规则 |
| --- | --- | --- |
| `idle` | 可以申请 | 明确点击后 `start()` |
| `waiting` | 正在等待进入，尚未获得名额 | 等待；可申请退出排队 |
| `admitted` | 已轮到您，可以确认 | 手动确认形式调用 `submit()` |
| `accepted` / `executing` / `retry_wait` | 已收到申请，正在处理 | 查询原结果；按服务端规则申请取消 |
| `recovering` | 正在核对原申请 | 保留原键，继续退避观察 |
| `error` | 暂时无法确认或无法继续 | 按原因恢复登录、处理存储或 `resume()`；不统一显示报名失败 |
| `succeeded` | 权威事务已提交 | 按业务显示报名成功或暂留名额；预占另核实分配 |
| `rejected` | 明确未通过 | 区分售罄、资格、截止等业务原因 |
| `expired` / `cancelled` | 等待或命令到期、已取消 | 区分票据与命令终态，明确结束后才 `clear()` |

排队位置只在 `waiting.position` 存在时显示，不换算成保证等待时长或保证名额；缺少位置时显示等待文案，不画虚假百分比。临时队列故障后位置可能变化。

`ManagedCommandStatus` 支持 `errorMessages` 映射回执错误。产品层同时检查 `snapshot.errorCode` 与 `receipt.errorCode`，补齐身份变化、存储不可用、恢复输入冲突等原因。用户文案不暴露数据库、锁或票据内部信息。

`cancel()` 的 Promise 失败也要明确展示“取消结果尚未确认”，保留原意图并恢复查询；不要吞掉取消错误后宣布取消成功。关闭状态面板、离开页面与取消申请使用不同按钮和文案。状态变化使用无障碍提示，抽屉/底部区域遵循现有组件的焦点管理。

## 刷新、断网与我的申请 {#recovery}

默认恢复信息保存在 `sessionStorage`，按应用、环境、主体、命令和 `storageKey` 隔离。同标签页刷新可以恢复；`storageKey` 必须稳定，不能在每次渲染时随机生成。存储不可用时明确停止或处理，不能悄悄改用易丢失的内存继续提交。

已知 `operationId` 或原 `requestKey` 时，可以用 `client.result` 查询原结果。已成功业务记录可通过本人权限下的普通数据查询展示。durable 命令另有 client.mine 和 useDurableCommand 用于本人跨设备恢复，见下文；原 permit 等待票据仍依赖本地保存，不能把浏览器存储当作全平台事实。

不要把超时解释为提交失败，也不要在结果未知时 `clear()`。重试、恢复与返回入口都应该指向原意图。配额永久去重与界面请求键是不同边界：清除一个已终结的界面状态不代表可以再次获得同一池名额。

## 当前组件与后续封装边界 {#available-components}

当前可用：`createManagedConcurrencyClient`、`useManagedCommand`、`useDurableCommand`、`ManagedCommandStatus`、`ManagedCommandGate`，以及客户端的读取、结果、取消和分配状态方法。

`useManagedRead`、`ManagedCommandButton`、`ManagedCommandPanel`、`useManagedFormSubmission`、`useManagedAllocation`、`AllocationStatus` 是建议的后续封装名称，当前不是公开导出。不要照这些名称编写 import。应用现在可以使用已有 hook 与平台普通 UI 组件组合界面，后续标准封装仍应复用同一状态机和传输。

复杂资料冻结、跨所有命令的全局索引、独立页面准入及精确倒计时需要相应的平台契约，不能仅通过前端外观补齐。SDK 版本、平台部署和实际业务容量需要分别确认。

## 接入验收 {#acceptance}

| 操作 | 应观察到的结果 |
| --- | --- |
| 打开详情或重渲染 | 不自动报名；详情与余量按声明读取，不因排队反复查表 |
| 连点、刷新、提交响应丢失 | 沿用原意图，恢复原结果，不生成重复业务记录 |
| 排队时编辑资料 | 固定原输入，取消尚未核实前不切换到另一次提交 |
| 关闭状态区后返回 | 继续查看原操作，不宣称已取消 |
| 取消与受理/成功同时发生 | 显示服务端原结果；错误时保留待核实状态 |
| 身份切换、存储被禁用 | 不串用旧主体资料，不静默丢弃恢复能力 |
| 网络或依赖异常 | 显示故障并保留原键；恢复后查询原结果，不绕回数据库或快速换键重提 |
| 许可到期、预占到期 | 分别核实准入与分配，互不冒充 |
| 键盘、屏幕阅读器、窄屏 | 状态可读，焦点可控，关闭与取消语义清楚 |

这些检查与目标环境的吞吐、P95/P99、授权查询成本和故障恢复验证一起完成；页面演示和 SDK 单元测试不能代替真实业务验收。


## 持久受理与跨设备恢复 {#durable}

```tsx
const client = useMemo(() => createManagedConcurrencyClient(), []);
const command = useDurableCommand({client,command:'registration-enroll',resourceKey:activityId,acceptanceRecoveryMs:30*60*1000});
// 仅真实点击提交；不是 useEffect 或页面 mount 回调。
const submit = () => command.submit({activity:activityId,channel:channelId,agreed:true,phone});
```

hook 从 `openxiangda/react` 和 `openxiangda/mobile` 导出。state、initialized、isObserving、requestKey、receipt、errorCode 用于统一状态区；submit(input)、resume()、refresh()、stop() 分别为明确提交、用冻结 input 重试原请求、恢复查询和停止观察。挂载只查本地原 key 或服务端 mine，不自动 enqueue。未知应答保留原 key 与 input；用户恢复后先查原结果，不能换 key 重试。浏览器存储失败在提交前明确失败。未知应答后的恢复按钮调用 resume()，不传当前可能已经修改的表单。snapshot.input 可恢复本地冻结表单；跨设备只有回执时不展示推测的原输入。一次明确 submit/resume 期间，429、暂时5xx或网络错误会按原 key/input 自动退避恢复，先查原结果再重试 enqueue，默认最多6次、最长120秒；可用 acceptanceRecoveryMs 明确配置120000至1800000毫秒，更长预算最多120次，遵守更长的 Retry-After。预算从首次明确提交计时，刷新或 resume() 不重置；旧版意图没有时间时从首次明确恢复计时，无法证明更早的提交时间。尚无 receipt 时只能提示“正在确认受理”，不能承诺可关闭页面。用完预算保留原意图，停止自动入队，refresh() 仍可只读核对迟到结果；这不是报名失败。该预算只控制受理恢复，不是后端最终完成时限承诺。如果刷新时原请求尚未被平台受理，挂载只查询，明确点击 resume() 才重新启动有界受理重试。

已受理申请的自动观察最多持续到首次明确提交后的 30 分钟，默认受理恢复仍为 120 秒，两者分别计算。每次结果读取同时受单次 120 秒和原提交剩余时间限制；刷新和 resume 不重新获得观察时间。跨设备没有本地首次时间时，用原回执 acceptedAt 计算观察窗口，不能以页面挂载时间重新计时。达到窗口后保留原意图，状态为 recovering、isObserving 为 false，提示稍后核对；明确 refresh 仍可查询迟到终态，但不重新启动已经到期的自动观察，也不自动提交。

正常待处理结果每次至少间隔 5 秒，遵守更长的服务端 retryAfterMs，再加随机抖动。单次只读恢复耗尽且仍是已知预算繁忙时，外层可在原观察窗口内指数退避继续；权限、依赖、网络故障或悬挂请求超过读取预算时立即停止自动观察，显示 error 并保留原回执和请求键。终态停止。受理恢复中核对原结果同样只允许已知预算繁忙继续，读取依赖失败不能被外层重试隐藏。一个业务区域只挂载一个观察者。离开或关闭页面不撤销已受理请求，平台自动继续；新设备通过 mine 找到本人的原请求。position 为空时显示「已受理，稍后可查看」，不要显示虚假的精确人数或预计秒数。

refresh 会优先恢复 mine 返回的新进行中周期，避免本地历史 succeeded 遮蔽另一个设备的新申请。不要在 mount 发现历史 succeeded 时自动跳成功页或永久禁用提交。它可能已经被管理员取消，需结合当前业务记录展示。只有用户明确再次点击 submit，且原请求已有终态，SDK 才创建新的 requestKey；活跃请求或未知应答始终恢复原 key。平台明确返回未受理的参数错误（400 + CONCURRENCY_INPUT_INVALID 等约定错误）时，SDK 才清除被拒输入，允许修正后再提交；未知 400、409、429、5xx 和网络错误仍保留原意图。成功提示以 receipt.state==='succeeded' 和 receipt.result 为准，accepted/executing 只显示「已登记，处理中」。

permit 的 ManagedCommandGate 仍只用于 admitted 短确认，不用于 durable。durable 不能套任意前端 onSubmit 冒充后台事务，真正业务必须由已声明的 backend-plan handler 返回受管计划。
