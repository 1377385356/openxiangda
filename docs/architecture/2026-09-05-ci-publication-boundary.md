# CI 发布边界收敛（历史决定）

状态：旧 CI 独占策略已废止。当前操作只使用 [npm 发布规则](../maintainers/npm-release.md)，不重新配置历史 GitLab runner 或恢复 CI-only 环境开关。

2026-09-05 的证据：GitLab 与 Gitea workflow 在验证后直接调用 Changesets publisher，绕过已有 validated receipt 与冻结 tarball；detached checkout 也未绑定原候选主线。保留的决定是正式写入必须由原 release-publish 状态机拥有，镜像 CI 不拥有 npm 凭据和发布状态。

后续 2026-09-06 用户纠正 npm 与 Git 托管所有权，2026-09-16 确定可信维护者本机为默认通道、GitHub workflow 可选。已失效的 runner/resource_group 操作步骤从此页移除。原版本、制品摘要、主线包含和回执恢复仍是当前不变量。
