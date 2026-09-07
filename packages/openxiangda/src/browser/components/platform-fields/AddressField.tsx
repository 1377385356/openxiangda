import { MobileAddressField } from './MobileAddressField';
import {
  Alert,
  Cascader,
  Input,
  Typography,
} from 'antd';
import type {
  LabeledValue,
  StableAddressValue,
} from 'openxiangda-contracts/browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadChinaDivisions,
  type ChinaDivisionListItem,
} from '../../platform-client';
import {
  addressControlValue,
  addressDisplay,
  addressPath,
  addressStoredValue,
} from './address-value';

interface AddressOption extends LabeledValue {
  hasChildren: boolean;
  isLeaf: boolean;
  children?: AddressOption[];
}

function divisionOption(item: ChinaDivisionListItem): AddressOption {
  return {
    label: item.name,
    value: item.adcode,
    hasChildren: item.hasChildren,
    isLeaf: !item.hasChildren,
  };
}

function snapshotBranch(path: LabeledValue[], index = 0): AddressOption[] {
  const item = path[index];
  if (!item) return [];
  const children = snapshotBranch(path, index + 1);
  return [{
    ...item,
    hasChildren: children.length > 0,
    isLeaf: children.length === 0,
    ...(children.length ? { children } : {}),
  }];
}

function mergeStoredPath(
  options: AddressOption[],
  path: LabeledValue[],
  index = 0
): AddressOption[] {
  const stored = path[index];
  if (!stored) return options;
  let matched = false;
  const next = options.map(option => {
    if (option.value !== stored.value) return option;
    matched = true;
    const children = mergeStoredPath(option.children || [], path, index + 1);
    return {
      ...option,
      label: stored.label || option.label,
      ...(children.length ? { children, isLeaf: false } : {}),
    };
  });
  return matched ? next : [...next, ...snapshotBranch(path, index)];
}

function replaceChildren(
  options: AddressOption[],
  path: string[],
  children: AddressOption[],
  index = 0
): AddressOption[] {
  const current = path[index];
  return options.map(option => {
    if (option.value !== current) return option;
    if (index === path.length - 1) {
      return {
        ...option,
        children,
        hasChildren: children.length > 0,
        isLeaf: children.length === 0,
      };
    }
    return {
      ...option,
      children: replaceChildren(option.children || [], path, children, index + 1),
    };
  });
}

function optionSnapshot(option: AddressOption): LabeledValue {
  return { label: option.label, value: option.value };
}

export function AddressValueDisplay({ value }: { value: StableAddressValue }) {
  const parts = addressPath(value);
  return (
    <span className="oxa-address-value">
      <Typography.Text>{addressDisplay(value) || '-'}</Typography.Text>
      {parts.length > 0 && (
        <Typography.Text type="secondary">
          {parts.map(item => item.label).join(' / ')}
        </Typography.Text>
      )}
    </span>
  );
}

function DesktopAddressField({
  value,
  onChange,
  disabled = false,
  detailEnabled = true,
}: {
  value?: StableAddressValue;
  onChange?: (value: StableAddressValue | undefined) => void;
  disabled?: boolean;
  mobile?: boolean;
  detailEnabled?: boolean;
}) {
  const storedPath = useMemo(() => addressPath(value), [value]);
  const [options, setOptions] = useState<AddressOption[]>(() =>
    snapshotBranch(storedPath)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadOptions = useCallback(async (parentAdcode?: string) =>
    (await loadChinaDivisions(parentAdcode)).map(divisionOption), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadOptions()
      .then(items => {
        if (active) setOptions(mergeStoredPath(items, storedPath));
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadOptions, storedPath]);

  const loadChildren = async (selected: AddressOption[]) => {
    const target = selected[selected.length - 1];
    if (!target) return;
    setError('');
    try {
      const children = await loadOptions(target.value);
      setOptions(current => replaceChildren(
        current,
        selected.map(item => item.value),
        children
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const detailInput = (current?: StableAddressValue, commit?: (next?: StableAddressValue) => void) =>
    detailEnabled ? (
      <Input
        disabled={disabled || !addressPath(current).length}
        maxLength={4000}
        onChange={event => commit?.(
          addressStoredValue(addressPath(current), event.target.value)
        )}
        placeholder="请输入详细门牌地址"
        value={current?.detail || ''}
      />
    ) : null;


  return (
    <div className="oxa-address-field">
      <Cascader
        allowClear
        changeOnSelect
        disabled={disabled}
        loadData={selected => void loadChildren(selected as AddressOption[])}
        loading={loading}
        onChange={(_path, selected) => onChange?.(
          addressStoredValue(
            (selected as AddressOption[]).map(optionSnapshot),
            value?.detail
          )
        )}
        options={options}
        placeholder="请选择行政区地址"
        showSearch={false}
        value={addressControlValue(value)}
      />
      {detailInput(value, onChange)}
      {error && <Alert showIcon title={error} type="error" />}
    </div>
  );
}

export function AddressField(props: Parameters<typeof DesktopAddressField>[0]) {
  return props.mobile ? <MobileAddressField {...props} /> : <DesktopAddressField {...props} />;
}
