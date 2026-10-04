# 生成 Perspective 的只读输入契约

状态：实施；关联应用问题 PLT-032。范围仅 V2 浏览器 SDK 输入类型。

## 问题与所有者

仪器迁移应用官方 check（Operation 79fac1c0-1f53-4049-b827-ee184e3ad14c）在生成契约后类型检查失败。编译器正确输出非空 appPerspectives `as const`，但 RuntimePerspective 直接别名 AppPerspectiveContract，内部 roleCodes/capabilityCodes 要求可变数组，导致 OpenXiangdaApplication 的正式 perspectives 属性拒绝编译器输出。空模板没有暴露这个问题。

浏览器 Runtime 是消费生成声明的唯一所有者；编译器继续输出不可变声明，wire/Native canonical 类型与平台服务不改。复用 SDK 已有 DeepReadonly 输入类型，使 RuntimePerspective 接受生成的只读数组，也接受原可变 AppPerspectiveContract。运行时只执行 filter/some/includes，不写入声明；不在应用克隆数组、强转 any 或手改 generated。

## 不变量、影响与失败

Perspective 仍只收窄读取，身份、角色并集及写授权由平台拥有。没有新的状态、API、能力或数据结构，没有授权扩大、网络请求或并发语义变化。V1 与未声明 Perspective 的应用不受影响；已有可变输入兼容。没有数据库迁移，也不要求新平台运行协议。

## 验证与回滚

TypeScript 从公共 react 导出读取 OpenXiangdaApplicationProps，非空嵌套只读输入和原可变 contract 必须通过；误字段、错误字段类型及尝试修改能力数组必须被类型拒绝。运行 verify:affected，通过后由已评审 Changeset 物化版本、官方本机 exporter 分发完整七包。应用新 SDK 的官方 check/deploy 与真实范围验收分别留证，不能用 SDK 类型测试替代业务验收。可独立回退浏览器类型；回退会重新暴露原生成契约错误，不改变任何已写业务。
