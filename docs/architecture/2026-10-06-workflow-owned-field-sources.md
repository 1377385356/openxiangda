# 流程 owned 子字段关联来源

状态：实现及定向验证进行中。V2 标准表单，2026-10-06。

问题：根发起字段支持具名输入、根任务字段支持当前任务输入，但子表控制只传上传，
导致关联选项误走 child CRUD。能力由 Native 资源来源和 Workflow 当前任务投影共同
拥有，SDK 只转交上下文；不复制授权、选项或保存结果。

发起 `DataFieldSourceLaunchBinding.subtableFieldCode` 可选，仅声明的 named create
ownedSubject 对应根关系及 child field 通过。任务 `WorkflowTaskSourceBinding.subtable`
及 query 同形：fieldCode + row；persisted 为 kind/id/expectedRevision，new 为 kind/key。
两者不能混用；任务和父记录修订仍必填。根旧契约保持有效。

平台验证固定 task page 的表/行/字段可见和可写、原行修订、新行创建及容量；
readonly 过滤条件来自该服务端行，可写条件来自该行当前输入。字典 read/字段
投影/RLS 保留。拒绝权限扩大、指定他行、跨环境、额外资源或任意查询。

来源分页仍有界，cursor 绑定上下文、行、修订和真实过滤值；变化时旧分页拒绝，
请求失败保留输入。新行查询没有持久写入。条件资格取保存值，需要先保存才能
启用的控件沿用现有任务边界。组件 PC/移动均使用同一行 Form 的过滤值。

仅影响显式启用此 V2 契约的表单，不改 SQL、1.x 或默认 CRUD。可回退此主题；
旧 Server 拒绝新子表上下文，不能退回普通 child CRUD。回退保留在途实例和回执。
定向验收涵盖 task 路由/契约、named-owned 字段、目标读取拒绝、子行 CAS/容量/
readonly/他行拒绝/跨行 cursor，随后通过真实普通用户 PC/手机及任务填写验证。

已验证：合同2项、SDK客户端/子行6项、SDK affected 24/24；Server关联来源/具名/候选105项及类型检查通过。普通角色PC1440/手机390创建选项8项通过；当前任务选项实际办理验证继续进行，未作通过声明。
