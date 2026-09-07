# 稳定字段数据协议采用与声明分层决策

状态：2026-08-16 已确认，OpenXiangda 2.0 实现必须遵守

适用范围：OpenXiangda 2.0 Data 声明、编译器、类型生成、Data API 适配、Field Kit、默认 Admin/用户端页面和参考应用。V1 应用运行时和发布链不在改造范围内。

## 1. 决策

OpenXiangda 2.0 原样采用已经长期运行的字段**数据协议**：值形状、PostgreSQL 物理存储、写入归一化、查询语义、索引策略，以及人员、部门、文件等平台数据能力保持不变。

V1 面向低代码设计器的完整组件 Schema 不作为 2.0 的数据合同。`required`、默认值、placeholder、隐藏、禁用、布局、联动、具体控件等展示属性可以按 2.0 页面需求重新设计；它们不能继续伪装成数据库约束或后端业务校验。

2.0 将字段数据、服务端写入规则和默认页面表现拆成三个独立且单向依赖的合同：

```text
Data Definition（权威数据结构）
  ├── PostgreSQL 存储计划
  ├── 稳定字段值 codec
  ├── Data API 结构校验/查询/索引
  └── 生成 TypeScript 类型

Server Write Contract（权威业务不变量）
  ├── NestJS DTO/domain 校验
  ├── App API / Data API 服务端约束
  └── 并发、幂等与业务错误

Surface Definition（可选默认 UI）
  ├── Admin 表单/列表/详情
  ├── 用户端 Desktop/Mobile 页面
  └── 控件、顺序、布局、提示和客户端校验
```

自定义页面可以完全不声明或不消费 Surface Definition，但仍必须提交稳定字段值并通过服务端写入规则。Surface 的必填、隐藏和默认值只影响体验；真正的业务必填、范围和状态约束必须由服务端合同执行。

这不是把 V1 Admin、页面壳、低代码编辑器或发布流程带入 2.0。2.0 的 Umi/Ant Design Pro Admin、双端用户页面、NestJS 后端、AppPackage、环境和发布仍按绿地架构实现。

## 2. 能力所有者

| 能力 | 唯一所有者 |
| --- | --- |
| 字段逻辑数据类型、稳定值形状 | Data Definition + 平台稳定字段数据协议 |
| 字段到 PostgreSQL 列的映射 | 平台 Data 存储规划器 |
| 结构校验、查询操作符和索引 | 平台 Data API |
| 业务必填、业务范围、跨字段/状态校验 | 应用 NestJS domain/App API，或显式服务端 Data write constraint |
| 人员、部门、文件、图片、富文本、签名和位置后端能力 | 对应平台服务 |
| 默认 Desktop/Mobile/Readonly/List/Detail 外观 | OpenXiangda 2.0 Field Kit + Surface Definition |
| 自定义页面布局与交互 | 应用前端；不拥有数据协议或授权 |
| 流程节点字段读写状态 | Workflow Kernel Surface；后端最终校验 |

`required` 如果只出现在 Surface 中就是客户端提示；只有出现在 Server Write Contract 或数据库约束中才是业务不变量。编译器和文档必须明确区分，不能把两者自动等同后让自定义页面误以为可以信任前端。

## 3. 固定数据协议不变量

1. 简单字段继续使用现有原生列映射：文本/富文本为 `TEXT`，数字为 `FLOAT`，日期为 `TIMESTAMP`。
2. 日期范围继续展开为 `<fieldId>_start`、`<fieldId>_end` 两个 `TIMESTAMP` 列，对外保持既有日期范围值语义。
3. 选择、人员、部门、附件、图片、子表、级联、地址、关联数据、位置、签名和 JSON 等复杂字段继续使用 `JSONB`。
4. 选择类、人员和部门继续保存稳定的 `{ label, value }` 快照；单值为对象，多值始终为数组。展示使用 `label`，业务比较、查询和授权使用 `value`。
5. 附件和图片继续使用稳定附件项数组及现有上传、下载、预览、压缩变体协议；不得替换为未经迁移的新 `DataFileRef` 表单值，也不得在应用中直接拼接存储凭据。
6. 子表继续保存对象数组；子字段值协议和查询能力按现有规则执行，不允许页面自行改变持久化结构。
7. 字段写入保持“提交协议值、查询返回同一协议值”，平台只执行现有归一化与安全校验，不做应用可见的隐式翻译。
8. 现有 BTREE、JSONB value 表达式和 GIN `jsonb_path_ops` 语义保持一致。2.0 可以重构实现位置，但不能改变相同数据类型和索引声明产生的结果。
9. 已存在字段的物理类型不可隐式变更。类型变化继续 fail closed，并要求显式 shadow migration 和明确回填规则。
10. 数据权限和业务校验始终由后端执行。前端隐藏、只读、客户端校验和默认值不能扩大权限，也不能替代服务端约束。

新增数据类型必须有新的稳定 type code 和显式协议版本，不能修改既有类型的存储和值语义。

## 4. 最小 Data Definition

2.0 应用默认只声明字段 code、字段名称和逻辑数据类型。单值/多值使用不同 type code，使值形状无需额外低代码参数即可确定：

```ts
export default defineDataResource({
  code: 'purchase_request',
  name: '采购申请',
  fields: {
    title: data.text('申请标题'),
    amount: data.number('采购金额'),
    applicant: data.user('申请人'),
    approvers: data.users('审批人'),
    department: data.department('申请部门'),
    status: data.option('状态'),
    tags: data.options('标签'),
    attachments: data.attachments('附件'),
  },
  indexes: [
    data.index('by_status_created', ['status', 'createdAt']),
    data.index('by_department', ['department']),
  ],
});
```

`fields` 的对象 key 是稳定字段 code；factory 只确定稳定数据类型和值协议。应用不声明 `componentName`、PostgreSQL 类型、serializer、query operator、index method 或 renderer。索引只声明业务字段组合和是否唯一，平台根据稳定数据类型选择普通列、`value` 表达式或 GIN 实现。

初始 type code 至少覆盖当前稳定数据能力：文本、数字、日期、日期范围、单/多选项、单/多人员、单/多部门、附件、图片、子表、级联、地址、位置、签名、富文本、JSON、流水号和关联数据。V1 的 `EmployeeSelectField`、`TextareaField`、`TableField`、`Jsx` 等名称进入审计映射，但不是新源码必须继续使用的 UI 组件名。

Data Definition 只保证结构正确：例如人员值必须是稳定 `{label,value}`，附件必须是附件项数组，数字能够按既有方式写入。它默认不判断“采购金额必须大于零”“状态只能从草稿变为已提交”等业务规则。

## 5. Server Write Contract

真正影响数据正确性的约束必须在服务端表达并执行，主要有两种方式：

1. 复杂业务写入通过 NestJS App API，由 DTO/domain service 校验必填、范围、跨字段关系、状态迁移和外部依赖。
2. 直接开放标准 Data API CRUD 的资源，可以声明少量平台服务端 write constraints；它们由 Data API 执行，并可投影给默认页面作为客户端提示。

默认页面可以把服务端约束投影为必填标记、数字范围和错误文案，但投影不是新的事实源。自定义页面即使不展示这些提示，服务端仍拒绝非法写入。只有纯展示偏好的 `ui.requiredHint`、默认值或隐藏设置不会升级成服务端约束。

前端、CLI 和生成客户端应区分结构错误、业务校验错误、权限错误和 revision 冲突，并把服务端字段错误映射回对应控件；不能只返回一个泛化的“提交失败”。

## 6. Surface Definition

Surface 是可选的默认页面协议，不参与建表：

```ts
export const purchaseCreateSurface = defineFormSurface({
  resource: 'purchase_request',
  fields: {
    title: ui.text({ placeholder: '填写本次采购事项' }),
    applicant: ui.user({ readonly: true }),
    department: ui.department(),
    amount: ui.money({ unit: '元', precision: 2 }),
    status: ui.radio({ options: purchaseStatusOptions }),
    attachments: ui.attachment({ maxCount: 10 }),
  },
  desktop: desktopFormLayout(...),
  mobile: mobileFormLayout(...),
});
```

不声明 Surface 时，平台按字段类型和名称生成干净的默认列表、表单和详情：字段顺序使用 Data Definition 顺序，控件和只读 renderer 使用 Field Kit 默认映射，不猜业务必填、默认值或隐藏逻辑。

自定义页面可以直接使用 Field Kit 组件、生成的 Data 类型和 Data/App API 客户端，而不使用 `defineFormSurface`。平台组件负责输出稳定字段值；页面负责交互；服务端负责最终正确性。

### 6.1 移动字段组件边界

用户端 Mobile Renderer 和 AI 生成的移动页面，对平台已经支持的持久化字段类型必须使用 Mobile Field Kit，不只限于人员、部门、附件和图片。适用范围至少包括文本、长文本、数值、金额、布尔、单选、多选、下拉单选、下拉复选、级联选择、日期、日期时间、日期区间、人员、部门、地址、位置、附件、图片、富文本、签名和子表。该要求同时复用稳定值 codec 与已经验证的移动交互，不允许把 Ant Design 桌面控件、原生 `input/select/file` 或未经平台适配的通用字段控件直接放进移动表单。

Mobile Field Kit 负责触摸目标、软键盘、底部选择面板、安全区、搜索与多选收起、日期/区间选择步骤、时区和值归一化、地址级联与平台数据、上传预览以及取消/确认状态。它可以在内部组合经过评审的移动组件库，但应用页面不拥有这些平台字段的值转换和交互实现。应用仍可使用移动组件库实现导航、布局、卡片、按钮、普通弹层和不写入平台字段的临时交互。

自定义移动页面的“自定义”指页面布局、信息组织和业务交互可完全自定义，不代表重新发明平台字段控件。平台尚未覆盖的新字段必须先通过显式 Field Kit 扩展注册 renderer、codec、只读/list/detail 表现和测试；不得在单个页面中静默降级为临时控件。Admin 的 PC 页面和用户端 Desktop Renderer 可组合 Ant Design/ProComponents，但默认页面仍优先使用 Desktop Field Kit 保持值和展示一致；人员、部门、地址、位置、附件、图片等平台集成字段在桌面自定义页中也继续使用 Field Kit。

工作流页面在基础 Surface 上叠加 Kernel 返回的 field policy。节点的隐藏、只读和必填由当前 Surface 展示并由流程/App API 后端再次校验，不写回 Data Definition。

## 7. 实现与迁移边界

1. 从 V1 组件注册表、服务端存储映射、写入 handler、查询 switch、索引集合、导入导出、SDK tests 和冻结 FormRelease 提取**数据协议矩阵**；不要求 2.0 复刻所有 V1 低代码展示属性。
2. 将稳定数据协议定义为不依赖 React 的共享合同和黄金测试向量；V1 代码继续独立运行，2.0 不反向引用其发布工具。
3. 2.0 Data 编译器从最小 Data Definition 确定性生成存储计划、Data API 合同和 TypeScript 类型。
4. 2.0 Field Kit 为每个稳定数据类型提供 Desktop/Mobile/Readonly/List/Detail 默认 renderer；Mobile Field Kit 覆盖所有已支持的标准持久化字段，优先移植并重新验证 1.x 中成熟的移动选择、日期、地址、组织、附件等控制器和测试，而不是用桌面组件替代。
5. Surface Definition 和自定义页面只消费生成字段类型，不拥有或复制存储 codec。
6. Admin 只提供桌面 renderer；用户端分别提供 Desktop 与 Mobile composition。两端提交完全相同的稳定字段值。

## 8. 失败、并发和安全边界

- 未知数据类型、缺失 codec、存储类型漂移、查询操作符漂移或索引策略漂移在 generate/check 阶段失败，不能退化为任意 JSONB 后继续发布。
- Surface 缺失 renderer 时默认页面构建失败，但不改变资源的数据库定义；自定义页面不受无关 Surface 影响。
- 文件上传成功但业务写入未完成时继续使用平台既有的未绑定文件清理语义；重复上传、预览鉴权和 Blob 下载由平台组件处理。
- 组织选择调用平台人员/部门能力并产生稳定协议值；自定义页面也不应自行发明人员、部门 ID 或附件结构。
- 移动页面直接使用 Ant Design 桌面数据录入控件、原生字段控件或绕过 Mobile Field Kit 的标准持久化字段时，生成检查与模板静态审计失败。移动组件库只可用于页面结构、动作和平台尚未覆盖但已显式注册的 Field Kit 扩展。
- 类型或索引变更必须在 preproduction 对真实 PostgreSQL 预检；production 只晋级相同 AppVersion 和确定性存储计划。

## 9. 回滚边界

本决策不修改 V1 运行时代码和线上表。2.0 实现的回滚单位是 Data 编译器、Field Kit、Surface 包或 AppVersion。Surface 可以随前端版本回滚；Data Definition 和 Server Write Contract 按数据库/AppVersion 兼容边界回滚，不能通过切换 UI 绕过。

## 10. 可证伪验收

1. 自动计算 `V1 存储映射 ∪ 写入处理器 ∪ 查询分支 ∪ 索引集合 ∪ 冻结应用字段类型`；减去数据协议矩阵后必须为空。
2. 每个稳定数据类型至少有 Definition → DDL、写入 → 读取、空值、单/多值、查询操作符和索引计划黄金测试。
3. 在真实 PostgreSQL 中创建临时资源，验证物理列、往返值、筛选、排序和索引 DDL 与稳定协议一致。
4. 同一服务端 write constraint 通过默认页面和自定义 API 客户端写入都得到相同结果；只声明 Surface 必填时，测试明确证明它不冒充服务端约束。
5. Desktop、Mobile、Readonly、列表和详情 renderer 使用同一黄金值；提交结果与稳定数据协议逐字段深度相等。Mobile 在真实触摸视口覆盖单/多选、下拉、级联、日期/日期区间、地址、人员/部门、数值键盘、附件/图片和子表主路径。
6. 人员、部门、附件、图片、富文本、签名、位置和子表完成平台 API 集成测试，应用源码没有自建替代数据协议。
7. 2.0 构建静态审计禁止 ID-only 人员/部门值、未经批准的 `DataFileRef` 表单值和页面级持久化格式翻译。
8. V1 View、表单、流程、自动化与发布回归无变化。
