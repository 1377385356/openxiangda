# OpenXiangda 2.0 本地开发内核

> **SUPERSEDED / 历史证据（2026-08-21）**：本文不再是产品合同，也不得作为实现、CLI、Skill 或 AI 开发依据。当前合同是[产品北极星](./product-north-star-v2.md)与仓库根架构决策：本地开发仅运行 React + NestJS 并连接远端 test，不需要本地平台、Docker 或 PostgreSQL；公开 CLI 不再包含 `dev status/stop/reset` 或 `event timer fire`。本文已从当前导航、生成式入口和 AI 指引中移除，以下正文仅保留用于解释旧实现为何被破坏性删除。

状态：L0-L3 已实现，并由打包工具链创建的全新应用在真实 PostgreSQL 上验证；本轮补齐可审计的 status/stop/reset 生命周期控制

> 2026-08-16 架构修订：Admin 前端目标工具链已[全量切换到 Ant Design Pro v6 / Umi Max](./ant-design-pro-v6-admin-foundation.md)。本文出现的 Vite 只描述切换前已实现证据；迁移后由 Umi 开发服务接替页面与 HMR，本地平台、真实 PostgreSQL、NestJS、生命周期与安全边界保持不变。

## 1. 产品结论

开发者在新建应用后只需要运行：

```bash
openxiangda dev
```

命令打开完整 Admin 应用并同时启动 React/Umi Max、NestJS 和本地平台服务。前端、后端、生成契约和应用声明支持有界热更新；开发者不需要先 provision、登录远程平台或创建第三个远程环境。

远程部署环境只有 `preproduction`、`production`。`local` 是进程运行模式，不是 environment registry 记录：

```text
local source + local state
          | build once
          v
immutable AppVersion -> preproduction Head -> production Head
```

因此公共合同必须区分：

```ts
type LocalRuntimeMode = "local";
type DeploymentEnvironment = "preproduction" | "production";
type RuntimeMode = LocalRuntimeMode | DeploymentEnvironment;
```

CLI 不提供 `deploy development`、`deploy local` 或 `promote preproduction` 的反向路径；production 只接收已经在 preproduction 验证过的同一 AppVersion/package/image digest。

## 2. 架构门禁

| 维度 | 决定 |
| --- | --- |
| 问题证据 | 当前模板已有 Vite 内存平台模拟器和并行 `pnpm dev`，但 Nest 默认仍把环境写成 `development`，Data/Workflow/Event 状态主要在前端进程中模拟；这足以演示页面，不能证明真实 PostgreSQL、进程重启、前后端调用和安全边界。 |
| 能力所有者 | `openxiangda dev` 是本地生命周期唯一编排者；本地平台服务拥有身份、Data API、Workflow/Event 和开发状态；Vite 只负责页面/HMR，Nest 只负责应用业务接口。应用代码不自行启动数据库或伪造平台 token。 |
| 稳定不变量 | local 永不出现在远程 registry/Head/DeploymentRun；AppPackage 不含目标环境；本地状态和凭据不发布；同一源码生成的合同由本地测试和远程运行共同消费，不维护第二套业务 API。 |
| 上下游合同 | CLI 生成一个 loopback manifest，向 Web/Nest 注入 local base URL、app identity 和短期 local credential；Data API、Admin context、Workflow/Event 的 HTTP/JSON 合同与 Native v3 一致，只有 issuer、存储生命周期和副作用策略不同。 |
| 并发与失败 | 每个工作区按 canonical path digest 持有单实例锁、动态端口和本地状态目录；第二个 `dev` 返回已有 URL，不重复启动。任一子进程失败时有界终止整组进程并保留诊断，不调用远程写接口。`dev stop` 通过 PID + 进程启动身份防止 PID 重用误杀；`dev reset --data` 与启动争抢同一锁，不能边运行边删除。重启恢复持久开发数据，显式 reset 才精确重建当前工作区状态。 |
| 安全与资源 | 服务默认只监听 `127.0.0.1`；local token 固定 local issuer/audience 且不能被远程平台接受，远程 OAuth/Secret 不自动导入。PostgreSQL 容器有磁盘/内存预算；本地数据库凭据、OAuth 原始 Secret 和加密主材料只在权限为 0600 的 Git 忽略目录保存，原始 OAuth Secret 只注入 NestJS，日志与响应不输出 token/Secret。生产 build 静态证明不包含 local middleware。 |
| 回滚单元 | L0-L3 都只改变 CLI、模板和本地测试；不修改线上 Head。异常时可回退本地工具版本。数据库数据只由带所有权验证的 `dev reset --data` 删除；手工删除 `.openxiangda/local` 不是受支持的数据回滚方式，因为会丢失凭据和资源绑定证据。 |
| 可证伪验收 | 从空目录创建应用后一个命令打开完整 Admin；前端和 Nest 修改均热更新；真实 PostgreSQL 事务/RLS/幂等测试通过；停止/重启保持数据、`dev reset --data` 清空；伪造会话或 Docker 标签时零删除；local token 调远程和远程 token 调 local 均拒绝；production bundle 对 local canary 零命中。 |

## 3. 默认本地拓扑

```text
Browser
  -> Vite/Admin (loopback, HMR)
       -> /service -> Local Platform Service
                         -> RoleSession/OAuth verification
                         -> /openxiangda-app-api -> NestJS application
                         -> Data/OAuth/Secret -> PostgreSQL
                         -> local workflow/event dispatcher
```

- CLI 先执行增量 `generate` 并确认生成成功，再启动依赖；生成失败不会带着旧合同继续运行。
- CLI 自动选择端口并打印/打开一个 URL；Admin 的菜单、路由、标签页、个人中心和角色切换都走同一页面入口。
- Local Platform Service 是 Node 进程，不嵌入 Vite middleware。这样 Nest、浏览器和测试共享同一个平台状态，Vite 重启不会丢失后端事实。
- PostgreSQL 是默认平台状态存储。开发者不安装 PostgreSQL 服务、客户端、用户或建库脚本；只需 Docker Desktop 或兼容容器运行时。CLI 启动摘要固定的 PostgreSQL 16 镜像，按 canonical workspace 创建独立容器和 volume，自动完成建库、迁移、健康检查与 schema digest 校验，不复用任意同端口数据库。
- 无容器运行时时，默认命令返回明确诊断；显式 `--ui-only` 才允许使用无持久性的页面模拟器，并在页面持续显示“UI-only，不可作为平台验证”的标识。CI、`openxiangda test` 和发布检查从不接受 UI-only 证据。

### 3.1 2026-08-14 Native App API 用户身份闭环

| 门禁 | 决定 |
| --- | --- |
| 问题与证据 | 完整本地会话中，Admin 已使用 `openxiangda.native-role-session/v2`，App API 网关也签发绑定该会话的 60 秒 loopback token；Nest SDK 却继续请求 alpha `/authz/principal`。本地验证器最终又把 token 中的 Native session id 与 `openxiangda.role-session/v2` 比较，导致真实 Chromium 流程保存稳定返回 `401 LOCAL_USER_IDENTITY_INVALID`。 |
| 能力所有权 | Native RoleSession 服务是 2.0 用户身份的唯一所有者；网关只签发和转发短期调用身份；`openxiangda-nest` 只通过平台 `/native/authz/principal` 与 `/native/authz/explain` 校验并注入 Native Principal/RoleSession，不建立映射或兼容状态。 |
| 稳定不变量 | 浏览器原始 Authorization 不进入应用；token 必须绑定 app、`runtimeMode=local`、Native RoleSession、60 秒 TTL 和随机 nonce；Nest handler 只收到平台重新验证后的 Native identity。应用身份 OAuth2 仍走独立 `/oauth2/principal`，不允许用无 RoleSession 的服务身份冒充用户。 |
| 上下游契约 | `openxiangda-nest` 的用户上下文改为 `NativePrincipal + NativeRoleSession`，SDK 用户授权路径固定为 `/native/authz`；本地平台补齐同形 principal 端点；官方 Nest 模板的 controller/service 类型同步改为 Native 类型。2.0 不增加 alpha fallback 或运行时开关。 |
| 失败与并发 | 缺失、签名错误、过期、错误 app 或 stale Native RoleSession 均在业务 handler 前拒绝。角色切换后旧 token 即使尚未到期也因 session id 不匹配失败；授权 explain 必须再次校验同一 Native session，写操作不自动重放。 |
| 安全与资源上限 | loopback token 固定 60 秒且只接受 HMAC 等长比较；payload 不携带 allow 结果、业务数据或 Secret。principal/explain 仍受 SDK 5 秒默认超时约束，不增加缓存或后台刷新。 |
| 回滚边界 | 只发布 `openxiangda-local-platform`、`openxiangda-nest` 和包含新类型消费的创建模板；本地数据 schema、远程 Head、1.x SDK 与旧应用无变化。回滚时三个工件作为同一测试 BOM 恢复。 |
| 可证伪验收 | 单测断言 Nest 请求 Native 路径并注入 Native schema；本地平台拒绝伪造/错误 session token；全新独立应用在真实 PostgreSQL 下通过 App API 保存、流程预览、发起和后续审批 Chromium 场景。 |

### 3.2 2026-08-14 确定性浏览器验收边界

| 门禁 | 决定 |
| --- | --- |
| 问题与证据 | Playwright 复用日常开发会话时，历史修改会污染种子数据断言；若测试配置自行删除数据库，又会绕过 CLI 对工作区、容器和 volume 的所有权校验。先跑 UI-only、再跑完整会话还会重复同一批浏览器成本，却不能增加后端证据。 |
| 能力所有权 | 日常 `openxiangda dev` 永远保留开发数据；外部 `OPENXIANGDA_E2E_BASE_URL` 只连接现有会话且零清理；发布门禁由打包工具链创建一次性外部应用，并且只能通过 `openxiangda dev reset --data` 建立确定性初始状态。 |
| 稳定不变量 | 浏览器测试不拥有任意开发者 volume。一次性验收应用完成重置后，Chromium 只运行一次，但路径必须同时穿过 React、独立本地平台、NestJS 与真实 PostgreSQL。UI-only 只服务快速页面回归，不能重复计作完整证据。 |
| 失败与回滚 | reset、进程就绪或任一浏览器场景失败立即终止门禁并保留诊断；一次性工作区与其有所有权标签的资源是唯一清理边界。回滚只需恢复打包验证器，不改变开发数据和线上环境。 |
| 可证伪验收 | 被历史修改污染的持久会话不再用于种子套件；全新 tarball 应用在安全 reset 后通过 8 个 Chromium 场景、重启持久化、事务幂等、并发、事件重放、Workflow/Timer 恢复和最终隔离检查。 |

## 4. 本地身份与状态

- 本地平台为当前工作区生成短期签名材料和 runtime OAuth client，保存在 `.openxiangda/local/`，目录必须被 Git 忽略。原始 OAuth Secret 只注入 NestJS 子进程；Web 子进程和 manifest 只能看到非敏感元数据。
- 默认提供开发者、应用最高管理员以及应用声明的示例角色；切换角色仍生成稳定单角色 RoleSession，不能在前端直接替换 role code。
- local Principal 明确包含 `runtimeMode=local`，不伪造 preproduction/production environment UUID。
- Secret 值只通过本地管理 API 从一次性表单或显式本机输入进入 PostgreSQL 加密存储，不写 config、AppPackage、日志或浏览器持久存储；管理 API 只返回元数据，创建、轮换、幂等回放和审计均不回显明文。
- 本地状态只属于当前工作区。复制仓库不会沿用 identity；工作区 canonical path 改变时需要显式 `dev adopt` 或重新创建，防止两个目录同时写同一 volume。

## 5. Data、Workflow 与 Events

本地开发分清“快速交互”和“发布证据”，但不分裂合同：

1. 页面、Nest App API、Data API 都调用 Native v3 路径和 DTO。
2. Data API 在本地 PostgreSQL 上执行真实 schema、事务、约束、RLS 与幂等逻辑；应用仍不能拿数据库凭据。
3. Workflow Kernel 使用相同定义编译器和命令状态机，本地提供可控时钟、审批人和操作面板；业务字段仍存 Data API/App API。
4. Event 使用与 Data API 写事务一致的持久 outbox、带租约的 delivery 和平台 receipt。暂停订阅后既不生成新 delivery，也不领取已有待处理 delivery；恢复后继续领取。网络错误、408、409、425、429、5xx 按有界指数退避，`Retry-After` 优先，其他 4xx 直接死信；领取代次 CAS 阻止过期 Worker 覆盖新结果；同一原投递与重放幂等键只创建一个 delivery。handler 调用真实 Nest endpoint，应用重启后 receipt 继续抑制重复副作用。
5. Timer 使用持久 schedule/firing 记录和严格六段 Cron；IANA 时区、DST 计算与声明校验由成熟解析器完成。到期事件与 schedule 推进、outbox、delivery 在同一 PostgreSQL 事务内提交，多实例通过行锁与计划时间 CAS 保证同一计划时间只触发一次。停机恢复将遗漏时段合并为一次触发，避免产生无界补偿洪峰；Cron 或时区声明变化会原子重算下一次执行。`openxiangda event timer fire <timer-id>` 只对完整本地开发会话开放，用于无需等待真实时间的端到端验证，仍走相同持久化和 Nest 投递链路。
6. 任何只在 UI-only 模式中通过的场景都不能满足 `openxiangda check` 或 `openxiangda test` 的集成项。

## 6. 命令面

```bash
openxiangda doctor
openxiangda dev [--no-open]
openxiangda dev status
openxiangda dev stop
openxiangda dev reset --data
openxiangda dev --reset
openxiangda dev --ui-only
openxiangda event timer fire <timer-id>
openxiangda test
openxiangda deploy preproduction
openxiangda deploy production --package <package-digest>
```

日常开发不要求记忆容器编排命令、端口、数据库连接或环境 ID。`doctor` 会把 Docker CLI 缺失与 daemon 不可用作为完整本地开发的阻断诊断，同时返回本地会话摘要。`dev status` 不启动 Docker，`dev stop` 保留 volume，`dev reset --data` 是唯一独立的数据删除入口；它先解析全部目标并验证容器 runtime/credential 标签和 volume workspace/runtime 标签，再删除任意目标。高级诊断仍保存在 `.openxiangda/local/diagnostics.json`，内部 Docker 参数不扩展为公共命令。

## 7. 实施顺序

1. **L0 合同切分（已完成）**：Native 合同 `2.0.0-alpha.2` 已删除远程 `development`，引入 `RuntimeMode=local`；模板与测试不再把 local 伪装成远程环境。新 AppPackage 只能部署到 preproduction，同一 AppVersion 只能晋级到 production，回滚只允许两个远端环境。OAuth 等运维轮换使用受当前 Head 和成功运行历史约束的 `redeploy`，不再滥用 promotion。平台所有 Native 远端入口共用同一 fail-closed 环境断言；SQL 合同拒绝新写入 `development`，但保留既有 alpha 行作为不可变审计历史。
2. **L1 生命周期（已完成）**：CLI 已实现按工作区单实例锁、动态端口、进程组监督、就绪后浏览器打开、结构化诊断、日志捕获和安全退出；`--local-sdk` 使用发布同形的 npm tarball 工件，避免源码链接产生多份 React/NestJS 运行时。全新独立应用已经通过 CLI 自身的 check/test/build 以及真实 Vite + NestJS 启停验证。
3. **L2a 独立本地平台（已完成）**：完整模式已把 Vite 内存模拟器抽成独立 loopback 服务；CLI 分别监督应用进程组和平台进程，浏览器通过 Vite 代理、NestJS 通过平台 URL 访问同一状态。任一进程失败会终止整组，第二次启动复用会话，动态三端口和退出清理已在全新独立应用验证。日常开发以 `openxiangda dev` 为唯一受监督入口；内部 `pnpm dev` 只供 CLI 编排，不作为公开入口。
4. **L2b 持久本地平台（已完成）**：本地平台内核已从应用前端模板移入独立 `openxiangda-local-platform` 工具链包；CLI 使用摘要固定的 PostgreSQL 16 镜像，为每个 canonical workspace 建立带所有权标签的容器与 volume，并限制为 1 CPU、512 MiB、200 PID。数据库只绑定 loopback，凭据保存在 Git 忽略且权限为 0600 的工作区状态目录，声明通过文件而非环境变量传递。Data API 的记录、审计、乐观 revision、受限事务、幂等凭证与活动角色已经持久化；授权从应用声明的 RBAC、数据范围、关系授权和字段策略统一求值。runtime/external OAuth client、短期应用 token、应用身份 Data API、加密 Secret、CAS/幂等/审计也使用同一控制存储。浏览器 App API 经过平台网关，浏览器 token 不会直传，网关签发绑定 app 与当前 RoleSession 的 loopback 身份给 NestJS。完整停止再启动保持业务数据、Secret 元数据和 OAuth 凭据，只有 `--reset` 在所有权核验后精确重建当前工作区 volume。发布计划只在这些能力或关联模板发生变化时，使用真实打包工件和全新应用重跑数据库生命周期门禁，不让无关包重复承担该成本。
5. **L3a Events（已完成）**：编译器生成订阅代码契约，CLI 为每项声明生成仅注入 Nest/本地平台的 0600 签名材料；Data API 与 outbox 同事务提交，dispatcher 使用 `SKIP LOCKED`、领取租约、代次 CAS、状态分类、`Retry-After`、有界退避、死信与幂等重放。Nest 默认使用平台持久 receipt；完整停止/重启和 `--reset` 行为已通过真实打包工件创建的新应用、真实 PostgreSQL、真实 Nest endpoint 与 Chromium 验证。
6. **L3b Timer / Workflow（已完成）**：Timer 已实现严格六段 Cron/IANA 时区校验、持久 schedule/firing、同事务 outbox/delivery、暂停、重启恢复、停机合并、声明变更重算和仅限本地会话的 CLI 快进。两个绑定同一 `expectedScheduledAt` 快照的并发 claim 只生成一个 firing；连续执行“触发下一次”则按定义推进到不同计划时间。Workflow Kernel 已实现定义编译、预览令牌、实例/任务/时间线/回执事务提交、实例与任务版本 CAS、同幂等键重放、同任务并发唯一成功、转交、前后加签、回退、角色/数据 scope 审批人解析，以及带有效期和不重叠约束的长期代理；任务创建时冻结原审批人、代理规则和最终参与者，撤销规则不改历史任务。完整停止/重启保持进度，显式 reset 精确清空。

每一步只在本地新建应用和真实打包工件中验证。L0 与 Native E1 是同一个 breaking contract 变更，不能先加兼容枚举再二次迁移；L2/L3 不阻塞 CP0-CP2 只读退役审计。
