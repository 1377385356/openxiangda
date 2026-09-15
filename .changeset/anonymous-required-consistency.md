---
'openxiangda-devkit-core': minor
'openxiangda': minor
'openxiangda-contracts': minor
---

平台探针第二轮修复：

- devkit 编译器：匿名公开策略的 requiredFields 与模型必填声明一致性校验——策略必填字段未在模型声明 required: true 时报错（标准表单控件将不带必填校验，空值提交会被服务端拒绝），报错给出两条修复路径。
- devkit 编译器：数据策略规则支持审计用户列 created_by/updated_by 作为 current_user 规则字段（"用户只看自己创建"的基线角色行级收窄手段；其余规则主体不支持审计列，运行时 WITH CHECK 的正向匹配问题另行跟进）。
- openxiangda 浏览器运行时：移除生产环境"正在使用正式数据"常驻警示横幅。
