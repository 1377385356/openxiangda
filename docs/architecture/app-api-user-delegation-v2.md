# App API 用户委托数据访问

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

> 历史决策记录。本文件中“业务动作内部继续受调用用户资源、字段和行权限约束”的结论已被 [可信业务动作数据访问 v2](./trusted-business-action-data-access-v2.md) 取代。普通浏览器 CRUD 仍保持当前用户角色并集授权；新的 NestJS 业务动作使用平台验证的可信后端数据通道。

## 问题证据

- 平台网关已经把浏览器当前 Principal、RoleSession 和精确请求摘要签入短期 Gateway Assertion，`OpenXiangdaAuthzGuard` 也把验证后的用户上下文写入请求作用域。
- 官方采购示例的用户 App API 却注入了 `OpenXiangdaApplicationDataApiService`。该 facade 明确用于无 HTTP 请求的 Worker/Scheduler，并用 workload OAuth2 应用身份及空 RoleSession 调用 Data API。
- reference-environment preproduction 验收中，用户上传并完成的托管文件由应用身份事务绑定，平台以 `OPENXIANGDA_NATIVE_DATA_FILE_OWNERSHIP_MISMATCH` 拒绝；同一路径还会让业务数据策略从当前用户漂移到应用身份。

## 决策

### 能力所有者

- 平台网关和经验证的 NestJS 请求作用域是用户 App API 身份的唯一所有者。
- `OpenXiangdaDataApiService` 是用户 HTTP 请求内访问 Data API 的唯一 facade，必须原样转发 Gateway invocation authorization 和 RoleSession。
- `OpenXiangdaApplicationDataApiService` 仅属于没有用户 HTTP 上下文的 Worker、Scheduler、事件消费者和显式服务调用，继续使用平台托管 OAuth2 workload identity。

### 稳定不变量与受影响合同

1. 用户 App API 的 capability、数据权限、审计 actor、托管文件所有权和事务幂等主体始终是同一个已验证 RoleSession。
2. 应用后端不得从正文、查询或自定义 header 构造用户身份；只使用全局 transport guard 写入的请求作用域。
3. 本轮不增加委托 token、额外数据库状态或新平台接口，只修正官方模板的 facade 选择和文档。
4. Worker/Scheduler 的 OAuth2、Native Data API 路径、稳定字段值、1.0 应用、流程和自动化合同不变。

### 失败、并发、安全与资源边界

- 缺少 Gateway invocation 或 RoleSession 时，请求作用域 Data API fail closed；不能自动回退应用身份。
- 每个请求使用自己的 NestJS request scope，不缓存或跨请求复用用户 RoleSession；应用 OAuth token 缓存仍只属于 workload facade。
- 文件上传、完成和业务事务必须使用同一用户 RoleSession；后台任务如需处理文件，必须先以应用身份自行创建该文件，不能接管用户未绑定文件。

### 回滚边界

- 模板和示例应用可独立回滚到上一提交；平台 API 和数据库无需回滚。
- 已发布旧 2.0 测试应用不自动改写。2.0 当前没有兼容承诺，新生成应用直接采用正确 facade。

## 可证伪验收

1. 模板测试断言用户 App API 注入 `OpenXiangdaDataApiService`，并拒绝重新引入 `OpenXiangdaApplicationDataApiService`。
2. Nest SDK 的现有测试继续证明 request-scoped facade 转发 RoleSession，workload facade 使用空 RoleSession 且只在 401 后刷新一次。
3. reference-environment 真实应用完成“用户上传 → App API 事务绑定 → Data API 读取 → 受保护下载”，文件 UUID、稳定附件值和审计主体保持一致。
4. 同一记录继续完成 Workflow prepare/start，并在部门管理员角色工作中心可见。
