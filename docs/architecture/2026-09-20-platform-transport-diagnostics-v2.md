# OpenXiangda 2.0 平台传输失败诊断

## 问题证据

- 合同管理 V3 的 `openxiangda dev` 在任何本地监听建立前只返回 `fetch failed`，无法区分登录、环境查询与 Dev Session 创建阶段。
- 同机对工作区绑定平台的匿名 `readyz` 与 capabilities 探测均在 TCP 建连前失败，路由表证明目标私网没有进入客户 VPN。请求未到 nginx，因此没有服务端生成的 requestId。
- 当前开发者会话和控制面客户端直接透传 Node `fetch` 异常；上层只能把异常消息当作错误码，丢失请求方法、脱敏路径与本地关联 ID。

## 能力所有者与不变量

- `openxiangda-devkit-core` 的平台 HTTP 传输层是唯一诊断所有者；应用、CLI 命令和平台服务不重复猜测网络原因。
- 现有请求语义、认证、超时、重试次数与幂等边界保持不变。本变更不自动重试，也不创建或重建 Dev Session。
- 服务端业务错误及服务端 requestId 继续按原 envelope 处理；仅在尚未取得 HTTP 响应时生成客户端 requestId 并明确报告传输阶段。

## 稳定合同

- 所有开发者会话和控制面 JSON 请求发送合法的 `X-Request-ID`；调用方提供合法值时复用，否则生成 UUID。
- HTTP 响应前失败统一映射为：
  - `OPENXIANGDA_PLATFORM_REQUEST_TIMEOUT`：Abort/Timeout 或底层 timeout cause；
  - `OPENXIANGDA_PLATFORM_TRANSPORT_FAILED`：DNS、拒绝连接、重置、TLS 或其他传输失败。
- 诊断只暴露 `requestId`、HTTP method、去掉 query 的相对 API path 和限长的底层 cause code；不暴露平台主机、查询参数、Bearer、Cookie、Dev Session token 或原始错误文本。
- Connected Dev 顶层诊断保留稳定码，并把相对 API path、客户端 requestId 和 cause code 放入结构化 details。请求未到服务端时，该 ID 仅用于本地关联，不能宣称服务端已有对应日志。

## 失败、并发与资源边界

- 每次物理请求生成或复用一个 requestId；401 后的显式刷新重试是新的物理请求，继续遵循现有一次重试边界。
- 诊断构造无共享可变状态，不引入锁、队列或后台任务。
- cause code 仅接受字母、数字、点、下划线与短横线，最长 64 字符；path 仅保留 query 之前的相对路径。

## 影响与回滚

- 影响 `openxiangda-devkit-core` 的会话、check/deploy/dev 等控制面调用；不改变平台 API、数据库、应用声明或 1.x 工具。
- 制品上传继续保留专用 `OPENXIANGDA_ARTIFACT_UPLOAD_FAILED` 合同，并复用底层关联信息。
- 回滚边界为单个 devkit-core 发布提交；回滚后只失去结构化诊断，不影响平台数据或已创建的运行状态。

## 可证伪验证

1. whoami 连接超时返回 timeout 稳定码、504、GET、脱敏相对 path、合法 requestId 与 cause code。
2. 控制面连接拒绝返回 transport 稳定码、503，并携带相同结构化字段。
3. Connected Dev 预检把稳定码、path、requestId 与 cause code 呈现在 Diagnostic 中。
4. 查询参数、Token 和平台主机不出现在结构化诊断或错误消息中。
5. 远端 401 仍只刷新并重试一次；服务端 envelope 错误保持原错误码与 requestId。
6. 制品上传中断仍返回原有专用错误码与可重试语义。
7. devkit-core 类型检查、聚焦测试和 `pnpm verify:affected` 通过。
