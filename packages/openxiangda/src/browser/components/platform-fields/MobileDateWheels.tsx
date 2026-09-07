// Date/time wheel algorithms adapted from the 1.x SDK; no legacy runtime dependencies.
import React from 'react';
import { PickerView } from '../../mobile';
import dayjs from 'dayjs';

type PickerValue = string | number | null;
type TimePickerPrecision = 'minute' | 'second';

const pad2 = (value: number) => String(value).padStart(2, '0');

const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  label: `${hour}时`,
  value: pad2(hour),
}));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => ({
  label: `${minute}分`,
  value: pad2(minute),
}));
const secondOptions = Array.from({ length: 60 }, (_, second) => ({
  label: `${second}秒`,
  value: pad2(second),
}));

export function resolveTimePickerPrecision(
  dateFormat?: string
): TimePickerPrecision {
  return dateFormat && /s/i.test(dateFormat) ? 'second' : 'minute';
}

export function formatMobileTime(date: Date, dateFormat?: string) {
  return dayjs(date).format(
    resolveTimePickerPrecision(dateFormat) === 'second' ? 'HH:mm:ss' : 'HH:mm'
  );
}

export function getTimePickerColumns(
  precision: TimePickerPrecision = 'second'
) {
  return precision === 'second'
    ? [hourOptions, minuteOptions, secondOptions]
    : [hourOptions, minuteOptions];
}

export function getTimePickerValue(
  date: Date,
  precision: TimePickerPrecision = 'second'
): PickerValue[] {
  const base = [dayjs(date).format('HH'), dayjs(date).format('mm')];
  return precision === 'second' ? [...base, dayjs(date).format('ss')] : base;
}

export function applyTimePickerValue(
  base: Date,
  value: PickerValue[],
  precision: TimePickerPrecision = 'second'
) {
  const [hour, minute, second] = value;
  return dayjs(base)
    .hour(Number(hour ?? 0))
    .minute(Number(minute ?? 0))
    .second(precision === 'second' ? Number(second ?? 0) : 0)
    .millisecond(0)
    .toDate();
}

export function MobileTimePickerView({
  value,
  dateFormat,
  onChange,
}: {
  value: Date;
  dateFormat?: string;
  onChange: (value: Date) => void;
}) {
  const precision = resolveTimePickerPrecision(dateFormat);
  return (
    <PickerView
      columns={getTimePickerColumns(precision)}
      value={getTimePickerValue(value, precision)}
      onChange={nextValue =>
        onChange(applyTimePickerValue(value, nextValue, precision))
      }
      className="oxa-mobile-time-picker"
      renderLabel={item => item.label}
    />
  );
}

function resolveDateRange(center: Date, min?: Date, max?: Date) {
  const centerDay = dayjs(center).startOf('day');
  const minDay = min ? dayjs(min).startOf('day') : undefined;
  const maxDay = max ? dayjs(max).startOf('day') : undefined;
  let start =
    minDay && minDay.isAfter(centerDay.subtract(365, 'day'))
      ? minDay
      : centerDay.subtract(365, 'day');
  let end =
    maxDay && maxDay.isBefore(centerDay.add(365, 'day'))
      ? maxDay
      : centerDay.add(365, 'day');

  if (end.isBefore(start)) {
    end = start;
  }

  if (end.diff(start, 'day') > 730) {
    start =
      minDay && minDay.isAfter(centerDay.subtract(365, 'day'))
        ? minDay
        : centerDay.subtract(365, 'day');
    end = start.add(730, 'day');
    if (maxDay && end.isAfter(maxDay)) {
      end = maxDay;
      start = end.subtract(730, 'day');
      if (minDay && start.isBefore(minDay)) start = minDay;
    }
  }

  return { start, end };
}

function getDateOptions(center: Date, min?: Date, max?: Date) {
  const { start, end } = resolveDateRange(center, min, max);
  const total = end.diff(start, 'day');
  return Array.from({ length: total + 1 }, (_, index) => {
    const date = start.add(index, 'day');
    return {
      label: date.format('YYYY-MM-DD'),
      value: date.format('YYYY-MM-DD'),
    };
  });
}

export function getDateTimePickerValue(
  date: Date,
  precision: TimePickerPrecision = 'second'
): PickerValue[] {
  return [
    dayjs(date).format('YYYY-MM-DD'),
    ...getTimePickerValue(date, precision),
  ];
}

export function applyDateTimePickerValue(
  base: Date,
  value: PickerValue[],
  precision: TimePickerPrecision = 'second'
) {
  const [dateValue, hour, minute, second] = value;
  const date = dayjs(String(dateValue || dayjs(base).format('YYYY-MM-DD')));
  return date
    .hour(Number(hour ?? 0))
    .minute(Number(minute ?? 0))
    .second(precision === 'second' ? Number(second ?? 0) : 0)
    .millisecond(0)
    .toDate();
}

export function MobileDateTimePickerView({
  value,
  dateFormat,
  min,
  max,
  onChange,
}: {
  value: Date;
  dateFormat?: string;
  min?: Date;
  max?: Date;
  onChange: (value: Date) => void;
}) {
  const precision = resolveTimePickerPrecision(dateFormat);
  const columns = React.useMemo(
    () => [getDateOptions(value, min, max), ...getTimePickerColumns(precision)],
    [value, min, max, precision]
  );

  return (
    <PickerView
      columns={columns}
      value={getDateTimePickerValue(value, precision)}
      onChange={nextValue =>
        onChange(applyDateTimePickerValue(value, nextValue, precision))
      }
      className="oxa-mobile-time-picker oxa-mobile-date-time-picker"
      renderLabel={item => item.label}
    />
  );
}
