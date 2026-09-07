# OpenXiangda 2.0

`openxiangda` 是应用开发统一安装的根包，提供 CLI、MCP、中文使用资料及同版本的 `openxiangda-v2` Skill。已有项目使用锁定版本；新项目使用明确的 2.0 版本。不要用未指定版本的全局命令判断项目行为。

```bash
pnpm openxiangda context --json
pnpm openxiangda docs
pnpm openxiangda docs getting-started
pnpm openxiangda skill install --workspace . --force
pnpm openxiangda dev
```

创建和技能安装默认检查内部支持协作所需的 DWS。`support status --json` 查看状态，`support bootstrap` 安装/复用官方完整技能，`support login` 引导 OAuth，`support join` 打开配置中的原邀请链接，由用户在钉钉完成加入。等待接入不阻塞应用工作；离线/CI 可加 `--skip-support`。咨询和持续跟进使用随统一入口安装的 `openxiangda-support` 技能，V1/V2 保持各自项目引擎。

应用导入统一子路径：

| 子路径 | 用途 |
| --- | --- |
| `openxiangda/config` | 模型、任务页、权限与应用声明 |
| `openxiangda/core` | 数据客户端与契约 |
| `openxiangda/react` | PC 页面、管理入口与标准组件 |
| `openxiangda/mobile` | 手机端组件 |
| `openxiangda/field-kit` | 字段、表单与详情 |
| `openxiangda/nest` | 按需启用的业务后端 |
| `openxiangda/testing` | 权限与业务测试辅助 |

默认在本地运行 React，连接远端测试平台；标准 CRUD、审批和通知无需自建后端。`check` 是统一校验入口；`deploy` 已包含校验。生产通过 `deploy --environment production --from <test-deployment-id>` 复用成功测试版本。

MCP 使用 `pnpm exec openxiangda --mcp-stdio --cwd <工作区绝对路径>`。先读取 workspace_context，再使用 docs_read 查询同版本中文正文。完整参数可运行 `pnpm openxiangda docs mcp`。

`OpenXiangdaApplication` 包含默认 Ant Design 样式、中文语言和消息上下文；独立组件可使用 `OpenXiangdaUiProvider`。管理页面使用 `OpenXiangdaAdminPage`，字段使用 Field Kit。自定义样式限制在组件内，应用负责全局重置；手机端只导入本包的局部样式，不引入上游移动库的全局重置。
