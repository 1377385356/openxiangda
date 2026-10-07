# 业务审批事务由工作流投影流转

状态：实施中。C64，2026-10-07。

## 证据与所有者

B18 经费立项在研创／票据任务补填金额后重算金额大写，并在立项任务选择后续
财务审核人。现有 `commandWithData` 必须由应用预测固定下一节点；all 会签尚未
结束时不流转，最终审批及晚分支又依赖新事实，应用复制引擎会形成第二权威。
工作流内核已在同事务核验令牌／权限、保存受限任务表单、保存应用派生值、刷新
事实并执行真实决定。因此只缺一个显式、固定定义中可审核的流转模式。

## 决定与契约

审批 handler 可选 `transitionPolicy: 'workflow'`；仅 approve 可声明。
应用以 `expectedTransition: { kind: 'approval-projection' }` 调用，固定定义明确
允许时，平台接受内核实际 running／approved 投影（包括会签等待），并保持
任何 assignment_pending 都回滚。默认精确下一节点比较及 correction-replay
保持。声明派生 `workflow.approval-business-command:1.0.0`，旧站点提前拒绝。

## 不变量、失败和安全

平台唯一拥有审批拓扑、会签、当前任务和新事实路由；应用只拥有派生业务值。
handler 的 operation、subject、当前用户、原令牌、任务与实例 CAS、任务页字段
许可、修订、候选人和 Native 事务守卫全部仍核验。不可把 reject／withdraw／
resubmit 或未声明的 handler 送入该模式；不能容忍未解析审批人。任何业务写入
或分支失败同事务回滚，原 key／结果保留；不额外预览、猜测或重放。

## 影响、回滚与验证

仅显式 opt-in 的 Native V2 流程使用，1.x 与旧精确模式不变；不新增存储或
放宽字段、请求、节点、身份／授权边界。回滚前恢复原精确模式定义。验证公开
schema 与 ESM／CJS 一致、能力协商、命令／声明匹配拒绝、会签等待／分支流转
成功、assignment_pending／异常状态回滚、原结果恢复；本地合成业务验证与
学校完整迁移分开。源码联调，不发布 npm 或变更正式 SDK gitlink。
