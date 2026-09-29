# 业务拒绝与诊断分离

PLAT-028：Nest ConflictException 已返回稳定 code 与中文 message；平台网关原样转发，但浏览器 SDK 把 code 和 requestId 拼入 Error.message，应用的技术错误过滤器因此将业务拒绝替换为通用提示。

决定：HTTP 4xx 的合法字符串 message 原样作为 Error.message，code/status/request 继续通过既有结构化属性传递；可选 retryable 仅保留服务端明确布尔值。5xx 和无响应行为保持不确定结果处理，不自动重试写操作。不修改应用源码、业务守卫、鉴权或网关转发。

平台 SDK 拥有响应解码，业务后端拥有可展示业务文案。无新存储、网络调用或全局状态。V1 不受影响；回退 SDK 可恢复旧错误字符串，但调用者应按 code 判断，不能解析 message。

验收：409 中文拒绝、403 权限拒绝和 retryable 不丢失，诊断内容仍不含请求正文、自由文本或凭据；500/传输未知结果不变，无自动 POST 重试。
