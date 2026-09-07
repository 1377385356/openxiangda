# Data API 与权限

授权由四层组成：页面/操作 capability、行谓词、字段 read，以及字段 create/update。前端只消费平台返回的最终访问结果来隐藏按钮、只读输入和剔除 payload；平台每次请求重新执行权威校验。

以下仅以仪器管理应用举例，不是平台默认模型或角色。该示例的行规则是：学校管理员不受行谓词限制；学院管理员按记录 `collegeId` 匹配；仪器管理员按 `instrumentAdminIds` 包含当前用户匹配。不要增加影子范围字段。

`collegeId` 是应用 `colleges` Native Resource 的记录 UUID。学院 scope dimension 通过
`valueSource.kind=native_resource` 绑定同一资源，选择器只展示平台按当前 membership 与
create/update 闭包返回的值。人员和部门保存平台目录真实 ID；部门不等于学院，也不能作为
学院范围的隐式来源。

字段策略支持 `read`、`create`、`update` 和 `mask`。显式空数组拒绝，能力数组采用 all-of。无权更新字段不仅 disabled，还必须从更新 payload 删除。

```bash
pnpm openxiangda check
```

角色成员、维度授权和平台管理员由平台管理面维护，不属于应用开发 CLI。

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
专用端点和 PostgreSQL/RLS 中强制匿名主体、字段、策略及提交回执边界。

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
