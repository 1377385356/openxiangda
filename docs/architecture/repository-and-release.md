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

## 从源码到发布

1. 开发运行 `pnpm verify:affected`。独立应用使用
   [应用交付流程](../delivery.md)中的 check/dev/deploy，不承担平台维护者的发包步骤。
2. 维护者评审 Changesets，然后在干净、同步权威远端的 `master` 上执行
   `pnpm release:version`。版本、内部依赖和模板 BOM 由工具确定；评审生成差异并提交、
   推送后，才得到可审计的候选源码。版本物化自身不发布。
3. 先执行 `pnpm release:plan` 比较真实发行物。只有计划要求 reference 时，才运行
   `pnpm build`、`pnpm reference:install:from-build` 准备候选依赖、生成合同与锁文件，
   评审并推送参考仓库 master。准备步骤安装、CLI check 并核对锁定字节；完整参考应用
   check/test/build/浏览器验收在正式门禁中执行一次。
4. `pnpm verify:release` 固定候选摘要和 tarball，依计划执行候选闭合、全新独立应用、
   reference 及相应浏览器门禁，留下绑定源码、registry 和制品摘要的 validated receipt。
5. `pnpm release:publish` 只发布该回执对应的字节。它复核主线、回执、制品及 registry
   并发状态，不重新打包、不重新选择版本，也不代替缺失的验证。
6. registry 完成后，由独立的 `pnpm release:sync-reference` 收敛 reference 仓库锁文件。
   跨仓库同步不属于 npm 发布事务。
7. 平台根仓库固定工具链与服务端精确主线提交。镜像和平台发布走根仓库既有入口；
   测试环境验收成功后，生产晋级相同版本、AppPackage 和 OCI digest。

独立 tarball smoke 可以验证未发布源码的分发内容，但不产生正式发布回执，也不能被
描述为 registry、部署或真实业务验收。真实角色、真实数据库和外部投递仍需环境证据。

## npm 发布与源码验证

维护者在可信本机使用现有 `verify:release` 和 `release:publish` 发布 npm。
源码权威远端是 GitHub `1377385356/openxiangda` 的 master；GitLab 与镜像 CI 均只运行 `verify:affected`，不保存 npm
发布凭据，也不决定 npm 版本或发布状态。用户确认与替代旧决定的边界见
[npm 发布与 Git 托管分离](./2026-09-06-npm-release-ownership.md)。

同一维护者串行验证并发布同一冻结回执。主线漂移、缺失候选或计划必需的 reference、
制品变化、registry 并发冲突均由正式脚本阻断；不得直接调用 npm/Changesets
绕过门禁。Git 标签记录精确发布源码；远端发布状态以 npm 内容及 dist-tag 读回为准。

增量验证读取发行物差异和依赖闭包。候选依赖始终 build，实际运行改动及共享 core 的候选消费者执行 check/test，
候选 tarball 始终安装到全新应用；浏览器、后端/reference、文档与 Skill 按真实影响
选择门禁。没有可比较前版、未知影响或 `--full` 会执行完整矩阵。
发布范围和顺序由机器计划确定，AI 不在 registry 写入时临时挑选。

## 身份与服务端扩展

日常应用消费当前登录用户和其应用角色并集。普通业务代码不持有平台凭据，
不选择活动角色，也不维护授权快照。页面选择不授予数据写权限。

按需 Nest 扩展复用当前请求身份、Data API、事务、业务动作、流程/待办、托管文件和
事件 SDK；已有 CRUD 不再包一层控制器。OAuth2 Client Credentials 仅属于显式的
外部服务集成：它是独立 service principal，不能替代用户请求或成为默认开发依赖。

## 本地发布互斥与资料门禁

同一 checkout 的 verify:release 与 release:publish 共用 .git 中的进程锁，读取回执和操作候选制品之前取得独占权。RELEASE_PROCESS_BUSY 表示已有进程在执行；不自动抢占无法确认归属的锁。异常退出时先确认记录的进程已结束，再清理锁。这个锁不替代 npm 不可变版本和远端主线检查，也不协调不同机器。

MCP 或 CLI 运行时变更同时触发 Skill 与文档校验；根包中文资料变更执行安装、文档和 Skill 门禁。中文正文来自 docs 中的使用专题，按主题清单生成 Skill 引用，根包在 prepack 时替换精确版本并记录内容摘要。应用通过 context/docs 和 MCP docs_read 读取项目所用版本，不读取网站历史架构记录作为当前使用规则。

## 发布时间与重试

当前优化以 [增量发布验证](./2026-09-11-incremental-release-verification.md) 为准。Skill/文档校验前置；浏览器运行文件、真实依赖锁、生成应用、fixture 与执行环境未变时，复用 24 小时内成功阶段。说明资料仍用当前 tarball 重新验收，最终发布回执仍精确绑定 HEAD/制品；full 和 live 验证不使用浏览器缓存。每阶段打印用时，资料/局部预算 300 秒、含浏览器 900 秒、full 1800 秒，超时停止而不是降级。
