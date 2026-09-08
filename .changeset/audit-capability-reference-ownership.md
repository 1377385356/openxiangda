---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-skill-kit": patch
"openxiangda": patch
---

修复审计权限引用已有能力被误判为重复 catalog 定义的问题，保留原能力所有者，并在本地与平台共同拒绝未声明的审计能力引用。
