# OpenXiangda 2.0 字段组件协议

OpenXiangda 2.0 只声明业务语义字段。字段的 TypeScript 值、JSON Schema、
PostgreSQL 物理列、索引、查询运算符、权限路径和桌面/移动组件都由编译器从同一份声明生成，
应用不能另外声明存储类型或第二套字段元数据。

完整的架构约束、验收矩阵和进度证据见
[数据与权限](data-authz.md)。

## 字段与存储

| 语义类型 | 标准组件 | Data API 存储/读取值 | PostgreSQL |
| --- | --- | --- | --- |
| `text.short` | 单行、邮箱、手机号 | `string` | `varchar(length)` |
| `text.long` | 多行文本 | `string` | `text` |
| `text.rich` | 富文本 | 清洗后的 HTML `string` | `text` |
| `number.integer` | 整数 | `number` | `bigint` |
| `number.decimal` | 小数、金额、百分比 | `number` | `numeric(p,s)` |
| `boolean` | 是/否选择 | `boolean` | `boolean` |
| `date` | 日期 | `YYYY-MM-DD` | `date` |
| `time` | 时间，可声明分钟或秒精度 | `HH:mm:ss` | `time(0)` |
| `datetime` | 日期时间 | RFC3339 instant | `timestamptz` |
| `date-range` | 日期范围 | `{start,end}` | `daterange` |
| `datetime-range` | 日期时间范围 | `{start,end}` | `tstzrange` |
| `option.single` | 静态单选下拉、单选按钮 | `{label,value,...}` | `jsonb` |
| `option.multiple` | 静态多选下拉、复选框 | `{label,value,...}[]` | `jsonb` |
| `cascade.single` | 单路径级联 | `{label,value,...}[]` | `jsonb` |
| `cascade.multiple` | 多路径级联 | `{label,value,...}[][]` | `jsonb` |
| `user.single` | 成员单选 | 完整成员快照或 `null` | `jsonb` |
| `user.multiple` | 成员多选 | 完整成员快照数组 | `jsonb` |
| `department.single` | 部门单选 | 完整部门/路径快照或 `null` | `jsonb` |
| `department.multiple` | 部门多选 | 完整部门/路径快照数组 | `jsonb` |
| `resource-ref.single` | 动态下拉、单选按钮、资源选择 | 资源 `{label,value,resourceCode,snapshot}` | `jsonb` |
| `resource-ref.multiple` | 动态多选、复选框、资源选择 | 资源快照数组 | `jsonb` |
| `file` | 附件 | `DataFileRef[]` | `jsonb` |
| `image` | 图片 | 带尺寸、缩略图和预览地址的 `DataImageRef[]` | `jsonb` |
| `signature` | 手写业务签名 | 托管 PNG、签署人、时间、轨迹和哈希 | `jsonb` |
| `address` | 行政区划地址 | 行政区划标签路径、详细地址和完整地址 | `jsonb` |
| `location` | 精确定位 | 钉钉/浏览器 WGS84 经纬度和只读服务快照 | `jsonb` |
| `json` | JSON 编辑器 | 有界 JSON | `jsonb` |
| `serial-number` | 流水号只读框 | 平台生成 `string` | `varchar(255)` |
| `uuid` | UUID 业务字段 | 校验 UUID 格式，可按权限修改 | `uuid` |
| `subtable` | 子表 | 普通子资源行集合 | 独立子表 |

单值空值统一使用 `null`；多值、附件和图片统一使用 `[]`。`subtable` 不在父表保存
JSON，而是通过标准 Data API 事务维护普通子资源。

布尔字段没有默认值时显示“未选择”，不会把未填写当成“否”。PC 和移动端可以直接选择“否”并提交 `false`；`false` 是有效值，不是必填校验中的空值。只有明确声明默认值时才初始化对应布尔值。

## 图片、缩略图和附件读取

文件本体保存于平台对象存储，业务字段保存 `DataFileRef[]` 或 `DataImageRef[]`，不把 Base64 图片、文件字节、浏览器 `blob:` 地址写入业务字段。`previewUrl` 和 `thumbnailUrl` 是平台按当前应用、环境和文件权限生成的读取地址，不是永久公开 OSS 地址；不要自行替换域名、删除环境参数或拼接对象存储路径。

图片上传完成后，平台保留原文件，并生成最长边 480 像素、保持比例、不放大小图的 WebP 缩略图，编码质量参数为 82。列表、活动卡片、小封面和头像优先用缩略图；大图预览和下载按需读取原文件。当前原生文件端点只支持原文件和 `variant=thumbnail`，不能自行拼接 `width`、`quality` 等未声明参数。附件字段中的图片不保证具有缩略图，需要缩略图能力时声明 `image` 字段。

标准图片/附件展示可以直接使用 Field Kit：

```tsx
import { AttachmentFileList } from 'openxiangda/field-kit';

<AttachmentFileList
  files={record.cover ?? []}
  resourceCode="activities"
  imageTiles
  mobile={isMobile}
/>
```

组件按文件引用选择缩略图，预览和下载经过平台接口。自定义活动封面同样先选择 `cover.thumbnailUrl`；只有平台引用没有缩略图时才回退 `cover.previewUrl`。不要写 `previewUrl || thumbnailUrl`，否则小卡片也会下载完整原图。保留真实宽高或稳定的封面比例，非首屏图片使用懒加载；不得在列表渲染时预取所有原图。

受限文件的缓存必须保留权限核验。配套平台支持私有条件缓存时，浏览器可以保存文件响应，再次访问由平台先核对当前权限，内容未变化返回 304，从本地复用字节；`no-cache` 表示复用前校验，和 `no-store` 禁止保存不同。缺少可靠实体标识或请求失败时仍禁止缓存。不应由应用添加长期免校验缓存、公开 CDN 缓存或跨账号 Blob 缓存来绕过该规则。公开长期缓存需要独立、明确的公开发布契约，不能仅因字段名叫封面就视为公开。

验收时同时记录原图/缩略图字节、列表实际请求的变体、重复访问传输量和权限撤销结果。仅看到 `blob:` 地址不能判断用了 Base64，HTTP 200 也不能证明命中了缓存。

## 声明示例

```ts
{
  code: 'status',
  type: 'option.single',
  label: '状态',
  widget: 'radio',
  required: true,
  indexed: true,
  filter: true,
  options: [
    { label: '草稿', value: 'draft', color: 'default' },
    { label: '已提交', value: 'submitted', color: 'blue' },
  ],
}
```

前端提交并读取完整快照，例如 `{label:'草稿',value:'draft'}`。后端信任显示快照，
只做有界结构校验；查询和权限以 `value` 为稳定比较键。选项后来改名不会改变历史记录的显示值。

动态选项使用同应用资源引用：

`source.labelField` 必须指向目标资源的 `text.short` 或 `text.long` 字段。流水号字段可以放进
`searchFields`、`descriptionFields` 或 `snapshotFields`，但不能作为显示标签。

```ts
{
  code: 'customer',
  type: 'resource-ref.single',
  label: '客户',
  widget: 'select',
  indexed: true,
  filter: true,
  source: {
    kind: 'resource',
    resourceCode: 'customers',
    labelField: 'name',
    searchFields: ['name', 'code'],
    descriptionFields: ['code'],
    snapshotFields: ['code', 'level'],
    pageSize: 20,
    loadMode: 'search',
  },
}
```

来源端点接受当前表单绑定值、关键字和游标；页大小由 `source.pageSize` 固定。
标准流程的具名动作发起表单由 `WorkflowSubmissionPage` 自动传递 `launch: { workflowCode, operationCode }`。
平台核对当前环境已部署的流程、动作、输入字段映射和当前用户动作权限；不要求额外授予宿主表单 CRUD 权限。
普通 CRUD 表单不传此绑定，继续检查对应创建/修改权限。自定义选择器可通过 `searchResource` 的同名选项传递
已声明的发起绑定，不能用它扩大目标资源的读取范围或执行动作。
使用此功能的编译包自动要求平台能力 `workflow.named-input-sources` 的 `1.0.0` 版本；先检查目标平台能力，配套升级后再发布。
平台按来源资源的字段权限和 PostgreSQL RLS 查询并返回完整资源快照。来源记录改名或删除后，
已经保存的 `{label,value,resourceCode,snapshot}` 仍可直接展示，不需要再次查询。

成员和部门同样保存完整显示快照：

```ts
{ code: 'owner', type: 'user.single', label: '负责人', required: true }
{ code: 'participants', type: 'user.multiple', label: '参与人' }
{ code: 'college', type: 'department.single', label: '学院', indexed: true, filter: true }
{ code: 'supportDepartments', type: 'department.multiple', label: '协作部门' }
```

成员快照可包含头像、工号、职务、手机号、邮箱和所属部门；部门快照可包含完整路径、
路径节点和父部门。凭证、Token 和认证秘密永远不能进入快照。

仅选择时间时使用 `time`，并显式决定精度：

```ts
{ code: 'reminderMinute', type: 'time', label: '提醒时间', timePrecision: 'minute' }
{ code: 'checkpointSecond', type: 'time', label: '检查时间', timePrecision: 'second' }
```

定位只支持钉钉定位或浏览器 Geolocation 采集 WGS84 经纬度。组件没有地址输入、
手工定位或地图选点；服务商返回的地址/POI 只能作为该坐标的只读显示快照。

## 移动选择交互

`MobileSurfaceFieldControl` 为成员、部门、级联和动态资源字段提供统一的移动弹层。
直接使用目录选择组件时也可传 `mobile`；显式移动界面不会因窗口较宽而切回 PC 控件。
应用继续声明同一份业务字段，使用平台组件即可，无需自己拼目录树或搜索接口。

- 成员按部门逐层浏览，部门支持逐层选择和下钻；搜索、部门层级和成员列表均按页读取。
- 级联通过路径导航选择末级项；多选或较多候选支持完整路径搜索，多选保留每条完整路径快照。
- 当前已选项独立显示，可以移除或清空；切换路径、搜索和翻页不丢失尚未确认的选择。
- 单选和多选均点击“确定”才写回表单；“取消”或“关闭”放弃本次弹层修改。候选读取失败可重试。

界面使用平台封装的 Ant Design Mobile 组件；样式与弹层留在移动组件作用域内。
存储快照、来源过滤和权限仍遵循上述标准契约，不为移动端增加第二套数据或权限接口。

## 查询与权限

列表、聚合、导出、动态来源和事务断言共用 `openxiangda.data-query/v2` 的有界 `where`：

```ts
{
  schemaVersion: 'openxiangda.data-query/v2',
  where: {
    and: [
      { field: 'status', operator: 'eq', value: 'submitted' },
      { field: 'customer', path: 'snapshot.level', operator: 'eq', value: 'A' },
    ],
  },
  order: [{ field: 'status', direction: 'asc' }],
  limit: 20,
}
```

客户端不能发送 SQL、PostgREST 表达式或任意 JSONPath。编译器只接受字段类型允许的运算符
和已声明的快照路径，所有值都使用 SQL 参数。标量索引使用 BTREE，单快照 `value/label`
使用表达式 BTREE，多值/JSON 使用 GIN，范围使用 GiST，模糊搜索使用 trigram GIN。

资源 capability 决定能否执行 read/create/update/delete；数据策略决定该角色能操作哪些行；
字段策略决定字段可读、可创建和可更新范围。当前用户字段和学院等业务范围都由同一声明生成
PostgreSQL RLS，列表、详情、聚合、导出、来源查询、审计和事务不能绕过。

## 验证

只检查应用时运行统一入口，随后按实际变化补充真实浏览器验收：

```bash
pnpm openxiangda check

```

平台维护者负责字段存储、查询运算符、索引和 RLS 的内核回归。应用开发者验证自己声明的字段、角色和业务交互，详见[检查与验收](testing.md)。

## 移动附件和图片

移动附件显示图标、文件名、大小和预览／下载／移除按钮；图片使用缩略图与加号上传格。
文件数量和大小限制沿用字段声明。上传失败保留文件并显示完整错误，支持重试；移除上传中的文件后，
迟到的结果不会回填表单。关闭编辑器同样使旧上传结果失效，已发出的请求可能继续在
服务端完成。移除字段引用不等于删除存储文件。

图片使用作用域内的移动图片预览，支持手势浏览、缩放和关闭；普通文件继续使用平台
预览路由。文件值仍为 `DataFileRef[]`，上传与下载继续由原有平台接口鉴权。


## 移动字段呈现与分组

移动字段自身提供无边框输入、上下标签、行分隔和错误提示；标准表单与自定义页面使用同一
字段组件。页面负责把相关字段组织在浅色背景上的白色分组中，不另设移动主题配置。

- 单选、复选直接展示选项；下拉单选／复选使用可搜索的底部弹层，多选展示已选数量。
- 日期使用月历，日期时间可切换时间滚轮；区间依次选择开始和结束，可返回上一步修改。
- 地址采用地区路径逐层选择，详细地址单独输入。定位沿用当前可用的钉钉或浏览器能力。
- 子表单直接展开行内字段，支持折叠、添加和删除；父表提交校验所有行，包括折叠的行。
  权限、最大行数、原子事务和已存行的 revision 继续由原有资源契约约束。
- 签名在底部画布手写并保存；图片、签名和附件仍通过托管文件接口上传与鉴权读取。
- 手机富文本编辑降级为多行文本。未修改时保留已有 HTML；修改后将纯文本转为转义后的
  段落 HTML，继续使用原有 `text.rich` 数据类型。

评分是整数的可选控件，默认五颗星，声明示例：

```ts
{ code: 'score', type: 'number.integer', label: '评分', widget: 'rating', min: 0, max: 5 }
```

`rating` 需要支持该控件的编译器、前端包与服务端 Surface 校验组合；存储、查询和校验仍为
整数。它不会修改已有 `number.integer` 字段的默认数值输入控件。
