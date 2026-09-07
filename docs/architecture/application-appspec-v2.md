# OpenXiangda 2.0 AppSpec 应用活规格

状态：历史设计（2026-08-27）。其中“可选、发布不阻断”的策略已由 2026-09-06 引导式开发方案替代。当前契约与流程以 [AppSpec 使用说明](../appspec.md) 为准；下文保留原始设计依据，不作为现行实现要求。

## 1. 问题证据

OpenXiangda 2.0 已经用 `openxiangda.config.ts`、生成合同、Data/AuthZ、AI
Catalog 和 DeploymentRun 建立了技术与运行事实源，但应用仓库没有一个稳定位置记录业务目标、
当前有效规则、验收场景和本次行为变化。AI 因而容易只从现有代码反推意图，或在多轮开发后把
临时实现当成业务需求。

1.x 的重型 SDD/OpenSpec 实践同时证明了另一侧风险：普通小改动如果必须维护 proposal、design、
tasks、evidence、release 等多份材料，文档会吞噬开发工作流并产生第二事实源。用户明确要求愿意
维护有价值的需求，但 AppSpec 只能辅助开发，不能成为普通开发和发布的主要阻力。

AppSpec 只属于 OpenXiangda 2.0。实现不得读取、识别、导入或迁移 1.x 的 `openspec/`、SDD、
表单、页面、函数或发布记录，也不提供兼容别名、双解析器或桥接命令。

### 1.1 2026-08-27 轻量收敛优化决策

本轮复核用临时工作区证实四项问题：未合入 CapabilitySpec 的长期需求可在 `close` 后退出当前
上下文；无 selector 时可返回接近 2 MiB 原文；selector digest 会被无关 AppSpec 正文改变；L3
默认占位模板可以不产生风险诊断。能力 owner 不变，仍由应用 Git 仓库保存业务意图，CLI/Devkit/MCP
只负责确定性索引、检查和归档。

本轮只修正上述三类合同，不实现 Snapshot/Blueprint，也不增加敏感信息扫描、校验、脱敏或维护要求：

- ChangeSpec 新增一个受限 `currentSpec: pending | merged | not-applicable` 字段；新建时为 `pending`，
  只有显式 `spec close` 要求开发者先选择 `merged` 或 `not-applicable`；
- `spec close` 只阻断自身，不影响普通 `check/dev/deploy`，并拒绝把仍未进入当前规格的稳定 REQ/AC
  静默移出默认上下文；
- AppSpec context 升级为 `openxiangda.appspec/context/v2`，默认返回有界索引，指定 selector 才加载
  相关正文；扫描上限与 AI 输出上限分离；
- context 分别返回全工作区 `workspaceDigest` 与相关选择 `selectionDigest`；无关 AppSpec 正文不能改变
  已选业务上下文的 `selectionDigest`；
- 显式 `spec check` 把 L2/L3 缺失或仍为默认占位的必需内容视为错误，普通应用 `check` 仍统一降级
  为 warning；
- 失败时不写归档文件；同名历史仍不覆盖。回滚只需恢复 context v1 输出和旧模板字段，不涉及平台、
  AppPackage、数据库或运行态迁移。

## 2. 能力 owner 与事实边界

| 事实 | 唯一 owner |
| --- | --- |
| 业务目标、当前有效需求、验收行为和变更意图 | 应用 Git 仓库的 `appspec/` |
| 资源、字段、页面、权限、动作和可选模块声明 | `openxiangda.config.ts` |
| 编译合同、Surface 和 AI Catalog | OpenXiangda 编译器 |
| AI 如何发现、读取和维护 AppSpec | 同版本 `openxiangda-v2` Skill |
| AppSpec 读取、索引、轻量校验和归档 | CLI/Devkit/MCP |
| 代码、测试和构建结果 | 应用工作区 |
| AppVersion、部署、环境 Head 和运行状态 | 平台 |

AppSpec 描述可观察的业务意图并引用稳定资源/动作 code；它不复制字段物理类型、生成 Surface、
授权结果、AI Catalog、部署清单或平台运行态。Skill 不是需求事实源，只提供工作方法和模板。

## 3. 稳定不变量

1. **默认可选**：没有 `appspec/` 的既有应用继续正常 `dev/check/deploy`，不产生错误或警告。
2. **普通检查不阻断**：`openxiangda check` 可以展示 AppSpec advisory，但 AppSpec 的缺失、格式或
   质量问题不能使应用检查、构建或部署失败。
3. **显式检查才严格**：只有用户或 AI 主动运行 `openxiangda spec check` 时，结构损坏、重复 ID、
   无效引用等确定性错误才返回失败。
4. **一项变更一份材料**：L1 小改最多维护一个简短 ChangeSpec；不默认创建 proposal/design/tasks/
   evidence 文件树。
5. **按风险增量加深**：L2/L3 才要求权限正反例、数据/副作用、失败/并发/幂等和回滚内容。
6. **用户确认不可推断**：AI 可以起草 `draft`，不能自行把业务需求标记为 `confirmed`。
7. **当前规格优先**：历史变更默认不进入 AI 上下文；关闭变更前由开发者或 AI 更新当前
   CapabilitySpec，并由用户确认 `currentSpec` 已合并或不适用；历史只解释为什么变化。
8. **没有第二套发布门禁**：AppSpec 不进入 AppPackage，不参与平台激活，不取代现有测试、部署和
   回滚证据。

## 4. 工作区合同

```text
appspec/
  app.md
  capabilities/
  changes/
    active/
    history/<year>/
  decisions/
```

人工维护的文档只有四类：

- `openxiangda.appspec/app/v1`：一个应用一份总纲；
- `openxiangda.appspec/capability/v1`：按业务能力维护当前有效需求；
- `openxiangda.appspec/change/v1`：本次行为增量、风险和验收；
- `openxiangda.appspec/decision/v1`：只记录架构显著决定。

文档使用 Markdown 加受限 YAML front matter。机器字段只保存 schema、稳定 ID、状态、风险以及
引用的 capability/requirement/resource/action/decision code；详细内容保持可读 Markdown。CLI 只
解析受限子集，不引入另一个通用文档引擎。

生成索引和上下文只存在于命令/MCP 返回值；首版不提交第二份 `index.json`、receipt 或 blueprint，
避免生成物漂移。未来导出 Blueprint 必须从当前 AppSpec 与实时编译合同确定性生成。

## 5. 风险档位

| 档位 | 典型变化 | 最小材料 |
| --- | --- | --- |
| L0 | 重构、格式、依赖、无行为变化 | 不创建 ChangeSpec |
| L1 | 文案、单字段、单页面、局部规则 | 一份简短 ChangeSpec，默认档位 |
| L2 | 跨页面、跨资源、权限或状态变化 | 影响范围、正反验收、数据与回滚 |
| L3 | 身份授权、迁移、并发、外部副作用 | L2 加失败/并发/幂等和 ADR |

风险档位是维护深度提示，不进入普通 `check/deploy` 硬门禁。显式 `spec check` 对 L2/L3 缺失内容
给出可操作诊断。

## 6. CLI 与 MCP 合同

只增加一个顶层 `spec` 命名空间：

```bash
pnpm openxiangda spec init
pnpm openxiangda spec add-capability <id> --title <title>
pnpm openxiangda spec new <change-id> --title <title> [--risk L1|L2|L3]
pnpm openxiangda spec context [change-or-capability-id] --json
pnpm openxiangda spec check --json
pnpm openxiangda spec close <change-id> --current-spec merged|not-applicable [--summary <text>]
```

- `init`、`add-capability`、`new` 和 `close` 只写当前工作区；不访问平台。
- `context`、`check` 只读。
- `new` 在 AppSpec 尚未初始化时幂等补齐最小目录和 `app.md`。
- `close` 只把 active ChangeSpec 移动到年度历史目录并原子写入关闭摘要；它不修改代码、平台状态或
  CapabilitySpec，也不假装完成验收；`currentSpec` 仍为 `pending`、稳定 REQ/AC 未进入当前规格或
  L2/L3 必需内容仍为空时不归档。

Workspace MCP 增加只读资源 `openxiangda://workspace/appspec` 和工具 `appspec_context`。返回值明确
包含 `enabled`、`mode: "advisory"`、`releaseGate: false`、有界索引、按 selector 选择的当前文档、
实时合同摘要、`workspaceDigest`、`selectionDigest`、上下文预算状态和诊断。没有 AppSpec 时返回正常的
`enabled: false`，而不是错误。默认无 selector 时只返回应用总纲正文和其余文档摘要；能力、变更、ADR
或历史变更正文必须通过稳定 ID 按需读取。

## 7. 失败、并发与资源边界

- 单文件最大 256 KiB、总读取最大 2 MiB、最多 128 个 Markdown 文件、每目录最多扫描 256 个条目；
  历史只允许 `history/<year>/*.md` 一层结构，超限停止读取并返回稳定诊断。
- AI context 正文预算独立限制为 256 KiB；优先返回 selector 主文档，再按相关性加入应用总纲、能力、
  活跃/历史变更和 ADR。超出预算的文档保留在索引并返回稳定 warning，不截断 Markdown 正文。
- 只读取 `appspec/` 预期目录下普通 `.md` 文件；拒绝符号链接、路径穿越和未知文件类型。
- `new/add-capability` 使用排他创建，绝不覆盖同名文件。
- `close` 在同一工作区内 rename；目标已存在则失败，不覆盖历史。
- 多个会话同时编辑同一 Markdown 仍由 Git/工作区 writer 规则协调；AppSpec 不建立第二套锁服务。
- front matter 只支持字符串、布尔值和字符串数组，不执行代码，不解析任意 YAML tag。
- AppSpec 不承担敏感信息治理，不扫描、校验或脱敏文档内容；CLI/MCP 按仓库原文返回选中的 Markdown。

## 8. 验证

实现必须用测试证明：

1. 无 `appspec/` 的现有模板执行普通 `check` 不受影响；
2. `init/new/add-capability/context/check/close` 在临时工作区可重复执行且不覆盖文件；
3. 重复 ID、非法 schema、超限文件和无效资源/动作引用产生稳定诊断；
4. 普通 `check` 将所有 AppSpec error 降级为 warning，显式 `spec check` 保持 error；
5. MCP 可读取 AppSpec，且没有 AppSpec 时正常返回 disabled；
6. Skill、模板 `AGENTS.md`、CLI 帮助和 MCP 指令都说明 AppSpec 是辅助而非发布门禁；
7. 模板仍满足文件/字节复杂度预算。
8. `currentSpec=pending`、未合入当前能力的 REQ/AC 和 L2/L3 默认占位内容不能通过显式关闭/检查；
9. 默认 context 只返回索引，历史 ID 可按需读取，正文输出不超过独立预算；
10. 修改无关 AppSpec 正文会改变 `workspaceDigest`，但不会改变已选上下文的 `selectionDigest`。

## 9. 兼容、回滚与 blast radius

- 1.x 应用、1.x SDD、平台数据库、Data API/AuthZ、AppPackage 和 DeploymentRun 零改动。
- 新 2.0 模板只增加一个简短 `appspec/app.md`；既有 2.0 应用按需 `spec init`。
- 删除 CLI `spec` 命令、MCP AppSpec 资源、Skill reference 和模板目录即可回滚；应用运行合同和平台
  数据不需要迁移。
- AppSpec schema 在 v1 内只做向后兼容的解析扩展；预发布阶段若模型错误，可以破坏性替换并由
  `spec init/context` 给出明确迁移建议，不维护双写。
