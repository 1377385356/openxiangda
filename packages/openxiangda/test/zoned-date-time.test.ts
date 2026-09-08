import assert from 'node:assert/strict';
import test from 'node:test';
import { Temporal } from '@js-temporal/polyfill';
import dayjs from 'dayjs';
import { carrierWall, dateOptions, instantToWall, validateDateTimeConstraints,
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
