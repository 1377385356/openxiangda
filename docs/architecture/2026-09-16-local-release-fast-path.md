# 本机发布与增量验证快路径

日期：2026-09-16
状态：已实施（2026-09-16）

## 问题证据

当前发布平均超过 30 分钟，失败后经常重新消耗完整验证时间。代码检查确认有四个主要放大器：

1. `release:plan`、`release:publish --freeze-only` 和 `verify:release` 都可能重新 build、pack 和生成 reference 资料；计划阶段产生的候选字节没有交给后续阶段复用。
2. GitHub 的 `verify-core`、`verify-packed`、`verify-reference` 每个 job 都重复边界检查、编排检查、发布脚本测试和依赖 build。
3. 本地验证回执只记录 `planned`/`validated`，阶段内任一门禁失败都会重新进入整套 `release-validate`。
4. npm 发布策略曾被 CI-only 环境变量和文档约定阻断，无法在维护者可信本机快速恢复。

## 能力所有者

- Changesets 负责版本选择，`release:version` 负责物化版本和发布说明。
- artifact manifest 负责候选 tarball 的唯一字节事实；receipt 负责发布状态。
- release stage cache 负责同一 HEAD、同一制品和同一执行输入下的成功阶段复用。
- `release-publish.mjs` 仍是 npm、dist-tag、Git tag 和 GitHub Release 状态机的唯一写入者。

## 稳定不变量

1. 同一源码 HEAD 的候选 tarball 只生成一次；verify 和 publish 只能消费该 manifest 中的字节。
2. 阶段缓存命中必须同时匹配 HEAD、artifact manifest、验证计划、锁文件、Node/平台和相关环境；full/live 验证不命中缓存。
3. 阶段失败不写通过凭据；重试只执行缺失或失败阶段，不能跳过最终的 artifact、registry 和主线断言。
4. 本机 `release:publish` 默认可执行；若组织要限制 CI-only，应在 GitHub environment、权限或外部运行策略上实施，发布脚本本身不把 CI 当作唯一发布者。
5. 已开始 npm 写入的 receipt 仍只能在原 HEAD、原 tarball 上恢复，不能跨提交重建。

## 影响与边界

- 只影响 `tools/openxiangda-v2` 的发布脚本、workflow、测试和维护文档；不改变 V2 应用运行时、平台数据库、V1 工具或根仓镜像发布线。
- 公开包、版本规则、npm 不可变字节、参考应用和发布后根仓 gitlink 约束保持不变。
- 本机与 CI 不应同时发布同一候选；跨机器互斥仍由维护者/发布平台保证，receipt 不作为跨机器锁。

## 资源、安全与回滚

- stage cache 只保存摘要、耗时和结果，不保存 npm token、应用 secret 或用户数据；文件权限为 0600。
- 缓存回执按 24 小时过期，过期回执不会命中；候选 tarball 仍受 manifest 大小和完整性校验约束。
- npm 写入前可以整体回滚本批次；npm 写入后只能按原 receipt 前向恢复，不能覆盖已发布版本。

## 可证伪验收

1. 先运行 `pnpm release:plan` 再运行 `pnpm verify:release`，verify 不再重新 pack 已冻结候选；build 仅作为验证阶段的增量依赖检查，并由 Turbo 热缓存缩短。
2. 注入一个验证阶段失败后再次运行 verify，已通过阶段显示 reused，失败阶段单独重跑。
3. 修改 HEAD、lockfile、artifact manifest、验证计划或相关环境后，缓存不命中并重新执行。
4. 未设置任何 CI 环境变量时，本机 `release:publish` 不因 CI-only 规则失败；receipt、registry integrity、dist-tag 和 Git tag 门禁仍完整执行。
5. 发布脚本单测、缓存单测、受影响包验证和 release workflow 静态检查全部通过。
