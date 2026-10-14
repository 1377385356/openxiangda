---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-skill-kit": patch
"openxiangda-cli": patch
"openxiangda": patch
---

修复公开具名查询把多字段排序按字段名字母顺序重排的问题，保留声明的ORDER BY优先级并纳入配置摘要。更新公开批量查询随包技能资料及CLI模板版本；应用需重新编译发布后采用纠正的排序，不修改旧不可变版本或业务数据。
