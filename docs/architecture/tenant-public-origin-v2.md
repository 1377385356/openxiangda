# 租户公共 Origin v2

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：已设计待确认；2026-08-13 经生产表结构与完整调用链审计后修订

## 1. 问题证据

当前平台有多个调用方分别实现“域名找到租户”：SSO 使用 `endsWith` / `includes`，游客登录和钉钉登录还有各自的近似逻辑。它们会把请求输入同时当成租户选择依据和安全信任依据，无法证明 `school.example.com.evil.test`、重叠后缀或重复配置不会解析到错误租户。

2026-08-13 对源码和 reference-environment 的只读核验证明：

- K3s 内只有一套平台服务，入口 Nginx 将多个租户虚拟主机转发到同一个 NodePort；多 Pod、多应用服务器并不意味着一个租户需要多个公共 Origin。
- 当前唯一启用 CAS 的租户可由 HTTPS 访问，但数据库默认域名仍声明为 HTTP。若 B0-R 直接按数据库值严格校验，该租户会明确失败；若运行时忽略 scheme 兼容，则会破坏 OAuth/CAS 的同源安全边界。
- `platform.example.com` 与 `alias.example.com` 当前被同一个 HTTPS server block 接受，但平台只声明前者为租户主域名；同一虚拟主机还承载非平台路径，不能粗暴重定向整台主机。
- 生产 `default_configs` 只有主键、`configType` 和 `isActive` 三个索引。源码中声明在未注册派生类上的复合 `@Index` 没有成为数据库约束；10 条 DOMAIN 记录当前没有重复只是数据现状。
- DOMAIN DTO 接受任意 `configData`，两个通用配置控制器都能创建、更新、启停和删除；当前更新是先查后存，没有结构校验、数据库唯一约束或 revision CAS。
- `getBaseUrl()` 不只服务 SSO，还生成 CAS、钉钉、App Auth、OpenAPI/verification 回调和消息链接；`getDomainConfig()` 还被用于 Cookie。只替换 SSO 会制造新的双事实源。

因此，B0-R 之前新增独立的 **B0-O 租户公共 Origin 收敛**。B0-O 解决公共入口的所有权、存储和精确解析，B0-R 只解决认证完成后的 return target；Cookie 安全另属 B0-C。三者不能混成一个 URL 工具函数或一次不可回滚发布。

## 2. 架构决定

### 2.1 所有者与唯一事实源

Platform Server 新增唯一的 `TenantPublicOriginService`。SSO、游客登录、钉钉登录、CAS、App Auth、OpenAPI/verification 回调、消息链接和以后所有需要租户公共入口的模块都只能调用该服务，不再自行查询 `default_configs`、拼装 `{ protocol, domain, port }` 或实现字符串匹配。

长期唯一事实源是专用的版本化 registry。上一版设计曾计划继续复用 `default_configs` JSONB；生产索引和写入口审计已否定该决定。通用 `any` 配置不能可靠表达结构、全局唯一、revision CAS 和审计；给 JSONB 继续叠表达式索引会让认证边界永久依赖隐式格式。

registry 共九张表：下列七张负责版本、控制指针、legacy 逐行处置、主机名占用、验证与幂等，后文另外定义追加审计表和全局迁移 control 表。

| 表 | 约束与语义 |
| --- | --- |
| `tenant_public_origin_versions` | 不可变历史；以 UUID 标识，保存稳定 tenant UUID/code 快照、规范化 scheme/hostname/port/origin_key、创建者和时间。tenant UUID 不直接 FK 到租户，使已 decommission/删除租户的配置正文仍可审计 |
| `tenant_public_origin_heads` | 每租户一行，`tenant_id` 主键/FK 指向 `tenants.id ON DELETE RESTRICT`；保存单租户 `source_state`、迁移 action/目标 origin/legacy 与依赖摘要、`active_version_id`、`staged_version_id`、`previous_active_version_id`、`rollback_until` 和单调 `revision`。三个版本引用都使用 `(tenant_id, version_id)` 复合 FK，防止串租户；所有 freeze/stage/activate/rollback/decommission 命令都做 head revision CAS |
| `tenant_public_origin_legacy_dispositions` | 每条 legacy DOMAIN config id 一行；保存原始 row digest、关联 tenant UUID/code 快照（orphan 可空）、`migrate/decommission/retire-orphan` action、计划项摘要和 `planned/retired` 状态。它是 finalize 证明每条旧记录有明确去向的数据库事实，不用 audit 或外部 JSON 反推当前状态 |
| `tenant_public_hostname_claims` | 规范化 `hostname` 为主键；记录该 hostname 当前归属的稳定租户 UUID、租户 code 快照、`owned/retirement/decommission-hold` 状态和释放时间。active/staged/previous 对同一 hostname 共享一条 owned claim；跨 scheme/port 仍只允许一个租户拥有该 hostname |
| `tenant_public_origin_challenges` | ops CLI 为当前 staged version 临时签发；只保存随机 nonce 的 hash、head revision 和短 TTL。公开 challenge 端点按 opaque id + header 校验，不按 Host 找租户，不返回租户信息 |
| `tenant_public_origin_verifications` | ops CLI 在外部检查全部成功并消费 challenge 后插入的短期回执；不可修改的证据主体绑定 tenant UUID、staged version、head revision、该租户 state digest、部署 release、网关声明摘要、逐项检查结果、验证者和过期时间，只允许一次性从未消费变成 consumed；浏览器管理 API 不能创建或伪造。它不绑定全平台 digest，避免无关租户变化使回执失效 |
| `tenant_public_origin_operations` | 每个成功逻辑命令一个不可变幂等 receipt；operation UUID 唯一并绑定 command type/digest、安全结果摘要和操作者。同 ID 同 digest 稳定 replay，不同 digest 冲突 |

版本字段约束为：scheme 仅 `http|https`；hostname 是 WHATWG URL 规范化后的 ASCII 小写值，不含尾点、方括号、path/query/userinfo；port 为 `NULL` 或 `1..65535`，默认端口必须归一为 `NULL`；`origin_key` 是与这些列一致的数据库生成值，IPv6 只在生成 origin 时加方括号。`(tenant_id, version_id)` 唯一键供 head 复合 FK 使用。版本记录创建后不可 UPDATE/DELETE，普通管理和 decommission 都只改变 head/claim 生命周期。

同一 expand migration 建立追加式 `tenant_public_origin_audit_events`，记录 import/stage/verify/activate/rollback/decommission/release-claim 的 operation id、稳定 event sequence、前后版本、head revision、操作者、requestId 和时间。operation receipt、head/claim 变更、revision CAS 与全部审计必须在同一个事务提交；审计不保存认证 ticket、code、Cookie、Secret 或完整敏感 query。审计表保留租户 UUID/code 快照而不级联删除，保证租户删除后仍可追责。

数据库和服务共同保证：

1. 每个租户至多一个 active 和一个 staged origin；运行时只读取 active。需要浏览器入口的租户必须恰好一个 active。
2. scheme、hostname、port 经统一纯函数规范化；默认端口消除，IPv6 只在序列化 URL 时加方括号。
3. hostname claim 跨 active/staged/previous-active 全局唯一；同一 hostname 不允许因 scheme 或 port 不同分给两个租户。一个租户可以在版本切换中继续使用自己已 claim 的 hostname。
4. head 更新执行 revision CAS；影响行数不是 1 即返回 409，禁止后写覆盖先写。
5. stage 只创建不可变版本和 claim，不影响运行时；activate 必须携带目标 staged version、head revision 和与该版本绑定的验证回执。
6. 每个租户只保留一个上一 active 版本，默认回滚窗口 7 天、平台可配置但不得超过 30 天。下一次激活只在更旧 previous hostname 已不被 active/staged/retirement 引用时原子释放其 claim，再把当前 active 变成新的 previous，避免 claim 无界增长。
7. 停用采用 `decommission` 命令；依赖 origin 的 SSO/外部登录必须先停用。租户删除必须先 decommission，hostname 转成默认 30 天的 `decommission-hold`，即使租户行删除也不能立刻被另一租户接管；到期由有界清理任务释放并写审计。
8. hostname 变化后旧 hostname 至少保留到当前已签发 refresh token 的最大 TTL 到期。平台在旧入口提供无业务数据的 retirement 响应来清理旧 Cookie 后跳 canonical；hold 期间禁止该 hostname 分配给其他租户。
9. 一个租户存在未到期 hostname retirement hold 时，不允许再次激活第三个新 hostname；同 hostname 的 scheme/port 修订仍可进行。回滚到 head 当前 previous hostname 是唯一例外：事务把旧 canonical claim 从 retirement 恢复为 owned，并把刚下线的 canonical 变成新的 retirement/previous，仍保持至多一个旧 host。这样 claim 数量有界，也不会让 hold 阻断合法回滚。

### 2.2 Legacy 兼容但不双写

现有 `ConfigType.DOMAIN + configName=default` 只作为迁移输入。切换为 registry 后：

- `default_configs` 的 DOMAIN 行成为冻结历史快照，不再接受写入，绝不长期双写。
- 旧读取 API 由 `TenantPublicOriginService` 动态投影成旧 `{ protocol, domain, port }` 形状，兼容仍需读取的 1.x 客户端；投影不是第二份存储。
- 旧通用 DOMAIN 写 API 返回 409 `DOMAIN_CONFIG_MOVED`，响应给出新的平台管理入口，不静默改写新表。
- 平台管理端使用专用、强类型、带 head revision 的 stage/activate/rollback API；不再让管理员编辑 JSON，也不允许保存即生效。
- `DefaultConfigService.getDomainConfig/getBaseUrl` 在兼容期只做废弃适配并委托新服务；所有源码调用者逐项迁移后删除其域名职责。

### 2.3 Canonical origin 与入口别名

首期每租户只认一个 canonical origin，不保存普通入口别名。额外域名上的**平台入口与认证路径**必须在最外层受控网关使用固定目标 308 重定向到 canonical origin，并保留普通 path/query；别名不得把这些请求直接代理到平台。若同一虚拟主机还承载其他非平台服务，重定向只作用于明确的平台 location，不接管整台主机。

处于 `retirement` hold 的旧 hostname 是唯一例外，但它也不是第二个业务入口。网关只把该 host 的平台 location 导向无会话、无数据权限的 `AuthCookieRetirementEndpoint`：响应在旧 host 上清除已知两代 Cookie，设置 `Cache-Control: no-store`，再用固定目标 302 跳到 canonical 根入口。它不执行 refresh、SSO callback 或业务路由，也不携带原 query、ticket、code/state 到新 host；非平台 location 仍不受影响。hold 到期且旧名使用指标归零后才能移除此端点并改为普通 308/下线。这样既能清理 host-only Cookie，也不会把旧域名保留成第二个认证面。

未来若确有“同一租户多个不可重定向入口”的业务证据，应单独设计带全局唯一约束、用途、启停状态、revision 和审计的 alias registry；不能重新启用后缀、前缀或 `includes` 匹配。

### 2.4 解析与写入契约

```ts
getCanonicalOrigin(tenantId: string): Promise<CanonicalTenantOrigin>
resolveTenantByPublicOrigin(candidate: string): Promise<ResolvedTenantOrigin>
stageCanonicalOrigin(command: StageTenantPublicOriginCommand): Promise<StagedTenantOrigin>
activateCanonicalOrigin(command: ActivateTenantPublicOriginCommand): Promise<CanonicalTenantOrigin>
rollbackCanonicalOrigin(command: RollbackTenantPublicOriginCommand): Promise<CanonicalTenantOrigin>
```

- 新版浏览器提交 `window.location.origin`，服务端规范化后按完整 `origin_key` 精确查询。
- 兼容现有 1.x 的 SSO status 请求可以暂时提交 hostname；服务端按全局 hostname claim 精确解析。hostname 模式只用于发现租户，不能成为回调 allowlist；同一 hostname 多租户/多端口模式不再支持。
- `Host`、`X-Forwarded-Host` 和 query 参数都是不可信候选输入。即使网关转发这些头，也不能覆盖 registry。
- CAS `redirectUri` 由 canonical origin 约束；发起和回调阶段分别再次校验精确 origin，不能因旧 hostname 或别名放宽 scheme/host/port。
- 找不到、歧义、配置无效或数据库不可用均 fail closed。SSO status 返回 disabled/明确配置错误；认证发起返回 4xx/5xx 安全错误，不回退到任意租户，也不导航到原始目标。
- 消息/通知链接生成也不使用请求 Host 或过期缓存；无法取得 origin 时进入可重试失败，不能发送指向错误租户的链接。
- 首期浏览器管理写只允许当前租户 `PLATFORM_ADMIN`；应用管理员和普通租户角色不能进入。stage 提交完整目标值、`operationId` 和 `expectedHeadRevision`，activate 还必须提交 `stagedVersionId + verificationReceiptId`；禁止 PATCH 一个字符串后由服务猜测剩余字段。
- stage 不改变 active，也不把 challenge nonce 暴露给浏览器。ops CLI 在 verify 开始时生成至少 256 bit 随机、短期、一次性的 staged-origin challenge，只把 hash 写库，随后主动通过 staged HTTPS URL 的固定 challenge 路径发送 nonce header，并在客户端校验 DNS、证书 hostname/有效期/链、响应状态和 platform release。平台端只按 opaque challenge ID 和 nonce hash 验证，不从 Host 推导租户、不返回租户信息。适配器再检查固定 308/平台路径和 SSO provider callback；全部成功后在消费 challenge 的事务中插入不可变短期回执。activate 锁定 head 和回执，重新校验该租户 state digest、部署 release 与网关声明摘要，再一次性消费并切 active；过期或已消费回执返回 409。
- rollback 不是直接改列，而是把仍处于 rollback-hold 的旧版本重新 stage，再经过与普通激活相同的验证。这样回滚不会把已经失效的 DNS/TLS 配置盲目恢复上线。
- 每个租户迁移期的首次激活只接受处置计划覆盖的当前生产入口；该租户进入 registry 后、B0-C 完成前，API 禁止激活 hostname 变化，只允许同 hostname 的 scheme/port 修订。这样首次数据迁移不会顺带变成用户会话域名迁移。

### 2.5 调用者迁移矩阵

O1 必须维护源码扫描门禁：除 `TenantPublicOriginService`、legacy 投影适配器和迁移诊断外，生产代码不得再引用 `ConfigType.DOMAIN`、`getDomainConfig()` 或 `getBaseUrl()`。已审计调用者及目标语义如下：

| 当前调用者 | 当前用途 | O1/O3 目标与失败语义 |
| --- | --- | --- |
| `SSOConfigService`、`DingTalkLoginService`、`GuestService` | hostname→tenant，当前全量扫描/模糊匹配 | 统一调用 `resolveTenantByPublicOrigin/Hostname`；未知或冲突 fail closed，不回退任意租户 |
| `CASAuthService`、`DingTalkAuthService`、`AppAuthService` | 构造外部认证 callback/service | 读取 active canonical origin；缺失/数据库故障拒绝发起认证，不使用请求 Host |
| `OpenXiangdaVerificationService`、`OpenApiFrontendLoginService` | 生成登录/验证回调，并可能偏好 request origin | 安全回调只使用 active origin；相同 origin 的请求信息只能用于一致性诊断，不能覆盖 registry；缺失即失败 |
| `ScriptInterpreterService` | 向 App Function 运行时注入 `publicOrigin` | 注入 active origin 和 revision；生产缺失时 Function 调用明确失败，不回退环境 base URL；本地 profile 的 dev origin 是独立显式配置 |
| `MessageEngineService` | 生成业务详情链接 | 读取 active origin；缺失进入可重试消息失败，不发送相对或错误租户链接 |
| `AuthService`、`JwtMiddleware`、传统 refresh、`AppAuthService`、CLI auth、Application API gateway、`AuthImpersonationControlService` | 多处直接读写旧认证 Cookie 名与 Domain | B0-O 只提供结构化 active origin；B0-C 全部迁到唯一 `AuthCookieService`，版本化名称、v2 优先和双代清理由该服务所有 |
| `DefaultConfigService` 与两个 default-config controller | 通用 DOMAIN 读写及进程缓存 | O1 legacy 期仍按 phase 读取；O3 后旧读动态投影，旧写 409；删除缓存和域名职责 |
| 平台 `SystemConfigManagement` | JSON 文本编辑、启停/删除 DOMAIN | 移除 DOMAIN 选项；新增专用 Origin 页面展示 active/staged/previous、验证证据、revision 冲突和明确激活/回滚 |

发布门禁还要扫描平台前端 API 路径和测试 fixture，确保没有通过通用配置接口继续写 DOMAIN。新增调用者必须明确属于“租户发现、认证回调、普通链接、运行时注入或 Cookie”之一；不得绕过服务直接读表。

### 2.6 多实例、缓存与资源边界

公共 Origin 是低频认证控制面数据，正确性优先于进程内缓存。首期按 head 的稳定租户 UUID、claim 的 hostname 主键和版本 origin 索引做数据库精确查询；通过 `tenants.code -> tenants.id -> active_version` 联合查询保持现有服务参数兼容。禁止每次加载所有租户后在 Node 内扫描，也禁止各 Pod 维护无共享版本的 allowlist。任意数量的 API Pod 对同一数据库快照必须得到相同结果。

输入 UTF-8 上限 8 KiB，只接受单个 origin/hostname；不做 DNS 查询、通配符展开或外部网络访问。攻击输入必须在查询前拒绝，查询计划需要证明索引命中。未来只有在性能证据充分时才能增加以 `tenant_id + revision` / `origin_key + revision` 为键、带共享 revision 的读穿缓存；数据库异常时安全调用方不得用过期值继续认证。

### 2.7 反向代理与 preflight 契约

标准入口需要：

- 将平台 NodePort/Service 只暴露给受控网关；
- 转发原始 `Host` 与可信的 `X-Forwarded-Proto`，但 Platform Server 只在配置好的内部代理范围解释 forwarded headers；
- 普通非 canonical 别名的平台入口/认证 location 使用固定目标 308；retirement host 只接入无业务能力的 Cookie 清理端点；同主机其他业务保持原路由；
- HTTP→HTTPS 不使用任意请求 Host 拼目标，而使用该 server block 的固定 canonical host；
- 三台服务器、两个应用节点或多个 Pod 共享数据库 registry 和同一 release，不按实例注册回调。

Preflight 分成两个证据源，不能让数据库命令假装理解所有网关：

1. Platform Server 的只读 JSON 命令验证 legacy/registry 结构、规范化、重复、SSO 依赖、head/claim、迁移 phase 和查询计划；由目标后端镜像提供。
2. 部署适配器读取实际受控入口（Kubernetes Ingress、标准 Nginx 渲染结果或显式运维清单），探测 staged origin 的 TLS/HTTP 跳转/平台路径并与 registry 比较；hostname 迁移时还要证明旧 host 只暴露 no-store retirement 响应且不会转发敏感 query。适配器无法证明时输出 `unverified`，允许 O0/O1 观察，但阻止验证回执生成和 O2/O3/日常 activate。

启用 SSO 时还必须证明 provider 使用的精确 callback/service 已就绪。能查询配置的 provider 使用适配器自动验证；无法查询 redirect allowlist 的 CAS/OAuth/OIDC 提供商允许平台运维人员提交**精确 provider、回调摘要、变更单引用和短期有效期**的风险证明，单独写审计并在 activate 时消费。它不是“跳过检查”：缺少自动证据或显式风险证明都不能生成完整回执。未来接入 provider API 后应移除对应人工证明路径。

运维清单只是待验证的部署声明，不成为认证事实源。reference-environment 可使用 host Nginx 适配器；私有化三机环境使用其实际 Ingress/Nginx 适配器，不复制业务代码。

### 2.8 授权边界

当前 `AuthorizeMiddleware` 对未注册权限点的写请求默认放行，因此专用 API 使用三层授权，不能只依赖前端菜单或路径匹配：

1. 现有 `@Permission` Guard 在进入 controller 前抛错，而全局 error filter 会把它转成 HTTP 200；`PermissionService` 还会让 runtime principal 默认通过。首期 Origin API 不把这套机制伪装成保护层。
2. 服务层要求真实用户主体，显式拒绝 guest/runtime/application principal，从会话固定当前 tenant，再 `assertPlatformAdmin()`；普通应用管理员和应用角色不通过。controller 在方法内统一映射真实 HTTP status，body/query 不能指定另一个租户。
3. 跨租户 O0/O2/O3 预检、导入和 phase 切换不开放普通 HTTP，也不复用应用 runtime principal。它们由随 Platform Server 不可变镜像发布的运维 CLI 在 `server-deploy.sh` / K3s Job 中执行，使用既有受控数据库 Secret；必须携带 operation id、operator、change reference、release 和 requestId，每租户结果写控制面审计。

首期浏览器管理 API 只允许当前租户 `PLATFORM_ADMIN`，不做平台权限委派。未来需要委派时应先收敛平台级 seed 的唯一来源、Guard 的真实 HTTP 错误语义和 runtime principal bypass，再设计 `platform:tenant-public-origin:*` 权限与授权审计，不在本次迁移中默认开放。

数据库 FK、hostname claim、head revision CAS 和 phase lock 是最后一致性边界，不能被 `PLATFORM_ADMIN` bypass。`TenantsService.deleteTenant()` 必须在服务层先执行 decommission 检查，数据库 head→tenant FK 使用 `ON DELETE RESTRICT` 防止其他写入口硬删绕过；完成 decommission 后删除 head，才允许删除租户。immutable versions、hostname claim 和 audit 都以无租户 FK 的 UUID/code 快照保留，claim 到期由有界任务释放，版本/审计按平台审计保留策略归档而不由普通删除接口清除。

稳定 UUID 只解决 Origin registry 自身的所有权，不代表现有平台已经支持租户 code 重命名。当前大量业务表仍把 `tenants.code` 当作反规范化租户键，直接修改会使 SSO、角色、数据和应用记录分裂。B0-O1 因此必须给 `TenantsService.updateTenant()` 增加 `TENANT_CODE_IMMUTABLE` 栅栏：显示名称等资料仍可修改，code 变更一律拒绝；未来若需要重命名，应另建覆盖所有依赖表、外部凭据、缓存和回滚的专用事务，不在 Origin 改造中假装已经解决。

### 2.9 Cookie 是独立 B0-C 契约

现有 `AuthService` 同时把 DOMAIN JSON 用作 Cookie Domain，并固定 `secure: false`。这与公共 Origin 相邻，但不是同一能力。B0-O 不得在迁移表时顺手改变 Cookie，否则域名切换失败和登录态迁移失败会落入同一个回滚单元。

B0-C 在 registry 稳定后单独实施，并新增唯一 `AuthCookieService`，但不把所有协议 Cookie 塞进一个大服务。它只拥有平台共享会话 Cookie（access、refresh 和身份冒用控制）的名称、读取、写入、双代兼容与清理；`AuthService`、`JwtMiddleware`、传统 refresh controller、App Auth refresh、CLI browser auth、Application API gateway 和冒用身份控制不能再直接访问这些名称。App Auth/OAuth 的短期 verifier/nonce 仍由协议模块拥有，只复用无状态 `AuthCookiePolicyResolver` 取得 secure/host-only/sameSite/path 属性；公开访问、对象存储等非登录 Cookie 不在 B0-C 范围。发布门禁分别扫描“共享会话名的直接访问”和“协议 Cookie 自行推导 secure/domain”，避免中央服务变成新的协议耦合点。

- HTTPS canonical origin 的认证 Cookie 必须 `Secure`；HTTP 部署必须在部署清单显式选择 `insecure-http` 策略，Cookie 不带 `Secure` 并产生持续高危诊断。策略只来自受控部署配置，不从请求 Host/forwarded header 猜测；声明协议与 registry/外部探测不一致时 preflight 阻止 C1。
- v2 共享会话 Cookie 一律 host-only、`Path=/`，不设置 `Domain`，首期不支持跨子域共享。HTTPS 使用 `__Host-ox_access_v2`、`__Host-ox_refresh_v2` 等 `__Host-` 名称；显式 insecure HTTP 使用无前缀 `ox_access_v2`、`ox_refresh_v2`。未来若有真实跨子域共享需求，必须单独设计 scope registry、威胁模型和迁移，不能从 hostname 推导父域或给当前服务加一个任意 Domain 字符串。
- 新 Cookie 使用版本化名称，避免浏览器对同名 host-only/Domain Cookie 的发送顺序产生歧义。兼容期读 v2 优先、旧名只作受限 fallback；登录只签发 v2 并按 C0 生成的 legacy scope manifest 清除已知旧 Domain/host-only scope，登出同时清除两代名称。manifest 包含当前配置和运维声明的最近历史 hostname/domain/path，绑定摘要并进入发布证据；平台不能声称能清理一个未声明、不可访问的历史 host。
- 旧 refresh token TTL 当前为 30 天，因此兼容窗口不得短于已签发旧 refresh token 的最大剩余 TTL。窗口结束后停止接受旧名，而不是无限兼容。
- B0-C 单独回归密码、游客、钉钉、CAS、角色切换、退出和代表性 1.x；失败可回滚 Cookie 策略而不回滚 registry。

B0-C 也按兼容状态机发布：C0 把所有共享会话 Cookie 调用迁到 `AuthCookieService` 但仍只用旧名，同时冻结 legacy scope manifest；C1 所有服务实例升级为“v2 优先、旧名 fallback”后才切 writer 为 v2-only；C2 等待至少一个旧 refresh 最大 TTL 并确认旧名使用指标归零后删除 fallback。C1 以后日常回滚只能回到能读取 v2 的 C1 兼容版本，不能回到 C0/更早镜像；因此“独立回滚”是指不回滚 Origin registry，不承诺任意历史镜像仍能读取新 Cookie。

## 3. 多实例迁移、写栅栏与回滚

普通滚动发布不能安全切换：旧 Pod 仍写 JSONB，新 Pod 若写 registry 会形成永久漂移；但把所有租户一次性冻结又会把单租户配置问题放大为全平台故障。expand migration 因此采用“两级状态机”：单行 `tenant_public_origin_control.phase` 只表示平台总体处于 `legacy`、`migrating` 或 `registry`，每个 `tenant_public_origin_heads.source_state` 独立表示该租户处于 `legacy`、`frozen`、`registry` 或 `decommissioned`。禁止用进程缓存协调迁移。

数据库锁顺序是协议的一部分：global start/finalize 对 control 行取 `FOR UPDATE`；租户创建/删除、DOMAIN 写与单租户 Origin 命令先对 control 取 `FOR SHARE`，再对目标 head 取 `FOR UPDATE` 并做 revision CAS；涉及多个 hostname claim 时按规范化 hostname 升序加锁。`FOR SHARE` 允许不同租户并行，但会让 finalize 等待全部在途租户事务结束。任何事务都不得在持锁期间执行 DNS/TLS/provider 网络调用；verify 分为签发 challenge、事务外探测、写 verification 三段，最终写入重新检查 head revision/state digest。

- 全局 `legacy`：公共入口读取和旧管理写仍以 DOMAIN JSON 为准；新服务只做规范化与 observe，不长期双写。
- 全局 `migrating`：所有可服务实例已经理解两级状态。每个租户独立迁移：`legacy` 租户继续从旧配置读写；`frozen` 租户仍读旧配置但 DOMAIN 写返回 423；`registry` 租户只读写 registry，旧 DOMAIN 写返回 409；`decommissioned` 租户没有公共入口，相关认证 fail closed。
- 全局 `registry`：所有现存租户均已是 `registry` 或 `decommissioned`，运行时不再执行 legacy 解析；以后新租户直接创建 registry head，但在激活 public origin 前保持 provisioning 状态。

进入 `migrating` 前，部署 CLI 必须证明所有可服务实例都运行理解两级栅栏的兼容版本；Kubernetes 适配器检查所有可服务 Pod 的 release/capability，Docker/三机适配器检查声明的每个上游实例，readiness 本身不能证明版本一致。开始迁移的事务锁定 control，导入经验证的全覆盖计划，并为每个现存租户建立 head/source state，但不冻结任何租户。

O0 工具同时扫描全部现存租户与全部 legacy DOMAIN 行，生成事实 inventory、逐租户 legacy/依赖 digest、孤儿行摘要和全量 inventory digest，但绝不替操作者决定去留。运维人员依据 inventory/变更单为每个租户显式选择 `migrate` 或 `decommission`，并为无法关联现存租户的 legacy 行选择 `retire-orphan`；validator 再证明计划全覆盖：

- `migrate` 必须指定稳定租户 UUID、目标 staged origin 和后续验证责任；不能由 migration 猜 scheme 或域名。
- `decommission` 必须证明没有启用 SSO、外部回调、App Auth、OpenAPI/verification、消息链接或仍受流量的平台注册入口；有依赖时不能选。
- `retire-orphan` 只能用于确实无法关联稳定租户 UUID 的旧行；保存配置 id/code/configData 摘要和处置审计，不创建 head/version/claim。若仍有请求、回调或链接依赖该行，必须先人工关联/清理，validator 不允许直接退休。
- 计划开始时必须覆盖所有现存租户和每条 legacy 行；同一租户只有一个主结论，但其计划项要列出全部重复 legacy config id 并明确唯一目标值。迁移期仍允许其他 `legacy` 租户发生正常写入；因此冻结某个租户前只重算并校验该租户 digest。若已变化，必须显式更新该计划项和计划摘要，不能让无关租户变化使整批迁移永久失效。

在 global migrating 且 tenant source=legacy 时，旧 DOMAIN create/update/delete/toggle 仍写 legacy，但必须在同一事务把修改前后能关联到的所有 tenant head 按 UUID 排序加锁，清空其 planned digests、增加 head revision，并把被删除或改属的 disposition 标为 `superseded`；它不创建/更新 registry version 或 claim，因此不是双写。无法关联的新增/变更行成为未处置 orphan，只阻止最终 finalize。显式 update-plan 才能重新建立 current disposition 和计划摘要。tenant frozen 后所有旧 DOMAIN 写均为 423，避免 staged 与旧值再次分叉。

单租户迁移严格执行：`legacy -> frozen` 在一个事务中校验该租户计划/digest 并建立 staged/claim；冻结后修正网关、staged 和 provider 配置，再取得绑定 staged version/head revision 的短期验证回执；`frozen -> registry` 消费回执并只切换该租户事实源。任一步失败都只影响该租户，其他租户继续服务。尚未激活时可执行 `frozen -> legacy`，释放未引用 claim 并保留不可变版本/审计；一旦进入 tenant `registry`，就不再回退到模糊 legacy 解析，业务回滚必须重新 stage/verify/activate previous version。

迁移期间创建租户与 finalize 使用同一 control 行锁串行化：新租户自动得到 `source_state=legacy` 并进入待处置清单；删除仍须先 decommission。最终 `migrating -> registry` 事务只有在不存在缺失 head、`legacy/frozen` 租户、未处置/未审计的 orphan 或重复 DOMAIN 行、过期计划项时才成功。进入全局 registry 后，新租户直接为 `source_state=registry` 且 active 为空，所有依赖 origin 的能力 fail closed，直到完成正常 stage/verify/activate。

外部网关无法与数据库原子提交，因此每个租户的 verify/activate 必须持有该租户迁移锁，回执使用短 TTL；全局 finalize 不复用外部网络回执，也不批量切租户 active，只证明全部单租户切换已经完成。这是真实的一致性边界，不能写成“完全原子”。

普通平台后端发布只负责 O1 expand/兼容镜像，绝不自动开始迁移、冻结租户、激活或 finalize。O2/O3 使用独立显式命令和 receipt，避免一次日常小版本发布顺带切换认证事实源。逐文件和命令合同见 [租户公共 Origin v2 实施蓝图](./tenant-public-origin-implementation-blueprint.md)。

迁移开始后日常回滚只能到理解 `migrating` 与单租户 source state 的 O1 兼容版本；不能直接回到不认识新表的旧镜像。已激活租户不支持自动反投影到 legacy；越级灾难处置需要单独设计并演练，不属于常规发布回滚。

| 阶段 | 行为 | 发布条件 | 回滚单元 |
| --- | --- | --- | --- |
| B0-O0 诊断 | 目标镜像提供只读 JSON inventory/digest 和 plan validator，部署层补充真实网关检查；操作者显式编写全覆盖处置计划 | 列出结构、重复、规范化、scheme、全部依赖、legacy digest、逐行 migrate/decommission 和网关未验证项；工具未替人猜处置 | 删除诊断接线，无运行时影响 |
| B0-O1 expand/兼容 | 建 versions/heads/claims/verifications/audit/control；所有调用方接中央服务但 phase=`legacy`，记录差异；专用 UI 先只读 | 所有服务实例版本一致；代表性 1.x、SSO、游客、钉钉、App Auth、OpenAPI、消息无未知差异 | 回滚到 O1 前镜像；phase 仍 legacy，无事实源切换 |
| B0-O2 逐租户迁移 | 验证全覆盖计划后进入 global migrating；逐租户校验 digest、freeze、stage、网关/provider 修正、verify、activate 或 decommission | 每次只冻结目标租户；该租户事实源恰好一个；失败不影响其他租户；所有 receipt/claim/audit 原子一致 | 未激活租户可 abort 回 legacy；已激活租户只走 registry 版本回滚，不恢复模糊匹配 |
| B0-O3 全局收口 | 在所有租户均 registry/decommissioned 后原子 finalize global registry；旧读取动态投影，运行时删除 legacy 分支前先观察 | 双 Pod/三机、多虚拟主机、攻击向量、查询计划、完整 1.x/2.0 回归通过；无缺失 head/legacy/frozen/陈旧计划项 | 只回滚到理解 registry 的兼容版本；finalize 不批量切 active，因此不制造全平台业务回滚 |
| B0-C | Cookie Secure/host-only 迁移 | registry 稳定；双 scope 清理和全登录方式回归通过 | 不改 registry；C0 可回前版，C1 后只回到能读取 v2 Cookie 的兼容版 |
| B0-R | 收紧通用 callback 与 CAS return target | B0-O3 稳定且 preflight 仍全绿 | 前端、CAS 服务端分别独立提交和回滚 |

回滚不得恢复 `endsWith` / `includes` 或长期双写。某租户异常时可单独停用其 SSO 或修正入口，不能让全平台回到不确定租户解析。

## 4. 可证伪验收

- `school.example.com.evil.test`、父域、子域、大小写、尾点、Unicode/Punycode、userinfo、协议相对、反斜杠和控制字符不能命中其他租户。
- 两租户 claim 相同 hostname 时事务失败，即使 scheme/port 不同；同租户可 stage 同 hostname 的 HTTPS/端口变更。
- 两个管理员用相同 head revision 并发 stage/activate 只能一个成功，另一个得到 409；版本、head/claim 和同 revision 审计事件原子可见。
- HTTPS 页面配成 HTTP canonical origin 时 preflight 失败，CAS 不忽略 scheme；网关无法验证时为 `unverified`，不能进入 O2/O3。
- 普通别名的平台入口/认证请求在网关 308，平台日志中没有该别名认证请求；retirement host 只能得到清 Cookie/no-store/固定根入口跳转，ticket/code/query 不被转发；同主机非平台路径不受影响。
- 两个 Platform Server Pod 对同一输入返回相同 tenant/origin；配置提交后不等待本地 TTL。
- 混合版本实例存在时禁止进入 migrating；迁移期只冻结目标租户，其 legacy 写失败、staged 写不改变运行时、登录读取继续，其他租户读写不受影响；切换事务故障后该租户仍完整停留 frozen。
- staged 未验证、回执过期/已消费、目标租户 state digest/部署 release/网关声明摘要改变或网关处于 `unverified` 时 activate 必须失败；其他租户变化不会使该回执失效，active origin 保持不变。
- challenge 不能用于读取租户信息或建立会话；伪造 Host、重放 nonce、用浏览器主体写回执、TLS hostname 不符和 provider 证据缺失都不能得到可激活回执。
- 普通更新租户 code 返回 `TENANT_CODE_IMMUTABLE`，不会制造 Origin 与旧 code 依赖表分裂；未 decommission/删除 head 不能删除租户。删除后 hostname 继续被 decommission-hold 占用，version/audit 保留 UUID/code 快照，claim 清理到期后才能释放。
- 连续激活后每租户最多一个 previous active；旧 previous claim 被原子释放并审计。过期 previous 不能直接回滚，必须重新 stage/verify。
- registry 模式下旧 DOMAIN 读取返回动态兼容投影，旧写返回 409；legacy 行不随新写变化，证明没有长期双写。
- legacy 处置计划初始覆盖率为 100%，同时覆盖全部现存租户、重复行和 orphan 行；任意漏项、重复结论、未列全的重复 config id、带依赖的 decommission/retire-orphan 都阻止开始迁移；单租户 digest 变化只阻止该租户 freeze，显式刷新计划项后才能继续；只要仍有 legacy/frozen/缺失 head 或未审计 legacy 行就阻止全局 finalize。
- 代表性 1.x View、平台管理端、流程设计器、CLI browser auth、游客/钉钉、CAS、App Auth、OpenAPI/verification 和消息链接正向回归。
- 查询计划使用预期索引；超长输入查询前拒绝；日志不记录 ticket、code、Secret 或完整敏感 query。
- HTTPS v2 Cookie 带 Secure、`__Host-` 前缀且 host-only；共享会话消费者 v2 优先，协议 verifier 只复用 policy resolver；C1 切 writer 前没有不理解 v2 的可服务实例；C0 legacy scope manifest 摘要稳定，C2 前旧名 fallback 指标归零且已覆盖旧 refresh 最大 TTL。
- HTTP 部署没有显式 `insecure-http` 策略或声明协议与实际入口不一致时不能进入 C1；诊断不得因请求 Host 自动降级 Cookie 安全属性。
- hostname 变化后旧 host 在 retirement hold 期间清理旧 Cookie 并跳 canonical；hold 未到期不能转给其他租户，也不能激活第三个 hostname；回滚到当前 previous 时 claims 原子交换且仍只有一个 retirement host。
- B0-R 的跨域、双重编码和错误链路测试在 B0-O3 之后继续通过。

## 5. 明确不做

- 不在首期建设多 canonical origin、应用级自定义域名或任意外部 redirect URI。
- 不把 Nginx 配置变成租户身份数据库，也不让应用后端解析租户域名。
- 不长期双写 `default_configs` 与 registry，不用本地缓存协调迁移。
- 不把 Cookie policy 塞进 Origin 表，也不因 reference-environment 配置错误放宽安全合同。
- 不在 B0-C 首期支持跨子域共享 Cookie，也不把公开访问/存储 Cookie 迁进共享会话服务。
- 不顺带重写第三方 OAuth state、账号绑定、App Auth 或 2.0 Client Credentials；它们保持各自协议和发布边界。
