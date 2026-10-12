# GitLab 12.4 执行器（历史证据）

状态：历史临时执行器已撤销，CI 独占发布策略已废止。当前操作见 [npm 发布规则](../maintainers/npm-release.md)；本页不提供重建历史 runner 的流程。

2026-09-06：GitLab 12.4 项目 748 的 pipeline 2610 因不支持 `resource_group` 在创建 job 前失败；当时无启用 runner 和发布变量。临时 runner 后续验证了旧服务的接线问题。

- job 5910 完成克隆、主线绑定和安装，因旧服务器缺失 CI_SERVER_PROTOCOL 阻止参考仓克隆。
- job 5918 完成验证、七个冻结 tarball 发布和 dist-tag 收敛，GitLab CI_JOB_TOKEN 推送 Git tag 返回 403。这个失败不代表 npm 未写入。
- 原 HEAD、原 receipt 和 tarball 被保留用于恢复；没有回执、内容变化或主线不包含原提交时拒绝恢复。已发布字节不回退。

这些记录支持当前“按写入事实恢复，不能把 CI job 结果当 npm 事实”的原则。旧 runner ID、protected 变量、临时 Git 写凭据与登记步骤已移除；当前 GitLab/镜像 CI 只验证源码。
