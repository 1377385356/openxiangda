---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-mcp": patch
"openxiangda-skill-kit": patch
"openxiangda": patch
---

将完整配置与字段纯规则移入共享 contracts Node 子入口，提供同源 ESM/CJS 构建。本地完整校验先于环境预检和构建，核对平台规则摘要与实际投影摘要。兼容性描述升级至 v2，需要与同批平台配套更新；平台的只读预检提前发现权限、必需密钥及物理模型不兼容，最终执行继续保留真实状态与并发保护。
