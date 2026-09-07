import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Segmented, Select, Space } from 'antd';
import { useEffect, useState } from 'react';
import type { DataQueryOperator, DataWhere } from 'openxiangda-contracts/browser';
import { SurfaceFilterControl, type SurfaceField } from './SurfaceFields';

const labels: Partial<Record<DataQueryOperator, string>> = {
  eq: '等于', neq: '不等于', contains: '包含', startsWith: '开头是', endsWith: '结尾是',
  gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', has: '包含', hasAny: '包含任一', hasAll: '包含全部',
  overlaps: '范围重叠', containedBy: '处于范围内', jsonContains: '包含', isEmpty: '为空', isNotEmpty: '不为空',
};
export function filterOperators(field: SurfaceField): DataQueryOperator[] {
  const type = field.type;
  if (type === 'subtable') return [];
  if (['file', 'image', 'signature'].includes(type)) return ['isEmpty', 'isNotEmpty'];
  if (['json', 'address', 'location'].includes(type)) return ['jsonContains', 'isEmpty', 'isNotEmpty'];
  if (type.endsWith('-range')) return ['overlaps', 'contains', 'containedBy', 'isEmpty'];
  if (type.startsWith('cascade.')) return type.endsWith('multiple') ? ['hasAny', 'hasAll', 'isEmpty', 'isNotEmpty'] : ['has', 'isEmpty', 'isNotEmpty'];
  if (type.endsWith('.multiple')) return ['hasAny', 'hasAll', 'isEmpty', 'isNotEmpty'];
  if (type.startsWith('number.') || ['date', 'time', 'datetime'].includes(type)) return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty'];
  if (type === 'boolean' || type === 'uuid') return ['eq', 'neq', 'isEmpty'];
  if (type === 'serial-number') return ['eq', 'neq', 'contains', 'startsWith'];
  if (type.startsWith('text.')) return ['contains', 'eq', 'neq', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'];
  return ['eq', 'neq', 'isEmpty', 'isNotEmpty'];
}
export function conditionCount(node?: DataWhere): number {
  if (!node) return 0;
  if ('and' in node) return node.and.reduce((n, item) => n + conditionCount(item), 0);
  if ('or' in node) return node.or.reduce((n, item) => n + conditionCount(item), 0);
  if ('not' in node) return conditionCount(node.not);
  return 1;
}
/** Reject the whole stale tree so removing an inaccessible branch cannot broaden it. */
export function usableConditions(node: DataWhere | undefined, fields: SurfaceField[], depth = 0): boolean {
  if (!node || typeof node !== 'object' || depth > 3 || conditionCount(node) > 40) return false;
  if ('and' in node || 'or' in node) {
    const children = 'and' in node ? node.and : node.or;
    return Array.isArray(children) && children.length > 0 && children.every(item => usableConditions(item, fields, depth + 1));
  }
  if (!('field' in node)) return false;
  const field = fields.find(item => item.key === node.field);
  return Boolean(field && filterOperators(field).includes(node.operator) &&
    (node.operator === 'isEmpty' || node.operator === 'isNotEmpty' ||
      (node.value !== undefined && node.value !== null && node.value !== '' && (!Array.isArray(node.value) || node.value.length > 0))));
}
export function ResourceAdvancedFilter({ open, fields, value, resourceCode, onClose, onApply }: {
  open: boolean; fields: SurfaceField[]; value?: DataWhere; resourceCode: string;
  onClose(): void; onApply(value?: DataWhere): void;
}) {
  const [draft, setDraft] = useState<DataWhere>({ and: [] });
  const [error, setError] = useState(false);
  useEffect(() => { if (open) { setDraft(value || { and: [] }); setError(false); } }, [open]);
  const allowed = fields.filter(field => filterOperators(field).length > 0);
  const fresh = (): DataWhere => ({ field: allowed[0]?.key || '', operator: allowed[0] ? filterOperators(allowed[0])[0]! : 'eq' });
  const group = (node: DataWhere, change: (node: DataWhere) => void, depth: number): React.ReactNode => {
    const logic = 'or' in node ? 'or' : 'and';
    const children = 'or' in node ? node.or : 'and' in node ? node.and : [node];
    return <div className="oxa-condition-group">
      <div className="oxa-condition-heading">
        <Segmented aria-label="条件关系" value={logic} options={[{ label: '满足全部', value: 'and' }, { label: '满足任一', value: 'or' }]}
          onChange={value => change(value === 'or' ? { or: children } : { and: children })} />
        <Space><Button aria-label="添加条件" size="small" disabled={conditionCount(draft) >= 40 || !allowed.length} icon={<PlusOutlined />}
          onClick={() => change({ [logic]: [...children, fresh()] } as DataWhere)}>添加条件</Button>
          <Button size="small" disabled={depth >= 2 || conditionCount(draft) >= 40 || !allowed.length}
            onClick={() => change({ [logic]: [...children, { and: [fresh()] }] } as DataWhere)}>添加分组</Button></Space>
      </div>
      {children.map((child, index) => {
        const update = (next: DataWhere) => change({ [logic]: children.map((item, i) => i === index ? next : item) } as DataWhere);
        const remove = <Button aria-label={'field' in child ? '删除条件' : '删除分组'} type="text" danger icon={<DeleteOutlined />}
          onClick={() => change({ [logic]: children.filter((_, i) => i !== index) } as DataWhere)} />;
        if (!('field' in child)) return <div key={index} className="oxa-condition-nested">{group(child, update, depth + 1)}{remove}</div>;
        const field = allowed.find(item => item.key === child.field);
        return <div className="oxa-condition-row" key={index}>
          <Select virtual={false} aria-label="筛选字段" showSearch={{ optionFilterProp: 'label' }} value={child.field} options={allowed.map(field => ({ value: field.key, label: field.label }))}
            onChange={key => update({ field: key, operator: filterOperators(allowed.find(field => field.key === key)!)[0]! })} />
          <Select virtual={false} aria-label="条件运算" value={child.operator} options={field ? filterOperators(field).map(value => ({ value, label: labels[value] })) : []}
            onChange={operator => update({ field: child.field, operator, ...(!['isEmpty', 'isNotEmpty'].includes(operator) ? { value: child.value } : {}) })} />
          <div className="oxa-condition-value">{field && !['isEmpty', 'isNotEmpty'].includes(child.operator) && <SurfaceFilterControl
            field={field} resourceCode={resourceCode} value={child.value} onChange={value => update({ ...child, value })} />}</div>{remove}
        </div>;
      })}
    </div>;
  };
  return <Modal title="筛选" open={open} width={880} onCancel={onClose} footer={null} destroyOnHidden>
    {error && <Alert type="error" showIcon title="请补全条件，或删除不需要的空条件分组。" />}
    {group(draft, setDraft, 0)}
    <div className="oxa-settings-actions"><Button onClick={() => setDraft({ and: [] })}>清空</Button>
      <Button type="primary" onClick={() => {
        const empty = ('and' in draft && draft.and.length === 0) || ('or' in draft && draft.or.length === 0);
        if (!empty && !usableConditions(draft, allowed)) { setError(true); return; }
        onApply(empty ? undefined : draft); onClose();
      }}>应用筛选</Button></div>
  </Modal>;
}
