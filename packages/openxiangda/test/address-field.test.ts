import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  addressControlValue,
  addressDisplay,
  addressStoredValue,
  deepestAddressPredicate,
} from '../src/browser/components/platform-fields/address-value';

const path = [
  { label: '浙江省', value: '330000' },
  { label: '杭州市', value: '330100' },
  { label: '西湖区', value: '330106' },
  { label: '翠苑街道', value: '330106012' },
];

test('stores a complete administrative snapshot with a stable full address', () => {
  const value = addressStoredValue(path, '文一路 1 号');
  assert.deepEqual(value, {
    country: { label: '中国', value: '100000' },
    province: path[0],
    city: path[1],
    district: path[2],
    street: path[3],
    detail: '文一路 1 号',
    fullAddress: '浙江省杭州市西湖区翠苑街道文一路 1 号',
  });
  assert.deepEqual(addressControlValue(value), path.map(item => item.value));
  assert.equal(addressDisplay(value), '浙江省杭州市西湖区翠苑街道文一路 1 号');
});

test('deduplicates adjacent municipality labels while retaining both snapshots', () => {
  const value = addressStoredValue([
    { label: '上海市', value: '310000' },
    { label: '上海市', value: '310100' },
    { label: '浦东新区', value: '310115' },
  ]);
  assert.equal(value?.fullAddress, '上海市浦东新区');
  assert.equal(value?.province?.value, '310000');
  assert.equal(value?.city?.value, '310100');
});

test('uses the deepest selected stable code for Data API filtering', () => {
  assert.deepEqual(
    deepestAddressPredicate(addressStoredValue(path.slice(0, 3))),
    { path: 'district.value', value: '330106' }
  );
  assert.equal(addressStoredValue([], 'address only'), undefined);
});

test('address field has lazy desktop and explicit mobile controls', () => {
  const field = readFileSync(
    new URL('../src/browser/components/platform-fields/AddressField.tsx', import.meta.url),
    'utf8'
  );
  const client = readFileSync(
    new URL('../src/browser/platform-client.ts', import.meta.url),
    'utf8'
  );
  const mobile = readFileSync(new URL('../src/browser/components/platform-fields/MobileAddressField.tsx', import.meta.url), 'utf8');
  assert.match(field, /loadData=/);
  assert.match(field, /loadChinaDivisions/);
  assert.match(field, /props\.mobile \? <MobileAddressField/);
  assert.match(mobile, /MobileSelectionField/);
  assert.match(mobile, /loadChinaDivisions/);
  assert.match(mobile, /addressStoredValue/);
  assert.match(client, /\/service\/china-divisions\//);
  assert.doesNotMatch(client, /request<ChinaDivisionListItem\[]>\(`\/china-divisions\//);
});
