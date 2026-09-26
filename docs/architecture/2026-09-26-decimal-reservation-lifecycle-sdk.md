# 精确额度审批生命周期的 SDK 与编译契约

日期：2026-09-26。状态：实现候选，尚需正式包与客户版本读回。

## 问题与归属

server c4559b31 已实现 BusinessProcess reserve、Native 审批终态和同记录重提；
现有公共 SDK 仅有 reserve DTO 与具名动作声明，事件声明和 Native 事务不能表达
完整终态。应用真实审批处理器在受管事件上下文调用 ApplicationData.transaction。
仅发服务端镜像无法让应用安全接入，双方编译器与公共 SDK 必须同时覆盖。

平台拥有额度、命令、审批轮次、事件授权与事务事实。应用只声明字段及目标状态，
保留提交与终态的原幂等键。客户端不新增余额服务或以求和替代 NUMERIC 台账。

## 不变量、兼容与影响

- 事件 grant 只允许 completed/commit、rejected/release、withdrawn/release；
  显式绑定已声明审批和同一 subject 资源、已有 reserve 映射及真实状态选项。
- 同一个纯校验器供应用和平台编译器使用，规范化订阅和 capability usage digest，
  能力要求 data.decimal-reservations 1.1.0，阻止旧表/guard服务器接收新能力。
- Native 终态 DTO 只带 reservationKey、transitionKey、childOperationIndex；
  mode/金额/command/subjectRevision 必须由平台授权与台账取得。事件身份沿现有
  已验签事件上下文透传；普通运行时凭据不能自行声明合法审批事实。
- released 子合同仍不能通用写保护字段。修订保存在本人 FormDraft；一次 update
  BusinessProcess 提交原子完成正文/金额/CAS/新轮占额/草稿消费/审批命令。失败
  不消费草稿且不改变正式子记录。父/root/relation 不改变。
- 普通主合同、不使用额度的事务、V1 与未启用订阅保持原协议。新字段可选；
  不给 void/terminated 或签后金额变更制造不存在的业务 writer。

## 资源、失败与回滚

最多3种终态，每种最多16个目标状态，事务保持100操作上限。校验拒绝重复、
未知字段、native-data执行订阅、未声明资源/审批/状态及不一致mode。代码无外部
请求或秘密。SDK回滚用先前已发布包；启用后的平台台账/审计不删除，关闭新额度
流量后按官方镜像回滚，不把类型回退当数据库恢复。

## 可证伪验收

DTO/schema/语义校验拒绝额外mode与错误子操作；两编译器与capability摘要一致；
声明变动确实改变使用摘要；Nest保留原事务和事件上下文头；update subject +
FormDraft + reserve示例可编译。运行verify:affected，Changeset选版本，按官方
plan/verify/publish复用冻结tarball并registry读回。客户部署与真实审批/并发/
释放/重提验收另记，不用包发布或本地通过代替。
