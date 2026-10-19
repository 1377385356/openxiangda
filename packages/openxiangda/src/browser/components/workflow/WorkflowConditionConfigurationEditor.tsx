import { formatWorkflowCondition, type WorkflowConditionVariable } from './workflow-variable-presentation';
import { WorkflowConditionExamples } from './WorkflowConditionExamples';
import { useEffect, useState } from 'react';
import { Alert, Button, Input, Select, Tag } from 'antd';
import { ArrowRightOutlined, ArrowLeftOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { type WorkflowNode } from 'openxiangda-contracts/browser';
import { WorkflowConditionEditor, defaultWorkflowCondition } from './WorkflowConditionEditor';

type ConditionNode = Extract<WorkflowNode, { kind: 'condition' }>;

/** Edits the selected branch of the same canonical draft as the canvas. */
export function WorkflowConditionConfigurationEditor({ node, variables, targets, selectedBranch, disabled, onChange }: {
  node: ConditionNode; variables: readonly WorkflowConditionVariable[]; targets: Array<{ value: string; label: string }>;
  selectedBranch?: number; disabled: boolean; onChange: (value: ConditionNode) => void;
}) {
  const [index, setIndex] = useState(selectedBranch || 0);
  useEffect(() => { if (selectedBranch !== undefined) setIndex(selectedBranch); }, [selectedBranch]);
  const active = Math.min(index, node.branches.length - 1);
  const branch = node.branches[active];
  const patchBranch = (patch: Partial<ConditionNode['branches'][number]>) => onChange({ ...node, branches: node.branches.map((value, i) => i === active ? { ...value, ...patch } : value) });
  const move = (direction: number) => {
    const next = active + direction;
    const branches = [...node.branches];
    [branches[active], branches[next]] = [branches[next]!, branches[active]!];
    onChange({ ...node, branches }); setIndex(next);
  };
  if (index===-1) return <section className="oxa-designer-condition-editor" aria-label="默认分支设置"><Alert type="info" showIcon title="其他情况（默认）" description="所有条件均不满足时进入此分支。默认分支始终在最后，不填写判断条件。" /><nav className="oxa-designer-branch-selector">{node.branches.map((branch,i)=><Button key={i} onClick={()=>setIndex(i)}>{branch.label||`条件 ${i+1}`}</Button>)}</nav><h3>分支路径</h3><p>{targets.find(target=>target.value===node.otherwise)?.label || '后续节点'}</p><p>在画布插入或移动节点来调整默认分支路径。</p></section>;
  if (!branch) return null;
  return <section className="oxa-designer-condition-editor" aria-label="条件分支设置">
    <Alert type="info" showIcon title="按优先级依次判断，进入第一个满足的分支；都不满足时进入「其他情况」" />
    <nav className="oxa-designer-branch-selector" aria-label="选择条件分支">
      {node.branches.map((value, i) => <Button key={i} aria-pressed={active === i} type={active === i ? 'primary' : 'default'} onClick={() => setIndex(i)}>{value.label || `条件 ${i + 1}`}</Button>)}
      <Button onClick={()=>setIndex(-1)}>其他情况（默认）</Button>
      <Button icon={<PlusOutlined />} disabled={disabled || !variables.length || node.branches.length >= 32} onClick={() => {
        onChange({ ...node, branches: [...node.branches, { label: `条件 ${node.branches.length + 1}`, when: defaultWorkflowCondition(variables), target: node.otherwise }] }); setIndex(node.branches.length);
      }}>添加条件分支</Button>
    </nav>
    <h3>分支名称</h3>
    <div className="oxa-designer-branch-identity">
      <Input aria-label={`分支 ${active + 1} 名称`} disabled={disabled} value={branch.label || ''} onChange={event => patchBranch({ label: event.target.value })} />
      <Tag>优先级 {active + 1}</Tag>
      <Button aria-label="提高分支优先级" icon={<ArrowLeftOutlined />} disabled={disabled || active === 0} onClick={() => move(-1)} />
      <Button aria-label="降低分支优先级" icon={<ArrowRightOutlined />} disabled={disabled || active === node.branches.length - 1} onClick={() => move(1)} />
      <Button aria-label="删除分支" danger icon={<DeleteOutlined />} disabled={disabled || node.branches.length === 1} onClick={() => { onChange({ ...node, branches: node.branches.filter((_, i) => i !== active) }); setIndex(Math.max(0, active - 1)); }} />
    </div>
    <h3>进入条件</h3>
    <fieldset disabled={disabled} className="oxa-designer-condition-surface"><WorkflowConditionEditor value={branch.when} variables={variables} onChange={when => patchBranch({ when })} /></fieldset>
    <h3>条件说明</h3>
    <p className="oxa-designer-condition-description">{formatWorkflowCondition(branch.when, variables)}</p>
    <div className="oxa-designer-condition-path"><h3>分支路径</h3><p>满足条件：{targets.find(target=>target.value===branch.target)?.label || '后续节点'}</p><p>其他情况：{targets.find(target=>target.value===node.otherwise)?.label || '后续节点'}</p><small>在画布插入、拖动节点来调整路径。</small></div>
    <WorkflowConditionExamples node={node} variables={variables} />
    <p>此配置属于流程草稿，发布并启用后生效。</p>
  </section>;
}
