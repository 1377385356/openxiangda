---
"openxiangda": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": minor
"openxiangda-mcp": patch
"openxiangda-skill-kit": patch
---

平台开发者登录态改为工作区本地文件。CLI、MCP、自动刷新和退出均使用选定工作区的同一会话，停止隐式读取全局登录态。当前文件优先于 CI 环境变量；新建应用支持先在目标目录登录并保留该会话。旧全局登录用户需要在各项目重新登录。
