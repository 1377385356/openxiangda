import type { DataFieldOption, DataFieldSurface, LabeledValue } from 'openxiangda-contracts/browser';
import { useMemo, useState } from 'react';
import { Button, CheckList, SearchBar } from '../../mobile';
import { cascadeControlValue, cascadeStoredValue, type CascadeStoredValue } from './cascade-value';
import { MobileSelectionField, MobileSelectionPanel } from './MobileSelection';

interface Props {
  field: DataFieldSurface;
  value?: CascadeStoredValue;
  onChange?: (value: CascadeStoredValue | undefined) => void;
  disabled?: boolean;
  id?: string;
}
const pathKey = (path: Array<{ value: string }>) => JSON.stringify(path.map(item => item.value));
const pathLabel = (path: Array<{ label: string }>) => path.map(item => item.label).join(' / ');

export function MobileCascadeField(props: Props) {
  const paths = props.value ? (props.field.type === 'cascade.multiple' ? props.value as LabeledValue[][] : [props.value as LabeledValue[]]) : [];
  return <MobileSelectionField id={props.id} title={`选择${props.field.label}`} placeholder={`请选择${props.field.label}`}
    disabled={props.disabled} labels={paths.map(pathLabel)}>
    {close => <CascadeSelection {...props} onClose={close} />}
  </MobileSelectionField>;
}

function CascadeSelection({ field, value, onChange, onClose }: Props & { onClose: () => void }) {
  const multiple = field.type === 'cascade.multiple';
  const [selected, setSelected] = useState<LabeledValue[][]>(() => value ? multiple ? value as LabeledValue[][] : [value as LabeledValue[]] : []);
  const [path, setPath] = useState<DataFieldOption[]>(() => {
    const initial = !multiple && value ? value as LabeledValue[] : [];
    const result: DataFieldOption[] = [];
    let options = field.options || [];
    for (const part of initial?.slice(0, -1) || []) {
      const option = options.find(item => item.value === part.value);
      if (!option) break;
      result.push(option); options = option.children || [];
    }
    return result;
  });
  const [keyword, setKeyword] = useState('');
  const allLeaves = useMemo(() => {
    const leaves: DataFieldOption[][] = [];
    const walk = (options: DataFieldOption[], parents: DataFieldOption[]) => {
      for (const item of options) {
        const next = [...parents, item];
        if (item.children?.length) walk(item.children, next); else leaves.push(next);
      }
    };
    walk(field.options || [], []);
    return leaves;
  }, [field.options]);
  const children = path.at(-1)?.children || field.options || [];
  const query = keyword.trim();
  const leaves = query ? allLeaves.filter(item => pathLabel(item).includes(query))
    : children.filter(item => !item.children?.length).map(item => [...path, item]);
  const known = new Map([...selected, ...leaves].map(item => [pathKey(item), item]));

  return <MobileSelectionPanel hierarchy={!multiple} title={`选择${field.label}`} selected={selected.map(item => ({ value: pathKey(item), label: pathLabel(item) }))}
    onClose={onClose} onClear={() => setSelected([])} onRemove={key => setSelected(current => current.filter(item => pathKey(item) !== key))}
    onConfirm={() => {
      onChange?.(cascadeStoredValue(field.options || [], cascadeControlValue(multiple ? selected : selected[0], multiple), multiple));
      onClose();
    }}>
    {(multiple || allLeaves.length > 8) && <SearchBar aria-label={`搜索${field.label}`} placeholder="搜索选项或路径" value={keyword} onChange={setKeyword} />}
    {!query && <>
      <nav className="oxa-mobile-selection-breadcrumb" aria-label="选项路径">
        <Button fill="none" size="small" onClick={() => setPath([])}>首页</Button>
        {path.map((item, index) => <Button fill="none" size="small" key={index} onClick={() => setPath(current => current.slice(0, index + 1))}>› {item.label}</Button>)}
      </nav>
      {children.filter(item => item.children?.length).map(item => <Button block fill="none" key={item.value}
        className="oxa-mobile-selection-nav-row" aria-label={`进入${item.label}`} onClick={() => setPath(current => [...current, item])}>
        <span>{item.label}</span><span aria-hidden="true">›</span>
      </Button>)}
    </>}
    <CheckList multiple={multiple} value={selected.map(pathKey)} onChange={keys => setSelected(keys.flatMap(key => known.has(String(key)) ? [known.get(String(key))!] : []))}>
      {leaves.map(item => <CheckList.Item key={pathKey(item)} value={pathKey(item)} description={query ? pathLabel(item.slice(0, -1)) : undefined}><span>{item.at(-1)!.label}</span></CheckList.Item>)}
    </CheckList>
    {(query ? !leaves.length : !children.length) && <p className="oxa-mobile-selection-hint">暂无可选数据</p>}
  </MobileSelectionPanel>;
}
