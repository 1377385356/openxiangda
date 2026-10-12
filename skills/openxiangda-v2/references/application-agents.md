# 应用内置助手

应用助手的定义属于应用源码，随 AppVersion 激活和回滚；模型连接、配额和运行开关由平台维护。它不是租户平台助手，也不替代应用自己的后台。布局和卡片使用应用源码，登录、权限与命令仍由平台拥有。

本专题对应新增的 `openxiangda/agent` 源码能力。使用前核对实际安装版本的公开导出和平台配对能力；本轮开发没有执行 npm 发布。可复制助手模板、`agent eval`、真实模型与真实角色的访客验收尚未闭合，不能据此声明应用助手已经交付。

## 接入

在现有应用路由与 RuntimeBoundary 内使用 hooks，不新增 router、登录存储、平台代理或业务数据库：

```tsx
import { useAgents, useAgentConversation } from 'openxiangda/agent';

export function ApplicationAssistant() {
  const catalog = useAgents();
  const assistant = useAgentConversation('assistant');
  const busy = Boolean(assistant.pending || assistant.snapshot?.conversation.activeRunId);
  // 使用 catalog.agents 中该助手的 name/purpose/starters/available/reason。
  // 展示 assistant.snapshot.messages，content 是完整文本，不是 token delta。
  // 用户主动点击才调用 newConversation/send；挂载和 reload 只读恢复。
  return <div>
    {catalog.error && <p role="alert">暂时无法获取助手</p>}
    {assistant.pending?.state === 'unknown' && <p role="alert">原请求结果尚不确定，请先核对，不要重复提交。</p>}
    <button disabled={busy} onClick={() => void assistant.send('今天有哪些来访').catch(() => {})}>查询今日来访</button>
    <button onClick={() => void assistant.recover().catch(() => {})}>核对原请求</button>
  </div>;
}
```

助手声明及任务编译规则见源码架构记录和配置类型 `defineApplicationAgent`。客户端不接受 appCode、environmentKey、actor、provider、baseUrl 或 API key；它使用当前已登录用户和角色并集，绑定 RuntimeBoundary 的身份及环境。退出或身份变化时销毁旧请求、流和可见快照。

不使用 React hooks 的现有应用组件可调用 `createApplicationAgentClient()`，随后 `client.agents()`、`client.conversations(agentCode)`、`client.conversation(agentCode)`。观察器 `subscribe/snapshot` 可供自定义组件使用；离开时 `client.dispose()`。不能在匿名页面或未建立 RuntimeBoundary 身份时创建客户端。

## 写入与卡片

用户主动操作时客户端生成 UUID，填写/确认携带原卡片 revision。同一观察器只允许一项待处理写入。以下调用不绕过服务端的能力、记录修订与当前角色检查：

```ts
await assistant.submitInteraction(card.id, card.revision, {
  visitorName: '张伟',
  count: 2,
  needsParking: false,
  company: null, // 显式清空；未触及字段直接省略。
});
await assistant.confirm(confirmation.id, confirmation.revision);
await assistant.cancelInteraction(card.id);
await assistant.cancel(run.id);
await assistant.reconcile(tool.id); // 只读核对业务执行所有者的原回执。
// 仅供平台允许的人工核实人员；服务器仍验证权限并保留人工来源：
await assistant.resolveManually(tool.id, 'not_executed', '已核对业务系统，没有对应记录');
```

卡片编辑和候选查询必须复用公开 Field Kit 与字段自己的 lookup。headless 客户端不把 reference/user/date/number 转成字符串，不合并旧 partialInput，不定义第二套候选权威。确认是独立明确按钮，不应绑定到自动回复或隐藏脚本。

## 结果不确定与只读恢复

- 断网、408、5xx 或丢失响应后保留 `pending.state = unknown`，不自动重放，也不静默生成新键。
- `recover()` 查询原创建 requestId 或当前会话快照。没有找到原结果不等于未执行，继续阻止新写。
- 快照/事件读回同一请求关联后，`lastResolution.disposition = acknowledged` 仅表示平台已处理这项请求，不代表业务成功。业务执行成功仍要看业务工具回执，并实际读回记录。
- 另一请求推进卡片状态/修订时，旧意图只能标记 `closed`，不能宣称本次提交成功。
- `still_unknown` 不是失败、更不是成功。应用只提供核对和已有权限下的人工核实入口，不自动执行原业务写入。
- sessionStorage 只保存当前身份、应用、环境作用域的会话指针和原请求/卡片 ID，不保存文本、字段值、凭据或模型连接。存储不可用时 `persistence = memory`；刷新后应从历史和平台回执核对，不能假装仍有完整恢复证据。

## 流和页面生命周期

应用只收到 `conversation/run/message/tool/interaction.updated` 五类中性更新。消息按 ID 替换完整文本；不解析平台引擎通知。游标使用安全整数 durable seq，重复帧去重，缺失序列先重新读取一致快照。

断线后初次连接之外最多三次只读续接，失败后显示 `stream = disconnected`，由用户刷新观察器。idle/heartbeat 只是传输控制帧，不是业务成功。frame 与剩余 buffer 各限制 2 MiB。卸载、退出、身份变化会中止 fetch 和 reader，不增加平台流额度。

## 验收不能混用

SDK 单测、类型与 affected gates 证明客户端契约，不证明可用的业务应用。交付仍需已激活的测试 AppVersion、已启用 worker 和真实模型连接、真实角色拒绝、PC/移动浏览器、断线恢复及实际业务记录读回。Connected dev 使用已激活测试版本的助手；未激活的本地 overlay 不属于 worker 定义。
