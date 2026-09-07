import type { StableLocationValue } from 'openxiangda-contracts/browser';

export interface BrowserCoordinateSnapshot {
  longitude: unknown;
  latitude: unknown;
  accuracy?: unknown;
  timestamp?: number;
}

export interface DingTalkCoordinateSnapshot {
  longitude?: unknown;
  latitude?: unknown;
  accuracy?: unknown;
  address?: unknown;
  poiName?: unknown;
  province?: unknown;
  city?: unknown;
  district?: unknown;
}

function coordinate(value: unknown, axis: 'longitude' | 'latitude') {
  if (value === undefined || value === null || value === '') {
    throw new Error(axis === 'longitude' ? '定位结果缺少有效经度' : '定位结果缺少有效纬度');
  }
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  const limit = axis === 'longitude' ? 180 : 90;
  if (!Number.isFinite(parsed) || parsed < -limit || parsed > limit) {
    throw new Error(axis === 'longitude' ? '定位结果缺少有效经度' : '定位结果缺少有效纬度');
  }
  return parsed;
}

function accuracy(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function capturedAt(timestamp?: number) {
  const date = new Date(
    typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
      ? timestamp
      : Date.now()
  );
  return date.toISOString();
}

export function browserLocationValue(
  snapshot: BrowserCoordinateSnapshot
): StableLocationValue {
  const capturedAccuracy = accuracy(snapshot.accuracy);
  return {
    source: 'browser',
    longitude: coordinate(snapshot.longitude, 'longitude'),
    latitude: coordinate(snapshot.latitude, 'latitude'),
    ...(capturedAccuracy === undefined ? {} : { accuracy: capturedAccuracy }),
    capturedAt: capturedAt(snapshot.timestamp),
  };
}

export function dingTalkLocationValue(
  snapshot: DingTalkCoordinateSnapshot,
  timestamp = Date.now()
): StableLocationValue {
  const capturedAccuracy = accuracy(snapshot.accuracy);
  const address = optionalText(snapshot.address);
  const name = optionalText(snapshot.poiName);
  const province = optionalText(snapshot.province);
  const city = optionalText(snapshot.city);
  const district = optionalText(snapshot.district);
  return {
    source: 'dingTalk',
    longitude: coordinate(snapshot.longitude, 'longitude'),
    latitude: coordinate(snapshot.latitude, 'latitude'),
    ...(capturedAccuracy === undefined ? {} : { accuracy: capturedAccuracy }),
    ...(address === undefined ? {} : { address }),
    ...(name === undefined ? {} : { name }),
    ...(province === undefined ? {} : { province }),
    ...(city === undefined ? {} : { city }),
    ...(district === undefined ? {} : { district }),
    capturedAt: capturedAt(timestamp),
  };
}
