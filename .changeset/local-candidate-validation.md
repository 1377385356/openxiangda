---
"openxiangda-devkit-core": patch
"openxiangda-cli": patch
"openxiangda-mcp": patch
"openxiangda-skill-kit": patch
"openxiangda": patch
---

提供明确标识范围的 check --local 与 MCP local 检查，用于离线和候选包 CI 验证，解决待发布校验规则依赖线上旧版本的循环。正式部署始终执行目标环境预检，不能通过本地选项绕过。
