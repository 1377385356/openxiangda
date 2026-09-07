import { Button as MobileButton } from '../../mobile';
import {
  AimOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { Alert, Button, Space, Tooltip, Typography } from 'antd';
import type { StableLocationValue } from 'openxiangda-contracts/browser';
import { useState } from 'react';
import {
  browserLocationValue,
  dingTalkLocationValue,
  type DingTalkCoordinateSnapshot,
} from './location-value';

interface DingTalkGeolocationApi {
  get(options: {
    targetAccuracy: number;
    coordinate: 0;
    withReGeocode: true;
    useCache: false;
    onSuccess: (result: DingTalkCoordinateSnapshot) => void;
    onFail: (error: unknown) => void;
  }): void;
}

type CaptureSource = StableLocationValue['source'];

export function LocationValueDisplay({ value }: { value: StableLocationValue }) {
  return (
    <span className="oxa-location-value oxa-location-value-readonly">
      <Typography.Text strong>
        {value.longitude.toFixed(6)}, {value.latitude.toFixed(6)}
      </Typography.Text>
      <Typography.Text type="secondary">
        {value.source === 'dingTalk' ? '钉钉定位' : '浏览器定位'}
        {value.accuracy === undefined ? '' : ` · 精度 ${Math.round(value.accuracy)} 米`}
      </Typography.Text>
      {(value.name || value.address) && (
        <Typography.Text>{value.name || value.address}</Typography.Text>
      )}
    </span>
  );
}

function dingTalkGeolocation() {
  if (typeof window === 'undefined') return undefined;
  return (
    window as unknown as {
      dd?: { device?: { geolocation?: DingTalkGeolocationApi } };
    }
  ).dd?.device?.geolocation;
}

function browserCapture() {
  return new Promise<StableLocationValue>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve(browserLocationValue({
        longitude: position.coords.longitude,
        latitude: position.coords.latitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      })),
      error => reject(new Error(error.message || '浏览器定位失败')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
  });
}

function dingTalkCapture() {
  return new Promise<StableLocationValue>((resolve, reject) => {
    const geolocation = dingTalkGeolocation();
    if (!geolocation) {
      reject(new Error('当前环境未提供钉钉定位能力'));
      return;
    }
    geolocation.get({
      targetAccuracy: 20,
      coordinate: 0,
      withReGeocode: true,
      useCache: false,
      onSuccess: result => {
        try {
          resolve(dingTalkLocationValue(result));
        } catch (error) {
          reject(error);
        }
      },
      onFail: error => reject(new Error(
        typeof error === 'object' && error && 'errorMessage' in error
          ? String(error.errorMessage)
          : '钉钉定位失败'
      )),
    });
  });
}

export function LocationField({
  value,
  onChange,
  disabled,
  mobile = false,
}: {
  value?: StableLocationValue;
  onChange?: (value: StableLocationValue | undefined) => void;
  disabled?: boolean;
  mobile?: boolean;
}) {
  const [capturing, setCapturing] = useState<CaptureSource>();
  const [error, setError] = useState('');
  const hasDingTalk = Boolean(dingTalkGeolocation());

  const capture = async (source: CaptureSource) => {
    setCapturing(source);
    setError('');
    try {
      onChange?.(await (source === 'dingTalk' ? dingTalkCapture() : browserCapture()));
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : String(captureError));
    } finally {
      setCapturing(undefined);
    }
  };

  if (mobile) return <div className="oxa-mobile-location-field oxa-mobile-scope">
    <MobileButton aria-label={value ? '重新定位' : '获取定位'} disabled={disabled || Boolean(capturing)} loading={Boolean(capturing)} onClick={() => void capture(hasDingTalk ? 'dingTalk' : 'browser')}><EnvironmentOutlined /> {value ? '重新定位' : '获取定位'}</MobileButton>
    {error && <div role="alert">{error}</div>}
    {value && <div className="oxa-mobile-location-result"><span>{value.address || value.name || `${value.longitude.toFixed(6)}, ${value.latitude.toFixed(6)}`}</span>
      {!disabled && <MobileButton fill="none" aria-label="清除定位" disabled={Boolean(capturing)} onClick={() => onChange?.(undefined)}>×</MobileButton>}
    </div>}
  </div>;
  return (
    <div className={`oxa-location-field${mobile ? ' oxa-mobile-location-field' : ''}`}>
      <Space wrap>
        <Tooltip title={hasDingTalk ? '使用钉钉定位' : '仅在钉钉客户端内可用'}>
          <Button
            disabled={disabled || !hasDingTalk}
            icon={<EnvironmentOutlined />}
            loading={capturing === 'dingTalk'}
            onClick={() => void capture('dingTalk')}
          >
            钉钉定位
          </Button>
        </Tooltip>
        <Button
          disabled={disabled}
          icon={<AimOutlined />}
          loading={capturing === 'browser'}
          onClick={() => void capture('browser')}
        >
          浏览器定位
        </Button>
        {value && (
          <Tooltip title="清除定位">
            <Button
              aria-label="清除定位"
              disabled={disabled || Boolean(capturing)}
              icon={<DeleteOutlined />}
              onClick={() => onChange?.(undefined)}
            />
          </Tooltip>
        )}
      </Space>
      {error && <Alert showIcon title={error} type="error" />}
      {value && <LocationValueDisplay value={value} />}
    </div>
  );
}
