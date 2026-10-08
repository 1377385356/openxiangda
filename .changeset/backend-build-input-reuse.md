---
"openxiangda-devkit-core": patch
---

测试发布按实际后端输入复用短期 OCI 制品，纯前端改动跳过 Docker 构建；仍逐次核验平台回执和权限。官方后端模板使用 frozen install、持久 pnpm 包与 registry metadata/Corepack 缓存，减少重复依赖下载和生产依赖整理联网。
