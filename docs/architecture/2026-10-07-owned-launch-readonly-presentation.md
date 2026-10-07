# 具名提交子行只读展示

状态：2026-10-07实施决定；单主题：页面派生字段只展示、不提交。

## 证据与所有者

B11手机监考原申请被B11_OWNED_INVALID拒绝，捕获body含申请人不能填写的
employeeNumber。业务服务应从授权人物资料派生，sealed owned grant的字段闭包
包含后端派生字段，并不表示这些字段应允许用户填写。现有根页面fieldState与
subtable渲染不能分别约束子行展示和提交。SDK页面拥有纯展示配置，平台继续唯一
拥有身份、字段授权、Native写入和流程命令；不把新配置称字段权限。

## 不变量与合同

增量WorkflowSubmissionFormOptions.subtableReadonlyFields按根表字段名声明子字段名。
只在具名owned新建页面生效；字段必须在当前父关系和sealed grant闭包内，配置
错误明确拒绝渲染，不猜权限或静默扩大。SubtableField launch.readonlyFieldCodes
只收窄canWrite，canRead不变。该值留在父表用于联动/展示；namedProcessFormValues
编码时去除对应输入。Server依原grant写可信派生值；攻击者直接提交仍受服务规则。
不改声明模型、运行合同、平台数据权限或任务field状态。无配置的所有旧页面行为
不变，稳定1.x不受影响。根包patch Changeset，批次退出才冻结。

## 失败、并发、资源与回退

错误表/字段名在发出新申请前失败；不新增请求、存储、写操作或重试。当前行key、
手填、快照消费、时间查询、CAS和2MiB边界不变。旧申请未知结果先查原key；已明确
拒绝且not_observed时，记录去除展示字段的输入修正，再使用同key恢复，不能造新申请。
回退页面和SDK修改，保留原输入、拒绝、回执；停相关新入口避免恢复旧误提交。

## 可证伪验证

PC/手机具名子行工号能显示且无可编辑输入；编码无派生工号，保留人员引用、手填
电话、时段和原行key，输入未被原地修改。普通标准流程与无配置具名回归，非法
readonly映射拒绝。B11同原key恢复并核对Native所存工号来自获授权资料，随后
两审批实际完成；源码fixture与正式批次/学校源验收分别记录。
