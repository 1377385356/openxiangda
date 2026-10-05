# 应用管理与有效配置

平台的应用管理控制台维护应用成员、角色授权和流程运行参数。应用自身声明的 `/admin` 业务菜单展示业务页面，两者职责不同。可见入口和可执行操作以当前用户与目标环境返回结果为准。

角色成员的范围维度也支持模型字段的 `userCandidates.scope` 引用，不要求为审批人职责增加无关的数据读写策略。目录 `scopeDimensions[].applicability.candidateFields` 返回字段所在的资源、数据修订、字段、角色与操作；当前环境及仍在办理的历史流程所引用的字段均可贡献范围适用性。实例完成或发起命令取消后，旧字段不再单独贡献适用性。配置成员的范围不会自动授予数据读写、菜单或应用管理权限；实际选人与提交仍核验范围、操作、成员有效期及账号状态。

流程的 `app_role_in_scope` 绑定也贡献范围适用性，包括审批、抄送、兼容的节点人员覆盖及路由补充来源。目录 `scopeDimensions[].applicability.workflowBindings` 返回流程、节点、角色、定义/绑定版本、配置修订、来源和 `active`/`in_flight` 上下文；不包含业务事实或标题。当前启用定义和仍在办理的固定版本均可维护其职责，终态实例或已取消发起命令不再单独贡献适用性。

自定义管理页面按“候选字段引用该角色、有效流程范围职责引用该角色，或任一数据策略规则适用于该角色”筛选维度。每条策略须单独处理 `unrestrictedRoleCodes`；不能仅依据汇总 `allRoles`、`roleCodes` 或全局排除列表判断。未返回 `candidateFields` 或 `workflowBindings` 时按空列表处理。流程职责的范围维护不授予普通数据读写权限，也不改变已创建任务的参与人快照。

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

### 批量核对与逐项回执

`listRoleMemberships` 支持 `dimensionCode` 与 `scopeValue` 成对精确筛选，和角色、人员、状态、关键词一起在服务端分页前过滤。管理授权仍按角色和动作委派；筛选某个学院不会额外授予该学院的维护权限。同步投影成员和系统认证成员继续只读。

平台 `authz.native-membership-batch@1.0.0` 自动提供批量能力。`previewRoleMembershipBatch` 与 `executeRoleMembershipBatch` 使用当前用户、当前挂载环境；一次 1–50 项，最多 128 KiB，整批只支持同一种新增、更新或撤销。每项保留自己的 UUID operationId 和原因；更新/撤销带读取时的 expectedRevision。同一批不能重复人员+角色、成员 ID 或 operationId。

```ts
import { listRoleMemberships, previewRoleMembershipBatch,
  executeRoleMembershipBatch, type NativeRoleMembershipBatchItem } from 'openxiangda/core';

const page = await listRoleMemberships({ roleCode: 'college_reviewer',
  dimensionCode: 'college', scopeValue: 'art', status: 'active', limit: 20, offset: 0 });
const items: NativeRoleMembershipBatchItem[] = page.items.filter(row => row.maintainable).map(row => ({
  operation: 'update', operationId: crypto.randomUUID(), membershipId: row.id,
  expectedRevision: row.revision, reason: '调整艺术学院审批职责有效期',
  scopeGrants: row.scopeGrants, validFrom: row.validFrom, validTo: '2027-01-01T00:00:00.000Z',
}));
if (items.length) {
  const proposal = await previewRoleMembershipBatch({ items });
  // 页面向管理员展示 before/after；核对后显式提交完全相同的 items。
  if (proposal.failed === 0 && proposal.unconfirmed === 0) {
    const result = await executeRoleMembershipBatch({ items });
    // 逐项读取 result.items，不把 HTTP 成功当成整批成功。
  }
}
```

示例角色和范围必须已在本应用声明；页面将预览与执行放在两次明确操作中。更新是完整替换 scope 与有效期；省略 scope 会清空范围，省略时间会解除相应限制，因此只修改时间时也带回保留的 scope 与另一端时间。

预览在原授权内核验证后回滚所有 SQL，不保存成员、版本或回执，不失效授权缓存；单项差异超过 16 KiB 被拒绝。预览不是预留，执行时会重新检查人员、权限和 CAS。预览 `ready/already_committed` 只返回 before/after 的业务投影，没有临时成员 ID 或虚构回执。

执行每项独立事务、按顺序处理，允许部分成功。`committed/replayed` 返回原不可变回执；`failed` 是已确认拒绝；`unconfirmed` 表示结果未知，包括提交后缓存失效异常，不能认为没有提交。失败只返回脱敏的 code/status/pointer/retryable。保存原请求，使用 `loadAuthorizationMutationReceipt(operationId)` 核对，必要时显式重放相同 operationId 和 payload；修正已确认失败项的内容后使用新 operationId，不重发已成功项。网络中断也按未知结果处理。

成员维护影响后续授权和分派；已有任务保持进入时参与快照，实际办理资格仍实时核验。批量维护不隐式改派当前待办。

### 共享成员维护组件

标准管理入口与应用自定义工具页可复用 `RoleMembershipManager`，保留所在页面的 Shell 和入口授权：

```tsx
import { RoleMembershipManager } from 'openxiangda/react';

export function ResponsibilityMembers() {
  return <RoleMembershipManager initialRoleCode="college_reviewer" />;
}
```

`initialRoleCode` 只是初始筛选，必须来自本应用的角色声明，不授予管理权限。可选 `refreshKey` 变化时重新读取目录与成员。组件使用当前用户、当前挂载环境，按角色、人员关键词、状态和业务范围分页；同步投影及系统认证来源只读。

选择最多 50 位成员后调整某个范围维度或有效期，组件显式保留每位成员未修改的范围、操作上限和时间。预览逐项展示修改前后；提交后区分成功、拒绝及未知结果。冲突后保留输入，显式载入最新基准并重新核对；未知操作只能核对原回执或重试相同编号及请求。已核对成功项不会再次提交。组件支持窄屏布局、表格内部横滚、未保存关闭提示及保存中离开保护。

默认应用 Shell 在窄屏自动折叠侧边栏；宿主自定义 Shell 应给内容区保留可收缩宽度。成员读取失败显示重试状态，只有成功读取后的空结果才显示没有成员。核对或提交中禁用关闭、修改和再次提交按钮。

### 角色关联的潜在流程节点

`loadWorkflowRoleReferences(roleCode, { keyword, limit, offset })` 查询当前激活及在途固定版本中可能使用此角色的节点；平台自动提供 `workflow.role-references@1.0.0`。返回定义/绑定版本与摘要、配置修订、激活/在途上下文，并区分代码默认角色、节点配置覆盖和代码许可路由来源。许可来源不表示规则已经命中；这里的条数不是受影响待办数，也不会改派旧任务。

读取沿用原流程管理权限。仅获成员管理委托的用户可能可以维护角色，同时没有权限读取关联流程；组件单独呈现该拒绝。返回不含成员、实例标识或业务事实，每页最多 100 条；最多 1000 个版本组合、32 MiB 源 JSON、10000 节点/引用，超限明确拒绝。

### 多职责成员合并

审批或抄送的 `app_role` / `app_role_in_scope` 来源可用 `roleCodes` 声明 2–8 个不同职责，
与单职责 `roleCode` 互斥。例如：

```ts
jointReviewers: {
  provider: 'app_role',
  roleCodes: ['student-office', 'organization'],
}
```

节点进入时读取这些职责的当前有效成员；范围角色共用同一份代码计算的 `scope`。
同一人员只占一个审批席位或抄送名额，解析解释保留各职责来源。
职责顺序决定重叠人员席位使用哪个职责的代理规则：采用首个匹配职责，
不会借用后续职责的代理。已有任务保持原人员快照。

管理员仅在代码开放人员来源配置的节点中调整职责组合；单选仍保存 `roleCode`，
多选保存 `roleCodes`。保存、版本激活均检查所有职责，任何职责失效或查询失败都不能
变成部分名单。总候选最多 200 个成员身份；去重后的审批上限仍受原 binding 限制，
自动抄送最多 20 人。声明自动协商 `workflow.role-union@1.0.0`，无需初始化开关。

管理范围检索使用 `listRoleManagementScopeValues(dimensionCode, { keyword, limit, offset })`，返回 `NativeRoleManagementScopeValuePage` 的 `id/label` 与 `limit/offset`。它使用 `openxiangda.native-role-management-scope-value-page/v2`，与 Data 字段选择器的 `value/label/cursor` 协议分开。权限仍要求对成员的分配或更新能力；只读权限不因此扩张。

## 限时审批代理 {#workflow-delegations}

平台自动提供 `workflow.delegation-management@1.0.0`，没有额外的默认关闭开关。本人只能委托自己的有效审批职责；代理人必须具有同角色、覆盖原范围且有效期覆盖整个代理窗口的成员身份。采用平台数据库时间与 `[开始, 结束)` 区间，禁止自己代理、重叠链和环。管理员可全应用查看和撤销，创建由原审批人本人完成；成员管理委托不会扩大后台或代理管理权。

标准管理入口、应用后台工具与门户个人页可复用 `WorkflowDelegationManager`。组件读取当前挂载应用和环境；`initialAll` 只是筛选意图，平台仍核验超管权限。宿主把草稿回调交给已有导航保护，避免切页时丢失输入或未知操作：

```tsx
import { useState } from 'react';
import { WorkflowDelegationManager, useUnsavedChangesGuard,
  type WorkflowDelegationDraftState } from 'openxiangda/react';

export function MyApprovalDelegations() {
  const [draft, setDraft] = useState<WorkflowDelegationDraftState>({ dirty: false, busy: false, unknown: false });
  useUnsavedChangesGuard({ when: draft.dirty || draft.busy || draft.unknown,
    preventNavigation: draft.busy || draft.unknown,
    message: draft.unknown ? '请先核对原操作回执。' : '代理维护尚未完成。' });
  return <WorkflowDelegationManager onDraftStateChange={setDraft} />;
}
```

以上页面须位于原 `OpenXiangdaApplication` 路由内。独立平台Console使用自己的现有导航owner处理回调，不为组件新增Router。提交中或结果未知不能确认丢弃后离开；普通草稿可明确放弃。组件提供PC/窄屏列表、筛选、资格诊断、合法候选分页、核对/提交、撤销原因和回执恢复。

自定义页面使用 `openxiangda/core` 的 `loadWorkflowDelegationCatalog`、`listWorkflowDelegations`、`loadWorkflowDelegation`、`listWorkflowDelegationCandidates`、`previewWorkflowDelegationMutation`、`executeWorkflowDelegationMutation` 和 `loadWorkflowDelegationMutationReceipt`。列表默认20/最大100，候选默认20/最大50，搜索80字；本人职责目录最多100、流程标题最多200。创建请求带双方预期成员修订，撤销带规则 `expectedRevision`，均有UUID `operationId`、原因和绑定环境，请求最多16KiB；额外actor、权限或字段配置被拒绝。

预览完整回滚，不创建规则或回执；新规则提案id为null。核对后显式提交同一个请求，平台再检查当前权限和资格。规则与原回执同事务保存；同key同内容返回原回执，同key改内容或跨actor/应用/环境拒绝。首次明确4xx拒绝可保留输入、读新基准再核对；提交结果未知先查询原回执，404仍未知，允许用户显式重试原key及原请求，不能自动换key重发。`WORKFLOW_V2_DELEGATION_OPERATION_CONFLICT`、`SOURCE_REVISION_CONFLICT`和原owner的`REVISION_CONFLICT`等409都保持草稿；503不表示未提交。

回执保存提交时结果，当前状态以刷新列表的 `effectiveState/evaluatedAt/issues` 为准。创建和撤销只影响后续分派，已有任务保留进入时的原人/代理/职责/时间快照，办理仍复核资格；需要处理既有待办时使用显式任务修复操作。

Nest后端注入请求作用域的 `OpenXiangdaWorkflowService`，调用 `delegationCatalog/delegationManagement/delegationCandidates/delegationAdministration` 与 `previewDelegationMutation/executeDelegationMutation/delegationMutationReceipt`；它复用已验证当前用户，环境来自模块绑定。业务处理器不自报actor、不替别人代建授权，审批后代建属于单独受限合同。

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

模式为 `single/any/all/sequence` 的允许子集；可维护来源限 `fixed_users/app_role/app_role_in_scope`，范围角色必须已有代码声明的 scope。按钮 code 保持同意、拒绝、退回、转交、委托、加签的稳定语义；同意和拒绝不能关闭。只有同意/拒绝支持意见规则；拒绝默认必填，固定节点代码可用 operationPolicy.reject.commentRequired: false 显式选填。管理员可收紧选填规则，也可恢复代码明确允许的选填；不能放宽代码必填或未声明时的拒绝默认必填。已进入的任务保留冻结规则。字段显隐、填写与必填行为由应用页面和代码维护，不提供流程节点的字段管理覆盖。可编译声明见 `examples/workflow-administration/declaration.ts`。

自动抄送节点仅开放名称、说明和显式声明的 `administration.assigneeProviders`；未开放时接收来源只读。共享编辑器显示“抄送人”，不显示审批方式或审批按钮，固定名单最多20人。`next`、空人策略和通知策略仍归代码；新配置只影响以后进入，过去抄送名单保持冻结。完整例子见 `examples/workflow-administration/automatic-cc.ts`，执行及读取边界见[自动抄送](./workflow-events.md#automatic-cc)。

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

打包和目标预检自动将含 `routing` 的 binding 纳入该能力的使用摘要，与平台编译结果严格对齐；无需应用手工填写能力清单或额外开启开关。

标准管理页的“流程定义 / 审批人路由”提供策略检索、规则维护和分页历史。应用工具页可直接嵌入 `WorkflowAssignmentRoutingManager`（`openxiangda/react`）；单策略编辑可使用 `WorkflowAssignmentRoutingEditor`。放在现有 App/UI 作用域内，保留后台路由和入口权限。读写都使用当前用户及当前挂载环境，首版与节点配置一样要求应用 superAdmin，角色维护委派不授予路由管理权。

规则核对只计算内容变化，打开规则表单后原样加入草稿不会产生多余修改。发生修订冲突时载入最新基准并保留整组草稿，再逐项核对；这个操作不会自动合并其他管理员的修改。窄屏工具栏允许换行，表格在内部滚动，规则表单按单列显示。

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
