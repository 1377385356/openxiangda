# 指定站点只读授权状态

状态：实施。证据：独立公开包 Demo B1-AUTH-DISCOVERY-01；未绑定项目无法用 context/admin 查询目标站点授权，login 会创建授权流程。

身份仍由平台拥有，会话仍仅使用现有 session.ts 存储和 CI 成对环境变量。新增 auth status --base-url 与 MCP authorization_status，不依赖工作区绑定。先规范化并严格匹配站点，再调用现有 whoami GET；不新增平台 API、凭据存储或站点切换，不刷新、注销、保存会话或打开浏览器。只返回状态、站点和核验时间，不输出凭据或平台原始响应。

无会话、站点不同、本地 access 过期、远端拒绝、网络/协议异常分别表示 missing、platform_mismatch、refresh_required、unauthorized、unavailable。authorized 仅表示当前 access 被 whoami 接受，不证明应用管理权限。无会话及站点不匹配不得发送网络请求。GET 禁止重定向，10 秒超时；错误响应不传播服务端正文。读操作没有本地写入并发或恢复状态；另一进程更新会话时，本次结果只是所读快照。需要正常续期时使用既有显式登录流程，不静默扩大只读操作。

范围仅 2.0 CLI/devkit/MCP/资料；不影响 1.x、其他租户及生产运行。回滚删除新增入口即可，旧登录契约不变。验收用独立临时会话与假 HTTP 端点证明 GET-only、跨站零请求、过期零刷新、拒绝/断网分别报告、无 token 泄漏与会话字节不变；CLI/MCP 发现测试与受影响检查覆盖发布入口。
