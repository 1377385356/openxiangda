---
"openxiangda": patch
"openxiangda-cli": patch
---

修复非 HTTPS 私有部署中浏览器 UUID 生成不兼容，改用 Web Crypto `getRandomValues` 生成幂等标识。
