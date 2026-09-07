# OpenXiangda 2.0 工具链

本仓库维护 OpenXiangda 2.0 应用工具链和统一分发入口。新应用默认使用 V2，已有 V1 工作区继续由 V1 引擎维护。源码与版本说明发布在 GitHub，安装包通过公开 npm registry 分发。

使用 Node.js 24 安装 `openxiangda`，按[中文安装指南](docs/getting-started.md)开始。进入已有项目先运行 `openxiangda version --json`，核对工作区代际、实际引擎版本和解析来源；V2 项目可执行 `pnpm openxiangda docs` 读取锁定版本资料。

| 命令 | 用途 |
| --- | --- |
| `openxiangda update check` | 按项目代际检查稳定更新与说明 |
| `openxiangda update install --target workspace` | 升级本项目同代工具链 |
| `openxiangda update install --target launcher` | 升级全局统一入口 |
| `openxiangda changelog [version]` | 查看随包或指定版本说明 |
| `openxiangda migrate assess --to v2` | 只读评估 V1 源码迁移范围 |
| `openxiangda skill install --workspace .` | 安装当前项目版本的 Skill 与统一分流入口 |

`latest` 与 `stable-v2` 指向 V2 正式版，`legacy-v1` 指向 [V1 维护版](https://github.com/1377385356/openxiangda-v1)，`alpha` 为预发布。配置冲突、缺失已声明依赖或引擎代际不符时明确停止，不会转换旧应用。迁移评估不会读取远端数据或自动执行迁移。

对仍在测试阶段的 V1 项目，若 V2 能力满足需求、迁移成本可控，优先建议采用 V2。先评估能力覆盖、数据和在途流程，再按项目确认设计、迁移与回滚方案。

平台架构决定、设计稿和历史记录保留在仓库，不进入应用开发指南站的构建与搜索。

默认应用是本地 React 连接远端测试平台。模型、页面、权限、审批和通知由平台契约承载，需要自定义业务执行时再启用 Nest 后端。应用无需维护工具链内部包的版本组合。

| 包 | 所有者职责 |
| --- | --- |
| openxiangda | 应用导入、统一命令、中文资料和同版本 Skill |
| openxiangda-cli | 命令解析、创建器与模板 |
| openxiangda-contracts | 协议、JSON Schema 与结构化结果 |
| openxiangda-devkit-core | 编译、上下文、检查、部署与共享执行规则 |
| openxiangda-mcp | 同一服务的结构化 AI 工具与资源 |
| openxiangda-nest | 受信业务后端与平台身份集成 |
| openxiangda-skill-kit | 单一 Skill 的校验、安装与资料刷新 |

## 维护者开发

使用 Node.js 24 和 pnpm 10.15.1。开发规则见 [AGENTS.md](AGENTS.md)，主线与发布边界见[仓库与发布](docs/architecture/repository-and-release.md)。

```bash
pnpm install
pnpm build
pnpm docs:generate:from-build
pnpm skills:manifest
pnpm verify:affected
```

仓库内调试 CLI 使用 `pnpm cli:local <command>`，避免全局命令混入。中文专题是文档正文来源，CLI/MCP 从注册表生成参考，Skill 引用由相同专题生成；不要手改生成副本。`pnpm verify:local` 执行不发布的完整验证，包含实际 tarball、新建应用、浏览器、参考应用、Skill 和文档。

## 工具链发包

发包由可信本地发布机执行，GitHub Actions 负责源码验证；保留的 GitLab/镜像 CI 也不具有发包职责。修改可发布内容时提交 Changeset，并评审 `docs/releases/<产品版本>.json` 中的更新说明。审核后在干净、最新的 master 执行 `pnpm release:version`，物化版本、随包说明和公开版本目录。该命令不提交、不发包。审核版本差异并提交推送后，先准备独立参考应用：

```bash
pnpm build
pnpm reference:install:from-build
```

该入口通过临时 registry 安装候选包、更新参考应用依赖和锁文件，并验证应用。评审参考仓库中的差异，提交并推送其 master；参考版本必须与候选一致，之后才能执行正式发布计划：

```bash
pnpm release:plan
pnpm verify:release
pnpm release:publish
```

发布计划根据实际制品差异选择门禁；未知变更执行完整验证。verify:release 冻结候选 tarball 和 GitHub Release 正文，记录绑定主线提交、版本、制品摘要和验证方式的回执。release:publish 只接受匹配回执，复查不可变前提后写 registry，随后核对 dist-tag、Git tag 和 GitHub Release。GitHub 同步失败时继续原回执，不重复发布 npm 包；已存在但内容不一致的 Release 会停止，不自动覆盖。

成功发布后，原始回执、制品清单和校验摘要保存在 Git 公共目录的 `openxiangda-release-history/<源码提交>/`，命令会输出实际路径。归档失败时保留活动回执和制品，可继续原发布；归档完成后才清理临时 tarball。该目录不会随 Git push 自动传给其他克隆，正式发布执行环境应将它作为发布证据备份；Git 托管 CI 仍只验证源码，不增加 npm 发布职责。

完整审计使用成对的 `verify:release:full` / `release:publish:full`。发布后的独立参考仓库依赖更新通过 `release:sync-reference` 完成。npm 发布、平台组合 gitlink、平台部署和真实业务验收分别记录；不要把其中一项成功当作全部完成。
