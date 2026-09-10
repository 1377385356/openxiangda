> 2026-09-11 更新：验证范围与复用策略见 [增量发布验证](./2026-09-11-incremental-release-verification.md)。只有计划要求 reference 时才绑定参考应用；原制品、主线和发布阶段约束保持。

# OpenXiangda 2.0 Reference 证据绑定发布凭据

状态：Accepted，2026-08-21

## 问题证据

`openxiangda-v2-reference-app` 曾使用一轮独立 `npm pack` 的 CLI tarball 生成
`pnpm-lock.yaml`，其 integrity 为 `sha512-v/FQ...`；正式 release receipt 冻结的
同版本 CLI tarball integrity 为 `sha512-2wOs...`。Linux/amd64 中按正式 tarball 和
reference frozen lock 安装时稳定报 `ERR_PNPM_TARBALL_INTEGRITY`。这证明“包名与版本
一致”不足以证明 reference 验收消费了待发布字节。

现有 `openxiangda.release-receipt/v2` 绑定工具仓 HEAD、artifact manifest 和 tarball
摘要，但不绑定 reference Git 提交、`package.json` 或 `pnpm-lock.yaml`。凭据进入
`validated` 后，外部 reference 可以漂移，而 `release:publish` 在第一次 npm 写入前
不会重新验证它。旧的发布凭据 ADR 中“reference 漂移不阻塞 registry 事务”只适用于
registry 写入已经开始后的恢复，不能允许尚未开始的发布消费失真的验收结果。

## 能力所有者与稳定合同

- `release-publish.mjs` 继续唯一拥有候选 tarball、receipt phase 和 npm 写入状态。
- 独立 reference 仓库继续拥有自己的 Git 历史和 lockfile；工具仓只读取并绑定证据，
  不复制 reference 状态或在发布事务中修改它。
- receipt additive 增加 `referenceApplication`：

  ```json
  {
    "head": "40 lowercase hex",
    "packageJsonSha256": "64 lowercase hex",
    "pnpmLockSha256": "64 lowercase hex"
  }
  ```

  该对象不记录机器绝对路径、remote URL、registry token 或任何凭据。
- reference 验证开始和结束都必须满足：工作树干净、当前分支精确为 `master`、fetch 后
  `HEAD === origin/master`，且上述三项证据与 receipt 完全一致。验证期间任一证据变化都
  失败，receipt 不得进入 `validated`。
- `validated -> publishing-packages` 转换在任何 npm 写入前重新解析显式或约定的
  reference root，并重新检查同一组 Git/摘要证据。receipt 缺少证据也 fail closed。
- 正式 reference gate 把 artifact manifest 的冻结 tarball 发布到一次性 registry 后，
  必须保留权威 `pnpm-lock.yaml`，使用隔离空 store 执行 `pnpm install
  --frozen-lockfile`；不得删除 lock 或在同一验收副本中 fresh resolve。随后固定执行
  check、test、build 和 Playwright。需要生成新 lock 的显式维护模式必须先在另一个
  resolution scratch 和隔离 store 中完成 fresh resolve、CLI check 与 artifact integrity
  比对，全部成功后才把 lock/manifest/生成合同拷回 reference；正式 acceptance scratch
  仍只消费权威 lock。
- receipt 一旦原子持久化为 `publishing-packages`，外部 reference 的后续漂移不再参与
  恢复；发布器只按已冻结 tarball、npm integrity 和 dist-tag 状态向前收敛。

## 失败、并发、安全与资源边界

reference 检查在开始和结束各执行一次有界 `git fetch origin master`，读取两个小文件并
计算 SHA-256，不启动 Docker、数据库或第二个 registry。每次检查在摘要读取前后复核
工作树与 HEAD，避免并发修改形成混合证据。Git 命令失败只返回稳定错误码，不回显可能
包含凭据的 remote URL 或 stderr。

dirty、detached/非 master、未同步远端、HEAD 漂移、package 或 lock 摘要漂移都发生在
`publishing-packages` 持久化和 `npm publish` 之前，因此 npm 写调用数必须为零。若进程
在 phase 持久化后中断，重试不再访问 reference，避免外部仓库阻断已经发生公共写入的
恢复。

## 回滚边界

在 npm 写入前可整体 revert 本提交并删除尚未发布的新 receipt；不涉及平台、业务数据或
reference 写入。旧的、缺少 `referenceApplication` 的 `planned`/`validated` receipt
不能发布，必须重新验证生成完整证据。已经进入 `publishing-packages` 的旧 receipt 保留
恢复能力，不能因新合同把部分公开写入永久卡住。

## 可证伪门禁

1. 临时 Git reference 仓库证明 clean `master === origin/master` 可生成无路径证据。
2. dirty、HEAD、`package.json`、`pnpm-lock.yaml` 任一漂移时，发布 stage 在 npm 写调用
   为零时失败；缺失证据同样失败。
3. 验证结束证据不同于开始证据时，receipt 保持 `planned`。
4. phase 已为 `publishing-packages` 时，即使 reference root 缺失或工作树漂移，恢复仍会
   进入冻结 tarball 发布逻辑。
5. 正式 receipt 的六个 tarball 重建 reference lock 后，CLI integrity 精确等于冻结
   receipt 的 `sha512-2wOs...`；Linux/amd64 官方 Dockerfile frozen install 以及
   check/test/build/Playwright 全通过。
6. `pnpm verify:affected` 和 release script tests 通过；本主题不写 npm、不生成新
   receipt、不改 root/platform gitlink，也不伪造公开包版本。
