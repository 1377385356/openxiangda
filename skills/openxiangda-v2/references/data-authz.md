# Data API 与权限

授权由四层组成：页面/操作 capability、行谓词、字段 read，以及字段 create/update。前端只消费平台返回的最终访问结果来隐藏按钮、只读输入和剔除 payload；平台每次请求重新执行权威校验。

以下仅以仪器管理应用举例，不是平台默认模型或角色。该示例的行规则是：学校管理员不受行谓词限制；学院管理员按记录 `collegeId` 匹配；仪器管理员按 `instrumentAdminIds` 包含当前用户匹配。不要增加影子范围字段。

`collegeId` 是应用 `colleges` Native Resource 的记录 UUID。学院 scope dimension 通过
`valueSource.kind=native_resource` 绑定同一资源，选择器只展示平台按当前 membership 与
create/update 闭包返回的值。人员和部门保存平台目录真实 ID；部门不等于学院，也不能作为
学院范围的隐式来源。

字段策略支持 `read`、`create`、`update` 和 `mask`。显式空数组拒绝，能力数组采用 all-of。无权更新字段不仅 disabled，还必须从更新 payload 删除。

模型可声明 `audit: { read: false }`，禁止普通用户读取创建人、更新人、创建时间、
更新时间和变更历史；需要保留管理者查看时，使用
`audit: { read: ['app:your-app:audit:read'] }`，先在 `authz.capabilities`
声明该能力并授予相应角色，也可以直接引用已有的管理权限。审计策略只引用
能力，不会新建能力或改变其 catalog 所有者；引用缺失会在发布前失败。
省略沿用原有读取行为，`id` 与 `revision` 始终是协议字段。权限只控制读取，
不删除平台存储的审计事实。显式查询、筛选、排序、聚合、导出和历史接口同样
执行权限；标准详情页随受权元数据隐藏或显示变更记录入口。
能力数组沿用字段策略的 all-of 规则，字段与行权限必须来自同一个有效角色成员
授权。应用可信后端和现有超级管理员权限保持原有语义。使用该声明需要平台支持
`data.audit-read-access`，旧平台会在发布前拒绝。

```bash
pnpm openxiangda check
```

角色成员、维度授权和平台管理员由平台管理面维护，不属于应用开发 CLI。

### 授权来源声明

应用可以在 `authz` 中声明四类授权来源，让平台从业务数据投影出维度授权、应用角色成员和
行级关系授权；投影事实由平台物化并按当前配置重算，应用不维护第二份权限状态。各声明的
`userIdField` 等字段路径支持 `field`、`field.value` 和 `field.snapshot.<子字段>` 投影形式。

- `scopeDimensions`：`{ code, name, resourceCode?, valueType?: 'string'|'uuid',
  hierarchyMode?: 'flat'|'self_parent', valueSource?: { kind: 'native_resource',
  resourceCode, labelField, enabledField? } }`。定义数据范围的取值域；`valueSource` 把
  Native 资源绑定取值来源，选择器只展示平台按当前 membership 与 create/update 闭包返回的
  值；`self_parent` 表示取值记录通过父引用形成层级。
- `scopeSources`：`{ code, name, resourceCode, subject, grants, operationField?,
  enabledField?, effectiveFromField?, effectiveToField?, failureMode }`。从业务资源行投影
  维度授权：`subject` 为 `{ type: 'user', userIdField }` 或
  `{ type: 'role_membership', userIdField, roleCode }`，`grants: [{ dimensionCode,
  valueField, parentValueField? }]` 把行字段值授为对应维度；生效窗口和启用开关由字段控制；
  `failureMode: 'strict'` 投影失败即判定失败，`'last_known_good'` 在源数据暂不可读时沿用
  最近一次成功投影。
- `roleMembershipSources`：`{ code, name, resourceCode, userIdField, roleCode,
  enabledField?, effectiveFromField?, effectiveToField?, failureMode: 'strict' }`。从业务
  数据行授予应用角色，例如"成员表"一行代表某人拥有某角色。
- `relationshipGrantSources`：`{ code, name, resourceCode, subject, relationCode,
  targetResourceCode, resourceIdField, operations, enabledField?, effectiveFromField?,
  effectiveToField?, failureMode: 'strict' }`。通过业务关系授予目标资源上指定操作
  （1–20 个）的行级授权，例如"订单负责人可更新该订单"。

`authorizationTransitions: [{ fromAuthzDigest, removeRoleCodes?,
removeCapabilityCodes?, reason }]` 记录授权合同的关键收缩：从 `fromAuthzDigest`
（64 位十六进制）标识的授权版本移除角色或能力时，必须逐条声明并给出原因，平台在两个授权
修订之间核对覆盖情况后才放行发布；它不用于新增授权。

`authz.capabilities` 的完整形状是 `{ code, kind: 'backend' | 'ui', name, description? }`；
`kind: 'ui'` 声明页面级能力，`kind: 'backend'` 声明后端操作能力并配合
[按需后端](backend.md)的 `platformAccess` 使用。

自定义 PC/移动页面需要维护当前应用角色时，使用
`openxiangda/core` 的 `loadRoleManagementCatalog`、
`listRoleMemberships`、`searchRoleManagementUsers`、成员 mutation 与
role-management-grant mutation。应用/平台超级管理员可以把全部角色或明确的
目标角色集合委托给一个业务角色；普通业务管理者只有同时具备
`management.delegate` 时，才能把自己已有的目标角色和动作子集继续委托。
平台按当前用户角色并集重算，接口不接受 actor、tenant、active role 或
impersonation token。mutation 必须携带 UUID `operationId`、`reason`，更新/撤销还必须
携带最新 `expectedRevision`；409 后重新加载，不能猜 revision。使用前读取当前角色管理目录，详见[管理入口](administration.md)。

匿名外部访问不属于 RBAC 角色或 current-user 行策略。公开表单、续填、附件、重复校验和同一
浏览器的本人记录访问只通过[`frontend.publicAccess` 专用合同](public-access.md)开放；平台继续在
专用端点和 PostgreSQL/RLS 中强制匿名主体、字段、策略及提交回执边界。需要向外部发布目录、公告或
可用性列表时，使用同一合同的 `public.list`/`public.read` 与 `publicRecordFields`，明确绑定资源和
字段；`file`、`image` 和清洗后的 `text.rich` 可以公开，返回的托管文件引用只能通过匿名文件内容路由
读取，不暴露对象存储地址。子表字段必须在 `publicSubtableFields` 中再次选择子资源字段，例如：

```ts
publicRecordFields: ['name', 'cover', 'description', 'items'],
publicSubtableFields: { items: ['sku', 'quantity'] },
```

子表只支持一层、固定子字段和有界行数；嵌套子表、签名字段、未声明字段都会在编译或运行时拒绝。
公共读取不需要 `draft`，不继承角色权限，也不开放普通 Native Data API、where、排序、聚合或导出参数。
普通 Native Data API 的 `select`、`where`、批量、聚合和导出输入只适用于已认证用户或应用后端；把它暴露给匿名
浏览器会产生资源/字段枚举、条件推断、查询放大和文件 ID 猜测面。公共端点可以复用 Native RLS 和文件
绑定校验，但必须保留固定资源、固定字段、固定排序和固定分页的较小输入面。

数值边界直接声明在字段上，`min`/`max` 为闭区间，并且只允许用于
`number.integer` 和 `number.decimal`。跨字段约束声明在资源的
`invariants` 中；每条约束只能比较同一记录的两个已声明字段，最多 20 条，
由平台在 create/update/increment 的最终候选记录上统一执行。

```ts
{
  code: 'sessions',
  name: '场次',
  fields: [
    { code: 'startAt', type: 'datetime', label: '开始', required: true },
    { code: 'endAt', type: 'datetime', label: '结束', required: true },
    { code: 'capacity', type: 'number.integer', label: '容量', min: 0 },
    { code: 'occupied', type: 'number.integer', label: '已占用', min: 0 },
  ],
  invariants: [
    { code: 'time-order', expression: { leftField: 'startAt', operator: 'lt', rightField: 'endAt' } },
    { code: 'capacity-not-exceeded', expression: { leftField: 'capacity', operator: 'gte', rightField: 'occupied' } },
  ],
}
```

`date-range` 与 `datetime-range` 必须显式声明 `rangeBoundary`，取值为 closed 或 half-open。选择半开区间 `[start, end)` 时相邻时间段不冲突；闭区间端点相接可能重叠。

业务 uuid 字段与系统 id 不同：可选业务 UUID 省略时为空，必填字段需调用方提供合法值，平台不会替业务 UUID 自动生成默认值。

业务分派需要目标人员具有指定角色时，使用[事务中的角色条件](backend.md#role-member)，
由平台在写入事务中核对当前有效成员。候选查询、页面隐藏、应用管理员身份和历史
角色列表都不能替代这一规则，也不应在应用中复制一份权限状态。
