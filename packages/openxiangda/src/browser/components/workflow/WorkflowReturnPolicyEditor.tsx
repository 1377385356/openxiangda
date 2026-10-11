import { Select } from 'antd';
import type { WorkflowReturnPolicy, WorkflowReturnTargetPolicy, WorkflowDefinition, WorkflowHumanNode } from 'openxiangda-contracts/browser';
import { workflowReturnTargets, workflowReturnTargetPolicy } from 'openxiangda-contracts/browser';

const routeChoices = [{ value: 'replay', label: '重新经过后续节点' }, { value: 'resume', label: '重新提交后返回当前节点' }];
export function WorkflowReturnPolicyEditor({ definition, node, disabled, onChange }: {
  definition: WorkflowDefinition; node: WorkflowHumanNode; disabled: boolean; onChange: (policy: WorkflowReturnPolicy) => void;
}) {
  const targets = workflowReturnTargets(node).map(id => workflowReturnTargetPolicy(definition, node, id)!).filter(Boolean);
  const update = (id: string, patch: Partial<WorkflowReturnTargetPolicy>) => onChange({ targets: targets.map(target => target.nodeId === id ? { ...target, ...patch } : target) });
  return <section aria-label="退回设置" className="oxa-workflow-return-policy"><h3>退回设置</h3>
    <label>允许退回到<Select mode="multiple" disabled={disabled} value={targets.map(target => target.nodeId)} style={{ width: '100%' }}
      options={Object.values(definition.nodes).filter(target => target.id !== node.id && ['approval','handle','correction'].includes(target.kind)).map(target => ({ value: target.id, label: target.kind === 'correction' ? `${target.title}（发起人）` : target.title || target.id }))}
      onChange={(ids: string[]) => onChange({ targets: ids.map(id => targets.find(target => target.nodeId === id) || { nodeId: id, routes: ['replay','resume'], defaultRoute: 'replay' }) })} /></label>
    {targets.map(target => <div key={target.nodeId} className="oxa-designer-return-target"><strong>{definition.nodes[target.nodeId]?.title}</strong>
      <label>办理人可以选择的继续方式<Select mode="multiple" disabled={disabled} style={{ width: '100%' }} value={target.routes} options={routeChoices}
        onChange={routes => { if (routes.length) update(target.nodeId, { routes, defaultRoute: routes.includes(target.defaultRoute) ? target.defaultRoute : routes[0] }); }} /></label>
      <label>默认继续方式<Select disabled={disabled} style={{ width: '100%' }} value={target.defaultRoute} options={routeChoices.filter(choice => target.routes.includes(choice.value as 'replay'|'resume'))} onChange={defaultRoute => update(target.nodeId, { defaultRoute })} /></label>
      {target.routes.includes('resume') && <small>条件或代码步骤输入改变时，重新提交会自动改为重新流转，并记录原因。</small>}
    </div>)}
  </section>;
}
