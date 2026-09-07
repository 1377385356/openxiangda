import { Cascader } from 'antd';
import { MobileCascadeField } from './MobileCascadeField';
import type { DataFieldSurface, LabeledValue } from 'openxiangda-contracts/browser';
import {
  cascadeControlValue,
  cascadeStoredValue,
  type CascadeStoredValue,
} from './cascade-value';

export function CascadeField({
  field,
  value,
  onChange,
  disabled,
  mobile,
  id,
}: {
  field: DataFieldSurface;
  value?: CascadeStoredValue;
  onChange?: (value: LabeledValue[] | LabeledValue[][] | undefined) => void;
  disabled?: boolean;
  mobile?: boolean;
  id?: string;
}) {
  if (mobile) return <MobileCascadeField field={field} value={value} onChange={onChange} disabled={disabled} id={id} />;
  const multiple = field.type === 'cascade.multiple';
  return (
    <Cascader
      id={id}
      allowClear
      disabled={disabled}
      maxTagCount="responsive"
      multiple={multiple}
      onChange={(next: unknown) => onChange?.(
        cascadeStoredValue(field.options || [], next, multiple)
      )}
      options={field.options}
      placeholder={`请选择${field.label}`}
      showSearch
      value={cascadeControlValue(value, multiple) as never}
    />
  );
}

export function CascadeValueDisplay({
  value,
  multiple,
}: {
  value: CascadeStoredValue;
  multiple: boolean;
}) {
  const paths = multiple
    ? value as LabeledValue[][]
    : [value as LabeledValue[]];
  return <>{paths.map(path => path.map(item => item.label).join(' / ')).join('；') || '-'}</>;
}
