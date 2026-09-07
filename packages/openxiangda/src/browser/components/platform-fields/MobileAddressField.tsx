import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  LabeledValue,
  StableAddressValue,
} from 'openxiangda-contracts/browser';
import { Button, CheckList, TextArea } from '../../mobile';
import { loadChinaDivisions } from '../../platform-client';
import { addressPath, addressStoredValue } from './address-value';
import {
  MobileSelectionField,
  MobileSelectionPageStatus,
} from './MobileSelection';
import { MobileSheetHeader } from './MobileFieldLayout';
import { useMobilePickerPage } from './useMobilePickerPage';

export function MobileAddressField({
  value,
  onChange,
  disabled,
  detailEnabled = true,
}: {
  value?: StableAddressValue;
  onChange?: (value: StableAddressValue | undefined) => void;
  disabled?: boolean;
  detailEnabled?: boolean;
}) {
  const detailId = useId();
  const [detail, setDetail] = useState(value?.detail || '');
  const emittedDetail = useRef(value?.detail || '');
  useEffect(() => {
    const next = value?.detail || '';
    if (next !== emittedDetail.current) setDetail(next);
    emittedDetail.current = next;
  }, [value?.detail]);
  return (
    <div className="oxa-mobile-address-field oxa-mobile-scope">
      <MobileSelectionField
        title="选择行政区地址"
        placeholder="请选择"
        disabled={disabled}
        onClear={() => { setDetail(''); onChange?.(undefined); }}
        labels={
          addressPath(value).length
            ? [
                addressPath(value)
                  .map(item => item.label)
                  .join('/'),
              ]
            : []
        }
      >
        {close => (
          <AddressSelection value={value} onChange={onChange} close={close} />
        )}
      </MobileSelectionField>
      {detailEnabled && (
        <div className="oxa-mobile-address-detail">
          <label htmlFor={detailId}>详细地址</label>
          <TextArea
            id={detailId}
            maxLength={4000}
            aria-label="详细地址"
            placeholder="请输入"
            disabled={disabled || !addressPath(value).length}
            autoSize={{ minRows: 2, maxRows: 5 }}
            value={detail}
            onChange={text => {
              setDetail(text);
              const next = addressStoredValue(addressPath(value), text);
              emittedDetail.current = next?.detail || '';
              onChange?.(next);
            }}
          />
        </div>
      )}
    </div>
  );
}
function AddressSelection({
  value,
  onChange,
  close,
}: {
  value?: StableAddressValue;
  onChange?: (value: StableAddressValue | undefined) => void;
  close: () => void;
}) {
  const [selected, setSelected] = useState<LabeledValue[]>(addressPath(value));
  const [path, setPath] = useState<LabeledValue[]>(() =>
    addressPath(value).slice(0, -1)
  );
  const parent = path.at(-1)?.value;
  const loadPage = useCallback(
    async () => ({ items: await loadChinaDivisions(parent), nextCursor: null }),
    [parent]
  );
  const page = useMobilePickerPage({ loadPage });
  return (
    <>
      <MobileSheetHeader
        onCancel={close}
        disabled={!selected.length}
        onConfirm={() => {
          onChange?.(addressStoredValue(selected, value?.detail));
          close();
        }}
      />
      <nav className="oxa-mobile-selection-breadcrumb" aria-label="地区路径">
        <Button fill="none" onClick={() => setPath([])}>
          地区选择
        </Button>
        {path.map((item, index) => (
          <Button
            fill="none"
            key={item.value}
            onClick={() => setPath(path.slice(0, index + 1))}
          >
            › {item.label}
          </Button>
        ))}
      </nav>
      <div className="oxa-mobile-selection-content">
        <CheckList
          value={selected.map(item => item.value)}
          onChange={keys => {
            const item = page.items.find(item => item.adcode === keys[0]);
            if (!item) return;
            const next = [...path, { value: item.adcode, label: item.name }];
            setSelected(next);
            if (item.hasChildren && next.length < 4) setPath(next);
          }}
        >
          {page.items.map(item => (
            <CheckList.Item key={item.adcode} value={item.adcode}>
              {item.name}
            </CheckList.Item>
          ))}
        </CheckList>
        <MobileSelectionPageStatus page={page} />
      </div>
    </>
  );
}
