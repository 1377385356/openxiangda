---
"openxiangda": patch
"openxiangda-cli": patch
---

修复统一入口进入 pnpm 安装的 V2 工作区时报 WORKSPACE_ENGINE_DEPENDENCY_MISSING。依赖从已选定引擎的真实包目录解析，保留项目版本锁定、代际和登录隔离。

CLI 内置新应用模板同步引用该修复版本，避免新项目继续安装旧入口。
