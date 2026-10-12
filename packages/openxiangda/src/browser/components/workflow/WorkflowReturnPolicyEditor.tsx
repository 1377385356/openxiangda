import { Checkbox, Select } from 'antd';
import { RightOutlined, WarningOutlined } from '@ant-design/icons';
import type { WorkflowReturnPolicy, WorkflowReturnTargetPolicy, WorkflowDefinition, WorkflowHumanNode } from 'openxiangda-contracts/browser';
import { workflowReturnEligibility, projectWorkflowGraph, workflowReturnTargets, workflowReturnTargetPolicy } from 'openxiangda-contracts/browser';

const routeChoices = [{ value: 'replay', label: '重新按流程审批' }, { value: 'resume', label: '直接回到本节点' }];

/** A labelled preview of a possible forward path, never an execution result. */
function examplePath(definition: WorkflowDefinition, target: string, destination: string): string[] {
  const graph = projectWorkflowGraph(definition, 'draft');
  const queue = [[target]], visited = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!, last = path.at(-1)!;
    if (last === destination) return path;
    if (visited.has(last)) continue;
    visited.add(last);
    for (const edge of graph.edges.filter(edge => edge.from === last && !['return','resubmit'].includes(edge.kind))) queue.push([...path, edge.to]);
  }
  return [];
}

export function WorkflowReturnPolicyEditor({ definition, node, disabled, onChange }: {
  definition: WorkflowDefinition; node: WorkflowHumanNode; disabled: boolean; onChange: (policy: WorkflowReturnPolicy) => void;
}) {
  const targets = workflowReturnTargets(node).map(id => workflowReturnTargetPolicy(definition, node, id)!).filter(Boolean);
  const candidates = Object.values(definition.nodes).filter(target => target.id !== node.id && ['approval','handle','correction'].includes(target.kind));
  const update = (id: string, patch: Partial<WorkflowReturnTargetPolicy>) => onChange({ targets: targets.map(target => target.nodeId === id ? { ...target, ...patch } : target) });
  return <section aria-label="退回设置" className="oxa-workflow-return-policy">
    <div className="oxa-designer-return-notice">退回设置 · 属于草稿，发布并启用后生效</div>
    <p>退回后申请继续，并开启新一轮办理。为每个目标选择重新提交后的继续方式。</p>
    {!candidates.length && <p>当前流程没有可配置的退回目标。</p>}
    {candidates.map(candidate => {
      const eligibility=workflowReturnEligibility(definition,node.id,candidate.id);
      const target = targets.find(target => target.nodeId === candidate.id);
      const path = target ? examplePath(definition, candidate.id, node.id) : [];
      const title = candidate.kind === 'correction' ? `${candidate.title || '补正'}（发起人）` : candidate.title || '办理节点';
      return <article key={candidate.id} className={`oxa-designer-return-target ${target ? 'enabled' : ''}`}>
        <header>
          <Checkbox aria-label={`允许退回到${title}`} checked={!!target} disabled={disabled || !target && (!eligibility.allowed || targets.length >= 20)} onChange={event => onChange({ targets: event.target.checked ? [...targets, { nodeId: candidate.id, routes: ['replay','resume'], defaultRoute: 'replay' }] : targets.filter(target => target.nodeId !== candidate.id) })}>{title}</Checkbox>
          <label>重新提交后<Select aria-label={`${title}重新提交后的方式`} disabled={disabled || !target} value={target?.defaultRoute} options={routeChoices} onChange={defaultRoute => update(candidate.id, { defaultRoute, routes: target!.routes.length > 1 ? target!.routes : [defaultRoute] })} placeholder="请选择" /></label>
        </header>
        {!eligibility.allowed && <p className="oxa-workflow-config-help">{eligibility.reason}{target && '（请取消此退回目标后再发布）'}</p>}
        {target && <>
          {path.length > 0 && <div className="oxa-designer-return-path" aria-label="示例路径"><small>示例路径</small>{path.slice(0, 12).map((id, index) => <span key={id}>{index > 0 && <RightOutlined />}<span className={target.defaultRoute === 'resume' && index > 0 && index < path.length - 1 ? 'skipped' : ''}>{definition.nodes[id]?.title || '节点'}</span></span>)}{path.length > 12 && <span>…</span>}</div>}
          <p className="oxa-designer-return-warning"><WarningOutlined />{target.defaultRoute === 'resume' ? '跳过示例路径中的中间节点，直接回到本节点，并记入审批记录；输入变化时仍会自动改为重新审批。' : '重新经过后续节点，业务步骤按应用的执行规则处理。'}</p>
          <Checkbox checked={target.routes.length > 1} disabled={disabled} onChange={event => update(candidate.id, { routes: event.target.checked ? ['replay','resume'] : [target.defaultRoute] })}>办理时允许调整继续方式</Checkbox>
        </>}
      </article>;
    })}
    <aside className="oxa-designer-return-rule"><h3>回到本节点时由谁办理</h3><p>单人、或签：优先回到退回人；该人已不在当前可办理人选中时，由本节点当前处理人办理。</p><p>会签、依次审批：本节点全部处理人重新办理。</p></aside>
    <aside className="oxa-designer-return-rule"><h3>自动改为重新审批的情况</h3><p>资料修改后不再经过本节点，或中间条件与业务步骤的输入发生变化时，系统会重新按流程审批并记录原因。</p></aside>
    <p>示例路径用于解释配置；实际进入的分支在办理时判断。</p>
  </section>;
}
