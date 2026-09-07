# Workflow 可嵌入任务操作面板 v2

状态：accepted for implementation on 2026-08-30。

## 问题证据

OpenXiangda 2.0 的标准 `WorkflowTaskPage` 已经能读取平台
`WorkflowSurface`，并根据 `operations` 的 `inputSchema`、`uiSchema`、
`visible` 和 `enabled` 渲染动态操作。但是这套操作渲染器
`WorkflowOperations` 只存在于标准页文件内部。应用声明自定义流程详情路由后，
标准任务入口会按平台返回的 `detailNavigation.custom` 跳转到应用页；应用页只能
自己拼接 `/m/tasks/:taskId` 或复制审批按钮，因此任务进入自定义业务页后无法复用
平台操作。

发布验证进一步证明，`openxiangda` facade 的版本不能脱离 CLI 模板胶囊单独推进：
仅把 facade 从 `2.0.0-alpha.51` 提升到 `2.0.0-alpha.52`，而继续消费已发布的
`openxiangda-cli@2.0.0-alpha.136` 时，独立 reference app 会稳定返回
`OPENXIANGDA_WORKSPACE_CAPSULE_MISMATCH`。原因是 CLI 包内模板仍声明上一版 facade。
因此本能力的发布单元必须同时刷新 CLI 模板胶囊；不得关闭胶囊校验，也不得以相同
CLI 版本重发不同内容。

## 决策和能力归属

在 `openxiangda/react` 公开 `WorkflowTaskOperationsPanel`。它是一个只负责任务
操作区域的 React 组件，不拥有业务详情页、路由、待办、消息或流程引擎。

- Workflow Kernel 继续拥有任务 Surface、当前操作、命令授权、token、幂等和状态
  转移；浏览器只消费 `WorkflowSurface`，不推断审批按钮。
- `openxiangda` React runtime 负责 Surface 加载、动态参数表单、命令调用和完成后
  刷新；标准 `WorkflowTaskPage` 和应用自定义详情页共用同一内部
  `WorkflowOperations` 渲染核心。
- 应用继续拥有自定义业务详情布局和业务字段展示，只需传入平台 `taskId`，不创建
  第二套命令状态机、auth/RLS、Workflow engine、inbox 或命令存储。

最小消费方式：

```tsx
import { WorkflowTaskOperationsPanel } from 'openxiangda/react';

<WorkflowTaskOperationsPanel
  taskId={taskId}
  variant="mobile"
  onSurfaceChange={setTaskSurface}
  onCompleted={(surface) => refreshBusinessDetail(surface)}
/>
```

如果业务详情页已经读取任务 Surface，可传 `surface` 避免首屏重复读取；操作成功
后面板仍会按同一 `taskId` 重新读取最新 Surface。

## 稳定合同

```ts
interface WorkflowTaskOperationsPanelProps {
  taskId: string;
  variant?: 'desktop' | 'mobile';
  surface?: WorkflowSurface | null;
  onSurfaceChange?: (surface: WorkflowSurface) => void;
  onCompleted?: (surface: WorkflowSurface) => void | Promise<void>;
}
```

1. `taskId` 是平台任务 ID，永远不从业务记录或 URL 中的 `instanceId` 猜测。未传
   有效 ID 时面板显示稳定错误，不发起命令请求。
2. `surface` 只有在 `surface.task.id` 与规范化后的 `taskId` 完全一致时才可复用。
   首帧、`taskId` 切换和输入 Surface 变更期间，面板不会短暂展示旧任务操作；不匹配的
   输入会被忽略并按 `taskId` 调用现有 `loadWorkflowTaskSurface(taskId)`。loader 返回
   也必须再次通过同一 ID 校验，旧请求不能覆盖新任务或调用新任务的回调。
3. 操作只渲染 `visible` 操作；禁用操作保留 `disabledReason`；字段和确认 UI 完全
   来自该操作的 `inputSchema` 与 `uiSchema`。不硬编码 approve/reject/return 的
   参数或操作顺序。
4. 命令仍使用 Surface 的新鲜 `commandToken`，通过现有
   `executeWorkflowTaskCommand` 或 `executeWorkflowInstanceCommand` 路径提交，并
   使用现有的幂等 key 生成方式。标准面板只执行 `kind === 'workflow_command'`；
   `kind === 'app_action'` 明确显示为禁用并给出“应用动作由应用页面负责”，不会被
   误送入 Workflow command API。业务应用动作的 owner 是应用自身的业务详情能力，
   本切片不扩展通用 app-action 协议。面板不改变协议、不缓存 token、不接受浏览器
   传入的身份或角色。
5. 命令成功与刷新是两个不同的生命周期：token 缺失/过期或平台返回 `freshSurface`
   时只执行刷新，不触发 `onCompleted`；真正的命令成功必须先重新读取并通过任务 ID
   校验，随后最多调用一次 `onCompleted`。刷新开始会清空旧 Surface 和旧操作，失败时
   只展示错误及“重试”，旧 token 操作不可继续点击。
6. `variant` 只改变操作条和参数抽屉/弹窗的呈现方式，不改变平台 Surface、命令
   目标、参数 schema 或刷新行为。

## 失败、并发和资源边界

- Surface 加载失败只影响操作面板，清除旧操作并保留稳定错误和“重试”入口；平台
  错误通过现有 message/error 通道反馈。
- token 缺失或过期不会提交；先刷新 Surface 并把过期错误交给现有错误处理。平台返回
  `freshSurface` 时沿用原有刷新路径，应用不绕过 stale 版本检查；这些刷新路径都不
  触发公共 `onCompleted`。
- 同一面板最多维护一个逻辑任务 Surface；请求序号加当前任务 generation 使任务切换
  或卸载后的旧响应失效。异步命令完成、刷新请求和 `onSurfaceChange`/`onCompleted`
  回调前后都检查当前任务，旧任务不能重新加载、淘汰新任务请求或把旧 Surface 交给
  新任务回调。
- Surface revision 或操作 schema 变化会使已选操作失效；提交只使用当前 Surface
  的操作和 token。提交中禁用操作入口，避免重复执行已完成命令。
- Surface 的操作数量、字段 schema 和文本长度由平台合同限制；组件不做无界批量
  查询，不加载时间线、业务全表、待办或通知列表。
- 重复点击仍由现有命令 API 的幂等 key/idempotency receipt 处理；组件不增加本地
  锁表或第二个幂等状态源。

## 受影响合同和回滚

受影响范围为 `openxiangda` React runtime 的公开 export、标准 Workflow 任务页的
渲染接线、组件测试、文档，以及 `openxiangda-cli` 所拥有的应用模板版本胶囊。
facade 和 CLI 必须作为同一候选集版本化，使新 CLI 模板声明最终 facade 版本；这是
发布合同，不增加 CLI 运行时分支。无需 server、contracts、数据库、应用配置或 1.x
代码变更。

回滚边界是恢复上一组匹配的 `openxiangda` 与 `openxiangda-cli` 版本：标准页继续使用
既有私有渲染器；应用自定义页删除对该 export 的引用即可。没有数据迁移、流程实例
变更或部署状态修复。稳定 OpenXiangda 1.x 不读取该 2.0 React export 或模板胶囊，
blast radius 为零。

## 可证伪验收

1. 包入口导出 `WorkflowTaskOperationsPanel` 和 `WorkflowPageVariant`，类型声明可被
   React 应用直接导入。
2. 传入一个带可见/隐藏/禁用操作的 Surface 时，组件只展示可见操作，且保留禁用
   原因；动态 schema/UI schema 仍驱动选择框、文本域、用户选择和确认弹窗。
3. 不传 Surface 时，组件通过现有 task Surface loader 获取指定 `taskId`；传入任务 ID
   不匹配的 Surface 不得出现在首帧或操作区域，loader 返回不匹配也必须失败并提供
   重试；点击操作后重新加载同一个 task Surface，并触发 `onSurfaceChange`，命令成功
   且刷新成功后才触发一次 `onCompleted`。
4. 标准 `WorkflowTaskPage` 使用同一 `WorkflowTaskOperationsPanel`，自定义页面使用
   同一组件后，approve/reject/return/transfer 等平台返回操作的 UI 和命令请求形状
   相同；app_action 不得调用 workflow command；实例页的 withdraw/terminate 行为
   保持不变。
5. 生命周期测试覆盖首帧 mismatch 不渲染旧操作、任务切换的 generation/请求守卫、
   刷新与命令完成回调语义拆分、旧 schema/token 失效、app_action disabled 和刷新
   重试；组件和标准页 focused tests、`pnpm --filter openxiangda check`、
   `pnpm --filter openxiangda test`、`pnpm verify:affected` 通过；无 server、1.x 或
   数据库 diff。
6. release candidate 必须同时包含最终 facade 与 CLI 模板胶囊版本；独立 reference
   app 从候选 tarball 重建锁文件后，`openxiangda check` 不出现 workspace capsule
   mismatch，并完成 check/test/build/E2E。未变化包必须继续使用公开 registry 的原
   integrity，禁止用同版本临时重打包结果污染消费者锁文件。
