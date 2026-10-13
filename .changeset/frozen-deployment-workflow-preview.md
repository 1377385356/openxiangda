---
"openxiangda-devkit-core": minor
"openxiangda-cli": minor
"openxiangda-skill-kit": patch
---

增加指定失败 DeploymentRun 的只读流程例外预览。CLI 使用 status <deployment-id> --workflow-exceptions，按平台能力检测读取冻结候选、Head、attempt 和例外摘要，不自动确认或重试。
