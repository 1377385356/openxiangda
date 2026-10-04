---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-mcp": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

新增显式资料维护声明与SDK入口，按同一成员的资料查看/删除范围预览并受控删除资料及关联流程。复用Native事务与Workflow Kernel的原命令、审计和回执，不授整套流程管理员权；未知提交保留原键并先恢复原结果。默认未声明不启用，显式能力由编译器自动派生，平台无需额外初始化开关。
