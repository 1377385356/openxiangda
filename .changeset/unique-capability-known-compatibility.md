---
"openxiangda-devkit-core": patch
"openxiangda-skill-kit": patch
"openxiangda-cli": patch
"openxiangda": patch
---

修复基础data.unique-keys@1.0.0在已支持1.1.0的平台上被预检误拒。仅承认此已知兼容关系，保留反向、未知版本、未启用状态和其他能力的严格拒绝；应用派生需求及数据库约束不变。
