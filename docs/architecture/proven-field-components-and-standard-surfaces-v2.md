# 经过验证的平台字段组件与三端标准页面决策

状态：2026-08-18 已实现并通过组件、模板、三端与完整本地运行时验证

适用范围：OpenXiangda 2.0 `openxiangda-contracts`、`openxiangda-field-kit`、
`openxiangda-user`、官方应用模板及其本地验收夹具。OpenXiangda 1.x 运行时、
工作区识别、发布协议和已部署应用不在改动范围内。

## 1. 问题证据

当前 2.0 参考应用暴露了四类可复现问题：

1. Desktop 附件组件同时组合受控稳定值与 Ant Upload 内部 `fileList`。上传成功后，
   业务值加入一份完成项，Ant Upload 的成功回调又保留一份本地项，导致相同附件重复显示。
2. 组件验收页以 `purchase_requests` 作为文件上下文，却上传字段 `images`；该资源只声明
   `attachments` 为 `file`，平台按声明失败关闭并返回
   `OPENXIANGDA_NATIVE_DATA_FILE_FIELD_INVALID:images`。
3. `location` 和 `signature` 在 Desktop/Mobile 仅渲染只读文本，`richtext` 退化为多行文本；
   图片和附件的移动交互也缺少 1.x 已验证的进度、预览、失败重试和清理生命周期。
4. 移动 Form.Item 没有显式投影 `required` 标记；参考应用本地部门审批绑定在选择部门后
   找不到该范围内的 `department_manager` 成员，提交返回
   `WORKFLOW_V2_APPROVER_RESOLUTION_EMPTY:department-review`。

现有移动工作台虽然具备基本数据和导航，但卡片比例、信息密度、表单分区、提交前审批预览
和流程详情没有达到 2026-08-18 验收稿的结构与视觉基线。

## 2. 能力所有者

| 能力 | 唯一所有者 |
| --- | --- |
| 附件、图片、位置、签名及富文本稳定值 | `openxiangda-contracts` |
| 字段输入、只读展示、上传状态机、预览与端侧交互 | `openxiangda-field-kit` |
| 文件声明、上传票据、内容读取、绑定与孤儿清理 | OpenXiangda Platform Native Data API |
| 身份、RoleSession、目录和数据范围 | OpenXiangda Platform |
| 流程准备、审批人解析、动作与审计 | Workflow Kernel v2 |
| Admin 桌面页面组合 | `openxiangda-admin` 与应用 Admin routes |
| 业务用户 Desktop/Mobile 页面组合 | `openxiangda-user` 的独立 renderer |
| 采购领域字段、文案和路由贡献 | 官方参考应用 |

1.x 源码只作为行为、交互和测试基线。2.0 包不得导入 1.x 模块、探测 1.x 工作区、调用
1.x API，或复制 1.x 的页面壳和发布生命周期。

## 3. 稳定不变量与受影响合同

1. 附件保存 `DataFileRef[]`，图片保存 `DataImageRef[]`，人员/部门保存 rich
   `{ label, value, ... }` 快照，位置保存 `StableLocationValue`；不得新增第二种兼容值格式。
2. 签名值必须成为 contracts 中明确版本的稳定 JSON 值，沿用 1.x 的预览、轨迹、时间戳和
   哈希语义。签名通过自身声明的 Native managed-file 生命周期保存托管 PNG 引用；签名 JSONB
   不保存 base64、data URL、公共对象存储地址或对象存储凭据。
3. 富文本持久化为经过清洗的 HTML 字符串，空值为 `null` 或空字符串；只读展示禁止执行
   script、事件属性和危险 URL。
4. 每个文件上传必须通过真实声明的 `file`、`image`、`signature` 或 `text.rich` 字段发起。
   组件验收使用独立的验收资源，不增加绕过声明的通用上传 API，也不把测试字段混入采购业务资源。
5. 文件 UI 只维护一个受控生命周期：`local/uploading -> stable/done` 或 `error`。
   替换和去重使用本地 uid、`fileId` 和稳定 URL 的确定性标识；成功回调不得追加第二份条目。
6. Desktop 与 Mobile 共享值归一化、上传控制器、错误模型和能力边界，但分别实现布局、
   选择器、预览和动作区域。设备分支只在用户端入口选择，不把 Desktop 控件缩放成 Mobile。
7. `required` 是 Surface 的视觉和客户端校验投影；NestJS/App API、Data API 与 Workflow
   仍是业务必填和授权的最终裁决者。
8. 审批人为空必须继续失败关闭。参考夹具应提供与所选部门范围匹配的真实角色成员，
   不允许前端默认审批人、回退发起人或隐藏错误。
9. Admin、业务用户 PC 与 Mobile 使用相同 route/data/workflow 合同；三端可以有独立页面组合，
   不能维护第二份数据、权限或流程状态。

公开受影响面包括：Field Kit 的 Desktop/Mobile/Readonly 导出与样式、User 包的标准页面、
模板 DataResource/Surface/fixture、组件使用指南和参考应用路由与测试。Native Data API 的文件
安全语义和现有 URL 不变化。

本轮采用简单目录和单一 Registry。1.x 只提供已验证的功能、样式、交互与移动端基线，不建立
逐文件追溯、兼容运行时或第二套协议。组件通过一个 `fileService` 调用既有 2.0 文件接口，页面和
字段组件不感知 initiate/PUT/complete/delete-unreferenced 的步骤。

## 4. 失败、并发与清理行为

- 同一控件的并发上传有独立 abort/progress 状态；单个失败不覆盖其他文件，重复选择按稳定标识去重。
- 超出数量、大小或 accept 规则在上传前显示字段内错误；服务端仍重复校验并返回权威错误。
- 组件卸载或取消未完成上传时中止请求；已经取得票据但未完成的文件继续由平台文件清理兜底。
- 删除未引用文件调用现有删除接口；已引用文件只从候选表单值移除，记录更新后由平台异步刷新引用索引和保留期。
- 预览 Object URL 在关闭、替换和卸载时释放；预览失败保留下载动作和可重试错误。
- 定位优先使用钉钉能力，失败后降级浏览器 Geolocation；超时、拒绝和不支持分别显示可恢复错误。
- 签名保存只接受非空轨迹，生成图片和哈希任一步失败都不覆盖原值；重复保存以最后一次成功值为准。
- 富文本迁移 1.x 的完整格式、表格、链接、托管图片、粘贴/拖拽与安全只读能力。内联图片
  通过 `text.rich` 字段自身的 Native managed-file 生命周期上传、引用和清理；外部或未认证图片
  地址被拒绝，不建立伴随字段或旁路上传协议。编辑器销毁后不得提交迟到回调。
- Workflow prepare/start 使用既有 revision、token 和幂等键；审批人解析为空时保留节点编码并引导修正配置。

## 5. 安全与资源上限

- 默认附件最多 10 个、单个 50MB；字段声明可以收紧，不能由页面放宽平台声明。
- 默认图片最多 9 个、单个 20MB；只接受图片 MIME/扩展名，缩略图使用稳定受管内容入口。
- 签名画布 CSS 高度不超过 320px，轨迹点数量和 PNG 文件大小都受字段/平台上限约束；
  业务记录只保存托管文件引用。
- 富文本工具栏和表格维持 1.x 的有界集合；HTML 在写入和只读展示前清洗。
- Object URL、上传任务、Toast/Modal 和定位监听在卸载时清理，不建立全局可变状态。
- 浏览器不得持久化文件内容、下载票据、Workflow preparation token、RoleSession 或业务响应。
- 组件验收资源只授予参考应用已有受控角色，不扩大其他租户或生产应用能力。

## 6. 设计基线

三端继续使用 Ant Design 作为唯一设计系统。Admin 保持 Pro 的桌面数据管理密度；业务用户 PC
使用独立桌面 renderer；Mobile 以 2026-08-18 五屏验收稿为视觉基线：工作台、数据列表、
表单提交、底部审批预览、流程详情。

移动页面采用冷灰背景、白色业务分区、蓝色主操作、4-8px 圆角、清晰分隔线和底部安全区；
必填星号紧邻标签。AIDA、营销 Hero、滚动叙事和 GSAP 不适用于高频操作型产品，不进入实现。

## 7. 回滚边界与影响面

实现拆成可独立回滚的发布单元：

1. contracts + Field Kit 的字段生命周期和组件；
2. User Desktop/Mobile 标准页面；
3. 官方模板的验收资源、流程夹具和高保真页面。

每个单元通过 Changeset 独立版本化。回滚使用对应 npm 包版本和 AppVersion，不需要数据库数据迁移。
新增验收资源可随模板 AppVersion 回滚；既有 `purchase_requests` 数据和文件引用不修改。
1.x 仓库、已发布 1.x 包、其他租户和当前生产 Head 不引用本次未发布源码，影响面为零。

1.x `relation`/关联表单统一映射为 `resource-ref.single` 或 `resource-ref.multiple`，
使用标准动态下拉、单选/复选或资源选择组件。复杂关联业务页面仍可使用 App API，
但不能发明第二种资源引用值。

## 8. 可证伪验收

1. Desktop/Mobile 连续上传两个同名文件时，每个服务端 `fileId` 只显示一次；上传成功不保留本地副本。
2. 图片在独立验收资源的 `images` 字段完成 initiate/upload/complete/preview/remove，不再返回字段无效。
3. 附件、图片、定位、签名和富文本具备 Desktop、Mobile、Readonly、disabled、empty、loading、error 状态测试。
4. contracts/Field Kit 往返测试证明稳定附件、位置、签名和富文本值不依赖 1.x 运行时。
5. 所有移动必填字段显示红色 `*`，空提交把错误定位到控件；桌面标记和现有 ProForm 行为不退化。
6. 选择 `dept-product`、`dept-design` 和 `dept-engineering` 分别准备采购流程时，部门节点都能解析至少一名
   合法 `department_manager`；删除对应夹具后测试必须稳定复现 `WORKFLOW_V2_APPROVER_RESOLUTION_EMPTY`。
7. 390x844、430x932、1280x800、1440x900 的 Playwright 截图无文字溢出、重叠、布局跳动或桌面控件混入移动端。
8. 工作台、列表、表单、审批预览、流程详情与验收稿逐屏比对；提交主路径只有一个主按钮。
9. `openxiangda generate/check/test`、`pnpm verify:affected`、Ant Design lint、模板单测与 Desktop/Mobile E2E 全部通过。
10. 静态边界检查证明 2.0 包没有 1.x import、1.x workspace detection、原生绕过上传或第二份权限/流程状态。
