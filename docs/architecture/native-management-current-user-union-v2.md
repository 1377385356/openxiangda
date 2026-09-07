# ADR: Native Authorization Management Uses the Current-User Role Union

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：Accepted（2026-08-23）

## 1. 问题证据与能力所有者

OpenXiangda 2.0 的 Data API 已经由
`OpenXiangdaUserUnionAuthorizationV2Service` 按当前登录用户、目标应用和目标
环境解析全部有效 membership 的能力并集；但
`AppAuthorizationKernelV2Service.assertNativeManagementCapability` 仍要求请求携带
一个 `actorRoleSessionId`，并只验证该 session 绑定的一个 membership。管理 API 因而
把“当前用户能做什么”错误地收窄成“调用方选择了哪个角色会话”，也使没有 RoleSession
的真实管理员无法使用 instrument reference app 三角色管理面。

管理 API 已有唯一 owner：
`OpenXiangdaNativeAuthorizationManagementV2Service`、其 controller、
`AppAuthorizationKernelV2Service` 以及现有 membership/super-admin/relationship-grant
表。平台管理页已有 `/platform-management/openxiangda-v2` 和对应 API client，但还
没有角色成员和数据范围操作面。管理 mutation 当前还没有复用统一的同源保护。

本 ADR 的能力 owner 是平台 native authorization kernel 与 user-union resolver；
management service/controller 是唯一 HTTP mutation owner；平台前端只是该合同的
操作面。本轮不改变其他既有合同，但不得据此给应用开发者增加主动选择 RoleSession
的要求；current-user effective-role union 仍是 2.0 north star。

## 2. 决策与稳定不变量

1. 平台管理员和当前 active app super-admin 可管理。其他调用方只由当前登录用户在
   目标 tenant/app/environment 下的全部有效 membership 能力并集判断，不读取、选择或
   依赖 RoleSession。membership 必须同时满足 active 状态、当前时间有效、active Head
   绑定的 authz revision/version，且 package/manual capability 均来自该 revision。
2. `actorRoleSessionId` 可以作为 nullable 历史审计字段保留，但不再是 management
   capability 的必填输入、查询过滤条件或失败理由；没有 RoleSession 的请求必须与同一
   用户的 union 请求拥有相同授权结果。
3. management 请求必须使用明确的 environment context；UI/API 未提供环境时按公开合同使用
   `preproduction` 默认值，该默认值也会实际作为 `authorizationEnvironmentKey` 传递。普通
   membership capability 不得从任意环境、旧 Head 或当前选中 RoleSession 推导授权；若
   kernel caller 同时缺少 environment id/key，必须 fail closed。platform admin 与已经有效
   的 app super-admin 是 app-wide owner，
   可以直接判断 app-scoped super-admin grant，不因该 app-wide 操作强行伪造 environment；
   因而即使目标应用尚无 active Head，platform admin/app super-admin 仍可执行该 app-wide
   grant/list/revoke。普通 membership 则把默认或显式 environment 作为 kernel 的
   `authorizationEnvironmentKey`，由同一 union owner 解析一次 active Head 后判定能力；
   app-wide grant 的资源 owner 仍是无 environment 的现有 app-scoped 表。
4. active Head、active authz revision/version、package role 定义和 scope dimension
   catalog 是只读权威输入。平台可以展示 package roles 和 scope dimensions/valueSource，
   但不编辑包内角色定义；membership/scope grant 只写现有 kernel 表，不建立第二目录、
   第二状态源或 instrument reference app 特例。
5. scope value 的合法性只能复用 kernel 现有 active `valueSource` 校验和
   `native_resource` 权威查询；前端不复制规则，也不能以任意字符串绕过 active catalog。
   同一 management surface 提供有界、可搜索的 `GET /scope-values` 读取合同，按
   `dimensionCode` 从 active valueSource 查询 id/label；不允许自由录入 scope value。
6. scope dimension 的角色适用性由 active authz revision 中的 policy/rule/rule-role
   projection 计算，并由 catalog 与 membership mutation 共用同一个 kernel owner。没有
   rule-role 行的 rule 是 `allRoles`，因此也适用于手工角色；有 rule-role 行的 rule 只
   适用于列出的 package role code，不能把手工角色名伪造为 immutable rule projection。
   policy canonical definition 中的 `unrestrictedRoleCodes` 对列出的角色表示不使用该
   membership scope；它不是可写 grant。若一个目标角色没有任何适用 rule，表格必须显示
   “该角色不使用成员范围”；若有适用 dimension 但没有授权值，则显示“适用维度未配置
   授权值”。针对当前 active revision 不适用的 dimension grant，create 使用请求
   `roleCode`、update 使用锁定的当前 `role_code`，均稳定返回 400
   `OPENXIANGDA_NATIVE_AUTHZ_SCOPE_DIMENSION_NOT_APPLICABLE`，禁止留下未来 Head 可能
   意外生效的 dormant grant；空 operations 统一安全归一为 `['*']`。
7. 管理页面的用户选择必须复用现有 Directory service 的查询 owner。仅对
   `GET /directory/users?purpose=authorization-management` 这个受控 purpose，Directory
   owner 先以当前 tenant/app/environment 调用 management kernel 的
   `app:role:assign` union 判断（platform admin、active app super-admin 或有效 membership
   union），再执行同一有界用户查询、脱敏映射、分页和 Head 绑定；普通目录请求没有该
   purpose 时仍只接受原有 `app:<code>:directory:read` 或 app super-admin 语义。purpose
   不能改变查询 SQL owner、返回字段、分页上限、环境隔离或普通 directory:read 的授权
   语义；purpose 缺失时仍走普通目录语义，任何未知的非空 purpose 必须以稳定 400
   fail closed，不能静默降级或借用管理权限。
8. management mutation 复用现有同源 mutation guard（bearer 请求按既有 guard 规则处理），
   使用 UUID `operationId`、`expectedRevision` CAS、tenant/app/environment 隔离、
   `SERIALIZABLE` 事务、现有幂等/锁顺序和失败关闭行为。CLI 继续严格保持八个生命周期
   命令，不增加 authz 命令。

## 3. 受影响合同

### 3.1 Server management API

- 现有 `/openxiangda-api/v2/applications/:appCode/native/authz/management` 是唯一
  管理入口；保留 memberships、super-admins、relationship-grants 的 URL 和现有
  kernel mutation owner。
- 增加只读 `GET /catalog?environmentKey=preproduction|production`，返回当前 active
  Head/authz revision/version、package roles（code/name/capability projection）及
  scope dimensions（code/name/valueSource/有界可选值元数据/角色适用性 projection）。
  每个 dimension 的 applicability 至少包含 `allRoles`、`roleCodes`、
  `unrestrictedRoleCodes` 和按 policy 的 rules；catalog 缺少 active Head 或 revision
  时返回稳定的 fail-closed 错误，不返回旧版本。该 projection 不是 UI 装饰：server
  mutation 必须用同一 active revision 和同一 kernel owner 重新校验目标 role。
- 增加只读 `GET /scope-values?environmentKey=...&dimensionCode=...&keyword=...&limit=...&offset=...`，
  由 kernel 复用 active valueSource、data logical revision、物理资源标识校验和
  enabled/label 查询，返回有界 `{id,label}`；无效 dimension/source/resource 或跨环境
  value 失败关闭。
- memberships 的 list/create/update/revoke 使用显式环境（省略时为 preproduction），
  目录用户来自现有 `/directory/users` 权威 endpoint，并以
  `purpose=authorization-management` 请求受控管理用户选择；scope grants 的请求形状继续
  使用现有 kernel schema。页面可以根据 catalog 生成输入，但 server 必须再次校验。
- super-admins 的 list/grant/revoke 同样接受 `environmentKey`（省略时为 preproduction）
  作为普通 membership 的授权上下文；server/client 必须实际传递该值。grant/revoke/list
  仍只操作 app-scoped super-admin owner，不把 environment 写入资源表，也不要求 active Head
  来放行 platform admin 或已有 app super-admin。
- 既有分页上限（limit 1..100、offset 有界）和稳定错误 code/pointer 保持；CAS 冲突
  返回 409 并要求客户端刷新 revision/catalog，而不是重试覆盖。

### 3.2 Devkit 与前端

- devkit-core 的 native management client/application-services 不 bootstrap、switch
  或发送 `x-openxiangda-role-session-id`；其普通 Data/Workflow RoleSession 支持不在
  本轮删除。CLI 不新增 authz lifecycle command。
- 现有平台管理页增加“角色与数据权限”面：环境显式且默认 preproduction，选择
  production 显示高风险提示；package roles/catalog 只读；membership 支持列表、新增、
  更新、撤销；scope grant 输入由 catalog dimension/valueSource 生成；409 刷新当前
  catalog/list 后再由用户决定是否重试。

## 4. 失败、并发与安全边界

- 未登录、租户/app/environment 不匹配、无 active Head/authz revision（app-wide platform
  admin/active app super-admin bypass 除外）、无有效 union capability、membership 已撤销/过期、
  scope value 不在 active source 中，均失败关闭。
  管理 capability 缺失返回 403；跨站 cookie mutation 由现有 same-origin guard 拒绝；
  `expectedRevision` 不匹配返回 409；operationId 重放遵守现有幂等合同。针对目标 role
  不适用的 scope dimension、未来 Head 中可能被意外激活的 dormant grant，均返回稳定
  400 `OPENXIANGDA_NATIVE_AUTHZ_SCOPE_DIMENSION_NOT_APPLICABLE`；catalog 与 mutation
  的 role projection 不一致必须视为缺陷，而不是由前端忽略。
- list/read 使用现有只读事务；所有 membership/scope mutation 使用现有
  `SERIALIZABLE` pipeline，先解析 active environment/head，再执行 kernel assertion 和
  mutation；app-wide super-admin owner 对 platform admin/active app super-admin 可在无 Head
  时 bypass，普通 membership 则只通过 `authorizationEnvironmentKey` 由 union owner 解析
  一次。并发撤销、角色变更、Head/authz revision 切换不能产生跨 revision 写入。
- 请求分页、catalog dimension/value、directory users 和 JSON scope grants 均受现有
  kernel/API 上限约束；不得无界展开角色、用户或资源值。响应只返回有界 code、name、
  revision、pointer，不回显密钥、完整配置或敏感目录字段。
- cookie mutation 必须带同源上下文；bearer 认证继续遵守既有显式认证来源规则。平台
  production 入口仅在显式环境选择后可用并呈现警示，本轮不执行 production deploy。
- management-directory purpose 只扩大管理页面已有的 `app:role:assign` 判定，不扩大
  普通目录 capability；缺少 purpose 时走普通目录授权，未知 purpose、无环境或 Head
  不一致时不能借用管理权限，Directory owner 必须稳定 fail closed。

## 5. 影响范围、回滚与发布边界

- 允许改动：`sy-lowcode-platform-server` 的 kernel/management controller/service 与
  测试，`tools/openxiangda-v2` 的 devkit-core 与测试，以及
  `sy-lowcode-platform` 的既有 OpenXiangda v2 管理页/API client 和测试、本 ADR。
- 不新增数据库表、不修改 1.x、旧应用、instrument reference app 工作区或平台生产数据；不改变平台 closure
  verifier、Data API union 语义或其他现有合同；不得把其他合同解释为要求应用主动选择
  RoleSession；不部署、不 promotion、不 publish。
- 回滚边界是上述 server/devkit/frontend 代码版本及其测试/文档。没有 schema migration
  和持久化数据转换；回滚只恢复旧管理 API/client，不需要回滚 membership 数据。由于
  contract 是 additive 的，未完成前端发布时 API 仍必须保持 fail-closed。

## 6. 可证伪验收

1. 平台管理员、active app super-admin、以及分别持有多个 membership 的管理能力用户，
   在不发送 RoleSession header 时均可完成被授权 management read/mutation；union 取所有
   当前有效 membership，而非第一条或选中角色；平台管理员也能通过受控
   `authorization-management` directory purpose 选择用户，普通 directory:read 语义不变。
2. 无能力用户、已撤销或已过期 membership、旧 authz revision membership、跨 tenant/app/
   environment 请求均得到 403/稳定 fail-closed 错误；普通 membership 的 kernel caller 在
   同时未提供 environment id/key 时不能绕过环境边界，而 platform admin/active app
   super-admin 的 app-wide owner 判断可不依赖 active Head/environment。
3. catalog 返回的 Head/authz revision 与 active environment 一致；revision 切换后不
   展示旧 role/scope 定义；每个 scope dimension 的 policy-role applicability 与 kernel
   projection 一致，手工角色只匹配 `allRoles` rule，`unrestrictedRoleCodes` 角色不被
   要求配置 scope；scope-values 由 kernel active valueSource 有界搜索并返回，scope value
   由同一 kernel 校验，非法值或当前 role 不适用的 dimension grant 被拒绝。
4. 所有 cookie mutation 缺少同源证明时被拒绝；相同 operationId 遵守幂等；错误
   `expectedRevision` 返回 409，客户端刷新后才能继续；并发测试确认不跨 revision 写入。
5. devkit native management 请求不发送 RoleSession header，且 CLI 仍只有八个生命周
   期命令；现有普通 Data/Workflow RoleSession tests 继续通过。
6. server 相关单测/集成测试、devkit-core tests/build、platform frontend API/交互测试、
   type/lint/build 全部通过。任何身份、membership、directory 或远程环境缺失都必须在
   报告中标为未验证/阻塞，不得用 mock 或 platform-admin 成功冒充三角色验收。
