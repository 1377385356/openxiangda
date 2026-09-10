---
name: openxiangda-v2
description: 使用 OpenXiangda 2.0 从模糊业务想法、已有资料或具体变更出发，通过对话发现模块、完成详细产品设计，再开发、检查和交付应用。维护 1.x 应用时使用对应的 1.x 技能。
---

# OpenXiangda 2.0

## 先理解任务

新应用或模糊业务想法先读[对话发现与产品设计](references/product-design.md)，从资料和真实流程主动提出模块建议，逐轮少量提问、复述确认并更新 AppSpec。完整首发的 PRD、旅程、逐页交互、视觉/原型、权限与架构形成权威基线后，才制定实施计划和编写业务实现。用户不知道模块时给出有理由的推荐和代价，不能把整套设计问题丢回用户。

已有资料沿用；已确认决定持续有效，冲突和新增业务含义再沟通。AI 建议、资料事实、用户确认、否决/延期和阻断问题分别记录。仅分析或原型不自动创建远端应用；既有应用按受影响范围设计，无行为修改不重做全套文档。

遇到已有 V1 项目时，先核实 V2 能力覆盖、项目是否仍在测试阶段和迁移成本；能力满足、仍在测试阶段且代价可控时，优先建议转用 V2。先做只读评估，再按项目确认详细设计、数据/流程映射、测试和回滚；迁移实施前的原项目维护仍使用匹配的 V1 引擎。

## 定位当前版本

未创建工作区时使用本 Skill 随根包发布的精确版本：

```bash
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ auth status --cwd <应用目录> --base-url <平台地址> --json
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ login --cwd <应用目录> --base-url <平台地址>
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ create <应用目录> --base-url <同一平台地址>
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ skill install --force
```

创建前把产品要求的目标平台明确带入命令，不从旧登录态推断站点。已有工作区从原绑定恢复，平台不一致时先解决登录与目标，不改 link 文件跨站创建。

进入既有项目后使用项目锁定的 `pnpm openxiangda`，先读 `context --json`。全局 Skill 的版本不代表项目版本；资料以项目 `docs` 或 MCP docs_read 返回的版本为准。不要调用可能属于 1.x 的裸全局命令，也不用 latest/alpha 替代精确版本。

## 按任务选择资料

平台契约疑问、诊断和产品/架构咨询使用同次分发的 `openxiangda-support` 技能。统一入口创建和技能刷新会检查 DWS；用 `support status --json` 查看待授权、待用户入群或可访问状态，独立应用工作继续推进。实际发送与后续操作遵循用户已有授权。

只读当前任务相关专题。以下参考由中文使用文档生成，与 CLI/MCP 正文同源：

| 任务 | 参考 |
| --- | --- |
| 安装、登录、创建、连接开发 | [开始开发](references/getting-started.md) |
| 源码仓库、换电脑、旧项目导入、提交推送与重试 | [应用源码](references/getting-started.md#应用源码)；先用 `source status` 读取实际绑定 |
| 模糊想法、模块发现、PRD、权限与架构设计 | [产品设计](references/product-design.md)、[交互模式](references/interaction-patterns.md) |
| 理解需求与选择能力 | [开发流程](references/development.md)、[架构](references/concepts.md) |
| 模型、CRUD、字段与移动表单 | [业务模块](references/application-foundation.md)、[字段](references/field-components.md) |
| 图片压缩、缩略图、附件和缓存 | [图片与附件读取](references/field-components.md#图片缩略图和附件读取)：卡片优先缩略图，原图按需，使用平台权限与缓存规则 |
| 页面、标准组件与扩展 | [前端](references/frontend.md) |
| 角色、行和字段权限 | [数据与权限](references/data-authz.md) |
| 外部无账号表单、续填、上传、本人记录 | [匿名公开访问](references/public-access.md) |
| 审批、待办、消息或事件 | [工作流与通知](references/workflow-events.md) |
| 自定义事务、校验或外部集成 | [按需后端](references/backend.md) |
| 管理成员或查看有效流程参数 | [应用管理](references/administration.md) |
| 检查、部署、生产发布与故障恢复 | [验收](references/testing.md)、[交付](references/delivery.md) |
| 需求记录与版本升级 | [全流程记录](references/appspec.md)、[升级](references/upgrading.md) |
| 选择 CLI/MCP 操作 | [命令](references/cli.md)、[MCP](references/mcp.md) |

用户仅要求分析时不自动创建或发布。无行为变化不创建需求/架构记录；按实际风险决定验证深度。技术细节在已有要求内处理，新的业务含义、权限扩大或未授权外部变更才需要用户决定，已有明确授权不重复请求。

## 引导开发并持续记录

每轮先读取当前 AppSpec 总纲、设计索引、相关能力、活动变更与契约，按稳定 ID 恢复已知事实、候选建议和未决项。设计文件相互引用而不重复定义规则；角色、权限、页面或入口范围改变时，同步受影响 PRD、旅程、交互、架构和 AC。具体工作法按需读取[产品设计](references/product-design.md)。

总纲维护领域与模型关系、PC/移动任务页面、页面/操作/行/字段权限、多角色组合和容量预算。新增功能先评估影响，普通 CRUD、流程、消息等复用平台能力。明确数据量、分页/索引、请求次数、并发/批量和延迟目标，避免无界全量读取、逐行请求与无限重试。

新应用和改变业务含义的工作，先以实际用户答复和设计内容摘要形成评审，确认 readyForImplementation 后再写实施任务；纯文案和无行为调整引用已有有效基线，不新建评审或重复确认。不能只改摘要或虚构确认让检查通过；工具结构检查不证明体验合格。本轮 ChangeSpec 关联评审、需求依据、方案、任务、源码、AC 场景和验收证据；多个变更时用提交说明 `AppSpec: <ID>` 指明本次交付。测试发布前完成设计和计划，部署后按实际角色、拒绝路径和性能样本验收。生产使用绑定测试运行及包摘要的 `appspec/verification/<运行ID>.json`。用户明确延期性能时，按 AppSpec 记录有实际授权来源和后续安排的 `performanceDeferral`，保留原失败测量并报告延期未通过；该记录不豁免功能 AC。更新当前规则后归档，保留未覆盖项、失败原因、发布指针和交接。不可编造需求确认或通过结果；参见 [AppSpec](references/appspec.md)。

## 使用当前事实

MCP 从项目锁定的 CLI 启动：

```bash
pnpm exec openxiangda --mcp-stdio --cwd <workspace>
```

先读取 workspace_context，再按需调用 docs_read、contract_describe、administration_context 或 workflow_node_configurations。docs_read 不传 topic 时返回目录，使用其中的 id 读取正文；主题 ID 与本 Skill 参考文件名一致，例如命令专题为 cli。`openxiangda://workspace/contracts` 提供契约索引；按 selector 读取正文，aiCatalogDigest 随当前声明生成。字段、角色、管理员运行参数和部署状态都取自当前结果，不把示例值当成平台默认值。

平台拥有身份、授权、业务数据、环境和部署状态。应用只声明自己的模型、页面和规则；普通 CRUD 走 Data API，标准审批和通知按需声明，真实业务动作才启用 Nest。编译器生成契约，应用不改生成输出、不维护第二份权限或能力目录。菜单建议只供初次复制到应用声明，不是运行时自动发现。

匿名访问使用 frontend.publicAccess、createAnonymousPublicClient 与平台浏览器凭证，不建立 guest 角色或公开普通 Data API。角色并集来自当前用户，Perspective 只收窄读取。

## 完成与失败

开发开始先同步绑定仓库的远端默认主分支。开发完成包括源码、生成契约与必要记录的提交、推送和主线整合；发布从干净且同步的主分支冻结候选。任务分支已推送不代表进入主线。同一工作区保持一个写者，不覆盖其他会话未提交内容。日常 dev/check 可验证未提交源码。

平台启用源码托管时，create 自动建仓并首次推送。后续每轮开发完成使用 `pnpm openxiangda source push -m "变更说明"` 提交并推送；已有提交可省略 `-m`。新电脑或初始化中断使用 `source setup`，迁入外部仓库使用 `source setup --import` 并保留原远端。凭据只存入系统凭据管理器，不手写进 URL 或项目文件；冲突按正常 Git 合并处理，不强推覆盖。

已有项目先执行 `source status`；仓库绑定和地址以平台返回为准，不猜测地址或另建个人仓库。提交前检查 Git 差异；`source push -m` 会提交所有未忽略更改，存在其他任务改动时应只提交本轮文件，再不带 `-m` 推送。源码操作使用 CLI，当前没有独立的 source MCP 工具。凭据配置成功后无需每轮重新配置；托管未启用或权限不足时保留原工作区并报告具体原因。

支持排查只有平台地址和仓库 URL 时，先运行 `source resolve <仓库URL> --base-url <平台> --json`，再用 `source clone <仓库URL> <新目录> --base-url <平台> --json` 获取源码，可选 `--branch`。无需预先创建工作区，不猜 appCode，不安装或运行应用脚本；使用当前平台登录账号与系统 Git 凭据。平台既有 `PLATFORM_ADMIN` 可管理共享服务全部仓库，应用管理员只管理对应应用仓库。完整契约见[应用源码](references/getting-started.md#应用源码)。

只验证时运行 check/check_app；授权部署时直接 deploy/deploy_app，它已经包含检查并默认跟踪平台完成，长步骤持续反馈阶段和耗时。生产显式复用成功测试运行。观察中断用 status <运行ID> --watch 或 deployment_status.watch 继续查询原运行。登录、创建及长期 dev 使用 CLI/终端，分别记录本地验证、部署激活和真实业务验收。

失败保留错误码、指针与原候选。结果不确定先查平台，不生成新的随机幂等键掩盖原运行；仅执行平台允许的恢复。升级项目后刷新资料并重启旧 MCP 连接。

指定站点授权可用 `auth status --cwd <应用目录> --base-url <平台地址> --json` 或 MCP `authorization_status` 只读核验，无需工作区。状态为 `authorized` 才证明当前 access 被平台接受；`missing`/`platform_mismatch`/`refresh_required` 需处理会话，`unauthorized` 表示平台拒绝，`unavailable` 表示暂时无法核验，不能当成过期。查询不刷新、不打开浏览器、不修改绑定；应用管理权限需另行核验。
