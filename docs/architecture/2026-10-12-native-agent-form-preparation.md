# 原生助手填写准备：普通字段值与真实 partial patch

2026-10-12。依据 Claude 09、12、14，单独推进纯契约和只读归一化。原生 form 在目录/worker 保持关闭，平台能力不宣告；不是完整填写执行开放。

## 证据与能力 owner

3D 只读 worker 的冻结依赖 13 套件、206 项通过，真实模型 1 项跳过。既有 form 编译器的 update 结构仍把目标嵌套在 target，且 update 描述符 required 全部为 false，和方案要求的普通 id/expectedRevision/data、必填但可以不修改不一致。

编译器唯一拥有任务描述符/值 Schema。原 Data API、字段 source、目录、候选与 scope owner 唯一授权、读取和修改；本单元只读取和提出普通字段值，不写数据库业务记录，不建立命令绑定/幂等/抑制状态。

## 不变量、契约与失败

客户端/模型不能提供记录 id/revision，model hint 只有 receipt handle；服务端按当前用户重读目标。创建/更新值都沿用普通字段值 Schema。更新仅含触及字段；可读且未遮蔽的同值删去，私有/遮蔽原值不用于比较或输出；全无变更是确定 no-change，没有命令。必填字段可不改，不可非法清空。记录变更强制待填写，既有权限/版本/失效指针拒绝不被包装成猜测成功。

引用按原 owner 的精确等值及 saved-record 上下文解析；依赖按有界拓扑顺序。scope 变化须清空依赖人员且同次不能重选，不把模型人员 hint 应用于新范围。未知 identity/metadata 的 hint 是字段错误，不偷偷丢弃。候选只作展示无权限。没有调用写接口；投影损坏/owner 不可用是确定失败，不能回退通用目录或构造 launch/action。

## 安全、资源、回滚与影响

最多20字段、50个多值、候选20项/字段且总32KB、48KB准备结果；依赖循环确定拒绝，不无界分页。运行时重读 context/Head，不引入第二授权或目标状态 owner。首次输出为内部准备事实，不能误称执行成功。无 agents 的制品行为和 v1 字符串卡片不变；pre-release 任务契约直接修正，不增加兼容层。回滚纯编译及准备方法即可，无 SQL 迁移/业务状态删除。稳定1.x/其他租户/生产不启用新路径。

## 可证伪验证

编译器 ordinary command Schema/required descriptor、model目标拒绝、partial patch空值；无效 scalar/metadata 逐字段错误、owner exact/ambiguous、依赖顺序/未解依赖、私有baseline不输出/不判等、no-op无任何写调用、版本变化/旧revision、scope变化clear和同次禁止选人、owner不可用不返回可执行准备。仍需后续命令承认、dispatching recovery和Field Kit卡片才能启用填写。
