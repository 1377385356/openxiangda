# 主子记录精确金额占用

需要跨多条子记录共享主记录额度时，使用平台 `data.decimal-reservations` 1.1.0，
金额字段声明 `number.decimal`、`precision: 18`、`scale: 2`、`exactDecimal: true`。
JSON 金额使用字符串。平台在父记录锁内用 PostgreSQL NUMERIC 校验占用；应用不做
浮点求和、不维护另一个余额字段。此能力需要匹配 SDK、平台镜像和迁移；包安装成功
不表示目标环境已就绪，先检查平台能力和正式部署回执。

## 声明与首次提交

提交的 Named Action 在 `platformAccess.decimalReservation` 声明 `mode: 'reserve'`、
资源、amount/currency/relation/parent/root/status 六个字段、主子关系取值和允许状态，
并用 `platformAccess.workflow.codes` 声明实际审批。当前用户仍需资源与字段读写权限。
首次使用会冻结环境内该资源的映射；已有未入账子记录时拒绝启用，不自动补账。

在 `OpenXiangdaBusinessProcessService.commit` 顶层增加：

```ts
const decimalReservation = {
  parentId,
  expectedParentRevision: parent.revision,
  childOperationKey: 'child',
  reservationKey: submission.reservationKey,
  amount: '123.45',
  currencyCode: 'CNY',
};
```

`childOperationKey` 同 `workflow.subject.fromOperation`，选中唯一一条该资源的
create 或 update。平台原子完成子记录、占额、审批命令和可选本人草稿消费。
审批通过将 reserved 改为 committed，继续占额；驳回或撤回释放一次。

## 撤回后修订并重提

released 子记录仍不能通过普通 CRUD 或 `BusinessData.transaction` 修改金额、
状态、父/root/关系等保护字段。界面把修订保存到本人 FormDraft，重提时一次提交：

```ts
await businessProcess.commit({
  idempotencyKey: submission.idempotencyKey,
  data: {
    operations: [{
      key: 'child', kind: 'update', resourceCode: 'contracts',
      id: child.id, expectedRevision: child.revision,
      data: {
        title: draft.title,
        amount: '123.45',
        status: { value: 'approving' },
      },
    }],
  },
  formDraft: {
    resourceCode: 'contracts', id: draft.id,
    expectedRevision: draft.revision, mode: 'update', recordId: child.id,
  },
  decimalReservation,
  workflow: { workflowCode: 'contract-approval', subject: { fromOperation: 'child' } },
});
```

每次新的提交意图使用新的 reservationKey 和提交键；网络结果未知时保留原键及原
payload查询/重试，不能用新键重做旧请求。更新保留父/root/关系，失败会整体回滚，
本人草稿仍可恢复，正式金额与审批命令不会半完成。普通主记录继续原来的无额度路径。

## 真实审批事件终态

在真实审批消费者的 `platformAccess` 增加以下声明；其中状态取值由应用自己的
资源选项决定。审批必须声明同一 subject 资源，且存在该资源的 reserve 动作映射。

```ts
platformAccess: {
  decimalReservation: {
    resourceCode: 'contracts', workflowCode: 'contract-approval',
    outcomes: [
      { eventType: 'openxiangda.workflow.instance.completed.v2', mode: 'commit', eligibleChildStatuses: ['signing'] },
      { eventType: 'openxiangda.workflow.instance.rejected.v2', mode: 'release', eligibleChildStatuses: ['rejected'] },
      { eventType: 'openxiangda.workflow.instance.withdrawn.v2', mode: 'release', eligibleChildStatuses: ['draft'] },
    ],
  },
}
```

每个 eventType 也必须列在订阅的 eventTypes 中。不得使用自造应用事件或
native-data execution 订阅获得此权限。事件 handler 中用已有的
`OpenXiangdaApplicationDataApiService`，将终态附加到原事务：

```ts
import { idempotentTransaction } from 'openxiangda/nest';

await applicationData.transaction(idempotentTransaction(
  context.idempotencyKey,
  [childStatusUpdate, auditCreate],
  [],
  { decimalReservation: {
    reservationKey: originalSubmission.reservationKey,
    transitionKey: context.idempotencyKey,
    childOperationIndex: 0,
  } },
));
```

选中的 childStatusUpdate 必须是该资源唯一 update，保留正常 expectedRevision。
模式和金额不能放进终态请求；平台从真实 leased delivery、原始及当前不可变订阅、
workflow command/instance/subject revision 和台账验证，SDK自动继承已验签事件上下文。
普通应用凭据或自填事件头不构成授权。精确同键、同payload重放返回原完整事务结果；
旧轮次不能释放重提后的新占用。重放仍受当前权限、有效事件租约和父记录可读性约束。

作废/终止释放 committed 必须另有受管真实业务动作；状态枚举不代表已实现该能力，
签后金额变更仍拒绝。锁等待最多2秒、
单条SQL最多5秒，较严格的已有约束优先；retryable 409
`OPENXIANGDA_NATIVE_DECIMAL_CONTENTION` 不允许换键掩盖未知结果。

## 提交金额后的正常生命周期

需要在 committed 后继续签订、履行等状态操作时，在模型上声明
`decimalReservationLifecycle`。它复用同资源 reserve 动作的状态与关系字段，
不新增接口或余额；未声明时继续原有严格保护。以下状态均须已在状态字段选项中声明：

```ts
decimalReservationLifecycle: {
  parentTransitions: [
    { from: 'active', to: 'closed' },
    { from: 'closed', to: 'active' },
  ],
  childTransitions: [
    { from: 'signing', to: 'fulfilled' },
    { from: 'fulfilled', to: 'signing' },
  ],
  fulfilledChildStatuses: ['fulfilled'],
  lockedParentStatuses: ['closed'],
}
```

之后用既有 Data API update 或 transaction，带原记录的 expectedRevision。
当前用户或已授权后台主体仍须具备原资源、字段和数据范围权限。金额、币种、主子关系、
parent/root 仍受保护，声明状态边不授予写权限。普通子状态更新必须属于当前 committed
周期；reserved/released 继续走真实受管审批或重新提交，不能绕过审批。

父记录进入 locked 状态时，所有当前占用都必须已 committed 且子状态在 fulfilled 集合；
存在 reserved、缺失子记录、金额/关系不一致或未履行子记录时返回
`OPENXIANGDA_NATIVE_DECIMAL_PARENT_UNFULFILLED_CHILDREN`。released 历史周期已退出义务。
终止、作废不会自动算作履行或释放金额，需按真实业务含义选择声明。
父记录 locked 后拒绝新预留和把子记录改回未履行状态，返回
`OPENXIANGDA_NATIVE_DECIMAL_PARENT_LOCKED`；如需解锁，必须有明确的父状态边和原更新权限。

每类最多 64 条不重复、非自身状态边，两个状态集合各 1–16 项。状态和映射不符、缺少
reserve 声明、锁定状态仍可新预留，在本地检查即拒绝并指向声明位置。
显式启用才要求 `data.decimal-reservation-lifecycle@1.0.0`；目标环境须先升级并具备该能力。
状态规则改变在激活新版本前会核对现有关闭父记录，冲突返回
`OPENXIANGDA_NATIVE_DECIMAL_LIFECYCLE_ACTIVATION_CONFLICT`，保留原版本和数据；不会自动改历史状态。
移除声明将恢复严格保护。回滚到不支持本能力的服务器前，应先停用依赖此声明的入口。
Connected Dev 会保留已激活规则。新增或改变规则时，先通过 `check` 并发布到测试环境，
使历史一致性校验完成后再连接开发；若仅改本地覆盖层，会返回
`OPENXIANGDA_CONNECTED_DEV_OVERLAY_DECIMAL_LIFECYCLE_ACTIVATION_REQUIRED` 和声明指针。
这样不会出现本地规则被接受却在写入时悄悄忽略的情况。
