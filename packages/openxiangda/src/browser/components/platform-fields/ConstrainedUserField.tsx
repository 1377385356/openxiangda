import { CloseOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Checkbox, Empty, Grid, Input, Modal, Space, Spin, Tag } from 'antd';
import type { UserCandidatePage } from 'openxiangda-contracts/browser';
import { useEffect, useRef, useState } from 'react';
import { Button as MobileButton, CheckList, SearchBar } from '../../mobile';
import { MobileSelectionField, MobileSelectionPanel } from './MobileSelection';
import { directoryStoredValues, type DirectoryStoredValue } from './directory-value';
import { queryUserCandidateField, reconcileUserCandidateSelection, userCandidateError,
  type CandidateSelection, type UserCandidateFieldContext } from './user-candidate-context';

export interface ConstrainedUserFieldProps {
  context?: UserCandidateFieldContext;
  unavailableReason?: string;
  value?: DirectoryStoredValue | DirectoryStoredValue[] | null;
  onChange?: (value: DirectoryStoredValue | DirectoryStoredValue[] | null) => void;
  multiple?: boolean;
  disabled?: boolean;
  mobile?: boolean;
  placeholder: string;
  id?: string;
}

/** The constrained field deliberately has no global-directory fallback. */
export function ConstrainedUserField(props: ConstrainedUserFieldProps) {
  const screens = Grid.useBreakpoint();
  const mobile = props.mobile ?? !screens.md;
  const [open, setOpen] = useState(false);
  const values = directoryStoredValues(props.value ?? undefined);
  const clear = () => props.onChange?.(props.multiple ? [] : null);
  const unavailable = props.unavailableReason || (!props.context ? '当前字段缺少选人上下文，请重新打开页面。' : '');
  if (mobile) return <>
    <MobileSelectionField id={props.id} title={props.placeholder} placeholder={props.placeholder}
      disabled={props.disabled || Boolean(unavailable)} labels={values.map(item => item.label)}
      onClear={!props.disabled && values.length ? clear : undefined}>
      {close => <CandidatePanel {...props} mobile onClose={close} />}
    </MobileSelectionField>
    {unavailable && !props.disabled && <p className="oxa-user-candidate-hint" role="status">{unavailable}
      {values.length > 0 && <MobileButton fill="none" size="small" onClick={clear}>清空选择</MobileButton>}</p>}
  </>;
  return <>
    <div className={`oxa-directory-trigger${props.disabled ? ' is-disabled' : ''}`} id={props.id}
      role="button" tabIndex={props.disabled || unavailable ? -1 : 0} aria-label={props.placeholder}
      aria-disabled={props.disabled || Boolean(unavailable)}
      onClick={() => { if (!props.disabled && !unavailable) setOpen(true); }}
      onKeyDown={event => { if (!props.disabled && !unavailable && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
      <UserOutlined />
      <span className="oxa-directory-trigger-values">{values.length ? values.map(item => <Tag key={item.value}
        closable={!props.disabled} onClose={event => {
          event.preventDefault(); event.stopPropagation();
          const next = values.filter(value => value.value !== item.value);
          props.onChange?.(props.multiple ? next : next[0] ?? null);
        }}>{item.label}</Tag>) : <span className="oxa-directory-placeholder">{props.placeholder}</span>}</span>
      <Button type="link" size="small" disabled={props.disabled || Boolean(unavailable)} onClick={event => { event.stopPropagation(); setOpen(true); }}>选择</Button>
    </div>
    {unavailable && !props.disabled && <p className="oxa-user-candidate-hint" role="status">{unavailable}</p>}
    <Modal open={open && !props.disabled} destroyOnHidden title={props.placeholder} footer={null}
      width={760} onCancel={() => setOpen(false)}>
      {open && !props.disabled && <CandidatePanel {...props} onClose={() => setOpen(false)} />}
    </Modal>
  </>;
}

function CandidatePanel({ context, value, multiple = false, mobile, onChange, onClose, placeholder }: ConstrainedUserFieldProps & { onClose: () => void }) {
  const [selected, setSelected] = useState<CandidateSelection[]>(() => directoryStoredValues(value ?? undefined));
  const [keyword, setKeyword] = useState('');
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState<UserCandidatePage>();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const confirmation = useRef(0);
  const selectedRef = useRef(selected);
  const contextRef = useRef(context);
  selectedRef.current = selected;
  contextRef.current = context;
  const contextKey = JSON.stringify(context);
  const query = keyword.trim();
  const cursor = cursors.at(-1);

  useEffect(() => {
    const current = ++generation.current;
    confirmation.current += 1;
    setConfirming(false); setLoading(true); setError(''); setPage(undefined);
    const timer = window.setTimeout(() => {
      if (!contextRef.current) { setError('当前字段缺少选人上下文，请重新打开页面。'); setLoading(false); return; }
      void queryUserCandidateField(contextRef.current, { keyword: query, cursor, selectedIds: selectedRef.current.map(item => item.value) })
        .then(result => {
          if (current !== generation.current) return;
          setPage(result);
          setSelected(items => reconcileUserCandidateSelection(items, result.selected));
        }).catch(reason => { if (current === generation.current) setError(userCandidateError(reason)); })
        .finally(() => { if (current === generation.current) setLoading(false); });
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); generation.current += 1; confirmation.current += 1; };
  }, [contextKey, query, cursor, attempt]);

  const changeKeyword = (next: string) => { setKeyword(next.slice(0, 64)); setCursors([undefined]); };
  const remove = (id: string) => setSelected(items => items.filter(item => item.value !== id));
  const toggle = (item: { value: string; label: string }, checked: boolean) => setSelected(items => {
    if (!checked) return items.filter(value => value.value !== item.value);
    if (!multiple) return [{ ...item, status: 'valid' }];
    return items.some(value => value.value === item.value) || items.length >= 200 ? items : [...items, { ...item, status: 'valid' }];
  });
  const confirm = async () => {
    if (confirming) return;
    const snapshot = selectedRef.current;
    if (!snapshot.length) { onChange?.(multiple ? [] : null); onClose(); return; }
    if (!contextRef.current || loading) return;
    const current = ++confirmation.current;
    setConfirming(true); setError('');
    try {
      const result = await queryUserCandidateField(contextRef.current, { selectedIds: snapshot.map(item => item.value) });
      if (current !== confirmation.current) return;
      const next = reconcileUserCandidateSelection(snapshot, result.selected);
      setSelected(next);
      if (next.some(item => !result.selected.some(checked => checked.value === item.value && checked.status === 'valid'))) {
        return;
      }
      const canonical = next.map(({ value, label }) => ({ value, label }));
      onChange?.(multiple ? canonical : canonical[0] ?? null); onClose();
    } catch (reason) { if (current === confirmation.current) setError(userCandidateError(reason)); }
    finally { if (current === confirmation.current) setConfirming(false); }
  };
  const invalid = selected.filter(item => item.status === 'invalid');
  const limit = multiple && selected.length >= 200;
  const blocked = confirming || loading;
  const statuses = <>
    {error && <div role="alert" className="oxa-user-candidate-hint"><p>{error}</p>{mobile
      ? <MobileButton size="small" disabled={confirming} onClick={() => setAttempt(current => current + 1)}>重试</MobileButton>
      : <Button size="small" disabled={confirming} onClick={() => setAttempt(current => current + 1)}>重试</Button>}</div>}
    {!error && !loading && !page?.items.length && <p className="oxa-user-candidate-hint">{query ? '没有符合搜索条件的人员' : '暂无可选人员'}</p>}
    {invalid.length > 0 && <p role="alert" className="oxa-user-candidate-invalid">已失效，请移除后重选：{invalid.map(item => item.label).join('、')}</p>}
    {limit && <p className="oxa-user-candidate-hint">最多选择 200 人，可移除已选人员后继续选择。</p>}
  </>;
  const next = () => { if (page?.nextCursor) setCursors(values => [...values, page.nextCursor!]); };
  const previous = () => setCursors(values => values.length > 1 ? values.slice(0, -1) : values);
  const selectedIds = new Set(selected.map(item => item.value));

  if (mobile) return <MobileSelectionPanel title={placeholder} selected={selected.map(item => ({ value: item.value, label: `${item.label}${item.status === 'invalid' ? '（已失效）' : ''}` }))}
    disabled={confirming} confirmDisabled={selected.length > 0 && (blocked || invalid.length > 0 || Boolean(error))}
    onClose={onClose} onRemove={remove} onClear={() => setSelected([])} onConfirm={() => void confirm()}>
    <div inert={confirming}><SearchBar aria-label="搜索候选人员" placeholder="搜索候选人员" maxLength={64} value={keyword} onChange={changeKeyword} /></div>
    {loading && <p role="status">加载中…</p>}
    <CheckList multiple={multiple} value={selected.map(item => item.value)} onChange={keys => {
      const ids = new Set(keys.map(String));
      const visible = new Set((page?.items || []).map(item => item.value));
      const kept = selected.filter(item => !visible.has(item.value) || ids.has(item.value));
      const additions = (page?.items || []).filter(item => ids.has(item.value) && !selectedIds.has(item.value)).map(item => ({ ...item, status: 'valid' as const }));
      setSelected(multiple ? [...kept, ...additions].slice(0, 200) : additions.length ? additions.slice(0, 1) : kept.slice(0, 1));
    }}>
      {(page?.items || []).map(item => <CheckList.Item key={item.value} value={item.value}
        disabled={blocked || Boolean(error) || (limit && !selectedIds.has(item.value))} description={item.value}>{item.label}</CheckList.Item>)}
    </CheckList>
    {statuses}
    <div className="oxa-user-candidate-pagination"><MobileButton size="small" disabled={blocked || cursors.length === 1} onClick={previous}>上一页</MobileButton>
      <span>第 {cursors.length} 页</span><MobileButton size="small" disabled={blocked || Boolean(error) || !page?.nextCursor} onClick={next}>下一页</MobileButton></div>
  </MobileSelectionPanel>;

  return <div className="oxa-user-candidate-picker" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
    <div className="oxa-user-candidate-columns"><section aria-label="候选人员">
      <Input aria-label="搜索候选人员" placeholder="搜索候选人员" allowClear maxLength={64} prefix={<SearchOutlined />}
        value={keyword} disabled={confirming} onChange={event => changeKeyword(event.target.value)} />
      <Spin spinning={loading}><div className="oxa-user-candidate-list">{(page?.items || []).map(item => <label className="oxa-user-candidate-row" key={item.value}>
        <Checkbox checked={selectedIds.has(item.value)} disabled={blocked || Boolean(error) || (limit && !selectedIds.has(item.value))}
          onChange={event => toggle(item, event.target.checked)} /><Avatar size={32}>{item.label.slice(0, 1)}</Avatar>
        <span><strong>{item.label}</strong><small title={item.value}>{item.value}</small></span>
      </label>)}</div></Spin>
      {statuses}
      <div className="oxa-user-candidate-pagination"><span>第 {cursors.length} 页</span><Space>
        <Button disabled={blocked || cursors.length === 1} onClick={previous}>上一页</Button>
        <Button disabled={blocked || Boolean(error) || !page?.nextCursor} onClick={next}>下一页</Button>
      </Space></div>
    </section><aside aria-label="已选人员"><div className="oxa-user-candidate-pagination"><strong>已选 {selected.length} 人</strong>
      <Button type="link" disabled={confirming || !selected.length} onClick={() => setSelected([])}>清空</Button></div>
      <div className="oxa-user-candidate-list">{selected.length ? selected.map(item => <div key={item.value} className="oxa-user-candidate-row">
        <span><strong>{item.label}</strong><small title={item.value}>{item.value}</small>
          {item.status === 'invalid' && <Tag color="error">已失效</Tag>}</span>
        <Button aria-label={`移除${item.label}`} type="text" icon={<CloseOutlined />} disabled={confirming} onClick={() => remove(item.value)} />
      </div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无选择" />}</div>
    </aside></div>
    <div className="oxa-user-candidate-footer"><Button disabled={confirming} onClick={onClose}>取消</Button>
      <Button type="primary" loading={confirming} disabled={selected.length > 0 && (loading || invalid.length > 0 || Boolean(error))} onClick={() => void confirm()}>确定{selected.length ? `（${selected.length}）` : ''}</Button></div>
  </div>;
}
