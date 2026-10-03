# 原生 Nest HTTP 拒绝的浏览器解码

## 问题与所有者

浙江师大 V2 本机 Head19 的原试卷编辑页保留了过期草稿并正确收到 prepare 409：`{message:"试卷已变化或该仪器已有试卷，不能覆盖",error:"Conflict",statusCode:409}`。网关原样转发，浏览器 SDK 只把包含 `code` 的对象交给错误解码，因此显示通用 HTTP_409，丢失了后端明确的拒绝原因。证据为应用 training-admin-paper-draft-retained-head19-20261004.json。

SDK 拥有 HTTP 解码，业务后端拥有拒绝文案与业务状态；沿用 2026-09-29-business-error-messages.md 的 4xx 字符串文案规则。修复不在应用建立第二个 fetch 客户端，不改变 Nest 异常、网关或数据权限。

## 不变量与影响契约

非成功 HTTP 响应的 JSON 对象即使没有 `code`，也传入既有结构化错误解码；合法字符串 `message` 在 4xx 原样显示。没有稳定业务码时使用实际 HTTP 状态派生的 HTTP_<status>，不把 Nest 的 `error` 文案或 body.statusCode 当权威状态。既有 errorCode、data、retryable、Retry-After 和请求诊断继续保留。

成功响应仍仅按既有 `code` envelope 解包，其它成功 JSON 原样返回。读取身份、授权、环境及全局请求生命周期不变；未知传输、5xx、取消和写入不自动重试。仅 V2 浏览器 SDK 受影响，V1 引擎、其他租户数据和生产配置不变。

## 失败、资源与回滚

只解析本次已取得的 JSON，不增加网络调用、存储、重试或日志自由文本。primitive/array/不可解析错误响应沿用 HTTP fallback；诊断仍排除响应数据、正文、文案和凭据。单个写入保持一次发送，4xx 解码不能证明提交阶段没有副作用，应用继续按原阶段区分明确拒绝和未知结果。

回滚完整 SDK 发行即可恢复旧展示，平台数据与业务事务不需回退；应用不能通过匹配新文案放宽原提交恢复边界。

## 可证伪验证

新增穿过 requestApplicationApi 的标准无 code Nest 400/403/409/422、稳定业务码和 HTTP 状态不一致负例；核验中文消息、结构化字段、诊断排密和 POST 一次。成功原生 JSON 不被解包；primitive/array/non-JSON 错误仍 fallback。运行 verify:affected 后，由机器版本化并导出完整七包，本机原编辑器重现冲突、保留草稿并显示原拒绝原因。源码测试、发行安装与真实页面验收分别记录。
