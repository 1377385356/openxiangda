# Data API 与权限

授权由四层组成：页面/操作 capability、行谓词、字段 read，以及字段 create/update。前端只消费平台返回的最终访问结果来隐藏按钮、只读输入和剔除 payload；平台每次请求重新执行权威校验。

以下仅以仪器管理应用举例，不是平台默认模型或角色。该示例的行规则是：学校管理员不受行谓词限制；学院管理员按记录 `collegeId` 匹配；仪器管理员按 `instrumentAdminIds` 包含当前用户匹配。不要增加影子范围字段。

`collegeId` 是应用 `colleges` Native Resource 的记录 UUID。学院 scope dimension 通过
`valueSource.kind=native_resource` 绑定同一资源，选择器只展示平台按当前 membership 与
create/update 闭包返回的值。人员和部门保存平台目录真实 ID；部门不等于学院，也不能作为
学院范围的隐式来源。

字段策略支持 `read`、`create`、`update` 和 `mask`。显式空数组拒绝，能力数组采用 all-of。无权更新字段不仅 disabled，还必须从更新 payload 删除。

`id`、`revision`、`created_at`、`updated_at`、`created_by`、`updated_by` 是基础元数据：
只要有记录读取权限，就可读取、筛选、排序、聚合和导出，不需要额外字段权限。
它们仍由平台生成，不能通过业务字段写入来伪造；记录、租户、环境权限和匿名公开字段白名单仍然生效。

模型可声明 `audit: { read: false }` 禁止普通用户查看变更历史；需要保留管理者查看时，
使用 `audit: { read: ['app:your-app:audit:read'] }`，先在 `authz.capabilities` 声明该能力并授予相应角色，
也可以引用已有管理权限。历史可能包含过去的业务值，因此不因基础元数据开放而自动开放。
审计策略引用能力，不新建能力或改变其所有者；缺失引用在发布前失败。
为兼容历史包，编译器仍物化审计元数据策略作为历史接口的授权声明，当前平台读取基础元数据时忽略这些额外 read 限制。
应用可信后端和超级管理员保持原语义。该声明需要 `data.audit-read-access`；基础元数据开放需部署 2026-09-29 对应平台迁移。

```bash
pnpm openxiangda check
```

角色成员、维度授权和平台管理员由平台管理面维护，不属于应用开发 CLI。

### 条件唯一键

需要“同一编号只能有一条有效主档”时，在模型声明 `uniqueKeys`。平台在环境
激活时安装约束；普通 CRUD、导入和业务事务共用该约束。应用无需先查重再创建，
也无需另建锁服务。基础规则要求平台能力 `data.unique-keys@1.0.0`；单人键或布尔条件
要求 `data.unique-keys@1.1.0`，两者由同一共享编译器确定。旧平台在
发布前明确报告缺少能力。未声明的模型不增加这一要求。

支持1.1.0的平台同时支持原1.0.0基础规则；工具预检只接受这项已知兼容关系，
不会按版本大小推断其他版本或能力可用。要求1.1.0的应用不能在1.0.0平台部署。

```ts
const partners = defineDataModel({
  code: 'partners', name: '往来单位',
  fields: [
    { code: 'externalId', label: '外部编号', type: 'text.short' },
    { code: 'name', label: '名称', type: 'text.short' },
    { code: 'state', label: '状态', type: 'option.single', options: [
      { value: 'active', label: '有效' }, { value: 'void', label: '作废' },
    ] },
  ],
  uniqueKeys: [{
    code: 'active-external-id',
    fields: [{ fieldCode: 'externalId', normalizer: 'nfkc-upper-ascii-v1' }],
    when: [{ fieldCode: 'state', operator: 'in', values: ['active'] }],
  }],
});
```

规则只比较同一租户、应用与环境内的记录。上例中 `ＡＢＣ` 和 `abc` 视为相同
编号，只有 `active` 记录参与；切换状态进入比较集合时也执行约束。平台不会猜测
业务中的有效、作废或软删除语义，条件由应用声明。

- 每模型最多 8 条，稳定 `code` 使用最长 20 字符的 lower-kebab-case；每条包含
  1–4 个不重复字段、最多 4 个 AND 条件。
- 字段支持短文本、UUID、单选、单记录引用和单人；单选/引用/人员比较保存的 `value`，忽略标签。
- `exact-v1` 原样比较（默认）；文本可用 `nfkc-space-v1` 做 NFKC 归一化、Unicode
  空白折叠和首尾修剪，或 `nfkc-upper-ascii-v1` 再将 ASCII 小写转大写。非文本只
  支持 exact；不按操作系统 locale 折叠其他文字大小写。
- 文本条件是 `empty` / `nonempty`，按 NFKC 空白规则判断；单选条件是 `in` /
  `notIn`，包含 1–16 个已声明选项值。缺失选项不满足 `notIn`。
- 布尔条件是 `eq` / `ne`，使用真实布尔 `value`，例如
  `when: [{fieldCode:'enabled',operator:'eq',value:true}]`。两种比较均不包含 NULL。
  用 `user.single` 唯一键配合 enabled eq:true，可维护同一平台用户唯一有效资料；
  禁用历史记录可共存，改为有效、调整人员或并发创建都由同一数据库约束保护。
- 任一键字段为空或归一化后为空，该行不参加比较。需要每行填写时仍应声明字段
  必填。参与比较的每个字段归一化后最多 256 个 UTF-8 字节。

重复写入返回 HTTP 409 `OPENXIANGDA_NATIVE_DATA_RESOURCE_UNIQUE_CONFLICT`，并给出
`resourceCode`、`ruleCode`；不会泄露其他记录 ID、值或原始 SQL。界面应让用户核实
输入并复用自己有权访问的记录，不自动重试创建。超长返回 HTTP 422
`OPENXIANGDA_NATIVE_DATA_RESOURCE_UNIQUE_VALUE_TOO_LONG`。事务中的任何操作失败，
该事务的记录、事件及回执整体回滚。

首次启用会检查历史数据。发现重复或超长时，激活失败且原环境 Head 保持；平台
不会自动合并、改名或删除数据。已有规则可原样保留或新增规则，修改/移除规则、
替换其字段类型或删除所用字段需要平台受管迁移。连接开发仍可添加普通字段，但
规则变化会要求先正式激活测试版本。回滚到旧模型时也应保留已经安装的规则。

平台为安装设置有界锁等待与扫描预算，超时不会留下部分约束。归一化依赖数据库
版本；跨 PostgreSQL 大版本升级由平台安排受管重建，不能由应用绕过规则或重试
写入来修复。

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
[按需后端](./backend.md)的 `platformAccess` 使用。

自定义 PC/移动页面需要维护当前应用角色时，使用
`openxiangda/core` 的 `loadRoleManagementCatalog`、
`listRoleMemberships`、`searchRoleManagementUsers`、成员 mutation 与
role-management-grant mutation。应用/平台超级管理员可以把全部角色或明确的
目标角色集合委托给一个业务角色；普通业务管理者只有同时具备
`management.delegate` 时，才能把自己已有的目标角色和动作子集继续委托。
平台按当前用户角色并集重算，接口不接受 actor、tenant、active role 或
impersonation token。mutation 必须携带 UUID `operationId`、`reason`，更新/撤销还必须
携带最新 `expectedRevision`；409 后重新加载，不能猜 revision。使用前读取当前角色管理目录，详见[管理入口](./administration.md)。

匿名外部访问不属于 RBAC 角色或 current-user 行策略。公开表单、续填、附件、重复校验和同一
浏览器的本人记录访问只通过[`frontend.publicAccess` 专用合同](./public-access.md)开放；平台继续在
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

业务分派需要目标人员具有指定角色时，使用[事务中的角色条件](./backend.md#role-member)，
由平台在写入事务中核对当前有效成员。候选查询、页面隐藏、应用管理员身份和历史
角色列表都不能替代这一规则，也不应在应用中复制一份权限状态。

## 独立资料打印 {#record-print}

模型可显式声明 `recordPrint: { read: ['app:my-app:record:print'] }`，能力须在本应用 `authz.capabilities` 定义并授给适当职责。`read: true` 绑定本资源读取能力，`false` 关闭，缺省不提供打印。平台自动提供 `data.record-print@1.0.0`，无需初始化SQL或全局开关；应用打印许可仍由声明拥有。

### 单记录评论

`recordComments: { read: ['app:my-app:comments:read'], create: ['app:my-app:comments:create'] }` 分别声明评论读取与新增，能力在本应用定义并授给职责。`true` 绑定本资源read，`false`关闭对应操作，省略整个声明关闭评论。每组最多20项、全部满足；同一个成员须同时拥有资料read及相应评论能力，不能把ALL-read职责和本人评论职责拼成ALL评论。平台自动注册 `data.record-comments@1.0.0`，fresh/update通过正式SQL迁移建表，不需手动开关。

标准资料详情提供懒加载评论面板；应用定制页面使用 `ResourceRecordComments`、`loadNativeRecordComments`、`createNativeRecordComment`、`loadNativeRecordCommentReceipt`（`openxiangda/react`），沿平台Runtime和导航保护Provider。读取跟随当前Perspective，新增和本人回执由原始当前用户角色并集与相同Native范围决定；界面能力初筛不代替服务端许可。正文为纯文本，4000字上限；分页默认20/最多50，使用返回的nextCursor，单记录最多2000条。

新增前固定 `schemaVersion: 'openxiangda.data-record-comment-create/v1'`、body及idempotencyKey。网络或超时结果不确定时保留原请求，先查本人原键回执；仅 `OPENXIANGDA_NATIVE_RECORD_COMMENTS_RECEIPT_NOT_FOUND` 表明可显式重试原请求，同一键/正文只写一条，改变正文或目标返回409。未解决前标准面板阻止页内导航；刷新/关闭浏览器会提示，当前尚无跨刷新自动保存，需保留原键与正文后通过SDK核对。读评论不获得他人的提交键。

评论属于平台附属数据，不修改申请revision/最后修改人、不推进流程或发业务updated事件，不授给匿名/应用联合主体。当前不含回复、附件、提及、编辑/删除、自动通知和旧评论导入；审批意见继续由Workflow拥有。源宜搭这些附加语义尚未运行核实，不能据COMMENT=y宣称完整等价。

### 按资料权限删除关联流程

模型或直接资源可显式声明 `recordDeletion: { delete: ['app:my-app:record:delete'] }`，引用能力须在同应用定义并授给维护职责。`true` 使用本资源 Native delete，`false` 或缺省关闭。每组最多20项，全部满足；编译器自动派生 `data.workflow-record-deletion@1.0.0`，平台自动注册，不需要初始化开关。标准详情在启用且当前用户具备资料 read、delete 和维护能力时提供“删除资料”，action/workflow拥有普通写入的模型也可单独启用资料维护。

服务端在预览、执行和回执恢复时重新检查当前用户。必须由同一个成员同时持有资源 read/delete 及全部维护能力，再沿该成员原 RLS；不能把全部资料读取职责与本人删除职责拼成全部删除。应用管理员称谓不自动授权，匿名、应用后台断言及工作流任务断言不能调用此浏览器入口。维护能力不授予编辑资料、改派任务或整套流程管理员权限。Perspective 不改变写权限，维护沿当前用户原角色并集。

先填写非空原因（trim后最多1000字符），再预览，确认使用原预览Token和幂等键。无关联实例时复用 Native 事务；一个根关联实例时复用 Workflow Kernel 的 `admin_delete`，同事务删除资料及 owned 明细、关闭任务/参与人/返回会话并记录审计。共享 resource-ref 不级联。待启动命令、多个实例或明细关联其他实例会阻止全部删除；最多根记录加400条后代（合计401条）、深度8，超限明确拒绝。嵌套后代共用总预算，不能按每层累乘；末行关联与revision也参与核对。关联流程仍最多100条，读取101条拒绝。普通 Native 删除的流程关联保护保持，不能用它绕开维护协议。

同一受控请求只选择一条根记录，SDK输入不随容量扩大改变。管理员公开批量请求仍最多100个所选根或普通操作；只有服务器核对并展开的内部DELETE集合可用401条总上限，多个根也共用总量。整管理员请求1MiB、Native事务1000操作/2MiB与原Kernel预算保持。七张各50行的子表属于这个预算；声明和当前资料授权仍须逐项验证，没有新的初始化开关。

预览有效五分钟，绑定当前账号/登录会话/CSRF、环境Head、根revision及全部owned摘要。变化或到期须重新预览。未知结果先读取原回执，只有 `OPENXIANGDA_NATIVE_RECORD_DELETION_RECEIPT_NOT_FOUND` 且预览有效时可显式原键重试，不能创建新键。回执恢复允许预览到期，但仍检查当前权限、原账号/会话/CSRF和同一Head，成功后不重读已删除资料。两类回执的 `receiptOwner` 分别为 `native-transaction` 和 `workflow-command`。

SDK复用现有应用CSRF与512条命令绑定缓存，预览到期不会自动丢弃原header。身份退出、缓存容量淘汰或刷新后不保证恢复原CSRF；标准弹层不跨刷新自动保存原请求。页内导航和关闭保护保留未确认操作，无法确认的请求不得用重新预览掩盖。删除不可由代码回滚恢复；应用须按自身保留和归档要求决定是否开启。

打印先筛选同一成员同时具备资料read及所有打印能力的资格，再沿原RLS、Perspective、字段读取与脱敏；不能把ALL-read职责和own-print职责合并成ALL-print。普通app-admin与平台超管分别验收。SDK `loadNativeRecordPrint(resourceCode, recordId, { viewCode? })` 只读当前单记录投影；公开 `ResourceRecordPrintPreview` 与生成Native详情中的“打印”入口共用它。字段权限仍使用页面/模型规则，不增加流程节点字段权限配置。

预览显示读取时间、当前详情可见字段和分组。打印前重新读取当前授权数据，失败清除旧预览，身份/授权/Perspective变化和关闭淘汰过期请求。附件/图片只列名称及大小、富文本转安全文本，没有自动外部下载；系统打印取消不写业务资料。当前版本只支持主记录，详情包含可读子表返回409，超2MiB返回413，不静默漏项；专用PDF模板、签章与子表完整打印另行提供。独立权限保护平台的打印接口和标准入口，已读资料的截图/浏览器自行打印不属于可撤销许可。
