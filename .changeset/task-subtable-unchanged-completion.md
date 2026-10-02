---
"openxiangda": patch
"openxiangda-cli": patch
---

任务子表没有修改时，完成前校验使用当前已保存行；不把差量请求中未出现的子表误判为非法输入。完整子行仍按原主子版本与页面规则核验。
