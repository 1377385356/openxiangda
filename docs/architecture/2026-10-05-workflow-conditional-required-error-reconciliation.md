# Workflow 跨字段条件必填错误的精确清理

状态：已实现，源码验证通过；真实应用页面待同源配套升级。范围只含 SDK 任务补填表单的错误生命周期。

## 问题与证据

本机应用 Head32 / definition3 的会议纪要为附件或非空白文字两选一。先空值同意，SDK 阻止 execute 并在附件字段 setFields 写入错误；随后填写文字，requiredWhen 已解除而旧附件错误仍显示。真实截图/DOM：V2 工作区 docs/migration/evidence/maintenance-head32-mobile-required-empty-reject-20261005.json，平台问题 PLT-029。有效审批和空拒绝成功不能证明提示已恢复。

## 能力所有者与不变量

共享 WorkflowTaskForm 是 PC/移动任务补填的唯一表单生命周期所有者；条件与空值语义仍由 contracts 的 applyWorkflowTaskPageValues 判定。业务应用不复制校验或清空全表错误。平台仍拥有任务/身份/字段授权、最终校验、CAS、命令和原结果；此修复不改变流程状态、声明或请求。

SDK 只登记自己因顶层 WORKFLOW_TASK_FORM_REQUIRED 写入的具体字段/消息。输入或表面变化后用同一正式验证器检查该字段；条件解除、字段隐藏/只读/移除或有效值才删除仍匹配的自有错误。保留 Field Kit/其他校验/服务端错误和子表错误；错误被别的校验替换时释放自有登记，不删除替换错误。不得把其他字段合法当成整个表单合法。

## 影响与失败边界

无 HTTP、授权、持久状态、重试或契约变更；每轮仅遍历先前失败的有界字段，最多 page 的200字段。使用当前已规范化 values；异步文件和条件仍受原 disabled/stale/未知结果保护。固定声明必填默认和旧在途定义不变。只影响可选 V2 Workflow UI，V1 与其他租户无行为变化。

## 可证伪验收与回滚

用正式 contracts 验证附件/文字互补、非空白值、隐藏/只读、重新变必填以及同时存在非本修复错误；再次清空两者仍不能提交。实际手机/PC操作空值、补另一字段、错误解除和不发 execute 的路径。运行仓库 verify:affected；Changeset 仅 root UI patch。可独立回退 SDK 提示修复，无数据迁移或业务回滚。

## 实际源码验证

verify:affected 12/12任务成功（24.813秒），包含boundary/orchestration、受影响包类型/测试/构建及应用样例。新增6项与原任务表单7项，正式 styles loader 下13项通过。首次手工命令遗漏仓库 test/register-styles.mjs 导致原测试在CSS import处无法运行，新纯函数6项当时通过；没有降低校验，按仓库正式测试入口恢复。真实页面尚未换SDK，不记PLT-029业务关闭。
