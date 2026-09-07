# OpenXiangda 2.0 发布验证凭据

状态：2026-08-16 决策确认，进入实现。

## 问题证据

一次工具链发布先显式执行了 `pnpm verify:release`，随后
`pnpm release:publish` 又重新运行完整候选依赖闭包、全新应用、reference app、
Skills 和文档门禁。13 个包已经写入 npm 后，发布命令又尝试修改独立 reference
仓库的 lockfile，并因该仓库存在正常源码改动而以失败退出。registry 已经发生不可逆
写入，但命令表面状态仍是失败，既浪费时间，也扩大了跨仓库并发和恢复歧义。

2026-08-27 的真实 alpha 候选又暴露两种网络放大器：npm 默认允许单个基线查询等待
300 秒；reference 冷安装在一次性 Verdaccio 代理返回 503 后会销毁已经下载的 store，
下一次验证从 0/311 重新开始。候选应用、E2E 和冻结 tarball 均已通过，这类失败不应
被伪装成源码失败，也不应触发全链路重做。

## 能力所有者

- `release-publish.mjs` 是工具链候选工件、验证凭据和 npm/Git 发布状态的唯一所有者。
- Git `master` 是源码与版本清单事实源；冻结 tarball 是待发布字节事实源；npm 和 Git
  tag 只保存已经发布的不可变结果。
- 独立 reference app 只拥有自身源码和 lockfile。工具链发布器可在隔离副本中消费它做
  验收，但不得在 npm 发布事务中修改其工作树。
- AI、CLI 会话和 reference 仓库均不拥有发布状态，也不能临场选择版本、测试范围或
  跳过门禁。

## 稳定不变量与命令合同

1. `pnpm verify:release` 是正式候选的准备与验证入口。它只打包一次，运行机器规划的
   正式门禁，并留下 phase 为 `validated` 的凭据。
2. 凭据绑定精确 Git HEAD、registry、普通/全量模式、候选包版本、工件清单摘要以及
   每个 tarball 的 SHA-256、npm integrity 和字节数。
3. `pnpm release:publish` 只接受同一提交的 `validated` 凭据；没有凭据或凭据仍为
   `planned` 时在第一次 registry 写入前失败，并提示先执行对应 verify 命令。
4. publish 重新检查主线、候选尚未被并发发布、dist-tag 可恢复状态和全部工件摘要，
   但不重复 check/test/build、Chromium、reference、Skills 或文档门禁。
5. `verify:release:full` 生成 full 凭据，只能由 `release:publish:full` 消费；普通与全量
   模式不能交叉复用。
6. reference 验收继续使用一次性 loopback registry 中的同一批冻结 tarball；发布后
   lockfile 收敛由显式 `pnpm release:sync-reference` 完成，不影响 npm/Git 发布成功。
7. 1.x 仓库、应用、流程、自动化和发布脚本不读取该凭据，也不进入本门禁。

## 失败、并发与资源边界

- 验证失败保留 `planned` 凭据和冻结工件，修复源码形成新提交后可安全废弃；同一提交
  重试 verify 复用工件并重新执行尚未成功的正式门禁。
- publish 在每个不可逆阶段前后原子写凭据。进程中断后，已发布且 integrity 一致的包
  被跳过；内容不同、外部 dist-tag 漂移或 Git tag 指向其他提交时 fail closed。
- 一旦进入 `publishing-packages`，凭据不能跨 Git 提交重建或丢弃；必须在原提交上恢复
  到 npm 内容、dist-tag 和 Git tag 全部收敛。
- reference 工作树脏、不可访问或锁文件尚未同步不再发生在 registry 事务内，因而不会
  把“包已发布”伪装成“发布失败”。显式同步仍要求 reference 的 `master` 干净且与远端
  一致。
- 凭据和 tarball 位于 Git 私有目录，不进入应用包或 npm；文件权限为 0600。状态机不
  持有 npm token、应用 Secret 或用户数据。验证次数从两次降为一次，不增加浏览器、
  PostgreSQL 或临时 registry 的并发实例。
- 发布器拥有 npm 网络策略：未显式覆盖时，单请求超时 30 秒、npm 内部重试 2 次；
  不再继承 300 秒隐式等待。reference 安装和发布后 lockfile 同步只对 5xx、
  `ECONNRESET`、超时、DNS 临时失败和 TLS socket 中断做最多 5 次串行续跑；验收安装
  复用同一 loopback registry、volume 和
  机器级 content-addressed store。第三方依赖可从已校验缓存恢复，但候选 OpenXiangda
  包仍只从当前 release manifest 指定的本地冻结 tarball 发布到临时 registry 后安装。
  404、鉴权、lockfile、脚本、版本、完整性等确定性失败只运行一次。
- 五次安装均因临时网络失败时仍保留 phase=`planned` 的 receipt 和冻结工件；真实 npm 尚未写入，
  因而后续同提交验证可安全复用。源码修复形成新提交时，旧 planned receipt 可按既有
  superseded 规则丢弃；进入 `publishing-packages` 后不得跨提交。

## 受影响合同与回滚边界

这是 2.0 工具仓维护命令的 breaking workflow change：发布者必须先 verify，再
publish。公开 npm 包内容、应用运行时协议、Data API、Workflow 和平台数据库均不变。
回滚单元仅包含发布脚本、测试、文档和 Skill；尚未写 registry 时可以整体回滚。开始
写 registry 后只能依照原凭据向前恢复，不能用代码回滚覆盖已发布版本。

## 可证伪验证

1. 无凭据直接 publish 在任何 npm 写调用前失败。
2. verify 成功后 receipt 为 `validated`，第二次 verify 不重跑门禁，publish 复用同一
   manifest/tarball 并不调用 `release-validate.mjs`。
3. 修改 HEAD、registry、full 模式、manifest 或任一 tarball 后，publish 在写入前失败。
4. 在 `planned`、`validated`、`publishing-packages`、`packages-published`、
   `dist-tags-synchronized` 注入中断，重试只执行允许的后续阶段。
5. reference 仓库脏时，正式 publish 状态机测试仍可完成；显式 sync 单独给出清晰错误。
6. release 脚本单测、边界扫描、2.0 受影响验证和模拟 registry 故障测试通过，测试不得
   连接真实写权限 registry。
7. 网络策略单测证明默认 npm 超时有界且尊重显式覆盖；模拟前两次 503、第三次成功只
   调用 3 次并复用同一操作，确定性 lockfile 失败只调用 1 次，5 次耗尽后返回最后一次结果。
