# OpenDesign 设计、原型与实现

有界面影响的新应用、页面或改版，默认由 **OpenXiangda 2.0 的 AI 工作流调用原版 OpenDesign CLI、Skill 和 MCP** 完成设计、原型、预览和修正，再在同一工作区交接到享搭实现业务。OpenDesign 客户端是可选预览器，不是用户必须操作的开发入口。享搭只提供安装发现、原生 CLI 透传和 Agent 接入边界；项目、模板、设计系统、插件、导出及更新都由 OpenDesign 管理。纯后端、文字校正等按影响沿用已有设计。

## 原版安装与完整 CLI {#native}

从[官方发行页](https://github.com/nexu-io/open-design/releases/latest)安装原版运行时或 CLI。AI 工作流优先通过绝对路径 `OPENXIANGDA_OPENDESIGN_CLI`（也支持 `OD_BIN` 与 `OD_NODE_BIN`）调用原生 CLI；macOS 桌面自动发现 `/Applications/Open Design.app` 或 `~/Applications/Open Design.app` 仅用于可选预览。不要要求用户打开客户端，也不搜索 PATH 中的 `od`，避免调用操作系统的同名命令。当前桌面自动发现已在官方 macOS arm64 0.22.2 验证；其他平台使用显式入口，不声称已完成桌面验证。

```bash
pnpm openxiangda design open
pnpm openxiangda design status --json
pnpm openxiangda design cli --help
pnpm openxiangda design cli project list
pnpm openxiangda design cli templates list
pnpm openxiangda design cli design-systems list
pnpm openxiangda design cli tools directions --json
pnpm openxiangda design cli plugin --help
pnpm openxiangda design cli mcp
```

`cli` 后面的参数、标准输入、输出、JSON、错误码和取消交给原版；享搭不维护上游命令白名单。查看每条原生命令的 `--help` 再执行当前需要的操作。原版 MCP 可直接接到支持 stdio 的 Agent，启动命令为 `openxiangda design cli mcp`；它与享搭平台 MCP 分别拥有设计项目和平台契约，不合并权限。

AI 通过 CLI/MCP 工作时使用原生 `OD_DAEMON_URL` 或原版自动发现的本地运行时；不需要先执行 `design open`。桌面版 sidecar 只在用户主动预览时使用。原版桌面文件导入等操作可能要求桌面授权上下文；AI 应保留原版错误并停止该步骤，不伪造 token 或改数据库。享搭不会在 npm 安装时下载桌面应用、自动修改 Agent 凭据或开启云付费功能。

AI Agent 通过原版 CLI/MCP 使用设计能力；模型和登录由原版及所选提供商管理。用户需要人工查看时才打开客户端。需要原版图像、视频、音频或云服务时按原版配置相应提供商。原生功能按其实际依赖可用，不把所有功能都描述为无需配置。

## 随包离线参考 {#resources}

通过 `pnpm openxiangda docs <主题> --section <章节>` 或 MCP `docs_read` 的 topic/section 读取。Skill references 与这些正文同源；以当前项目安装版本为准。以下是携带完整正文的精选方法及依赖，作为离线参考。原版运行时提供完整且可能更新的资源；不要把这张精选表当作原版能力边界。

| 工作 | opendesign-methods 章节 | 同时读取 design-craft 章节 |
| --- | --- | --- |
| 从任务、参考到整体视觉方向 | reference-design-contract、reference-design-contract-2（附属 checklist） | typography、color、anti-ai-slop |
| 生成可运行页面和交互 | frontend-design | typography、color、anti-ai-slop；有状态 UI 再读 state-coverage、accessibility-baseline |
| 浏览器走查、修正已有原型及实现 | impeccable-design-polish | typography、color、anti-ai-slop、animation-discipline、accessibility-baseline |
| 信息层次、密集工作台、表单 | 按当前阶段选择上述方法 | typography-hierarchy、laws-of-ux、form-validation，按实际问题选读 |

原文来源、上游提交、适配版本和能力摘要见[原文方法](opendesign-methods.md)；每个 Craft 都保留完整正文，见[设计 Craft](design-craft.md)。引用它们时记录实际读取的章节，不能只读本页摘要就宣称用了完整方法。

## 享搭适配规则 {#adapter}

按用户任务、业务材料和实际设备选择整体方向，包括导航形态、布局、层次、密度、字体、色彩、间距、组件与交互状态。已有“标准后台必须默认外观”“后台一律不设计移动”等审美和设备约定不再是限制。设备适用性由真实任务决定；不要机械增加没有用户任务的页面。

应用结构先于视觉改版：标准管理后台是默认骨架，必须保留平台 Shell、后台路由、显式菜单、资源表单、数据列表、权限和流程入口。OpenDesign 对后台只做布局、视觉和交互优化，不能用独立原型、单页 HTML 或 iframe 替换后台。用户端 PC 与移动端按真实旅程分别设计，可以完整采用 OpenDesign 的视觉与交互，但通过平台 runtime/Data API 连接后台数据，并保持与后台分离的权限和导航状态。设计交接时分别标记后台、用户端 PC、用户端移动端的页面归属和验收入口。

先复用 PC/移动 Field Kit 的输入、校验、上传、只读和权限行为。组件外观、布局及专业控件可据设计优化；换组件时证明字段值、未保存输入、拒绝和恢复行为仍正确。Shell 的路由、当前用户、授权菜单事实继续来自平台；`ui` 提供视觉参数，局部 CSS 可以编排布局，结构扩展应走平台支持的组件接口，不能复制导航状态。

上游模板的桌面/手机预览框、固定侧栏、虚构指标、限定图表库和示例品牌仅服务其示例。原文中的字体/颜色数量、渐变等规则用于评审设计理由，不能压过实际品牌、中文阅读或已确认任务。借鉴参考的可描述特征，不复制品牌素材或凭空声称业务事实。

离线快照中的目录入口不被冒充为完整实现；原版中实际可用的插件、技能及资源通过原生命令和界面发现。遵循原版工作流，不把享搭自己的审美限制强加给它。执行插件、连接器和分享等功能仍需要与用户当前任务相符的授权。

## 从设计到真实页面 {#loop}

1. 从当前 AppSpec 和实际界面识别主任务、目标用户、设备、约束与已有证据。新方向给出有理由的推荐；实际有取舍时最多比较两个方向，已确认意图不重复问。
2. AI 通过原版 CLI/MCP 创建或复用项目、选择模板/设计系统，提供任务与必要参考；工作目录由当前 OpenXiangda 工作区确定。使用原版工作流形成设计方向，保留上游的项目和资源结构；用户可选打开客户端查看。
3. 通过原版 Agent、项目和预览做可运行原型，关键任务能从入口走到完成。标明示例数据；覆盖适用的空、加载、失败、拒绝、校验、提交中和成功状态。真实业务请求尚未接入时明确说明。
4. 使用原版预览、lint、导出和修正能力；在目标尺寸实际打开、点击和键盘操作。证据记录实际 URL/文件、尺寸、操作与发现，没有浏览器证据就写未验证。不能用 AI 评分或勾选表代替画面和操作结果。
5. 依据已有授权和实际答复记录确认范围，固定设计文档和 assets 摘要。工具检查只证明资料与资源一致，不代表审美通过。
6. 消费同一设计包接入真实组件、平台数据和权限。对照原型检查布局、字段、弹层、未保存输入、拒绝/返回、键盘与移动任务。验收证据关联本次真实实现；原型成功不能冒充业务验收。

现有交互模式作为任务检查依据，见[交互模式](interaction-patterns.md)；它们允许按设计改进，不是固定页面皮肤。

## 原版产物交接到 AppSpec {#artifacts}

OpenDesign 项目保留自己的设计文件、清单和数值 token。交接时用原版文件/导出功能复制本轮实际采用的文件及依赖到以下目录，记录原版版本、项目 ID 和导出来源；不要求为了享搭改写上游 manifest 或重复制作原型。大型媒体和完整上游工作目录留在原项目，AppSpec 引用本轮可审阅、自包含的产物。

```text
appspec/design/visual.md              # AppSpec 索引与受影响范围
appspec/design/system/manifest.json   # 能力来源和应用使用的精确版本
appspec/design/system/DESIGN.md       # 视觉语义、设计取舍与实现交接
appspec/design/system/tokens.css      # 数值 token 的唯一可编辑来源
appspec/design/prototypes/<task>/     # 完整、自包含的原型和依赖
```

原版已有设计系统清单优先原样保留。没有清单时可以使用下面的享搭来源索引，业务规则引用 AppSpec ID；它是可选交接记录，不是 OpenDesign 要求的格式：

```json
{
  "schema": "openxiangda.design-system/v1",
  "capability": { "runtime": "OpenDesign", "version": "实际使用的原版版本", "projectId": "原版项目 ID" },
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

原版运行时使用官方更新器或官方发行版升级；CLI 每次从当前安装读取入口和版本。进行中的设计在 AppSpec 记录实际版本与导出摘要。不要把 npm 包里的离线资料版本当成原版安装版本。下面的每日检查只维护随包离线资料，不替代原版更新器。

维护仓库的日常检查比较当前上游提交、选中文件和新增候选方法/模板，输出更新报告；它不改已安装能力或应用设计。固定原文的 hash、craft.requires、本地 checklist/许可和生成专题在仓库检查中一起核对，缺项明确失败。候选更新须评审真实差异，补充依赖与来源，更新适配后用可运行样例验证，再走 Changeset/主线/正式发布流程。

项目只消费验证过的精确工具版本。升级时按[版本升级](upgrading.md)刷新 Skill 与 AGENTS，查看设计能力差异；进行中的已确认设计继续使用冻结版本，需要升级时重新评审受影响部分。网络失败或候选不合格保留原版本并报告原因。不要每次生成都临时下载上游 main。
