import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  browserLocationValue,
  dingTalkLocationValue,
} from '../src/browser/components/platform-fields/location-value';

test('normalizes browser coordinates into an exact snapshot', () => {
  assert.deepEqual(
    browserLocationValue({
      longitude: 120.1234567,
      latitude: 30.7654321,
      accuracy: 8.5,
      timestamp: Date.parse('2026-08-24T08:00:00.000Z'),
    }),
    {
      source: 'browser',
      longitude: 120.1234567,
      latitude: 30.7654321,
      accuracy: 8.5,
      capturedAt: '2026-08-24T08:00:00.000Z',
    }
  );
});

test('normalizes DingTalk coordinates and optional reverse-geocoded display data', () => {
  assert.deepEqual(
    dingTalkLocationValue(
      {
        longitude: '120.1234567',
        latitude: '30.7654321',
        accuracy: '12',
        address: ' 浙江省杭州市西湖区 ',
        poiName: '测试大楼',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
      },
      Date.parse('2026-08-24T08:00:00.000Z')
    ),
    {
      source: 'dingTalk',
      longitude: 120.1234567,
      latitude: 30.7654321,
      accuracy: 12,
      address: '浙江省杭州市西湖区',
      name: '测试大楼',
      province: '浙江省',
      city: '杭州市',
      district: '西湖区',
      capturedAt: '2026-08-24T08:00:00.000Z',
    }
  );
});

test('rejects missing and out-of-range coordinates', () => {
  assert.throws(
    () => dingTalkLocationValue({ latitude: 30 }),
    /有效经度/
  );
  assert.throws(
    () => browserLocationValue({ longitude: 181, latitude: 30 }),
    /有效经度/
  );
  assert.throws(
    () => browserLocationValue({ longitude: 120, latitude: -91 }),
    /有效纬度/
  );
});

test('location control captures coordinates without a manual address input', () => {
  const source = readFileSync(
    new URL('../src/browser/components/platform-fields/LocationField.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /coordinate: 0/);
  assert.match(source, /withReGeocode: true/);
  assert.match(source, /browserLocationValue/);
  assert.match(source, /dingTalkLocationValue/);
  assert.match(source, /LocationValueDisplay/);
  assert.doesNotMatch(source, /<Input|<textarea|contentEditable/);
});
