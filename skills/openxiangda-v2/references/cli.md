# CLI 命令参考

> 从实际命令注册表生成。参数与示例使用 `pnpm openxiangda <命令> --help` 查看；修改注册表后重新生成本页。

| 命令 | 影响 | 用途 |
| --- | --- | --- |
| `pnpm openxiangda auth` | 只读 | 只读核验指定平台授权，不登录或刷新会话 |
| `pnpm openxiangda context` | 只读 | 只读查看工作区、版本与平台绑定 |
| `pnpm openxiangda docs` | 只读 | 按主题和章节读取当前版本中文资料 |
| `pnpm openxiangda design` | 远端变更 | 打开 OpenDesign 原版并透传完整原生 CLI；写入范围由原生命令决定 |
| `pnpm openxiangda admin` | 只读 | 只读查看应用管理能力和流程节点运行配置 |
| `pnpm openxiangda create` | 远端变更 | 创建、绑定并初始化应用 |
| `pnpm openxiangda source` | 远端变更 | 配置应用源码仓库、查看状态或提交推送 |
| `pnpm openxiangda dev` | 本地写入 | 连接平台测试数据启动本地 Web，按需启动 Nest |
| `pnpm openxiangda check` | 本地写入 | 生成契约并在目标平台预检后执行检查、测试和构建 |
| `pnpm openxiangda accept` | 远端变更 | 按计划准备可选的真实预发验收身份 |
| `pnpm openxiangda deploy` | 远端变更 | 部署测试环境或显式复用测试版本部署生产 |
| `pnpm openxiangda status` | 只读 | 查询最近或指定部署状态 |
| `pnpm openxiangda logs` | 只读 | 查询最近或指定部署日志 |
| `pnpm openxiangda cancel` | 远端变更 | 幂等取消尚未提交激活的部署 |
| `pnpm openxiangda retry` | 远端变更 | 显式重试可恢复的失败部署 |
| `pnpm openxiangda start` | 远端变更 | 从当前不可变版本启动应用环境 |
| `pnpm openxiangda stop` | 远端变更 | 将应用环境缩容为零并保留数据 |
| `pnpm openxiangda rollback` | 远端变更 | 回滚测试或生产环境 |
| `pnpm openxiangda login` | 本地写入 | 通过平台浏览器授权登录 |
| `pnpm openxiangda skill` | 本地写入 | 安装当前版本的 AI Skill |
| `pnpm openxiangda spec` | 本地写入 | 维护需求、设计、变更与业务验收记录 |

只验证时运行 check；部署测试环境时直接运行 deploy，它已包含检查、测试和构建。生产使用 deploy --environment production --from <测试运行ID>；加 --dry-run 只读预览。登录、创建和长期 dev 进程由 CLI 管理。
