# 发布链路优化与 CI 化方案（提案）

日期：2026-09-13
状态：Phase 1-3 代码与 workflow 已实施（见文末"实施状态"）；剩余为两个仓库管理员动作后即可试点
范围：`tools/openxiangda-v2` 发布火车（changesets → verify:release → npm → tag/GitHub Release → 回执 → 根仓 gitlink），不含平台镜像/OSS 发布线（那是根仓 `smart-build-and-push` 的职责，边界不变）。

---

## 一、问题证据：2.17.0 → 2.18.1 三个版本的发布实录

按根因分四类。A=代码/设计缺陷；B=网络与外部依赖；C=流程人工环节；D=平台侧（另行立项）。

### A 类（已修复，2.18.1 已携带）

| # | 问题 | 后果 | 修复 |
| --- | --- | --- | --- |
| A1 | `sameReleaseLine` 比较全部三位版本号 | 正式补丁（2.18.1 对 2.18.0）永远"无可比前驱"，增量门禁只对同补丁预发布链生效，每次正式发布都全量矩阵 | 发布线改为 major.minor（commit 5fdd348b） |
| A2 | tarball 差异路径是 `dist/`，浏览器前缀写的是 `src/` | 浏览器 JS 修复匹配不上前缀，浏览器门禁该跑不跑（fail-open 方向性错误；只有 .css 碰巧命中） | 差异路径投影回源码布局再比对 |
| A3 | 浏览器矩阵未覆盖用户面别名清单形状 | 2.18.0 用户标准面应用整页空白仍通过全部门禁发布 | 新增 `user-surface.e2e`（在 2.18.0 上 4/4 全挂、修复版 4/4 过），已入发布门禁 |
| A4 | 2.17.0 用户声明三连错（冒号码、契约闭合、bundle 剥离） | 发布即坏，返工一轮 | 共享校验器按配置事实合并路由（2.18.0 携带） |

### B 类（未根治：网络与外部依赖）

| # | 问题 | 实录 | 根因 |
| --- | --- | --- | --- |
| B1 | npm 元数据收敛超时 | 2.17.0、2.18.0、2.18.1 连续撞上（共 4 次） | `waitForObservation` 只给 10 次尝试、指数退避 250ms→4s，总预算约 **24 秒**；而 npm 写入成功后元数据经 CDN 异步传播，读回可见常需分钟级。发布写入从未失败，失败的全是"确认成功"这一步 |
| B2 | cdn.sheetjs.com 瞬断 | 本轮 verify:release 因 `xlsx-0.20.3.tgz` ECONNRESET 整轮报废重跑 | `openxiangda` 包的 xlsx 依赖是 SheetJS 官方 CDN 直链 tarball（npm registry 上该包停更，作者只发自家 CDN），单点且在境内网络不稳 |
| B3 | verify 步骤超时 | 多轮 `timeout/interrupted`，需放宽 `OPENXIANGDA_RELEASE_VERIFY_TIMEOUT_SECONDS` 重跑 | 默认预算偏紧 + 本机负载（同机还跑着 dev/浏览器验收） |

### C 类（未根治：流程人工环节——"链路长"的主体）

一次正式发布的**固定手工序列**（以 2.18.1 为例，跨 3 个仓库）：

1. 写 changeset + 发布说明 JSON → commit → push（工具链仓）
2. `pnpm release:version` 物化版本 → 评审 diff → commit → push
3. 参考仓 `reference:install:from-build` 重物化 → commit → push（参考仓）
4. `pnpm release:plan` 人工读计划确认分级合理
5. `pnpm verify:release`（失败则回到上一步；典型失败：B1/B2/B3、参考锁过期）
6. `pnpm release:publish`（B1 收敛超时 → 人工 `npm view` 观察 → 重跑从回执恢复）
7. `release:sync-reference` 核对参考锁
8. 根仓钉 gitlink → commit → push
9. demo 升级钉版 + e2e + check + 浏览器验收（验证侧，保留）

其中 1-8 全是"搬运确定性信息"的环节：**没有任何一步需要人的判断，只有第 2 步的 diff 评审和第 4 步的计划确认需要人看**。其余步骤消耗的是时长与出错面：

| # | 问题 | 实录 |
| --- | --- | --- |
| C1 | 人工序列 ≥8 步、跨 3 仓、每步都可因工作区不洁/声明不同步失败 | `APPLICATION_SOURCE_REVISION_MISMATCH`（demo dirty）、`WORKSPACE_ENGINE_PIN_MISMATCH`（版本钉四处：根 package.json、apps/web/package.json、lockfile、node_modules） |
| C2 | 参考锁手工重物化 | `REFERENCE_LOCK_ARTIFACT_INTEGRITY_MISMATCH` ×2：候选字节一变，参考仓必须人工跑物化+提交+推送，漏做则 verify 全轮报废在最后阶段 |
| C3 | 收敛超时的人工恢复 | 每次 B1 都需要人工判断"包其实已发布"再重跑 |

### D 类（平台侧/工具链 DX，独立立项，不在本方案实施范围）

| # | 问题 | 证据 |
| --- | --- | --- |
| D1 | 预发应用运行时不物化 | supplies-demo 的 deploy/start 均报 succeeded 但 `targetReplicas: 0`、K3s 无 workload、`/view/<appCode>/` 503；对照 campus-repair 有 pod 且 200。疑似平台缩容/清理策略或 start 副本语义 |
| D2 | devkit 公共出口缺 `materializeApplicationModules` | szgh gap 文档抱怨：只能从 dist 文件路径引入（exports 不暴露子路径） |

### 已解决部分的实效（2.18.1 实测）

- 门禁分级真正可达（A1/A2 修复后，计划正确识别"根包浏览器字节变化→e2e"而非全量 fail-closed）
- 阶段缓存复用：脚本测试 6s、技能检查 1s、文档 8s
- 全轮 verify:release 约 **11 分钟**（含浏览器矩阵真实执行）；此前同类轮次显著更长

**结论：结构性缺陷已修且见效；但"链路长"的主体（C 类人工环节 + B 类网络脆弱性）没有解决。2.18.1 一轮仍是 8+ 步手工推进、3 次环境类失败恢复。本方案主体即消除 C 类、把 B 类迁移到可靠执行环境。**

---

## 二、目标架构：本地 → GitHub → GitHub Actions → npm

### 设计原则（不变量）

1. **发布字节 = 验证字节**：verify 冻结的候选 tarball 就是 npm 收到的字节；CI 单 job 内完成"验证→发布"，或经 artifact 传递时强制 integrity 校验。
2. **版本选择仍由 changesets 确定性驱动**：人只评审 Release PR 的版本 diff；CI 与 AI 都不在发布时刻选版本（比现行"AI 不得选版本"更强的满足）。
3. **npm 凭据零长期持有**：npm Trusted Publishing（OIDC）绑定 仓库+workflow+environment；维护者本机不再持有 publish token；AI 会话在任何环境都不持有 npm 凭据。
4. **本地角色降级**：本地从"发布执行者"降级为"变更发起者 + 逃生通道（break-glass）"。
5. **根仓 gitlink 与平台配套保持独立可审计**：最后阶段才考虑自动化，且必须是"机器人开 PR、人合并"。

### 目标流程

```
本地          提交变更 + changeset + 发布说明 JSON → push master
GitHub       Changesets action 自动开/更新 Version Pull Request（版本物化 diff）
人            评审并合并 Version PR（唯一的发布决策点）
Actions      release workflow（environment: npm, concurrency 单飞）:
               checkout 合并提交 → 断言版本已物化、changeset 已消费
               → 参考仓物化（bot 提交推送，见 4.6）
               → pnpm verify:release（全量，含浏览器矩阵；全部离线 mock）
               → OIDC npm publish（7 包，字节=验证字节）
               → 收敛观察（放宽窗口；runner 到 npm registry 网络好）
               → git tag + GitHub Release（制品来源表：提交/版本/SHA-256）
               → 回执归档（见 4.7）
人/机器人     根仓 gitlink PR（Phase 4 前，人工）
```

发布决策从"本地跑一条 8 步命令链"变成"合并一个 PR + 批准一个 environment"。

---

## 三、可行性分析（逐项核实）

| # | 前提 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 仓库已在 GitHub、master 单分支直干 | ✅ | 权威远端 1377385356/openxiangda |
| 2 | 版本物化是确定性输入 | ✅ | changesets + 根/cli 耦合断言（`assertBootstrapReleaseCoupling`）已是机器可执行规则 |
| 3 | npm 支持 OIDC trusted publishing | ✅ GA（2025-07 起），配置 repo+workflow+environment 绑定，`id-token: write` 即可，无长期 token；我们 7 个包均已存在于 registry（无新包的鸡生蛋问题） | npm 官方文档 docs.npmjs.com/trusted-publishers；GitHub Changelog 2025-07-31 |
| 4 | 浏览器门禁在 CI 可离线跑 | ✅ 已核实 | `data-api-live` 默认 skip（需显式 `OPENXIANGDA_LIVE_DATA_API=1` + 本地 PG 桥），其余套件全部 playwright 路由 mock；runner 需装 chromium（`playwright install chromium`，门禁脚本已有此步骤） |
| 5 | 回执归档兼容 CI checkout | ✅ | `git rev-parse --git-common-dir` 在普通 checkout 即 `.git`，无需本地 submodule 结构 |
| 6 | 发布外部依赖面小 | ✅ 已核实 | 只有三类：`npm publish`、git push tag、`gh api`（GitHub Release）；**无 OSS**（OSS 属平台镜像线，不在本链路） |
| 7 | 参考应用仓可自动化 | ⚠️ 需要第二仓写凭据 | 参考 `openxiangda-v2-reference-app` 是独立 GitHub 仓；`GITHUB_TOKEN` 只限本仓，需 GitHub App（contents:write，单仓）或 PAT；见 4.6 |
| 8 | pnpm/npm 兼容 OIDC | ✅ | 发布步用的是 `npm publish`（release-package-state 中 `npm([... "publish"...])`），npm CLI 原生支持 OIDC provenance；避免在发布步换 `pnpm publish` |

### 与现行治理约定的冲突与修订

| 现行约定 | 冲突 | 修订为 |
| --- | --- | --- |
| "npm 发布只从可信维护者本机" | 直接冲突 | "npm 发布只从受 environment 保护的 release workflow（OIDC trusted publishing）；维护者本机不持有 publish 凭据；本地通道仅 break-glass 且需显式声明"。**安全性提升**：凭据暴露面从个人本机（token 落盘）缩小为 npm 侧绑定的 workflow 身份 |
| "AI 不得在发包时选版本" | 无冲突，更强满足 | 不变；CI 只执行已评审的物化版本 |
| "verify:release 是发布候选门禁" | 无冲突 | 门禁逻辑不变，只是执行位置从本机移到 runner；字节冻结/integrity 校验语义原样保留 |
| 根仓 gitlink 钉 master 提交 | 无冲突 | 保持人工或机器人 PR，CI 不直接写根仓 |

### 已知风险与 gotcha（npm/生态侧）

- Trusted publisher 绑定必须与 workflow 路径/environment 名**完全一致**，改 workflow 文件名/路径会使发布失败（fail-closed，可接受；改名前必须同步 npm 侧配置）。
- OIDC 与 Yarn 有兼容性问题报告——我们用 npm CLI 发布，规避。
- npm 版本不可撤销：靠 environment 人工批准 + Phase 2 用 alpha tag 演练双重防线；出事故走 dist-tag 回退 + 补丁版本。

---

## 四、分阶段实施计划

每阶段独立可回滚；Phase 0-2 不改变现有本地通道，双轨并行。

### Phase 0：信任与凭据建立（~0.5 天）

1. GitHub 建立 `npm` environment：required reviewers = 维护者；并发保护。
2. npm 侧为 7 个公开包配置 trusted publisher：仓库 `1377385356/openxiangda` + workflow `release.yml` + environment `npm`。
3. 决定参考仓 bot：GitHub App（推荐，最小权限 contents:write 单仓）或细粒度 PAT；secret 只进参考仓/工具链仓 Actions secrets。
4. 盘点并清点现有本地 npm token：标记 Phase 3 撤销。

### Phase 1：CI 验证复刻（~1-2 天，零发布风险）

1. 新增 `.github/workflows/release-validation.yml`：`workflow_dispatch` + push tag 前缀触发；ubuntu-large（浏览器+磁盘预算）；`pnpm install --frozen-lockfile`（pnpm store 缓存）→ 参考仓 checkout + `reference:install:from-build`（先允许 job 内自动 commit+push 用 bot 凭据）→ `verify:release`。
2. 脚本适配点（小改、不破坏本地）：
   - `gh api` 认证注入方式：支持 `GITHUB_TOKEN` 环境变量（`gh` 原生读取）——已天然兼容，核对无硬编码 host。
   - 收敛窗口参数化：`OPENXIANGDA_PUBLISH_CONVERGENCE_SECONDS`（默认放宽到 300s；本地同享）+ 读回加 `--prefer-online`（B1 的永久修复，本地 CI 双受益）。
3. 连续 2-3 个真实版本双轨对照：CI 验证结果 vs 本地验证结果一致（含浏览器矩阵时长采样，评估 runner 规格与缓存策略）。

#### runner 依赖缓存策略（回应"每次是否重新下载依赖"）

runner 每次是全新虚拟机，不配缓存则每次全量下载；按下列三层配置后，只有首次与依赖变更时发生真实下载：

| 层 | 内容 | 缓存 key | 冷/热开销 |
| --- | --- | --- | --- |
| 1 | pnpm store（工作区全部依赖） | `pnpm-lock.yaml` 哈希（`actions/setup-node` 的 `cache: pnpm`） | 冷 ~3-5 分钟 / 热 ~30-60 秒 |
| 2 | Chromium 二进制（`playwright install chromium`） | playwright 版本串 | 冷 ~1 分钟 / 热 秒级 |
| 3 | 验收应用安装（fresh-app 门禁） | 不缓存（设计使然），但共享同 job 的 pnpm store：依赖从 store 硬链接，registry 只剩元数据 + 7 个候选 tarball | 每次 ~1-2 分钟，且 runner 到 npm registry 同机房级网速 |

刻意**不缓存**的部分：浏览器矩阵、参考应用构建、新应用安装检查——它们是"发布字节=验证字节"的门禁本体，缓存掉就失去意义。预期端到端：冷启动首轮 ~20 分钟，之后每次 10-15 分钟且耗时可预测（不受本机负载影响）。仓库为公开仓，Actions 分钟数在免费配额内。

### Phase 2：发布试点（~1 天，alpha 演练）

1. `release.yml` 增加 environment `npm` + `id-token: write`，publish 步 OIDC。
2. 制造一个 prerelease changeset（如 `2.19.0-alpha.0`）走完整链：合并 Version PR → CI 验证 → OIDC publish（alpha tag）→ tag/GitHub Release（prerelease 标记）→ 回执归档。
3. 人工 `npm dist-tag` promote 演练；验证回执 integrity 与 CI 发布字节一致。
4. 演练 B1 场景：CI 上收敛观察日志确认窗口放宽后不再人工恢复。

### Phase 3：正式切换（~0.5 天）

1. 第一个正式版本走 CI 发布；本地 `release:publish` 加环境断言：非 `--break-glass` 且无 CI 标记时拒绝执行（防止双发布通道竞态）。
2. 撤销/降权维护者本机 npm token；`release:sync-reference`、根仓 gitlink 仍人工（Phase 4 处理）。
3. 治理文档更新：AGENTS.md / docs/delivery.md / README 的发布章节按新流程重写。

### Phase 4：收敛人工尾巴（可选，~1-2 天）

1. 参考仓物化 PR 化：release workflow 用 bot 向参考仓开 PR，人一键合并（替代 job 内直推，审计更清晰）。
2. 回执归档改造：`openxiangda-release-history` 提交到仓库分支（或 GitHub Release asset 附回执 JSON），CI 自动完成，不再依赖本地 `.git` 目录。
3. 根仓 gitlink PR 机器人：GitHub App 在发布完成后向根仓开 gitlink PR（内容=已发布提交哈希），人合并。平台镜像/OSS 线保持现状。

### 验收标准（可证伪）

1. 一个正式版本从"合并 Version PR"到"npm latest 可见 + GitHub Release + 回执归档"，**零人工命令**，端到端 ≤30 分钟。
2. 发布过程维护者本机 `npm whoami` 未登录也能完成（凭据零持有）。
3. 连续 2 个正式版本 CI 全绿，dist-tag 与 changesets 计划一致，回执 integrity = npm `dist.integrity`。
4. 本地 `verify:affected` 开发循环不受任何影响。
5. break-glass 通道演练一次可用（文档化步骤可复现）。

---

## 五、遗留问题优化计划（不依赖 CI 化，可先行/并行）

| 优先级 | 项 | 内容 | 批次建议 |
| --- | --- | --- | --- |
| P1 | 收敛窗口放宽 + `--prefer-online` | `waitForObservation` 预算参数化（默认 300s），读回绕本地缓存；B1 永久修复，本地/CI 双受益 | 随 Phase 1 一起（先行可独立做） |
| P2 | `release:prepare` 聚合命令 | 把"changeset 校验→物化→参考锁物化→提交→推送"串成一个命令，人工从 8 步降到 3 步（写 changeset / 评审 PR / 批准 environment）；即使不做 CI 化也值得 | 独立小批次 |
| P3 | 发布锁自动清死锁 | 锁文件 owner pid 探活，启动时自动清理已死进程的残留锁（已有人工核验流程，自动化之） | 独立小批次 |
| P4 | xlsx 去 CDN 单点 | vendored tarball 入仓（或镜像锁定 + lockfile integrity 保持不变）；消除 sheetjs CDN 单点（B2） | 独立小批次，注意包字节变化会触发浏览器门禁（正常） |
| P5 | 预发运行时物化排查 | 平台侧：`deploy/start` 报 succeeded 但 `targetReplicas:0`、无 workload、503；对照 campus-repair 1/1。查 start 副本语义与 lifecycle-cleaner 策略 | 平台仓独立立项 |
| P6 | devkit 公共出口补 `materializeApplicationModules` | szgh 模块化迁移 DX（gap 文档验收条件涉及）；下个 minor | 工具链下个 minor |
| P7 | 版本钉声明单源化 | 引擎钉版本声明由 generator 统一写入（根 package.json / apps/web / lock 同源），消除 `WORKSPACE_ENGINE_PIN_MISMATCH` 类四处同步错误 | 工具链小批次 |

---

## 六、结论

- **链路长的问题现状**：结构性根因（A 类）已在 2.18.1 修复并实测见效；但人工环节（C 类）与网络脆弱性（B 类）未解决——本方案以 CI 化消除 C 类主体、以 runner 环境 + P1/P4 消除 B 类。
- **GitHub Actions 可行性**：高。全部前提已逐项核实（确定性 changesets、离线浏览器门禁、小外部依赖面、npm OIDC GA、既有回执/字节冻结机制天然适配 CI）。
- **节奏**：Phase 0-3 合计约 3-4 个工作日即可完成"本地退位、CI 发布"；Phase 4 为锦上添花。建议按 0+1 / 2+3 / 4+文档 三个交付批次推进，每批独立验收与回滚。

## 参考

- npm Trusted Publishing 官方文档：https://docs.npmjs.com/trusted-publishers/
- GitHub Changelog：npm trusted publishing with OIDC GA（2025-07-31）：https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/
- Changesets + Trusted Publishing 实践：https://www.adebayosegun.com/blog/changesets-and-trusted-publishing-on-git-hub-actions

---

## 七、实施状态（2026-09-14 更新）

### 已完成

| 项 | 内容 |
| --- | --- |
| P1 收敛修复 | registry 读回统一 `--prefer-online`；收敛观察预算参数化 `OPENXIANGDA_PUBLISH_CONVERGENCE_SECONDS`（默认 300s，30-1800s 夹取），替换原 ~24s 固定轮次 |
| break-glass | `OPENXIANGDA_RELEASE_REQUIRE_CI=1` 时本地 `release:publish` 默认拒绝，紧急通道需显式 `OPENXIANGDA_RELEASE_BREAK_GLASS=1`（默认未开启，Phase 3 切换后生效） |
| release-validation.yml | Phase 1：GitHub runner 完整复刻 `verify:release`（不写 npm/tag/Release）；参考仓先物化推送再验证；已实跑确认接线与快速失败正确 |
| release.yml | Phase 2/3：`environment: npm` + OIDC Trusted Publishing 发布；同 job 验证→发布→tag→GitHub Release→回执 artifact；`id-token: write` |
| version-pr.yml | changesets 版本物化 PR 自动化（dispatch-only，试点后再开自动触发） |
| npm environment | `npm` environment 已创建（required reviewers 待仓库管理员在 UI 添加） |
| 参考仓迁移 | 参考应用权威远端从 `http://code.syedu.tech`（明文 + 证书不匹配，无法安全承载 CI 凭据）迁至 GitHub 私有仓 `1377385356/openxiangda-v2-reference-app`；本地 checkout origin 已切换，历史镜像完整 |

### 等待仓库管理员的两个动作

1. **npm 侧为 7 个包配置 Trusted Publisher**（npmjs.com → 包页 → Settings → Trusted Publisher，逐个添加，值完全一致）：
   - Repository：`1377385356/openxiangda`
   - Workflow filename：`.github/workflows/release.yml`
   - Environment：`npm`
   - 包清单：`openxiangda`、`openxiangda-cli`、`openxiangda-contracts`、`openxiangda-devkit-core`、`openxiangda-mcp`、`openxiangda-nest`、`openxiangda-skill-kit`
2. **参考仓写凭据**：创建 fine-grained PAT（仅授权 `1377385356/openxiangda-v2-reference-app`，权限 Contents: Read and write），添加为 `1377385356/openxiangda` 的 Actions secret `REFERENCE_REPO_TOKEN`（Settings → Secrets and variables → Actions）。
3. （推荐）environment `npm` 添加 required reviewers，使 CI 发布需要人工批准。

完成 2 后触发 `release-validation` 全量跑通；完成 1+2+3 后按 Phase 2 用 prerelease changeset 做发布试点。

### 治理修订（随 Phase 3 生效）

"npm 发布只从可信维护者本机"修订为："npm 发布只从受 environment 保护的 `release.yml`（OIDC Trusted Publishing）；本地通道默认关闭（`OPENXIANGDA_RELEASE_REQUIRE_CI`），紧急发布走显式 break-glass 并在回执记录原因；AI 会话在任何环境都不持有 npm 发布凭据。"
