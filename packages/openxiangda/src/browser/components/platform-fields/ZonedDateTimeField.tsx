import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import dayjsGenerateConfig from '@rc-component/picker/lib/generate/dayjs';
import { useEffect, useMemo, useState } from 'react';
import type { DataFieldSurface } from 'openxiangda-contracts/browser';
import { rangeValueValidationMessage } from './field-form-codec';
import { carrierWall, instantText, instantToWall, nowWall, validateDateTimeConstraints,
  wallCarrier, zonedInputResult, type DateTimeConstraints } from './zoned-date-time';

export function ZonedDateTimeField({ field, value, onChange, disabled, mobile, filter,
  timeZone, min, max, minuteStep }: DateTimeConstraints & {
  field: DataFieldSurface; value?: unknown; onChange?: (value: unknown) => void;
  disabled?: boolean; mobile?: boolean; filter?: boolean; timeZone: string;
}) {
  const constraints = validateDateTimeConstraints({ timeZone, min, max, minuteStep });
  const range = field.type === 'datetime-range';
  const Picker = useMemo(() => DatePicker.generatePicker<Dayjs>({
    ...dayjsGenerateConfig,
    getNow: () => wallCarrier(nowWall(timeZone)),
    getFixedDate: text => dayjs.utc(text),
    locale: {
      ...dayjsGenerateConfig.locale,
      parse: (_locale, text, formats) => {
        for (const format of formats) {
          const parsed = dayjs.utc(text, format, true);
          if (parsed.isValid()) return parsed;
        }
        return null;
      },
    },
  }), [timeZone]);
  const toCarrier = (item: unknown) => item == null ? null : wallCarrier(instantToWall(item, timeZone));
  const pair = value as { start?: unknown; end?: unknown } | undefined;
  const canonical = value == null ? '' : range ? JSON.stringify(Array.isArray(value)
    ? value.map(instantText) : [pair?.start, pair?.end]) : instantText(value);
  const parseValue = (): Dayjs | [Dayjs | null, Dayjs | null] | null => value == null ? null : range
    ? [toCarrier(Array.isArray(value) ? value[0] : pair?.start), toCarrier(Array.isArray(value) ? value[1] : pair?.end)]
    : toCarrier(value);
  const [draft, setDraft] = useState(parseValue);
  const [error, setError] = useState<string>();
  useEffect(() => { setDraft(parseValue()); setError(undefined); }, [canonical, timeZone]);
  const emit = (next: Dayjs | (Dayjs | null)[] | null) => {
    setDraft(next as typeof draft);
    if (next === null) { setError(undefined); onChange?.(undefined); return; }
    const values = Array.isArray(next) ? next : [next];
    if (values.some(item => !item)) return;
    const results = values.map(item => zonedInputResult(carrierWall(item!), timeZone, constraints));
    const invalid = results.find(item => item.error)?.error;
    if (invalid) { setError(invalid); return; }
    const output = range ? { start: results[0]!.value, end: results[1]!.value } : results[0]!.value;
    const boundaryError = rangeValueValidationMessage(field, output);
    if (boundaryError) { setError(boundaryError); return; }
    setError(undefined);
    onChange?.(output);
  };
  const format = minuteStep === undefined ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD HH:mm';
  const common = {
    disabled,
    format,
    minDate: min ? toCarrier(min)! : undefined,
    maxDate: max ? toCarrier(max)! : undefined,
    showTime: { format: minuteStep === undefined ? 'HH:mm:ss' : 'HH:mm',
      minuteStep: minuteStep as 1 | undefined, showSecond: minuteStep === undefined },
    showNow: minuteStep === undefined,
    preserveInvalidOnBlur: true,
    status: error ? 'error' as const : undefined,
    className: mobile ? 'oxa-mobile-date-time-field' : undefined,
    style: { width: '100%' },
  };
  if (range && field.rangeBoundary !== 'closed' && field.rangeBoundary !== 'half-open')
    throw new Error('OPENXIANGDA_RANGE_BOUNDARY_INVALID');
  return <div>
    {range ? <Picker.RangePicker {...common} value={draft as [Dayjs | null, Dayjs | null] | null}
      onChange={emit} placeholder={[`开始${field.label}`, `结束${field.label}${field.rangeBoundary === 'closed' ? '（含）' : '（不含）'}`]} /> :
      <Picker {...common} value={draft as Dayjs | null} onChange={emit}
        placeholder={`${filter ? '筛选' : '请选择'}${field.label}`} />}
    {error && <div role="alert" className="oxa-mobile-field-errors">{error}</div>}
  </div>;
}
