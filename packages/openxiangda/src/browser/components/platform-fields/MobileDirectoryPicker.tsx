import type { DirectoryEntry } from 'openxiangda-contracts/browser';
import { useCallback, useState } from 'react';
import { Button, CheckList, SearchBar } from '../../mobile';
import { browseDepartmentTree, browseDepartmentUsers, searchDirectory, type DirectoryKind } from '../../platform-client';
import { mobileReferenceSelectorCopy } from '../../selector-copy';
import { directoryEntryFromStored, directoryStoredValueFromEntries, directoryStoredValues, type DirectoryStoredValue } from './directory-value';
import { MobileSelectionField, MobileSelectionPanel, MobileSelectionPageStatus } from './MobileSelection';
import { useMobilePickerPage } from './useMobilePickerPage';

export interface DirectoryPickerProps {
  kind: DirectoryKind;
  value?: DirectoryStoredValue | DirectoryStoredValue[];
  onChange?: (value: DirectoryStoredValue | DirectoryStoredValue[] | undefined) => void;
  multiple?: boolean;
  disabled?: boolean;
  placeholder: string;
  id?: string;
  mobile?: boolean;
}

export function MobileDirectoryPicker(props: DirectoryPickerProps) {
  const copy = mobileReferenceSelectorCopy(props.placeholder);
  return <MobileSelectionField id={props.id} title={copy.title} placeholder={copy.empty}
    disabled={props.disabled} labels={directoryStoredValues(props.value).map(item => item.label)}>
    {close => <DirectorySelection {...props} onClose={close} />}
  </MobileSelectionField>;
}

function DirectorySelection({ kind, value, onChange, multiple = false, placeholder, onClose }: DirectoryPickerProps & { onClose: () => void }) {
  const copy = mobileReferenceSelectorCopy(placeholder);
  const [selected, setSelected] = useState(() => directoryStoredValues(value).map(item => directoryEntryFromStored(kind, item)));
  const [path, setPath] = useState<DirectoryEntry[]>([]);
  const [keyword, setKeyword] = useState('');
  const query = keyword.trim();
  const parent = path.at(-1);
  const parentId = parent?.id;
  const loadDepartments = useCallback((cursor?: string) => browseDepartmentTree({ parentId, cursor }), [parentId]);
  const loadMembers = useCallback((cursor?: string) => browseDepartmentUsers(parentId!, Number(cursor || 1)), [parentId]);
  const loadSearch = useCallback((cursor?: string) => searchDirectory(kind, { keyword: query, cursor }), [kind, query]);
  const departments = useMobilePickerPage({ loadPage: loadDepartments, enabled: !query && parent?.hasChildren !== false });
  const members = useMobilePickerPage({ loadPage: loadMembers, enabled: !query && kind === 'user' && Boolean(parentId) });
  const search = useMobilePickerPage({ loadPage: loadSearch, enabled: query.length >= 2, delay: 300 });

  const choices = (entries: DirectoryEntry[], drill = false) => {
    const rows = [...new Map(entries.map(item => [item.id, item])).values()];
    const known = new Map([...selected, ...rows].map(item => [item.id, item]));
    return <CheckList multiple={multiple} value={selected.map(item => item.id)} onChange={keys => {
      setSelected(keys.flatMap(key => known.has(String(key)) ? [known.get(String(key))!] : []));
    }}>
      {rows.map(item => <div className="oxa-mobile-selection-row" key={item.id}>
        <CheckList.Item value={item.id} disabled={item.selectable === false} aria-disabled={item.selectable === false}
          description={item.description || item.path?.map(part => part.label).join(' / ')}><span>{item.label}</span></CheckList.Item>
        {drill && item.hasChildren && <Button fill="none" aria-label={`进入${item.label}`} onClick={() => setPath(current => [...current, item])}>下级 ›</Button>}
      </div>)}
    </CheckList>;
  };

  return <MobileSelectionPanel title={copy.title} selected={selected.map(item => ({ value: item.id, label: item.label }))}
    onClose={onClose} onClear={() => setSelected([])} onRemove={id => setSelected(current => current.filter(item => item.id !== id))}
    onConfirm={() => { onChange?.(directoryStoredValueFromEntries(selected, multiple)); onClose(); }}>
    <SearchBar aria-label={copy.search} placeholder={copy.search} value={keyword} onChange={setKeyword} />
    {query ? query.length < 2 ? <p className="oxa-mobile-selection-hint">请输入至少 2 个字符搜索</p> : <>
      {choices(search.items)}<MobileSelectionPageStatus page={search} />
    </> : <>
      <nav className="oxa-mobile-selection-breadcrumb" aria-label="部门路径">
        <Button fill="none" size="small" onClick={() => setPath([])}>全部部门</Button>
        {path.map((item, index) => <Button fill="none" size="small" key={item.id} onClick={() => setPath(current => current.slice(0, index + 1))}>› {item.label}</Button>)}
      </nav>
      {kind === 'department' ? <>
        {parent && <><h4>当前部门</h4>{choices([parent])}</>}
        {departments.items.length > 0 && <h4>{parent ? '下级部门' : '选择部门'}</h4>}
        {choices(departments.items, true)}
        <MobileSelectionPageStatus page={departments} emptyText={parent ? '没有下级部门' : '暂无可选部门'} moreText="更多部门" />
      </> : <>
        {departments.items.map(item => <Button key={item.id} block fill="none" className="oxa-mobile-selection-nav-row"
          aria-label={`进入${item.label}`} onClick={() => setPath(current => [...current, item])}>
          <span>{item.label}</span><span aria-hidden="true">›</span>
        </Button>)}
        <MobileSelectionPageStatus page={departments} emptyText={parent ? '' : '暂无可浏览部门，可按姓名搜索'} moreText="更多部门" />
        {parent && <><h4>部门成员</h4>{choices(members.items)}<MobileSelectionPageStatus page={members} emptyText="该部门暂无可选成员" moreText="更多成员" /></>}
      </>}
    </>}
  </MobileSelectionPanel>;
}
