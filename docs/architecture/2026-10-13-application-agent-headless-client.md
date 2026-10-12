# 应用内助手 headless SDK（Unit 4B）

状态：本轮实施决定；SDK runtime 正在实现。继承 Claude Unit 4 与后端 `2026-10-13-application-agent-facade.md`；可复制 UI 和真实平台验收另记，不能以 SDK 测试宣布产品能力。

## 问题、所有者、不变量

模板没有公开的应用内助手 client/hooks，只能调用租户中心或接触引擎协议。新增 `openxiangda/agent`，只消费 application-scoped facade。平台 transport、RuntimeBoundary、身份/角色、source definitions、交互 revision、业务 command 和 reconciliation 仍由原所有者承担。

SDK 不接受 appCode、environmentKey、actor、provider 参数；生产/测试选择来自当前 runtime identity。Hook 生命周期绑定 identityScope/identityEpoch；切换或退出时销毁请求和流，不显示旧用户结果。使用同一平台 cookie、登录刷新和失效通知，不新增凭据或登录存储。

## 接口与状态

- `createApplicationAgentClient`、`useAgents`、`useAgentConversation(agentCode)`。
- 用户控制的新会话、恢复会话、send、cancel、typed submit、confirm、cancelInteraction、reconcile、resolveManually。
- 事件只有五类 neutral updated；无引擎事件、native items、meta-tools。SDK 不拥有卡片组件或业务规则。
- 读取恢复自动请求可以重试；写入不自动重放。双点击期间单一 mutation gate。SDK 内部生成 UUID 并在未确定结果时保留原请求意图，拒绝静默换键。
- HTTP 5xx/408/断网后的 mutation 为未知；先查 snapshot，按原 send requestId 或卡片权威状态核对，不推断成功，不自动执行业务操作。
- sessionStorage 只存当前用户/应用/环境 scoped 会话指针和不含文本/字段值的待核对 ID；不保存 cookie、模型连接、卡片输入或身份令牌。没有 sessionStorage 仍能内存运行。

## 并发、安全与资源

fetch SSE 从最后 durable seq 续读，重复 frame 去重；完整 message.updated 按 ID 替换而非拼接。连接失败最多三次只读续接，之后让用户刷新；idle 控制帧不是业务成功。流取消、组件卸载、身份变更都 abort。

SSE frame/buffer 有大小上限；只接受公开事件名和安全整数 seq。用户文本/卡片值保持普通 typed value，包括未触及、设置和 null 清空；无 Field Kit 的第二套解析器。卡片/工具未知结果阻止 UI 自动“重新提交”。

## 回滚、影响与验证

新增入口可独立撤回；未启用助手的 V1/V2 应用不变。包装后的 transport 只能请求固定应用 facade，不能用后缀覆盖 app/environment 或跳转其他站点。公开包变更添加 Changeset；本轮不做 npm 发布或平台部署。

可证伪测试：scoped transport；5类事件/拆分UTF8/续接/重复/超大frame；并发双击；send/submit 丢响应保持未知且不重放；snapshot 原 requestId 恢复；输入包含 null/typed reference 不被改写；身份切换/卸载中止；公开导出与 type checks；WSL verify:affected。之后另验收访客复制 UI、connected dev、真实模型、角色拒绝及业务读回。

## 接入细化

当前交互投影补充持久 requestId（backend 6db547d8），用于精确只读核对。若同一原请求被平台处理，显示 acknowledged；不能等同业务成功。另一请求推进卡片状态/修订，只显示旧意图 closed，不归因于当前请求。原键无匹配且卡片仍有效，保留 unknown，阻止新写，不自动重放或换键。人工核实结果只记录运营人员确认，不伪造平台事实。

sessionStorage 失败时以 memory 标注；无法保证页面刷新后恢复内存意图，此时从历史和平台回执核实。流上限每 frame/剩余 buffer 为 2 MiB，缺失 durable seq 先重取快照，初次连接外最多三次只读续接。React effect 持有可释放资源，避免 StrictMode/身份切换显示旧结果。
