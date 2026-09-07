import { Button, CheckList, Checkbox, Radio, Rate, Input, Popup, SearchBar, TextArea } from '../../mobile';
import { MobileFieldTrigger } from './MobileFieldLayout';
import { CheckOutlined } from '@ant-design/icons';
export { MobileDateTimeField } from './MobileDateTimeField';
import type { DataFieldSurface, LabeledValue } from 'openxiangda-contracts/browser';
import { useEffect, useRef, useState } from 'react';


export interface FieldProps {
  field: DataFieldSurface;
  disabled?: boolean;
  id?: string;
  value?: unknown;
  onChange?: (value: unknown) => void;
}

export function MobileTextField({ field, disabled, id, value, onChange }: FieldProps) {
  const props = {
    id, disabled, 'aria-label': field.label,
    maxLength: field.maxLength,
    value: value == null ? '' : String(value),
    onChange, clearable: !disabled,
    placeholder: field.widget === 'readonly' ? '自动生成' : '请输入',
  };
  return field.widget === 'textarea'
    ? <TextArea {...props} autoSize={{ minRows: 3, maxRows: 8 }} showCount={Boolean(field.maxLength)} />
    : <Input {...props} readOnly={field.widget === 'readonly'} type={field.widget === 'email' ? 'email' : field.widget === 'phone' ? 'tel' : 'text'} />;
}

export function MobileNumberField({ field, disabled, id, value, onChange }: FieldProps) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => { setDraft(value == null ? '' : String(value)); }, [value]);
  return <div className="oxa-mobile-number-field">
    {field.widget === 'money' && <span aria-hidden="true">¥</span>}
    <Input id={id} aria-label={field.label} disabled={disabled} inputMode={field.type === 'number.integer' ? 'numeric' : 'decimal'}
      placeholder={`请输入${field.label}`} value={draft} clearable={!disabled}
      onChange={text => {
        setDraft(text);
        const number = Number(text);
        // Keep incomplete input visible and invalid instead of submitting the previous value.
        onChange?.(text.trim() === '' ? null : Number.isFinite(number) ? number : text);
      }} />
    {field.widget === 'percent' && <span aria-hidden="true">%</span>}
  </div>;
}

export function MobileBooleanField({ field, disabled, checked, onChange }: Omit<FieldProps, 'value'> & { checked?: boolean }) {
  return <div className="oxa-mobile-inline-options" role="radiogroup" aria-label={field.label}>
    {[true, false].map(value => <Radio key={String(value)} checked={checked === value} disabled={disabled}
      onChange={() => onChange?.(value)}>{value ? '是' : '否'}</Radio>)}
    {typeof checked !== 'boolean' && <span>未选择</span>}
  </div>;
}

function optionValues(value: unknown): LabeledValue[] {
  return (Array.isArray(value) ? value : value ? [value] : []) as LabeledValue[];
}

/** A touch selection sheet with a local draft: dismissing it never changes the form. */
export function MobileOptionField({ field, disabled, id, value, onChange }: FieldProps) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState<string[]>([]);
  const selected = optionValues(value);
  const options = field.options || [];
  const multiple = field.type.endsWith('.multiple');
  const commit = (keys: string[]) => {
    const next = options.filter(item => keys.includes(item.value)).map(({label, value}) => ({label, value}));
    onChange?.(multiple ? next : next[0] ?? null);
  };
  if (field.widget === 'radio' || field.widget === 'checkbox') return <div className="oxa-mobile-inline-options" role={multiple ? 'group' : 'radiogroup'} aria-label={field.label}>
    {options.map(item => multiple
      ? <Checkbox key={item.value} disabled={disabled} icon={checked => <MobileOptionIcon checked={checked} />} checked={selected.some(value => value.value === item.value)} onChange={checked => commit(checked ? [...selected.map(value => value.value), item.value] : selected.filter(value => value.value !== item.value).map(value => value.value))}>{item.label}</Checkbox>
      : <Radio key={item.value} disabled={disabled} icon={checked => <MobileOptionIcon checked={checked} radio />} checked={selected[0]?.value === item.value} onChange={() => commit([item.value])}>{item.label}</Radio>)}
  </div>;
  return <div ref={root} className="oxa-mobile-choice-field">
    <MobileFieldTrigger id={id} title={`选择${field.label}`} value={selected.map(item => item.label).join('、')}
      disabled={disabled} onClear={() => onChange?.(multiple ? [] : null)} onClick={() => {
        setDraft(selected.map(item => item.value)); setKeyword(''); setOpen(true);
      }} />
    <Popup visible={open} position="bottom" getContainer={() => root.current!} onMaskClick={() => setOpen(false)}
      bodyClassName="oxa-mobile-field-sheet" destroyOnClose>
      <section role="dialog" aria-label={`选择${field.label}`} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }}>
        <SearchBar aria-label={`搜索${field.label}`} value={keyword} onChange={setKeyword} placeholder="搜索" />
        <div className="oxa-mobile-sheet-content">
          <CheckList extra={multiple ? checked => <MobileOptionIcon checked={checked} /> : undefined} className={multiple ? "is-multiple" : undefined} multiple={multiple} value={draft} onChange={keys => setDraft(keys.map(String))}>
            {options.filter(item => item.label.includes(keyword)).map(item => <CheckList.Item key={item.value} value={item.value}>{item.label}</CheckList.Item>)}
          </CheckList>
        </div>
        {multiple && <div className="oxa-mobile-sheet-count">当前已选中 <span>{draft.length}</span> 项</div>}
        <footer className="oxa-mobile-sheet-actions">
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button color="primary" onClick={() => {
            const byValue = new Map([...selected, ...options].map(item => [item.value, { label: item.label, value: item.value }]));
            const next = draft.flatMap(key => byValue.has(key) ? [byValue.get(key)!] : []);
            onChange?.(multiple ? next : next[0] ?? null); setOpen(false);
          }}>确定</Button>
        </footer>
      </section>
    </Popup>
  </div>;
}

function MobileOptionIcon({ checked, radio = false }: { checked: boolean; radio?: boolean }) {
  return <span aria-hidden="true" className={`oxa-mobile-option-icon${checked ? ' is-checked' : ''}${radio ? ' is-radio' : ''}`}>{checked && (radio ? <i /> : <CheckOutlined />)}</span>;
}


export function MobileRatingField({ field, disabled, value, onChange }: FieldProps) {
  return <Rate aria-label={field.label} readOnly={disabled} value={Number(value) || 0} onChange={onChange} />;
}
