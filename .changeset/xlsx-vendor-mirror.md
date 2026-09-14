---
'openxiangda': patch
'openxiangda-cli': patch
---

xlsx 依赖从 cdn.sheetjs.com 直链迁移到本仓库 GitHub Release 镜像（vendor-mirror，sha256 与上游一致并由锁文件 integrity 钉住）。消除 SheetJS 官方 CDN 单点——它曾在发布验证中造成 ECONNRESET 整轮报废；GitHub Release 资产端点同时改善 CI 与境内网络的安装稳定性。
