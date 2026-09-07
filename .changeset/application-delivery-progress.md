---
"openxiangda-devkit-core": patch
"openxiangda-cli": patch
"openxiangda-mcp": patch
"openxiangda-skill-kit": patch
"openxiangda": patch
---

检查与部署共用阶段进度和耗时记录；长时间检查及镜像构建改为有时限、有界输出的异步执行。CLI 和 MCP 默认跟踪平台真实部署结果，观察中断保留原运行并支持继续查询，避免重复构建或把提交误报成部署成功。
