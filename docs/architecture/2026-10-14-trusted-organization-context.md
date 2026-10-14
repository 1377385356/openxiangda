# 可信活动组织贯穿应用上下文

状态：实现前架构记录，2026-10-14；验证与发布状态由后续回执记录。

## 问题证据与所有者

平台原始 current authorization 已返回 activeOrganizationId，但公开 RuntimeAuthorization schema、浏览器 RuntimeIdentity 与 Nest CurrentUser 会丢弃该字段，Native invocation 未绑定它。目录当前用户事实已有只读分页接口，应用还没有官方客户端。身份与组织事实由平台唯一维护；SDK 只消费并传递已验证的投影，应用不持有企业密钥或目录权限表。

## 契约与不变量

NativePrincipal、RuntimeAuthorizationIdentity、environment 与 Connected Dev 投影使用可选 activeOrganizationId，缺失表示传统无组织上下文。字段来自真实平台会话或已验证短期 invocation；不从 URL、请求 body、用户 header、localStorage 或姓名推断。主体与环境组织不一致时浏览器拒绝安装 identity。Nest CurrentUser 只保留 verified context 的组织字段。

当前本人 memberships、directory-role-facts 使用平台路径、同源会话及有界分页。switch 使用平台原有成员检查，返回应用所需的脱敏结果；SDK 不暴露响应中的认证 token。切换成功或运输结果未知时废弃旧授权、命令缓存与在途读取，页面以新 identity epoch 重建；明确拒绝保留旧会话。跨页协调只广播失效，不广播身份或凭据。读取在旧 epoch 完成不得覆盖新页面。

## 范围与失败

本批仅闭合上下文和安全读取生命周期。role reach、目录事实到业务角色/班级范围、Native 组织数据策略仍属下一批，不能把本批成功作为隔离通过。无组织状态允许既有单租户应用继续按原权限工作；声明组织边界的资源后续必须失败关闭。

切换不重试写入；运输结果未知需要正常 profile/current authorization 读回。来源退役、成员撤销和安装撤销由服务器重新校验；页面按钮隐藏不能代替服务器拒绝。Connected Dev 使用平台当前开发者而非模拟用户。

## 资源、安全与回滚

列表每页最多 200，读取有取消和超时；客户端不自动拉取所有事实。切换单飞，身份生命周期复用已有 Runtime，不建立另一套 Router/授权 Provider。公开字段不含 raw、unionId、Secret 或 token；当前用户 private 资料仅限本人。

可选字段保持无组织调用兼容。配套 server/contracts/browser/Nest 经主线提交和冻结包发布后再部署，旧发行可回退代码但不会抹除现有目录事实。角色和数据组织策略启用后，必须保留对应新版本，不能回退到未执行组织权限的代码。

## 可证伪验证

合同 schema 接受合法组织且拒绝无效字段；平台到浏览器到 Nest 同一组织；缺失保持兼容；主体/环境不一致拒绝；切换及未知结果使旧读取、写客户端失效，拒绝不损坏原身份；跨页仅发送失效；事实跨校、退休/非成员/未安装服务端拒绝；真实站点读回与角色业务验收独立记录。

当前 SDK 写者：WSL openxiangda-public-pairing-wt；使用已发布 2.68.2 的干净 master 起点，不修改其他 SDK worktree。
