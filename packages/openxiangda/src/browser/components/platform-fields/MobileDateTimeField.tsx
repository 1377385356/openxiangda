import dayjs from 'dayjs';
import { useRef, useState } from 'react';
import { Button, Calendar, ConfigProvider, Popup, zhCN } from '../../mobile';
import type { FieldProps } from './MobileFieldControls';
import { MobileFieldTrigger, MobileSheetHeader } from './MobileFieldLayout';
import {
  MobileDateTimePickerView,
  MobileTimePickerView,
} from './MobileDateWheels';
import {
  fieldValueForData,
  rangeValueValidationMessage,
} from './field-form-codec';

/** Calendar/time switching and staged range steps adapted from 1.x Date fields. */
export function MobileDateTimeField({
  field,
  value,
  disabled,
  id,
  onChange,
}: FieldProps) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [timeMode, setTimeMode] = useState(false);
  const [step, setStep] = useState<'start' | 'end'>('start');
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const range = field.type.endsWith('-range');
  const withTime =
    field.type === 'datetime' ||
    field.type === 'datetime-range' ||
    field.type === 'time';
  const format =
    field.type === 'time'
      ? field.timePrecision === 'minute'
        ? 'HH:mm'
        : 'HH:mm:ss'
      : withTime
      ? 'YYYY-MM-DD HH:mm:ss'
      : 'YYYY-MM-DD';
  const stored = fieldValueForData(field, value);
  const pair = stored as { start?: string; end?: string } | null;
  const date = (value: unknown) => {
    const parsed = dayjs(
      field.type === 'time'
        ? `2000-01-01 ${value || '00:00:00'}`
        : value == null
        ? undefined
        : String(value)
    );
    return parsed.isValid() ? parsed.toDate() : new Date();
  };
  const scalar = {
    ...field,
    type: (withTime ? 'datetime' : 'date') as 'datetime' | 'date',
  };
  const output = (item: Date) =>
    field.type === 'time'
      ? dayjs(item).format(format)
      : fieldValueForData(scalar, dayjs(item));
  const draft = { start: output(start), end: output(end) };
  const error = range ? rangeValueValidationMessage(field, draft) : '';
  const confirm = () => {
    if (range && step === 'start') {
      if (end < start) setEnd(new Date(start));
      setStep('end');
      return;
    }
    if (error) return;
    onChange?.(range ? draft : output(start));
    setOpen(false);
  };
  const active = range && step === 'end' ? end : start;
  const change = (next: Date) =>
    range && step === 'end' ? setEnd(next) : setStart(next);
  const display =
    stored == null
      ? ''
      : range
      ? `${dayjs(pair?.start).format(format)} 至 ${dayjs(pair?.end).format(
          format
        )}`
      : field.type === 'time'
      ? String(stored)
      : dayjs(String(stored)).format(format);
  return (
    <div ref={root} className="oxa-mobile-date-time-field oxa-mobile-scope">
      <MobileFieldTrigger
        id={id}
        title={`选择${field.label}`}
        disabled={disabled}
        value={range && stored != null ? <span className={`oxa-mobile-range-value${withTime ? ' has-time' : ''}`}>
          <span>{dayjs(pair?.start).format(format)}</span><span className="oxa-mobile-range-separator">至</span><span>{dayjs(pair?.end).format(format)}</span>
        </span> : display}
        onClear={() => onChange?.(null)}
        onClick={() => {
          setStart(date(range ? pair?.start : stored));
          setEnd(date(pair?.end));
          setStep('start');
          setTimeMode(field.type === 'time');
          setOpen(true);
        }}
      />
      <Popup
        visible={open}
        getContainer={() => root.current!}
        bodyClassName="oxa-mobile-date-sheet"
        onMaskClick={() => setOpen(false)}
        destroyOnClose
      >
        <section role="dialog" aria-label={`选择${field.label}`}>
          <ConfigProvider locale={zhCN}>
            <MobileSheetHeader
              title={
                range
                  ? `选择${step === 'start' ? '开始' : '结束'}时间`
                  : undefined
              }
              cancelText={range && step === 'end' ? '上一步' : '取消'}
              confirmText={range && step === 'start' ? '下一步' : '确定'}
              disabled={range && step === 'end' && Boolean(error)}
              onConfirm={confirm}
              onCancel={() =>
                range && step === 'end' ? setStep('start') : setOpen(false)
              }
            />
            {range && withTime ? (
              <MobileDateTimePickerView
                value={active}
                dateFormat={format}
                min={step === 'end' ? start : undefined}
                onChange={change}
              />
            ) : timeMode ? (
              <MobileTimePickerView
                value={active}
                dateFormat={format}
                onChange={change}
              />
            ) : (
              <Calendar
                selectionMode="single"
                value={active}
                allowClear={false}
                weekStartsOn="Sunday"
                min={range && step === 'end' ? start : undefined}
                onChange={next => {
                  if (next)
                    change(
                      dayjs(next)
                        .hour(active.getHours())
                        .minute(active.getMinutes())
                        .second(active.getSeconds())
                        .toDate()
                    );
                }}
              />
            )}
            {withTime && !range && field.type !== 'time' && (
              <div className="oxa-mobile-date-time-footer">
                <span>选择时间</span>
                <Button
                  fill={timeMode ? 'solid' : 'none'}
                  color={timeMode ? 'primary' : 'default'}
                  onClick={() => setTimeMode(!timeMode)}
                >
                  {dayjs(start).format('HH:mm:ss')} {timeMode ? '⌃' : '⌄'}
                </Button>
              </div>
            )}
            {range && step === 'end' && error && (
              <div className="oxa-mobile-field-errors" role="alert">
                {error}
              </div>
            )}
          </ConfigProvider>
        </section>
      </Popup>
    </div>
  );
}
