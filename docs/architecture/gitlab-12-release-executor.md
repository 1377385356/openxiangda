# GitLab 12.4 发布执行器

> 历史执行记录：CI 独占发布的要求已由用户纠正，现行规则见 [npm 发布与 Git 托管分离](./2026-09-06-npm-release-ownership.md)。


2026-09-06；主题：使现有权威 CI 发布入口在实际 GitLab 上可执行。

## 证据与所有者

权威 GitLab `/api/v4/version` 返回 12.4.0。项目 748 的 pipeline 2610 在创建 job 前失败：`jobs:publish_alpha config contains unknown keys: resource_group`。项目没有启用的 runner，也没有发布变量。此前配置声明了 CI 所有权，但实际基础设施未闭合。

GitLab 继续是唯一 CI 发布所有者，`scripts/release-publish.mjs` 继续拥有版本、主线、制品、回执及 registry 校验。不增加本地 npm 发布旁路，不修改包版本或已发布字节。

## 执行与并发

移除实际服务器不支持的 resource_group，发布任务只接受 `openxiangda-v2-publish` 标签的项目专属 protected runner。维护一个登记过的 runner ID，`OPENXIANGDA_RELEASE_RUNNER_ID` 为 protected CI 变量；job 在安装和发布前核对自己的 CI_RUNNER_ID。该唯一执行器配置 `concurrent = 1`、`limit = 1`，不接收未打标签的任务，锁定当前项目。运维不得以同一 token 同时运行多个进程，或启用第二个发布 runner。服务器升级后可恢复服务器端 resource_group，但仍保留主线／回执检查。

当前 GitLab Runner 17.11.2 的 darwin/arm64 官方二进制使用旧版注册协议，已在 GitLab 12.4 成功登记。12.4.1 的旧版 macOS 二进制在当前 Apple Silicon 系统无法运行；不升级全站 GitLab，兼容性以真实 job 执行结果验证。使用独立临时构建目录和缓存，shell 执行器调用主机已有 Node 24、pnpm 10.15.1 与 Docker。不安装开机服务、不重启 Docker、不修改用户其他项目。发布任务的参考应用使用自身 CI_JOB_TOKEN 只读拉取；npm token 使用项目 protected、masked CI 变量，日志和代码不保存其值。临时会话和 runner 配置权限为 0600，结束后停止执行器并撤销其登记；下次发行需重新登记并更新受保护的 runner ID，未配置执行器时任务不能发布。

## 失败、回退、影响与验证

不支持的 YAML、缺失 runner/token、候选或参考应用主线漂移、校验失败、同版本不同字节，均停止发布。运行中的 job 串行完成后再停用 runner；已发布 npm 版本不可通过回退删除或覆盖。只影响本工具链项目，不改变平台 1.x、租户或应用数据库。

使用实际 GitLab CI lint 验证 YAML；运行仓库 CI 边界测试、verify:affected 和正式 publish job。验收证据必须包括 pipeline/job ID、精确 master SHA、回执制品及公共 registry 读回。前端在公共包发布后重新安装并验证 lockfile。

实际 job 5910 已完成克隆、主线绑定和依赖安装，但旧服务器未提供 CI_SERVER_PROTOCOL，参考应用克隆被阻止。改为从既有 CI_REPOSITORY_URL 派生同组仓库地址，继续使用 job token。缓存放 CI_BUILDS_DIR，NPM_CONFIG_USERCONFIG 指向 job checkout 的 .git/ci.npmrc；不使用会修改主机用户配置的 pnpm config set。每个 job 的参考应用目录带 CI_JOB_ID，失败重试不覆盖前一 job 的候选。

## Git 写权限与已发布回执恢复

job 5918 已通过完整验证并发布七个固定 tarball、收敛 dist-tags，但 GitLab 12 的 CI_JOB_TOKEN 在推送标签时返回 403。包内容和版本不回退。项目 protected Git 写用户名／凭据只通过环境注入，credential helper 限定原项目协议、主机和路径，不把值写入文件、命令参数或日志；发布前通过 receive-pack dry-run 检查写权限。

串行执行器保留 `.git` 中的原发布回执和冻结制品。恢复 job 必须显式指定 40 位原 HEAD，匹配已开始发布的回执，并证明该 HEAD 在权威 master 上；仅切回原源码执行其 release-publish，成功后回到当前 CI 提交。没有回执、制品摘要变化、主线不包含原提交均失败，不创建新回执。正常发布与恢复互斥，恢复不会重新验证或重建已发布制品。此轮无运行时、数据库或租户影响；边界测试和真实恢复 job 验证权限预检、原版本标签以及公共 registry 摘要一致。
