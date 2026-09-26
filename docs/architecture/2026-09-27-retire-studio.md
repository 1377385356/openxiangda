# 退役 Studio 专属工具链协议

2026-09-27：用户已明确废弃 openxiangda-studio 和 Model Center。平台对应服务已在独立 server 退役提交中删除。

## 本轮决策

- 证据：`create` 含 Studio Project / ProvisioningRun 初始化分支；工作区上下文与 contracts 发布 Studio 发现、绑定和编译摘要；通用 CLI JSON 输出与模板绑定也放在了同一 Studio 文件中。
- 所有者：平台仍唯一拥有应用、环境、身份和源码托管；CLI 只负责现有 connected development 与本地物化。
- 不变量：普通 create/link/provision/source、显式模板 digest、`--json` 和 `--json-events` 保持可用；V1 分发不变；不触碰并行任务的 stash、冻结制品、版本号及发布回执。
- 契约：删除 `--studio-project-id`、`--provisioning-run-id`、Studio 绑定/初始化/发现协议及 exported Studio 类型。共享 JSONL 事件和模板绑定提取为 CLI 契约；`toolchain.studio` 改为仅含通用 CLI 能力的 `toolchain.cli`，不提供旧 Studio 兼容层。
- 失败/并发：普通 create 的登录校验、站点绑定防漂移、幂等应用初始化和源码仓库创建仍由原实现负责。旧 Studio 参数明确不再受支持，不退化为普通初始化。
- 安全/资源：不访问客户现场、不启动/发布平台镜像、不修改业务数据和远端应用仓库。
- 回滚：独立回退本提交；无数据库迁移。不把旧客户端重新加入维护范围。
- 验收：V2 `pnpm verify:affected`，现有 CLI 黑盒覆盖普通创建、JSON/JSONL、失败恢复与秘密脱敏；contracts/devkit/MCP 的上下文 schema 保持一致。

## 发布边界

这是源码退役，不是 npm 发布。保留普通应用开发支持面，同时移除已停止维护的 Studio 公共导出；下一次发包需要评审配套 Changeset 和消费者影响。旧 Studio 客户端不能继续使用这份工具链。

## 验证结果

- `pnpm verify:affected`：24 / 24 个任务通过，包括 contracts、devkit、CLI、MCP 的构建与测试；devkit 385 项、CLI 18 项测试通过。
- CLI 黑盒完成 login → create → dev → check → deploy → status → logs → rollback，并验证普通创建的 JSON/JSONL 输出。
- `git diff --check` 通过；运行源码已无 Studio 或 Model Center 引用，测试中只保留旧参数不存在的断言。
- 未执行版本变更、npm 发布、平台镜像发布或客户现场操作；当前已发布版本仍为 2.29.1。
