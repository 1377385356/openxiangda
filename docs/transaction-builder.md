# 构建与校验事务

`openxiangda/nest` 导出 `createDataTransaction`、`diagnoseDataTransaction` 和 `DataTransactionBuildError`。不需要额外依赖内部包。

```ts
import { createDataTransaction } from 'openxiangda/nest';

const tx = createDataTransaction(operationId);
tx.guard({
  kind: 'record-match', resourceCode: 'accounts', id: account.id,
  lockKey: `account:${account.id}`, errorCode: 'OPENXIANGDA_ACCOUNT_INACTIVE',
  assertions: [{ kind: 'value', field: 'active', operator: 'eq', value: true }],
});
tx.operation({
  operation: 'update', resourceCode: 'accounts', id: account.id,
  expectedRevision: account.revision, data: { count: nextCount, status: 'confirmed' },
});
await data.transaction(tx.build());
```

只读条件使用 `record-match`。`record-assert` 必须恰好绑定一次同资源同记录写入；多个字段使用一次 CAS update，不自动合并多次 increment/update。`build()` 在请求发送前执行公开契约校验；失败的 `diagnostics` 保留路径，并提供 `operationIndex` 或 `guardIndex`。权限、字段类型与并发结果仍由服务端最终判断。

`operation()` 返回操作索引；`reference(index)` 只能引用已添加的 create 主键，用于后续操作的 data 字段。构建器保留顺序及幂等键，返回副本；不会发送请求、自动重试、改写守卫或执行 SQL。已有手写请求可以先调用 `diagnoseDataTransaction(request)`。
