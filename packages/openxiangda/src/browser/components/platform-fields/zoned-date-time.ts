import { Temporal } from '@js-temporal/polyfill';
import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { validatePresentationTimeZone } from '../../presentation-time';
import type { DataFieldSurface } from 'openxiangda-contracts/browser';

dayjs.extend(utc);
dayjs.extend(customParseFormat);

export interface DateTimeConstraints {
  timeZone?: string;
  min?: string;
  max?: string;
  minuteStep?: number;
  /** Derived from the field declaration, independent of the wall-time step. */
  instantPrecision?: 'minute';
}

export function fieldDateTimeConstraints(field: Pick<DataFieldSurface, 'type' | 'timePrecision'>,
  input: DateTimeConstraints): DateTimeConstraints {
  const minute = ['datetime', 'datetime-range'].includes(field.type) && field.timePrecision === 'minute';
  return { ...input, minuteStep: input.minuteStep ?? (minute ? 1 : undefined),
    ...(minute ? { instantPrecision: 'minute' as const } : {}) };
}

export function instantText(value: unknown): string {
  return dayjs.isDayjs(value) ? value.toISOString() : String(value);
}

export function validateDateTimeConstraints(input: DateTimeConstraints) {
  validatePresentationTimeZone(input.timeZone);
  try {
    if (input.minuteStep !== undefined && (!Number.isInteger(input.minuteStep) ||
      input.minuteStep < 1 || input.minuteStep > 60 || 60 % input.minuteStep !== 0)) throw new Error('step');
    const min = input.min === undefined ? undefined : Temporal.Instant.from(input.min);
    const max = input.max === undefined ? undefined : Temporal.Instant.from(input.max);
    if (min && max && Temporal.Instant.compare(min, max) > 0) throw new Error('bounds');
    return input;
  } catch {
    throw new Error('OPENXIANGDA_DATETIME_CONSTRAINT_INVALID');
  }
}

export function instantToWall(value: unknown, timeZone: string) {
  return Temporal.Instant.from(instantText(value)).toZonedDateTimeISO(timeZone).toPlainDateTime();
}

export function wallToInstant(value: Temporal.PlainDateTime, timeZone: string) {
  return value.toZonedDateTime(timeZone, { disambiguation: 'reject' }).toInstant();
}

/** UTC Dayjs carries wall fields only inside the generated picker. */
export function wallCarrier(value: Temporal.PlainDateTime): Dayjs {
  return dayjs.utc(`${value.toString({ smallestUnit: 'millisecond' })}Z`);
}

export function carrierWall(value: Dayjs) {
  return Temporal.PlainDateTime.from(value.format('YYYY-MM-DDTHH:mm:ss.SSS'));
}

export function zonedInputResult(value: Temporal.PlainDateTime, timeZone: string,
  constraints: DateTimeConstraints): { value?: string; error?: string } {
  let instant: Temporal.Instant;
  try {
    instant = wallToInstant(value, timeZone);
  } catch {
    return { error: '此时区的时间不存在或有重复，请选择其他时间' };
  }
  if (constraints.minuteStep !== undefined &&
    (value.minute % constraints.minuteStep !== 0 || value.second !== 0 || value.millisecond !== 0 ||
      value.microsecond !== 0 || value.nanosecond !== 0)) {
    return { error: `请选择整 ${constraints.minuteStep} 分钟的时间` };
  }
  if (constraints.instantPrecision === 'minute' && instant.epochNanoseconds % 60_000_000_000n !== 0n)
    return { error: '此时区的时间不能表示精确整分钟，请选择其他日期或时区' };
  if (constraints.min && Temporal.Instant.compare(instant, Temporal.Instant.from(constraints.min)) < 0)
    return { error: '时间早于允许的最早时间' };
  if (constraints.max && Temporal.Instant.compare(instant, Temporal.Instant.from(constraints.max)) > 0)
    return { error: '时间晚于允许的最晚时间' };
  return { value: instant.toString({ smallestUnit: 'millisecond' }) };
}

export function nowWall(timeZone: string, constraints: DateTimeConstraints = {}) {
  let instant = Temporal.Now.instant();
  if (constraints.min && Temporal.Instant.compare(instant, Temporal.Instant.from(constraints.min)) < 0)
    instant = Temporal.Instant.from(constraints.min);
  if (constraints.max && Temporal.Instant.compare(instant, Temporal.Instant.from(constraints.max)) > 0)
    instant = Temporal.Instant.from(constraints.max);
  const wall = instant.toZonedDateTimeISO(timeZone).toPlainDateTime();
  return constraints.minuteStep === undefined ? wall.with({ millisecond: 0, microsecond: 0, nanosecond: 0 }) :
    wall.round({ smallestUnit: 'minute', roundingIncrement: constraints.minuteStep, roundingMode: 'ceil' });
}

/** Picker columns share emit's instant/step/DST semantics. Computation is bounded
 * to the displayed day and cached per requested minute for this render. */
export function disabledZonedTime(day: Temporal.PlainDate, zone: string, constraints: DateTimeConstraints) {
  const min = constraints.min ? Temporal.Instant.from(constraints.min).epochNanoseconds : undefined;
  const max = constraints.max ? Temporal.Instant.from(constraints.max).epochNanoseconds : undefined;
  const cache = new Map<number, [number, number]>();
  const seconds = (hour: number, minute: number): [number, number] => {
    const key = hour * 60 + minute;
    const existing = cache.get(key);
    if (existing) return existing;
    let result: [number, number] = [1, 0];
    if (constraints.minuteStep === undefined || minute % constraints.minuteStep === 0) {
      try {
        const at = wallToInstant(day.toPlainDateTime({ hour, minute }), zone).epochNanoseconds;
        if (constraints.instantPrecision !== 'minute' || at % 60_000_000_000n === 0n)
          result = [Math.max(0, min === undefined ? -Infinity : Math.ceil(Number(min - at) / 1e9)), Math.min(constraints.minuteStep === undefined ? 59 : 0, max === undefined ? Infinity : Math.floor(Number(max - at) / 1e9))];
      } catch { /* A DST gap or repeated minute is not selectable. */ }
    }
    cache.set(key, result);
    return result;
  };
  const valid = (hour: number, minute: number) => { const [lo, hi] = seconds(hour, minute); return lo <= hi; };
  return {
    disabledHours: () => Array.from({ length: 24 }, (_, h) => h).filter(h => !Array.from({ length: 60 }, (_, m) => m).some(m => valid(h, m))),
    disabledMinutes: (h: number) => Array.from({ length: 60 }, (_, m) => m).filter(m => !valid(h, m)),
    disabledSeconds: (h: number, m: number) => { const [lo, hi] = seconds(h, m); return Array.from({ length: 60 }, (_, s) => s).filter(s => s < lo || s > hi); },
  };
}

export function dateOptions(center: Temporal.PlainDateTime, zone: string, min?: string, max?: string) {
  const day = center.toPlainDate();
  let start = day.subtract({ days: 365 });
  let end = day.add({ days: 365 });
  if (min) {
    const bound = instantToWall(min, zone).toPlainDate();
    if (Temporal.PlainDate.compare(start, bound) < 0) start = bound;
  }
  if (max) {
    const bound = instantToWall(max, zone).toPlainDate();
    if (Temporal.PlainDate.compare(end, bound) > 0) end = bound;
  }
  const total = start.until(end).days;
  if (total < 0) return [];
  return Array.from({ length: Math.min(total + 1, 731) }, (_, i) => {
    const value = start.add({ days: i }).toString();
    return { label: value, value };
  });
}
