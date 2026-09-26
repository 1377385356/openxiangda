---
"openxiangda": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": patch
---

模型支持可选条件唯一键，统一编译 uniqueKeys 并推导 data.unique-keys@1.0.0。
共享类型、JSON Schema、声明诊断及 ESM/CJS 编译器使用相同有界规则，显式支持
exact-v1、NFKC 空白折叠和 ASCII 大写；省略规则的应用不增加平台要求。

唯一性由支持该能力的平台在环境激活时安装数据库约束；普通 CRUD、导入和事务
遵循同一约束。已安装规则变更需要受管迁移，连接开发不能私下改写规则。
