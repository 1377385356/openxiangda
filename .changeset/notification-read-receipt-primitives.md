---
"openxiangda-contracts": minor
"openxiangda-nest": minor
"openxiangda": minor
"openxiangda-skill-kit": patch
"openxiangda-cli": patch
---

增加通知投递详情与已读回执契约，以及按消息和投递 ID 读取缓存、请求一次查询的 SDK 方法；同步浏览器公开类型与中文技能参考。平台负责回执、权限和有限重试；应用决定选择哪些消息以及何时再次查询。

CLI 创建模板随根包版本同步更新精确依赖，保持新应用与已验证工具链一致。
