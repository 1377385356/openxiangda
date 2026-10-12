# 发布链路与 CI 试点（历史证据）

日期：2026-09-13 至 2026-09-16。状态：CI 独占、本机仅应急及重新配置 Trusted Publisher 的操作提案已废止；当前入口是 [npm 发布规则](../maintainers/npm-release.md)。GitHub workflow 保留为可选的同一发行状态机执行环境。

## 留存的故障与修复证据

- 2.17.0–2.18.1 曾因 sameReleaseLine 比较完整版本、tarball dist/src 路径投影错误，错误扩大或遗漏验证。5fdd348b 按实际发行线与运行路径修正；用户面别名形状增加真实浏览器回归。
- 旧 registry 收敛仅约 24 秒，多次把成功写入后的元数据传播延迟报告为失败。后续统一 prefer-online，设独立有界收敛预算。当前预算与重试以维护者规则为准。
- 三次 workflow（34774181478、34775465070、34777270717）出现主进程结束后 7–13 分钟管道静默尾巴；孤儿 webserver 持有输出管道是已证明的表现层原因，宿主 SIGKILL/OOM 是当时尚未证明的触发推断。进程组清理与心跳后补充。
- 74ef1532 的五作业试点冻结同一候选后运行 core/packed/reference，publish 消费原字节。2.18.3 试点完成 OIDC npm 写入；OIDC 不覆盖 dist-tag，渠道和 GitHub 收尾后来按原回执完成。

## 被保留与被替代的决定

保留：build once/publish frozen bytes、不可变版本、Changesets 机器版本化、原 receipt 恢复、registry integrity/渠道读回、有界进程与成功阶段复用。参考应用仅按当前计划的真实影响准入；它不成为每次资料更新的固定外部前置。

替代：CI 唯一发布 owner、本机发布默认关闭、每次维护者先配置 runner/OIDC/environment/第二仓写 token、自动按锁年龄清除锁，以及普通发布预先重复完整矩阵。上述操作步骤和仍未实施的计划从此页移除，不能作为后续 AI 的待办。

2026-09-16 之后可信本机默认通道及失败阶段复用的实施依据见 [本机快路径决策](./2026-09-16-local-release-fast-path.md)。此页保留历史试点与根因证据，不证明当前 registry、目标平台或业务已验收。
