import { createBrowserUuid } from '../../uuid';
import { useState } from 'react';
import { Alert, Button, Checkbox, Input, Popconfirm, Tag } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { WORKFLOW_PARALLEL_MAX_BRANCHES, type WorkflowGraphVariable, type WorkflowParallelNode } from 'openxiangda-contracts/browser';
import { WorkflowConditionEditor, defaultWorkflowCondition } from './WorkflowConditionEditor';

export function WorkflowParallelConfigurationEditor({ node,variables,disabled,onChange,onRemove }: {
  node: WorkflowParallelNode; variables: readonly WorkflowGraphVariable[]; disabled: boolean;
  onChange: (node: WorkflowParallelNode) => void; onRemove: (branchId: string) => void;
}) {
  const [selected,setSelected] = useState(node.branches[0]?.id);
  const index = Math.max(0,node.branches.findIndex(branch => branch.id === selected)), branch = node.branches[index];
  if (!branch) return null;
  const patch = (value: Partial<WorkflowParallelNode['branches'][number]>) => onChange({ ...node,branches: node.branches.map((item,i) => i === index ? { ...item,...value } : item) });
  const move = (direction: number) => { const branches = [...node.branches];[branches[index],branches[index+direction]] = [branches[index+direction]!,branches[index]!];onChange({ ...node,branches }); };
  return <section className="oxa-designer-condition-editor" aria-label="并行分支设置">
    <Alert type="info" showIcon title="同时进入符合条件的分支，全部完成后继续" description="进入时确定本次执行的分支。各分支独立办理；任一分支拒绝会结束整条申请。" />
    <nav className="oxa-designer-branch-selector" aria-label="选择并行分支">{node.branches.map(item => <Button key={item.id} type={branch.id === item.id ? 'primary' : 'default'} aria-pressed={branch.id === item.id} onClick={() => setSelected(item.id)}>{item.title}</Button>)}
      <Button icon={<PlusOutlined />} disabled={disabled || node.branches.length >= WORKFLOW_PARALLEL_MAX_BRANCHES} onClick={() => { const id = `branch_${createBrowserUuid().replaceAll('-','').slice(0,12)}`;onChange({ ...node,branches: [...node.branches,{ id,title: `分支 ${node.branches.length+1}`,target: node.join }] });setSelected(id); }}>添加并行分支</Button></nav>
    <h3>分支名称</h3><div className="oxa-designer-branch-identity"><Input aria-label="并行分支名称" disabled={disabled} maxLength={255} value={branch.title} onChange={event => patch({ title: event.target.value })} /><Tag color="blue">同时</Tag>
      <Button aria-label="分支向左移动" icon={<ArrowLeftOutlined />} disabled={disabled || !index} onClick={() => move(-1)} /><Button aria-label="分支向右移动" icon={<ArrowRightOutlined />} disabled={disabled || index === node.branches.length-1} onClick={() => move(1)} />
      <Popconfirm title="删除此分支和分支内的节点？" description="可以通过撤销恢复。" onConfirm={() => { onRemove(branch.id);setSelected(node.branches[index === 0 ? 1 : 0]?.id); }}><Button aria-label="删除并行分支" danger icon={<DeleteOutlined />} disabled={disabled || node.branches.length <= 2} /></Popconfirm></div>
    <h3>进入条件</h3><Checkbox disabled={disabled || !variables.length} checked={!!branch.when} onChange={event => { if (event.target.checked) patch({ when: defaultWorkflowCondition(variables) });else { const { when: ignored,...value } = branch;onChange({ ...node,branches: node.branches.map((item,i) => i === index ? value : item) }); } }}>满足条件时才执行</Checkbox>
    {branch.when ? <fieldset disabled={disabled} className="oxa-designer-condition-surface"><WorkflowConditionEditor value={branch.when} variables={variables} onChange={when => patch({ when })} /></fieldset> : <p className="oxa-designer-condition-description">始终执行此分支</p>}
    <h3>分支内节点</h3><p>点击该分支连线上的「＋」添加审批、办理或业务步骤。</p><p>至少 2 条、最多 8 条分支。发布时会检查各分支可编辑字段和步骤输入，避免互相影响。</p>
  </section>;
}
