# OpenXiangda 2.0 应用

本项目使用精确版本的 openxiangda 根包。默认包含 Web 和共享契约，普通 CRUD、标准审批与通知由平台执行；真实业务动作才按需启用 Nest。

## 开始

```bash
pnpm install --frozen-lockfile
pnpm openxiangda context --json
pnpm openxiangda dev
```

依赖已安装时无需重复安装。开发连接已绑定的远端测试数据，终端和页面显示实际环境。缺少账号或绑定时按命令错误提示处理；不要调用旧版全局 CLI。

## 阅读资料

```bash
pnpm openxiangda docs
pnpm openxiangda docs development
pnpm openxiangda docs application-foundation
pnpm openxiangda docs frontend
pnpm openxiangda docs data-authz
```

资料来自当前根包；长主题支持 --section <章节ID>。AGENTS.md 的平台段说明基本约定，项目自有内容保留在该段之外。AI Skill 按任务读取同源资料。

## 声明与页面

业务模型和页面选择保存在 modules，应用根配置负责装配。模型不隐含导航或写授权。字段与标准 CRUD 使用平台组件；PC 控件使用 antd，移动使用 openxiangda/mobile。应用负责最小文档重置和局部样式，不直接导入 antd-mobile 全局重置。

apps/server 仅在启用后端时初始化。后续 check/dev 保留业务源码，普通 CRUD 不增加 controller。

## 检查与发布

只检查时运行 `pnpm openxiangda check`；需要发布测试环境时直接运行 `pnpm openxiangda deploy`，它已包含检查、测试和构建。纯前端无需 Docker，启用后端时才构建官方 Dockerfile 镜像。

运行 status/logs 确认平台结果并完成真实角色验收。生产使用 `pnpm openxiangda deploy --environment production --from <成功测试运行ID>`；`--dry-run` 只预览。完整发布、取消、恢复和回滚说明使用 `pnpm openxiangda docs delivery`。

## MCP

```bash
pnpm exec openxiangda --mcp-stdio --cwd <项目绝对路径>
```

先读 workspace_context，再按需读取 docs_read 和 contract_describe；升级包后重启连接。登录、创建与长期开发进程继续使用 CLI。
