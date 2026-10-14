# 有界目录与事务时间的应用声明编译闭环

状态：实施；属于尚未发布的2.71.0发行单元，沿用已评审的目录与事务时间决策。

证据：真实应用的backend.operations[].platformAccess声明在devkit authoring白名单被拒绝，两个bundle emitter未投影目录和事务时间，底层Native fixture不能证明应用消费成立。

所有者：devkit只校验和规范化应用声明，Native compiler继续唯一拥有平台能力推导；不新增运行时身份、授权或时间事实。

不变量：directoryClasses.maxIds仅1..20整数；transactionTime只接受database-accepted与可选true的recordSetAssertions，并要求recoverable-native dataCommands。两份产物规范化为同一声明，不扩大当前人/学校范围。runtime protocol目录和两种时间能力必须与Native requiredPlatformCapabilities对应；旧动作没有新声明时不获得新能力。

失败/并发及资源：在产物生成前拒绝空、数组、未知字段、错误模式和越界；能力或某份bundle丢失导致Native匹配失败；不改数据库、锁预算和事务语义。目录和时间权限仍在请求时由平台复核。

回滚/影响：加法编译接线，只涉及V2显式声明，不改变1.x和既有无声明应用。旧未发布f1634e3a制品保留；新源码重新冻结原发行版本，禁止覆盖旧manifest或已经发生npm写入的字节。

可证伪验证：真实defineOpenXiangdaApp -> compileApplicationSources -> canonical config/contracts -> ESM/CJS Native编译；比较全部requiredPlatformCapabilities、protocol capabilities、非法边界及时间单能力/无声明行为；V2 check、正式reference/packed门禁后才发行。

统一消费入口：真实V2后端从openxiangda/nest加载databaseAcceptedTime失败；根包必须显式转出物理Nest包已有的 helper 与 DataTransactionAcceptedTimeValue 类型。仅补齐同一公开能力，不建立别名/第二时钟。新增根包入口加载测试，正式packed与应用消费继续独立验证。
