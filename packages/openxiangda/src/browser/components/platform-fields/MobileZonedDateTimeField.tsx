import { Temporal } from '@js-temporal/polyfill';
import { useRef, useState } from 'react';
import { ConfigProvider, PickerView, Popup, zhCN } from '../../mobile';
import { MobileFieldTrigger, MobileSheetHeader } from './MobileFieldLayout';
import type { FieldProps } from './MobileFieldControls';
import { rangeValueValidationMessage } from './field-form-codec';
import { dateOptions, instantToWall, nowWall, validateDateTimeConstraints,
  zonedInputResult, type DateTimeConstraints } from './zoned-date-time';

const pad = (n: number) => String(n).padStart(2, '0');
const hours = Array.from({ length: 24 }, (_, n) => ({ label: `${n}时`, value: pad(n) }));
const seconds = Array.from({ length: 60 }, (_, n) => ({ label: `${n}秒`, value: pad(n) }));

export function MobileZonedDateTimeField({ field, value, disabled, id, onChange,
  timeZone, min, max, minuteStep }: FieldProps & DateTimeConstraints & { timeZone: string }) {
  const constraints = validateDateTimeConstraints({ timeZone, min, max, minuteStep });
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'start' | 'end'>('start');
  const [start, setStart] = useState(() => nowWall(timeZone, constraints));
  const [end, setEnd] = useState(() => nowWall(timeZone, constraints));
  const range = field.type === 'datetime-range';
  if (range && field.rangeBoundary !== 'closed' && field.rangeBoundary !== 'half-open')
    throw new Error('OPENXIANGDA_RANGE_BOUNDARY_INVALID');
  const pair = value as { start?: unknown; end?: unknown } | null;
  const storedStart = Array.isArray(value) ? value[0] : range ? pair?.start : value;
  const storedEnd = Array.isArray(value) ? value[1] : pair?.end;
  const display = (item: unknown) => item == null ? '' :
    instantToWall(item, timeZone).toString({ smallestUnit: minuteStep === undefined ? 'second' : 'minute' }).replace('T', ' ');
  const resultStart = zonedInputResult(start, timeZone, constraints);
  const resultEnd = zonedInputResult(end, timeZone, constraints);
  const draft = { start: resultStart.value, end: resultEnd.value };
  const error = range && step === 'end' ? resultStart.error || resultEnd.error || rangeValueValidationMessage(field, draft) : resultStart.error;
  const active = range && step === 'end' ? end : start;
  const dates = dateOptions(active, timeZone, min, max);
  const minuteOptions = Array.from({ length: 60 / (minuteStep ?? 1) }, (_, i) => {
    const n = i * (minuteStep ?? 1); return { label: `${n}分`, value: pad(n) };
  });
  const columns = [dates, hours, minuteOptions, ...(minuteStep === undefined ? [seconds] : [])];
  const selection = [active.toPlainDate().toString(), pad(active.hour), pad(active.minute),
    ...(minuteStep === undefined ? [pad(active.second)] : [])];
  const confirm = () => {
    if (error) return;
    if (range && step === 'start') {
      if (Temporal.PlainDateTime.compare(end, start) < 0) setEnd(start);
      setStep('end'); return;
    }
    onChange?.(range ? draft : resultStart.value);
    setOpen(false);
  };
  return <div ref={root} className="oxa-mobile-date-time-field oxa-mobile-scope">
    <MobileFieldTrigger id={id} title={`选择${field.label}`} disabled={disabled}
      value={value == null ? '' : range ? <span className="oxa-mobile-range-value has-time">
        <span>{display(storedStart)}</span><span className="oxa-mobile-range-separator">至</span><span>{display(storedEnd)}</span>
      </span> : display(value)}
      onClear={() => onChange?.(null)} onClick={() => {
        setStart(storedStart == null ? nowWall(timeZone, constraints) : instantToWall(storedStart, timeZone));
        setEnd(storedEnd == null ? nowWall(timeZone, constraints) : instantToWall(storedEnd, timeZone));
        setStep('start'); setOpen(true);
      }} />
    <Popup visible={open} getContainer={() => root.current!} bodyClassName="oxa-mobile-date-sheet"
      onMaskClick={() => setOpen(false)} destroyOnClose>
      <section role="dialog" aria-label={`选择${field.label}`}>
        <ConfigProvider locale={zhCN}>
          <MobileSheetHeader title={range ? `选择${step === 'start' ? '开始' : '结束'}时间` : `选择${field.label}`}
            cancelText={range && step === 'end' ? '上一步' : '取消'}
            confirmText={range && step === 'start' ? '下一步' : '确定'} disabled={Boolean(error) || dates.length === 0}
            onConfirm={confirm} onCancel={() => range && step === 'end' ? setStep('start') : setOpen(false)} />
          <PickerView className="oxa-mobile-time-picker oxa-mobile-date-time-picker" columns={columns}
            value={selection} renderLabel={item => item.label} onChange={next => {
              if (next.some(item => item == null)) return;
              const wall = Temporal.PlainDate.from(String(next[0])).toPlainDateTime({
                hour: Number(next[1]), minute: Number(next[2]), second: Number(next[3] ?? 0),
              });
              if (range && step === 'end') setEnd(wall); else setStart(wall);
            }} />
          {(error || dates.length === 0) && <div className="oxa-mobile-field-errors" role="alert">{error || '没有可选日期'}</div>}
        </ConfigProvider>
      </section>
    </Popup>
  </div>;
}
