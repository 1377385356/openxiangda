---
"openxiangda": patch
"openxiangda-cli": patch
---

标准审批与手写签名在内网 HTTP 页面缺少 SubtleCrypto 时使用成熟的浏览器 SHA-256 实现，保持相同摘要、定位器保密性和原操作恢复语义。
