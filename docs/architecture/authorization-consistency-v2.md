# OpenXiangda 2.0 原生授权内核与一致性基线

状态：已确认实施；2026-08-14 已完成 A0-N0 legacy-exclusion preflight、A0-N1 不可变授权定义 materialization、A0-C1 Native 两环境授权状态/原子版本、A0-N2 Native 运行态写入/本地 fixture、A0-C2 数据库权威求值缓存与 A0-P 权限范围投影韧性；下一步 A0-N3/N4

## 1. 目标与上游边界

本文定义 Admin A1 之前必须完成的 A0 授权内核。它保证 RBAC、单一活动角色、业务字段范围、RelationshipGrant、应用最高管理员绕过和 Data API RLS 在环境晋级、并发写、缓存失败与多实例滚动发布下具有确定语义。

A0 建立在 [OpenXiangda 2.0 环境配置内核](./environment-configuration-kernel-v2.md) 上：包内授权定义属于不可变 AppVersion；活动定义由环境 Head 选择；角色成员和业务授权关系属于环境运行态。当前 `tenant + app` 全局授权模型不能继续作为 2.0 的最终形态。

A0 分为三条可独立发布的轨道：

- **A0-N 原生内核**：不可变授权修订、环境授权状态和 2.0 role/capability 所有权；alpha 授权历史不迁移。
- **A0-C 一致性**：原子版本、条件 revision、缓存 namespace、时间边界和滚动发布。
- **A0-P 投影韧性**：scope grant-source receipt、健康状态、重试、dead-letter 和 replay。

1.x 继续使用现有 `roles`、`api_permissions`、`user_roles`、页面/表单权限与旧业务范围表。2.0 新内核不长期双写这些表，也不要求 1.x 客户端理解环境授权。

## 2. 已证实的问题

| 证据 | 当前行为 | 风险 |
| --- | --- | --- |
| 所有环境部署都执行 `activateAuthorization()` | UPSERT 到应用全局角色、capability、policy 和 authz state | 开发候选可在生产晋级前覆盖生产授权 |
| RoleSession 有 `environment_key`，assignment/role/state 没有 | 会话边界比授权事实边界更窄 | alpha preproduction session 与 production session 实际消费同一权限状态 |
| `bumpAuthzState()` | entity read、`+=1`、save | 并发成功两次可能只增长一次 |
| application config 内联另一份版本 SQL | 同一状态有两个实现所有者 | 新写入口易遗漏或产生不同语义 |
| assignment/grant update/revoke | 应用层先查 revision，再普通 save | 两个并发写可同时通过，最后写覆盖前者 |
| 2.0 复用 legacy role/capability | capability 只有 tenant+code 唯一，角色管理入口可绕过 2.0 版本 | 跨应用同名能力碰撞，package-owned/manual 边界不可靠 |
| BusinessScope Redis 版本 | Redis 失效失败只 warning，结果 TTL 可到 900 秒 | 数据库已撤权但旧 allow 结果可能继续命中 |
| grant-source 异步物化 | 非瞬时失败保留旧有效 grant，只记录 lastSyncResult | 陈旧投影可能在安全策略中继续授权 |
| Data API RLS | 每次检查 session、assignment、role/state 与当前范围 | 已有 fail-closed 骨架，可迁移到环境原生事实而不信任前端 |

审计确认 `getGrantSummary()` 的 `$1..$8` 与八项参数一致；一次拼接输出造成的重复观感不是源码缺陷，不进入实现范围。

## 3. 被拒绝的局部方案

1. **继续使用应用全局 authzVersion**：不能阻止开发部署改变生产权限，拒绝。
2. **只给 legacy 表增加 `environment_key`**：1.x、多入口写入和 2.0 环境迁移会共用同一表结构与回滚窗口，所有权仍不清晰，拒绝。
3. **每个环境复制一套物理业务表**：数据量、DDL、迁移与跨环境复制成本过高；现有业务行已有环境键，拒绝。
4. **Redis INCR + 主动 DEL 作为撤权协议**：外部缓存失败会改变安全结果，拒绝。
5. **每次 scope grant 变化让全应用 RoleSession stale**：高频业务授权会造成全员身份重建，拒绝。
6. **角色切换由前端缓存决定**：多标签、撤权和会话并发都不可靠，拒绝。

## 4. 核心不变量与唯一所有者

1. PostgreSQL 是授权定义选择、成员关系、版本和数据范围的唯一事实源；Redis 只保存可丢弃结果。
2. 每个受保护请求使用认证得到的 `tenant + app + environmentId`，再解析该环境活动授权修订；URL 中 environmentKey 必须经 registry 与 Principal 双重核对，客户端不能覆盖身份。
3. 包内 role/capability/scope 定义不可变并绑定授权修订；部署只切环境指针，不覆盖别的环境。
4. package role、manual role 和平台保留角色在同一环境的 code 空间内不可冲突。
5. 每个成功的结构授权事务恰好推进目标环境一次 `authzVersion`；回滚不推进。
6. 每个成功的共享有效范围集合事务恰好推进目标环境一次 `scopeDataVersion`；单 membership 内联范围使用自身 revision，不推进全环境版本。
7. 带 `expectedRevision` 的资源使用数据库条件写；未命中返回 409，不在应用层模拟乐观锁。
8. RoleSession 绑定环境、活动授权修订、authzVersion 和当前 membership revision；每次请求重新验证当前事实。
9. 应用最高管理员来自平台显式 grant，不依赖角色名称；它跨该应用环境并绕过业务数据范围，但必须审计和 explain。
10. 授权事务不调用 Redis、HTTP、Kubernetes、消息或其他外部系统。

唯一领域所有者为 `AppAuthorizationKernelV2Service`。配置编译器只能创建不可变 revision；环境激活服务只能调用内核的 `activateRevision()`；Role、Scope 和 Admin 服务不能复制版本 SQL。

## 5. 原生数据模型

### 5.1 不可变定义层

```text
app_authz_revisions_v2
  id, tenant_id, app_type, digest, schema_version,
  compiler_contract_version, canonical_json, created_by, created_at
  UNIQUE (tenant_id, app_type, digest)

app_configuration_projections_v2 + app_version_projection_bindings_v2
  app_version -> aggregate projection -> authz_revision_id

app_authz_capability_definitions_v2
  authz_revision_id, capability_code, kind, source, name,
  description, definition_digest

app_authz_role_definitions_v2
  authz_revision_id, role_code, name, description, definition_digest

app_authz_role_capabilities_v2
  authz_revision_id, role_code, capability_code

app_authz_scope_dimension_definitions_v2
  authz_revision_id, dimension_code, resource_code, value_type, hierarchy_mode

app_authz_data_policy_definitions_v2
  authz_revision_id, policy_code, resource_code, match_mode

app_authz_data_policy_rules_v2 + app_authz_data_policy_rule_roles_v2
  policy_code, rule_index, source_kind(current_user|dimension|relationship),
  source identifiers, field, operation/value_path, optional role conditions

app_authz_transition_definitions_v2
  authz_revision_id, from_authz_digest, transition_json

app_authz_materializations_v2
  authz_revision_id UNIQUE, authz_projection_digest,
  materialization_digest, definition_counts
```

`canonical_json` 中的 authz projection 是完整事实；规范化表是确定性、不可变、可查询的 materialized view。仓储在同一配置编译事务内批量写入并逐表比较完整集合，最后才写 `app_authz_materializations_v2`。在线内核只消费存在有效 receipt 的 revision。角色到 capability、策略规则到 role/dimension 的引用由复合外键约束；当前 config v3 没有独立 scope-source 声明，现阶段将 `current_user`、dimension、relationship 三类规则来源显式规范化，不创造第二套配置契约。

授权 digest 覆盖规范化、排序后的 role、capability catalog、role-capability、scope dimension、data policy/rule 和 transition；不覆盖环境成员、manual role、Secret、RelationshipGrant 或物化 grant。平台从已验证 config revision 及其 contracts closure 计算 digest，客户端摘要只能用于传输校验。

App config 增加显式 `authz.capabilities`：

```ts
authz: {
  capabilities: [
    {
      code: 'app:instrument-center:reservation:create',
      kind: 'backend',
      name: '创建预约',
      description: '调用 NestJS 预约创建接口'
    },
    {
      code: 'app:instrument-center:operations:read',
      kind: 'ui',
      name: '查看运维中心'
    }
  ],
  roles: [...]
}
```

- `backend` capability 保护 NestJS/App API 操作；模板要求 `@OpenXiangdaOperation(appOperations.xxx)` 消费生成的 operation contract，由 decorator 同时绑定 capability，不在 controller 散写字符串。
- `ui` capability 只裁剪菜单、路由和按钮，本身不是敏感操作的后端授权；其下所有敏感调用仍需要 backend/data/platform capability。
- Data Resource 的 read/create/update/delete 和 field policy capability 从资源定义自动导出，不重复手写 catalog。
- `platform` capability 由平台保留 catalog 提供，应用不能创建同名定义。

AppVersion prepare 必须证明引用闭合：每个 role capability 属于平台保留 catalog、显式 backend/UI catalog，或由 Data Resource 自动导出；每个 NestJS 保护点和 Admin route capability 也必须出现在 compiled contracts 中；每个 data policy 的 dimension/source 存在；每个 Data API 资源引用的 policy 存在。contracts revision 记录最终闭合集合。跨应用、缺失引用或“只在角色里写了字符串但没有能力声明”的配置直接拒绝 AppVersion。

### 5.2 环境授权状态

```text
app_environment_authz_states_v2
  environment_id, tenant_id, app_type,
  active_authz_revision_id,
  last_activation_operation_id,
  authz_version integer >= 1,
  scope_data_version bigint >= 1,
  revision integer >= 1,
  updated_by, updated_at
  UNIQUE (environment_id)
```

- `authzVersion` 保持 integer，因为它已进入 RoleSession/Principal/RLS 协议；只在环境内低频增长。
- `scopeDataVersion` 使用 bigint，在服务端以 canonical decimal string 拼缓存键，不进入浏览器、RoleSession 或 JWT。
- 环境激活时如果 authz digest 未变化，只更新 Head，不推进 `authzVersion`；digest 改变则在同一 Head 事务中切 revision 并 `+1`。
- `activationOperationId` 是每次激活计划的稳定 UUID；只有同 operation id、同目标 revision 的精确提交后重试可以恢复既有成功，不能仅凭目标摘要相同猜测幂等。
- 普通读路径使用 `requireState`，缺状态 fail closed；不得 read-time 自动建行。

### 5.3 角色、成员与最高管理员

```text
app_manual_roles_v2
  environment_id, tenant_id, app_type, code,
  name, description, status, revision, created_by, updated_by
  UNIQUE active (environment_id, code)

app_manual_role_capabilities_v2
  manual_role_id, capability_code

app_role_memberships_v2
  environment_id, tenant_id, app_type, user_id, role_code,
  status, revision, scope_grants_json, valid_from, valid_to,
  created_by, updated_by, revoked_by, revoked_at
  UNIQUE active (environment_id, user_id, role_code)

app_role_subject_states_v2
  environment_id, tenant_id, app_type, user_id,
  role_subject_set_version bigint >= 1, updated_at
  UNIQUE (environment_id, user_id)

app_super_admin_grants_v2
  tenant_id, app_type, user_id, status, revision,
  created_by, revoked_by, created_at, revoked_at
  UNIQUE active (tenant_id, app_type, user_id)
```

活动角色解析是“当前 authz revision 的 package roles + 当前环境 manual roles + 平台保留 `platform.app-super-admin`”。membership 保存稳定 `role_code`，不引用某个不可变 role row id，因此同 code 在 AppVersion 晋级后保持成员关系。

`role_subject_set_version` 是单用户、单环境的角色选择集合版本。membership create/update/revoke 和应用最高管理员 grant 变化在同一事务原子递增目标环境的 subject set version；最高管理员是应用级 grant，因此一次变化最多更新该应用已登记的两个远程环境。角色选择 cursor 同时绑定环境 `authzVersion` 与该用户 `roleSubjectSetVersion`，因此不会为了一个人的成员变化使全应用 cursor/session 失效，也不会在分页中静默漏项、重复或展示旧摘要。

`valid_from/valid_to` 的时间跨越不会产生数据库写入。role-subject cursor 带服务端签发时间，最长 5 分钟，并将有效期截断到候选集合中最近的 future valid boundary；到期返回 `AUTHZ_V2_ROLE_SUBJECT_CURSOR_EXPIRED`，从第一页重取。分页查询可以按 cursor `snapshotAt` 保持稳定展示，但 switch/受保护请求必须以数据库当前时间重新校验 membership，不能使用 snapshot 或 cursor 放行。

如果新 revision 删除/重命名仍有活动 membership 的 package role、删除仍被 manual role 使用的 capability，或新增 package role 与目标环境 manual role code 冲突，prepare/activation preflight 必须失败，除非 AppPackage 携带按来源摘要区分的显式 `authorizationTransitions`：

```text
- fromAuthzDigest: <sha256-of-older-production>
  roles: old_code -> new_code | revoke
  manualCapabilities: removed_code -> replacement_code | remove
  manualRoles: conflicting_code -> renamed_code | revoke
- fromAuthzDigest: <sha256-of-current-preproduction>
  roles: ...
```

同一 AppVersion 可能面对 preproduction、production 两个不同的旧摘要，因此 transition 是 `fromDigest -> targetDigest` 的有界计划集合。目标环境已经是 target digest 时不执行；当前摘要有 breaking 引用且没有精确 matching plan 时拒绝。transition 在目标环境激活事务中条件更新 membership/manual role revision 并撤销相关活动 RoleSession；实际受影响数量与 preflight 不一致则整笔 409。不能静默让成员变成无角色，也不能把某个环境的迁移计划套到另一个起点。local 只验证 transition 计算，不保存远程 membership。

应用最高管理员 grant 独立于当前活动角色。最高管理员选择业务角色时仍可绕过范围；没有业务 membership 时可以选择平台保留角色进入 Admin。绕过只影响业务数据和应用管理，不获得平台租户管理员能力。

因此 native config 删除 role 上的 `isAppSuperAdmin`。应用 owner/平台应用管理员由平台在建应用、转移 owner 或管理员设置事务中创建/撤销 `app_super_admin_grants_v2`。Alpha 中 `isAppSuperAdmin` role 和活动成员不迁移；新 native reference 由平台管理员显式授予新的 super-admin grant。模板的 `app_super_admin` 角色在 contract 阶段删除，不能继续作为可委托的普通角色。

### 5.4 业务范围运行态

```text
app_scope_values_v2
app_scope_closure_v2
app_scope_effective_grants_v2
app_scope_projection_states_v2
app_resource_relationship_grants_v2
```

上述表都以 `environment_id` 外键定位，并冗余 tenant/app 复合约束防串联。定义来自活动 authz revision；values/closure/effective grants 从该环境业务数据物化；RelationshipGrant 直接保存目标环境资源关系。读取动态业务表时，通过 registry 得到不可变 environmentKey 并与行键比较。

原 `business_scope_*` 与 `app_relationship_grants_v2` 继续作为 1.x/alpha 历史事实；native 请求从不双读、导入或修改这些表。K5 不清理数据库行，只撤销旧 alpha runtime principal 与 workload；共享 1.x 数据继续保留。

## 6. RoleSession 与角色切换

Native RoleSession 使用独立的 `app_role_sessions_native_v2`，不把旧 alpha 行和 nullable 旧字段带入新的状态机：

```text
id, tenant_id, app_type, environment_id, login_session_id, user_id,
subject_kind membership|super_admin,
active_role_membership_id nullable,
active_authz_revision_id uuid,
active_authz_version integer,
active_membership_revision integer nullable,
status active|superseded|revoked|expired,
expires_at, revision, created_at, updated_at
UNIQUE active (environment_id, login_session_id, user_id)
```

K4 撤销 alpha session 后路由只访问 native 表；旧表不做 fallback。这样 RoleSession 的唯一约束、索引和非空规则都能直接表达 native 不变量，也避免后续每个查询都携带 `kernel_mode` 分支。

服务端 context 每次验证：

1. session 属于当前 login session、tenant、app、environmentId、user，状态 active 且未过期；URL key 与 registry 当前值一致；
2. 环境授权 state 为 native，session revision id/authzVersion 与当前值一致；
3. membership subject 仍 active、有效期正确、revision 相等且 role code 仍存在；
4. super-admin grant 当前仍 active；
5. role capability、data policy 和 field policy 从当前 revision/manual role 解析；
6. 业务范围从当前环境查询。

角色切换请求固定携带 opaque `targetRoleSubjectKey` 和 `expectedRoleSessionId`；subject key 只能解析为当前环境 membership 或平台保留 super-admin grant，客户端不能提交 role code 直接激活。服务端按 `tenant + loginSession + environmentId` 获取 transaction advisory lock，再在同一个 statement snapshot 读取当前 session、目标主体和环境 authz state：同目标重试幂等，不同目标并发只允许一个成功，另一个返回 409 并重新 bootstrap。

RoleSession 只绑定结构版本。高频 scope source 同步不让所有用户重新选角色；membership 更新/撤销在同一事务撤销引用它的活动 session，并用 membership revision 隔离缓存。

## 7. 原子版本服务与写入矩阵

`AppAuthorizationKernelV2Service` 只接收已开启的 `EntityManager`：

```ts
requireState(manager, tenantId, appCode, environmentId): Promise<AuthzState>
activateRevision(manager, scope, expectedStateRevision, authzRevisionId): Promise<AuthzState>
bumpAuthzVersion(manager, scope, actorId): Promise<AuthzState>
bumpScopeDataVersion(manager, scope, actorId): Promise<AuthzState>
```

全部使用参数化条件 SQL/UPSERT `RETURNING`。同一领域事务对一个 counter 最多推进一次。

| 写入 | `authzVersion` | `scopeDataVersion` | 局部失效/约束 |
| --- | --- | --- | --- |
| 环境激活不同 authz digest | 目标环境 +1 | 不推进 | Head、state、transition 同事务 |
| 环境激活相同 authz digest | 不推进 | 不推进 | 仅 Head revision 增长 |
| manual role create | +1 | 不推进 | 与 package/reserved code 冲突拒绝 |
| manual role/capability update/revoke | +1 | 不推进 | 条件 revision；capability 不得超出 catalog/ceiling |
| membership create | 不推进 | 不推进 | 同事务推进目标用户 roleSubjectSetVersion；新 id 无旧 cache |
| membership update | 不推进 | 不推进 | 条件 revision；推进 roleSubjectSetVersion；同事务撤销引用 session；cache 绑定新 revision |
| membership revoke | 不推进 | 不推进 | 条件 revision；推进 roleSubjectSetVersion；同事务撤销引用 session |
| super-admin grant/revoke | 不推进 | 不推进 | 条件 revision；推进各现存环境 roleSubjectSetVersion，并撤销该用户在本应用所有环境的 active session |
| scope source 成功 materialize | 不推进 | +1 | source advisory lock；projection 与 version 同事务 |
| RelationshipGrant create/update/revoke | 不推进 | 不推进 | 条件 revision；每次 RLS 直接查当前记录 |
| 1.x role/user-role/permission | 不推进 | 不推进 | native 2.0 不访问这些事实 |

带 `expectedRevision` 的更新固定使用：

```sql
UPDATE ...
SET ..., revision = revision + 1
WHERE id = $1 AND tenant_id = $2 AND app_type = $3
  AND environment_id = $4 AND status = 'active'
  AND revision = $5
RETURNING *
```

零行返回 409。create 依赖数据库唯一约束，将 `23505` 映射为稳定 409。禁止“先 SELECT 比较 revision，再普通 save”。

## 8. 缓存协议

安全 cache namespace 来自同一请求已经解析的数据库事实：

```text
scope:summary:v2:<tenant>:<app>:<environmentId>:
  a<authzVersion>:s<scopeDataVersion>:
  <userHash>:<roleHash>:<membershipHash>:r<membershipRevision>:
  <dimension>:<operation>
```

- Redis 不再保存安全版本键；get/set/cleanup 失败全部回源数据库。
- 版本变化后旧 namespace 永不再命中，只按最多 900 秒 TTL 自然回收，不在授权事务里 `SCAN/DEL`。
- request-local cache 只能活在当前 HTTP 请求；一次 Data API 请求只读一次环境 state。
- 数据库不可用时 fail closed，不回退 Redis 版本或旧 allow 结果。
- 稳定 environmentId 必须进入 key，preproduction 的 grant/materialize 不能使 production 命中相同结果；不用 route key 作为唯一身份。

时间生效不一定有数据库写入。查询 grant 时同时计算下一条 `effective_from/effective_to` 边界，TTL 取 `min(configuredTTL, nextBoundary-now)`，向下取整并至少 1 秒；fake clock 必须覆盖生效前、边界后一秒和失效边界。

## 9. Scope 投影健康 A0-P

`app_scope_projection_states_v2` 记录：

```text
environment_id, source_code, definition_revision,
source_revision, projected_revision,
health healthy|stale|failed,
last_success_at, last_error_code, next_retry_at
```

- 安全敏感 policy 默认 `projectionFailureMode=strict`，引用 stale/failed source 时 fail closed。
- 只有显式 `last_known_good` 的低风险读场景可继续用上次成功投影，并在 explain/监控显示陈旧时间。
- receipt、重试上限、dead-letter 和人工 replay 绑定 environmentId/source/sourceRevision；旧任务不能覆盖新投影。
- 成功替换 grant 与 `scopeDataVersion +1` 同事务；失败不推进、不删除上次投影。
- 候选 authz revision 改变 source 定义时，目标环境必须先构建按目标 revision 隔离的 candidate projection；strict policy 的 projection 未 healthy 不允许 Head 激活。该离线候选不是在线双读模式。

A0-P 复用 Events/Worker 的 claim lease、receipt、退避和 replay 基础设施，但 receipt 领域表独立，不能把外部事件 exactly-once 语义套到数据库授权事务。

## 10. 治理与委托上限

### 10.1 应用权限模式契约

Native kernel 支持三种内部应用模式，AppVersion 必须显式声明一种，不能由页面行为猜测：

| mode | 账号来源 | RoleMembership 来源 | 适用场景 |
| --- | --- | --- | --- |
| `static-role-permission` | 平台已有用户 | 平台/应用最高管理员在 Admin 中维护，角色定义随包 | 小型固定角色应用 |
| `existing-platform-user-assignment`（默认） | 平台已有用户/部门 | 应用授权管理员从 Directory 选择用户，维护环境 membership 与业务范围 | 仪器、学院、项目等多数内部应用 |
| `managed-platform-account` | 应用通过 Organization API 创建/维护平台账号与组织 | 治理模块在服务端事务/幂等编排后维护 membership | 学校/企业账号治理系统 |

`query-param-context` 不是内部账号模式，只允许作为筛选、预填或签名 ticket 输入；它永远不能扩展 role subject、scope 或敏感操作权限。公开访问继续使用独立 public-access grant/external role 协议，不复用内部 membership 或最高管理员。

默认不允许应用直接创建账号/部门。`managed-platform-account` 必须同时声明独立管理 capability、Organization API idempotency/audit 和禁用/冲突策略；Nest/App Function 只调用平台 SDK，不直接调用 legacy `/user`、`/department` 或写平台表。账号生命周期与授权 membership 是两个事务边界：账号创建成功但 membership 失败时进入可恢复治理任务，不能通过前端假装整体成功，也不能回滚删除已有平台账号。

动态业务范围（学院、仪器、项目、客户、门店等）使用环境 scope dimension/source/policy 或 RelationshipGrant；不为每个业务对象创建角色、permission group 或平台部门。页面 URL/query 里的 collegeId/instrumentId 只是上下文，Data API/RLS 仍按当前 role subject 和后端范围判定。

### 10.2 管理 capability

2.0 管理能力拆分为：

| capability | 能力 |
| --- | --- |
| `app:role:read` | 查看当前环境角色、membership 与 explain |
| `app:role:define` | 创建/维护当前环境 manual role |
| `app:role:assign` | 创建、更新、撤销当前环境 membership |
| `app:role:grant-capability` | 在 catalog 与 delegated ceiling 内调整 manual role capability |
| `app:scope-grant:manage` | 维护当前环境 membership scope 与 RelationshipGrant |
| `app:super-admin:manage` | 创建/撤销应用最高管理员；只授予平台租户管理员或应用 owner |

package-owned role 只能由不可变 AppVersion 改变；管理 UI 不允许改 code、capability 或把 manual role 伪装成 package role。普通管理员可授予的集合不得超过其后端 `delegatedCapabilityCeiling`；当前拥有某能力不自动意味着可以把它授予别人。

旧 `app:role:manage` 不进入 native catalog。旧实验管理员不迁移；新 native reference 由平台管理员通过新的 granular capability/delegation ceiling 显式授权。旧 endpoint 在合同切换后返回 410，不在运行时做隐式映射。

角色治理 UI 的动作矩阵按后端 capability 分离：查看、定义 manual role、分配成员、授权 capability、维护 scope、管理最高管理员、管理平台账号不能由一个“管理员”布尔值包办。导入 membership 要逐行校验用户、目标环境、role、delegation ceiling、有效期和 scope；导出只返回操作者有权查看的环境，不包含 token、Secret、密码或完整敏感个人资料。

## 11. 2.0 合同切换与多实例状态机

授权随环境配置内核 K0-K5 一次切到 native：

| 阶段 | 行为 | 回滚边界 |
| --- | --- | --- |
| N0 preflight | 按显式 allowlist 只输出 alpha app 的授权状态数量和活动 session/lease blocker；不输出主体、scope/resource value，不生成映射计划 | 只读，无回滚 |
| N1 native build | 新建 immutable/native 表、compiler、environment authz 和 context；离线/本地验证 | 线上 alpha 仍运行，可回滚应用 |
| N2 capable rollout | 所有实例同版，安装 generation gate 与 maintenance fence，native 路由尚未开放 | 可回滚同能力镜像 |
| N3 drain | 暂停全部 2.0 写，排空请求/worker，撤销 alpha session/token | 保持 maintenance；不影响 1.x |
| N4 switch | 单事务 CAS 设置 native generation，只开放已提前绑定 Native Head 且已经过完整性校验的新 reference；不在切换事务初始化授权状态，旧 endpoint 410 | 只回滚 native-aware 修复镜像，不回 alpha 语义 |
| N5 reopen/retire | 真实验收后开放写入；观察期后撤销旧 alpha runtime principal 和 workload，数据库 alpha 授权历史不删除 | 新 app 用 Native Head 回滚；共享 1.x/alpha 表不写 |

不复制 alpha membership/grant。全新的 native reference 使用新 app identity，并由 seed/Admin/SDK 重新创建 membership、RelationshipGrant 和 super-admin；旧主体关系不进入报告、Git、CLI stdout 或 AI 上下文。Kubernetes 检查全部可服务 Pod 的 release capability；三机私有化检查受控实例清单。readiness 只表示单 Pod 健康，不证明集群版本一致。

## 12. 可证伪验收

### 12.1 环境与晋级

- preproduction 激活不同角色/capability/policy 后，production authzVersion、RoleSession、explain 和 Data API 结果不变；local 不修改任一远程 authz state。
- 同一 AppVersion 晋级预发/生产复用相同 authz revision id/digest，两个环境 authz state 和 membership 独立。
- 删除在用角色但无 transition 的候选 prepare 失败；显式 mapping/revoke 只改变目标环境且数量精确。

### 12.2 数据库并发

- 两个连接同时推进同一环境 authzVersion，最终净增 2；一个事务回滚时只净增 1。
- 两个相同 expectedRevision 的 membership/grant 更新恰好一个成功、一个 409。
- membership revoke、scope 清理和活动 session 撤销同时提交或回滚。
- 两个并发角色切换：同目标幂等，不同目标一个成功一个 409。

### 12.3 缓存与 RLS

- Redis `GET/SET/DEL/SCAN` 全部失败时，撤权后下一请求由数据库事实拒绝。
- fake clock 证明 grant 未来生效/到期边界不会复用旧结果。
- PostgREST 真实 HTTP 证明：环境 authz 变化只使该环境 session stale；membership 撤销由局部状态拒绝；scope 撤销不会命中旧 cache。
- production 与 preproduction 使用相同 user/role/resource id 时，稳定 environmentId 保证缓存和 RelationshipGrant 不串环境；local 使用独立 issuer 和本地存储。

### 12.4 治理、发布与 1.x

- package/manual/reserved code 冲突、跨 app capability、超 delegated ceiling 和伪造 environment 全部拒绝。
- strict projection failed 时 fail closed；old receipt 不能覆盖 newer revision；replay 幂等。
- N2 证明全实例 native-capable；N3 后没有 alpha 写入；N4 旧 endpoint 稳定 410 且 1.x 不受影响。
- 代表性 1.x 登录、角色、页面和表单权限证明不访问 native 表。

## 13. 实施提交顺序

1. A0-N0：显式 allowlist 的只读 alpha preflight/legacy exclusion classifier；不生成授权迁移计划。
2. A0-N1（已完成）：immutable authz compiler、native schema、digest、materialization receipt 与 closure tests。
3. A0-C1（已完成）：Native 两环境注册、环境 state 唯一服务、原子 counter、显式 operation id 和 conditional revision。
4. A0-N2（已完成）：native membership/manual/super-admin/scope 的全新写路径、幂等 receipt、Native RoleSession 局部失效与 local fixture v3 离线 explain；不实现 alpha importer。
5. A0-C2（已完成）：DB-authoritative context 每次先校验环境 state、RoleSession、membership/super-admin 与有效期，再命中环境/版本/主体 revision 隔离的 Redis summary；request cache、time boundary、RelationshipGrant 直读及 Redis GET/SET 全故障后的撤权拒绝均已通过真实 PostgreSQL。
6. A0-P（已完成）：`native-2` 增加环境中立 `scopeSources`，双编译器验证真实 Data Resource/字段/role/dimension 闭包；平台物化不可变 source definition。Data API 写事务同时推进 source revision、标记 stale 并创建数据库权威 job，RoleMembership 生命周期也由数据库触发器原子失效相关来源；Worker 使用租约接管、指数退避、dead-letter、人工 replay、不可变成功 receipt、层级 closure 与 generation compare-and-swap，旧任务不能覆盖新投影。恢复扫描能补齐激活冷启动和 Bull/Redis 故障；授权读取对 strict 投影失败关闭，仅显式低风险 read 可使用 last-known-good。一次性真实 PostgreSQL 验收已贯通 source row、membership 失效、持久 job、投影、层级闭包、strict gate 和 scope 求值，并与 39 个平台测试套件 / 263 项测试共同纳入门禁。
7. A0-N3/N4：全实例 capability gate、短时写栅栏、native generation switch 与真实 Postgres/PostgREST/K3s 验收。
8. A0-N5：新 reference 预发验收后开放 native 常规写入；观察期后只撤销旧 alpha runtime principal/workload，不导入或删除 alpha 授权行。
9. Admin A1/A2：消费 native membership revision、authz revision 与可靠的环境 state。

每个提交先记录问题证据、所有者、不变量、上下游契约、失败/并发、安全/资源、回滚和验收；发现新写入口时先更新矩阵，不在调用点临时补 bump 或兼容分支。
