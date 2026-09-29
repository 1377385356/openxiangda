import assert from 'node:assert/strict';
import test from 'node:test';
import { Temporal } from '@js-temporal/polyfill';
import dayjs from 'dayjs';
import { carrierWall, dateOptions, disabledZonedTime, instantToWall, validateDateTimeConstraints,
  wallCarrier, zonedInputResult } from '../src/browser/components/platform-fields/zoned-date-time';
import { validatePresentationTimeZone, formatPresentationTime } from '../src/browser/presentation-time';

test('IANA wall conversion preserves canonical instants and generated Dayjs form values', () => {
  const instant = '2026-09-08T01:15:00.000Z';
  for (const zone of ['Asia/Shanghai', 'UTC', 'America/Los_Angeles']) {
    const wall = instantToWall(dayjs(instant), zone);
    assert.equal(zonedInputResult(carrierWall(wallCarrier(wall)), zone, { minuteStep: 15 }).value, instant);
  }
  assert.equal(instantToWall(instant, 'Asia/Shanghai').hour, 9);
  assert.match(formatPresentationTime(instant, 'Asia/Shanghai'), /09:15:00/);
});

test('rejects gaps and repeated wall times without guessing an offset', () => {
  for (const value of ['2026-03-08T02:15', '2026-11-01T01:15']) {
    assert.match(zonedInputResult(Temporal.PlainDateTime.from(value), 'America/Los_Angeles', {}).error!, /不存在或有重复/);
    assert.ok(zonedInputResult(Temporal.PlainDateTime.from(value), 'Asia/Shanghai', {}).value);
  }
});

test('bounds compare exact instants and quarter-hour input cannot retain seconds', () => {
  const wall = Temporal.PlainDateTime.from('2026-09-08T09:15:00');
  const constraints = { min: '2026-09-08T01:15:00Z', max: '2026-09-08T01:15:00Z', minuteStep: 15 };
  assert.ok(zonedInputResult(wall, 'Asia/Shanghai', constraints).value);
  assert.match(zonedInputResult(wall.subtract({ minutes: 15 }), 'Asia/Shanghai', constraints).error!, /最早/);
  assert.match(zonedInputResult(wall.add({ minutes: 15 }), 'Asia/Shanghai', constraints).error!, /最晚/);
  assert.match(zonedInputResult(wall.with({ minute: 16 }), 'Asia/Shanghai', constraints).error!, /整 15/);
  assert.match(zonedInputResult(wall.with({ second: 1 }), 'Asia/Shanghai', constraints).error!, /整 15/);
});

test('invalid configuration fails before controls create choices', () => {
  for (const timeZone of ['', '+08:00', 'not-a-zone']) assert.throws(() => validatePresentationTimeZone(timeZone), /TIME_ZONE_INVALID/);
  for (const minuteStep of [0, 7, 61, 1.5, NaN]) assert.throws(() => validateDateTimeConstraints({ minuteStep }), /CONSTRAINT_INVALID/);
  assert.throws(() => validateDateTimeConstraints({ min: '2026-01-02T00:00Z', max: '2026-01-01T00:00Z' }), /CONSTRAINT_INVALID/);
  assert.throws(() => validateDateTimeConstraints({ min: '2026-01-01' }), /CONSTRAINT_INVALID/);
});

test('mobile choices stay bounded and use plain dates across device DST boundaries', () => {
  const center = Temporal.PlainDateTime.from('2026-03-08T02:15');
  assert.equal(dateOptions(center, 'Asia/Shanghai').length, 731);
  const choices = dateOptions(center, 'Asia/Shanghai', '2026-03-07T16:00:00Z', '2026-03-09T15:59:59Z');
  assert.deepEqual(choices.map(item => item.value), ['2026-03-08', '2026-03-09']);
});

test('time columns disable same-day hours, minutes and fractional second boundaries', async () => {
  const { disabledZonedTime } = await import('../src/browser/components/platform-fields/zoned-date-time');
  const day = Temporal.PlainDate.from('2026-09-29');
  const limits = { min: '2026-09-29T01:15:30.001Z', max: '2026-09-29T02:05:30.999Z' };
  const seconds = disabledZonedTime(day, 'Asia/Shanghai', limits);
  assert.deepEqual(seconds.disabledHours(), [...Array.from({length:9},(_,i)=>i), ...Array.from({length:13},(_,i)=>i+11)]);
  assert.deepEqual(seconds.disabledMinutes(9), Array.from({length:15},(_,i)=>i));
  assert.deepEqual(seconds.disabledSeconds(9,15), Array.from({length:31},(_,i)=>i));
  assert.deepEqual(seconds.disabledSeconds(10,5), Array.from({length:29},(_,i)=>i+31));
  const minutes = disabledZonedTime(day, 'Asia/Shanghai', { ...limits, minuteStep: 1 });
  assert.ok(minutes.disabledMinutes(9).includes(15));
  assert.ok(!minutes.disabledMinutes(9).includes(16));
  assert.ok(!minutes.disabledMinutes(10).includes(5));
  assert.ok(minutes.disabledMinutes(10).includes(6));
});

test('time columns preserve inclusive exact-minute bounds, cross-day and DST rejection', async () => {
  const { disabledZonedTime } = await import('../src/browser/components/platform-fields/zoned-date-time');
  const day = Temporal.PlainDate.from('2026-09-29');
  const exact = disabledZonedTime(day, 'Asia/Shanghai', { min:'2026-09-29T01:15:00Z',max:'2026-09-29T01:15:00Z',minuteStep:15 });
  assert.equal(exact.disabledHours().length,23);
  assert.ok(!exact.disabledHours().includes(9));
  assert.equal(exact.disabledMinutes(9).length,59);
  assert.ok(!exact.disabledMinutes(9).includes(15));
  assert.equal(disabledZonedTime(day,'UTC',{min:'2026-09-30T00:00:00Z'}).disabledHours().length,24);
  for(const [date,hour] of [['2026-03-08',2],['2026-11-01',1]] as const) {
    assert.ok(disabledZonedTime(Temporal.PlainDate.from(date),'America/Los_Angeles',{minuteStep:15}).disabledHours().includes(hour));
  }
});


test('submillisecond lower bound excludes the preceding whole second', () => {
  const disabled = disabledZonedTime(Temporal.PlainDate.from('2026-09-29'), 'Asia/Shanghai', {
    min: '2026-09-29T01:30:00.000000001Z', minuteStep: 1,
  });
  assert.ok(disabled.disabledMinutes(9).includes(30));
  assert.ok(!disabled.disabledMinutes(9).includes(31));
});
