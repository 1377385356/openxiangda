import { ArrowUpOutlined, DeleteOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Segmented, Select } from 'antd';
import { useState } from 'react';
import type { ResourceSort } from '../platform-fields/resource-query';
import { moveListItem } from './ResourceListSettings';
export function ResourceSortSettings({ fields, value, onApply }: {
  fields: Array<{ key: string; label: string }>; value: ResourceSort[]; onApply(value: ResourceSort[]): void;
}) {
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(-1);
  const unused = fields.filter(field => !draft.some(sort => sort.field === field.key));
  return <section className="oxa-sort-panel" aria-label="排序设置"><h3>排序</h3>
    {draft.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未设置排序规则" />}
    {draft.map((sort, index) => <div className="oxa-sort-row" key={sort.field} onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); setDraft(moveListItem(draft, dragging, index)); setDragging(-1); }}>
      <Select virtual={false} aria-label={`第${index + 1}排序字段`} value={sort.field}
        options={fields.filter(field => field.key === sort.field || unused.includes(field)).map(field => ({ value: field.key, label: field.label }))}
        onChange={field => setDraft(draft.map((item, i) => i === index ? { ...item, field } : item))} />
      <Segmented aria-label={`第${index + 1}排序方向`} value={sort.order} options={[{ label: '升序', value: 'asc' }, { label: '降序', value: 'desc' }]}
        onChange={order => setDraft(draft.map((item, i) => i === index ? { ...item, order: order as 'asc' | 'desc' } : item))} />
      <Button type="text" disabled={index === 0} aria-label={`上移第${index + 1}排序`} icon={<ArrowUpOutlined />} onClick={() => setDraft(moveListItem(draft, index, index - 1))} />
      <span className="oxa-drag-handle" draggable onDragStart={e => { setDragging(index); e.dataTransfer.setData('text/plain', sort.field); }} onDragEnd={() => setDragging(-1)}><HolderOutlined /></span>
      <Button type="text" aria-label={`删除第${index + 1}排序`} icon={<DeleteOutlined />} onClick={() => setDraft(draft.filter((_, i) => i !== index))} />
    </div>)}
    <Button aria-label="添加排序规则" type="link" icon={<PlusOutlined />} disabled={!unused.length || draft.length >= 10}
      onClick={() => setDraft([...draft, { field: unused[0]!.key, order: 'asc' }])}>添加排序规则</Button>
    <div className="oxa-settings-actions"><Button aria-label="清空" onClick={() => setDraft([])}>清空</Button><Button aria-label="确定" type="primary" onClick={() => onApply(draft)}>确定</Button></div>
  </section>;
}
