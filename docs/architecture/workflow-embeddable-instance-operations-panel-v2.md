# Workflow 可嵌入实例操作面板 v2

状态：accepted for implementation on 2026-08-30。

## 问题证据

OpenXiangda 2.0 标准 `WorkflowInstancePage` 已经读取平台
`WorkflowSurface`，并在没有当前任务时通过内部 `WorkflowOperations` 渲染发起人
撤回、管理员终止等实例级操作。应用声明自定义流程详情路由后，标准实例入口会跳转
到应用拥有的业务详情页；现有公共 `WorkflowTaskOperationsPanel` 只接受 `taskId`。

数字工会的真实接入证明，待办或标准任务入口能够把 `taskId` 放入自定义详情 query，
审批人可以消费任务面板；但从业务记录、我的申请或标准实例入口进入时只有
`instanceId`。如果应用删除自己复制的撤回/终止按钮，又只在 query 存在 `taskId`
时渲染任务面板，平台已经授权的实例操作会静默消失。恢复应用私有按钮会重新制造
第二套 token、幂等、错误和状态刷新逻辑，因此不是可接受修复。

## 决策和能力归属

在 `openxiangda/react` 公开 `WorkflowInstanceOperationsPanel`。它与
`WorkflowTaskOperationsPanel` 共用一个内部 Surface 生命周期和既有
`WorkflowOperations` 渲染核心。

- Workflow Kernel 继续拥有实例 Surface、操作可见性、命令 token、幂等和状态
  转移。组件不推断谁可以撤回或终止，也不增加新的权限查询。
- React runtime 只负责按 `instanceId` 加载现有 instance Surface、校验返回实例、
  渲染平台返回操作、提交命令并刷新同一 Surface。
- 应用继续拥有业务详情布局。存在任务上下文时消费任务面板；只有实例上下文时消费
  实例面板。应用不复制 `withdraw`、`terminate` 或其它流程命令。
- 本轮不改变自定义详情路由、待办、通知、业务投影、Workflow server API 或数据库。

最小消费方式：

```tsx
import {
  WorkflowInstanceOperationsPanel,
  WorkflowTaskOperationsPanel,
} from 'openxiangda/react';

{taskId ? (
  <WorkflowTaskOperationsPanel taskId={taskId} variant={variant} />
) : (
  <WorkflowInstanceOperationsPanel
    instanceId={instanceId}
    variant={variant}
    onCompleted={() => refreshBusinessDetail()}
  />
)}
```

## 稳定合同

```ts
interface WorkflowInstanceOperationsPanelProps {
  instanceId: string;
  variant?: 'desktop' | 'mobile';
  surface?: WorkflowSurface | null;
  onSurfaceChange?: (surface: WorkflowSurface) => void;
  onCompleted?: (surface: WorkflowSurface) => void | Promise<void>;
}
```

1. `instanceId` 必须由平台流程实例或声明路由提供，组件不会从业务记录字段、任务 ID
   或当前 URL 猜测。
2. 传入 Surface 和 loader 返回值都必须满足 `surface.instance.id === instanceId`；
   不匹配 Surface 不得在首帧短暂显示，也不能触发命令或回调。
3. 操作完全来自平台 Surface 的 `visible`、`enabled`、`inputSchema`、`uiSchema` 和
   `placement`。组件不硬编码撤回/终止可见条件。命令仍由既有
   `WorkflowOperations` 选择 task 或 instance API，实例级 `withdraw`/`terminate`
   继续走 `executeWorkflowInstanceCommand`。
4. `kind === 'app_action'` 继续显示为应用拥有且不可由标准面板执行；本轮不扩展
   app-action 协议。
5. token 缺失、过期或平台返回 fresh Surface 时先刷新，不触发完成回调。真正命令
   成功后必须重新加载并校验同一实例 Surface，之后最多调用一次 `onCompleted`。
6. `variant` 只决定桌面弹窗或移动抽屉，不改变命令、参数或权限语义。

任务面板现有公开合同保持可用；内部可以重构为 task/instance 两种 mode，但两个公开
wrapper 必须保留各自明确 ID，避免应用传入含糊的联合参数。

## 失败、并发和资源边界

- 空 ID 显示稳定错误和重试入口，不发请求；403、404 和平台业务错误只影响面板。
- task/instance ID 或真正不同的输入 Surface 会递增 generation；effect 清理或卸载会停用
  当前生命周期并递增请求序列。父页面原样回写面板刚发出的 fresh Surface、React
  StrictMode effect 重放不会误伤同一代成功回调；旧请求、旧命令完成和旧回调仍不能
  覆盖新实例状态。
- 刷新开始即清除旧 Surface 与旧 token；刷新失败时不保留可点击的旧操作。
- 一个面板只读取一个 Surface，不加载时间线、业务全表、待办或消息，不引入轮询。
- 内部企业场景不增加设备校验、额外角色校验或第二次授权；浏览器只消费平台已经
  计算好的 Surface。ID/Suface 一致性校验是防止错页操作的生命周期正确性要求，
  不是新的安全系统。

## 受影响合同、发布和回滚

受影响范围仅为 `openxiangda` React export、标准实例页接线、focused tests、文档，
以及 facade 版本变化必需同步的 `openxiangda-cli` 模板胶囊。无需修改 server、
contracts、SQL migration、应用声明或 OpenXiangda 1.x。

发布必须把最终 `openxiangda` 与刷新后的 `openxiangda-cli` 放入同一候选集，避免再次
出现 facade 与 CLI 模板版本不一致的 workspace capsule mismatch。回滚只需恢复上一组
匹配的 facade/CLI 版本，并让应用恢复到只消费 task panel；无数据和流程实例回滚。

## 可证伪验收

1. `openxiangda/react` 导出 `WorkflowInstanceOperationsPanel` 及 props type。
2. 注入匹配实例 Surface 时只展示平台可见操作；注入另一个实例 Surface 时首帧不得
   展示旧操作，并按目标 `instanceId` 加载。
3. 缺少 task query 的自定义业务详情可以通过实例面板展示平台 Surface 返回的撤回或
   终止；应用源码不重新出现 `executeWorkflowInstanceCommand`、本地 token、幂等键或
   操作筛选。
4. 标准实例页与嵌入实例面板使用同一个公共 wrapper；标准任务页继续使用任务面板，
   两者最终共用 `WorkflowOperations`。
5. focused tests 覆盖 export、匹配/不匹配 Surface、空 ID、桌面/移动展示、实例命令
   请求和刷新回调；`pnpm --filter openxiangda check`、
   `pnpm --filter openxiangda test`、`pnpm verify:affected` 通过。
6. facade 与 CLI 成对候选通过独立 reference app capsule/check/test/build/E2E；发布后
   registry readback 精确匹配版本和完整性。
