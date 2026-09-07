import {
  DatePicker,
  TimePicker,
  Typography,
} from 'antd';
import type { DataFieldSurface } from 'openxiangda-contracts/browser';
import { fieldValueForData, fieldValueForForm } from './field-form-codec';

function rangeEndPlaceholder(field: DataFieldSurface) {
  if (field.rangeBoundary === 'closed') return `结束${field.label}（含）`;
  if (field.rangeBoundary === 'half-open') return `结束${field.label}（不含）`;
  throw new Error('OPENXIANGDA_RANGE_BOUNDARY_INVALID');
}

export function DateTimeField({
  field,
  disabled,
  mobile = false,
  value,
  onChange,
}: {
  field: DataFieldSurface;
  disabled?: boolean;
  mobile?: boolean;
  value?: unknown;
  onChange?: (value: unknown) => void;
}) {
  const className = mobile ? 'oxa-mobile-date-time-field' : undefined;
  const formValue = fieldValueForForm(field, value) as never;
  const emit = (next: unknown) => onChange?.(
    next === null ? undefined : fieldValueForData(field, next)
  );
  switch (field.type) {
    case 'time': {
      const format = field.timePrecision === 'minute' ? 'HH:mm' : 'HH:mm:ss';
      return (
        <TimePicker
          className={className}
          disabled={disabled}
          format={format}
          needConfirm={false}
          onChange={emit}
          placeholder={`请选择${field.label}`}
          showSecond={field.timePrecision !== 'minute'}
          style={{ width: '100%' }}
          value={formValue}
        />
      );
    }
    case 'datetime':
      return (
        <DatePicker
          className={className}
          disabled={disabled}
          format="YYYY-MM-DD HH:mm:ss"
          onChange={emit}
          placeholder={`请选择${field.label}`}
          showTime={{ format: 'HH:mm:ss' }}
          style={{ width: '100%' }}
          value={formValue}
        />
      );
    case 'date-range':
      return (
        <DatePicker.RangePicker
          className={className}
          disabled={disabled}
          format="YYYY-MM-DD"
          onChange={emit}
          placeholder={[`开始${field.label}`, rangeEndPlaceholder(field)]}
          style={{ width: '100%' }}
          value={formValue}
        />
      );
    case 'datetime-range':
      return (
        <DatePicker.RangePicker
          className={className}
          disabled={disabled}
          format="YYYY-MM-DD HH:mm:ss"
          onChange={emit}
          placeholder={[`开始${field.label}`, rangeEndPlaceholder(field)]}
          showTime={{ format: 'HH:mm:ss' }}
          style={{ width: '100%' }}
          value={formValue}
        />
      );
    case 'date':
    default:
      return (
        <DatePicker
          className={className}
          disabled={disabled}
          format="YYYY-MM-DD"
          onChange={emit}
          placeholder={`请选择${field.label}`}
          style={{ width: '100%' }}
          value={formValue}
        />
      );
  }
}

export function DateTimeValueDisplay({
  field,
  value,
}: {
  field: DataFieldSurface;
  value: unknown;
}) {
  if (field.type === 'date-range' || field.type === 'datetime-range') {
    const range = value as { start?: unknown; end?: unknown };
    const suffix = field.rangeBoundary === 'closed'
      ? '（含结束）'
      : field.rangeBoundary === 'half-open'
        ? '（不含结束）'
        : '';
    return <>{range?.start && range?.end ? `${range.start} 至 ${range.end}${suffix}` : '-'}</>;
  }
  if (field.type === 'time') {
    const time = String(value);
    return <>{field.timePrecision === 'minute' ? time.slice(0, 5) : time}</>;
  }
  if (field.type === 'datetime') {
    const parsed = new Date(String(value));
    return <>{Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('zh-CN', { hour12: false })}</>;
  }
  return <Typography.Text>{String(value)}</Typography.Text>;
}

export function DateTimeFilter({
  field,
  value,
  onChange,
}: {
  field: DataFieldSurface;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const formValue = fieldValueForForm(field, value) as never;
  const emit = (next: unknown) => onChange(
    next === null ? undefined : fieldValueForData(field, next)
  );
  if (field.type === 'time') {
    const format = field.timePrecision === 'minute' ? 'HH:mm' : 'HH:mm:ss';
    return (
      <TimePicker
        allowClear
        format={format}
        onChange={emit}
        placeholder={`筛选${field.label}`}
        showSecond={field.timePrecision !== 'minute'}
        value={formValue}
      />
    );
  }
  if (field.type === 'date-range' || field.type === 'datetime-range') {
    const datetime = field.type === 'datetime-range';
    return (
      <DatePicker.RangePicker
        allowClear
        format={datetime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'}
        onChange={emit}
        placeholder={[`开始${field.label}`, rangeEndPlaceholder(field)]}
        showTime={datetime ? { format: 'HH:mm:ss' } : false}
        value={formValue}
      />
    );
  }
  const datetime = field.type === 'datetime';
  return (
    <DatePicker
      allowClear
      format={datetime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'}
      onChange={emit}
      placeholder={`筛选${field.label}`}
      showTime={datetime ? { format: 'HH:mm:ss' } : false}
      value={formValue}
    />
  );
}
