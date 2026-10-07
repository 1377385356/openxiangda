---
'openxiangda-contracts': patch
'openxiangda-devkit-core': patch
---

将 Native 配置 canonical 预算有界扩到 8 MiB，并仅对超过旧 4 MiB 的配置协商
独立字节能力。保留契约、请求总量、JSON 与任务表单限制，旧站点在上传前拒绝
不支持的能力，普通配置不增加需求。
