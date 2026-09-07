# Studio CLI 与工作区协议 v1

状态：Accepted

## 问题证据与能力所有者

- 现有 `--json` 只在命令结束时输出一个 `openxiangda.cli-result/v2`，长时间运行的 `create`、`dev`、`check` 和 `deploy` 没有可增量消费的机器事件；`dev --json` 还会主动关闭状态回调。
- `create` 公开接口只能从目录名推导应用代码和名称，模板目录只是内部测试参数，无法证明 Studio 选中的模板在执行前后没有变化。
- 现有 `openxiangda://workspace/context` 能描述工具链和工作区，但没有声明 Studio 可依赖的事件、结果与模板协议。
- `openxiangda-contracts` 唯一拥有 Studio wire schema；`DEVKIT_COMMANDS` 唯一拥有公开命令和风险等级；`openxiangda-cli` 唯一拥有命令序列化与模板物化；现有 workspace MCP 只投影这些事实，不建立第二个服务。

## 稳定不变量与接口

- `--json` 保持单一最终结果对象；`--json-events` 与它互斥，每行只包含一个 `openxiangda.cli-event/v1` 对象。
- 每个事件固定包含 `schemaVersion,eventId,runId,seq,type,timestamp,payload`。同一进程内 `seq` 从 1 严格递增；调用方可传 `--run-id` 绑定 Studio AgentRun，省略时由 CLI 生成 UUID。
- 事件类型仅为 `command.started`、`command.status`、`command.completed`、`command.failed`。完成和失败事件的 `payload.result` 继续使用现有 `openxiangda.cli-result/v2`，消费者无需解析中文输出。
- `create`、`dev`、`check`、`deploy`、`logs` 和 `rollback` 是首批事件命令。测试与构建继续由 `check` 内部拥有，并通过最终 result 的 stages 暴露；不为 Studio 增加公开 `test` 或 `build` 命令。
- `create --app-code --name` 允许 Studio 传递站点已确认的应用身份。`--template-ref` 与 `--template-digest` 必须成对出现；公开 CLI 只接受 `builtin:application` 或已物化的本地文件目录，不承担模板网络下载。
- 模板摘要为 `sha256:<64位小写十六进制>`，按经过复制过滤后的有序相对路径、文件大小与原始字节计算。模板含符号链接、超过 2000 个文件或 20 MiB 时失败。
- 模板绑定在安装前写入 `.openxiangda/template.json`，所以安装失败后的同一 create 可以验证并恢复。已有工作区携带显式模板参数时，引用或摘要不一致直接失败，禁止重新套用模板。
- `workspace/context.toolchain.studio` 通过现有 CLI 和 MCP 同时公开结果 schema、事件命令清单及模板协议；不增加应用 MCP、Catalog、身份、部署或预览状态源。

## 失败、并发与安全边界

- 每个 CLI 进程只拥有一个事件序列，不共享计数器。Studio 的 AgentRun 租约、Git worktree 和合并并发仍由 Studio 项目层拥有，不进入 CLI。
- `create` 在复制前验证模板摘要；摘要不一致不创建目标目录。安装或平台初始化失败保留工作区和模板绑定，并返回可安全重放的完整 create 命令。
- JSONL 模式与 JSON 模式一样捕获并丢弃包管理器 stdout/stderr，避免进度文本或凭据污染协议。事件状态只允许 CLI 生成的固定消息；远端 token、Cookie、请求头、`.env` 和子进程原始输出不进入事件。
- 模板引用不自动访问 HTTP、Git 或客户 Forgejo。Studio/Git Broker 负责在调用 CLI 前把签名模板物化到本地，CLI 只验证内容。
- 回滚边界是本仓库的 contracts/devkit/CLI/MCP package 版本。撤回后旧 `--json` 和既有 MCP 工具继续工作；已经创建的平台应用、DeploymentRun 和 Git 仓库不受影响。

## 可证伪验收

- Contracts 测试固定 JSON Schema、事件类型、模板摘要格式和 workspace capability。
- CLI 单测验证事件序列、runId 边界、命令注册表、显式 create 参数、模板摘要改变即失败，以及安装前模板绑定。
- source、built 和 packed CLI 黑盒验证 JSONL 无杂音、序号连续、runId 保持、最终 result 可解析，且依赖安装输出中的凭据形状不会泄漏。
- `pnpm verify:affected` 必须覆盖 contracts、devkit-core、CLI、MCP 及根包依赖边界。
