import dayjs, { type Dayjs } from 'dayjs';
import type { DataFieldSurface, DataResourceSurface } from 'openxiangda-contracts/browser';

function dayjsValue(value: unknown): Dayjs | undefined {
  return dayjs.isDayjs(value) ? value : undefined;
}

function dateTimeForForm(value: unknown) {
  return dayjsValue(value) || (value ? dayjs(String(value)) : undefined);
}

function timeForForm(value: unknown) {
  return dayjsValue(value) || (value ? dayjs(`2000-01-01T${String(value)}`) : undefined);
}

function rangeForForm(value: unknown, kind: 'date' | 'datetime') {
  if (Array.isArray(value) && value.length === 2) {
    const start = dateTimeForForm(value[0]);
    const end = dateTimeForForm(value[1]);
    return start && end ? [start, end] : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const range = value as { start?: unknown; end?: unknown };
  if (!range.start || !range.end) return undefined;
  return kind === 'date'
    ? [dayjs(String(range.start)), dayjs(String(range.end))]
    : [dateTimeForForm(range.start), dateTimeForForm(range.end)];
}

function rangeValue(value: unknown) {
  return Array.isArray(value) && value.length === 2
    ? [dayjsValue(value[0]), dayjsValue(value[1])] as const
    : undefined;
}

export function rangeValueValidationMessage(
  field: DataFieldSurface,
  value: unknown
) {
  if (field.type !== 'date-range' && field.type !== 'datetime-range') {
    return undefined;
  }
  if (field.rangeBoundary !== 'closed' && field.rangeBoundary !== 'half-open') {
    return '范围字段缺少有效的边界协议';
  }
  const values = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? [(value as { start?: unknown }).start, (value as { end?: unknown }).end]
      : [];
  if (!values[0] || !values[1]) return undefined;
  const start = dayjsValue(values[0]) || dayjs(String(values[0]));
  const end = dayjsValue(values[1]) || dayjs(String(values[1]));
  if (!start.isValid() || !end.isValid()) return '范围起止值无效';
  const invalid = field.rangeBoundary === 'half-open'
    ? !start.isBefore(end)
    : start.isAfter(end);
  return invalid
    ? field.rangeBoundary === 'half-open'
      ? '半开区间的结束值必须晚于开始值'
      : '闭区间的结束值不能早于开始值'
    : undefined;
}

export function fieldValueForForm(field: DataFieldSurface | undefined, value: unknown) {
  switch (field?.type) {
    case 'date':
    case 'datetime':
      return dateTimeForForm(value);
    case 'time':
      return timeForForm(value);
    case 'date-range':
      return rangeForForm(value, 'date');
    case 'datetime-range':
      return rangeForForm(value, 'datetime');
    default:
      return value;
  }
}

export function fieldValueForData(field: DataFieldSurface | undefined, value: unknown) {
  if (value === undefined || value === null) return value;
  const scalar = dayjsValue(value);
  switch (field?.type) {
    case 'date':
      return scalar?.format('YYYY-MM-DD') ?? value;
    case 'time':
      return scalar?.format(field.timePrecision === 'minute' ? 'HH:mm' : 'HH:mm:ss') ?? value;
    case 'datetime':
      return scalar?.toISOString() ?? value;
    case 'date-range': {
      const range = rangeValue(value);
      return range?.[0] && range[1]
        ? { start: range[0].format('YYYY-MM-DD'), end: range[1].format('YYYY-MM-DD') }
        : value;
    }
    case 'datetime-range': {
      const range = rangeValue(value);
      return range?.[0] && range[1]
        ? { start: range[0].toISOString(), end: range[1].toISOString() }
        : value;
    }
    default:
      return value;
  }
}

export function normalizeRecordForForm(
  record: Record<string, unknown>,
  surface: DataResourceSurface
) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      fieldValueForForm(surface.fields[key], value),
    ])
  );
}

export function normalizeFormValues(
  values: Record<string, unknown>,
  surface: DataResourceSurface
) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      fieldValueForData(surface.fields[key], value),
    ])
  );
}
