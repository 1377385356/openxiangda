import type {
  LabeledValue,
  StableAddressValue,
} from 'openxiangda-contracts/browser';

export const ADDRESS_LEVELS = [
  'province',
  'city',
  'district',
  'street',
] as const;

export type AddressLevel = (typeof ADDRESS_LEVELS)[number];

const CHINA: LabeledValue = { label: '中国', value: '100000' };

function snapshot(value: LabeledValue): LabeledValue {
  return {
    label: String(value.label || '').trim(),
    value: String(value.value || '').trim(),
  };
}

export function addressPath(value?: StableAddressValue) {
  return ADDRESS_LEVELS
    .map(level => value?.[level])
    .filter((item): item is LabeledValue => Boolean(item?.value));
}

export function addressControlValue(value?: StableAddressValue) {
  return addressPath(value).map(item => item.value);
}

export function addressDisplay(value?: StableAddressValue) {
  if (!value) return '';
  if (value.fullAddress?.trim()) return value.fullAddress.trim();
  return composeFullAddress(addressPath(value), value.detail);
}

export function composeFullAddress(path: LabeledValue[], detail?: string) {
  const labels: string[] = [];
  for (const item of path) {
    const label = String(item.label || '').trim();
    if (label && labels[labels.length - 1] !== label) labels.push(label);
  }
  const normalizedDetail = String(detail || '').trim();
  if (normalizedDetail) labels.push(normalizedDetail);
  return labels.join('');
}

export function addressStoredValue(
  path: LabeledValue[],
  detail?: string
): StableAddressValue | undefined {
  const normalizedPath = path
    .slice(0, ADDRESS_LEVELS.length)
    .map(snapshot)
    .filter(item => item.label && item.value);
  if (!normalizedPath.length) return undefined;
  const normalizedDetail = String(detail || '').trim();
  const value: StableAddressValue = { country: { ...CHINA } };
  normalizedPath.forEach((item, index) => {
    const level = ADDRESS_LEVELS[index];
    if (level) value[level] = item;
  });
  if (normalizedDetail) value.detail = normalizedDetail;
  value.fullAddress = composeFullAddress(normalizedPath, normalizedDetail);
  return value;
}

export function deepestAddressPredicate(value?: StableAddressValue) {
  for (let index = ADDRESS_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = ADDRESS_LEVELS[index];
    const part = level ? value?.[level] : undefined;
    if (level && part?.value) {
      return { path: `${level}.value`, value: part.value };
    }
  }
  return undefined;
}
