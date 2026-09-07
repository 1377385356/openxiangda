# 可信业务动作数据访问 v2

## 状态

本决策取代《App API 用户委托数据访问》中“所有用户 App API 数据调用继续受调用用户资源、字段和行权限约束”的结论。OpenXiangda 2.0 尚未承诺兼容旧应用，本轮直接采用新的唯一合同。

## 问题证据

- App Gateway 已经把当前用户角色并集和短期 invocation token 绑定到唯一的应用、环境、AppVersion、DeploymentRun、Environment Head 与 BackendRevision；Nest 全局 transport guard 会验证 Gateway Assertion，`OpenXiangdaAuthzGuard` 会按已发布 `OpenXiangdaOperation` 再检查一次动作能力。
- Native Data API 已把当前 Native runtime credential 视为本应用、本环境的可信后端：`data:read` / `data:write` / `data:transaction` scope 通过后，不再应用普通用户的资源能力、字段策略和 RLS。
- 业务动作目前只能注入面向当前用户的 `OpenXiangdaDataApiService`，因此动作内部仍会重复承受调用用户的数据权限；若改用无请求上下文的 workload facade，又会丢失动作代码、原始发起人和本次 Gateway 调用的审计关联。

## 决策

### 能力所有者

- App Gateway 是业务动作入口身份和目标部署的唯一所有者。
- `OpenXiangdaOperation` 声明的 `code + requiredCapability` 是动作权限的唯一合同；应用不再编写第二份 authorization JSON。
- Nest SDK 提供请求作用域 `OpenXiangdaBusinessDataApiService`。它只能在已通过 `OpenXiangdaOperation` 的请求中使用，并把已验证的 invocation 或 Connected Dev Session、动作代码与能力传回平台。
- Native Data API 仍是业务数据、事务、文件和审计的唯一所有者。平台把这条已验证的动作通道提升为本应用、本环境的应用级数据权限，但保留真实发起人。

### 稳定不变量与受影响合同

1. 普通浏览器 CRUD 继续直接使用 Native Data API，并受当前用户角色并集、资源能力、字段权限和 RLS 约束。
2. 用户只在业务动作入口检查一次 `requiredCapability`。动作进入可信 Nest 后端后，数据读写不再受该用户的资源、字段或行权限约束。
3. 可信动作只能访问 invocation/Dev Session 所绑定的 tenant、app、environment 和当前 Head，不能跨应用、跨环境、跨版本或跨部署。
4. 已部署运行时的 `code + requiredCapability` 必须匹配当前 Head 的不可变 App API contract；Connected Dev 使用短期开发会话和本地编译合同，不建立第二份平台配置。
5. 审计 actor 表示应用后端执行，`initiatedBy` 保留真实用户或调用应用，`businessAction` 保留动作代码和入口能力。
6. 用户发起的动作处理托管文件以及写入 `created_by` / `updated_by` 时，归属仍使用真实发起人；授权执行身份与业务归属身份不得混为一体。
7. `OpenXiangdaDataApiService` 仍是显式“按当前用户权限访问”的 facade；`OpenXiangdaApplicationDataApiService` 仍只用于 Worker、Scheduler、事件消费者等无 HTTP 请求的后台工作。
8. 可信动作使用独立的、请求级 `native-business-action` 数据主体，不得伪装成 OAuth client 或 `native-2` runtime credential。平台传给 PostgreSQL 的内部 claims 必须包含动作代码、动作能力、证明类型、Gateway invocation token ID 和真实 `initiatedBy`；RLS 再以当前 Head 的不可变 contract 校验 `code + requiredCapability`。

### 失败、并发、安全与资源边界

- 没有经过 Gateway Assertion/Connected Dev Session、没有 `OpenXiangdaOperation` 元数据、动作合同不匹配、入口能力失效或 Head 已变化时一律 fail closed，不回退到普通应用 OAuth 或用户权限。
- 动作 header 不能单独提权。平台只接受已经由 invocation middleware 验证的短期 invocation，或已解析的 loopback Connected Dev Session。
- 已部署动作必须携带 `gateway-invocation` 证明和有效 invocation token ID；缺少或错配 action、capability、proof、target/Head、initiating user 任一事实时，Native Data query 与 transaction 都 fail closed。Connected Dev 使用独立的预发 proof，不冒充 Gateway invocation。
- 数据事务继续使用既有 100 操作上限、幂等键、CAS revision、数据库事务和事件 outbox；本决策不增加另一套存储或事务引擎。
- 应用级权限只覆盖该应用在精确环境 Head 下声明的数据资源，不代表平台管理员、租户管理员、跨应用或跨环境权限。

### 回滚边界

- SDK 的新 facade、平台动作提升解析和审计扩展可作为一个合同版本整体回滚。
- 不修改 1.0 工具、1.0 SDD 或既有 1.0 应用。
- 2.0 不提供旧的业务动作用户委托语义兼容层；回滚只能回到上一套 2.0 包与平台组合。

## 可证伪验收

1. 无入口动作能力的用户调用业务动作得到 403，且 Nest handler 和 Data API 均未执行。
2. 有动作能力但没有目标资源 create/update 权限的用户可以通过 `OpenXiangdaBusinessDataApiService` 完成合法事务；同一用户直接调用 Native Data API 仍得到 403。
3. 伪造动作 header、缺少 operation metadata、使用旧 Head invocation 或声明外的 `code + capability` 均被拒绝。
4. 审计记录显示应用后端 actor、真实 `initiatedBy`、动作代码、requestId/traceId；`created_by` / `updated_by` 和用户上传文件归属仍是发起用户。
5. 应用尝试访问其他 app/environment 或超出当前 Head 的资源失败。
6. 真实 PostgreSQL 黑盒同时覆盖 Business Action query 和 transaction，并证明缺少 invocation proof、错配 action/capability 或过期 Head 时零写入；既有 current-user、Connected Dev、runtime credential 与外部 OAuth principal 验收保持通过。
