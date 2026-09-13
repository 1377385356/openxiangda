---
'openxiangda': minor
'openxiangda-cli': patch
'openxiangda-contracts': minor
'openxiangda-devkit-core': minor
'openxiangda-nest': minor
'openxiangda-skill-kit': patch
---

现代相机图片直传与声明一次写对：上传预检、错误细化与声明默认值

- 浏览器托管上传（资源/匿名通道）按上传计划发布的 maxPixels 预检图片，超限自动本地降采样并重新发起上传；旧平台无契约时回退 40MP 保护阈值。
- DataFileUploadPlan 契约新增可选 maxPixels。
- number.integer 允许可选 precision 位数（拒绝 scale）；number.decimal 的精度错误信息带合法示例。
- resource-ref 缺 source、平台保留能力、AI 写操作副作用三类报错的补救文本直接携带正确片段。
- audit.read 支持 true 声明糖，自动绑定本资源读能力。
- CRUD 视图的 list/form/detail 省略 model 时继承视图模型，显式不一致仍拒绝。
- 新增 optionSnapshot/userSnapshot/departmentSnapshot/resourceSnapshot 与 isIdempotencyConflict 助手（openxiangda/nest），事务写快照字段不再返工。
- 业务验收报告的性能条目报错逐字段定位（含缺失字段名与最少实义字符说明）。
- 新增"声明速查"中文主题（declarations-cheatsheet），backend 文档补事务快照写入与幂等冲突复核两节。
