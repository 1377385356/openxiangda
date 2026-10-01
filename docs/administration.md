# 应用管理与有效配置

平台的应用管理控制台维护应用成员、角色授权和流程运行参数。应用自身声明的 `/admin` 业务菜单展示业务页面，两者职责不同。可见入口和可执行操作以当前用户与目标环境返回结果为准。

## 发现当前入口 {#context}

```bash
pnpm openxiangda admin context --environment test --json
```

MCP 对应 `administration_context`。先检查返回的管理能力与入口，再进入平台标准管理页面。普通开发者不因拥有源码就自动获得成员管理或流程配置权限；拒绝时联系有权管理员，不伪造用户、租户或权限头。

## 查看流程节点配置 {#workflow}

```bash
pnpm openxiangda admin workflow <workflowCode> --environment test --json
```

MCP 对应 `workflow_node_configurations`。workflowCode 来自当前应用声明。管理员运行配置可能已经覆盖开发默认值；不要只看本地文件推断线上处理人。已创建任务保留其冻结配置，后续节点进入采用适用的新运行配置，具体版本以接口返回为准。

生产读取必须显式指定 production。两个命令均为只读发现，成员/角色和流程参数修改通过已授权的标准管理入口执行。

## 业务页面中的角色管理 {#role-management}

确有业务需要时，使用 `openxiangda/core` 的角色管理 SDK。目录提供可管理角色、动作与授权范围；业务角色只能维护管理员已委托的范围。进一步委托要求 management.delegate，并受已有目标角色及动作子集限制。

成员和委托修改带 UUID operationId、原因，更新/撤销带最新 expectedRevision；冲突后重新读取。应用不另建授权表、选择 actor 或自行保存权限快照。SDK 和当前用户数据边界见[权限](./data-authz.md)。

## 可读流程图与实例路径 {#workflow-graph}

管理员在流程目录检索全部定义，查看指定版本的分支顺序、默认路径、变量类型/单位及来源。拓扑和条件由开发者发布；图和列表只用于查看。当前有效配置只叠加在匹配的激活定义上；历史实例使用固定定义和节点进入时的人员/配置，尚未执行的节点不计入执行路径。

目录进入独立流程图地址，刷新及浏览器返回保留所查看流程/版本。共享组件按需加载 React Flow 与 ELK 正交布局：所有线段横平竖直、转角为直角；支持画布平移、滚轮缩放、适应全图、聚焦选中和缩略导航。分支标签可选中，详情保留完整条件、顺序和来源；窄屏采用同源节点列表，方向键/Home/End 定位节点。画布布局上限为 200 节点、1024 连线，不提供拖改、删除或连线编辑。

应用自定义管理页面可复用当前用户客户端和共享图组件：

```tsx
import { useEffect, useState } from 'react';
import { WorkflowDiagram } from 'openxiangda/react';
import { loadWorkflowDefinitionGraph, type WorkflowGraphReadResult } from 'openxiangda/core';

export function ReadableWorkflow({ workflowCode, version }: {
  workflowCode: string; version: number;
}) {
  const [result, setResult] = useState<WorkflowGraphReadResult>();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setResult(undefined); setError('');
    loadWorkflowDefinitionGraph(workflowCode, version).then(value => {
      if (!cancelled) { setResult(value); setSelected(value.graph.startAt); }
    }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [workflowCode, version]);
  if (error) return <p role="alert">{error}</p>;
  if (!result) return <p>正在读取流程</p>;
  return <WorkflowDiagram graph={result.graph} selectedNodeId={selected} onSelectNode={setSelected} />;
}
```

组件运行在平台应用作用域内，SDK 使用当前用户，凭据及环境继续由平台管理。`loadWorkflowInstanceGraph(instanceId)` 返回固定版本、序列及持久访问记录，传入组件 `visits` 即可查看实际路径。两种管理读取都受服务端授权；不能给普通申请页暴露整个管理读面。

`titles`、`summaries` 只用于匹配版本的有效配置或进入快照；不能将今天的模式叠加到旧实例。可选 `selectedEdgeId/onSelectEdge` 将图上分支选择关联到自定义详情；它们不修改条件。实际边由访问记录的 `transition/matchedBranch` 确认，两个节点先后出现不能证明中间所有连线都被执行。

## 有界节点配置与 SDK {#node-administration}

开发者在审批节点的 `administration` 声明可维护的模式、人员来源和任务按钮。未声明这些项的节点保留名称、说明及原人员来源维护；拓扑、分支、范围计算仍由代码控制。使用新声明的应用需要平台 `workflow.node-administration@1.0.0`，编译与激活均检查该能力。

模式为 `single/any/all/sequence` 的允许子集；来源限 `fixed_users/app_role/app_role_in_scope`，范围角色必须已有代码声明的 scope。按钮 code 保持同意、拒绝、退回、转交、委托、加签的稳定语义；同意和拒绝不能关闭。只有同意/拒绝支持意见规则，拒绝或代码已有必填意见不能放宽。字段显隐、填写与必填行为由应用页面和代码维护，不提供流程节点的字段管理覆盖。可编译声明见 `examples/workflow-administration/declaration.ts`。

应用自定义管理页可使用 `WorkflowNodeConfigurationEditor`（`openxiangda/react`），输入同一读面中的节点、principals 和 context.headRevision，放在平台 App/UI 作用域内。它复用下列当前用户 SDK：

```ts
import { loadApplicationAdministrationContext, loadWorkflowNodeConfigurations,
  saveWorkflowNodeConfiguration } from 'openxiangda/core';

const context = await loadApplicationAdministrationContext();
const configuration = await loadWorkflowNodeConfigurations('requests');
const node = configuration.nodes.find(item => item.nodeId === 'review')!;
const operationId = crypto.randomUUID();
await saveWorkflowNodeConfiguration('requests', node.nodeId, {
  expectedHeadRevision: context.headRevision!, expectedRevision: node.configuration.revision,
  operationId, reason: '更新复审方式', patch: { mode: 'all' },
});
```

只有已声明允许 all 的节点可保存此例。输入最多 32KiB，人员 200、按钮文字 40 字。用 `patch: null` 恢复默认，也产生审计修订。结果未知时保留相同 operationId 和完整请求，查询后重试相同操作；确认的修订/Head 冲突先重新读取，不能覆盖别人。共享编辑器按审批人、审批按钮、名称与说明分组，显示配置来源、修订与生效范围；切组保留草稿，校验失败定位到相应分组。在冲突时保留草稿，加载最新基准后再次显式保存。

新配置影响以后进入的节点，当前待办保留进入时模式、人员、按钮和必填意见；实时人员资格仍复核。含新增配置或快照的环境不能直接回退到忽略策略的旧服务器。

## 审批人通用与专项路由 {#assignment-routing}

在 binding entry 的 `routing` 声明稳定策略代码、匹配维度及其事实路径，以及具名应用角色/范围角色来源。声明例子见 `examples/workflow-administration/routing.ts`。平台 `workflow.assignment-routing@1.0.0` 随 V2 内核提供，编译及目标平台检查自动校验；无路由声明时沿用原人员解析。成员继续在原生角色管理维护，无需再建审批人员表。字段行为、分支和范围计算由应用代码维护。

标准管理页的“流程定义 / 审批人路由”提供策略检索、规则维护和分页历史。应用工具页可直接嵌入 `WorkflowAssignmentRoutingManager`（`openxiangda/react`）；单策略编辑可使用 `WorkflowAssignmentRoutingEditor`。放在现有 App/UI 作用域内，保留后台路由和入口权限。读写都使用当前用户及当前挂载环境，首版与节点配置一样要求应用 superAdmin，角色维护委派不授予路由管理权。

```tsx
import { WorkflowAssignmentRoutingManager } from 'openxiangda/react';
export function RoutingPage() { return <WorkflowAssignmentRoutingManager />; }
```

```ts
import { loadWorkflowAssignmentRoutingConfiguration, saveWorkflowAssignmentRoutingConfiguration,
  loadWorkflowAssignmentRoutingCatalog, loadWorkflowAssignmentRoutingHistory } from 'openxiangda/core';

const catalog = await loadWorkflowAssignmentRoutingCatalog({ keyword: '学院', limit: 20, offset: 0 });
const current = await loadWorkflowAssignmentRoutingConfiguration('college-review');
await saveWorkflowAssignmentRoutingConfiguration(current.policy.policyCode, {
  expectedHeadRevision: current.headRevision, expectedRevision: current.revision,
  operationId: crypto.randomUUID(), reason: '增加学院补充审批职责',
  rules: [{ ruleCode: 'art-extra', title: '艺术学院补充', enabled: true,
    matches: { college: ['art'] }, sourceCode: 'extra', effect: 'append', priority: 0 }],
});
const history = await loadWorkflowAssignmentRoutingHistory('college-review', { limit: 10, offset: 0 });
```

保存的是整组规则，最多 256 条/256 KiB；最多 8 个维度、16 个来源，每维度 64 个匹配值。维度间同时满足、值内任意匹配，空 matches 为通用。可限定流程和审批节点，节点须带流程代码。时间为 `[validFrom,validTo)`。唯一最高优先级替换优先，`replace_then_append` 随后追加，`replace_only` 命中替换时忽略追加；没有替换时均采用默认来源再追加。追加按优先级降序、通用先专项、稳定代码排序，同来源同次只解析一次。

64 条以上规则同时命中、最高替换同级冲突、缺少事实、替换无人或候选越界都会明确阻塞，不自动通过或隐式兜底。预览和执行复用同一解析器；任务冻结规则修订和分派，管理员调整只影响未来进入。修改与发布使用同一环境锁，CAS 冲突重新读取基准、保留草稿并核对前后差异；未知结果保留完整原请求及 operationId 后显式重试。清空 rules 也产生修订和审计。发布不得改变在途同名策略语义，即便尚无补充规则；非空规则引用的来源和节点必须保留。
