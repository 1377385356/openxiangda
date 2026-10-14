# Native 数据库接受时刻与批量时间前置条件

状态：实施；用户授权平台能力升级、V2业务和独立工作区。

问题：operation-time/database-now只能比较，无法原子写入请求时刻与30分钟冷却边界；逐科守卫超过Native固定20条预算。应用时钟不能成为权威。

所有者：Native事务与回执。新增datetime事务值 {kind:"database-accepted-time",offsetMilliseconds:integer}，偏移绝对值不超366天，仅已声明datetime顶级写字段解析。JSON/事件普通载荷不解释表达式；普通CRUD仍拒绝datetime对象。受信交互Named Action显式声明platformAccess.transactionTime:{mode:"database-accepted",recordSetAssertions?:true}且dataCommands为recoverable-native，编译要求data.transaction-time-values 1.0.0。服务/事件/队列不自动授予该入口。

不变量：原成功回执在任何新时钟/写入前恢复；请求摘要保留表达式原意图。所有非create写目标必须具有同ID的record-match/record-assert/record-set-match显式锁守卫；不接受靠后续UPDATE等待来定义时间。全部授权/守卫/目标更新行锁完成后只取一次PostgreSQL clock_timestamp()，动态守卫、写入派生值和回执evaluatedAt使用同一时刻；写字段权限、CAS、组织边界不扩张。缺声明、错字段、伪造时钟、越界/浮点偏移、SQL、身份/环境覆盖均拒绝。错误事务无部分数据或成功回执。

record-set-match增补可选公共assertions，最多20项，对每行执行同一value/field/database-now条件，字段可读且类型有效；时间断言在所有锁完成后统一评价。保留500行总预算、单资源一组、20总守卫、固定ID排序和两次RLS读取。该通用批量条件能力使用data.record-set-assertions 1.0.0声明；新批量断言仅供显式声明transactionTime.recordSetAssertions=true的交互具名动作。事件worker保留原守卫白名单，不消费这些新断言，也不授予actor-authority/role-member。

资源/并发：只读记录集合最多500，datetime表达式数受原事务字节和操作/字段预算限制；预锁时按resourceCode/id排序。无SQL迁移，不改变1.x或未声明V2动作。当前SQL动态断言均用锁后的固定时间，不从浏览器或应用日期取值。瞬时值绑定到原回执；回退不重新执行已成功原键。

验证：契约ESM/CJS与SDK能力声明一致；普通CRUD拒绝，Named缺声明拒绝，字段不可写/非datetime拒绝，边界偏移和非法输入；原回执恢复不重新读取时间，待锁时钟跨21:30，29:59拒绝/30:00允许，20科单组条件原子；真实PG锁等待、并发更新、撤权/RLS、部分失败无写入，最后正式SDK/镜像/V2现场读回分别验收。
\n开发配套：后端测试临时指向同一隔离worktree的contracts/dist，正式vendor包必须等SDK合入master并正式发行后取回；本地源测试不证明发布或部署。\n