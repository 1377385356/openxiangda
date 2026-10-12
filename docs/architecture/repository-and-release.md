# OpenXiangda 2.0 仓库与发布架构

## 产品与包边界

2.0 引擎是独立产品线。稳定 1.x 应用继续使用独立维护工具与运行时；统一分发入口负责代际识别与分派，V2 引擎不加入 V1 运行时兼容。产品方向以
[产品北极星](./product-north-star-v2.md)为准。

应用只安装工作区内精确版本的 `openxiangda`，通过 `openxiangda/config`、
浏览器入口及按需的 `openxiangda/nest` 消费平台能力。普通 CRUD 和标准审批
不包含应用后端；声明需要服务端执行后，现有 check/dev 流程按需初始化 Nest。
应用默认连接远端平台测试环境，不要求本地平台或数据库。

物理发行物由机器 allowlist 限定为七个包。它们独立版本化，应用无需逐个管理：

| 发行物 | 职责 |
| --- | --- |
| `openxiangda` | 应用公共入口、平台 React 控件与 SDK facade |
| `openxiangda-contracts` | 平台、浏览器与工具链共享合同 |
| `openxiangda-devkit-core` | 编译、工作区、连接开发与部署服务 |
| `openxiangda-nest` | 按需使用的 Nest SDK |
| `openxiangda-cli` | 命令实现、创建器和模板 |
| `openxiangda-mcp` | 复用 Devkit 的 AI 协议，无第二套工作区服务 |
| `openxiangda-skill-kit` | 唯一 Skill 资产的维护与分发，无应用级第二入口 |

pnpm 管理 workspace，Turborepo 计算受影响任务，Changesets 确定版本。
模板固定验证过的精确依赖；公开命令由注册表生成
[CLI reference](../reference/cli.md)，不在架构文档中维护另一份命令清单。

## 从源码到交付

工具维护者按 [npm 发布规则](../maintainers/npm-release.md) 完成 Changesets、冻结、验证、原字节发布和恢复；可信本机为默认通道，GitHub workflow 可选。源码权威是 GitHub `1377385356/openxiangda` 的 master，GitLab/镜像 CI 只验证源码。当前操作步骤、预算和阶段复用只在维护者页维护，历史发行不规定下一次范围。

应用按 [交付](../delivery.md) 和 [测试](../testing.md) 使用 dev/check/deploy。TEST 允许当前分支和未提交内容；生产使用成功测试版本与绑定其原源码/包摘要的真实验收，不重新构建。工具维护者的主线守卫不作为 TEST 前置。

平台组合固定每个工具/服务的精确权威 master 提交；镜像、OSS 与站点更新按平台根仓库 `docs/operations/incremental-release.md` 和正式更新器进行。npm 发布、组合溯源、站点激活和真实业务验收分别记录。独立 tarball smoke 不等于正式 registry 或环境验收。

## 身份与服务端扩展

日常应用消费当前登录用户和其应用角色并集。普通业务代码不持有平台凭据，
不选择活动角色，也不维护授权快照。页面选择不授予数据写权限。

按需 Nest 扩展复用当前请求身份、Data API、事务、业务动作、流程/待办、托管文件和
事件 SDK；已有 CRUD 不再包一层控制器。OAuth2 Client Credentials 仅属于显式的
外部服务集成：它是独立 service principal，不能替代用户请求或成为默认开发依赖。

## 本地发布互斥与资料门禁

同一 checkout 的 verify:release 与 release:publish 共用 .git 中的进程锁，读取回执和操作候选制品之前取得独占权。RELEASE_PROCESS_BUSY 表示已有进程在执行；不自动抢占无法确认归属的锁。异常退出时先确认记录的进程已结束，再清理锁。这个锁不替代 npm 不可变版本和远端主线检查，也不协调不同机器。

MCP 或 CLI 运行时变更同时触发 Skill 与文档校验；根包中文资料变更执行安装、文档和 Skill 门禁。中文正文来自 docs 中的使用专题，按主题清单生成 Skill 引用，根包在 prepack 时替换精确版本并记录内容摘要。应用通过 context/docs 和 MCP docs_read 读取项目所用版本，不读取网站历史架构记录作为当前使用规则。

## 发布时间与恢复

使用 [npm 发布规则](../maintainers/npm-release.md) 的实际计划、预算和原回执恢复。相同输入的成功阶段可以复用；可变目标读回必须新鲜，超时报告失败阶段并终止进程，不降级或重发未知写入。
