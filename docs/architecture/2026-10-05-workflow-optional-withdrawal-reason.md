# 固定流程撤回原因的选填策略

状态：已评审，待实现。主题：恢复原应用无输入撤回任务，不更改撤回授权或业务终态。

## 证据与所有者

迁移 PLT-028：V1 维保由申请人确认弹窗撤回，无原因输入；V2 Surface/Kernel 固定要求 reason，带理由成功不等价。流程 definition 是唯一策略所有者；平台 Kernel 按实例冻结 canonical_ir 检查，Surface 提供同一规则，应用不能伪造默认理由或放开前端校验。

## 决定与不变量

新增 instanceCommands.withdraw.reasonRequired:boolean。省略仍必填；显式 false 接受省略、空串或空白文字，不接受已提供的非字符串或超4000字符。beforeFact 可独立选用；空策略仍非法，声明截止事实时原必填 datetime/授权/数据库时钟校验不变。管理员终止原因仍必填且不接受此选项。现有流程/在途实例按原冻结规则，新 definition 才启用选填。

显式 false 自动要求 workflow.optional-withdrawal-reason@1.0.0，旧平台在部署前拒绝。同一个共享 contracts validator、工具 compiler 和平台 CommonJS artifact 发布；不手改配置摘要或生成输出。撤回仍只限发起人，原 token/Head/CAS/幂等回执/同事务Native业务效果及精确占用释放保持。

## 失败、安全、资源和回滚

Surface 与执行端按同一冻结策略。可选原因只在原实例锁后验证，不接收浏览器策略；所有拒绝回滚原事务，不新增请求、状态表或日志假理由。原结果仍以同一请求查询，不因可选项换键。代码仅V2 opt-in分支，默认必填与1.x不变；其他租户未声明不改变。回退平台前停止启用新定义，已创建选填实例不能用旧平台接管；业务数据/历史不会被代码回滚。

## 可证伪验收

共享JSON Schema与语义验证接受独立选填/截止组合，拒绝空策略、未知键、错误类型及对terminate放宽。两个编译器产物自动有 capability，省略不要求。Surface/真实执行验证省略、空串、空白、非字符串、超长以及默认仍拒绝；原token、非本人、旧版本和截止边界保持。新维保definition4的PC/手机空原因撤回、subject与实例一致回读并核对同事务原回执；旧definition3不追改。

## 验证过程

首次verify:affected在资料一致性检查发现已更新中文正文而Skill副本未同步；正式sync-developer-guidance生成25主题后恢复。第二次新增测试将应用声明直接套用canonical JSON Schema，因声明允许省略summaryFields而失败；改为验证编译器生成的正式定义，保留原错误。这些为测试/资料准备错误，没有删校验或修改业务输入来绕过。最终verify:affected通过全部受影响类型、测试、构建，具体任务与计数以日志为准；真实平台/应用验收另记。
