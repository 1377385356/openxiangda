# 字段 capability 引用与目录所有权

状态：实施；主题仅为编译阶段的 capability 所有权。

## 问题证据

仪器应用的普通用户字段投影将多个私有字段的 read 指向已在 authz.capabilities 声明的管理 capability。2.48.4 的 defineOpenXiangdaApp 报 APP_CONFIG_CAPABILITY_OWNER_CONFLICT。validateCapabilityClosure 只将审计字段视为引用，普通字段又注册资源 owner。原业务字段权限不能为通过检查而删除。

另一个同根反例是字段引用稍后资源的 CRUD capability：逐资源注册字段会抢占稍后资源的 owner。Native compileCapabilities 也逐资源生成，会因源顺序产生 NATIVE_CAPABILITY_DUPLICATE。

## 所有者与不变量

平台仍唯一拥有身份和运行时授权，本主题不改变授权求值。编译器拥有声明到唯一 capability 目录的投影。platform、显式 authz.capabilities 和各资源 CRUD 是真实定义；字段使用这些代码时只是引用，不改变 kind/name/source。先注册全部真实定义，再处理字段引用，资源顺序不得改变结果。

保留既有字段私有 capability 的隐式声明语义：没有真实定义的普通字段 capability 由所在资源定义；同资源复用允许，不同资源争夺该隐式定义仍拒绝。审计字段仅可引用已有定义。真实显式/CRUD、CRUD/CRUD owner 冲突、缺失审计引用和跨应用代码继续拒绝。字段 read/create/update 和显式空数组的权限语义不变。

## 契约、失败与边界

修正 devkit 声明闭包、契约目录编译和共享 Native 编译器三处，不添加协议字段、配置缓存或运行时许可。共享 Native 编译器继续校验 app code 和重复真实 owner，并独立拒绝不同资源的隐式字段 owner 冲突。无网络、数据库、并发状态或外部副作用；失败发生在配置编译，保留原候选。原 1.x 引擎不受影响；所有 V2 租户共用该编译规则，既有合法字段隐式声明继续可编译。

## 回滚与验证

可独立回退本主题提交；应用保留原 Head7、原锁文件和完整七包。实际 authoring→compileApplicationSources→compileNativeApplicationConfiguration 验证显式共享 read/create/update、跨资源 CRUD 引用和双向资源顺序；反例验证真实 owner 冲突、隐式 owner 冲突、跨应用字段和缺失审计引用。运行 verify:affected。源码主线、完整同源本地发行、目标预检和普通角色业务验收分别留证。
