import { useRef, useState, type ReactNode } from 'react';
import { MobileFieldTrigger, MobileSheetHeader } from './MobileFieldLayout';
import { Button, Popup } from '../../mobile';

/** Every opening owns one temporary selection session and its pending reads. */
export function MobileSelectionField({ id, title, placeholder, labels, disabled, children, onClear }: {
  id?: string;
  title: string;
  placeholder: string;
  labels: string[];
  disabled?: boolean;
  onClear?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <div ref={root} className="oxa-mobile-scope oxa-mobile-choice-field">
    <MobileFieldTrigger id={id} title={title} disabled={disabled} value={labels.join('、')} placeholder={placeholder} onClear={onClear} onClick={() => setOpen(true)} />
    <Popup visible={open && !disabled} position="bottom" getContainer={() => root.current!}
      bodyClassName="oxa-mobile-selection-sheet" onMaskClick={close} destroyOnClose
      afterClose={() => root.current?.querySelector<HTMLButtonElement>('.oxa-mobile-field-trigger button')?.focus({ preventScroll: true })}>
      {open && !disabled && <section role="dialog" aria-label={title} aria-modal="true"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); }
          // A search keyboard must not submit the surrounding business form.
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
        }}>
        {children(close)}
      </section>}
    </Popup>
  </div>;
}

export function MobileSelectionPanel({ title, selected, onRemove, onClear, onConfirm, onClose, children, hierarchy = false }: {
  title: string;
  selected: Array<{ value: string; label: string }>;
  onRemove: (value: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
  hierarchy?: boolean;
}) {
  return <>
    {hierarchy ? <MobileSheetHeader onCancel={onClose} onConfirm={onConfirm} /> : <header className="oxa-mobile-sheet-header"><strong>{title}</strong><Button fill="none" onClick={onClose}>关闭</Button></header>}
    {selected.length > 0 && !hierarchy && <div className="oxa-mobile-selection-summary" aria-label="已选项目">
      <span>已选 {selected.length} 项</span>
      <div>{selected.map(item => <Button key={item.value} size="small" aria-label={`移除${item.label}`}
        onClick={() => onRemove(item.value)}>{item.label}<span aria-hidden="true"> ×</span></Button>)}</div>
    </div>}
    <div className="oxa-mobile-selection-content">{children}</div>
    {!hierarchy && <footer className="oxa-mobile-sheet-actions">
      <Button onClick={onClear} disabled={!selected.length}>清空</Button>
      <Button color="primary" onClick={onConfirm}>确定{selected.length ? `（${selected.length}）` : ''}</Button>
    </footer>}
  </>;
}

export function MobileSelectionPageStatus({ page, emptyText = '暂无可选数据', moreText = '加载更多' }: {
  page: { items: unknown[]; loading: boolean; error: string; nextCursor: string | null; retry: () => void; loadMore: () => void };
  emptyText?: string;
  moreText?: string;
}) {
  if (!page.error && !page.loading && !page.nextCursor && (page.items.length > 0 || !emptyText)) return null;
  return <div className="oxa-mobile-selection-status">
    {page.error ? <div role="alert"><p>{page.error}</p><Button size="small" onClick={page.retry}>重试</Button></div>
      : page.loading ? <span role="status">加载中…</span>
        : !page.items.length ? <span>{emptyText}</span> : null}
    {!page.error && page.nextCursor && <Button block fill="none" disabled={page.loading} onClick={page.loadMore}>{moreText}</Button>}
  </div>;
}
