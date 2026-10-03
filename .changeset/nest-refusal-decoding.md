---
"openxiangda": patch
---

浏览器 SDK 保留没有 code 字段的原生 Nest HTTP 4xx 拒绝文案和结构化诊断。成功 JSON 的解包方式、业务错误码优先级和写入恢复边界保持原合同，不自动重试写操作。
