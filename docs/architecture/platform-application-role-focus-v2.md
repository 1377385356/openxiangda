# ADR: Platform-Owned Application Role Focus

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：Superseded（2026-08-23）

> 本文记录的“平台身份中心 + `union/focused_role`”方案已被
> [SDK、模板与 AI Skill 收敛决策](./package-skill-convergence-v2.md)替代。平台管理端与
> 浏览器应用都不提供角色切换；运行时使用当前登录用户应用角色并集。本文仅保留为已发布
> 错误 alpha 合同的审计材料，不得继续实现或作为兼容依据。

## 1. 问题证据与能力所有者

OpenXiangda 2.0 当前按登录用户在目标应用、目标环境中的全部有效
membership 计算权限并集，app super-admin grant 则直接产生 `*`。这个默认语义正确，
但一个同时拥有多个角色的用户无法主动验证或只以某个角色工作。instrument reference app 的三个真实角色
暴露了该缺口，但它不是 instrument reference app 菜单能力：角色目录、membership、super-admin grant、当前
登录会话和授权投影都由平台掌握，应用不能建立第二份角色状态。

平台 Header 已有旧平台角色切换入口，但它写入 `user_current_roles`，不识别 2.0
membership，不按登录会话隔离，也不能在 focused 状态压制 app super-admin bypass。
2.0 交互认证链路同时明确拒绝应用开发者选择 legacy RoleSession。因此两者都不能作为
本能力的 owner。

本 ADR 指定唯一 owner 为平台服务端的 OpenXiangda 2.0 current-user union resolver。
平台用户信息/身份中心是唯一写操作面；应用运行时只读取 effective authorization context，
instrument reference app 不维护角色列表、切换按钮或本地授权状态。

## 2. 决策与稳定不变量

1. 没有显式状态时为 `union`。union 使用当前用户全部有效 membership；若用户有 active
   app super-admin grant，effective capability 为 `*`。
2. 用户可以在自己实际持有的一个 package/manual role code 上选择 `focused_role`。
   focused 模式只保留该 role code 的所有有效 membership bindings 及能力投影；即使用户
   同时有 app super-admin grant，应用运行时的 effective `isAppSuperAdmin` 也必须为 false，
   不得绕过 role、row、field 或 action policy。
3. 状态键固定为 tenant、user、登录 session、app、environment。相同登录 session、app、
   environment 的标签页共享状态；新登录 session 没有记录，必然回到 union。production 与
   preproduction 绝不共享状态。
4. 角色分配仍由现有平台“角色与数据权限”管理面完成；身份中心只能在自己的有效角色间
   切换，不能借切换创建 membership 或 grant。平台控制面的管理权限始终按真实 grant/union
   判断，不受 focused 模式削弱，避免用户无法恢复 union。
5. 平台服务端状态是唯一 authority。BroadcastChannel/localStorage 只发送不含权限数据的
   `authorization-context-invalidated` 信号，促使同源运行时重新读取 current-user；它们不是
   授权凭据或状态源。
6. legacy `RoleSession`、`user_current_roles` 和旧 `/role/switch/app` 不参与 2.0
   effective authorization。应用代码和 instrument reference app 页面仍不发送角色 session/header。

## 3. 合同与 UI

平台用户信息中的“身份与角色”增加“OpenXiangda 2.0 应用身份”区：用户选择自己可访问的
应用与环境，看到 app super-admin 标记、实际持有角色、当前模式，并选择“全部应用角色
（默认）”或一个角色。角色名称来自 active authz catalog，不在前端或 instrument reference app 硬编码。

current-user 响应在现有 effective principal 外增加：

- `authorization.mode`: `union | focused_role`；
- `authorization.focusedRoleCode`: nullable role code；
- `authorization.availableRoles`: 有界 `{code, name}` 列表；
- `authorization.hasAppSuperAdminGrant`: 实际 grant，区别于 effective
  `principal.isAppSuperAdmin`；
- `authorization.contextRevision`: 用于 CAS 和运行时失效检查的单调 revision。

平台通过同一 current-user owner 的 mutation endpoint 提交
`environmentKey`、目标 mode/role 和 `expectedRevision`。相同目标是幂等成功；不同目标的
并发写以 409 失败并要求刷新。Data API、Directory、应用 API、AI/调用 token 等应用运行时
消费者必须使用同一个 effective projection；authorization digest 必须包含 mode、focused
role 和 context revision，使旧投影 token 失效。平台 AuthZ 管理 API 忽略 focused 状态。

Connected Dev 在本轮保持 union：它是显式的开发代理凭据生命周期，不是浏览器应用运行时，
且当前合同没有稳定的登录 session 标识。后续若要纳入，必须先单独定义 developer session
绑定和失效合同，不能猜测复用浏览器 cookie。

## 4. 持久化、失败、并发与安全

平台新增 SQL migration 管理 `app_user_authorization_modes_v2`：复合唯一键为 tenant/user/
login-session/app/environment，记录 mode、nullable focused role、revision 和时间戳；记录缺失
等价 union。login session id 只保存不可逆摘要，避免把 cookie/token 写入数据库。

切换 mutation 使用现有登录认证、tenant/app/environment closure、same-origin guard、
SERIALIZABLE 事务、行锁和 expectedRevision CAS。请求只能选择当前 active Head/revision 中
自己仍有有效 membership 的 role；role 数和返回列表设有上限，不返回 membership scope
细节。审计只记录主体、目标 app/environment、前后 mode/role、revision 和 request id，
不记录 cookie、token 或目录敏感字段。

focused role 被撤销、过期、从 active revision 删除或环境 Head 改变时，运行时必须以稳定
`OPENXIANGDA_AUTHORIZATION_FOCUSED_ROLE_STALE` 失败关闭，绝不能静默扩大为 union。
恢复 union 的自助 mutation 不依赖该 focused role 仍有效。认证缺失、跨 tenant/app/env、
越权角色、错误 expectedRevision、跨站 mutation 分别稳定返回 401/403/409；数据库不可用时
不得从浏览器缓存恢复权限。

## 5. 影响范围、回滚与发布边界

允许改动：平台 server 的 SQL migration/current-user resolver/controller/tests，平台管理
前端 Header/身份中心与 API client，以及 2.0 current-user 公开 contract、devkit/runtime
失效处理和本 ADR。instrument reference app 仅作为黑盒验证应用，不增加专用菜单或角色常量。

稳定 1.x、旧平台角色切换、其他 tenant 和 production 不改变。数据库改动是 additive；
回滚应用代码后新表无人读取，默认授权仍是既有 union。删除表不是回滚前提。发布按 server、
platform frontend、2.0 package 独立可回滚单元完成；本轮只允许 instrument reference app preproduction 验证，
不 promotion production。

## 6. 可证伪验收

1. 同一账号持有 instrument reference app 三角色和 app super-admin 时，union 显示三角色且 effective `*`；分别
   focused 到三角色后 effective super-admin 为 false，role/capability/binding 只包含目标
   role，row/field/action 行为与该角色一致。
2. 同一登录 session 的两个标签页在切换信号后重新取 current-user 并得到相同 revision；
   不同 app/environment 不受影响；退出再登录后默认 union。
3. 撤销当前 focused membership 后，instrument reference app 请求稳定失败关闭；平台身份中心仍能切回 union。
4. 无 membership 的角色选择被拒绝；错误 CAS 得到 409；跨站 cookie mutation 被拒绝；
   并发选择不同角色最多一个提交成功。
5. instrument reference app 源码不存在三角色硬编码或新的授权状态；旧 RoleSession header 仍被 2.0 交互路径拒绝；
   旧平台身份切换与 1.x 回归通过。
6. server migration verify、相关单元/集成测试、平台 lint/build、2.0 affected/release gate 和
   instrument reference app preproduction 三角色矩阵全部给出真实证据；任何一项缺失均不得声称闭环或 promotion。
