# 业务模块与标准 CRUD 基础

这是 2026-09-05 平台重构的首批能力。数据存储、页面选择和角色授权独立定义，仍编译到平台现有 Data API、Surface 和权限引擎。

## 从业务任务到模块

先确定用户要完成的任务，再选择页面。辅助数据模型不需要独立页面；复杂任务页可组合多个模型。简单应用显式选择标准 CRUD 即可。

```ts
// modules/records/models.ts
import { defineDataModel } from 'openxiangda/config';

export const records = defineDataModel({
  code: 'records', name: '记录',
  fields: [
    { code: 'title', label: '名称', type: 'text.short', required: true },
    { code: 'enabled', label: '启用', type: 'boolean' },
    { code: 'source_key', label: '来源标识', type: 'text.short', hidden: true },
  ],
});
```

```ts
// modules/records/index.ts
import { defineApplicationModule, defineResourceForm, defineResourceList } from 'openxiangda/config';
import { records } from './models';

export const recordsModule = defineApplicationModule({
  code: 'records', models: [records],
  crud: [{
    model: records.code,
    list: defineResourceList(records, { fields: ['title', 'enabled'], filterFields: ['enabled'] }),
    form: defineResourceForm(records, { fields: ['title', 'enabled'] }),
  }],
});
```

不写 `crud` 时仅注册数据模型；`crud: [{ model: records.code }]` 使用标准页面默认字段。列表默认列、表单、详情的字段选择均保持给定顺序。一个模型可以声明多套命名视图，各自配置字段、分组和操作入口，共用同一份数据和权限。

列表可通过公开声明关闭本期不提供的导入、导出任务：

```ts
list: defineResourceList(records, {
  fields: ['title', 'enabled'],
  actions: { import: false, export: false },
})
```

省略某个开关保持默认行为，`false` 隐藏对应入口。`true` 仍遵循已有权限和写入归属，
不会授予导入或数据读取权限。默认与命名视图各自声明；PC 原生或流程导入、PC/移动导出
使用该视图同一设置。直接声明 `data.resources[].list` 时同样支持 `actions`。
这是页面任务配置，Data API 仍按原权限执行；敏感字段必须使用字段权限控制。
发布此声明需要平台采用匹配的 contracts 校验版本，无需新增数据库迁移。

```ts
// openxiangda.config.ts
import { defineOpenXiangdaApp, resourceRoleCapabilities } from 'openxiangda/config';
import { recordsModule } from './modules/records';

const appCode = 'my-app';
export default defineOpenXiangdaApp({
  app: { code: appCode, name: '我的应用' },
  modules: [recordsModule],
  frontend: { admin: { navigation: [] } },
  authz: { capabilities: [], roles: [
    { code: 'reader', name: '查阅成员', capabilities: resourceRoleCapabilities(appCode, 'records', 'read') },
    { code: 'manager', name: '管理成员', capabilities: resourceRoleCapabilities(appCode, 'records', 'manage') },
  ] },
});
```

菜单单独规划；可使用现有 `suggestAdminNavigation` 提案后选择需要的条目。`read` 仅授予查看，`manage` 明确包含增删改查，也可传 `['read', 'create']`。页面生成不会改变角色权限。

## 同一模型的多套页面

例如简要登记只填写名称，完整管理填写名称和启用状态：

```ts
crud: [
  {
    model: records.code, code: 'quick', name: '简要登记',
    list: defineResourceList(records, { fields: ['title'] }),
    form: defineResourceForm(records, { fields: ['title'] }),
    detail: defineResourceForm(records, { fields: ['title'] }),
    sections: [{ title: '登记信息', fields: ['title'] }],
    generated: { delete: false },
  },
  {
    model: records.code, code: 'complete', name: '完整管理',
    form: defineResourceForm(records, { fields: ['title', 'enabled'] }),
    sections: [{ title: '基本信息', fields: ['title'] }, { title: '管理设置', fields: ['enabled'] }],
  },
]
```

使用 `adminResourcePage('records', { viewCode: 'quick' })` 绑定菜单。平台生成
`/admin/resources/records/views/quick`、`/new`、`/:id`、`/:id/edit` 和对应移动地址；
抽屉全屏、新开页面及提交后的返回地址都保留当前视图。每个模型最多 20 个命名视图，
`code` 必须唯一且为小写短横线格式。省略 `code` 的一套视图保留原地址；只声明命名视图时不额外生成默认页面。

命名新建表单必须包含模型中可写的必填字段。仅用于局部编辑的表单可声明
`generated: { create: false }`。`mobile: { enabled: false }` 关闭该视图的移动页面。
视图不能重定义字段类型、权限或写入归属，也不能用隐藏字段代替授权。
个人显示列设置和草稿按视图隔离；列设置仍可主动选取允许展示的其它字段。
此能力要求匹配的服务端校验和 `AddFormDraftViewScope` SQL 迁移。

## 字段与控件

标准 PC 管理页沿用一行工具栏和可折叠菜单。新增、编辑默认在抽屉中进行，保存后刷新原列表并保留当前筛选和页码；也可使用已有整页录入地址。筛选、显示列、排序按需打开。默认列来自选定的业务字段，创建、更新时间需主动选择。列选择、拖动顺序与冻结立即预览，点击工具栏“保存”后记住个人配置；多排序按规则顺序生效。

在 `crud` 视图上声明共享的表单/详情分组，不向存储模型添加布局：

```ts
crud: [{
  model: records.code,
  form: defineResourceForm(records, { fields: ['title', 'enabled'] }),
  sections: [
    { title: '基本信息', fields: ['title'] },
    { title: '使用设置', fields: ['enabled'] },
  ],
}]
```

分组只标记字段所属区域；表单/详情的 `fields` 仍决定展示集合及顺序，不会追加组内其它字段。普通小表单可省略分组。PC 每行最多两个普通字段，长文本、附件等复杂字段占整行；移动端使用单列。失败时保留输入并显示错误，未保存退出时提示确认。筛选可嵌套“满足全部／满足任一”，按字段类型提供运算符；查询、分页和导出使用同一条件树及多排序。批量扩展动作声明 `requiresSelection: true`，选择记录后才显示。

`hidden` 仅控制展示。`system` 表示由服务端维护，默认隐藏；业务需要展示的流水号、状态可显式 `hidden: false`。隐藏不会撤销 Data API 的读写授权；授权仍用现有字段 `access` 与行策略。普通必填字段不能从可新增表单中漏掉；内部必填值应有清晰的服务端赋值责任，不能靠隐藏字段绕过数据约束。

业务组件优先使用 `openxiangda/field-kit`，PC 补充使用 `antd`，移动端使用 `openxiangda/mobile` 封装的 Ant Design Mobile 控件。移动控件已覆盖文本、长文本、数字、布尔、静态选项、日期时间，以及人员／部门目录、动态资源引用和级联选择。选择弹层支持逐层浏览、搜索、翻页和已选项管理，点击确定才写回表单，关闭放弃本次修改。附件、图片、地址、子表和签名已提供移动交互，富文本在手机使用纯文本编辑并保留未修改 HTML；能力边界见[字段组件](field-components.md)。共享值协议和表单控制器，不共享桌面弹层交互。

```tsx
import { MobileSurface, Input, Button } from 'openxiangda/mobile';
import 'openxiangda/mobile/styles.css';

// 在移动页面的最外层使用；标准 MobileSurfaceFieldControl 自带字段样式范围。
<MobileSurface>
  <Input value={title} onChange={setTitle} aria-label="名称" />
  <Button color="primary" onClick={save}>保存</Button>
</MobileSurface>
```

平台按需加载移动组件，并在构建时限定上游基础样式的作用范围。此入口的 `Popup`、`Picker`、`DatePicker` 默认保留在当前页面中，保留组件样式作用范围。已有 `openxiangda/react/styles.css` 包含移动字段样式，不必重复导入。不要直接引入 `antd-mobile` 根入口，它会重置全页字体和链接。平台统一使用组件库默认外观，不再提供配色配置或外观偏好。

`openxiangda check` 检查应用前端 `src/` 中的原生录入元素。移动入口使用 `src/mobile/`、`Mobile*.tsx` 或 `*.mobile.tsx`，并检查其本地静态依赖；这是明确的源码约定，不是运行时授权或对动态代码的安全证明。平台组件内部的原生 DOM 不受应用规则限制。

## 开发与验收

普通 CRUD 可以省略 `backend`、`platform` 配置，`pnpm dev` 通过现有 connected development 连接平台。默认模板不包含后端源码；显式启用或声明需要应用代码执行的后端能力后，`pnpm openxiangda check` 或 `pnpm dev` 按需初始化源码与依赖，再启动 Nest。标准流程定义和激活由平台执行，不要求应用后端。

`appspec/app.md` 维护总纲和设计索引。新应用按[产品设计](product-design.md)完成本期详细需求、任务旅程、逐页交互、权限与架构及实际确认基线，再制定实施计划；已有小变更只修订受影响材料。业务角色与权限由用户确认，技术 schema、接口和存储计划由平台产出；按业务规模拆分能力记录。

先读取 MCP 契约索引，再调用 `contract_describe` 并传入 `{ "selector": "permissions" }`，读取
`data.selection.permissionReview`。该产物使用 `openxiangda.permission-review/v2`，
`authority` 为 `declaration-projection`，并始终保留
`runtimeAuthorizationRequired: true`；`configDigest`、`contractDigest` 和
自身 `digest` 对应当前编译结果，便于在 appspec 中关联审核证据。

角色的 `capabilityCodes` 是编译后声明的能力集合，可通过能力代码关联页面、
资源操作和字段要求。运行时仍按当前用户的应用角色并集授权；
`deniedCapabilities` 只在编译时扣除该角色的 grant，不是跨角色的全局拒绝。
命名视图通过 `resourceCode` / `viewCode` 引用同一资源，字段策略只保存一次。
空字段策略显示为 `deny`，隐藏字段只代表展示选择。原始行谓词、scope 来源和
流程参与人绑定保留为待运行时求值的条件；静态能力匹配不代表真实请求允许。
该产物供审核使用，不写入角色、授权或另一份审批状态。

单元测试覆盖复杂业务规则、值转换和权限边界；接口测试覆盖存储、事务与策略；浏览器验收必须实际点击 PC/移动端的新增、选择、清空、保存、编辑和回显，并检查页面错误。组件模拟测试不等于已在远端真实业务环境验收。

## Alpha 应用迁移

依赖旧版“读权限自动附带写权限”的角色必须改成明确的 `manage` 或操作列表。原有 `data.resources` 可继续作为同一编译器的低层输入，按模块逐步拆分；不增加第二套资源存储。新增 `surface.fields.*.hidden` 与 `surface.list.fieldOrder` 需要配套平台版本，发布时必须固定匹配的服务端与工具链提交。

## 标准表单暂存

标准表单底部为“暂存 / 提交”。暂存允许必填项未完成，不写业务表、不启动流程；草稿箱可继续编辑或删除。草稿由平台当前用户、应用、环境和资源隔离，最多 20 份、90 天未更新过期。恢复编辑草稿保留原记录版本，提交仍检查冲突；正式提交与消耗草稿在同一 Data API 事务内完成。

PC 抽屉提供“全屏 / 新开页面 / 关闭”。全屏保留当前表单；新开页面先暂存，再通过草稿 ID 恢复，内容不放入 URL。移动录入使用平台移动字段的分组行式布局、简单标题和底部操作，不放“返回列表”或桌面输入控件；草稿箱和恢复确认使用底部弹层。

自定义表单可从 `openxiangda/react` 使用 `createResourceFormDraftClient(resourceCode, mode, recordId?, viewCode?)`，提供 `list/save/remove/submit`。命名视图只能恢复和提交属于当前视图的草稿；所有视图仍共用每人每个模型 20 份的上限。`save` 使用草稿 ID、expectedRevision 和可编辑字段值；`submit` 消费现有 DataTransactionOperation，不另建 CRUD 后端。此能力需要平台的 authenticated-form-drafts SQL 迁移及对应服务端版本，平台未升级时界面会明确显示暂存失败并保留输入。
