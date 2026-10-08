---
"openxiangda-contracts": patch
"openxiangda-devkit-core": minor
"openxiangda-skill-kit": patch
---

应用制品支持平台授权 OSS 直传，后端镜像沿用原摘要和断点导入；老平台及关闭配置的站点继续使用现有上传。直传不下发存储密钥、不向 OSS 携带平台认证；前端 OSS/CDN 分发由平台存储开关管理。
