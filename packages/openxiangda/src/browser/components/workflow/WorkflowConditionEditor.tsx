import { Button, Input, InputNumber, Select, Space, Switch } from 'antd';
import type { WorkflowExpression, WorkflowGraphVariable } from 'openxiangda-contracts/browser';
const variableTypeLabel = (variable: WorkflowGraphVariable) => {
  const types = variable.type.split(',').filter(type => type !== 'null');
  return types.map(type => ({ number: variable.unit === '元' ? '金额' : '数字', integer: '整数', string: '文本', boolean: '是否', array: '列表', object: '对象' }[type] || '变量')).join(' / ');
};
const comparison = [{ value: 'eq', label: '等于' },{ value: 'neq', label: '不等于' },{ value: 'gt', label: '大于' },{ value: 'gte', label: '大于等于' },{ value: 'lt', label: '小于' },{ value: 'lte', label: '小于等于' },{ value: 'in', label: '属于' },{ value: 'contains', label: '包含' }];
export function defaultWorkflowCondition(variables: readonly WorkflowGraphVariable[]): WorkflowExpression {
  const variable = variables.find(item => item.type.split(',').some(type => ['number','integer','string','boolean'].includes(type)));
  return { op: 'eq', left: { op: 'path', path: variable?.path || '' }, right: { op: 'literal', value: variable?.type.split(',').includes('boolean') ? false : variable?.type.split(',').some(type => ['number','integer'].includes(type)) ? 0 : '' } };
}
export function WorkflowConditionEditor({ value, variables, onChange, depth = 0 }: { value: WorkflowExpression; variables: readonly WorkflowGraphVariable[]; onChange: (value: WorkflowExpression) => void; depth?: number }) {
  if (depth > 8) return <p>此条件层级较深，请使用 AI 助手简化后再编辑。</p>;
  if (value.op === 'and' || value.op === 'or') return <div className="oxa-condition-group"><Space><Select aria-label="条件组合方式" value={value.op} options={[{ value: 'and',label: '全部满足' },{ value: 'or',label: '任一满足' }]} onChange={op => onChange({ ...value,op })} /><Button size="small" disabled={value.values.length >= 16} onClick={() => onChange({ ...value,values: [...value.values,defaultWorkflowCondition(variables)] })}>添加条件</Button></Space>
    {value.values.map((child,index) => <div key={index}><WorkflowConditionEditor value={child} variables={variables} depth={depth + 1} onChange={child => onChange({ ...value,values: value.values.map((item,i) => i === index ? child : item) })} />{value.values.length > 1 && <Button size="small" type="text" danger onClick={() => onChange({ ...value,values: value.values.filter((_,i) => i !== index) })}>删除条件</Button>}</div>)}</div>;
  if (value.op === 'not' || value.op === 'exists') return <div className="oxa-condition-group"><Select aria-label="条件否定或存在判断" value={value.op} options={[{ value: 'not',label: '不满足' },{ value: 'exists',label: '存在' }]} onChange={op => onChange({ ...value,op })} /><WorkflowConditionEditor value={value.value} variables={variables} onChange={child => onChange({ ...value,value: child })} depth={depth + 1} /></div>;
  if (value.op === 'path') return <Select aria-label="已有变量" style={{ width: '100%' }} value={value.path} options={variables.map(item => ({ value: item.path,label: item.label }))} onChange={path => onChange({ op: 'path',path })} />;
  if (!('left' in value)) return <Space><span>固定条件：{value.op === 'literal' ? String(value.value) : ''}</span><Button onClick={() => onChange(defaultWorkflowCondition(variables))}>改为变量判断</Button></Space>;
  const leftPath = value.left.op === 'path' ? value.left.path : undefined;
  const variable = variables.find(item => item.path === leftPath);
  const current = value.right.op === 'literal' ? value.right.value : undefined;
  const number = variable?.type.split(',').some(type => ['number','integer'].includes(type));
  const setLiteral = (literal: unknown) => onChange({ ...value,right: { op: 'literal',value: literal } });
  return <div className="oxa-condition-row"><Select aria-label="判断变量" showSearch optionFilterProp="label" value={value.left.op === 'path' ? value.left.path : undefined} options={variables.map(item => ({ value: item.path,label: `${item.label} · ${variableTypeLabel(item)}` }))} onChange={path => {
    const type = variables.find(item => item.path === path)?.type.split(',').find(type => type !== 'null'); onChange({ op: 'eq',left: { op: 'path',path },right: { op: 'literal',value: ['number','integer'].includes(type || '') ? 0 : type === 'boolean' ? false : '' } });
  }} /><Select aria-label="条件运算符" value={value.op} options={comparison.filter(item => !['gt','gte','lt','lte'].includes(item.value) || number || variable?.type.split(',').includes('string'))} onChange={op => onChange({ ...value,op: op as typeof value.op })} />
    {value.op === 'in' ? <Select aria-label="匹配范围" mode="tags" value={Array.isArray(current) ? current.map(String) : []} onChange={values => setLiteral(number ? values.map(Number) : values)} /> : value.right.op === 'path' ? <Select aria-label="比较变量" value={value.right.path} options={variables.filter(item => item.type === variable?.type).map(item => ({ value: item.path,label: item.label }))} onChange={path => onChange({ ...value,right: { op: 'path',path } })} /> : number ? <InputNumber aria-label="比较值" value={typeof current === 'number' ? current : null} onChange={setLiteral} /> : variable?.type.split(',').includes('boolean') ? <Switch aria-label="比较值" checked={current === true} onChange={setLiteral} /> : <Input aria-label="比较值" value={typeof current === 'string' ? current : ''} onChange={event => setLiteral(event.target.value)} />}
    <Button size="small" type="text" onClick={() => onChange({ op: 'and',values: [value,defaultWorkflowCondition(variables)] })}>添加组合</Button></div>;
}
