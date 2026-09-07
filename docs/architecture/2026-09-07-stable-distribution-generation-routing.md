# 正式分发入口、工作区代际与发布资料

状态：2026-09-07 用户确认实施。架构主题：正式分发，不改变应用运行时协议。

## 问题证据

- 1.x 和 2.x 共用 npm 包名及 openxiangda 可执行名；当前 latest=1.0.267，alpha=2.0.0-alpha.114。
- 根包 bin/run.js 直接进入 V2 CLI；旧工作区无法通过新版入口继续使用 V1。
- V1 update 当前以 @latest 全局安装；切换正式渠道会改变全局入口，必须保持原工作区的执行引擎。
- Changesets 的 changelog 配置关闭。现有维护者发布器已有不可变 tarball、校验回执及部分发布恢复；CI 不应成为第二个发布者。

## 所有者与不变量

根包分发层拥有入口选择、工具版本解析和发布资料。V1 引擎、V2 引擎分别拥有自己的命令、工作区协议、登录态、生成器、SDK 与 Skill。V2 应用编译器不识别或转换 V1。

最近工作区标记决定代际；项目明确锁定的本地引擎优先。配置冲突、已声明但未安装的依赖、引擎与工作区代际不一致均明确失败，不执行配置猜测或跨代 fallback。只有没有项目 CLI 声明的旧工作区使用根包精确固定的 legacy 引擎。分发检查只读取标记，不执行工作区配置。

V1 app-workspace.config.ts 及有效 .openxiangda/state.json 绑定保持原样；V2 openxiangda.config.ts/openxiangda-app.config.ts 保持原样。新 create 只创建 V2。平台继续唯一拥有用户、权限、业务数据、环境、部署状态；工具升级不会迁移应用业务数据。

用户补充选型原则：V1 项目的 V2 能力覆盖已满足、仍处测试阶段且迁移成本可控时，主动优先建议采用 V2。工具的安全代际识别不等于长期选型建议；条件未知时明确列为待确认，跨代迁移仍需项目设计、数据/流程映射、验收和回滚。

## 公开合同

- version --json 返回 distributionVersion、generation、engineVersion、engineSource、workspaceRoot。
- update check 与 update install --target workspace|launcher：有工作区默认 workspace，否则 launcher；workspace 只升级原代际的项目依赖，launcher 更新统一入口。检查展示说明与平台兼容要求，执行使用检查阶段解析出的精确版本。
- changelog [version] 读取随包资料或可信发布仓库中的指定版本；网络失败不影响本地资料及其他操作。
- migrate assess --to v2 只读列出 V1 模型、页面、流程、权限和数据迁移风险；不生成、发布或切换应用。
- latest/stable-v2 为 V2 正式渠道，legacy-v1 为独立维护渠道，alpha 为预发布。V1 发布不得改写 latest。

## 失败、并发、安全与资源边界

分发层传递原始参数、stdio、退出码和信号；通过绝对引擎入口执行，禁止 shell 拼接、递归分派、任意网络安装和跨代重试。工作区发现有祖先边界；读取元数据有大小上限。安装仅在 update install 中执行，项目升级校验 packageManager 并保留锁文件机制；失败报告已发生的依赖变更，不假装回滚用户文件。

V1 ~/.openxiangda/profiles.json 与 V2 ~/.config/openxiangda-v2/session.json 不复制或合并。Skill 安装分开维护代际目录，统一入口 Skill 只负责识别。公开资料不携带个人、租户、服务器、访问凭据或内部验收记录。

GitHub 工具仓库从审查后的源码基线建立，私有历史保留，来源映射保留于私有编排仓库。发布器仍为唯一发布所有者，GitHub CI 只检查源码。单进程锁及不可变回执约束同一发布；npm 成功而 GitHub 同步失败必须恢复同一版本，不能重新构建或换版本掩盖失败。

## 回滚与影响面

分发与更新不改写已有工作区绑定。回退使用原项目锁定包；停止推广有问题的版本并发布修复版，不重写已发布 tarball。旧 V1 运行时可独立维护，平台服务和租户业务数据不随入口切换。正式包需要现有主线、参考应用和发布验证；源码公开不意味着平台源码公开。

## 可证伪验收

从 npm tarball 验证 V1/V2/空目录、子目录、混合标记、缺失依赖、代际冲突、信号与退出码、本地版本优先、V1 维护更新后新应用仍默认 V2、两套 Skill 与登录态互不覆盖。验证 read-only 命令不写工作区；版本说明离线可读；发布渠道互不覆盖；GitHub 重试不重复发 npm 包。完整正式候选通过 verify:release 与既有真实应用交付验收，逐项区分源码、registry、平台部署和真实角色结果。

### npm 渠道名称约束（发布前实测）

npm 拒绝 v1/v2 标签，因为它们是合法 SemVer 范围。产品代际名称保持 V1/V2，npm 维护标签采用 legacy-v1 / stable-v2；latest 与 stable-v2 同步指向 V2 正式版，alpha 保留原值。发布、更新检查和平台说明均使用这一映射。依据：npm-dist-tag 官方 Caveats 与本次发布前校验错误，尚未写入 registry。
