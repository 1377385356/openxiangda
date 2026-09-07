# 租户公共 Origin v2 实施蓝图

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：已设计待确认；不代表运行时已实现
依赖设计：[租户公共 Origin v2](./tenant-public-origin-v2.md)

本文把 B0-O0/O1 收敛成可以直接实施的文件、表、接口、命令和测试合同。它不授权执行 O2 单租户迁移、O3 全局收口或生产发布；确认前只能继续只读检查和文档修正。

## 1. 本轮架构门禁

| 维度 | 决定 |
| --- | --- |
| 问题证据 | 当前 DOMAIN 是无结构 JSONB；生产没有复合唯一约束；存在多个模糊 hostname 解析；多个模块直接拼 callback/link/Cookie；进程缓存最长一小时；租户 code 可直接修改；通用控制器缺少可靠的服务层授权 |
| 能力所有者 | Platform Server 的 `TenantPublicOriginQueryService` 与 `TenantPublicOriginCommandService`；数据库 registry 是切换后的唯一事实源；部署 CLI 只编排跨租户迁移和外部探测 |
| 稳定不变量 | 一个 hostname 只归一个租户；active/staged/previous 是不可变版本引用；运行时只读 active；head 更新 revision CAS；审计和状态变更同事务；不长期双写 |
| 上下游合同 | SSO/CAS/App Auth/OpenAPI/消息/Function 只消费 query service；Admin 只调用当前租户强类型 API；部署脚本只执行镜像内 CLI；1.x 旧读由 registry 动态投影 |
| 并发与失败 | 全局命令独占 control；租户命令共享 control、独占自己的 head；claim 稳定排序加锁 + revision CAS；unknown/invalid/unverified 均 fail closed；外部网络不进入数据库事务，网关不能伪装成数据库原子事务 |
| 安全与资源 | 浏览器仅当前租户 `PLATFORM_ADMIN`；应用 runtime principal 明确拒绝；跨租户操作不开放 HTTP；输入 8 KiB；探测并发最多 4、单项超时 10 秒、总时限 180 秒、证据最多 64 KiB |
| 回滚单元 | O0 无运行时行为；O1 global phase=`legacy` 可回旧镜像；单租户激活前可 abort，激活后只走 registry 版本回滚；进入 migrating 后只能回理解两级状态的镜像；不恢复模糊匹配或长期双写 |
| 可证伪验收 | SQL 约束、攻击向量、并发 CAS、双实例一致、混合版本阻断、CLI receipt、旧应用正向回归和源码禁用扫描全部有自动证据 |

## 2. 当前源码约束

实施必须适配当前真实结构，不能按理想化新项目假设：

- 生产 schema 只通过 `sy-lowcode-platform-server/src/migrations/*.sql` 和 `platform_schema_migrations` ledger 发布；TypeORM entity 不是迁移工具。
- K3s 后端发布先用目标镜像运行 migration dry-run/apply Job，再滚动 Deployment；该 Job 已禁用 ServiceAccount token，资源上限为 500m CPU / 512 MiB。
- `DefaultErrorFilter` 会把普通异常强制包装成 HTTP 200；仓库现有 2.0 控制器普遍在适配层显式设置 `ctx.status`，没有可依赖的通用 typed-error filter。Origin API 必须复用这一已验证模式，不能让已知错误落入默认 filter。
- `PermissionService.hasPermission()` 会让普通 runtime service principal 自动通过。Origin 服务必须先显式拒绝 runtime/application/guest principal，不能只依赖 `@Permission`。
- 当前 `PLATFORM_ADMIN` 在 `PermissionService` 中天然通过平台权限。首期 Origin 管理不做委派，也不依赖新的 seed 行；控制器元数据和服务层 `assertPlatformAdmin()` 同时存在。
- 根 `config/permission-seed.json` 与 `src/config/permission-seed.json` 内容不同，镜像实际复制前者。B0-O 不新增依赖该漂移机制的权限行；权限目录收敛作为独立平台治理主题。
- `TenantsService.createTenant()`、管理员、默认部门和平台管理员角色在一个事务中创建；`updateTenant()` 当前允许改 code；`deleteTenant()` 当前直接硬删。
- `SystemConfigController` 和 `DefaultConfigController` 都能改 DOMAIN，因此冻结/迁移保护必须位于 service/repository 边界，不能只隐藏管理页面。

## 3. 模块与依赖方向

```text
controller / ops CLI
        │
        ▼
TenantPublicOriginCommandService ──► probe port
        │
        ▼
TenantPublicOriginRepository ◄──── TenantPublicOriginQueryService
        │                              ▲
        ▼                              │
PostgreSQL registry             legacy adapter / SSO / callback / links

pure domain:
normalize-origin + digest + state transition rules + typed errors
```

强制依赖规则：

1. `TenantPublicOriginQueryService` 不得注入 `DefaultConfigService`。
2. 新增 `LegacyDomainConfigRepository` 只做 DOMAIN 原始行读取和受状态保护的 legacy 写；`LegacyDomainResolver` 封装当前不同入口的兼容算法，仅在 global legacy 或 migrating 且 tenant source 为 `legacy/frozen` 时运行。query service 同时计算 strict registry candidate 做 observe，但把 legacy 结果返回调用者，保证 O1 不改变旧应用行为。
3. `DefaultConfigService` 遇到 DOMAIN 时委托 query/legacy write guard；其他 ConfigType 保持现状。
4. SSO、CAS、游客、钉钉、App Auth、OpenAPI、消息和 Function 不直接注入 repository/entity。
5. 运维 CLI 与 Midway service 复用同一 pure domain 和 SQL repository；不得复制规范化、digest 或状态迁移判断。
6. 浏览器 controller 不调用跨租户命令；ops CLI 不启动 HTTP Server、队列消费者、定时任务或 DingTalk stream。

统一锁顺序不可由各 command 自行发明：先声明/锁定 operation receipt，再取 control（global 命令 `FOR UPDATE`，tenant 命令 `FOR SHARE`），再取 tenant head `FOR UPDATE`，最后按规范化 hostname 升序锁 claim/verification。global finalize 因 control 独占锁等待全部 tenant 命令结束；不同 tenant 命令可并行。数据库事务内禁止 DNS、TLS、HTTP/provider 探测或等待 K8s，verify 必须在网络阶段前后分别重新校验 head revision 和 tenant state digest。

## 4. SQL expand 合同

O1 使用一个 `compatibility: expand`、`downtime: false`、`transaction: auto` 的 SQL migration 创建以下九张表。实际 migration 文件由 `npm run db:migration:create -- AddTenantPublicOriginRegistry` 生成，不手工猜时间戳。

### 4.1 `tenant_public_origin_versions`

不可变配置历史：

| 列 | 类型与约束 |
| --- | --- |
| `id` | UUID PK，`uuid_generate_v4()` |
| `tenant_id` | UUID NOT NULL，稳定租户 UUID 快照；不直接 FK 到 tenants，保证租户删除后仍可审计 |
| `tenant_code_snapshot` | varchar(255) NOT NULL |
| `scheme` | varchar(5)，只允许 `http/https` |
| `hostname` | varchar(255)，ASCII 小写、无尾点/path/query/userinfo/空白 |
| `port` | integer NULL，1..65535；80/443 默认端口必须归一为空 |
| `origin_key` | generated stored；由 scheme、IPv6 bracket、hostname、port 确定 |
| `created_by_type/id` | varchar；`user/import/ops_cli` 与脱敏操作者 |
| `created_at` | timestamptz NOT NULL |

约束与索引：

- UNIQUE `(tenant_id, id)`，供 head 复合 FK。
- 普通索引 `origin_key` 和 `(tenant_id, created_at DESC)`。
- DB CHECK 只守可表达的格式；WHATWG/IDNA/IPv6 规范化仍由共享纯函数完成。
- 触发器拒绝 UPDATE/DELETE。普通 decommission 也不删除版本。

### 4.2 `tenant_public_origin_heads`

每租户一行的可变控制状态与版本指针。global legacy 期可以没有 head；开始 migrating 时为每个现存租户创建，之后租户生命周期必须同步创建/删除：

| 列 | 类型与约束 |
| --- | --- |
| `tenant_id` | UUID PK，FK `tenants(id) ON DELETE RESTRICT` |
| `source_state` | `legacy/frozen/registry/decommissioned`；单租户事实源状态 |
| `migration_action` | `migrate/decommission` 或 NULL；仅迁移期使用 |
| `planned_scheme/hostname/port/origin_key` | migrate 计划的规范化目标；decommission 时必须全空，不创建 staged/claim |
| `planned_legacy_digest` | char(64) NULL；只覆盖该租户 DOMAIN 行及规范化结果 |
| `planned_dependency_digest` | char(64) NULL；只覆盖该租户 SSO/callback/link 等依赖摘要 |
| `plan_digest` | char(64) NULL；绑定该租户显式计划项与变更单 |
| `active_version_id` | UUID NULL |
| `staged_version_id` | UUID NULL |
| `previous_active_version_id` | UUID NULL |
| `rollback_until` | timestamptz NULL |
| `revision` | bigint NOT NULL DEFAULT 0，非负单调增加 |
| `created_at/updated_at` | timestamptz |

三个 version 字段分别用 `(tenant_id, version_id)` 复合 FK 指向 versions。service 禁止无意义的 active==staged；回滚时 staged 可暂时引用 previous。CHECK 保证 frozen 必须有完整计划摘要，decommissioned 不得有 active/staged，registry 允许 active 为空以表达新租户 provisioning。tenant 写先共享锁 control，再独占目标 head 并以 `expectedHeadRevision` 做 CAS；影响行数不是 1 返回 409，不锁其他租户 head。

### 4.3 `tenant_public_origin_legacy_dispositions`

迁移计划对每条旧 DOMAIN 的数据库内处置记录：

| 列 | 类型与约束 |
| --- | --- |
| `legacy_config_id` | UUID PK；保留旧记录稳定 id，不设级联 FK，保证旧行退休后仍可证明处置 |
| `legacy_row_digest` | char(64)，覆盖 id/type/name/tenantCode/isActive/configData 的规范化摘要 |
| `tenant_id` | UUID NULL、无 tenant FK；能关联现存租户时必须填写，orphan 必须为空，租户删除后仍保留处置证据 |
| `tenant_code_snapshot` | varchar(255) NOT NULL |
| `action` | `migrate/decommission/retire_orphan`；retire_orphan 仅允许 tenant_id 为空 |
| `plan_item_digest` | char(64)，与 tenant head 或 orphan 计划项绑定 |
| `status` | `planned/superseded/retired`；legacy 行删除/改属使旧计划项 superseded，完成处置后 retired |
| `revision` | bigint，更新计划项时 CAS |
| `created_at/updated_at/retired_at` | timestamptz |

开始迁移时为 inventory 中每条 legacy 行插入 disposition；同租户重复行分别存在，但都绑定同一 head plan item。显式 update-plan 同事务更新 head、相关 dispositions 与 control plan digest。global migrating 下的旧 DOMAIN write guard 根据修改前后配置解析受影响租户，按 tenant UUID 排序锁 head，清空这些 head 的 planned digests、提升 revision，并把已删除/改属行的旧 disposition 标为 superseded；它绝不写 version/claim。新增或变成 orphan 的行没有 current disposition，只阻止相关 freeze/finalize，不影响其他租户运行。tenant activate/decommission 或 orphan retirement 将 current dispositions 改为 retired 并写 audit；global finalize 要求当前全部 legacy 行都有 digest 匹配的 retired disposition，历史 disposition 只能是 retired/superseded，且 disposition 不指向已消失但未完成 decommission 的租户。普通运行时不读取此表决定 canonical origin。

### 4.4 `tenant_public_hostname_claims`

| 列 | 类型与约束 |
| --- | --- |
| `hostname` | varchar(255) PK，规范化 hostname |
| `tenant_id` | UUID NOT NULL，无 tenant FK，hold 必须能跨租户删除存活 |
| `tenant_code_snapshot` | varchar(255) NOT NULL |
| `state` | `owned/retirement/decommission_hold` |
| `release_at` | timestamptz；owned 必须为空，hold 必须非空 |
| `revision` | bigint NOT NULL |
| `created_at/updated_at` | timestamptz |

一个租户的 active/staged/previous 可共享自己的一条 claim。跨 scheme/port 也不能把同 hostname 分给另一租户。到期释放使用有上限的批处理和 `FOR UPDATE SKIP LOCKED`，每批最多 100 条；释放与 audit 同事务。

### 4.5 `tenant_public_origin_challenges`

一次性 staged-host 证明，不是激活回执：

| 列 | 类型与约束 |
| --- | --- |
| `id` | UUID PK，外部只看到该 opaque ID |
| `tenant_id/staged_version_id` | 绑定被验证版本，复合 FK 保证同租户 |
| `head_revision` | 签发时的 head revision |
| `challenge_hash` | SHA-256；明文 nonce 只存在于签发它的 ops CLI 内存 |
| `expires_at/consumed_at` | 默认 5 分钟、最大 10 分钟；只能一次性消费 |
| `created_at` | timestamptz |

challenge 只由 `origin:tenant:verify` CLI 在开始外部探测时签发，不由浏览器 stage API 创建。CLI 请求 staged origin 的固定 `/service/openxiangda-origin-challenge/<id>`，把 nonce 放在 `X-OpenXiangda-Origin-Challenge` header；平台按 id 查 challenge、比较 header hash，只返回通用 success、challenge id 和当前 release，不根据 Host 查租户，也不返回 tenant/origin。该端点不读取 Cookie、不刷新/建立会话、不设置 Cookie、无 CORS、`Cache-Control: no-store`，未知 id/错误 nonce/过期统一返回无差别 404。URL 和平台/网关日志都不得记录 nonce header；端点有独立 IP 速率限制和全局并发上限。

### 4.6 `tenant_public_origin_verifications`

| 列 | 类型与约束 |
| --- | --- |
| `id` | UUID PK |
| `tenant_id/staged_version_id` | 绑定被验证版本 |
| `head_revision` | 生成回执时的 revision |
| `tenant_state_digest` | char(64)，覆盖目标 tenant/head/staged/claim，不含其他租户 |
| `gateway_manifest_digest` | char(64)，绑定被探测的受控入口声明 |
| `evidence` | jsonb，序列化后不超过 64 KiB |
| `verified_by/change_ref/release_version` | 运维证据 |
| `expires_at` | 短 TTL，默认 10 分钟、最大 30 分钟 |
| `consumed_at` | NULL 或一次性 CAS 写入 |
| `created_at` | timestamptz |

外部 DNS/TLS/redirect/platform/provider 检查全部成功后，ops CLI 在一个事务中消费 challenge 并插入 verification；证据主体创建后不可 UPDATE/DELETE，只有 activate 可用 `WHERE consumed_at IS NULL AND expires_at > now()` 原子填写 `consumed_at`。失败探测不生成 verification，challenge 到期后由有界任务清理。

### 4.7 `tenant_public_origin_operations`

成功命令的幂等 receipt：

| 列 | 类型与约束 |
| --- | --- |
| `operation_id` | UUID PK，由浏览器/部署脚本为一次逻辑命令生成，重试不变 |
| `command_type` | start-migration/update-plan/freeze-tenant/stage/activate-tenant/abort-tenant/finalize-migration/rollback/decommission/release-claim 等纯数据库命令的受限枚举；外部 verify attempt 不使用成功 replay |
| `command_digest` | char(64)，覆盖规范化完整命令和前置 revision，不含 Secret/nonce |
| `tenant_id` | UUID NULL；批量 control 命令为空 |
| `result` | jsonb，最多 16 KiB，只保存 committed revision/version/receipt 等安全摘要 |
| `actor_type/id` | user/ops_cli 与脱敏操作者 |
| `created_at` | timestamptz |

纯数据库写命令在同一事务内使用 `INSERT ... ON CONFLICT DO NOTHING` 声明 `status=pending` 的 operation，再 `SELECT ... FOR UPDATE`：若竞争事务已提交，digest/type 相同且 status=committed 时返回原 result，任一不同返回 409；若前一事务回滚，本事务取得插入权。首次命令完成状态变更和 audit 后，只允许 operation 从 pending 一次性改为 committed 并写 result，然后一起提交。不能先触发 unique violation 后继续使用已 aborted 的 PostgreSQL transaction。触发器只允许这一次 pending→committed 转换，其他 UPDATE/DELETE 全部拒绝；事务失败不留下 pending 或“成功 receipt”。

`origin:tenant:verify` 中间包含外部网络，不承诺复用同一 operation 的 exactly-once replay。每个探测 attempt 使用新的 operationId 和 challenge；进程崩溃后明文 nonce 不恢复，旧 challenge 等待短 TTL 到期，重试先查询 head 状态再创建新 attempt。同一 staged version/head revision 可以有多个短期 verification，但 activate 只能消费一个；激活增加 head revision 后其他 verification 全部变成 stale。这个边界避免把 nonce 明文或可逆材料持久化。

### 4.8 `tenant_public_origin_audit_events`

追加式事件，含 tenant UUID/code 快照、event type、before/after version、head/control revision、actor type/id、requestId、release version、change reference、`operation_id`、`event_sequence`、最多 16 KiB metadata 和时间。`operation_id` FK 到 operations，UNIQUE `(operation_id, event_sequence)`；一个批量命令可以按 tenant UUID/事件类型稳定排序写多条。触发器拒绝 UPDATE/DELETE；严禁 ticket、OAuth code/state、Cookie、Secret 和完整敏感 query。

### 4.9 `tenant_public_origin_control`

只允许 `id=1`：

- `phase`: `legacy/migrating/registry`；默认 legacy。
- `revision`: 全局 phase CAS。
- `inventory_digest`、`plan_digest`、`registry_digest`。
- `migration_started_at/by`、`finalized_at/by`、`release_version`、`change_ref`。
- CHECK 保证 migrating/registry 所需 digest 和操作者非空。

migration 只创建 schema 和 legacy control 行，不导入 DOMAIN、不改旧读取、不创建 active head。这样旧 Pod 与新表共存，回滚无需数据反迁移。

## 5. 纯领域合同

### 5.1 规范化

`normalizeTenantPublicOrigin(input)`：

- 输入 UTF-8 最多 8 KiB，只接受单个绝对 origin，不接受 path、query、fragment、userinfo、协议相对、反斜杠或控制字符。
- WHATWG URL 解析后 scheme 只能 http/https；hostname 转 ASCII IDNA 小写并移除唯一允许的尾点后再验证，空 hostname 拒绝。
- 默认端口转 NULL；IPv4/IPv6 输出唯一序列；不做 DNS、网络访问和父域推导。
- 返回 `{scheme, hostname, port, originKey}`；调用者不能手写其中任一派生字段。

`normalizeLegacyHostname(input)` 只为 1.x SSO discovery 保留：输入必须是纯 hostname，规范化后精确查 claim；不能用作 callback allowlist。

### 5.2 Digest

- canonical JSON 使用稳定 key 顺序、UTF-8、无时间字段。
- inventory digest 覆盖所有租户、全部 DOMAIN 行（包括重复和 orphan）、规范化结果和依赖摘要，按稳定键排序，只用于开始迁移和最终完整性报告。
- tenant legacy/dependency digest 只覆盖一个租户；冻结前必须与该租户计划项匹配，其他租户变化不使本租户验证失效。
- tenant state digest 覆盖目标 head revision、staged version/claim 与相关依赖；verification 还绑定部署 release 和网关 manifest digest。
- registry digest 覆盖最终 control revision、所有 head revision/version/claim 状态，只用于 finalize/审计，不绑定单租户 verification。
- plan digest 覆盖完整迁移计划；开始迁移时必须覆盖所有现存租户和每条 legacy 行。每个租户项列全重复 config id 并给出唯一 `migrate/decommission` 结论；无法关联稳定租户 UUID 的行只能显式 `retire-orphan` 并证明无依赖。迁移中的 legacy 租户可显式刷新自己的计划项，任何漏项、重复结论、未记录变化或未审计 orphan 都阻止该租户 freeze 和最终 finalize。

### 5.3 状态转换

所有转换由一个纯状态机验证，repository 只执行被批准的命令：

```text
global: legacy --start-migration(full plan)--> migrating --finalize(all done)--> registry

tenant during migrating:
legacy --freeze(item digest)--> frozen --activate(receipt)--> registry
   ^                               |
   └-------- abort-before-switch --┘
legacy/frozen --decommission(no dependencies)--> decommissioned

versions: empty -> staged -> active -> staged(next) -> active(next)+previous
                                             └-> rollback(previous via verify)
active -> decommission -> no active/staged + claim hold
```

- tenant `frozen -> legacy` 仅在该租户从未进入 registry 时允许；staged 标记 abandoned、释放未被引用 claim，历史/audit 保留。
- tenant/global registry 不自动退回 legacy。global finalize 不激活任何租户，只确认所有租户已经 registry/decommissioned。
- 有 retirement hold 时禁止第三个 hostname；回滚到当前 previous 时原子交换 owned/retirement。

## 6. 浏览器 API 合同

路径前缀：`/api/system-config/tenant-public-origin`。tenant 永远从已认证 `ctx.user.tenantId -> tenants.code -> tenants.id` 解析，body/query 不允许指定另一个租户。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /status` | active/staged/previous、head revision、tenant source state、claim/verification 摘要、global phase；不返回 challenge/敏感 evidence |
| `GET /audit?cursor=&limit=` | 当前租户追加审计，limit 默认 50、最大 100 |
| `POST /stage` | `{operationId, origin, expectedHeadRevision}`；migrating+tenant frozen 时只允许替换该租户 staged，global/tenant registry 时正常 stage；不生成 challenge、不切 active |
| `POST /activate` | `{operationId, stagedVersionId, verificationReceiptId, expectedHeadRevision}`；普通 registry 租户可消费有效回执并切换；迁移中的首次切换仅由 ops CLI 执行 |
| `POST /rollback` | `{operationId, previousVersionId, expectedHeadRevision}`；仅 tenant registry，重新 stage，不直接激活 |
| `POST /decommission` | `{operationId, expectedHeadRevision, confirmation}`；仅 tenant registry 且依赖检查为空时执行；迁移处置由 ops CLI 执行 |

两级状态共同约束浏览器命令：global legacy 和 migrating+tenant legacy 只允许 status/audit；migrating+tenant frozen 允许当前租户平台管理员用 revision CAS 替换计划导入的 staged，但不能 activate/decommission；tenant registry 才允许日常 stage、activate、rollback 和 decommission。迁移期的首次 tenant 激活只能由 ops CLI 执行，不能由浏览器绕过计划/网关证据。

授权顺序：

1. controller 不使用当前 `@Permission` Guard：它在方法前抛错，而全局 `DefaultErrorFilter` 会把错误传输改成 HTTP 200；同时现有 `PermissionService` 对 runtime principal 默认全通。把该 Guard 叠上去不能构成可靠边界。
2. service 首先要求真实 user principal，拒绝 guest、runtime service principal 和 OAuth application principal，并从会话固定当前 tenant code/UUID。
3. service 再执行 `assertPlatformAdmin()`；首期不允许普通平台角色委派，即使其拥有 `platform:*`。controller 在方法内捕获这一错误并返回真实 403。
4. repository 的 FK/CAS/claim/phase 是不可绕过的最后边界。未来如需委派，必须先单独收敛平台权限 seed、Guard HTTP 语义和 runtime bypass，再增加权限点，不在 B0-O 内偷偷开放。

错误使用真实 HTTP status 和稳定字符串 code：

| HTTP | error code |
| --- | --- |
| 400 | `PUBLIC_ORIGIN_INVALID`、`PUBLIC_ORIGIN_NOOP` |
| 403 | `PUBLIC_ORIGIN_FORBIDDEN` |
| 404 | `PUBLIC_ORIGIN_NOT_FOUND` |
| 409 | `PUBLIC_ORIGIN_REVISION_CONFLICT`、`PUBLIC_ORIGIN_HOSTNAME_CLAIMED`、`PUBLIC_ORIGIN_RECEIPT_INVALID`、`DOMAIN_CONFIG_MOVED`、`TENANT_CODE_IMMUTABLE` |
| 423 | `PUBLIC_ORIGIN_WRITE_FROZEN` |
| 503 | `PUBLIC_ORIGIN_UNAVAILABLE`、`PUBLIC_ORIGIN_UNVERIFIED` |

响应为 `{code, message, requestId, details?}`；details 只含安全字段。领域/服务抛 `TenantPublicOriginError(status, code, details)`，controller 的统一 `respond/catch` adapter 显式设置真实 `ctx.status`；Ops CLI 把同一错误码映射为确定退出码。真实 HTTP 测试证明已知错误不会落入当前强制 200 的 `DefaultErrorFilter`，未知异常仍只返回通用 500，不泄漏数据库或网络细节。

## 7. Ops CLI 与部署合同

跨租户动作不开放 HTTP，也不创建新的 deployment OAuth principal。目标 Platform Server 镜像提供编译后的 CLI：

```bash
npm run origin:preflight -- --json
npm run origin:status -- --json
npm run origin:plan:validate -- --plan /plan/migration-plan.json --json
npm run origin:migration:start -- --plan /receipt/plan.json --expected-control-revision 0 \
  --operation-id <uuid> --operator <id> --change-ref <id>
npm run origin:migration:update-plan -- --plan-item /plan/item.json \
  --expected-control-revision <n> --operation-id <uuid> \
  --operator <id> --change-ref <id>
npm run origin:migration:retire-orphan -- --legacy-config-id <uuid> \
  --expected-disposition-revision <n> --operation-id <uuid> \
  --operator <id> --change-ref <id>
npm run origin:tenant:freeze -- --tenant-code <code> --plan-digest <sha256> \
  --expected-head-revision <n> --operation-id <uuid> \
  --operator <id> --change-ref <id>
npm run origin:tenant:stage -- --tenant-code <code> --origin <origin> \
  --expected-head-revision <n> --plan-digest <sha256> \
  --operation-id <uuid> --operator <id> --change-ref <id>
npm run origin:tenant:verify -- --tenant-code <code> --staged-version <uuid> \
  --expected-head-revision <n> --operation-id <uuid> \
  --operator <id> --change-ref <id>
npm run origin:tenant:activate -- --tenant-code <code> --receipt <uuid> \
  --expected-head-revision <n> --operation-id <uuid> \
  --operator <id> --change-ref <id>
npm run origin:tenant:abort -- --tenant-code <code> --expected-head-revision <n> \
  --operation-id <uuid> --operator <id> --change-ref <id>
npm run origin:migration:finalize -- --expected-control-revision <n> \
  --operation-id <uuid> --operator <id> --change-ref <id>
```

CLI 规则：

- 数据库凭据只来自既有部署 Secret/env，不接收命令行密码。
- `operation-id/operator/change-ref` 必填、长度受限并进入 audit/receipt。纯数据库命令重试复用同一个 operation UUID；verify 每次网络 attempt 使用新 UUID，重试前查询 head/receipt 状态。命令行不得包含 challenge nonce、Cookie 或认证票据。
- preflight 只读，可在 registry schema 不存在时运行；标准输出只含稳定 inventory/逐租户 digest/orphan 摘要/全局 digest JSON 和确定退出码，不替操作者猜 `migrate/decommission/retire-orphan`。操作者基于 inventory 编写全覆盖 plan，`origin:plan:validate` 验证租户与旧行双重覆盖率、重复项、依赖和 digest。迁移中某个 legacy 租户发生变化时，只允许通过显式 update-plan 命令刷新该租户计划项；新增 orphan 行也必须显式纳入计划。部署脚本把输出/plan 保存到 host receipt 目录；需要传给后续 Job 的 plan 经摘要校验后写入短期只读 ConfigMap，不假设容器内 `/receipt` 可以持久化。
- verify 主动访问 staged URL，校验 DNS、TLS hostname/有效期/链、challenge nonce、release、固定 redirect 和平台路径；租户并发最多 4，每个 hostname 最多接受 8 个解析地址，每个地址请求 10 秒、整批总计 180 秒。探测默认只允许全局单播地址；loopback、link-local、multicast、unspecified 和云元数据地址永久拒绝。私有化环境必须在受控部署清单显式列出允许的私网 CIDR；解析出的每个地址都需在策略内并逐个得到一致的安全响应，连接时固定已验证 IP/SNI 并核对 socket remote address，拒绝 DNS rebinding。直连 staged HTTPS challenge 不跟随 redirect；单独的 HTTP→HTTPS/alias probe 只接受配置清单声明的固定目标、有限跳数，绝不把原敏感 query 带到另一 origin。
- CLI 复用 repository/domain，不启动 Midway HTTP、队列、cron 或外部 stream。
- K3s Job `automountServiceAccountToken=false`，100m/128Mi request、500m/512Mi limit；receipt 持久化在部署脚本的版本目录。

普通 `deploy-platform-k3s-backend-release.sh` 只允许发布 O1 expand/兼容镜像，不自动 start/freeze/activate/finalize。O2/O3 由单独的 `scripts/migrate-tenant-public-origin.sh` 执行，必须显式指定 immutable manifest、plan digest、operator 和 change reference；全局状态命令持 control lock，逐租户命令只持目标 tenant lock。任何 routine release 都不能顺带切换事实源。

## 8. Legacy、租户生命周期与调用者迁移

### 8.1 两级状态行为

| global / tenant state | DOMAIN 读取 | DOMAIN 写 | registry 写 |
| --- | --- | --- | --- |
| legacy / 无 head | 原始 legacy repository；同时 observe 新规范化结果 | 保持旧行为 | 只允许诊断，不影响运行时 |
| migrating / legacy | 原始 legacy repository；同时 observe | 保持业务行为；同事务使受影响计划项失效，不写 registry version/claim | 只允许更新计划/冻结 |
| migrating / frozen | 仍读 legacy，登录不中断 | 目标租户返回 423 | 允许按计划修正 staged/验证/ops 激活 |
| migrating / registry | query service 读 active；旧 API 动态投影 | 目标租户返回 409 `DOMAIN_CONFIG_MOVED` | 正常 registry 写 |
| migrating / decommissioned | origin 依赖 fail closed | 返回 409 | 只读状态/审计 |
| registry / registry | query service 读 active；旧 API 动态投影 | 返回 409 `DOMAIN_CONFIG_MOVED` | 正常 stage/verify/activate |

`create/update/delete/toggle by id` 必须在 service/repository 边界识别 DOMAIN，并根据 global/tenant state 执行 allow+invalidate、423 或 409，防止从两个通用 controller 任一入口绕过。update/delete 要同时解析修改前后关联租户，按 UUID 排序锁 head；无法关联的行进入 orphan 诊断。前端移除 DOMAIN JSON 编辑只是 UX，不是保护。

### 8.2 解开循环依赖与兼容算法退役

- 新 `LegacyDomainConfigRepository` 承担 legacy DOMAIN 精确读取。
- `LegacyDomainResolver` 从现有 SSO/游客/钉钉实现提取受测试保护的旧算法；它是临时兼容边界，不得被新调用者依赖。
- `TenantPublicOriginQueryService` 在 global legacy 或 migrating+tenant legacy/frozen 返回 resolver 的旧结果，并旁路计算严格结果写 observe；tenant registry 只返回精确 registry 结果；decommissioned fail closed。
- `DefaultConfigService.getDomainConfig/getBaseUrl` 成为 deprecated adapter，单向调用 query service。
- O3 后删除 `LegacyDomainResolver` 的模糊分支；源码门禁只允许 adapter、repository、migration diagnostic 引用 `ConfigType.DOMAIN`。

### 8.3 租户 code 与创建/删除

- O1 独立提交给 `TenantsService.updateTenant()` 增加 `TENANT_CODE_IMMUTABLE`；比较规范化后的旧/新 code，相同值不报错。显示名称等字段仍可改。
- global legacy 时创建租户保持现状，preflight 会把缺失/新增 DOMAIN 纳入新 digest。
- global migrating 时创建租户与 control 行串行化，为新租户建立 `source_state=legacy` head 和待处置项；不冻结其他租户，但未处置的新租户会阻止 finalize。
- global registry 时创建租户直接建立 `source_state=registry` head 且没有 active origin；所有 origin 相关登录 fail closed，并返回 `originProvisioningRequired=true`。正常 stage/verify/activate 后才可用，不由 migration 猜域名。
- 删除前必须 decommission 并删除 head；head FK 阻止直接硬删。version/audit 保留，claim 进入 decommission hold。

### 8.4 调用者切换顺序

同一个 O1 兼容 release 内按以下顺序接线并保留 observe 指标：

1. SSO/游客/钉钉 hostname discovery。
2. CAS、钉钉、App Auth callback/service URL。
3. OpenAPI/verification callback。
4. Message link 与 Function `publicOrigin`。
5. legacy DefaultConfig read adapter。
6. Cookie 只改为消费结构化 origin；Cookie 名称/属性仍留给后续 B0-C。

任何新旧结果差异记录 tenant UUID、调用类别、旧/新摘要和 requestId，不记录原始敏感 URL。global legacy 和 migrating+tenant legacy 时差异只告警；冻结该租户前必须有明确 disposition。

## 9. 文件级实施清单

### 9.1 Platform Server

| 文件/目录 | 变化 |
| --- | --- |
| `src/migrations/<generated>-AddTenantPublicOriginRegistry.sql` | 九表、约束、索引、immutable trigger、legacy control 行 |
| `src/entity/tenant-public-origin/*.entity.ts` | 与 SQL 列名/类型严格一致；不依赖 synchronize |
| `src/domain/tenant-public-origin/*` | 类型、规范化、digest、状态机、错误；纯函数单测 |
| `src/repository/tenant-public-origin.repository.ts` | 接受统一 query/transaction executor，供 Midway 与 CLI 复用 |
| `src/repository/legacy-domain-config.repository.ts` | 唯一 raw DOMAIN 访问边界 |
| `src/service/tenant-public-origin-query.service.ts` | phase-aware 精确读取与 discovery |
| `src/service/tenant-public-origin-command.service.ts` | 当前租户 stage/activate/rollback/decommission、CAS、audit |
| `src/service/tenant-public-origin-preflight.service.ts` | legacy/registry/依赖扫描和稳定 JSON report |
| `src/controller/tenant-public-origin.controller.ts` | 当前租户强类型 API；调用 service 平台管理员保护并统一映射错误，不使用现有 Guard |
| `src/controller/tenant-public-origin-challenge.controller.ts` | `/service` 下最小公开 challenge responder；无会话/数据/Cookie/CORS，统一 404 与 no-store |
| `src/dto/tenant-public-origin.dto.ts` | 8 KiB、UUID、revision、分页上限校验 |
| `src/controller/tenant-public-origin-response.ts` | 将 typed error 映射为真实 HTTP status + 稳定 error code；未知异常通用化 |
| `src/cli/tenant-public-origin.ts` | preflight/plan-validate/status/start/update-plan/retire-orphan/freeze/stage/verify/activate/abort/finalize，无 HTTP bootstrap |
| `package.json` | `origin:*` 命令；不并入普通 start |
| `src/service/default-config.service.ts` | DOMAIN adapter/write phase guard；其他类型不变 |
| 两个 default-config controller | 删除 DOMAIN 特殊判断，依赖 service 统一错误；不复制 guard |
| `src/service/tenants.service.ts` | code immutable、freeze create guard、decommission delete guard；抛 typed error |
| `src/controller/system-config.controller.ts` 租户方法 | 只对上述 typed error 设置真实 409/423 并保留现有 `{code,message,data:null}`；其他旧错误行为不在本提交顺手重写 |
| SSO/Auth/AppAuth/OpenAPI/Message/Interpreter 调用者 | 单向迁到 query service，定义 fail-closed/可重试语义 |
| `scripts/verify-openxiangda-v2-release.js` | 增加 schema、源码禁用扫描和测试门禁 |

### 9.2 平台管理前端

| 文件范围 | 变化 |
| --- | --- |
| API client/types | status/stage/activate/rollback/audit 强类型和 error code 映射 |
| `SystemConfigManagement` | 从通用 config type 中移除 DOMAIN；不能再编辑 JSON |
| 新 Origin 页面 | active/staged/previous、revision、验证结果、冲突刷新、明确激活/回滚；O1 先只读 |
| 租户编辑 | code 字段只读并解释原因；新租户展示 provisioning 状态 |
| 路由/菜单 | 只向平台管理员展示；直接 URL 仍以后端拒绝为准 |

### 9.3 根部署仓库

| 文件 | 变化 |
| --- | --- |
| `scripts/migrate-tenant-public-origin.sh` | 独立 O0/O2/O3 K3s Job 编排、锁、receipt、失败恢复 |
| `scripts/tenant-public-origin-migration-smoke.sh` | Mock kubectl/Job，证明 routine release 不会激活 |
| `scripts/smart-build-and-push.sh` | 将新脚本作为不可变 deploy asset；不执行迁移 |
| `skills/sy-lowcode-platform-deploy/*` | 删除“直接改 DOMAIN JSON”作为 2.0 推荐路径，增加分阶段 runbook |

OpenXiangda v2 公共包和应用模板不直接获得租户 Origin 管理 API；这是平台控制面，不应让应用代码或 CLI workspace 管理。

## 10. 提交与发布分解

每一项独立提交，不能把 O3 混入普通功能发布：

| 提交 | 内容 | 允许发布后的行为 | 回滚 |
| --- | --- | --- | --- |
| O0-a | pure normalizer/digest + read-only legacy preflight CLI | 只读报告 | 删除命令 |
| O0-b | 根部署脚本 plan/receipt smoke | 只读 Job | 删除脚本 |
| O1-a | expand SQL + entities + migration contract | 旧服务忽略新表 | 回旧镜像，表保留 |
| O1-b | query/repository + phase legacy + observe | 运行时仍读 legacy | 回 O1-a 前镜像 |
| O1-c | 调用者迁移 + DefaultConfig adapter/write guard | phase legacy 行为兼容 | 回 O1-b；不改事实源 |
| O1-d | 当前租户 API + Admin 只读页 + tenant code guard | phase=legacy 只读；所有 mutation 被 phase guard 拒绝 | 分别回前后端提交 |
| O2-a | 显式 start-migration + 逐租户 plan refresh/freeze/stage/verify | 只冻结目标租户；其运行时仍读 legacy | 目标租户未激活前可 abort |
| O2-b | 逐租户 activate/decommission | 每次只切一个租户事实源 | 已激活租户只走 registry 版本回滚 |
| O3 | 显式 finalize-migration | 不切任何租户 active；全局停止 legacy 分支 | 只回理解 registry 的兼容镜像 |

O0/O1 可以在确认后开发和部署兼容版本；O2/O3 仍需生产 plan、网关证据和单独操作记录，不能因为代码存在就自动执行。

## 11. 自动验证矩阵

### 11.1 单元与数据库

- normalizer 覆盖大小写、尾点、IDNA、IPv4/IPv6、默认端口、userinfo、反斜杠、控制字符、协议相对、path/query/hash 和 8 KiB 边界。
- SQL contract 断言九表、legacy disposition 的 planned→superseded/retired 合法转换与 finalize 全覆盖、复合 FK、claim PK、challenge/verification/operation receipt 一次性边界、批量 audit sequence、CHECK、immutable trigger、control singleton 和 expand metadata。
- live migration 在空库和已有 legacy 数据库各运行两次，证明幂等 ledger、旧表不变、旧 Pod 可启动。
- 同一租户两事务用相同 head revision、不同 operationId 时只有一个成功；其他租户事务可独立提交。全局 start/finalize 独占 control，tenant 命令共享 control，锁测试证明 finalize 等待在途 tenant 命令且后续命令看到新 global phase；claim 反向输入仍按 hostname 排序，不产生死锁。纯数据库命令相同 operationId/command digest 并发只提交一次并稳定 replay；同 operationId 不同 digest 返回 409；失败方没有孤儿 claim/audit。verify 重试用新 operationId，旧 challenge 到期且不能生成可激活的错误 receipt；网络延迟期间不存在长事务或数据库行锁。
- audit/version UPDATE/DELETE 被 DB 拒绝。

### 11.2 服务与 HTTP

- platform admin allow；普通平台角色、应用管理员、guest、runtime principal、OAuth application principal deny；Guard 缺席不会绕过 service 授权。
- body/query 伪造 tenantId 不改变目标租户。
- global legacy/migrating/registry × tenant legacy/frozen/registry/decommissioned 的合法读写矩阵逐项测试两个 default-config controller。
- migrating+tenant legacy 的 DOMAIN create/update/delete/toggle 使修改前后关联 head revision/plan digest 原子失效且不创建 version/claim；关联租户锁按 UUID 排序；orphan 新增只阻止 finalize；frozen tenant 写返回 423。
- active 缺失、数据库故障、receipt 过期/重放、digest 改变全部 fail closed。
- 激活一个 verification 后，同 staged/head 的其他 receipt 因 consumed/head revision 变化不可再用。
- 新 Origin controller error adapter 返回真实 4xx/5xx，而不是 HTTP 200；已知错误不进入默认 filter。现存租户 update/create/delete 只窄映射 `TENANT_CODE_IMMUTABLE`、freeze 和 decommission typed error，并用平台前端回归证明 JSON/交互兼容。
- 同一数据库上的两个应用实例返回相同 origin，更新不等待进程 TTL。

### 11.3 CLI、部署与兼容

- preflight 在无 registry schema、脏 legacy、重复 hostname/config、orphan、缺失 DOMAIN、scheme 不一致和无依赖 decommission 场景输出稳定 JSON/exit code；plan validator 同时证明 tenant 与 legacy row 两个集合零漏项。
- verify 使用本地 TLS/DNS fixture 覆盖证书 hostname 不符、过期、错误 nonce、redirect loop、跨 origin redirect、敏感 query 转发、私网/metadata 地址、DNS rebinding 和超时。
- migration smoke 证明普通 backend release 只 apply expand SQL/rollout，不调用 start/freeze/activate/finalize。
- 混合 release Pod 存在时 start-migration 阻止；迁移期一个租户 freeze/verify 失败不阻塞其他租户；存在 legacy/frozen/缺失 head 时 finalize 阻止。
- 代表性 1.x View、平台、流程设计器、CLI browser auth、游客、钉钉、CAS、App Auth、OpenAPI/verification、消息链接和 Function publicOrigin 正向回归。
- O1 源码扫描除 allowlist 外禁止 `ConfigType.DOMAIN`、`getDomainConfig()` 和 `getBaseUrl()`；直接认证 Cookie 名的扫描属于后续 B0-C 门禁，不伪装成 O1 已完成。

## 12. 确认后的第一批实现

确认本蓝图后，第一批只做 O0-a 与 O0-b：

1. pure normalizer/digest；
2. legacy dependency collector；
3. read-only preflight JSON schema/CLI；
4. K3s read-only Job/receipt smoke；
5. unit、CLI、shell 和现有 release gate。

这一批不创建新表、不改任何线上读取、不冻结写、不修改租户 code、不改 Cookie，也不部署 reference-environment。O0 证据通过后再实施 O1-a expand schema。
