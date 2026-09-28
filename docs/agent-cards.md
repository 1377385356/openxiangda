# 应用 Agent 自定义卡片

应用先定义完整业务 operation、当前用户权限、只读参数查询和结果字段，再按需为 `ai.agent.inputCard` 或 `resultCard` 加 `resource`。例如两种卡片都使用同一个脚本：

```ts
inputCard: { title: '补全报修', resource: 'agent-cards/repair.js', fields: [
  { path: 'locationId', label: '报修地点', control: 'select' },
  { path: 'description', label: '故障描述', control: 'textarea' },
] },
resultCard: { title: '报修已提交', resource: 'agent-cards/repair.js', fields: [
  { path: 'ticketNo', label: '单号' }, { path: 'locationName', label: '地点' },
] },
```

`resource` 只能是 `agent-cards/*.js` 的相对路径，不能写外部 URL、整站入口或自由 HTML。应用前端构建必须将相同路径放入 `dist/`，`openxiangda deploy` 会核验它确实进入发布包。资源随前端制品摘要与环境 Head 固定，发布/回滚时和业务声明一起切换。标准卡片声明仍是必需的可靠回退路径。

卡片脚本用 `openxiangda/agent-card` 的 `connectAgentCard` SDK 与平台通信：

```tsx
import { connectAgentCard, type AgentCardState } from 'openxiangda/agent-card';

const bridge = connectAgentCard((state: AgentCardState) => {
  if (state.mode === 'result') {
    // 只读展示 state.resultFields。不能调用 submit。
    return;
  }
  // 显示 state.fields、state.partialInput；select 预填仅是搜索线索。
});

const found = await bridge.options('locationId', '教学楼');
// 展示 found.items[].label；用户明确选择后提交对应 value。
await bridge.submit({ locationId: found.items[0].value, description: '空调不制冷' });
// 卸载时 bridge.disconnect()。
```

例如使用 Vite 的独立 lib 配置打包成单文件 IIFE，不复用应用 Shell：

```ts
// apps/web/vite.agent-card.config.ts
import { defineConfig } from 'vite';
export default defineConfig({
  // lib 模式打包 React/Ant Design 时，确保浏览器沙箱内不残留 Node 的 process。
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: 'dist', emptyOutDir: false, cssCodeSplit: false,
    lib: { entry: 'src/agent-card.tsx', name: 'OpenXiangdaRepairCard', formats: ['iife'], fileName: () => 'agent-cards/repair.js' },
  },
});
```

在普通前端构建之后运行 `vite build --config vite.agent-card.config.ts`。产物须小于 2 MiB；构建通过后还须在 `sandbox="allow-scripts"`、无同源权限和 Host CSP 的 iframe 中运行一次真实浏览器测试，确认没有 `process is not defined` 等异常，且能完成 `ready/state/options/submit` 消息往返。卡片样式可由脚本注入在自己的 iframe 内，不应依赖应用全局 CSS、路由、Cookie、登录或平台页面的 DOM。Host 使用无同源权限的 sandbox 和 CSP，只开放 `options` 与 `submit`；SDK 的请求先由 Host 检查卡片实例、声明字段、候选值，再由 Agent 服务端重验用户、应用权限、AppVersion、请求 Schema、Interaction revision 和幂等键。业务 handler 必须再次校验地点等稳定引用。结果卡只收到声明字段的只读投影。

卡片在 8 秒内无法握手、资源缺失或版本变化时，平台显示标准卡片。卡片消息不会修改 Codex 原生 SSE 文本流。这个桥采用与 MCP Apps 相同的资源/宿主调用思路，但首版不是官方 MCP Apps 线级协议；不要在应用里自行实现新工具网关或把 UI 脚本注入平台主页面。

预发验收至少包括：模糊地点出现两个中文候选、明确选中后提交、刷新恢复、双击/双标签只写一次、只读/非成员拒绝、资源缺失降级、结果卡与业务单号回读。普通问答成功或本地构建通过不能替代这些证据。
