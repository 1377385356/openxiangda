# OpenXiangda 2.0 SDK、模板与 AI Skill 收敛决策

状态：实施中
适用版本：OpenXiangda 2.0 prerelease
不适用：`tools/openxiangda` 及任何 OpenXiangda 1.x 应用

## 1. 问题证据

- 标准应用模板当前含 78 个预算统计源码文件，其中 Web Runtime 的 `src/` 就有 36 个文件。
- 除 `main.tsx`、生成的资源声明和应用业务扩展外，Data Client、字段控件、CRUD Renderer、Shell、Runtime、文件预览和通用样式都是平台通用实现，却被复制到每个应用。
- 工具链当前公开发布 `openxiangda-cli`、`openxiangda-contracts`、`openxiangda-devkit-core`、`openxiangda-mcp`、`openxiangda-nest`、`openxiangda-skill-kit` 六个不同版本的包，应用必须理解内部物理拆分。
- 当前 npm 已存在 `openxiangda` 1.x 版本线；2.0 尚未提供 `openxiangda/core`、`openxiangda/field-kit`、`openxiangda/react`、`openxiangda/nest`、`openxiangda/testing` 这些统一入口。
- 当前唯一可安装 Skill 为 `openxiangda-v2`，但由单独版本的 `openxiangda-skill-kit` 发布；它缺少需求调研和测试验收 reference。机器上残留的旧细分 Skill 仍描述 Umi、ProComponents 和主动 RoleSession，与当前北极星冲突。
- 发布应用 Runtime 仍把 RoleSession 选择和请求头放在应用模板源码中；当前产品方向要求应用只消费当前用户角色并集，授权上下文由平台和标准 Client 管理。

## 2. 能力唯一 Owner

| 能力 | 唯一 Owner |
| --- | --- |
| 2.0 对外安装名、CLI、subpath、Skill 版本闭包 | npm 根包 `openxiangda` |
| 资源、字段、Surface、Data 和 AI Schema | `openxiangda/core` 编译契约及平台 API |
| 浏览器身份、Data/Directory/File/App 请求 | `openxiangda/core` Client |
| 字段值、标准控件、选择器和资源导入 | `openxiangda/field-kit` |
| React Runtime、Shell、CRUD 和文件预览 | `openxiangda/react` |
| NestJS 业务动作和应用运行时 | `openxiangda/nest` |
| AI 任务路由和使用方法 | 根包内唯一 Skill `openxiangda-v2` |
| 当前资源、权限、环境 Head 和 AI Catalog | Workspace MCP 与平台 API |
| 身份、权限、数据、环境和发布状态 | 平台服务 |
| 1.x CLI、SDK、SDD 和旧应用维护 | `tools/openxiangda` 1.x 版本线 |

## 3. 稳定不变量

1. 2.0 不提供旧包名、旧模板文件、Umi、ProComponents、主动 RoleSession、1.x SDD 或旧 Skill 的兼容入口；错误的 alpha 契约直接删除。
2. 1.x 不改包名、不改模板、不升级到 2.0 依赖；`openxiangda@^1` 继续停留在 1.x 版本线。
3. 新应用只直接依赖一个精确版本的 `openxiangda`；所有 `openxiangda/*` subpath 和 AI Skill 来自同一根包依赖闭包。
4. 模板只保存应用所有的入口、资源声明、业务页面/动作和局部布局样式，不复制平台通用组件或 Client。
5. 浏览器只使用当前登录用户的应用角色并集。应用源码不能选择 RoleSession、保存 Token、构造权限结果或维护第二份授权状态。
6. 普通 CRUD 直达平台 Data API；NestJS 只承载跨资源不变量、事务或外部副作用。
7. Skill 教 AI 做决策和使用 API；SDK 实现运行逻辑；MCP 发现实时契约；平台执行权威规则，四层不得互相复制状态。

## 4. 对外契约与物理实现

应用侧稳定入口只有：

- `openxiangda/core`
- `openxiangda/config`
- `openxiangda/field-kit`
- `openxiangda/react`
- `openxiangda/nest`
- `openxiangda/testing`
- `openxiangda` CLI

第一阶段新增根包作为唯一产品门面。现有六个无 scope 包只作为根包精确锁定的物理实现单元，业务模板和 Skill 不得直接导入。待根包发布和真实应用验证稳定后，再决定是否把物理实现合并进同一个 tarball；这个内部调整不得改变上述 subpath。

`openxiangda` 根包同时携带 `openxiangda-v2` Skill 的确定性 manifest。`openxiangda skill install` 只安装或替换这个 Skill，不识别旧细分 Skill，也不迁移 1.x Skill。

## 5. 失败、并发和发布行为

- 根包、实现包、模板、Skill 或生成的 `AGENTS.md` 任一内容变化都需要 Changeset；版本由 reviewed Changeset 物化，AI 不在 publish 时临时选版本。
- 发布门禁先比较 registry 不可变 tarball，再执行构建、类型、测试、模板生成、Skill、文档、fresh-install 和浏览器检查。
- `release:publish` 只发布验证收据绑定的精确 tarball；发布前再次检查版本占用和 dist-tag。并发发布导致版本或 HEAD 改变时立即停止，不循环重建、不自动改版本。
- 2.0 prerelease 只更新独立 prerelease dist-tag；验证完成前不移动 `latest`，因此 `openxiangda@^1` 不受影响。
- 应用部署使用平台幂等部署键和当前环境 Head CAS。冲突返回结构化错误和当前状态；客户端提供 status/cancel/retry/rollback，不通过 SDD 或无限重试掩盖冲突。

## 6. 安全和资源边界

- 浏览器请求使用 `credentials: include` 和平台注入的同源挂载信息，不持久化 Token、RoleSession、平台地址或权限决定。
- 文件、通讯录、关联资源和 Data API 只走平台 Client；字段组件不能直连数据库或复制目录数据。
- 搜索、分页、批量、导入、附件和预览保留现有有界限制；提取到 npm 后必须由包级测试覆盖。
- Skill 不记录真实用户、Secret、环境 Head 或应用动态字段。动态事实必须通过当前工作区编译结果、MCP 或平台 API 获取。

## 7. 迁移与回滚边界

- 这是 2.0 alpha 的破坏性替换：生成新的 2.0 应用验证，不在旧 2.0 应用中原地兼容或注入适配层。
- 工具链回滚以已发布 prerelease、Git tag 和根仓 gitlink 为边界；平台回滚以已发布平台镜像和 SQL 向前迁移为边界。
- 已发布 npm 版本不可覆盖。缺陷通过新 prerelease 修复；不得复写同版本 tarball。
- `tools/openxiangda` 及其 npm 1.x 版本、Skill、SDD 和应用目录不在变更范围内。

## 8. 可证伪验收

1. 公开包策略接受根包且不超过 7 个物理发布单元；应用 manifest 只直接依赖 `openxiangda`。
2. fresh install 可从精确 `openxiangda@2.0.0-alpha.x` 执行 login/create/dev/check/test/build/deploy/status/rollback 和 MCP stdio。
3. 模板预算不超过 50 个源码文件；模板 Web `src/` 只剩应用入口和明确的业务扩展点。
4. 模板生产源码不再包含 `platform-client.ts`、字段控件、CRUD Renderer、Shell、RoleSubjectSelect 或平台通用样式副本。
5. `openxiangda/*` 每个入口均有导出测试、fresh-install 类型检查和最小运行测试；Skill 中所有导入示例可编译。
6. Skill 具备 discovery、architecture、data-authz、frontend、backend、testing、delivery、workspace 路由；manifest 摘要可复现，旧细分 Skill 不在发布物中。
7. 当前用户多角色正向与反向路径在浏览器、Data API 和 NestJS 中结果一致，网络请求不出现 `x-openxiangda-role-session-id`。
8. `pnpm verify`、`pnpm verify:release`、packed distribution、reference application、Skill、docs 和模板 E2E 全部通过。
9. 发布后由一个没有实现上下文的 Luna 极高子智能体，仅使用已发布包和 Skill 从零创建应用、实现一个有字段/权限/业务动作的功能并完成测试部署。
10. 主代理独立审查 Luna 的命令、源码、权限矩阵、测试和发布证据；发现的平台缺陷必须在新 prerelease 中修复并重新完成受影响门禁。

## 9. Luna 盲测后的架构闭环

2026-08-25，Luna 极高子智能体只使用公开的
`openxiangda@2.0.0-alpha.3` 和根包内 Skill，从空目录完成实验仪器维护应用。
应用只直接依赖根包，本地 `check`、单测、构建和浏览器 E2E 均通过；主代理复跑结果一致。
首次真实预发部署在 `preparing-configuration` 阶段失败，稳定错误为
`NATIVE_DATA_SURFACE_FIELD_PROJECTION_MISMATCH`，指针为
`/config/data/resources/0/surface/fields/maintenanceTickets/source`。

失败制品证明同一个 authored `source` 被 bundle 层分裂成两个不同结果：Data schema
中的 `descriptionFields`、`snapshotFields` 被排序，Surface 中仍保持声明顺序。平台按
“字段声明是 schema 与 Surface 唯一 owner”的不变量拒绝该制品是正确行为；应用不得通过
手工重排字段规避。修复边界限定为：

- `openxiangda-devkit-core` 用同一个规范化 source 投影 Data schema 与 Surface，并增加乱序输入的等价平台投影测试；
- 根包 Skill 删除编译器不支持的 `file.multiple`，current-user policy 只填写字段根代码，并明确字段 access capability 由 field policy 拥有、不得重复写入 `authz.capabilities`；
- CLI 模板为标准导出 E2E 提供真实形状的 `/export` 下载 mock，避免新应用首次运行模板测试即超时；
- 根包启动器把公开发行名和版本传给内部 CLI，使 `openxiangda --version` 与应用唯一依赖一致，同时保留 lockfile 中独立实现包版本用于审计。
- Luna 应用升级后，其复制的旧 Web 构建预算没有随 npm 更新，证明通用验证规则也不能由应用源码拥有；构建产物、gzip、首屏、source map 和资源数量门禁统一迁入 `openxiangda/testing`，模板只保留定位自身 `dist` 的薄调用入口，规则由根包版本管理。

本轮不修改平台校验器、不增加 alpha 兼容分支、不触碰 1.x。回滚边界是新的 npm
prerelease 和对应 Git tag；已失败的预发 DeploymentRun 保留为证据。修复只有在新的 fresh
package 通过完整 release gate、同一 Luna 应用升级到新的精确根包版本并成功部署预发后才算闭环；
若仍失败，继续修唯一 owner，不修改应用声明来迎合错误投影。

## 10. 资源来源标签契约的本地闭环

2026-08-25，Luna 应用升级到公开的 `openxiangda@2.0.0-alpha.8` 后，本地统一
`check`、单测、构建和浏览器 E2E 全部通过；预发部署在
`preparing-configuration` 阶段以 `NATIVE_DATA_FIELD_SOURCE_LABEL_INVALID` 拒绝，
指针是一个 `resource-ref.multiple` 来源的 `labelField`。目标字段为
`serial-number`。平台规范只接受 `text.short` 或 `text.long`，而本地编译器错误地把
`serial-number` 放入标签白名单，因此本地检查与平台权威契约不一致。

- **唯一 owner：** `openxiangda-devkit-core` 的跨资源配置验证拥有 authored source 的
  本地语义校验；平台配置服务继续拥有部署时的权威校验。二者共享相同稳定语义，不在应用
  或 React 组件中增加替代校验。
- **稳定不变量：** 资源来源 `labelField` 必须存在且类型只能是 `text.short` 或
  `text.long`。`serial-number` 可以作为搜索、描述或快照字段，但不能作为显示标签。
- **受影响契约：** 本地错误声明改为在 `openxiangda check`/编译阶段以
  `APP_CONFIG_DATA_RESOURCE_SOURCE_LABEL_INVALID` 失败；平台现有
  `NATIVE_DATA_FIELD_SOURCE_LABEL_INVALID`、制品格式和运行时数据形状不变。
- **失败、并发与安全边界：** 验证只扫描同一应用已声明的有界资源图，无网络、数据库或
  可变状态；错误在上传制品和竞争环境 Head 之前失败，不触发自动重试或兼容分支。
- **回滚与影响面：** 只发布新的 2.0 prerelease；不修改平台、不覆盖已发布 tarball、
  不触碰 1.x。失败的预发 DeploymentRun 和旧环境 Head 保留为审计证据。
- **可证伪验证：** 增加一个把目标 `labelField` 改为 `serial-number` 的编译器负例，要求
  精确错误码和字段路径；Luna 应用把显示标签改为真实文本字段、升级到新公开根包后，必须
  重新通过本地全套门禁并成功部署同一预发环境，才算闭环。
