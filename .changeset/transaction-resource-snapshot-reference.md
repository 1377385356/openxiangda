---
"openxiangda-contracts": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

允许资源字段的严格快照 value 引用本事务前序 create 的主键；resourceSnapshot 提供类型重载，保留资源与显示标签。禁止其他嵌套引用、错误资源和前向引用；原平台字段、组织、授权及原子回滚保持。
