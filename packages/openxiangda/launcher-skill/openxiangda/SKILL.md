---
name: openxiangda
description: Identify OpenXiangda V1 or V2 workspaces and select the matching project tools and AI guidance. Use when working on an OpenXiangda application, creating a new application, checking a tool version, upgrading tools, or assessing a V1 migration.
---

# OpenXiangda 统一入口

本 Skill 只负责代际识别和分流，分发版本为 `__OPENXIANGDA_VERSION__`。

1. 从任务目录向上定位最近的工作区。`app-workspace.config.ts` 或 V1 `.openxiangda/state.json` 绑定属于 V1；`openxiangda.config.ts` 或 `openxiangda-app.config.ts` 属于 V2。同一目录出现冲突时停止，先解决归属，不能删配置来绕过识别。
2. 使用 `openxiangda version --json` 核对工作区、实际引擎版本和来源。已声明的项目依赖尚未安装时，按项目锁文件安装；不能用全局引擎代替项目锁定版本。
3. V1 阅读项目安装的 `$openxiangda-v1` 及其子技能；V2 阅读项目安装的 `$openxiangda-v2`。缺少匹配版本的技能时，在项目中执行 `openxiangda skill install --workspace .`。以该项目版本的文档、MCP 和命令发现结果为准，不把另一代的配置、SDK、登录态和发布命令带入项目。
4. 空目录创建新应用默认使用 V2。V2 应用先澄清产品、页面、权限与架构，确认 AppSpec 设计基线之后再制定开发计划。

## 升级与说明

- `openxiangda update check` 按项目代际检查稳定更新；离线时可继续使用本地能力。
- `openxiangda update install --target workspace` 更新本项目同代工具链。升级后检查源码与锁文件差异，并执行项目验证。
- `openxiangda update install --target launcher` 更新全局统一入口，需要 Node.js 24。此操作不转换已有项目。
- `openxiangda changelog` 查看实际引擎随包说明；指定版本可查看对应版本资料。
- `openxiangda migrate assess --to v2` 只读检查 V1 源码并列出迁移待核实项。评估结果不代表数据已迁移，也不授权自动改造旧应用。

原业务授权、环境和部署事实仍由项目及平台的现有契约管理。本入口不会改写角色、登录绑定、业务数据或部署状态。
