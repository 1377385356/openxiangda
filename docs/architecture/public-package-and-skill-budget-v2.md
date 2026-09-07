# OpenXiangda 2.0 公开包与 Skill 预算收敛

状态：Accepted，2026-08-21

## 问题证据

当前 release discovery 只按 `packages/*/package.json` 的 `private !== true`
判断候选，因此一次源码分发会发现 13 个公开包：

1. `openxiangda-admin`
2. `openxiangda-cli`
3. `openxiangda-compiler`
4. `openxiangda-contracts`
5. `create-openxiangda`
6. `openxiangda-devkit-core`
7. `openxiangda-field-kit`
8. `openxiangda-mcp`
9. `openxiangda-nest`
10. `openxiangda-skill-kit`
11. `openxiangda-testing`
12. `openxiangda-user`
13. `openxiangda-workflow`

这超过产品北极星的“公开工具包硬上限 7 个”。当前包边界主要反映历史实现层，
不是开发者入口：CLI 经 `create-openxiangda` 调 Devkit，Devkit 再调 Compiler，
Compiler 再调 Workflow；同一个 `create` 操作跨四个独立发布单元。官方 Vite
仪器模板实际只直接消费 `openxiangda-contracts`、`openxiangda-devkit-core` 和
`openxiangda-nest`，并不消费 `openxiangda-admin`、`openxiangda-user`、
`openxiangda-field-kit`、`openxiangda-testing` 或 `openxiangda-workflow`。

当前 Skill manifest 和安装器会发现并安装 7 个顶层 Skill。除总入口外，五个 CRUD
专题本质上是参考资料，`openxiangda-v2-workflow-events` 更与当前冻结 Workflow/Event
的方向冲突。北极星预算是一个入口，或完全无需安装。

`openxiangda-mcp` 还声明第二个 `openxiangda-mcp` 可执行文件。它使“八个公开命令、
一个应用工具入口”的验证只覆盖 Oclif 命令树，却没有覆盖真实安装后的完整 bin
表面。

## 能力所有者

- `scripts/lib/public-package-policy.mjs` 将成为公开包 allowlist、数量硬上限和唯一 bin
  的机器事实源；release plan、packed distribution 和 receipt 都调用它，不各写一份名单。
- `openxiangda-cli` 唯一拥有开发者进程入口、应用创建模板和八命令生命周期。
- `openxiangda-devkit-core` 唯一拥有应用声明编译、工作区加载、连接式开发和部署服务。
- `openxiangda-contracts` 唯一拥有浏览器、平台、Data API 和 App API 的共享 wire/types
  合同。
- `openxiangda-nest` 唯一拥有 NestJS 请求上下文和应用后端适配。
- `openxiangda-mcp` 只拥有应用开发 MCP 的协议注册与程序化 server API，不拥有进程
  bin、应用发布状态或第二套业务能力实现。
- `openxiangda-skill-kit` 只拥有唯一 Skill 的校验、manifest 和安装资产。
- 平台继续唯一拥有身份、授权、Data API、环境和 DeploymentRun；本轮不改平台合同。

## 最终公开包

公开包精确收敛为以下 6 个，而不是“最多七个中的任意集合”：

| 包 | 公开表面 | 官方应用为何需要 |
| --- | --- | --- |
| `openxiangda-cli` | 唯一 `openxiangda` bin；8 个顶层命令 | 创建、开发、检查、部署和回滚 |
| `openxiangda-contracts` | `.`、`./browser` | Web、Nest、Devkit 共享类型与 wire schema |
| `openxiangda-devkit-core` | `.`、`./client`、`./testing` | 应用声明、编译、开发/部署服务和当前权限测试夹具 |
| `openxiangda-nest` | `.` | 普通 NestJS 自定义动作与当前用户上下文 |
| `openxiangda-mcp` | `.`，无 `bin` | AI 客户端的程序化 MCP server；复用 Devkit |
| `openxiangda-skill-kit` | `.`，无 `bin` | 分发和安装唯一 `openxiangda-v2` Skill |

不创建旧包 alias、空壳转发包、deprecated compatibility export 或第二个 bin。
`openxiangda` npm 包名仍属于稳定 1.x，因此 2.0 CLI 包继续使用
`openxiangda-cli`，只拥有同名命令 `openxiangda`，不能用包重命名覆盖 1.x。

官方模板的直接 OpenXiangda 依赖保持最小且可解释：根工作区使用 CLI、Contracts、
Devkit；Web 使用 Contracts；Server 使用 Nest。模板不为“也许以后会用”安装 Admin、
User、Field Kit、Workflow、MCP 或 Skill Kit。

## 吸收与删除矩阵

| 当前包 | 处理 | 代码归属 | 测试归属 |
| --- | --- | --- | --- |
| `create-openxiangda` | 物理删除，无 alias | 创建器、模板过滤和模板 snapshot 进入 `openxiangda-cli` 内部模块及其 tarball `template/` | 创建、污染模板、默认安装和预算测试并入 CLI |
| `openxiangda-compiler` | 物理删除，无 alias | config/bundle/package compiler 进入 `openxiangda-devkit-core/src/compiler/`；仍由 Devkit 根入口导出应用需要的声明 helper | Compiler 单测并入 Devkit，digest/canonical 用例不降级 |
| `openxiangda-workflow` | 物理删除，无 alias | 仅 Compiler 仍需的纯编译实现进入 Devkit `internal/`，不再形成公开 export；不扩展 Workflow | 只保留编译闭包回归，Workflow 产品测试不进入黄金路径 |
| `openxiangda-testing` | 物理删除，无 alias | 通用权限矩阵 helper 改用 current-user role union 后进入 `openxiangda-devkit-core/testing`；RoleSession、CloudEvent journal 等冻结夹具直接删除 | 当前用户并集、CRUD 行/字段权限用例并入 Devkit；旧事件/Workflow 夹具测试删除 |
| `openxiangda-admin` | 物理删除，不吸收 | 官方 Vite/Refine 模板无消费；未来有两个真实应用共同需要时再独立评估 `openxiangda-react` | 删除旧 Umi/Workflow/RoleSession UI 测试，黄金模板 E2E 继续是前端验收 |
| `openxiangda-user` | 物理删除，不吸收 | 当前模板无移动/桌面标准用户包消费，不保留兼容层 | 删除对应历史 surface 测试 |
| `openxiangda-field-kit` | 物理删除，不吸收 | 当前仪器模板直接使用 Ant Design 和稳定 Contracts；不搬运未被模板使用的 5,000+ LOC | 字段协议仍由 Contracts 和模板 30 字段测试覆盖 |

吸收后原目录、active package manifest、active runtime、current docs、lockfile、tarball、
workspace dependency 和发布规则中的旧名字全部删除。这些有效产品表面出现旧包名即
失败；明确标记 `SUPERSEDED` 的历史架构文档和已经提交的 Changeset 审计记录不参与
零命中断言。不得用 npm alias、re-export 或 postinstall 下载恢复旧入口。

目标依赖图为（左侧被右侧消费）：

```text
openxiangda-contracts
  └─ openxiangda-nest

openxiangda-contracts -> openxiangda-devkit-core
openxiangda-devkit-core -> openxiangda-mcp -> openxiangda-cli
openxiangda-devkit-core --------------------> openxiangda-cli
openxiangda-devkit-core -> openxiangda-skill-kit

```

`openxiangda-cli` 可以依赖 `openxiangda-mcp`，并由 bin 在进入 Oclif 前精确分派
`openxiangda --mcp-stdio` 启动 stdio server；该参数不注册 command file，也不是第九个
Oclif 命令。该进程的 stdout 只能写 MCP protocol frame，日志只能写 stderr。
`openxiangda-mcp` 自身删除
`openxiangda-mcp` bin，默认 `openxiangda --help` 只显示应用级
`create/dev/check/deploy/status/logs/cancel/retry/start/stop/rollback/login/skill`。MCP 的工具实现必须调用 Devkit，
不能复制 build/deploy 状态机。

## 唯一 Skill

安装和 manifest 只允许一个顶层 Skill：`openxiangda-v2`。

- `architecture`、`backend`、`data-authz`、`delivery`、`frontend` 的有效内容移入
  `skills/openxiangda-v2/references/*.md`，没有 Skill frontmatter、agent yaml 或独立安装目录；
  总入口按任务链接这些短参考。
- `openxiangda-v2-workflow-events` 从 Skill、manifest、安装器、llms 当前入口和打包资产
  删除，不转成可安装 reference。保留的历史 Workflow/Event 文档顶部标记
  `SUPERSEDED`，明确不属于当前产品合同。
- `installSkills()` 固定校验源中恰好一个根 Skill，并把 references 安装在该 Skill 目录内；
  返回的 `installed` 必须精确为 `["openxiangda-v2"]`。
- 从旧版本升级时，安装器只允许清理六个已知退休目录：
  `openxiangda-v2-architecture`、`openxiangda-v2-backend`、
  `openxiangda-v2-data-authz`、`openxiangda-v2-delivery`、
  `openxiangda-v2-frontend`、`openxiangda-v2-workflow-events`。不得按
  `openxiangda-*` 前缀批量删除，也不得触碰其他厂商或用户 Skill。安装完成后的
  OpenXiangda 2.0 顶层 Skill 集合才精确为一个。
- manifest 固定只有一个 entry；未知第二目录、嵌套伪 Skill frontmatter或旧专题名都在
  打包前失败。

Skill 是说明材料，不是设计权威。产品北极星、可编译合同和真实黑盒结果优先于 Skill。

## 内部 workspace 策略

本次不是把七个旧公开包简单改成 `private:true` 留在发布仓里。被吸收或退休的 package
目录必须物理删除，避免 Turbo、Changesets、CodeGraph、AI 和后续维护继续把它们当作
产品边界。

只有无法独立发布、且被六个 owner 包真实引用的内部模块可以留在对应 owner 包内部；
不新增另一个 `packages/*` 私有包来模拟原分层。模板的 `@app/*` workspace 包仍是应用
私有代码，不计入工具公开包，也不能被 release discovery 选中。

## 版本、Changeset 与 receipt 处理

- 当前绑定 13 个候选 tarball 的 validated receipt 立即作废，不得发布。源码 HEAD、
  package allowlist 或 artifact manifest 任一变化都必须使旧 receipt 在第一次 npm 写入前失败。
- 已发布的旧 alpha 包版本留在 registry 作为不可变历史；本轮不 unpublish、不覆盖，
  也不通过 alias 或新 dist-tag 继续维护它们。
- 物理删除包时不改写已经提交的历史 Changeset 审计记录。只清理尚未物化的发布输入、
  当前 alpha pre-state 中会继续生成退休包候选的活动记录，以及由它们生成的候选状态，
  使下一次 `release:version` 只可能物化六个公开包。保留的历史记录不得被 Changesets
  或 release discovery 当成活动输入。
- 本次提交增加 reviewed breaking Changeset，只列实际变化的六个存活包；删除包没有
  “最后一个兼容版本”。
- 新 `verify:release` receipt 的 artifact manifest 必须精确含六个 tarball，任何第七个
  以外的额外包、缺包或 private 包进入 receipt 都 fail closed。

## 失败、并发、安全与资源边界

- 公开包 allowlist、数量和 bin 检查发生在 build、pack、registry 查询和 npm 写入前；
  不能打完 13 个包后才报告超预算。
- create 合并到 CLI 后仍使用原子目录创建和生成物过滤；失败留下可重复执行的明确状态，
  不复制 `dist/coverage/.openxiangda/report/.turbo/.turbopack/.umi`。
- MCP stdio 与 CLI 共用进程入口，但同一次进程只进入 Oclif 或 MCP 二者之一；不得同时
  启动两个协议、写两份 JSON 或让 MCP stdout 混入日志。
- Skill 安装只写目标 `openxiangda-v2` 目录；现有七目录安装升级时先验证目标集合，再
  原子替换唯一目录，并只清理上文列出的六个退休目录，绝不删除其他厂商或用户 Skill。
- 合并不改变身份、授权、Data API、App API、DeploymentRun、OCI digest 或平台数据库；
  不读取 token/Secret，也不增加网络、容器或 PostgreSQL 依赖。
- 包数从 13 降为 6，fresh install 不得因吸收而出现重复 Contracts/Devkit 副本；tarball
  和模板预算继续在 release 前执行。

## 回滚边界

在新六包版本写入 registry 前，可整体 revert 本架构提交恢复旧源码和 13 包候选，不涉及
平台或业务数据回滚。新版本发布后，registry 字节不可覆盖；回滚只能让模板恢复到上一套
精确 alpha 版本，或基于六包拓扑发布新的前向修复版本。已发布但退休的旧包版本继续可下载，
但不会重新进入 2.0 release train。

## 可证伪门禁

1. `publicPackages()` 精确返回上述六个包且 `length <= 7`；添加任意第七名单外包在构建和
   registry 写入前失败。
2. 全部公开 manifest 合计只有一个 bin，精确为
   `openxiangda-cli -> openxiangda`；tarball、安装后 `.bin` 和真实 help 都验证，伪 plugin
   仍不能注入第九命令。
3. active manifests/runtime/current docs、lockfile、生成模板和 tarball 中不存在七个删除包
   的 package 名、npm alias、旧入口目录或兼容 export；显式 `SUPERSEDED` 历史文档和
   已提交 Changeset 审计记录不受该零命中规则影响。
4. 官方模板从源码和六个 tarball 两种路径创建；安装、`check/test/build`、Web/Nest 单测、
   Playwright、connected dev、deploy fake Buildx/digest、status/logs/cancel/retry/start/stop/rollback 全通过。
5. MCP 精确通过唯一 `openxiangda --mcp-stdio` 前置分派启动，stdout 只有 MCP 帧；其
   build/deploy 使用同一 Devkit，安装后不存在 `openxiangda-mcp` 第二 bin，Oclif help
   仍精确八个顶层命令。
6. `skills/manifest.json` 精确一个 entry；安装结果精确一个目录和一个 installed name；
   五个专题只作为 nested references，Workflow/Event 入口为零；升级只删除六个已知
   退休目录，并以第三方/用户 Skill 夹具证明零触碰。
7. `release:plan`、source distribution、clean release build、artifact manifest 和 validated
   receipt 精确六个候选；旧 13 包 receipt 因 HEAD/manifest/package-set 不一致稳定拒绝。
8. `pnpm verify:affected`、template gates、packed distribution 和 `verify:release` 通过；不发布
   registry，不修改平台、1.x、root gitlink 或 reference app。
