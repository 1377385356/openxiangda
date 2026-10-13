import { WorkflowConditionalAssignmentEditor, createWorkflowConditionalAssignment } from './WorkflowConditionalAssignmentEditor';
import { type WorkflowConditionalAssignmentContext } from 'openxiangda-contracts/browser';
import { WorkflowPeopleSourceEditor } from './WorkflowPeopleSourceEditor';
import { Input, Radio, Select, Switch } from 'antd';
import { workflowOperationMinimumOpinion, workflowOperationOpinion, type WorkflowConfigurableOperation, type WorkflowHumanNode, type WorkflowNode, type WorkflowBindingEntry, type WorkflowNodeConfigurations } from 'openxiangda-contracts/browser';

const labels: Record<WorkflowConfigurableOperation, string> = { complete: '办理完成', approve: '同意', reject: '拒绝申请', save_form: '保存', return: '退回', transfer: '转交', delegate: '委托', add_assignee: '加签' };
const opinions = ['none', 'optional', 'required'] as const;

/** New-node handling is part of the canonical draft until its first publication. */
export function WorkflowDraftHandlingEditor({ node, baseline, bindingOptions, binding, sources, principals, disabled, onChange, onBindingChange, conditionalContext }: {
  conditionalContext?: WorkflowConditionalAssignmentContext;
  node: WorkflowHumanNode | Extract<WorkflowNode,{kind:'cc'}>; baseline: WorkflowHumanNode;
  binding?: WorkflowBindingEntry; sources?: Record<string,WorkflowBindingEntry>; principals?: WorkflowNodeConfigurations['principals']; onBindingChange?: (entry: WorkflowBindingEntry) => void; bindingOptions: Array<{ value: string; label: string }>;
  disabled: boolean; onChange: (patch: Record<string, unknown>) => void;
}) {
  const human = node.kind !== 'cc';
  const operations = human ? node.administration?.operations || [] : [];
  const policy = (operation: WorkflowConfigurableOperation, patch: Record<string, unknown>) => onChange({ operationPolicy: { ...(human ? node.operationPolicy : {}), [operation]: { ...(human ? node.operationPolicy?.[operation] : {}), ...patch } } });
  return <section className="oxa-workflow-config oxa-workflow-config-inline" aria-label="新增节点办理设置">
    <div className="oxa-designer-defaults-notice">办理设置（默认值） · 首次发布后生效</div>
    <section className="oxa-workflow-config-section"><h3>{node.kind === 'handle' ? '办理人' : node.kind === 'cc' ? '抄送人' : '审批人'}</h3>
      {human && conditionalContext && binding && onBindingChange && <Radio.Group aria-label="新增节点人员分派方式" disabled={disabled} value={binding.provider === 'conditional' ? 'conditional' : 'standard'} options={[{ value: 'standard', label: '普通人员来源' }, { value: 'conditional', label: '按条件选择' }]} onChange={event => onBindingChange(event.target.value === 'conditional' ? createWorkflowConditionalAssignment(binding) : { provider: 'fixed_users', users: [] })} />}
      {binding?.provider === 'conditional' ? conditionalContext && principals && onBindingChange ? <WorkflowConditionalAssignmentEditor value={binding} context={conditionalContext} principals={principals} disabled={disabled} onChange={onBindingChange} /> : <p>平台尚未开放条件人员编辑，原规则保持不变。</p> : binding && sources && principals && onBindingChange ? <WorkflowPeopleSourceEditor entry={binding} sources={sources} principals={principals} disabled={disabled} onChange={onBindingChange} /> : <Select aria-label="新增节点人员规则" value={node.binding} disabled={disabled} options={bindingOptions} style={{width:'100%'}} onChange={binding => onChange({binding})} />}
      {human && <><h3>{node.kind === 'handle' ? '多人办理方式' : '多人审批方式'}</h3><Radio.Group className="oxa-workflow-mode-options" disabled={disabled} value={node.mode} onChange={event => onChange({ mode: event.target.value })} options={(node.administration?.modes || [node.mode]).map(value=>({value,label:({single:'单人',any:'或签',all:'会签',sequence:'依次审批'} as Record<string,string>)[value]}))} /></>}
    </section>
    {human && !!operations.length && <section className="oxa-workflow-config-section"><h3>{node.kind === 'handle' ? '办理操作' : '审批操作'}</h3>
      <table className="oxa-workflow-operation-table"><thead><tr><th>操作</th><th>显示名称</th><th>意见</th><th>启用</th></tr></thead><tbody>{operations.map(operation=>{
        const required=operation==='approve'||operation==='complete'||baseline.requiredOperations?.includes(operation);
        const minimum=workflowOperationMinimumOpinion(operation,baseline.operationPolicy?.[operation]);
        const automatic=operation==='approve'&&!!(baseline.kind === 'approval' && (baseline.initiatorApprovalPolicy==='auto_approve'||baseline.completionDeadline));
        return <tr key={operation}><th scope="row">{labels[operation]}{operation==='save_form'&&<small>更多 · 不推进流程</small>}</th><td><Input aria-label={`新增节点${labels[operation]}按钮文字`} variant="borderless" maxLength={40} disabled={disabled} value={node.operationPolicy?.[operation]?.label||labels[operation]} onChange={event=>policy(operation,{label:event.target.value})} /></td>
          <td>{operation==='save_form'?'—':<><Select aria-label={`新增节点${labels[operation]}意见要求`} variant="borderless" disabled={disabled} value={workflowOperationOpinion(operation,node.operationPolicy?.[operation])} options={opinions.map(value=>({value,label:({none:'不填写',optional:'选填',required:'必填'})[value],disabled:opinions.indexOf(value)<opinions.indexOf(minimum)||automatic&&value==='required'}))} onChange={opinion=>policy(operation,{opinion})} />{minimum==='required'&&<small>应用要求必填</small>}</>}</td>
          <td><Switch size="small" aria-label={`启用新增节点${labels[operation]}`} disabled={disabled||required} checked={node.allowedOperations?.includes(operation)??true} onChange={enabled=>{const allowed=new Set(node.allowedOperations||operations);if(enabled)allowed.add(operation);else allowed.delete(operation);onChange({allowedOperations:[...allowed]});}} />{required&&<small>流程推进所需</small>}</td></tr>;
      })}</tbody></table>
    </section>}
  </section>;
}
