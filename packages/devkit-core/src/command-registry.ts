export type DevkitCommandRisk = "read" | "write-local" | "deploy";

export interface DevkitCommandDefinition {
  id: string;
  operation: string;
  summary: string;
  risk: DevkitCommandRisk;
  studioJsonEvents?: true;
}

export const DEVKIT_COMMANDS = [
  { id: "auth", operation: "auth.status", summary: "只读核验指定平台授权，不登录或刷新会话", risk: "read" },
  { id: "context", operation: "workspace.context", summary: "只读查看工作区、版本与平台绑定", risk: "read" },
  { id: "docs", operation: "docs", summary: "按主题和章节读取当前版本中文资料", risk: "read" },
  { id: "admin", operation: "admin", summary: "只读查看应用管理能力和流程节点运行配置", risk: "read" },
  { id: "create", operation: "create", summary: "创建、绑定并初始化应用", risk: "deploy", studioJsonEvents: true },
  { id: 'source', operation: 'source', summary: '配置应用源码仓库、查看状态或提交推送', risk: 'deploy' },
  { id: "dev", operation: "dev", summary: "连接平台测试数据启动本地 Web，按需启动 Nest", risk: "write-local", studioJsonEvents: true },
  { id: "check", operation: "check", summary: "生成契约并在目标平台预检后执行检查、测试和构建", risk: "write-local", studioJsonEvents: true },
  { id: "accept", operation: "accept", summary: "按计划准备可选的真实预发验收身份", risk: "deploy" },
  { id: "deploy", operation: "deploy", summary: "部署测试环境或显式复用测试版本部署生产", risk: "deploy", studioJsonEvents: true },
  { id: "status", operation: "status", summary: "查询最近或指定部署状态", risk: "read" },
  { id: "logs", operation: "logs", summary: "查询最近或指定部署日志", risk: "read", studioJsonEvents: true },
  { id: "cancel", operation: "cancel", summary: "幂等取消尚未提交激活的部署", risk: "deploy" },
  { id: "retry", operation: "retry", summary: "显式重试可恢复的失败部署", risk: "deploy" },
  { id: "start", operation: "environment.start", summary: "从当前不可变版本启动应用环境", risk: "deploy" },
  { id: "stop", operation: "environment.stop", summary: "将应用环境缩容为零并保留数据", risk: "deploy" },
  { id: "rollback", operation: "rollback", summary: "回滚测试或生产环境", risk: "deploy", studioJsonEvents: true },
  { id: "login", operation: "login", summary: "通过平台浏览器授权登录", risk: "write-local" },
  { id: "skill", operation: "skill install", summary: "安装当前版本的 AI Skill", risk: "write-local" },
  { id: "spec", operation: "spec", summary: "维护需求、设计、变更与业务验收记录", risk: "write-local" },
] as const satisfies readonly DevkitCommandDefinition[];

export function commandDefinition(id: string) {
  return DEVKIT_COMMANDS.find(command => command.id === id);
}

export function renderDevkitCommandReference(
  options: {
    title?: string;
    executable?: string;
  } = {}
) {
  const title = options.title || "CLI 命令参考";
  const executable = options.executable || "pnpm openxiangda";
  const rows = DEVKIT_COMMANDS.map(
    command =>
      `| \`${executable} ${command.id.replaceAll(":", " ")}\` | ${{read:'只读', 'write-local':'本地写入', deploy:'远端变更'}[command.risk]} | ${command.summary} |`
  ).join("\n");
  return `# ${title}\n\n> 从实际命令注册表生成。参数与示例使用 \`pnpm openxiangda <命令> --help\` 查看；修改注册表后重新生成本页。\n\n| 命令 | 影响 | 用途 |\n| --- | --- | --- |\n${rows}\n\n只验证时运行 check；部署测试环境时直接运行 deploy，它已包含检查、测试和构建。生产使用 deploy --environment production --from <测试运行ID>；加 --dry-run 只读预览。登录、创建和长期 dev 进程由 CLI 管理。\n`;
}
