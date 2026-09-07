# OpenXiangda 2.0 Alpha 退役与 Native 切换前置审计

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：方案已确认；CP0-CP2 已在主线实现并通过本地/一次性 PostgreSQL/smoke 验证，尚未执行 reference-environment 只读 preflight；不代表 Native 运行时或 K4 generation 切换已实现

适用范围：reference-environment 上的 OpenXiangda 2.0 实验状态；不迁移、不清理、不改变任何 1.x 应用
替代方案：本文取代“全平台 inventory evidence schema + 通用 importer”设计

## 1. 架构结论

OpenXiangda 2.0 明确不兼容 1.x，当前 reference-environment 又只有一个可重建的 2.0 reference 应用，因此不建设长期迁移子系统。Native 内核从新配置合同、新数据库表和新建应用开始；旧 alpha reference 的业务数据、角色、OAuth、Event、Workflow 和 Runtime 不迁移，只在观察期内保留为审计事实。

切换前只实现一个小型、只读、显式 allowlist 的发布前置审计：它证明线上不存在必须迁移的真实 2.0 应用，并证明 1.x 事实不会被误分类。审计不创建数据库 schema/role/LOGIN/Secret，不扫描平台全部业务数据，不生成写计划，也不成为 Admin 或应用 CLI 的永久能力。

这项决定建立在 2026-08-13 的源码和 reference-environment 只读证据上，而不是“以后大概只有测试数据”的假设。

## 2. 本轮架构门禁

| 维度 | 决定 |
| --- | --- |
| 问题证据 | 原设计从 `app_delivery_runs`、`app_runtime_releases`、Event Outbox 等共享表枚举“2.0 事实”，但生产中这些表包含大量 1.x 发布与事件记录；按表名或能力版本分类会误伤稳定应用。真正的 Application v2 AppVersion/Head 和 K3s application-v2 workload 只有 reference app。 |
| 能力所有者 | Platform Server 的 Native Kernel 拥有新 2.0 数据模型，同一不可变 Platform Server 镜像内的独立 Node 脚本拥有只读分类器；根部署仓库拥有短生命 Job/K3s metadata/receipt 编排与后续 generation CAS；新建独立 reference app 拥有 Native 验收数据。旧 alpha 表只作为停止写入的历史事实，不成为 Native 输入。 |
| 稳定不变量 | 1.x 路由、发布、Runtime、数据、Event Outbox 和旧应用记录不读取 Native 表，也不进入退役范围；Native 不读取 alpha 表作为 fallback；旧 alpha 数据不复制、不重写、不删除；新 reference app 不复用旧 app code、UUID、OAuth、Secret、RoleSession、业务表或 K3s workload。 |
| 上下游契约 | 切换前审计只接受显式 `tenant/app` allowlist，并以 Application v2 package schema、AppVersion/Head 闭包和 K3s managed label 交叉验证；E1 的 bundle v3 与 Native 表从空状态编译；Admin、CLI、SDK 只消费 Native generation。 |
| 并发与失败 | 审计脚本在独立 `REPEATABLE READ READ ONLY` 事务中生成确定性数据库语义摘要。根脚本按 `DB-A -> K3s-A -> DB-B -> K3s-B` 运行两个同镜像 Job 和两次 metadata list，前后任一语义摘要变化即 stale。receipt 不能单独授权 K4；切换时仍必须重做轻量 recheck 并与 kernel expected revision 同事务 CAS。审计失败只阻断 2.0 generation 切换，不影响 1.x 或现有 alpha reference。 |
| 安全与资源 | 审计入口不启动 Midway/HTTP/Redis/队列/Scheduler。根脚本从当前 Deployment 只复用 `envFrom` 引用，不读取或复制 Secret 值；Job 固定执行经主线和发布 manifest 验证的镜像摘要，禁用 ServiceAccount token，只读根文件系统，100m/128Mi request、500m/512Mi limit、60 秒 deadline。数据库连接从第一条语句起默认只读，再进入显式只读事务；这是受控发布代码的防误写边界，不伪装成独立数据库 principal 的强安全隔离。只输出 allowlist app 的稳定标识、状态和数量，不输出用户、业务字段、URL、token、hash、密文或物理表名。最大 20 个 alpha app、2 MiB JSON、60 秒。 |
| 回滚单元 | K4 前 Native schema/compiler/gate 均 additive；alpha reference 继续可用。K4 后不恢复 alpha 语义，失败时保持 2.0 maintenance 并发布 Native-aware 修复；1.x 始终在线。新 reference app 使用 Native Head 回滚，不依赖旧 alpha 数据。 |
| 可证伪验收 | 构造仅有 legacy DeliveryRun/Runtime/Event Outbox 的 1.x app，必须不进入 alpha scope；构造 package schema 不匹配、Head 闭包破损、额外 K3s workload、运行中 DeliveryRun、待处理 Event/Workflow 或 revision 变化，必须阻断；报告中放置 Secret/user/business canary，输出必须零命中。 |

## 3. 生产事实与决策依据

2026-08-13 在 reference-environment 运行了只读事务和 K3s metadata 查询，没有执行任何写入。结果如下：

| 事实 | 只读结果 | 架构含义 |
| --- | --- | --- |
| `app_versions_v2` | 仅 `001/openxiangda-v2-reference-app`，12 个 AppVersion | Application v2 实际使用者只有 reference app |
| `app_environment_heads_v2` | reference app 的 preproduction、production 各 1 个 Head | 没有第二个需要迁移的 Native 候选应用 |
| K3s `managed-by=openxiangda-application-v2` | reference app 的 preproduction、production 各 1 个 Deployment/Pod | 运行面与数据库 Head 闭包一致 |
| Data Resource | 5 个资源，共 37 行；全部已有明确 preproduction/production key | README 和脚本证明它们是可重复生成的验收数据，不是用户业务数据 |
| Authz | 4 个活动 assignment、2 个活动 relationship grant；RoleSession 是验收操作产生 | 由 seed/E2E 在新 reference app 重新创建，不迁移主体关系 |
| OAuth/Secret | 每环境 1 个活动 OAuth client，另有撤销记录；runtime Secret 为 0 | 新环境重新签发，绝不搬运凭据 |
| Event | 每环境 2 个订阅；90 个 reference outbox、16 成功 delivery、6 DLQ、4 成功 receipt | 属于韧性验收历史；不重放、不迁移 |
| Workflow | 8 个 instance，其中 1 个 running；15 个 human task，其中 1 个 assigned | 都是验收实例；切换前终止旧 runtime，历史留存，不迁移流程实例 |
| 共享旧能力表 | `app_delivery_runs`、`app_runtime_releases`、`app_event_outbox_v2` 中有大量其他 app | “表名带 v2”不等于 Application v2；不能用这些表独立扩大 scope |

reference app 仓库明确说明它是独立验收应用；`seed-production.mjs`、`prod-e2e.mjs` 和 OAuth E2E 使用可重复 seed、唯一 runId 和最终撤销。上述 37 行和流程/事件记录可以由新应用重新生成，因此迁移它们只会把 alpha 数据模型和脏历史带入 Native。

## 4. 明确拒绝的方案

| 方案 | 拒绝原因 |
| --- | --- |
| 为审计新建全平台 evidence schema、per-database reader role、独立 DB Secret、ServiceAccount/RBAC 或常驻 Job 体系 | 为一次实验切换增加长期数据库安全面、凭据轮换、RBAC、报告存储和发布维护成本；当前没有真实迁移对象支撑该复杂度。这不禁止根部署脚本复用已有 release Job 原语创建无 ServiceAccount 的短生命、受限资源容器 |
| 根据 `app_delivery_runs` / `app_runtime_releases` / Event Outbox 自动发现 2.0 app | 这些是 1.x 与 2.0 共用的历史能力表，生产事实已经证明会把大量稳定 1.x app 错纳入范围 |
| 通用 importer，把 alpha role/grant/data/workflow/event 搬到 Native | reference 数据可重建；通用 importer 需要主体映射、敏感决策 UI、CAS/generation 和业务数据扫描，形成一套只使用一次的产品 |
| 原地升级 alpha Head、RoleSession、Data Resource 表 | 会保留 nullable legacy 字段、全局授权语义和双重事实源；Native 必须用能直接表达约束的新表 |
| 切换时删除 alpha 数据 | 删除扩大事故半径且没有必要；旧记录不被 Native 读取即可，物理清理由独立 retention 项目处理 |
| 新 reference app 复用旧 app code | 容易使 alpha OAuth、RoleSession、业务表、Event/Workflow 状态被误读；新应用必须有新 identity |

## 5. Alpha scope 的唯一判定

审计工具不做“全库智能发现”。操作者必须显式提交 allowlist：

```text
tenantId/appCode
decision = rebuild-on-native | retain-blocked
expectedAlphaAppVersionCount
expectedHeadKeys
expectedManagedWorkloads
changeRef
```

每个 allowlist app 必须满足以下闭包：

1. 至少一个 `app_versions_v2` 行，且 `package_manifest_json.schemaVersion = openxiangda.app-package/v2`；
2. 每个 alpha Head 指向同 tenant/app 的 AppVersion 和 succeeded Application v2 DeploymentRun；
3. 只统计该集合在 OAuth、Secret、Authz、Data、Event、Workflow 中的聚合状态；不会因为其他 app 出现在同一表就扩充集合；
4. K3s 对象必须同时具有 `app.kubernetes.io/managed-by=openxiangda-application-v2`、相同 app code/environment label 和 Head 对应 AppVersion annotation；
5. `app_delivery_runs` 只有同时属于 allowlist app 且 package schema 精确匹配时才算 Application v2；
6. `app_runtime_releases`、legacy forms/pages/roles、共享 Event Outbox 永远不能独立把 app 加入集合。

自动发现到 allowlist 外的有效 Application v2 AppVersion/Head/workload 时返回 `UNDECLARED_ALPHA_APPLICATION` 并阻断。只存在 legacy DeliveryRun/Runtime/Event 的 app 不报告详情，只记录 `legacyExcludedCount`，以证明分类器没有误纳入。

## 6. 最小只读审计入口

首期只在 Platform Server 镜像已有 `scripts/` 运维入口体系增加一个 CommonJS 命令，不放入 `src/configuration.ts` 的 Midway 生命周期：

```text
node scripts/openxiangda-v2-native-cutover-inspect.js \
  --mode snapshot \
  --allowlist /run/openxiangda/native-cutover-allowlist.json
```

约束：

- 入口直接创建一个 `pg.Client`，只复用 `run-sql-migrations.js` 已导出的 PostgreSQL SSL 解析合同；不导入 `src/configuration.ts`、service/entity/repository，不启动 Midway、HTTP、队列、Scheduler、DingTalk Stream、Redis、RabbitMQ 或 Kubernetes client；
- 根脚本从当前 Platform Server Deployment 提取 `envFrom` 引用到临时 Job，镜像内进程只消费环境变量；不复制、打印或持久化凭据；
- `pg.Client` 连接参数加入 `default_transaction_read_only=on`、15 秒 statement timeout、2 秒 lock timeout 和 20 秒 idle-in-transaction timeout；连接后首先验证 `transaction_read_only=on`，再执行 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`，单 Job 和根脚本总 deadline 均为 60 秒；
- SQL 固定、参数化、只读；禁止动态表名、业务表扫描、`COUNT(*)` 大表扫描和任意写语句；Data 只读取资源级安全计数/状态，切换决策不依赖精确业务行数；
- 脚本成功时 stdout 只写一个 canonical JSON document，stderr 仅允许无参数稳定错误码；报告不进入应用 OSS、长期 ConfigMap、Git 或浏览器；
- 根部署脚本复用现有 backend release Job 构造原语：从权威 version manifest 验证主线、release lineage 和镜像 digest，创建一个短期无秘密 allowlist ConfigMap 和两个 `automountServiceAccountToken=false` Job；不新建 ServiceAccount/RoleBinding/Secret，不 patch Deployment；
- 根脚本在主机本地以 `0600` 先写临时文件，对 DB-A/K3s-A/DB-B/K3s-B 重算 semantic digest 并校验预算后才原子 rename 为 receipt；任一 Head、AppVersion、活动 run、pending delivery/task、kernel revision 或受管 workload 语义变化都报告 stale；
- 无论成功失败，Job/Pod/ConfigMap 都在取完日志后删除；根脚本无权将 incomplete/stale 报告标为可切换；
- 普通 build/update 不自动执行；只有显式 Native cutover preflight 调用。

报告只含：schema/release/image digest、allowlist digest、每个 app 的 AppVersion/Head/status 数量、是否存在 active run/pending event/pending workflow、K3s workload identity/readiness、分类、blocker、四段 semantic digest 和有效期。用户、角色主体、业务关系、业务字段、错误 payload、URL、Secret/OAuth 值及其 hash 都不输出。K3s semantic digest 只覆盖 UID/generation/observedGeneration、镜像 digest、replica/readiness、相关 label/annotation 和 service target，不因无关 resourceVersion 或时间戳飘移。

## 7. Native 重新创建策略

Native reference 必须由 `create-openxiangda` 的当前本地候选工件创建成新的独立 Git 仓库和新 app code。它复用业务场景和验收断言，不复用任何线上 identity 或状态：

```text
旧：openxiangda-v2-reference-app             (alpha，冻结/留存)
新：openxiangda-v2-native-reference-app      (native-2，从空状态创建)
```

新应用按以下顺序建立事实：

1. Native provision 事务创建 preproduction、production；local 只由本地工具链创建临时运行状态；
2. bundle v3 编译为不可变 authz/data/event/workflow/runtime revisions 和 AppVersion binding；
3. seed 只在 local/preproduction 运行，且每次带唯一 runId；
4. 角色 membership、学院/仪器关系和 super-admin grant 由 Native Admin/SDK 显式创建；
5. OAuth 与应用 Secret 在各环境重新签发，值只出现一次；
6. 先用真实本地 tarball 和本地平台验证，再将同一 AppVersion 部署 preproduction，验收后晋级 production；
7. production 通过后才允许退役旧 alpha K3s workload 和 OAuth principal。

旧 alpha 的 running Workflow 和 assigned task 不迁移。K3 drain 时停止旧应用入口与 consumer，记录最终数量；历史状态保留在 alpha 表中。Native 只展示新 app code 的实例。

## 8. 切换状态机

| 阶段 | 动作 | 失败语义与回滚 |
| --- | --- | --- |
| K0 evidence | 运行最小只读审计，确认 allowlist 只有 alpha reference，生成 receipt | 只读；失败不影响线上 |
| K1 native build | 增加 Native schema、compiler、generation gate、CLI/SDK/Admin，创建全新 reference repo | additive；alpha/1.x 仍运行 |
| K2 capable rollout | 全部 Platform Server 实例升级到理解 alpha/native generation 的同一 release，Native 路由仍关闭 | 可回滚到同样不写 Native 的兼容 release |
| K3 validate/drain | 本地/隔离测试环境完成新 reference 全链路；reference-environment 只验证 immutable artifact、Native Head 闭包和无业务凭据的 candidate readiness；暂停 2.0 alpha 写和 consumer，等待活动 run/lease 归零 | 保持 2.0 maintenance；1.x 不受影响 |
| K4 native switch | CAS 将 generation 切为 `native-2`；alpha 2.0 endpoint 稳定 410；只有已经 Native Head 绑定的新 reference 可路由，在验收窗口跑真实预发 E2E | 不回 alpha；失败保持 Native 常规创建入口关闭，并发 Native-aware 修复 |
| K5 accept/retire | 预发 E2E 通过后开放 Native 常规创建/写入，同一 AppVersion 晋级 production 并再跑完整 E2E；观察期后撤销旧 alpha runtime OAuth、删除旧 alpha K3s workload | 新 reference 用 Native Head 回滚；数据库 alpha 历史不删除 |

K4 不执行大批数据 UPDATE/INSERT，也不运行 importer。切换事务只更新 kernel generation/revision 和审计 receipt，因此锁和回滚面有界。

## 9. 与 1.x 的隔离

1.x 不使用 `app_versions_v2 + app_environment_heads_v2 + exact package schema` 的 Application v2 闭包。即使 1.x 应用曾使用 Delivery V2、React SPA Runtime、Event Outbox、App Function、Workflow 或 OAuth，也不能因此进入 Native scope。

Native migration 只增加新表/索引和 generation gate；不修改 legacy 表的语义、不删除旧列、不把 `environment_id` 塞进 1.x 行、不改旧 runtime resolver。代表性 1.x 应用在 K0-K5 每阶段进行登录、页面、数据、流程/自动化和 Runtime 回归，但其数据从不进入审计报告或清理计划。

## 10. 实现文件计划（确认后）

### Platform Server

| 文件/目录 | 变化 |
| --- | --- |
| `scripts/openxiangda-v2-native-cutover-inspect.js` | 镜像内 CommonJS 只读入口；显式 allowlist、固定查询、稳定 JSON/错误码；不进入 Midway 编译/生命周期 |
| `scripts/lib/openxiangda-v2-native-cutover.js` | scope classifier、report schema、canonical digest、blocker；纯函数，不读取 process/env |
| `test/openxiangda-v2-native-cutover-inspect.test.ts` | 真实 PostgreSQL：legacy exclusion、Application v2 闭包、只读拒写、stale、canary、预算 |
| `scripts/verify-openxiangda-v2-native-cutover.js` | 静态证明入口不依赖 Midway/service/entity/Redis/queue/stream，查询字面量不含写 SQL/动态 relation，且 SSL 复用 migration runner 合同 |
| `scripts/verify-openxiangda-v2.js` | 将切换审计静态门禁、一次性 PostgreSQL 和单元测试纳入平台候选验证；无独立 evidence migration |

### 根部署仓库

| 文件/目录 | 变化 |
| --- | --- |
| `scripts/openxiangda-v2-native-cutover-preflight.sh` | 校验主线/release lineage/image digest；从当前 Deployment 构造两个受限资源短生命 Job，编排 DB-A/K3s-A/DB-B/K3s-B，原子保存 receipt，不 patch Deployment |
| `scripts/openxiangda-v2-native-cutover-k3s-snapshot.jq` | 严格校验 allowlist 与全集群受管 Deployment/Service 闭包，只保留 UID/generation/readiness/image digest/服务目标等安全语义 |
| `scripts/openxiangda-v2-native-cutover-consistency.jq` | 按 tenant/app/environment 交叉校验数据库 Head 与 K3s workload 的 AppVersion/package digest 闭包 |
| `config/openxiangda-v2-native-cutover.allowlist.example.json` | 无秘密显式 allowlist；正式文件不进 Git |
| `scripts/openxiangda-v2-native-cutover-smoke.sh` | mock kubectl/报告，证明 Job 无 SA token/资源有界/镜像摘要锁定、两次摘要变化 fail closed、失败不切 generation、普通发布不自动执行 |

### OpenXiangda 2.0 工具链

首期不增加 inventory 命令。应用 CLI 无权查看跨应用生产事实。工具链只负责 bundle v3、新应用生成、Native capability 检查和部署；切换前审计属于平台运维面。

## 11. 可证伪验收矩阵

1. reference-environment 报告只识别显式 alpha reference；只存在 legacy DeliveryRun/Runtime/Event 的应用全部 excluded。
2. 增加一个 allowlist 外、package schema 正确的 AppVersion/Head/workload 后，preflight 以 `UNDECLARED_ALPHA_APPLICATION` 失败。
3. Head 指向错误 app/version/run、K3s annotation 不匹配、额外可服务旧 workload、活动 DeliveryRun/lease、pending Event delivery 或 pending Workflow task 均阻断 K4。
4. 数据库 session 首条查询和事务内都证明 `transaction_read_only=on`；注入 INSERT/UPDATE/DELETE/DDL canary 全部失败，数据库 LSN/目标行数不变。
5. 报告、stderr、receipt 对预置 token/Secret/user/resource/business canary 零命中；不存在连接信息、物理表名或业务字段。
6. 60 秒/2 MiB/20 app 任一预算超限都 fail closed，不截断后继续切换。
7. 在 DB-A/K3s-A/DB-B/K3s-B 的任意间隔并发切 Head、新增 workload 或改受管 Service target，前后摘要不一致使报告 stale；即使 receipt 未过期，K4 的轻量 recheck/revision CAS 也必须拒绝后续变化。
8. 新 reference app 的所有 UUID、app code、业务表、OAuth、Secret、membership、RoleSession、Event/Workflow state 与旧 alpha 无交集。
9. Native reference 在本地、preproduction、production 完成同一 AppVersion 的 OAuth、Secret、四角色切换、Data API、受限事务、Workflow、代理/加签、Event 重试/receipt、Nest App API 和 Admin Chromium 验收；local 不创建远程 registry/Head。
10. K0-K5 每阶段代表性 1.x 登录、页面、数据、流程/自动化与 Runtime 正向通过；其数据库记录和 K3s workload没有被 audit/retire 修改。
11. K4 只有一次有 revision 条件的 kernel generation CAS；无 alpha→native 批量数据写、无 importer、无业务表扫描。
12. K5 只撤销明确列出的旧 alpha runtime principal并删除两个旧 alpha K3s workload；数据库 alpha 历史保留，任何 `DROP ... CASCADE` 或按表名清理都被 verifier 拒绝。

## 12. 确认后的实施顺序

1. CP0：实现最小 scope classifier/report schema 与真实 PostgreSQL legacy-exclusion 测试。
2. CP1：实现 Platform Server `scripts/` 独立只读入口、默认只读 session、静态依赖/SQL 门禁。
3. CP2：已实现根部署 preflight、受限资源短生命 Job、全集群两阶段 K3s metadata/recheck 与本地 receipt；脚本与两个 JQ 合同作为不可变 deploy assets 绑定版本清单。下一步先发布包含 CP0-CP2 的 capable release，再在 reference-environment 显式运行只读 preflight；不由普通发布自动触发、不切换 generation。
4. E1/A0：实现 Native schema、bundle v3 compiler、环境配置和授权投影；不导入 alpha。
5. 创建全新独立 `openxiangda-v2-native-reference-app`，用本地未发布包做完整验证。
6. 完成 E2-E5、Admin A-D 和安全轨后，按 K2-K5 切换并验收。

确认本设计只表示允许开始 CP0/CP1；不授权 K4 generation 切换、删除旧 workload、撤销凭据或发布生产版本。`CP*` 只表示 cutover preflight，与环境激活协议已有的 `P0 planning / P1 candidate / P2 readiness / P3 activate / P4 retire` 严格分离。每个动作仍按本路线图的独立门禁执行。
