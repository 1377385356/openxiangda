---
'openxiangda-devkit-core': minor
'openxiangda': minor
'openxiangda-cli': patch
'openxiangda-contracts': patch
'openxiangda-skill-kit': minor
---

平台能力探针实测修复批（2026-09-15）：

- devkit-core 编译器新增三项编译期拦截：workflow definition 必须显式声明 `launch`；
  `unrestrictedRoleCodes` 含基线角色（authenticatedUserRoleCode）直接报错（角色并集必命中，策略会失效）；
  快照字段（option/user/department/resource-ref/cascade）投影到标量 inputSchema 属性直接报错并给出对象形状片段。
- devkit-core 匿名公开策略校验拆分为带独立错误码与指针的分组诊断（route 绑定/字段覆盖/ownRecordFields 子集/draft 规则等），不再聚合为一条无指针报错。
- openxiangda 浏览器运行时：工作流发起页对 `definition.launch` 的渲染期访问改为可选链，缺失 launch 时显示可诊断的 404 而不是白屏；发起页轮询透出 process command 的 lastError（不再无提示转圈）。
- openxiangda-cli `create` 在目标目录无登录态时按工作区发现规则向上继承会话（.git 边界停住），错误提示同步更新。
- 文档：声明速查表补数据策略白名单语义、基线角色陷阱、cascade 数组形状、launch 必填、快照对象事实；workflow-events 补发起页与事实投影说明。
