# openxiangda-mcp

OpenXiangda 2.0 的工作区 stdio 服务，由根包 `openxiangda --mcp-stdio` 启动；不提供第二个可执行文件。

先读取 workspace_context，再按任务读取 docs_read、契约或管理配置。docs_read 返回同版本中文正文与章节；工具输入、资源 URI 和结果说明运行 `pnpm openxiangda docs mcp` 查询。

check_app 使用与 CLI 相同的完整检查，会写生成文件并运行检查、测试和构建。deploy_app 已包含检查；production 必须传 from 复用成功测试版本。deployment_plan 只读预览，不构建、上传或提交。生成、测试、构建作为内部阶段，不再分别暴露为默认工具。

远端修改在用户授权范围内执行；失败设置 isError 并保留结构化错误。平台决定部署恢复行为。MCP 不接受任意 shell、镜像地址或 registry 凭据。
