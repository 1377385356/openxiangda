---
"openxiangda": patch
---

修正浏览器 SDK 的流程节点配置读写路径，复用平台现有 `/admin` 控制器和当前应用环境；保留配置 CAS、幂等回执与直接 API 权限拒绝。
