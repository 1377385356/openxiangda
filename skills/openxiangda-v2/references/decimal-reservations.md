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

首批只覆盖主子额度和三个真实审批结果。作废/终止释放 committed 必须另有受管
真实业务动作；状态枚举不代表已实现该能力，签后金额变更仍拒绝。锁等待最多2秒、
单条SQL最多5秒，较严格的已有约束优先；retryable 409
`OPENXIANGDA_NATIVE_DECIMAL_CONTENTION` 不允许换键掩盖未知结果。
