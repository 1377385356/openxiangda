---
"openxiangda": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": patch
---

新增显式 recordPrint 声明和独立单记录打印投影，按同一成员的资料读取、打印能力、原RLS及字段策略验权。标准资料详情提供PC/手机打印预览，打印前重新读取当前授权资料，失败或身份变化清除旧预览；附件仅打印名称/大小，遇到详情子表明确拒绝，不静默遗漏。平台能力自动注册，无初始化开关或新表。

CLI随根包版本更新模板的精确SDK依赖，保留同一次分发的创建与初始化路径。
