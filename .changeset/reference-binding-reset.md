---
"openxiangda": patch
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
---

资源关联字段可显式设置 source.clearOnBindingChange。标准表单、任务和子表的用户
输入事件按真实引用身份清除旧选择，保留其他行和无关输入；程序预填和草稿恢复
不触发联动。默认行为保留，单选、多选、可写边界与有界依赖传递使用同一规则。
