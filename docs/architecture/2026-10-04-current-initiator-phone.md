# 具名业务动作的本人联系电话快照

## 问题、所有者与决定

浙江师大 V1 线下培训申请从当前账号展示并保存姓名、手机号和院系。V2 的 SubjectProfile 有意不暴露联系方式，currentInitiator 也只接受 displayName、employeeNumber、primaryDepartment、departments。应用不能从浏览器传来的姓名、电话或其他人员 ID 建立第二份权威身份，也不能为保留申请功能把手机号加入所有页面的身份载荷。当前工具 9d3ad2ab、Server 2a4efdde，应用问题 PLT-016。

平台继续唯一拥有账号资料和当前发起人。增量在具名动作的 directory.mode=current-initiator 中允许显式声明 phone，返回本人的可空只读 phone 并纳入 snapshotRevision。SubjectProfile、目录搜索、selected-user 和账号资料修改协议保持其原投影。选人快照的类型显式排除 phone，既有 operation.directory 声明 schema 对 selected-user 拒绝 phone；不增加没有消费者的快照协议，不能因类型继承而扩大其他人员资料读取。

## 契约和不变量

- phone 从平台 users.phone 读取，仅在声明此字段的已验证当前发起人上下文中读取；调用方不能指定 userId、tenantId、自由字段或数据库表达式。
- 增加 directory.current-initiator-phone 1.0.0 能力。编译器从具名 operation 或受管命令的本人目录声明派生要求，平台明确广告此能力；旧基础目录声明不产生此要求。
- 私有解析器按内部显式选项在同一用户/部门 SQL 快照读取 phone；默认 SubjectProfile 不查询、不返回 phone。缺失/空白为 null，不用工号或示例电话补值。
- phone 是业务联系信息；不会改变当前用户、角色、目录可见范围或写权限，不提供手机号查人、人员列表或联系方式更新 API。
- 当前发起人和受管命令分别保留现有业务证明、租户、应用、环境、Head、角色、有效状态及 lease 校验。selected-user 声明 phone 在类型、编译和平台解析中拒绝。
- phone 只有字符串或 null，上限 80 字符，输出修剪空白；不记录值、不进入通用诊断。快照 revision 包含明确声明的值，电话改变后原资料修订改变。

## 失败、并发、资源和回滚

未声明字段不查询也不返回；未知字段、伪造身份键、无业务上下文和不可用账号继续失败关闭。空电话返回 null，由应用沿用原资料不齐的业务拒绝。没有新的重试、缓存、持久身份、表或迁移；读取最多一行，已有快照与数据库时间边界保留。应用业务提交仍重验同一目录声明的修订，原事务恢复不能重新派生身份。

旧应用的目录输出及摘要保持不变；新 phone 消费需要匹配的工具/Server 完整发行。撤回新消费应用后可整体回退发行，数据表没有变化。稳定 1.x 引擎、其他租户和生产部署不变；本轮只本机验证，不发布学校生产或 npm。

## 可证伪验证与交付

先增加失败测试：默认 SubjectProfile 不查询/输出电话；本人显式投影得到修剪后的电话、缺失 null、revision 随电话变化；选人不接受 phone、无声明不泄漏；伪造 userId/跨租户和未知字段继续拒绝；队列本人路径服从同一显式规则。契约测试验证 self-only 类型/schema、编译能力派生和非法 selected-user 声明，Nest 解码保留值。运行两个仓库的受影响门禁，按 Changesets 机器版本化，提交推送权威主线并更新根 gitlink，正式 exporter 输出完整七包再安装。

应用线下培训表单通过受保护的本人资料 operation 展示原只读字段，prepare 与 commit 从同一正式目录重新核对，不能相信浏览器资料。A/B 实际账号核验本人资料、他人猜 ID 拒绝、默认身份/人员检索不泄漏及申请读回；技术门禁和真实页面分别留证。


## 2026-10-04本机源码验证

Server初始回归复现3个phone拒绝、2个已有边界通过；修复后三组34项通过，新增null/非字符串/排队未声明投影用例再通过5项，类型和受影响源码lint通过。工具verify:affected最后24/24任务成功（5缓存），contracts167项、devkit-core429项、Nest114项以及CLI完整黑盒均通过。首次门禁因本轮未同步Skill专题失败，正式生成后继续；第二次因目录union正规化类型错误失败，补齐同一正规化函数后通过。未把测试直接从根目录执行缺decorator tsconfig或未构建dist的结果归为平台缺陷。版本与完整发行仍按Changesets计划，应用真实电话/线下任务另取证；不以本节源码验证关闭业务验收。
