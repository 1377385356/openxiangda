# OpenXiangda AI Capability Contract v1

状态：P5-0 / P5-A 已完成，P5-B 已实现 AppPackage/active version Catalog 绑定与 Native 当前用户只读 Catalog/Query 入口；P5-C 正在补齐 Native 写入 Preview/Confirm/Execute 闭环。

## 1. 决策

OpenXiangda 2.0 的 AI 能力事实源是应用仓库中的资源、权限和动作声明，不是 Prompt、MCP Server 或独立 Catalog 数据库。

编译链路为：

```text
openxiangda-app.config.ts
  -> openxiangda.ai-capability/v1 Catalog
  -> AppPackage / active version
  -> platform AI Gateway
  -> MCP / Function Calling adapters
```

P5-B 将 Catalog 放进 AppPackage 的 `metadata.aiCatalog` 和 `metadata.aiCatalogDigest`，由平台在 AppVersion/Environment Head 激活后读取。这样 Catalog 与不可变包摘要绑定，不增加第二个 Catalog 数据库或独立发布状态。

MCP 是边界适配器。它可以按应用暴露一个逻辑 MCP，也可以由平台聚合多个应用；两者必须消费同一份 Catalog，不能各自维护工具定义。

## 2. Catalog 结构

Catalog 的 `schemaVersion` 为 `openxiangda.ai-capability/v1`。每个能力包含：

- 稳定的应用作用域 `code`，例如 `visitor-app.reservations.query`；
- `kind`：`generatedCrud` 或 `customAction`；
- `operation`：`query`、`get`、`create`、`update`、`delete` 或 `custom`；
- 输入和输出 JSON Schema；
- 依赖的 Data Resource 和已有 capability；
- `risk`、`confirmation`、`idempotency`、`concurrency`；
- 有界的 `maxRows`、`timeoutMs` 和副作用描述。

Catalog 只描述能力，不携带当前用户身份、角色选择、Token、Secret 或真实数据。

## 3. 自动生成边界

Data Resource 自动生成五个基础能力：

```text
<app>.<resource>.query
<app>.<resource>.get
<app>.<resource>.create
<app>.<resource>.update
<app>.<resource>.delete
```

自动能力使用资源已有的 `read/create/update/delete` capability，查询最多 100 行，写操作要求确认、幂等键和必要的修订检查。

自动生成不推断业务语义。预约、选课、审批、冲突检查、外部通知、多资源不变量等必须声明 `customAction`，由应用后端实现，仍然只能通过当前用户上下文和受限 Data API 访问数据。

## 4. 权限与执行

Catalog 不是授权结果。运行时每一次调用都必须重新取得当前用户、租户和应用角色集合，并由目标应用的 Data API 执行页面相同的操作、行和字段权限。Catalog 可按用户过滤以减少信息泄露，但不能替代服务端复核。

读取动作可直接执行。写动作分为：

```text
preview -> user confirmation -> execute
```

平台维护短期 `previewId`，绑定当前用户、动作、参数、修订和幂等键；应用开发者不实现 Token、哈希或第二套安全协议。确认执行时仍要重新校验权限、数据修订和重复提交。

## 5. 应用级 MCP 适配器

`createApplicationAiMcpServer` 接收一份 Catalog 和一个宿主执行器：

- 读能力注册为同名 MCP tool；
- 写能力只注册 `<capability>.preview`，只返回预览；
- 统一的 `openxiangda.ai.confirm` 只接受预览返回的 `previewId`；
- Catalog 作为 `openxiangda://ai/catalog` 资源提供；
- MCP 适配器不持有身份，不访问数据库，不实现授权。
- `createApplicationAiPlatformExecutor` 只绑定平台 AI Query/Preview/Confirm 入口；MCP 包不实现进程内预览、Data API 直连或另一套幂等逻辑。
- `createAggregatedAiMcpServer` 暴露固定的九个总 AI 工具，并在每次调用时重新加载当前用户可见 Catalog；确认工具显式携带 `appCode`，聚合器因此不保存进程内预览路由状态。

平台 Native 入口 `GET /openxiangda-api/v2/applications/:appCode/native/ai/catalog` 只读取当前激活 AppVersion 的 Catalog，并按当前请求的资源操作权限和字段读权限裁剪；它不会返回当前用户不可读资源或字段。`POST /openxiangda-api/v2/applications/:appCode/native/ai/query` 只接受 Catalog 中当前可见的 `query/get` 能力，并复用 Native Data API，因此每次调用仍由服务端重新验证当前用户。Catalog 只是发现和 Schema，不是授权结果。

因此“每个应用一个 MCP”是可以支持的，但它应该是平台按 Catalog 自动生成的逻辑出口，而不是应用团队手写和维护的第二套协议。

推荐的部署形态是混合模式：

1. 应用可以有一个独立 MCP 入口，便于单应用接入外部 AI；
2. 平台总 AI 使用同一个 Catalog 聚合器，按用户和语义只暴露相关应用的工具；
3. 两个入口最终调用同一个平台执行器，不能通过独立 MCP 获得更高权限。

## 6. 不纳入本协议的内容

- MCP annotations 不是安全边界；
- A2A 只用于未来的代理间长任务协作，不用于普通 CRUD；
- CloudEvents 只用于未来领域事件，不用于工具调用；
- 不允许应用为 AI 建独立数据库、角色、OAuth 客户端或超级 Token；
- 不允许全局 AI 直接拼接底层 CRUD 来完成预约、审批等复杂业务动作；
- 不承诺跨应用分布式原子事务，需要原子性时由单一领域动作或未来 Workflow 负责。

## 7. 验证状态与下一步

已完成：

- contracts 导出 `openxiangda.ai-capability/v1` 及 JSON Schema；
- devkit 从 Data Resource 确定性生成 CRUD Catalog；
- Catalog 校验风险、确认、幂等、并发和资源绑定；
- `contract_describe` 返回 Catalog 及摘要；
- 应用级 MCP 的读、预览、确认链路通过 InMemory MCP 黑盒测试。
- AppPackage metadata 携带 Catalog 后，平台 Native Catalog 服务按 active Head 读取并完成操作/字段裁剪单测。
- 平台 Native `ai/query` 服务按当前 Catalog 能力复用 Data API 的查询单测。
- 平台 Native `ai/preview`、`ai/confirm` 已实现生成 CRUD 与显式自定义动作的预览、Head 变化重验和一次性确认单测；MCP 聚合器已通过固定工具集和跨应用黑盒测试。

Native Gateway 的当前用户只读查询、写入 Preview/Confirm/Execute、显式自定义动作和跨应用 Catalog 聚合已完成源码单测与 MCP 内存传输黑盒。本轮版本发布后还必须完成预生产 HTTP 回归；标准 MCP HTTP 传输仍然只能是本协议的适配层，不能另起授权、预览存储或数据访问边界。

## P5-B 架构门

- 问题证据：旧 AppPackage 只有配置和数据契约摘要，平台运行时没有统一的 AI 能力发现入口。
- 能力所有者：Devkit 编译 Catalog；AppPackage 绑定不可变元数据；AppVersion/Environment Head 持有激活版本；Native Data API 持有用户身份、操作、行和字段授权。
- 稳定不变量：Catalog digest 必须随 package digest 变化；只读取 active Head；Catalog 不携带 Token、角色选择或真实数据；每次 Data API 调用重新验证当前用户。
- 失败与并发：没有 active version 或 Catalog 返回稳定 404；字段/操作不可见时裁剪；Head 切换后旧 Catalog 不能授权新数据，Data API 重新按当前 Head 复核。
- 回滚边界：工具链与平台作为同一协议版本回滚。2.0 不解释没有 Catalog 或使用旧动作语法的 AppPackage，也不增加兼容分支。
- 可证伪验证：Devkit package metadata 测试、平台 Catalog 字段裁剪测试、真实预发 Head 上的 current-user → ai/catalog → Data API query 黑盒。

## P5-C 架构门：Native 写入 Preview/Confirm/Execute

- 问题证据：只读 Catalog/Query 已有平台入口，但 AI 仍不能以页面同一用户上下文安全地完成新增、修改、删除和显式业务动作。
- 能力所有者：Catalog 继续由 AppPackage/active AppVersion 提供；Native AI 服务只负责能力发现、预览和一次性确认；Native Data API 继续拥有用户、租户、行、字段、版本和幂等校验；平台不新增 AI 专用角色或数据表。
- 稳定不变量：预览不产生业务副作用；`previewId` 只绑定当前用户、应用、环境、能力、参数摘要、当前 Head/记录版本和幂等键；确认时重新读取 active Head、Catalog、权限和修订，再调用同一 Data API transaction；确认成功后预览只能使用一次。
- 失败与并发：能力不可见、字段越权、Head/记录修订变化、幂等键冲突或预览过期均返回稳定错误且不写数据；部署态预览使用平台 Redis 的短 TTL 原子取删，进程内存储只作为单元测试替身，不属于运行时契约。
- 安全与资源边界：只允许 Catalog 中已声明且当前用户可执行的单资源 `create/update/delete`；最多 100 条操作，复用 Data API 的字段/行策略、事务和幂等约束；不打印参数、Token 或真实数据。
- 回滚边界：新增入口为 additive；关闭入口或回滚平台后，既有页面、Data API、只读 Catalog/Query 不受影响；不改变 AppVersion、Head 或生产应用。
- 可证伪验证：平台单测证明 preview 无写入、confirm 重验当前 Catalog/权限、重复 confirm 失败；真实 preproduction 用一个受控测试记录完成 preview → confirm → query 后态，并保持 production 不变。
