# 多组织与家校目录

教育局与多所学校各有独立钉钉企业、同一教师属于多个组织、家长的孩子在不同学校时，优先复用平台的组织与身份基础能力。应用不再建立第二份企业组织树、钉钉身份库或学校密钥配置。

本专题描述 2026-10-14 的源码契约基线。组织基础、本人目录角色事实读取、SDK 组织切换、目录事实到应用角色的投影及 Native 组织行边界已有配套实现。目标站点是否部署了这些接口，需现场核实；安装新工具或读到本专题不证明平台已经升级。

## AI 识别场景与选择能力 {#scenario}

遇到以下需求，先读本专题，再结合[数据与权限](data-authz.md)和[按需后端](backend.md)设计应用：

- 上级机构管理多个拥有独立钉钉企业的下级机构，例如教育局与学校。
- 一个企业三方应用安装到多个企业，统一同步普通通讯录和家校通讯录。
- 同一个人以不同组织身份进入同一应用，或在同一会话中切换学校。
- 使用教师、学生、家长、班主任来源身份及班级管理范围。
- 下级业务数据隔离、上级按授权看后代数据、上级发布下级可见的公共内容。

先识别“平台已经维护的事实”和“应用希望赋予的业务权限”。不把教育局、学校、作业或公告写成平台固定模型。用户已说明的组织归属、角色和权限意图直接沿用；技术接入缺口记录为平台依赖，不让用户重新设计一套身份体系。

## 平台负责什么与当前可用程度 {#availability}

| 能力 | 当前源码状态 | AI 可以据此做什么 |
| --- | --- | --- |
| 真实企业组织、单父树、最多三级 | 已实现平台注册与查询 | 复用平台 `organization.id`、`corpId`、父级和祖先路径，不以部门替代企业组织 |
| 预开通与企业三方安装匹配 | 已实现显式 reconciliation；匹配后激活 | 由有权限的管理端预开通，核对真实企业名称；业务应用不保存各校 appSecret |
| 普通/家校目录同步投影 | 已实现主体、成员和来源角色事实存储 | 以平台同步事实为身份来源，不自行抓取后再维护一套通讯录 |
| 当前人的可切换组织 | 已有平台会话 HTTP 与 `loadCurrentOrganizationMemberships()` | 读取本人活动成员列表，显示对应企业/学校选项 |
| 当前工作组织、同会话切换 | 已有平台登录上下文、SDK `activeOrganizationId` 和 `switchCurrentOrganization()` 生命周期 | 在支持本契约的会话中读取/切换；不能从 URL 直接产生授权 |
| 组织管理授权 | 已实现平台管理员授予人/部门，祖先授权覆盖后代 | 管理操作由平台核验；不能把“教育局成员”当作“全区管理员” |
| 应用角色 `self` / `subtree` | V2 声明、组织维度角色绑定和实时 SQL 准入已接通 | 声明每个角色的覆盖意图；旧应用未声明继续沿用原行为 |
| 家校事实到应用角色、班级范围的消费 | `authz.directoryRoleSources` 由平台投影到应用角色和字符串 scope | 使用真实来源角色事实，目录派生绑定不能手工覆盖；事实退休立即拒绝旧投影 |
| 组织数据归属、隔离、后代可见与内容下发 | `organization.mode=owned/inherited-down`、不可改归属及 RLS 已实现 | 声明策略并核验目标站点的配套能力，按真实组织角色验收允许和拒绝 |
| 安装回调、每校自动定时同步、组织通知路由与链接生成 | 尚未完成整条自动接入 | 不假定安装完成后立即能登录，不假定消息自动选中正确安装 |

平台管理组织的授权与应用业务授权是两种事实。能开通学校或查询组织树，不会自动获得该学校的业务数据权限；看到一条成员关系，也不会自动成为应用管理员。

## 可直接取得的组织与会话信息 {#http-contracts}

以下是已实现的服务器 HTTP 契约，不是新增 SDK 导出或独立 MCP 工具。调用前确认目标站点版本、当前平台会话及其访问范围。开发期回环代理未覆盖这些路径时，不能自行把凭据放进 URL 或另建登录代理。

### 本人的可切换组织

`GET /openxiangda-api/v2/platform/organizations/me/memberships`

成功响应为 `{ code: 200, message, data: [...] }`。服务端只返回当前租户、当前用户的活动成员，并要求组织及安装均为 `active`；它不是所有学校列表，也不代表应用角色授权。空数组表示当前没有符合条件的成员，不能据此猜测一个 `corpId` 或创建成员。

每项包含：

| 字段 | 可直接使用的信息 |
| --- | --- |
| `membershipId` | 平台成员关系 ID |
| `organization.id` | 平台组织 ID，区别于钉钉 `corpId` |
| `organization.tenantId`、`provider`、`corpId` | 所属租户、来源提供方和真实企业标识 |
| `organization.name`、`providerName` | 平台名称及安装匹配时记录的企业名称 |
| `organization.parentId`、`level`、`ancestorIds` | 平台维护的父级、层级与祖先路径 |
| `organization.status`、`activatedAt` | 组织活动状态及激活时间 |
| `organization.installation` | 安装 ID、suiteKey、状态、agentId、授权 scopes、authorizationRevision 等摘要；没有密钥/token |
| `source`、`profile` | 成员来源与同步资料；profile 是可空的来源快照，不是能力或角色授权结果 |

最小只读示例，运行在已经验证支持此接口的同源平台会话中：

```ts
const response = await fetch(
  '/openxiangda-api/v2/platform/organizations/me/memberships',
  { credentials: 'same-origin' },
);
const result = await response.json();
if (!response.ok || result.code !== 200 || !Array.isArray(result.data)) {
  throw new Error(result.errorCode || '组织成员信息读取失败');
}
const organizations = result.data.map(item => ({
  membershipId: item.membershipId,
  organizationId: item.organization.id,
  corpId: item.organization.corpId,
  name: item.organization.providerName || item.organization.name,
}));
```

应用优先使用 `openxiangda/react` 的 `loadCurrentOrganizationMemberships({ signal })`，复用平台会话、读取取消和组织切换失效。上面的 HTTP 示例仅用于解释原始契约。

### 当前工作组织

- `POST /api/auth/profile` 返回 `data.activeOrganizationId`，没有工作组织时为 `null`。它是平台会话 profile 接口，不能误写为 GET。
- `GET /openxiangda-api/v2/applications/{appCode}/native/authz/current?environmentKey={preproduction|production}` 的原始成功响应，在已有工作组织时包含 `data.environment.activeOrganizationId`；有活动应用授权时也包含 `data.principal.activeOrganizationId`。无组织时不包含这些可选字段；`state=unassigned` 时 principal 为 `null`。
- `GET /openxiangda-api/v2/platform/organizations/context?corpId=...` 的 `data` 是活动组织 ID 字符串；尚未启用组织注册的传统租户返回 `null`。这个接口只解析租户内组织及安装状态，不证明调用人是成员，不会切换会话，也不授予权限。

配套 SDK 的 `RuntimeIdentity`、`useOpenXiangdaRuntime().identity`、Nest `@CurrentUser()`/`OpenXiangdaCurrentUser` 与 NativePrincipal 保留可选 `activeOrganizationId`。缺失表示没有工作组织，不产生默认学校。浏览器验证 principal 与 environment 的组织一致；Nest 只取已验证平台 principal，不从前端 body/header 产生可信用户上下文。Connected Dev 会话绑定组织，切换后旧会话拒绝沿用；本人事实读取不提供管理授权。

### 同一会话切换组织

平台会话原始接口仍为 `POST /api/auth/organization/switch`，JSON body `{ "organizationId": "平台组织ID" }`；成功更新同一会话的 cookies。原始响应含认证 token，只供平台自己的认证处理，不把它持久化到应用。

V2 应用使用 `openxiangda/react` 的 `switchCurrentOrganization(organizationId)`：

```ts
import { loadCurrentOrganizationMemberships, switchCurrentOrganization } from 'openxiangda/react';
const memberships = await loadCurrentOrganizationMemberships({ signal });
// 选项来自 memberships，organizationId 是选择值，权限仍由服务器核验。
await switchCurrentOrganization(memberships[0].organization.id);
```

SDK 通过应用 `/auth/organization/switch-surface` 取得真实浏览器会话的 CSRF，再调用 `/auth/organization/switch`。该面只接受当前租户的合法浏览器 cookie、同源请求与 CSRF；CLI 开发 bearer、body 的 userId 或伪造 ctx 不能替代浏览器用户。平台仍核验目标活动组织、安装和成员，并保持同一登录会话；返回给应用的 receipt 不含 token。开发预览需要正常浏览器登录；缺少浏览器 cookie 会被拒绝，不退回开发者身份执行切换。

成功、运输结果未知或服务器 5xx 时，SDK 失效旧授权、命令缓存和在途读取，通过 Runtime identity epoch 重读并重建页面。旧学校晚到的响应不会覆盖新学校数据。跨页只发送失效信号，不传身份或凭据；明确 4xx 拒绝保留原授权。切换写入不自动重放；结果未知先读回当前授权，不能把目标名称当成成功。组织切换不选择应用角色，也不是只收窄读取的 Perspective。

角色与数据隔离通过下面的显式声明启用；切换后的角色列表或字段传递仍不能替代实际行权限验收。

### 管理面接口

`/openxiangda-api/v2/platform/organizations` 下的开通 `/open`、安装 `/installations/reconcile`、管理授权 `/admin-grants`、成员 `/memberships/upsert`、目录主体 `/directory/subjects/upsert` 和事实 `/directory/role-facts/upsert` 是平台管理/同步修复入口。

平台管理员可管理全树；获得组织管理授权的人可在被授予节点及后代内进行获准的组织管理操作。授予、撤销管理授权及目录修复要求平台管理员。`GET /openxiangda-api/v2/platform/organizations/` 返回调用者可管理的组织；普通成员列表仍使用 `/me/memberships`。业务应用不调用 upsert 建立权限，不通过遍历管理接口读取其他学校的人员资料。

## 平台已有的家校角色与范围事实 {#directory-facts}

平台将普通通讯录与家校通讯录作为不同来源投影：`dingtalk_directory`、`dingtalk_school_contact`。目录主体以组织、来源和 `sourceUserId` 隔离；同一个来源 userId 或班级 ID 在两个学校出现时，不会变成同一学校内的事实。

| 来源角色 code | 含义 | 来源范围 |
| --- | --- | --- |
| `teacher` | 家校目录中的教师 | 对应班级事实 |
| `head_teacher` | 家校目录标记的班主任 | 可有多个班级事实；没有来源标记就不推断 |
| `guardian` | 家长/监护人 | 对应学校与班级事实 |
| `student` | 学生 | 对应学校与班级事实 |

家校角色事实使用 `scopeType: 'class'`、`scopeValue: <来源班级ID>`。这是来源事实，不是应用 Native Resource 的记录 UUID；应用业务班级模型需要明确映射，不能将其直接塞入要求平台记录 UUID 的关系字段。班主任 A、B 两个班级是两个范围事实，不能只保存一个“班主任=true”。同一人在普通目录、家校目录、多个学校的资料分别保留来源与组织维度。

平台使用真实钉钉 `unionId` 识别可关联的跨企业用户。`unionId` 受开放平台账号范围约束，应用不以姓名、手机号或用户自填字段合并身份，也不将它当所有平台的全局主键。缺少 unionId 的学生仍有平台目录主体 ID，不伪造 provider unionId；登录用户使用平台 `userId`。来源用户 ID、目录主体 ID、登录用户 ID 和组织成员 ID 不能混用。

本人角色事实接口为 `GET /openxiangda-api/v2/platform/organizations/me/directory-role-facts?limit=100&after=<cursor>`，`limit` 为 1..200，`after` 为上一页 `nextCursor`。只返回当前租户、工作组织、当前用户的活动事实；无工作组织返回 409 `PLATFORM_ORGANIZATION_CONTEXT_REQUIRED`。安装、成员、主体与事实状态由服务器重新校验；不返回 raw 或 unionId。

SDK 使用 `loadCurrentDirectoryRoleFacts({ limit, after, signal })`，返回 `DirectoryRoleFactPage`，包含 organizationId、userId、items、nextCursor。每个 item 包含 id、subjectId、source、roleCode、scopeType、scopeValue。客户端拒绝与当前 identity 不同组织/用户的响应，并在组织变化时丢弃旧读取，不自动拉取全部页面。

读取来源事实不授予应用能力。使用下面的 `directoryRoleSources` 声明由平台派生角色及班级范围；不能以管理 upsert 或复制应用通讯录替代。

## 应用角色与数据边界 {#authorization}

应用通过显式声明启用组织能力；编译器自动生成 `authz.organizations`、`authz.directory-roles` 和 `data.organizations` 的最低能力要求。目标平台不支持时拒绝激活，不能手改生成契约绕过协商。

```ts
authz: {
  roles: [
    { code: 'teacher', name: '教师', organizationReach: 'self', capabilities: teacherCapabilities },
    { code: 'bureau', name: '区管理人员', organizationReach: 'subtree', capabilities: bureauCapabilities },
  ],
  scopeDimensions: [{ code: 'class', name: '班级', valueType: 'string' }],
  directoryRoleSources: [{
    code: 'teachers', name: '家校教师事实', source: 'dingtalk_school_contact',
    roleFactCode: 'teacher', roleCode: 'teacher', failureMode: 'strict',
    scopes: [{ dimensionCode: 'class', scopeType: 'class', operations: ['read', 'create', 'update'] }],
  }],
},
data: {
  resources: [{ code: 'assignments', name: '作业', organization: { mode: 'owned' }, fields: assignmentFields }],
},
```

上例省略了应用自己的操作能力与班级行策略定义；`teacherCapabilities`、`bureauCapabilities` 和 `assignmentFields` 是应用变量，并非平台内置对象。班级字段保存真实来源字符串 ID，通过原 dataPolicy 的 `class` 维度核对。来源字符串不能绑定 Native UUID 维度、valueSource、resourceCode 或组织树层级。

| 声明 | 语义 |
| --- | --- |
| `role.organizationReach = self` | 绑定在授予组织，只在该工作组织生效 |
| `role.organizationReach = subtree` | 绑定在授予组织，在该组织和活动后代生效；不自动授予操作能力 |
| `resource.organization.mode = owned` | 创建时记录归属可信工作组织。self 只操作本组织；subtree 可在其获准树内结合行策略操作 |
| `resource.organization.mode = inherited-down` | 同 owned，额外允许获准角色读取工作组织的祖先内容；下级不能修改祖先内容 |
| 未声明或 `none` | 沿用原无组织行为，不产生组织隔离 |

角色的操作能力、字段能力、组织 reach 和班级行范围必须在同一条 membership 中成立。不能合并多个组织的班级范围，不能用 subtree 角色的组织范围借用另一角色的班级范围。上级普通成员没有 subtree，共享 unionId 也不合并各校授权。目录映射角色只能 self，不能与 Native roleMembershipSources 争用同一角色。

目录源最多 32 个，每个源最多 16 个 scope；每次当前人、工作组织最多 512 个不同事实。超限、源失效、手工 shadow 冲突和更新锁竞争失败关闭；无变化的投影不更新 membership 或权限版本，也不与当前事务自己的角色锁冲突。目录派生绑定稳定且分组织，原始目录仍只有平台一份。本人读取不返回 raw 或 unionId。没有工作组织时，启用了目录映射的当前授权请求返回 `OPENXIANGDA_CURRENT_USER_ORGANIZATION_REQUIRED`。

手工给非目录角色授权使用现有 Native membership 管理面及 `createNativeRoleMembership`，新增可选 `organizationId`。组织角色必须明确目标，目标用户须是同租户活动安装的活动成员；平台管理员或应用管理员可管理。已有委托管理没有组织覆盖契约，不能扩大为跨校授权。更新不能换组织，目录派生角色的 create/update/revoke 均返回平台所有权拒绝。传统无组织角色不需要该字段。批量 create 也支持组织维度；重复目标以 user/role/organization 核对。

组织归属是平台保留列 `organization_id`，不是业务字段。创建从可信当前用户派生，更新不可修改；历史 NULL 归属不会自动推断或回填，组织资源也不会放行。唯一键按组织分区；父子表需要同样的组织策略，复合外键防止跨组织关联。已启用资源不能通过下一版本移除组织策略来开放历史数据。

列表、直接 ID、聚合、导出及关联通过同一 Native RLS。命名 Nest 业务动作保留经过验证的当前用户/组织，继续核验短期调用证明、动作能力与同一 membership 的变更前后行范围。业务输入不能填充可信组织；没有当前用户证明的普通 application、后台或定时身份不获得组织资源权限。声明策略不自动授予服务身份全区访问。

组织上下文请求实时核对目录与成员，当前暂不使用授权快照缓存。fresh 和事务请求均不读取或保存未提交快照；Head 在准备期间变化要求刷新。安装、成员、账号、主体或事实撤销后，数据库下一条语句即拒绝。源码和独立 PostgreSQL 测试不证明目标站点已经部署，也不代表真实教师/家长验收。

## 入口、同步与通知的处理边界 {#entry-sync}

工作台和通知链接尽量携带 `corpId`，作为选择组织的线索。必须由平台登录流程、活动安装和成员事实验证；`corpId` 不能证明发起人属于该校。无法确定组织时使用服务端本人成员列表供选择，多校家长或同时在上级和学校任职的人都适用。

组织已开通但尚未安装，或安装已匹配但成员尚未同步，均不等于用户已获得应用访问权限。提示“账号信息尚未同步，请稍后再试”等状态可以使用实际平台结果，不能假装登录成功。自动安装事件、逐组织定时同步、应用可触发的有界同步请求尚未接通，不应在应用里开启无界轮询或用管理员凭据调用修复接口。

平台组织 registry 支持每企业安装信息，但尚未完成 Notification Hub 按目标组织选择安装、corp-bound 详情链接的完整接入。消息到人、消息点击进入正确学校和该用户有业务权限是三个独立条件，需分别验收；不能仅凭 unionId 就认定通知会路由到正确学校。

## 开发前核对与验收 {#verification}

1. 用项目锁定版本的 `context --json` / MCP `workspace_context` 确认平台绑定；用 `docs multi-organization` / `docs_read` 读取同版本正文。通过实际 `platform_capabilities` 核对配套声明的能力 code 和最低版本，不能把文档可读当成站点可用。
2. 确认目标站点的源码/部署版本、正式 SQL 迁移与组织管理授权。资料版本、接口状态和实际启用分别记录；站点缺能力由平台维护者补齐，应用不自行执行迁移或发包。
3. 在测试组织核实本人成员列表、真实企业名称、活动安装、profile/原始授权组织字段，验证同会话切换与非成员拒绝。不以单次 HTTP 200 代替响应 `code` 和业务事实。
4. 使用家校角色前，确认平台已经提供可消费的事实读取及映射契约；使用 `self/subtree` 前，确认 V2 声明、可信上下文和服务端数据边界均已实现。未闭合就标记依赖，不能报告自动隔离通过。
5. 最终组织业务验收覆盖同一人多组织、同一来源 ID 跨校、教师/家长来源区分、班主任多个班级、无 unionId 学生、同步未完成、错误 corpId、无权限上级成员和学校之间越权拒绝。只测统计页正常展示不能证明这些边界。

专题可用章节为 `scenario`、`availability`、`http-contracts`、`directory-facts`、`authorization`、`entry-sync`、`verification`。MCP 可按 `docs_read({ topic: 'multi-organization', section: 'http-contracts' })` 只读相关部分，资料 URI 为 `openxiangda://docs/multi-organization`。资料升级与 Skill/MCP 刷新方式见[版本升级](upgrading.md)。
