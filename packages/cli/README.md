# openxiangda-cli

这是根包 CLI 的内部实现，应用通过 `openxiangda` 安装和运行。命令覆盖创建、上下文、中文资料、开发、统一检查、部署、状态、日志、恢复、环境启停、AppSpec 和 Skill 安装；完整参数运行 `pnpm openxiangda docs cli`。

默认开发连接远端测试平台，自定义 Nest 后端按需启用。check 会生成并检查、测试、构建；前置失败时停止。deploy 已包含检查，生产只能晋级成功测试版本。平台 recovery 是恢复操作的权威。

`--json` 输出一个 `openxiangda.cli-result/v2`。Studio 集成在 create、dev、check、deploy、logs、rollback 使用 `--json-events --run-id <uuid>`，每行一个 `openxiangda.cli-event/v1`；与 --json 互斥。模板引用和摘要成对验证；站点绑定初始化保留 ProjectProvisioningRun 对 Application 与 Git 的权威。

MCP 复用同一命令的 `--mcp-stdio --cwd <工作区绝对路径>` 模式。插件动态加载已禁用，避免其他命令覆盖当前版本实现。
