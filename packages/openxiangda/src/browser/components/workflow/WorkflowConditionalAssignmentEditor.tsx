import { Alert, Button, Input, Space } from 'antd';
import {
  WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES, WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS,
  workflowAssignmentLeaves, workflowConditionalAssignmentFact, workflowDesignerVariables,
  type WorkflowBindingEntry, type WorkflowConditionalAssignment, type WorkflowConditionalAssignmentContext,
  type WorkflowConditionalAssignmentLeaf, type WorkflowNodeConfigurations,
} from 'openxiangda-contracts/browser';
import { WorkflowPeopleSourceEditor } from './WorkflowPeopleSourceEditor';
import { WorkflowConditionEditor, defaultWorkflowCondition } from './WorkflowConditionEditor';

export function createWorkflowConditionalAssignment(entry: WorkflowBindingEntry): WorkflowConditionalAssignment {
  const leaf: WorkflowConditionalAssignmentLeaf = WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS.includes(entry.provider as any)
    ? structuredClone(entry) as WorkflowConditionalAssignmentLeaf : { provider: 'fixed_users', users: [] };
  // An untouched new rule cannot accidentally match all applicants.
  return { provider: 'conditional', cases: [{ when: { op: 'literal', value: false }, assignee: structuredClone(leaf) }], otherwise: leaf };
}

/** Controlled whole value; opening/rendering never normalizes or mutates the assignment. */
export function WorkflowConditionalAssignmentEditor({ value = createWorkflowConditionalAssignment({ provider: 'fixed_users', users: [] }), context, principals, disabled = false, onChange }: {
  value: WorkflowConditionalAssignment; context: WorkflowConditionalAssignmentContext;
  principals: WorkflowNodeConfigurations['principals']; disabled?: boolean;
  onChange: (value: WorkflowConditionalAssignment) => void;
}) {
  const allVariables = workflowDesignerVariables(context.definition);
  const variables = allVariables.flatMap(variable => {
    const fact = workflowConditionalAssignmentFact(context.definition, context.nodeId, variable.path);
    return fact ? [{ ...variable, required: fact.required }] : [];
  });
  const sources: Record<string, WorkflowBindingEntry> = { ...context.releasedSources };
  if (context.frozenDefault) {
    try { workflowAssignmentLeaves(context.frozenDefault).forEach((leaf, index) => { sources[`frozen_${index + 1}`] = leaf; }); }
    catch { /* Invalid context cannot authorize an invented source; save's shared gate will refuse. */ }
  }
  const allowedSources = Object.fromEntries(Object.entries(sources).filter(([, source]) => WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS.includes(source.provider as any)));
  const change = (next: WorkflowConditionalAssignment) => { if (!disabled) onChange(next); };
  const leafEditor = (entry: WorkflowConditionalAssignmentLeaf, update: (entry: WorkflowConditionalAssignmentLeaf) => void) => <WorkflowPeopleSourceEditor entry={entry} sources={allowedSources} principals={principals} variables={allVariables} disabled={disabled} allowedProviders={context.standardProviders} scopeDimensions={context.scopeDimensions} onChange={entry => update(entry as WorkflowConditionalAssignmentLeaf)} />;
  const move = (index: number, delta: number) => { const cases = [...value.cases]; [cases[index], cases[index + delta]] = [cases[index + delta]!, cases[index]!]; change({ ...value, cases }); };
  return <section className="oxa-workflow-conditional-assignment" aria-label="条件人员规则">
    <Alert type="info" showIcon title="按顺序判断，仅使用首条满足条件的人员来源" description="未命中时使用“否则”。命中但无人可办理时不会继续尝试下一条。可选变量仅可判断是否存在。" />
    {value.cases.map((rule, index) => <section className="oxa-workflow-config-section" aria-label={`人员规则 ${index + 1}`} key={index}>
      <Space wrap><strong>规则 {index + 1}</strong><Button size="small" aria-label="上移" disabled={disabled || index === 0} onClick={() => move(index, -1)}>上移</Button><Button size="small" aria-label="下移" disabled={disabled || index === value.cases.length - 1} onClick={() => move(index, 1)}>下移</Button><Button size="small" danger disabled={disabled || value.cases.length === 1} onClick={() => change({ ...value, cases: value.cases.filter((_, i) => i !== index) })}>删除规则</Button></Space>
      <Input aria-label={`规则 ${index + 1} 名称`} placeholder="规则说明（可选）" maxLength={160} disabled={disabled} value={rule.label || ''} onChange={event => { const next = { ...rule }; if (event.target.value.trim()) next.label = event.target.value; else delete next.label; change({ ...value, cases: value.cases.map((item, i) => i === index ? next : item) }); }} />
      <WorkflowConditionEditor value={rule.when} variables={variables} requiredComparisons disabled={disabled} onChange={when => change({ ...value, cases: value.cases.map((item, i) => i === index ? { ...rule, when } : item) })} />
      {variables.some(variable => !variable.required) && <Button size="small" disabled={disabled} onClick={() => change({ ...value, cases: value.cases.map((item, i) => i === index ? { ...rule, when: { op: 'exists', value: { op: 'path', path: variables.find(variable => !variable.required)!.path } } } : item) })}>判断可选变量是否存在</Button>}
      {leafEditor(rule.assignee, assignee => change({ ...value, cases: value.cases.map((item, i) => i === index ? { ...rule, assignee } : item) }))}
    </section>)}
    <Button disabled={disabled || value.cases.length >= WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES} onClick={() => change({ ...value, cases: [...value.cases, { when: variables.some(item => item.required) ? defaultWorkflowCondition(variables.filter(item => item.required)) : { op: 'literal', value: false }, assignee: { provider: 'fixed_users', users: [] } }] })}>添加人员规则（{value.cases.length}/{WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES}）</Button>
    <section className="oxa-workflow-config-section" aria-label="否则人员"><h4>否则 · 必须配置</h4>{leafEditor(value.otherwise, otherwise => change({ ...value, otherwise }))}</section>
    <p className="oxa-workflow-config-help">不支持嵌套条件、发起时自选和应用自定义人员服务。任一规则使用连续主管时，审批方式必须为依次审批。</p>
  </section>;
}
