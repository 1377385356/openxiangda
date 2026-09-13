---
'openxiangda-contracts': patch
'openxiangda-devkit-core': patch
'openxiangda': patch
'openxiangda-cli': patch
---

共享编译器支持生成式用户标准面契约闭合

- 路由清单接受 resource-records / resource-submit 条目（携带 resourceCode，码与路径形状稳定）。
- 闭合比对按配置事实校验工具链产出的用户标准路由（资源存在、能力等于该资源 read/create、路径与 routeCode 匹配）后并入期望契约并重算摘要；配置 bundle 不变，旧平台无需配合升级。
- 登录默认路由码接受 user.<resource>.(records|submit)（资源存在即有效）。
- 生成码分隔符统一为点号（user.<resource>.records），符合稳定码模式。
