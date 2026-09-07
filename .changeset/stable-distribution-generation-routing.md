---
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-mcp": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

发布 OpenXiangda 2.0 正式分发入口：根据最近工作区识别 V1/V2，优先执行项目锁定引擎，新增分代更新、结构化版本信息、离线更新说明和只读 V1 迁移评估。统一 Skill 只负责分流，各代正文、配置和登录态保持独立。

七个公开 V2 包使用相同公开源码仓库和 MIT 许可证，从 alpha 退出到经评审的首个正式版本；全局统一入口要求 Node.js 24。正式渠道为 latest/v2，V1 维护渠道为 v1。现有冻结发布回执增加 GitHub Release 同步和说明摘要校验。
