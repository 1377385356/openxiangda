# AppSpec：需求、设计与交付记录

AppSpec 是默认开发流程中的业务记录，保存在应用 Git 仓库。AI 负责整理需求、分析架构和性能、维护记录；产品经理主要说明目标与业务规则。当前总纲、实现声明、实际验收和平台部署各有自己的事实来源，不能互相替代。

## 资料结构

```text
appspec/
  app.md                 # 当前有效目标、规则、架构、页面、权限、容量
  product/               # 来源、范围与 PRD
  experience/            # 旅程、逐页交互
  design/                # 视觉、权限、架构与原型引用
  reviews/               # 实际确认与设计基线
  capabilities/          # 复杂后再按业务能力拆分，不要求小应用创建
  changes/active/        # 本轮需求、设计、任务、验收与交接
  changes/history/       # 完成后的变更，按年保存
  decisions/             # 需要长期引用的架构决定
  verification/          # 绑定测试版本的业务验收报告
```

新应用按[产品设计](product-design.md)完成本期详细材料和设计基线；既有变更只更新受影响范围，文案和无行为变化沿用有效基线。业务规则使用 `### REQ-*`，可观察验收使用 `#### AC-*`；ID 稳定，变更引用当前总纲或能力中的规则。声明和生成契约保存模型、字段与接口，AppSpec 不复制 Schema 全集。截图、请求轨迹等证据保留实际文件或 HTTPS 引用，不提交凭据和敏感业务数据。

## 从模糊需求到实现

1. 读取当前总纲、设计索引与相关稳定 ID，分析用户提供资料，区分事实、候选建议、实际确认、延期与冲突。
2. 主动帮助用户从真实任务发现模块，逐轮少量提问、建议与复述，已确认且未变的决定持续有效。
3. 完成本期产品、旅程、逐页交互、视觉/原型、权限和架构设计；按角色走查主任务与异常，维护容量预算与可证伪 AC。
4. ChangeSpec 的 documents 引用一份 review 设计文档；评审关联受评设计的传递引用闭包、实际确认来源和 baselineDigest。具体模板及范围规则见[产品设计](product-design.md#templates)。
5. readyForImplementation 成立后制定实施计划，关联 REQ、设计、源码和 AC；本轮任务及原有交付章节完整后 readyForTest 成立。
6. 实施、检查、测试部署、真实角色验收、生产晋级后，更新持续有效规则、实际结果和交接，再归档。

`未确认问题` 下的 `- [ ]` 表示正式交付阻断项。非阻断假设另写说明。只有章节、一个 `passed` 标记或 AI 的判断，均不能证明业务验收实际发生。

## 命令与阶段边界

```bash
pnpm openxiangda spec init
pnpm openxiangda spec new booking-window --title "限制可预约时段" --risk L2
pnpm openxiangda spec context booking-window --json
pnpm openxiangda spec check
```

已有工作区优先用 `spec new` 生成本地记录。访谈尚未创建应用时，可在 `appspec/changes/active/<变更ID>.md` 手工建草稿：front matter 使用 `schema: openxiangda.appspec/change/v1`、与文件名一致的 `id`、`title`、`status: draft`、`currentSpec: pending`、适用的 `risk`，以及 `documents: [实际评审ID]`。不必为整理设计先创建远端应用。

| 阶段或风险 | ChangeSpec 必需正文 |
| --- | --- |
| 设计阶段 | 为什么、需求依据、方案与影响、验收、性能与容量预算；引用详细权威材料并说明本轮影响 |
| 设计就绪后 | 补齐任务与实现；草稿不能冒充已可测试 |
| L2 / L3 | 另写数据与权限、回滚；引用权限和架构材料，说明适用范围或不适用理由 |
| L3 | 另写失败、并发与幂等、架构决策；需要长期决定时关联实际 ADR |
| 关闭前 | 验证与发布、交接，填写实际结果和剩余事项 |

`未确认问题` 单独保留阻断项，设计评审和实施任务按[开工顺序](product-design.md#readiness)分步完成。章节名用于定位缺口，空标题、模板提示和未执行的验收计划均不是完成证据。

有且仅有一个活动变更时自动关联。多个活动变更或引用历史记录时，在本次 Git 提交说明中加入 `AppSpec: booking-window`。格式、无行为重构可引用已有记录，在提交说明写清不改变业务行为的依据，无需制造重复文档；新的行为变化仍要更新相应变更。

| 操作 | 实际要求 |
| --- | --- |
| dev、只读分析 | 可以研究和预览，不能把原型当作已完成交付 |
| 普通 check / check_app | 技术验证照常进行，需求与设计缺口作为单独诊断返回 |
| spec context | 返回 readyForImplementation、readyForTest、评审摘要与缺口；不自动确认 |
| spec check | 严格检查当前文档、设计基线、关联变更和测试发布前的完整性 |
| 测试 deploy / deploy_app | 总纲、设计、需求依据、性能预算、AC 计划完整；尚不要求线上业务验收报告 |
| 生产晋级 | 读取指定成功测试运行的同一制品，并核对绑定该版本的实际验收报告 |
| spec close | 当前长期规则已回写，“验证与发布”和“交接”有实际结论；未发布、取消和未覆盖项明确说明 |

发布前提交、推送并合入远端默认主分支。测试部署之后的验收报告是后续提交，生产仍复用原测试包，不因主线新增报告而重新构建。参见[发布与恢复](delivery.md)。

## 测试版本的验收报告

按实际观察建立 `appspec/verification/<测试运行ID>.json`。以下仅展示格式，示例数值和结果不能作为真实证据；报告必须覆盖测试版本 AC 计划，失败和未测场景不能冒充通过。

```json
{
  "schemaVersion": "openxiangda.business-verification/v1",
  "appCode": "booking-app",
  "changeId": "booking-window",
  "sourceDeploymentId": "实际测试运行ID",
  "packageDigest": "实际包的64位SHA256",
  "recordedAt": "实际记录时间ISO8601",
  "scenarios": [
    {
      "id": "AC-BOOKING-001",
      "status": "passed",
      "actor": "实际测试身份及角色",
      "observation": "实际操作、数据条件和观察到的结果",
      "evidence": [".openxiangda/evidence/booking-001.png"]
    }
  ],
  "performance": [
    {
      "scenario": "实际测量的页面或接口链路",
      "sample": "测试环境、数据量、样本次数与测量口径",
      "targetMs": 2000,
      "observedMs": 450,
      "evidence": [".openxiangda/evidence/performance.json"]
    }
  ]
}
```

本地证据路径必须位于工作区内且文件存在；长期报告也可引用 HTTPS 证据。工具核对引用格式、版本绑定、场景覆盖与数值，不替代对截图、业务含义或外部证据真实性的评估。授权角色成功和禁止角色拒绝分别验证；支持范围之外的渠道在需求范围与未覆盖清单中明确说明。

用户明确将性能验收延期时，在同一报告增加 `performanceDeferral`：

```json
{
  "performanceDeferral": {
    "status": "deferred",
    "reason": "用户实际决定延期的原因与本期范围",
    "followUp": "后续负责方、处理安排及保留的未完成事项",
    "authorizedBy": "实际授权人；若由代理转达，注明真实来源及转达关系",
    "authorizedAt": "实际授权时间ISO8601，不能晚于报告记录时间",
    "authorizationSource": "实际用户消息或需求来源的稳定引用",
    "evidence": ["appspec/product/actual-user-decisions.md"]
  }
}
```

以上仍是格式示例，不代表发生了授权。`performance` 保留已取得的真实测量，包括超标样本；确实未测时可为 `[]`。不得仅挑选成功样本、提高目标或删除原失败来美化结果。延期原因、后续安排、授权人、时间、来源和证据必须完整；工具不从超时或 AI 判断推断授权。由代理转达用户决定时，证据应定位实际用户答复，授权时间取该决定的记录时间，报告生成时间另写 `recordedAt`。

`spec verify` / MCP 返回 `performance.status: "deferred"`、测量条数和 `overBudget` 数量；生产阶段同时显示“性能按用户授权延期（未通过）”。这表示该版本的功能验收满足本次交付范围，性能仍未通过。没有延期记录时，缺少测量或超标仍阻断；延期不能豁免任何失败、未测或缺失的 AC，也不能改变原 TEST 版本、包摘要、设计基线和生产授权。结构检查不能证明授权、证据内容或实际体验真实。

```bash
pnpm openxiangda spec verify --deployment <测试运行ID>
# 报告也可显式指定；生产晋级按运行 ID 读取默认路径
pnpm openxiangda spec verify --deployment <测试运行ID> --evidence appspec/verification/<测试运行ID>.json
pnpm openxiangda spec close booking-window --current-spec merged --summary "实际完成情况与剩余事项"
```

MCP `appspec_verify` 读取同一报告与运行事实。`spec verify` 根据当前关联需求核对；生产晋级另外从测试源码提交读取原计划，因此主线后续需求不能冒充旧版本已测内容。不得伪造用户确认、测试身份、执行结果或部署成功。官方工具的记录门槛不代表平台所有直接接口都强制执行了同一业务流程。

## 新任务找回上下文

### 架构决定的编号与创建

需要长期引用的决定写入 `appspec/decisions/` 下的 Markdown。ADR 的 `id` 格式是 `ADR-` 加**恰好四位数字**，可选 `-` 分隔的大写字母或数字后缀，例如 `ADR-0001`、`ADR-0001-DATA-OWNER`；`ADR-001` 不合法。文件名建议与 ID 一致，引用使用元数据中的 ID。当前没有独立的 ADR 创建命令，可以手工创建，随后用 `spec context <ID>` 和 `spec check` 核对。

以下是 `appspec/decisions/ADR-0001.md` 的提议示例；它不表示已经确认或可以发布：

```markdown
---
schema: openxiangda.appspec/decision/v1
id: ADR-0001
title: 业务数据的权威来源
status: proposed
---

# 业务数据的权威来源

## 问题与方案

业务记录由平台 Data API 持有，应用按当前用户权限读取；前端不另建持久业务数据库。

## 影响与验证

关联查询使用平台字段来源，验收时分别核对允许与禁止角色的真实读取结果。

## 未确认问题

- [ ] 确认本期是否存在需要独立后端事务的业务不变量。
```

ADR 状态支持 `proposed`、`accepted`、`superseded`、`rejected`；按真实决定更新，不为通过检查直接填 `accepted`。可选元数据为 `date`、`deciders`、`supersedes`、`documents`；确认依据和方案取舍写正文。变更用 `decisions: [ADR-0001]` 关联，设计材料也可用 `documents: [ADR-0001]` 引用。修正已有编号时同步相关引用并保留 Git 历史，不删除旧决定来规避检查。

### 按 ID 读取

`context` / `workspace_context` 默认返回总纲、相关变更索引、阶段缺口和下一步。`spec context` / `appspec_context` 的 context v4 默认只返回总纲正文及有界索引，按稳定 ID 加载相关能力、变更、ADR 和 DES-* 设计正文及 documents 传递引用。product/experience/design/reviews 的单层 Markdown 也进入当前资料与原测试提交读取；非 Markdown 原型只引用不执行。当前资料最多 128 文件、2 MiB，正文上下文最多 256 KiB，超出时明确诊断。

历史与当前资料独立预算，每页 50 条，使用 `--history-offset 50` 或 MCP `historyOffset` 翻页。历史索引仅读取头部，稳定历史 ID 可直接读取页外正文；归档增加不会挤掉当前资料。索引读取上限为 256 个年份目录、10 万个记录名和 5 秒，达到预算给出提示，文件不会删除。`workspaceDigest` 对应当前资料与实时契约，分页不改变它；`selectionDigest` 对应选中的具体正文与契约。

当前仓库规格不等于生产已上线功能。环境使用哪个版本从平台读取；历史用于解释演进原因，后续实现优先遵循当前有效规则。旧 alpha 记录没有设计评审时不会自动升级成已确认；补齐真实设计和评审后重新测试发布。旧 2.0 应用升级后补齐实际记录，不导入 1.x SDD，也不自动生成虚假确认或验收。
