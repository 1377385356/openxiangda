# 条件审批人正式声明与能力协商

状态：SDK 源码阶段；不发布包、不启用平台、不开放画布。承接 2026-10-12 已确认设计。

## 问题、所有者与边界

已有纯条件规则被排除在 canonical binding 外，开发侧不能声明，嵌套人员也不会自动产生角色并集、主管链、人员路由的能力需求。contracts 拥有类型、Schema、纯校验与能力需求；devkit 复用校验和既有 capability 协商；平台仍唯一拥有成员、任务、覆盖 CAS 与执行。

将标准 binding Schema 与表达式 Schema 提取为独立叶子模块，conditional Schema 只依赖它们，不从完整 workflowBindingSchema 反取 properties。正式类型区分标准与条件来源；条件字段不能与平铺来源混用。canonical Schema 使用 oneOf；不以伪 properties 兼容旧消费者。

## 不变量、失败与资源

所有 cases 和 otherwise 静态校验，20 cases、16 KiB、禁止嵌套，首命中及严格事实语义不变；CC 和 emptyPolicy skip 不支持组合。节点事实、连续主管链组织上下文和全部人员字段约束继续有效。开发声明是代码所有者的默认上限，不套用管理员编辑权限。

编译器对全叶子派生 role-union、role-input-selection、supervisor-chain、assignment-routing 需求，额外要求 workflow.conditional-assignment@1.0.0；登记版本只是请求契约，不代表平台可用。缺少/关闭/不匹配能力的目标必须由现有协商拒绝，不忽略规则或回落平铺来源。全部条件叶子的角色引用必须已声明。源 references 必须包含所有叶子角色。覆盖隐私 DTO v1 仍不扩容，平台保持明确拒绝不支持的条件覆盖导出。

本阶段没有目录请求、业务写入、数据库迁移或新配置存储；原 flat bindings、V1 和未使用该能力的租户保留原语义。

## 官方制品集成边界

平台根 gitlink 和 server vendor 当前精确配对官方已发布 contracts 2.82.0 / 1486e7e。SDK 在权威 master 上开发并附 Changeset；不得私封 contracts 填入 server/vendor，不把本轮源码 gitlink 与旧制品宣称为可部署组合。WSL 仅临时切换干净 SDK checkout 到已推送精确提交进行源码验证，完成后恢复根固定 gitlink；不修改其余平台目录/服务。官方 npm 发布获得授权并验证回读后，另一个原子集成步骤才能更新根 gitlink、vendor 和平台能力声明。

## 验收、回滚与剩余责任

验证正式类型、canonical Schema 接受规则/拒绝混合字段、无效未命中叶子/未声明事实/角色拒绝、连续主管链约束、嵌套能力闭包与摘要、source 全叶子角色，以及缺少/关闭/错版本能力明确拒绝。执行 verify:affected，分开记录源码检查与平台/浏览器/业务验收。

SDK 源码可独立回退，本轮不存在生产版本需要回滚。官方制品接入、任务快照、运行 resolver/覆盖/source 全闭环、PC 画布及真实业务验收仍是后续工作，任何源码测试都不证明其已完成。
