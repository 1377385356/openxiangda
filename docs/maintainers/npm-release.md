# npm 工具链发布规则

此页是工具链维护者的当前操作规则。应用 TEST 发布和生产晋级分别使用 [应用交付](../delivery.md)，平台镜像/OSS/站点更新使用平台根仓库 `docs/operations/incremental-release.md`。历史 ADR 和发行记录用于追溯，不能覆盖此页。

## 来源与职责

权威源码是 GitHub `1377385356/openxiangda` 的 `master`。七个公开包独立版本化，Changesets 决定版本和内部依赖；artifact manifest 冻结 tarball 字节，原 release receipt 记录发布阶段，npm registry 拥有实际内容和 dist-tag。不在 npm 写入时临时选择包或版本。

可信维护者本机是正式默认通道。GitHub workflow 可执行同一状态机；GitLab/镜像 CI 只验证源码。CI、OIDC 配置、参考仓凭据或 Version PR 均不构成本机发布前置。跨机器由维护者保持单发行写者，Git 公共目录中的进程锁只协调同一克隆。

## 一次冻结，验证原字节，发布原字节

1. 开发使用 `pnpm verify:affected`；发布编排/维护文档仅运行相关脚本和资料检查。可发布内容附经评审的 Changeset。
2. 在干净且与远端同步的 master 执行 `pnpm release:version`，评审物化版本、内部依赖、模板 BOM 和发布说明，然后提交推送。此命令不发包。
3. 执行一次 `pnpm release:plan`，按源码 HEAD 在 Git 公共目录保存候选 manifest/tarball。只有计划要求 reference 时，才通过 `pnpm reference:install:from-build` 准备精确候选锁，评审并推送参考仓 master。正式参考验收在下一步执行一次。
4. 执行 `pnpm verify:release`，按真实制品差异选择阶段，成功后形成绑定 HEAD、registry 和制品摘要的 validated receipt。
5. 执行 `pnpm release:publish`，复核主线、原回执、tarball 和 registry 并发事实，发布同一份字节并读回 integrity、渠道、Git tag 和 GitHub Release。该命令不重新构建或打包。
6. 发布后用 `pnpm release:sync-reference` 同步下游锁；在平台根仓库固定精确权威 master 提交。包发布、平台组合、站点部署和业务验收分别留证。

新候选要求 master 精确同步；已有合法冻结 manifest 的候选允许远端 master 后续前进，前提是原 HEAD 仍被权威 master 包含。不能以 squash/rebase 后另一个提交代替已发布源码，也不能修改 manifest 的 HEAD 或摘要来恢复。

## 验证范围与预算

普通发布不预先叠加 `verify`、`verify:local` 或历史完整浏览器矩阵。`verify:local` 是显式、不发布的完整审计；正式完整审计使用成对的 `verify:release:full` / `release:publish:full`。

计划按真实运行字节与消费闭包决定检查。未知差异扩大验证；候选安装、入口、内容与防篡改检查仍按计划执行。成功阶段按源码/manifest/计划、锁、runner 和环境输入复用最多 24 小时；失败、过期、输入改变、full/live 或可变外部目标不能当作旧通过。浏览器复用只证明对应执行输入，没有线上业务含义。

默认验证总预算：资料/局部 300 秒，含浏览器 900 秒，full 1800 秒；可显式设置 `OPENXIANGDA_RELEASE_VERIFY_TIMEOUT_SECONDS`。超时终止子进程并报告阶段，不自动减测。registry 收敛独立预算默认 300 秒，`OPENXIANGDA_PUBLISH_CONVERGENCE_SECONDS` 限制在 30–1800 秒；不能把元数据尚未可见当作 npm 未写入。

## 中断与渠道恢复

验证失败后修复失败项，直接重跑 `pnpm verify:release`，复用匹配的成功阶段和冻结 manifest；无须再次 plan、删除缓存或重新打包。源码变化时由原入口重规划，已开始 npm 写入的候选必须保持原 HEAD/字节。

发布响应丢失时，先查询原版本及 `dist.integrity`、原 dist-tag 和原 receipt，再通过原 `release:publish` 恢复。已发布版本不可覆盖、删除重发或以不同 tarball 冒充。外部渠道前进、不同 integrity、源被主线移除或锁归属不明时停止；不按锁年龄夺取。

七包及各 dist-tag 的写入不是原子事务。以逐包内容和渠道读回判断完成，不能以其中一个包的 latest 可见宣告整个发行完成。GitHub 同步失败继续原回执，不重复 npm 写入；已有不同内容的 GitHub Release 不自动覆盖。

版本历史/渠道查询采用新鲜只读批量快照，默认三并发、最多四；每查询60秒/1MiB、整批200秒。观察计时保存到候选目录的 `metadata-observation.json`，不作为成功发布事实或跨进程缓存。原publish/dist-tag写入保持串行，按公开包实际依赖拓扑执行，根包最后。receipt的 `channelPlan` 显示各标签原值/目标值；已到目标值时不重复写，第三种值停止。旧receipt从原 `priorTags`/`channelPolicy` 确定性派生，不改其制品。

成功回执及校验摘要归档在 Git 公共目录 `openxiangda-release-history/<HEAD>/`，发布命令输出真实路径。此目录不随 Git push 传播，维护者须按既有发行证据保留规则备份；归档失败保留活动回执和制品供原操作恢复，不清理未知结果。

## 资料更新与交接

中文开发专题在 `docs/` 单源维护，执行 `node scripts/sync-developer-guidance.mjs` 生成 Skill references，并以 `--check` 校验；变更 Skill/模板时同步入口、模板 AGENTS 和随包正文。通过仓库 `skills:install:local` 刷新本机资料并核对实际安装摘要；正式候选再验证 tarball 安装。不要只修改本机 Skill 副本。

报告精确源码、包版本/integrity、原回执、通过阶段与未覆盖项。维护者的 npm 主线规则不成为应用 TEST 内循环的新增门禁。
