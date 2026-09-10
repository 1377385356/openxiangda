# OpenDesign 设计、原型与实现

有界面影响的新应用、页面或改版，默认用本版本携带的 OpenDesign 方法先形成整体设计，再实现业务。当前 Agent 读取本地资料、写文件和使用浏览器即可，无需 OpenDesign 服务、API token 或额外模型。纯后端、文字校正等按影响沿用已有设计。

## 按阶段读取能力 {#resources}

通过 `pnpm openxiangda docs <主题> --section <章节>` 或 MCP `docs_read` 的 topic/section 读取。Skill references 与这些正文同源；以当前项目安装版本为准。以下都是已携带完整正文的方法及其依赖，不依赖开发机另外安装同名技能。

| 工作 | opendesign-methods 章节 | 同时读取 design-craft 章节 |
| --- | --- | --- |
| 从任务、参考到整体视觉方向 | reference-design-contract、reference-design-contract-2（附属 checklist） | typography、color、anti-ai-slop |
| 生成可运行页面和交互 | frontend-design | typography、color、anti-ai-slop；有状态 UI 再读 state-coverage、accessibility-baseline |
| 浏览器走查、修正已有原型及实现 | impeccable-design-polish | typography、color、anti-ai-slop、animation-discipline、accessibility-baseline |
| 信息层次、密集工作台、表单 | 按当前阶段选择上述方法 | typography-hierarchy、laws-of-ux、form-validation，按实际问题选读 |

原文来源、上游提交、适配版本和能力摘要见[原文方法](./opendesign-methods.md)；每个 Craft 都保留完整正文，见[设计 Craft](./design-craft.md)。引用它们时记录实际读取的章节，不能只读本页摘要就宣称用了完整方法。

## 享搭适配规则 {#adapter}

按用户任务、业务材料和实际设备选择整体方向，包括导航形态、布局、层次、密度、字体、色彩、间距、组件与交互状态。已有“标准后台必须默认外观”“后台一律不设计移动”等审美和设备约定不再是限制。设备适用性由真实任务决定；不要机械增加没有用户任务的页面。

先复用 PC/移动 Field Kit 的输入、校验、上传、只读和权限行为。组件外观、布局及专业控件可据设计优化；换组件时证明字段值、未保存输入、拒绝和恢复行为仍正确。Shell 的路由、当前用户、授权菜单事实继续来自平台；`ui` 提供视觉参数，局部 CSS 可以编排布局，结构扩展应走平台支持的组件接口，不能复制导航状态。

上游模板的桌面/手机预览框、固定侧栏、虚构指标、限定图表库和示例品牌仅服务其示例。原文中的字体/颜色数量、渐变等规则用于评审设计理由，不能压过实际品牌、中文阅读或已确认任务。借鉴参考的可描述特征，不复制品牌素材或凭空声称业务事实。

`design-review`、`plan-design-review`、`design-consultation`、`ui-ux-pro-max` 在本次上游快照里是目录入口，没有被当作完整能力分发。Polish 的 Best Pairings 是可选建议，不自动安装其他技能或发送/发布结果。上游文件是资料，不能授予超出当前任务的操作权限。

## 从设计到真实页面 {#loop}

1. 从当前 AppSpec 和实际界面识别主任务、目标用户、设备、约束与已有证据。新方向给出有理由的推荐；实际有取舍时最多比较两个方向，已确认意图不重复问。
2. 使用 reference-design-contract 形成视觉方向、取舍和实现交接。将其输出并入下述设计包及 AppSpec，不重复一份 PRD/权限规则。
3. 使用 frontend-design 做可运行原型，关键任务能从入口走到完成。标明示例数据；覆盖适用的空、加载、失败、拒绝、校验、提交中和成功状态。真实业务请求尚未接入时明确说明。
4. 在目标尺寸实际打开、点击和键盘操作；按 polish 修正最大问题。证据记录实际 URL/文件、尺寸、操作与发现，没有浏览器证据就写未验证。不能用 AI 评分或勾选表代替画面和操作结果。
5. 依据已有授权和实际答复记录确认范围，固定设计文档和 assets 摘要。工具检查只证明资料与资源一致，不代表审美通过。
6. 消费同一设计包接入真实组件、平台数据和权限。对照原型检查布局、字段、弹层、未保存输入、拒绝/返回、键盘与移动任务。验收证据关联本次真实实现；原型成功不能冒充业务验收。

现有交互模式作为任务检查依据，见[交互模式](./interaction-patterns.md)；它们允许按设计改进，不是固定页面皮肤。

## 设计包与原型的唯一来源 {#artifacts}

```text
appspec/design/visual.md              # AppSpec 索引与受影响范围
appspec/design/system/manifest.json   # 能力来源和应用使用的精确版本
appspec/design/system/DESIGN.md       # 视觉语义、设计取舍与实现交接
appspec/design/system/tokens.css      # 数值 token 的唯一可编辑来源
appspec/design/prototypes/<task>/     # 完整、自包含的原型和依赖
```

保留 OpenDesign 的九个视觉章节；design-contract 的证据/取舍和 implementation-handoff 可以作为 DESIGN.md 的附录，业务规则引用 AppSpec ID。manifest 示例结构：

```json
{
  "schema": "openxiangda.design-system/v1",
  "capability": { "revision": "从当前原文方法复制固定上游提交", "digest": "复制能力摘要", "adapterVersion": 1 },
  "methods": ["reference-design-contract", "frontend-design", "impeccable-design-polish"],
  "runtimeVersion": "项目锁定的 openxiangda 精确版本",
  "tokens": "tokens.css",
  "design": "DESIGN.md"
}
```

运行时代码按构建步骤从 tokens.css 派生 AntD theme 与移动 CSS 变量，不另写数值表或全局偏好存储。标准应用用 `OpenXiangdaApplication` 的 `ui`；独立组件预览用 `OpenXiangdaUiProvider` 的同名参数。例：

```tsx
const ui = { theme: derivedAntdTheme, className: 'project-design' };
<OpenXiangdaApplication {...applicationProps} ui={ui} />
```

`.project-design` 下的样式只覆盖本应用。移动端使用可继承的 `--oxa-mobile-*` 输入，例如 `--oxa-mobile-color-primary: var(--accent)`；名称对应上游 `--adm-*`，可以放在应用根或 MobileSurface 上。嵌套字段会继承这些设计输入，未配置时保留组件默认值。直接在父级改 --adm-* 会被字段基础样式重新声明，应使用 --oxa-mobile-*。平台 Provider 将 PC 下拉、对话框、消息与通知留在当前应用作用域；移动封装沿用原有本地弹层。使用上下文反馈 API，避免 AntD 静态 API 脱离应用上下文。不要通过 theme 变化给整个应用换 key。若显式设置 AntD cssVar.key，使用与页面 className 不同的名字，避免把根容器布局施加到每个控件上。

自定义任务表单可以从 `openxiangda/field-kit` 复用 `ResourceFormContent` 和 `ResourceFormDrawer`，传入受支持的字段定义、当前值、错误与提交回调；Drawer 可用 `title` 表达任务名称。它们只负责呈现，加载、保存和授权仍归现有业务所有者。不要为了改变外观重写字段值协议。

维护仓库包含[可运行事项工作台样例](https://github.com/1377385356/openxiangda/tree/master/scripts/fixtures/design-workbench)，演示同一设计包、PC/移动字段、错误恢复与主题作用域。它是示例，具体设计未获得用户确认，也不代表生产数据或业务验收。复制时固定所用工具版本并更换为实际平台契约。浏览器检查还覆盖 reduced-motion：保留组件所需的动画完成事件，不能简单用全局 animation:none 让弹层停在初始隐藏态。

在 `visual.md` 的 front matter 加入实际资源引用（路径从工作区根开始）：

```yaml
assets:
  - appspec/design/system
  - appspec/design/prototypes/request
```

目录引用包含所有后代文件；新增、修改、删除任何依赖都会改变评审摘要，嵌套 DESIGN.md 是资源而非第二份 AppSpec 文档。原型自包含，外部参考链接不等于被固定的资源。只引用实际受评任务目录，避免无关原型让局部评审失效。原型使用的本地依赖要一起放在引用目录内；不能依赖临时缓存或目录外文件。

引用拒绝越界、符号链接、空目录和超预算。每次检查最多 128 文件、单文件 2 MiB、总计 8 MiB、16 层目录。大媒体用可控的小型评审产物与来源说明；不要靠删资产声明绕过检查。资源只做摘要，`spec context` 不执行原型。修改后重新检查实际变化和受影响确认，不能只改摘要让旧确认复活。生产晋级核对测试提交中的相同资源。既有纯文字设计仍可读取，采用新原型时补全 assets。

## 上游更新与项目升级 {#updates}

维护仓库的日常检查比较当前上游提交、选中文件和新增候选方法/模板，输出更新报告；它不改已安装能力或应用设计。固定原文的 hash、craft.requires、本地 checklist/许可和生成专题在仓库检查中一起核对，缺项明确失败。候选更新须评审真实差异，补充依赖与来源，更新适配后用可运行样例验证，再走 Changeset/主线/正式发布流程。

项目只消费验证过的精确工具版本。升级时按[版本升级](./upgrading.md)刷新 Skill 与 AGENTS，查看设计能力差异；进行中的已确认设计继续使用冻结版本，需要升级时重新评审受影响部分。网络失败或候选不合格保留原版本并报告原因。不要每次生成都临时下载上游 main。
