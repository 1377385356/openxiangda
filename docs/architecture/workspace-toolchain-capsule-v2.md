# Workspace Toolchain Capsule v2

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-23 架构决策，已实现，待候选门禁验收

## 1. 问题证据与能力 owner

真实 instrument reference app 工作区使用 `openxiangda-cli@2.0.0-alpha.83`，其传递的
`openxiangda-devkit-core` 为 `2.0.0-alpha.50`；工作区根
`package.json` 却声明 `openxiangda-devkit-core@2.0.0-alpha.49`，同时
声明 `openxiangda-contracts@2.0.0-alpha.38` 和
`openxiangda-nest@2.0.0-alpha.47`。现有 `versionTrainDiagnostics` 只检查
精确 pin 与 major 2，因此一次 `openxiangda check --json` 会在同一工作区内
用两套编译/声明语义继续通过。

能力 owner 是“当前实际执行的 CLI 所携带的应用模板版本胶囊”。create 解析
该 CLI 的 source 或 packaged template；check、dev、generate、build、
buildPreview 与 deploy 使用同一胶囊。devkit-core 在没有 CLI 注入时只提供
自己的最小默认胶囊，不能冒充完整 CLI 模板胶囊。

## 2. 决策与稳定不变量

1. 胶囊是内存中的确定性值，不写入新的工作区状态文件、不创建第二份 lock、
   不调用远端 API。它至少包含
   `openxiangda-cli`、`openxiangda-contracts`、`openxiangda-devkit-core` 和
   `openxiangda-nest` 的精确版本；普通第三方包与 `@app/*` 不进入胶囊。
2. 公共包独立版本。版本字符串不必相同，但工作区每个 app-facing
   `openxiangda-*` 依赖在所有 `package.json`/依赖 section 中必须精确等于
   胶囊中同名包的版本；同名包的声明不能在多个文件或 section 中分裂。
3. source monorepo template 的 `workspace:*` 通过同一仓库
   `packages/*/package.json` 确定性解析为当前精确版本；registry/packed
   template 已由 `prepare-template` 封装为精确版本，直接扫描 packaged
   template。映射和诊断排序稳定。
4. 胶囊漂移使用单一错误码
   `OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH`。details 必须逐项包含
   expected、actual、packageFile、section；remediation 指向以当前 CLI
   重新 create 或将所有 OpenXiangda 包更新到胶囊精确版本并 frozen install。
5. exact pin、major 2 和浮动范围仍保留；胶囊是更强的同一 owner 检查。
   胶囊失败时 check/test/build 不能运行工作区脚本，generate 不能写
   `packages/contracts/src/generated.ts`，dev/buildPreview/deploy 不能启动
   子进程或访问控制面。
6. status、logs、rollback 是只读/恢复型远端运维边界，不能因为本地胶囊漂移
   被封死；生产 promotion 属于 deploy，仍受胶囊门禁。
7. CLI 保持严格八个顶层命令，不增加 authz、capsule 或其它命令。

## 3. 合同、并发、失败与资源边界

胶囊只在命令调用内从只读 package manifests 计算；每次命令获得一个不可变
快照，后续生成、编译和远端调用使用该快照。manifest 在命令运行中被外部
修改时，下一次命令重新解析并 fail closed；不尝试自动修复或覆盖
`package.json`。

扫描仅递归工作区内名为 `package.json` 的文件，并跳过
`node_modules`、`dist`、`coverage`、`.git`、`.openxiangda` 等生成/依赖目录；
最多读取 2,000 个 manifest，单个 manifest 最大 1 MB，超限以稳定扫描上限
错误 fail closed。只收集有限的 `openxiangda-*` app-facing 包，诊断数量有界且
按包名、文件、section 排序，避免任意文件内容进入错误输出。胶囊不包含 token、
用户数据、lock 内容或远端环境信息。

## 4. 影响范围与回滚

实现只触及 `openxiangda-cli`、`openxiangda-devkit-core`、文档、测试和
Changeset。source template、packed template、应用 check/dev/build/deploy
的本地入口会改变；contracts、nest、平台 API、1.x 工具、其它租户、生产
数据与已发布版本零 blast radius。status/logs/rollback 的运维恢复边界
保持可用。

回滚只需回退本 ADR 对应的 CLI/devkit-core 代码、测试和 Changeset；不需要
数据库迁移、平台回滚或应用数据修复。若未来模板新增 app-facing 包，必须
更新模板胶囊扫描与验收矩阵，而不能手工追加漂移表。

## 5. 可证伪验收矩阵

| 场景 | 预期 |
| --- | --- |
| 独立版本串：contracts/core/nest 各自不同但等于胶囊 | check 通过 |
| workspace core alpha.49，CLI 胶囊 core alpha.50 | 单一 mismatch 失败 |
| 同名包在两个 package.json/section 声明不同版本 | mismatch 失败并列出每项 expected/actual/file/section |
| `^2.x`、`workspace:*`、tag | 保持 pin 失败或 capsule mismatch，均不执行脚本 |
| major 1 | 保持 release-train 失败 |
| mismatch + check/test/build/generate | 不写 generated、不运行脚本、不启动子进程 |
| mismatch + dev/buildPreview/deploy | 不访问控制面、不启动子进程 |
| mismatch + status/logs/rollback | 保持调用只读/恢复 client 的边界 |
| source template | `workspace:*` 解析为仓库 package manifests 的确定版本 |
| packed template | 只扫描封装后的精确版本，不依赖 monorepo 路径 |
| CLI/devkit/八命令黑盒 | 真实 CLI 注入完整胶囊；顶层命令仍恰好八个 |
