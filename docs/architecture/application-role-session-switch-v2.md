# ADR: Application-Local Single-Role Switching

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

> **SUPERSEDED / 历史 alpha 证据（2026-08-25）**：当前产品已由
> [SDK、模板与 AI Skill 收敛决策](./package-skill-convergence-v2.md)改为当前登录用户
> 全部应用角色并集，并从公开 Runtime、Gateway、Nest facade 和平台路由删除 RoleSession。
> 本文不得作为当前实现、Skill 或验收依据。

状态：Superseded（2026-08-25）

## 1. 问题证据与能力所有者

已发布的 alpha 实现把 OpenXiangda 2.0 应用角色放进平台管理端 Header 的“身份与角色”
抽屉，并新增 `union/focused_role`、应用/环境选择和
`app_user_authorization_modes_v2` 状态。实际产品入口却是每个应用自己的个人菜单：用户只需
在当前应用里选择自己持有的一个应用角色。平台抽屉让用户离开应用才能切换，也让
current-user union resolver 与既有 Native RoleSession 同时拥有当前角色，形成第二套身份
状态、第二个 mutation 合同和不同的超级管理员语义。

平台现有 `role-session/context`、`role-subjects` 和 `context/switch` 已经以 membership、
应用最高管理员主体、登录会话、应用和环境为唯一事实源，并提供 expected RoleSession CAS、
失效关闭和有界角色目录。本轮不新增身份内核：OpenXiangda Platform 继续唯一拥有 Principal、
membership、RoleSession 和最终授权；标准 Vite 应用壳只拥有当前应用个人菜单的展示与交互。

## 2. 决策与稳定不变量

1. 发布态交互用户在一个 `tenant + login session + app + environment` 中恰好使用一个
   active RoleSubject。普通 membership、应用最高管理员和未来平台保留主体都通过同一 opaque
   `subjectKey` 选择；客户端不能提交 role code 伪造主体。
2. 多角色不合并。切换角色会建立新的 RoleSession，并完整替换 capability、行范围、字段
   权限和应用后端调用上下文。应用最高管理员是可选择的独立主体；切换到普通角色后不得继续
   保留最高管理员 bypass。
3. 角色切换入口只存在于当前应用的个人菜单。平台管理端只负责角色、membership、范围授权和
   最高管理员 grant 的管理，不展示或修改某个应用的当前 RoleSession。
4. 业务页面只读取 `currentUser/currentRole/capabilities`。标准 platform client 在内存中持有
   opaque RoleSession id，并为 Data API、Directory 和 App API 自动携带请求头；应用源码、
   localStorage、sessionStorage、URL、日志和业务响应不得保存该 id。
5. 当前 RoleSession 由平台 context endpoint 恢复。首次有多个可选主体且没有有效偏好时，
   应用内显示阻塞式角色选择；只有一个主体时可自动激活。切换后身份 generation 递增，旧请求
   和旧页面结果不得回写。
6. Connected Dev 仍使用开发者会话的有界角色联合投影，本轮不伪造远端登录会话或把发布态
   RoleSession 带入本地。发布态 instrument reference app 是应用内角色切换的黑盒验收载体。
7. `union/focused_role`、authorization-mode mutation、跨应用/环境选择器和浏览器授权并集
   fallback 全部删除，不保留 alpha 兼容分支。旧 SQL migration 是已发布历史，代码停止读写
   其表；物理 DROP 只在回滚窗口结束后作为独立迁移执行。

## 3. 合同与交互

标准客户端只消费既有平台合同：

- `GET .../native/authz/role-session/context?environmentKey=...`：恢复当前上下文；
- `GET .../native/authz/role-session/context/role-subjects?...`：分页读取可选主体；
- `POST .../native/authz/role-session/context/switch`：提交
  `targetRoleSubjectKey + expectedRoleSessionId + environmentKey`；
- Data API、Directory 与 App API 请求自动携带
  `x-openxiangda-role-session-id`。

个人菜单展示平台返回的角色名称、说明和范围摘要，不硬编码 instrument reference app 的校级、学院或仪器角色。
当前角色行是明确的菜单动作；有多个主体时打开应用内角色选择弹层。切换成功后关闭弹层、更新
头像菜单、重建页面权限和数据查询；失败保留当前角色并显示可恢复错误。

## 4. 失败、并发、安全与资源边界

- RoleSession context 缺失、无可用主体或平台响应不完整时 fail closed，不能回退到权限并集或
  把错误伪装成空数据。`unassigned` 提示联系应用管理员；`selection_required` 只允许先选角色。
- switch 使用服务端 SERIALIZABLE 事务和 `expectedRoleSessionId` CAS。409 后客户端重新读取
  context，绝不自动重放到另一个当前主体；相同目标由平台幂等处理。
- 同一登录会话的其他标签页只接收不含权限和 session id 的失效信号，再从平台读取新 context。
  旧 RoleSession 请求稳定失败，客户端推进 generation 并丢弃迟到响应。
- 角色主体首屏最多 20 条，更多结果使用平台 cursor；UI 不下载 membership scope 明细，不允许
  从浏览器 role code、名称或缓存推导授权。
- 浏览器 mutation 使用现有 Cookie、同源校验和 CSRF 边界。RoleSession id 只存在于进程内存和
  同源请求头，不写持久存储或可观察 URL。

## 5. 影响范围与回滚边界

允许改动仅覆盖 2.0 平台 server 的交互用户入口、标准 Vite 模板/公开合同、平台 Header 中的
错误身份中心以及 instrument reference app preproduction 验收。平台授权管理仍可按当前用户全部管理能力判断谁能
分配角色；Connected Dev 保持独立开发凭据语义。1.x 应用、旧平台角色、其他租户业务数据和
production AppVersion 不在本轮范围。

上线顺序必须先发布支持 RoleSession 的工具链与 instrument reference app AppVersion，再切换平台 server 删除无
RoleSession 的浏览器 fallback；切换前枚举并重建仍消费 `/native/current-user` 的 2.0 alpha
应用。回滚单位是平台 server 版本、平台前端版本和具体 AppVersion；旧 authorization-mode 表
在回滚窗口内保留但无人读写，不用 schema 回滚才能恢复上一版本。

## 6. 可证伪验收

1. 同一 instrument reference app 用户持有校级、学院、仪器管理员和应用最高管理员时，个人菜单列出四个主体；每次
   切换后 Principal 只有一个 active role，普通角色下 `isAppSuperAdmin=false`。
2. 校级、学院、仪器管理员分别通过既有 CRUD、行范围和字段权限正反例；缺少或使用旧
   `x-openxiangda-role-session-id` 的 Data/App/Directory 请求失败关闭。
3. 两个标签页切换不同角色时 CAS 最多一个成功；另一个标签页收到失效信号后读取相同当前
   context，旧请求不能覆盖新角色页面。
4. 首次多角色用户只能在应用内完成初始选择；无角色用户看到明确未分配状态。角色被撤销、
   过期或 Head/authz revision 变化后不会扩大为联合权限。
5. 平台 Header 不再出现“OpenXiangda 2.0 应用身份”，源码与公开合同不存在
   `focused_role`、authorization-mode mutation 或应用身份跨环境选择器。
6. 平台 server 相关单元/集成测试、migration verify、工具链 `pnpm verify:affected`、模板
   check/test/build/Chromium 和 instrument reference app preproduction 浏览器矩阵全部通过；缺任一证据不得发布或
   promotion production。
