# CI 发布边界收敛

> 历史执行记录：CI 独占发布的要求已由用户纠正，现行规则见 [npm 发布与 Git 托管分离](./2026-09-06-npm-release-ownership.md)。


2026-09-05，基础批次 F。状态：实现前决策，发包与环境验收后续统一进行。

## 证据、所有者与决定

现有 GitLab 与 Gitea CI 都在 `verify:release` 后直接 `changeset publish`，
绕过已有 `release-publish.mjs` 的 validated receipt 和冻结 tarball。
工作区编排检查只覆盖 package scripts，未覆盖 CI；GitLab detached checkout 也不满足
既有发布入口的跟踪 master 要求。

保持原发布器为唯一 registry 写入所有者。权威 GitLab job 先绑定 pipeline 的准确提交，
跟踪 origin/master，再依次调用 verify:release、release:publish。原发布器检查主线漂移，
不能为满足检查而静默改成远端更新后的候选。镜像 CI 只运行源码验证，无发布 token。

公共变量从无效的 default.variables 移至顶层 variables，符合
[GitLab YAML 文档](https://docs.gitlab.com/ci/yaml/#default)；不改变变量值或凭据。

## 合同、失败和资源边界

不增加回执、发布状态、版本选择或跨仓库事务。既有 resource_group 串行化 CI 发行；
运行时仍验证候选字节、主线、registry 并发和回执恢复。仓库编排检查补充对受维护的
单行 CI 命令的回归检查，阻止直接 publisher、缺失验证和镜像发行路径重新引入。
该检查不是通用 YAML 安全解析器，不能代替运行时发布器的事实核验。

普通应用、租户数据、1.x 与正在运行的生产服务不受影响。缺失凭据或实际 CI 环境
只限制正式发行；本轮代码验证不触发 registry 或 CI 发布任务。回滚可撤销本源码提交，
已发布制品和业务数据不变。

## 可证伪验证

- 用原有直接 Changesets 命令重放，编排检查必须拒绝。
- 验证缺少或反转 validate/publish 顺序、缺少 pipeline/master 绑定、镜像发布/token 均失败。
- 实际受维护 CI 配置通过编排检查；原有回执、制品摘要、渠道和 reference 边界回归继续通过。
- CI 远端执行及正式候选回执仍属于后续统一发布，不由本地配置检查推断完成。
