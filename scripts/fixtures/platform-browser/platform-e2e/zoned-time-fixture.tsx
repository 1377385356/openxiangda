import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { OpenXiangdaUiProvider } from 'openxiangda/react';
import { DateTimeField, DateTimeFilter, DateTimeValueDisplay, MobileDateTimeField,
  fieldValueForForm, fieldValueForData, SurfaceFieldValue } from 'openxiangda/field-kit';
import type { DataFieldSurface } from 'openxiangda/core';
import 'openxiangda/react/styles.css';
import 'openxiangda/mobile/styles.css';

const params = new URLSearchParams(location.search);
const field = { key: 'startsAt', type: 'datetime', widget: 'datetime', label: '会议开始',
  readCapabilities: [], createCapabilities: [], updateCapabilities: [] } as DataFieldSurface & { key: string };
const initial = params.get('value') || '2026-03-07T18:15:00.000Z';
const zone = params.get('zone') || 'Asia/Shanghai';
const step = params.has('seconds') ? undefined : 15;
function Fixture() {
  const [value, setValue] = useState<unknown>(initial);
  const [range, setRange] = useState<unknown>({ start: initial, end: '2026-03-07T19:15:00.000Z' });
  const [form, setForm] = useState<unknown>(() => fieldValueForForm(field, initial));
  const limits = { min: params.get('min') || undefined, max: params.get('max') || undefined, minuteStep: step };
  const mobile = params.has('mobile');
  const Control = mobile ? MobileDateTimeField : DateTimeField;
  return <OpenXiangdaUiProvider timeZone={zone}><main style={{ padding: 24, maxWidth: 720 }}>
    <h1>会议时间</h1>
    <div data-testid="edit"><Control field={field} value={value} onChange={setValue} {...limits} /></div>
    <output data-testid="canonical">{JSON.stringify(value)}</output>
    <div data-testid="display"><DateTimeValueDisplay field={field} value={value} /></div>
    <div data-testid="summary"><SurfaceFieldValue field={field} value={value} /></div>
    <div data-testid="override"><DateTimeValueDisplay field={field} value={value} timeZone="UTC" /></div>
    <div data-testid="range"><Control field={{ ...field, type: 'datetime-range', rangeBoundary: 'half-open', label: '会议区间' }} value={range} onChange={setRange} {...limits} /></div>
    <output data-testid="range-canonical">{JSON.stringify(range)}</output>
    <div data-testid="generated-form"><DateTimeField field={field} value={form} onChange={setForm} {...limits} /></div>
    <output data-testid="form-canonical">{JSON.stringify(fieldValueForData(field, form))}</output>
    <div data-testid="filter"><DateTimeFilter field={field} value={value} onChange={setValue} {...limits} /></div>
    <div data-testid="plain-date"><DateTimeValueDisplay field={{ ...field, type: 'date' }} value="2026-03-08" /></div>
  </main></OpenXiangdaUiProvider>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
