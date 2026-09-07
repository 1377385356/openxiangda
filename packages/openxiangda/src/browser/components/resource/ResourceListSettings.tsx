import { ArrowDownOutlined, ArrowUpOutlined, HolderOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Segmented, Tooltip } from 'antd';
import { useState } from 'react';
export type ListDensity = 'small' | 'middle' | 'large';
export interface DisplayColumn { key: string; visible: boolean; fixed?: 'left' }
export interface ListDisplaySettings { columns: DisplayColumn[]; density: ListDensity }
export function moveListItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item!); return next;
}
export function ResourceListSettings({ columns, value, disabled, onChange, onReset }: {
  columns: Array<{ key: string; label: string }>; value: ListDisplaySettings; disabled?: boolean;
  onChange(value: ListDisplaySettings): void; onReset(): void;
}) {
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(-1);
  const label = (key: string) => columns.find(item => item.key === key)?.label || '';
  const shown = value.columns.filter(item => label(item.key).includes(search.trim()));
  const checked = shown.filter(item => item.visible).length;
  const patch = (key: string, change: Partial<DisplayColumn>) => onChange({ ...value, columns: value.columns.map(item => item.key === key ? { ...item, ...change } : item) });
  const move = (from: number, to: number) => onChange({ ...value, columns: moveListItem(value.columns, from, to) });
  return <section className="oxa-columns-panel" aria-label="显示列设置">
    <h3>显示列</h3><Input aria-label="查找显示列" placeholder="搜索字段" value={search} allowClear onChange={e => setSearch(e.target.value)} />
    <Checkbox disabled={disabled} checked={checked === shown.length && shown.length > 0} indeterminate={checked > 0 && checked < shown.length}
      onChange={e => onChange({ ...value, columns: value.columns.map(item => shown.includes(item) ? { ...item, visible: e.target.checked } : item) })}>全选 {checked}/{shown.length}</Checkbox>
    <div className="oxa-column-options">{shown.map(item => {
      const index = value.columns.indexOf(item);
      return <div className="oxa-column-option" key={item.key} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); move(dragging, index); setDragging(-1); }}>
        <Checkbox disabled={disabled} checked={item.visible} onChange={e => patch(item.key, { visible: e.target.checked })}>{label(item.key)}</Checkbox>
        <Tooltip title={item.fixed ? '取消冻结' : '冻结列'}><Button type="text" size="small" disabled={disabled}
          aria-label={`${item.fixed ? '取消冻结' : '冻结'}${label(item.key)}`} icon={item.fixed ? <PushpinFilled /> : <PushpinOutlined />}
          onClick={() => patch(item.key, { fixed: item.fixed ? undefined : 'left' })} /></Tooltip>
        <Button className="oxa-column-move" type="text" size="small" disabled={disabled || index === 0} aria-label={`上移${label(item.key)}`} icon={<ArrowUpOutlined />} onClick={() => move(index, index - 1)} />
        <Button className="oxa-column-move" type="text" size="small" disabled={disabled || index === value.columns.length - 1} aria-label={`下移${label(item.key)}`} icon={<ArrowDownOutlined />} onClick={() => move(index, index + 1)} />
        <span draggable={!disabled} onDragStart={e => { setDragging(index); e.dataTransfer.setData('text/plain', item.key); }} onDragEnd={() => setDragging(-1)}
          className="oxa-drag-handle" aria-label={`拖动${label(item.key)}`}><HolderOutlined /></span>
      </div>;
    })}</div>
    <div className="oxa-list-settings-density"><span>表格密度</span><Segmented disabled={disabled} value={value.density}
      options={[{ label: '紧凑', value: 'small' }, { label: '标准', value: 'middle' }, { label: '宽松', value: 'large' }]}
      onChange={density => onChange({ ...value, density: density as ListDensity })} /></div>
    <Button type="link" disabled={disabled} onClick={onReset}>恢复默认</Button>
  </section>;
}
