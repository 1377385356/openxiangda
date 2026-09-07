# ResourceDefinition 与标准 CRUD Surface 生成决策

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-22 已确认，开始实现

## 1. 问题证据

当前 2.0 已有 `DataResource`、Native Data API 和字段/行权限，但模板仍把数据库字段声明在 `platform/data/*.ts`，把标签、控件、分组和选项重复声明在 `apps/web/src/fields.ts`。列表、表单和详情页面也由每个应用分别实现，因此简单 CRUD 不能做到“声明资源即可得到标准后台”。

## 2. 决策

保留 `DataResource` 作为平台数据和权限的权威合同，在同一个资源声明上增加可选的 `surface` 元数据。编译器只把数据部分投影到平台 Native Data API，同时从同一份声明生成应用侧的标准页面元数据和 TypeScript 类型。

```text
DataResource + surface
        ├── DataResource（数据类型、存储约束、权限）
        ├── generated.ts（资源类型与默认页面元数据）
        ├── StandardAdminShell / List / Form / Detail
        └── AI/MCP 资源能力目录
```

`surface` 不参与建表，也不能改变字段的存储类型、稳定值形状、Data API 权限或服务端业务校验。未声明 `surface` 时，标准页面使用字段类型的默认 renderer；自定义页面可以完全不使用标准页面。

编译器从单次资源声明投影 `surface.generated.list/detail/create/update/delete` 和
`mutationOwner: native | action | readonly | workflow`。Native owner 默认拥有完整标准 CRUD；
其他 owner 默认只保留读取 surface，且不能生成 Native mutation。复杂资源可以逐项关闭标准
页面/动作，简单资源不需要复制页面代码。生成 page registry 不等于菜单：应用必须在唯一的
`frontend.admin.navigation` 中显式引用需要展示的 list page，compiler 和 Shell 不会枚举资源
补菜单。

### 当前最小实现闭环

模板已经提供 `ResourceListPage`、`ResourceFormPage` 和 `ResourceDetailPage` 三个稳定页面边界。它们统一承载白色后台壳、页面标题/面包屑、权限拒绝、加载与不存在状态、创建/编辑/详情导航、删除入口、导入/导出入口和审计入口；列表查询、表单字段和复杂控件仍由应用通过 Refine provider 与 renderer 传入。这样先统一页面生命周期，再逐步把字段 renderer 从应用实现收敛到 Surface registry，不会为了“通用”而绕过 Native Data API。

仪器资源已切换到这三个标准页面边界，并从 `instrumentSurface.list` 读取默认分页和排序。成员、部门、学院和附件仍使用平台权威组件；导入事务仍保持显式禁用，不通过自定义接口绕过 Native Data API。

字段层的第一批通用 renderer 已落地在模板的 `SurfaceFields`：文本、文本域、数字/金额/百分比、日期/日期时间、布尔、单选、多选、邮箱、手机号、成员、部门、JSON、只读和附件均按 `surface.widget` 选择控件或详情值。学院范围选择和文件上传通过显式 renderer 注入，避免把某个业务资源的路径或范围规则写死在通用组件中。

列表列通过字段的 `list`、`searchable`、`sortable` 元数据生成；资源级 `list.searchableFields`、`list.filterFields` 和 `list.defaultSort` 是查询合同的唯一声明来源。由于 Native Data API 当前只有 AND 条件，搜索先选择一个声明字段执行单字段 `ilike`，不伪造跨字段 OR。

模板同时提供 `/m/admin/resources/instruments`、`/m/admin/resources/instruments/new`、`/m/admin/resources/instruments/:id` 和 `/m/admin/resources/instruments/:id/edit` 移动后台入口。桌面后台对应路径位于 `/admin/resources/instruments...`；命名空间及冲突合同以后续 [Generated admin resource route namespace v2](./generated-admin-resource-route-namespace-v2.md) 为准。移动列表使用标准资源列表壳和卡片交互，移动详情使用标准详情壳；移动 renderer 使用原生日期、数字、选择和输入控件，成员/部门继续使用已经具备移动抽屉交互的平台选择器。PC 路由和移动路由不共享页面壳，只共享 Surface、值协议和权限/提交逻辑。

筛选控件也开始从 Surface 生成：单选、多选、布尔、日期、数值、范围和目录类字段由 `SurfaceFilterControl` 统一选择基础控件；学院范围等需要平台语义的字段通过显式 renderer 注入。这样后续新增简单 CRUD 资源时，列表页只需声明 `list.filterFields`，不再复制控件分支。

生成器现在还会把资源名称、CRUD capability 和 Surface 写入 `packages/contracts/src/generated.ts` 的 `resourceDefinitions`。模板的 `GeneratedResourceCrud` 使用这一目录自动注册 PC/移动端列表、创建、编辑和详情路由，并通过通用 Native Data API provider 完成分页、筛选、排序、CAS 更新、删除、审计和文件上传。复杂资源可以继续保留显式路由覆盖，简单资源不再需要手写页面生命周期。

当前前端基线继续使用 Vite、React Router、Refine Core 和 Ant Design。不会恢复历史 Umi、Pro 或 1.x Admin 兼容路径。

## 3. 能力所有者与不变量

| 能力 | 唯一所有者 |
| --- | --- |
| 物理/逻辑字段类型、空值、索引、文件约束 | `DataResource.schema` |
| 数据读写、字段权限、行权限、修订版本 | Platform Native Data API |
| 标签、控件、分组、列表筛选和默认布局 | `DataResource.surface` |
| PC/Mobile 控件实现 | 对应 renderer registry；值协议不变 |
| 复杂业务校验、跨资源事务和第三方调用 | NestJS App API（仅在需要时） |
| 标准 page registry 与路由 | 编译器；仅投影声明的 generated surface |
| 后台菜单分组/标签/顺序/图标 | 应用 `frontend.admin.navigation` |
| AI/MCP 标准 CRUD 能力 | 编译后的 generated surface 与 mutation owner |

`DatePicker`、成员选择器和附件上传组件不能反向决定数据库字段。`surface.widget` 只能选择 renderer；真正的字段类型仍由 `schema.fields[].type` 决定。

成员、部门、选项继续使用稳定 `{ label, value }` 值，附件继续使用平台稳定附件/文件协议，日期与日期时间使用明确的稳定值。桌面与移动端共享值、校验和权限，使用不同 renderer。

## 4. 失败、并发、安全和资源边界

- 未知 widget 或字段缺失 renderer 在生成/检查阶段失败，不退化成普通文本。
- `surface` 的必填提示、隐藏和布局不替代服务端写入校验；权限仍由 Data API、App API 和 AI 执行层再次判断。
- 资源声明投影到平台时会丢弃 `surface`，避免改变既有 Native DataResource schema；应用侧生成物携带 surface digest，保证页面与资源声明一致。
- 普通 CRUD 继续直接访问 Native Data API；只有显式声明自定义操作时才生成 NestJS runtime。
- 应用运行时仍保持每个复杂后端独立 Deployment，`shared` 不表示共享 Node 进程。资源治理先通过 CRUD-only 不生成后端、资源档位和闲置 scale-to-zero 降低 Pod 数量，再评估 HPA/KEDA/Knative。

## 5. 回滚边界

本主题的回滚单位是 contracts/devkit/template 的一个版本组合和对应 AppVersion。既有 Native DataResource、数据库物理列和 1.x 应用不迁移、不双写；回滚页面生成器不会改变数据存储。

## 6. 可证伪验收

1. 同一资源声明能够生成数据类型和标准 surface 元数据，源码不再需要重复维护同一字段的标签/控件定义。
2. `openxiangda generate --check`、`check`、`test` 和模板构建能够发现生成物漂移和未知 renderer。
3. 一个资源至少覆盖列表、分页/筛选、创建、编辑、详情、删除和权限隐藏路径。
4. 日期、成员、部门、附件在桌面与移动 renderer 中提交相同稳定值。
5. 普通 CRUD 应用在没有自定义操作时不生成 NestJS backend artifact；有自定义操作的应用仍生成并通过 readiness。
6. 现有 instrument reference app 仪器资源的 Data API、权限、文件和 AI 目录回归不变。
