# 应用智能体执行确认与结果核对

设计来源：Claude 同一设计会话的 delivery decisions 06，2026-10-12；07 明确始终使用当前权限和应用 Head。用户已授权设计后实施、测试验证。本轮单一架构主题是 Agent 的执行准入与不确定结果核对。

## 问题证据与所有者

executeForAgent 已验证身份、当前目录、输入，但没有验证 confirmation；worker 可直接发起需要确认的操作。现有交互表、模型无关的 interaction Run 已提供锁、幂等请求、权限与过期语义，继续由 Agent center/interaction 所有。目录服务是最终业务执行入口；Native Data API 与应用 API gateway 分别拥有业务事务和应用命令。

## 不变量和契约

1. confirmation required 操作必须有当前用户通过 browser endpoint 接受的、未过期、匹配能力/规范 JSON 输入摘要/应用版本/目录摘要的确认记录。Worker 凭据不能接受确认。记录只能被指定的 interaction Run 消费一次；模型参数不能传递确认授权。
2. 确认复用 interaction 表和既有串行准入，不建立另一身份、队列或业务命令。confirm/cancel 路由沿用 center identity 和 same-origin guard。记录 ID 和修订包含在摘要内；业务命令继续核验 CAS。
3. 当前权限与 Head 在确认及执行时重新检查。发布后旧卡片 superseded，执行前没有写入。confirmation none 和 v1 输入卡保持原义。
4. 工具调用保存服务器实际输入与幂等键，结果不确定时跨 Run 拒绝同一用户/应用/环境/能力和规范输入的模型调用。只读 reconcile 只能查业务所有者回执或声明的只读状态操作，绝不调用写操作。无回执不证明未执行；没有确定未执行证据不开放重试。
5. 人工结论独立保留审计，不能伪造业务成功回执；原工具保持不确定，另显示人工核实结论。晚到真实回执优先并保留人工记录。

## 并发、失败与资源

确认使用既有租户、会话、交互锁及 requestId/revision；双击只产生一个固定 interaction Run。消费通过数据库原子更新标记，重复拒绝。消费后进程中断保持 outcome unknown，核对不重放。原生事务继续使用预期 AppVersion 锁及 idempotency receipt，不绕过 Data API。待确认计入每会话 10、每用户 50 的现有上限；输入 48 KB、摘要 16 KB、最多 20 项，人工备注 1000 字。状态操作由目录声明且当前有权读取的 read 能力绑定，接受固定 server-generated 参数，输出有界严格验证。

## 变更与回滚

SQL-only additive migration 添加 interaction kind/summary/consume metadata、tool execution metadata 与人工审计表，不改历史迁移。UI 增加确认、取消、核对和人工结论。1.x 不消费这些表或 Agent 路由；既有平台 assistant 与 workflow designer 保持各自所有者。回滚旧 server image，新增记录保留可读。禁止用关闭 guard 的开关代替回滚。

## 可证伪验证

隔离 PostgreSQL schema 验证：required 模型调用零写；worker token confirm 拒绝；双击只写一次；不同 requestId 拒绝复用；修改输入、版本、目录、角色拒绝；confirm 后发布在执行前 superseded；执行后超时通过 Native Data receipt 查询成功而不重复写；缺失回执仍 unknown；无状态所有者的外部操作仍 unknown；人工结论审计；晚到真实回执保留；none/v1 既有旅程通过。浏览器确认渲染独立验证。隔离数据库不代表真实平台权限或模型端到端验收。

## 回执归属补充决策（Claude 08）

事务回执增加平台发出的 invocationKey/intentDigest，写入 Data API 既有事务回执并参与 request_digest；Agent 保存原环境 ID、版本、Head 修订、principal type/key 的查询范围。相同键和另一请求的已提交回执是本请求不可能在该键执行的正面证据；没有回执仍然未知。正常成功也必须校验返回 origin；旧工具没有绑定时只可保留未知。浏览器 transaction 请求体不接受 origin。

本阶段应用 API 操作仅支持 status-operation 自动核对；platform-transaction 声明提示尚不支持。状态操作接收平台绑定及发起用户，必须回显绑定；超时、缺失、错误回显保持未知。应用成功陈述与平台事务证明在界面中有明确来源。单个 completing 平台事务的应用命令支持属于后续第 6 阶段，另行记录。
