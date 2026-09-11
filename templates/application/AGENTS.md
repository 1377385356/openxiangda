# 应用开发约定

<!-- OPENXIANGDA:BEGIN -->
## 平台约定

本项目使用 OpenXiangda 2.0。进入项目后以本地精确依赖和锁文件为准，使用 `pnpm openxiangda`；先运行 `context --json` 确认版本和绑定，使用 `docs` 按任务读取当前中文资料。

- 模型、页面、导航和权限由应用声明一次；编译器生成契约。业务代码不改生成结果、不创建 platform/data、不复制平台 Router、字段组件、客户端或权限状态。
- 当前用户、角色并集、数据授权和部署状态归平台；应用不保存凭据或授权快照。普通 CRUD 走 Data API，真实业务动作才按需启用 Nest。
- 标准业务字段使用 `openxiangda/field-kit`；PC 补充控件使用 antd，移动使用有作用域的 `openxiangda/mobile` 和 MobileSurface，不引入上游全局重置。
- 界面开发默认按 docs design-workflow 使用原版 OpenDesign 桌面和 design cli先设计整体视觉、可运行原型并实际走查，再实现。设备由真实任务决定；复用 Shell 导航事实、标准字段行为，通过 ui 和局部样式应用设计，不复制权限或导航状态。原型和 tokens 以 AppSpec assets 固定。模板 /home 不替代页面选型。
- 应用默认先建立并保留标准管理后台：后台 Shell、显式菜单、资源表单、数据列表、详情/编辑、权限和流程入口是应用骨架。OpenDesign 可优化后台外观但不能替换后台；用户端 PC 与移动端可分别使用 OpenDesign 的完整视觉和交互，通过 runtime/Data API 读取后台数据。禁止用单页 HTML、iframe 或独立假后台替代后台，发布前分别验收后台与用户端入口。
- 图表等专业交互先检查现有依赖并评估成熟组件/开源库，报表优先评估 ECharts，按需加载并释放实例；平台数据、权限与聚合仍通过官方能力。详见 docs frontend。
- 入口与导航验收从平台应用列表开始，检查应用根路径、后台首个有权菜单、登录返回及刷新深链接；不能只验证开发者给出的业务链接。
- 无账号表单读取 `docs public-access`，使用 frontend.publicAccess 和专用客户端；标准审批、通知和后端均按需启用。
- 日常使用 dev 和聚焦测试。只验证时使用 check；授权部署时直接 deploy，它已包含检查、测试和构建。生产必须指定成功测试运行并复用同一版本。
- deploy 默认持续反馈并跟踪平台结果；观察中断用 status <运行ID> --watch 继续，保留原运行，不重新构建。平台部署成功后仍需真实角色业务验收。
- 开发开始先同步远端默认主分支；同一工作区只有一个写者。发布前将本轮源码、生成契约与记录合入并推送主分支，从干净且同步的主分支冻结候选；任务分支已推送不等于已合入主线。不要覆盖其他会话改动或自动合并所有分支。
- 默认读取 AppSpec 当前规格、设计索引、活动变更和阶段缺口。新应用先用自然语言对话主动发现模块，完成本期 PRD、旅程、逐页交互、视觉/原型、权限与架构设计及实际确认，形成内容摘要绑定的评审基线后再制定实施计划和实现业务；参见 docs product-design 和 docs interaction-patterns。既有应用仅修订受影响设计，不把 AI 建议写成用户确认。总纲保存长期规则，本轮变更关联需求、任务、源码与 AC 验收；测试发布前完成设计与计划，生产晋级前保存绑定原测试运行及包摘要的实际验收报告。更新当前规则、验证与发布结果和交接后归档；不得编造确认或通过结果。
- 根据变化风险记录业务意图。无行为变化引用已有记录；已有授权和已确认意图不重复向用户请求机械确认。真实角色和浏览器验收与本地测试分别记录。
- 失败保留错误码、指针和原候选；查询平台状态后使用允许的恢复操作，不自动重放未知结果。
- 平台契约、诊断和产品/架构咨询按 openxiangda-support 技能持续跟进已授权案例。使用 support status 查看 DWS 接入状态；待 OAuth、钉钉入群或网络恢复不阻塞独立开发，后台续跑以实际宿主监听/定时配置为准。

MCP 使用同一项目 CLI：`pnpm exec openxiangda --mcp-stdio --cwd <workspace>`。先读取 workspace_context，再按任务读取 docs_read 和当前契约。登录、创建及长期 dev 使用 CLI/终端。

详细用法：`pnpm openxiangda docs product-design`、`docs interaction-patterns`、`docs development`、`docs frontend`、`docs data-authz`、`docs administration`、`docs testing`、`docs delivery`。按需加载，无需每次通读全部资料。
<!-- OPENXIANGDA:END -->

## 项目自有约定

在此补充本项目的业务范围和团队要求；平台资料刷新保留本节内容。
