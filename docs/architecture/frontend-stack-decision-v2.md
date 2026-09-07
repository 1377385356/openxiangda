# ADR: OpenXiangda 2.0 默认前端选择 Vite / Refine

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：Accepted
日期：2026-08-21
范围：`templates/application/apps/web` 以及创建器复制出的新 2.0 应用

## 问题证据

用同一份 instrument reference app 仪器资源合同分别实现了 Umi/Pro 与 Vite + React Router + Refine Core + Ant Design 原型。两边均完成 30 字段、固定筛选、服务端语义分页/排序、创建、详情、编辑、删除、三类管理员的 UI 状态，以及五个固定 AI 修改任务。测量使用 Node 24.18.0、pnpm 10.15.1 和相互隔离的 pnpm store。

| 指标 | Umi / Pro | Vite / Refine |
| --- | ---: | ---: |
| 冷安装 | 43.74 s | 6.71 s |
| 安装后目录 | 902 MiB | 233 MiB |
| `.pnpm` 包目录 | 1,351 | 181 |
| 冷启动到浏览器可交互 | 7.955 s | 1.283 s |
| 暖启动到浏览器可交互 | 3.882 s | 0.791 s |
| 字段标签到浏览器 HMR | 756 ms | 457 ms |
| 三次构建中位数 | 6.46 s | 3.25 s |
| dist 原始总量 | 2,504,310 B | 1,454,312 B |
| dist gzip 合计 | 786,720 B | 463,873 B |
| 业务 TS/TSX LOC | 381 | 364 |
| 五项固定 AI 修改 | 5/5 | 5/5 |

Umi 原型还暴露了角色变化后 ProTable 保留旧请求结果的问题，必须显式按角色重建表格。Refine query key 自然包含授权上下文，没有出现相同泄漏。

## 决定

OpenXiangda 2.0 新应用只维护一条默认前端路径：

- Vite；
- React Router；
- Refine Core；
- Ant Design；
- OpenXiangda 自己只提供平台 current-user、capability 和 Data API 的薄 browser adapter。

删除模板中的 Umi Max、ProComponents、`openxiangda-admin`、采购审批、Workflow 和移动端并行 UI。alpha 阶段不提供双栈兼容层，也不保留 Umi 创建选项。

## 能力所有者与稳定不变量

- Vite 只拥有本地 HMR、静态构建和同源代理生命周期。
- React Router 只拥有浏览器页面生命周期。
- Refine Core 只拥有资源 query/mutation 生命周期。
- 平台拥有登录用户、角色并集、capabilities、行权限和字段权限。
- Native Data API 拥有 instruments CRUD；前端和 Nest 不复制 CRUD。
- Nest 只拥有 `/api` 下的自定义业务动作，并通过 `@CurrentUser()` 消费平台用户上下文。
- 浏览器只请求相对 `/service` 和 `/api`；它不保存平台地址、Dev Session token、OAuth client、RoleSession 或应用密钥。

UI 隐藏、按钮禁用和字段只读只是体验保护。服务端授权始终是权威，客户端 filter 不能扩大数据范围。

## 受影响合同

- `templates/application/apps/web/package.json`、Vite 配置、路由、页面、Data Provider、current-user adapter 和构建预算；
- `templates/application/apps/server` 的模块、CurrentUser 示例和无副作用动作；
- 模板 resource/authz/openxiangda 配置；
- create 的模板复制边界；
- getting started、frontend 和模板 README；
- 根 `template:check/test/build` 脚本。

现有公开 Umi/Admin 包暂不在本提交删除；它们不再是默认应用依赖，后续按公开包收敛计划独立处理。

## 当前合同与缺口

当前 browser SDK 的身份模型仍有历史 RoleSession 表面，不能作为新模板的身份入口。
模板采用极薄 `platform-client.ts`：Connected Dev 请求真实的
`dev-sessions/current` 用户/角色/能力并集；发布态只接受 index 中服务端注入的
`openxiangda-runtime-base`、`openxiangda-app-code`、
`openxiangda-environment`，并请求冻结的同源合同：

```text
GET /service/openxiangda-api/v2/applications/:appCode/native/current-user
    ?environmentKey=preproduction|production
```

响应的 `openxiangda.current-user/v2` 数据包含 environment 版本快照和
`principal.type=user`、userId、isAppSuperAdmin、roleCodes、capabilityCodes。
浏览器依靠 HttpOnly/SameSite=Lax Cookie，不读取 Token。标准客户端只在内存中恢复平台
RoleSession，并自动为 Data、Directory、文件和 App API 请求发送 header；应用业务代码
不读取或持久化该标识。
每个 Data API query/body 都显式携带同一 `environmentKey`；Nest 发布态路径由 app/env
meta 独立拼成
`/service/openxiangda-app-api/v2/:appCode/:environmentKey/:runtimePath*`，不能把前端
runtime base 误当后端 gateway。平台实现进入环境并通过发布态黑盒前，仍是 P0 发布
门禁；endpoint 不可用时模板 fail closed，不伪造用户、不回退旧 Provider。

权限声明只能使用当前 contracts 能编译的最近表达。五个受限字段使用五个独立
capability，当前只授予 school_admin；college_admin 和 instrument_admin 的更新会
被字段策略拒绝。当前 `fieldPolicies.write` 不能区分 create/update，所以不能同时
满足“college_admin 在授权学院创建时写必填范围字段”和“更新时禁止 reassign”。
模板安全地暂时关闭 college_admin create，但黄金矩阵不变；P0 必须增加
`fieldPolicies` 的 operation-aware 合同后恢复 college create。建议最小 DSL 为
`{ read?, create?, update?, write?, mask? }`，其中 create/update 仅在未声明时 fallback
到 write。

school_admin 的 `all()` 不能依赖 college dimension `*`：TypeScript evaluator
支持 wildcard，但 Native SQL manual grant 仍按 exact 匹配。模板不伪造等价性，
当前让 school_admin 数据策略 fail closed；P0 需要
`dataPolicy.unrestrictedRoleCodes: ['school_admin']` 或等价原生合同。DataQuery
也没有分组 OR，因此首期关键词诚实地只查询中文名，等待原生
OR AST 后再扩成名称/仪器编码/资产编码/规格型号综合搜索。禁止补
`departmentScopeKey`、`instrumentScopeKey`、`adminUserIds` 或 Function CRUD。

首个 connected-development 平台切片只支持已发布资源，Manifest overlay 仍是已知平台缺口。模板不得以本地假数据掩盖该限制。CLI 默认 help 仍暴露过多历史高级命令，也是后续 P0 收口项；本前端提交不顺手重构 CLI 命令注册。

## 失败、并发和资源边界

- current-user 或 Data API 不可用时页面失败关闭并给出可修复错误；不回退到管理员身份或 fixture。
- update/delete 必须携带 `revision`；409 要求刷新，不静默覆盖。
- production 连接必须持续显示正式数据横幅。
- Connected Dev 的 Vite/Nest/proxy 仅绑定 `127.0.0.1`；Nest 容器生产进程才监听容器接口。
- 模板源文件少于 50 个；create 明确排除 `dist`、coverage、`.openxiangda`、`.turbo`、`.turbopack`、`.umi`、`.umi-production` 和测试报告。
- production JS、总产物和模板源码数量由自动测试约束。当前 Refine/Ant Design 原型约 1.45 MB，模板使用显式 vendor chunk 拆分。

## 回滚边界

本次是 2.0 alpha 模板的破坏性替换。回滚只需恢复本提交之前的模板 commit；不迁移、不修改 1.x 应用，不改变已经创建的独立应用仓库，也不要求平台数据回滚。

## 可证伪验证

1. 模板 `pnpm check/test/build` 全部通过；
2. 从空目录执行 create，不出现 Umi、purchase、Workflow、RoleSession、Function CRUD 或生成物；
3. `openxiangda dev` 启动 Vite + Nest + connected proxy，不启动 Docker/PostgreSQL/本地平台；
4. `/service` 仅访问平台 Data API，`/api` 仅访问本地 Nest；
5. instruments 页面具有 30 字段和标准 CRUD；
6. 模板资源/authz 合同编译；school/college/instrument 的完整 API 权限矩阵在上述三个 P0 合同完成后由独立平台测试验收，不能以 UI 测试冒充；
7. 源码、依赖、构建和产物预算测试失败时阻止回归；
8. `pnpm verify:affected` 通过。
