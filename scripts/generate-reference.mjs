import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderDevkitCommandReference } from '../packages/devkit-core/dist/command-registry.js';
import { MCP_RESOURCE_URIS, mcpToolReference } from '../packages/mcp/dist/index.js';

const outputDirectory = resolve(import.meta.dirname, '../docs/reference');
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'cli.md'), renderDevkitCommandReference(), 'utf8');
const tools = mcpToolReference().map(tool => `## ${tool.name}\n\n${tool.title}。${tool.description}\n\n- 只读：${tool.annotations.readOnlyHint ? '是' : '否'}\n- 可替换文件或改变远端状态：${tool.annotations.destructiveHint ? '是' : '否'}\n- 幂等：${tool.annotations.idempotentHint ? '是' : '否'}\n\n输入参数：\n\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n`).join('\n');
await writeFile(resolve(outputDirectory, 'mcp.md'), `# MCP 配置与工具参考\n\n> 工具说明和输入参数从当前 MCP 注册表生成。\n\n## 连接项目\n\nMCP 使用项目锁定的根包；在客户端配置下列 stdio 启动参数，把路径换成真实工作区的绝对路径：\n\n\`\`\`json\n{\n  "command": "pnpm",\n  "args": ["--dir", "/绝对路径/应用", "exec", "openxiangda", "--mcp-stdio", "--cwd", "/绝对路径/应用"]\n}\n\`\`\`\n\n客户端负责启动进程。登录、创建应用和长期运行的 dev 服务使用 [CLI](./cli.md)。依赖升级后重启 MCP 进程。首先读取 workspace_context，再按任务读取 docs_read 和相关契约。MCP 不自动部署；在用户已授权范围内执行修改，无需重复确认。\n\n## 读取资源\n\n${MCP_RESOURCE_URIS.map(uri => `- \`${uri}\``).join('\n')}\n\n资料目录返回当前版本、摘要、主题 URI 和章节 ID；读取 \`openxiangda://docs/{topic}\` 得到中文 Markdown 正文。只需一个章节时使用 docs_read 的 section。资料只来自同版本根包的固定目录，不接受任意文件路径或网络 URL。\n\n## 结果与失败处理\n\n工具返回相同内容的 structuredContent 与文本结果，包含 ok、operation、data 和适用的 diagnostics/nextActions。业务失败设置 isError=true；按错误码、定位和平台 recovery 决定下一步。工具协议错误同样停止当前操作。check_app 会生成文件并运行检查、测试、构建；失败后未执行的阶段标记 skipped。deploy_app 已包含完整检查，生产晋级必须传入成功的测试 DeploymentRun ID，不重新构建。详见 [校验](../testing.md)与[部署](../delivery.md)。\n\n${tools}`, 'utf8');
await import('./sync-developer-guidance.mjs');
