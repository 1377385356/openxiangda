# OpenXiangda 1.x → 2.0 字段组件功能映射

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-24 已按 2.0 语义字段协议实现并完成组件、Data API、PostgreSQL、
RLS、本地浏览器和 `reference-environment` 远程验收。

权威协议与验收账本：
[`field-component-protocol-v2.md`](./field-component-protocol-v2.md)

## 1. 映射原则

- 1.x 只提供已验证的业务功能和交互基线；2.0 不导入 1.x 源码、协议、运行时或兼容分支。
- 2.0 只接受本表中的语义字段和值形状，不接受旧物理类型、`reference` 标志、标量引用或别名。
- Desktop 和 Mobile 共享稳定值、校验、查询和权限协议，使用各自适配的组件布局。
- 单值空值为 `null`；多值、附件和图片空值为 `[]`。
- 选项、成员、部门和资源引用都保存完整显示快照，`value` 是查询和授权比较键。
- 分区、说明、栅格、列表和详情是 Surface/Page 能力，不伪装成字段。

## 2. 1.x Registry 到 2.0 语义类型

| 1.x Registry 名称 | 2.0 语义类型/组件 | 2.0 稳定值 | 状态 |
| --- | --- | --- | --- |
| `TextField` | `text.short` / `text`、`email`、`phone` | `string \| null` | 已完成 |
| `TextAreaField` / `TextareaField` | `text.long` / `textarea` | `string \| null` | 已完成 |
| `EditorField` | `text.rich` / `rich-text` | 清洗后的 HTML `string \| null` | 已完成 |
| `NumberField` | `number.integer` 或 `number.decimal` / `number`、`money`、`percent` | `number \| null` | 已完成 |
| - | `boolean` / `switch` | `boolean \| null` | 已完成 |
| `DateField` | `date`、`time`、`datetime` | 标准日期、时间或 RFC3339 字符串 | 已完成 |
| `CascadeDateField` | `date-range`、`datetime-range` | `{start,end} \| null` | 已完成 |
| `SelectField` | `option.single` / `select` | `LabeledValue \| null` | 已完成 |
| `MultiSelectField` | `option.multiple` / `multi-select` | `LabeledValue[]` | 已完成 |
| `RadioField` | `option.single` / `radio` | `LabeledValue \| null` | 已完成 |
| `CheckboxField` | `option.multiple` / `checkbox` | `LabeledValue[]` | 已完成 |
| `CascadeSelectField` | `cascade.single` 或 `cascade.multiple` | `LabeledValue[]` 路径或路径数组 | 已完成 |
| `UserSelectField` / `EmployeeSelectField` | `user.single` 或 `user.multiple` / `directory-user` | rich `UserReferenceValue` 或数组 | 已完成 |
| `DepartmentSelectField` | `department.single` 或 `department.multiple` / `directory-department` | rich `DepartmentReferenceValue` 或数组 | 已完成 |
| `AssociationFormField` | `resource-ref.single` 或 `resource-ref.multiple` / `select`、`radio`、`checkbox`、`resource` | `ResourceReferenceValue` 或数组 | 已完成 |
| `AttachmentField` | `file` / `attachment` | `DataFileRef[]` | 已完成 |
| `ImageField` | `image` / `image` | `DataImageRef[]` | 已完成 |
| `SubFormField` | `subtable` / `subtable` | 标准 Data API 子资源行集合 | 已完成 |
| `AddressField` | `address` / `address` | `StableAddressValue \| null` | 已完成 |
| `LocationField` | `location` / `location` | 钉钉/浏览器 WGS84 经纬度 | 已完成 |
| `DigitalSignatureField` | `signature` / `signature` | 托管 PNG、签署人、时间、轨迹和哈希 | 已完成 |
| `JSONField` | `json` / `json` | 有界 JSON | 已完成 |
| `SerialNumberField` | `serial-number` / `readonly` | 平台生成 `string` | 已完成 |
| - | `uuid` / `readonly` | 平台生成 UUID | 已完成 |

动态下拉、动态单选按钮和动态复选框不是另一种值协议：它们使用
`resource-ref.single`/`resource-ref.multiple`，通过编译期声明的 `source` 查询同应用资源，
并保存 `{label,value,resourceCode,snapshot}`。来源记录删除或改名不会破坏历史显示。

## 3. 页面层能力

| 能力 | 2.0 所有者 | 约束 |
| --- | --- | --- |
| 表单分区、说明、栅格 | Resource Surface | Desktop 高密度布局；Mobile 单列布局 |
| 搜索、筛选、排序、分页 | 标准 Resource Page + Native Data API | 只发送声明字段和类型运算符 |
| 详情与只读展示 | 标准 Resource Detail | 直接展示已存快照，不回查来源 |
| 导入、导出、聚合、审计 | 标准 Native Data API | 共用 SQL 编译器、字段权限和 RLS |
| 文件上传、预览、下载、清理 | Native managed-file lifecycle | 只保存受管引用，不保存凭据或 data URL |
| 子表增删改排 | 标准 Data API transaction | 父子一次提交、一次提交或整体回滚 |

## 4. 验收结论

- 30 个语义类型都具备确定的值 schema、TypeScript 类型、PostgreSQL 计划和桌面/移动组件。
- 每种类型均经标准 Native Data API create/get/list/update/null-or-empty/delete/audit 验收；
  所有声明运算符和边界都经过参数化 SQL 实库测试。
- BTREE、快照表达式 BTREE、GIN、GiST 和 trigram 索引均有 `EXPLAIN` 命中证据。
- 当前用户单/多选、学院精确/下级范围、字段 mask/拒绝、资源 capability 和事务守卫均在 RLS 下验收。
- 定位没有手工地址、手工来源或地图选点；经纬度必填，服务商地址/POI 仅为只读显示快照。
- 稳定 1.x 应用、表、API 和组件未修改，2.0 不提供旧测试数据迁移或兼容读取。
