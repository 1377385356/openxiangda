import { App, Button, ConfigProvider, Form, Typography } from 'antd';
import type {
  DataAuditEntry,
  DataFieldSurface,
  DataFileRef,
} from 'openxiangda/core';
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  auditFieldChange,
  sanitizeRichText,
  fieldValueForData,
  fieldValueForForm,
  MobileSurfaceFieldControl,
  SurfaceAuditFieldValue,
  SurfaceFieldControl,
  SurfaceFieldValue,
  type SurfaceField,
  type SurfaceFieldRenderers,
} from 'openxiangda/field-kit';
import richTextParagraphs from './rich-text-paragraphs.json';

const paragraphResults = richTextParagraphs.map(({ input, expected }) => {
  const actual = sanitizeRichText(input);
  const expectedHtml = new DOMParser().parseFromString(expected, 'text/html').body.innerHTML;
  return { actual, expected: expectedHtml, stable: sanitizeRichText(actual) === actual };
});
const paragraphEvidence = document.createElement('script');
paragraphEvidence.type = 'application/json';
paragraphEvidence.id = 'rich-text-paragraph-evidence';
paragraphEvidence.textContent = JSON.stringify(paragraphResults);
document.head.append(paragraphEvidence);
import { Button as MobileButton, Input as MobileInput, MobileSurface, Popup } from 'openxiangda/mobile';

if (new URLSearchParams(location.search).get('mode') === 'mobile-surface') {
  await import('openxiangda/mobile/styles.css');
} else {
  await import('openxiangda/react/styles.css');
}

const options = [
  { label: '启用', value: 'enabled' },
  { label: '停用', value: 'disabled' },
];
const source = {
  kind: 'resource' as const,
  resourceCode: 'field-lookups',
  labelField: 'name',
  searchFields: ['name'],
  snapshotFields: ['code'],
};
const field = (
  key: string,
  type: string,
  widget: string,
  extra: Record<string, unknown> = {}
) =>
  ({
    key,
    label: key,
    type,
    widget,
    readCapabilities: [],
    createCapabilities: [],
    updateCapabilities: [],
    ...(type === 'date-range' || type === 'datetime-range'
      ? { rangeBoundary: 'closed' as const }
      : {}),
    ...extra,
  } as unknown as SurfaceField);

const fields = [
  field('单行文本', 'text.short', 'text', { maxLength: 120 }),
  field('邮箱', 'text.short', 'email'),
  field('电话', 'text.short', 'phone'),
  field('多行文本', 'text.long', 'textarea'),
  field('富文本', 'text.rich', 'rich-text'),
  field('整数', 'number.integer', 'number', { scale: 0 }),
  field('小数', 'number.decimal', 'number', { scale: 2 }),
  field('金额', 'number.decimal', 'money', { scale: 2 }),
  field('百分比', 'number.decimal', 'percent', { scale: 2 }),
  field('布尔', 'boolean', 'switch', { requiredHint: new URLSearchParams(location.search).has('emptyBoolean') }),
  field('日期', 'date', 'date'),
  field('时间', 'time', 'time', { timePrecision: 'second' }),
  field('日期时间', 'datetime', 'datetime'),
  field('日期范围', 'date-range', 'date-range'),
  field('日期时间范围', 'datetime-range', 'datetime-range'),
  field('静态单选下拉', 'option.single', 'select', { options }),
  field('静态多选下拉', 'option.multiple', 'multi-select', { options }),
  field('单选按钮', 'option.single', 'radio', { options }),
  field('复选框', 'option.multiple', 'checkbox', { options }),
  field('动态单选下拉', 'resource-ref.single', 'select', { source }),
  field('动态多选下拉', 'resource-ref.multiple', 'multi-select', { source }),
  field('级联单选', 'cascade.single', 'cascade', {
    options: [
      {
        label: '设备',
        value: 'equipment',
        children: [{ label: '显微镜', value: 'microscope' }, { label: '光谱仪', value: 'spectrometer' }],
      },
      { label: '服务', value: 'service', children: [{ label: '培训', value: 'training' }] },
    ],
  }),
  field('级联多选', 'cascade.multiple', 'cascade', {
    options: [
      {
        label: '设备',
        value: 'equipment',
        children: [{ label: '显微镜', value: 'microscope' }, { label: '光谱仪', value: 'spectrometer' }],
      },
      { label: '服务', value: 'service', children: [{ label: '培训', value: 'training' }] },
    ],
  }),
  field('成员单选', 'user.single', 'directory-user'),
  field('成员多选', 'user.multiple', 'directory-user'),
  field('部门单选', 'department.single', 'directory-department'),
  field('部门多选', 'department.multiple', 'directory-department'),
  field('资源单选', 'resource-ref.single', 'resource', { source }),
  field('资源多选', 'resource-ref.multiple', 'resource', { source }),
  field('附件', 'file', 'attachment', {
    accept: ['.pdf', 'text/plain'],
    maxCount: 3,
    maxSizeMb: 20,
  }),
  field('图片', 'image', 'image', {
    accept: ['image/*'],
    maxCount: 3,
    maxSizeMb: 20,
  }),
  field('业务签名', 'signature', 'signature'),
  field('地址', 'address', 'address'),
  field('精确定位', 'location', 'location'),
  field('UUID', 'uuid', 'readonly', { requiredHint: true }),
  field('JSON', 'json', 'json'),
  field('流水号', 'serial-number', 'readonly'),
  field('子表', 'subtable', 'subtable'),
] satisfies Array<DataFieldSurface & { key: string }>;

const user = { label: '张三', value: 'user-1', employeeNo: 'E1001' };
const department = {
  label: '理学院',
  value: 'college-a',
  fullPath: '学校 / 理学院',
};
const reference = {
  label: '显微镜',
  value: 'resource-1',
  resourceCode: 'field-lookups',
  snapshot: { code: 'M-001' },
};
const fileRef: DataFileRef = {
  schemaVersion: 'openxiangda.data-file-ref/v2',
  id: '11111111-1111-4111-8111-111111111111',
  name: '验收附件.pdf',
  size: 1280,
  contentType: 'application/pdf',
};
const imageRef: DataFileRef = {
  ...fileRef,
  id: '22222222-2222-4222-8222-222222222222',
  name: '验收图片.png',
  contentType: 'image/png',
  width: 640,
  height: 480,
  previewUrl: '/service/openxiangda-api/v2/applications/field-protocol-fixture/native/data/field-records/files/22222222-2222-4222-8222-222222222222/content?disposition=inline',
  thumbnailUrl: '/service/openxiangda-api/v2/applications/field-protocol-fixture/native/data/field-records/files/22222222-2222-4222-8222-222222222222/content?variant=thumbnail&disposition=inline',
};
const values: Record<string, unknown> = {
  单行文本: '仪器验收记录',
  邮箱: 'user@example.com',
  电话: '13800000000',
  多行文本: '第一行\n第二行',
  富文本: `<p>已保存的<strong>富文本</strong></p><img src="${imageRef.previewUrl}" alt="富文本图片">`,
  整数: -7,
  小数: 12.34,
  金额: 5600.5,
  百分比: 98.5,
  布尔: true,
  日期: '2026-08-24',
  时间: '10:20:30',
  日期时间: '2026-08-24T02:20:30.000Z',
  日期范围: { start: '2026-08-01', end: '2026-08-31' },
  日期时间范围: {
    start: '2026-08-01T00:00:00.000Z',
    end: '2026-08-31T23:59:59.000Z',
  },
  静态单选下拉: options[0],
  静态多选下拉: options,
  单选按钮: options[0],
  复选框: options,
  动态单选下拉: reference,
  动态多选下拉: [reference],
  级联单选: [
    { label: '设备', value: 'equipment' },
    { label: '显微镜', value: 'microscope' },
  ],
  级联多选: [
    [
      { label: '设备', value: 'equipment' },
      { label: '显微镜', value: 'microscope' },
    ],
  ],
  成员单选: user,
  成员多选: [user],
  部门单选: department,
  部门多选: [department],
  资源单选: reference,
  资源多选: [reference],
  附件: [fileRef],
  图片: [imageRef],
  业务签名: {
    file: {
      ...fileRef,
      id: '33333333-3333-4333-8333-333333333333',
      name: 'signature.png',
      contentType: 'image/png',
    },
    signer: user,
    signedAt: '2026-08-24T02:20:30.000Z',
    hash: 'a'.repeat(64),
    points: [{ x: 1, y: 1, t: 1 }],
  },
  地址: {
    country: { label: '中国', value: 'CN' },
    province: { label: '浙江省', value: '330000' },
    city: { label: '杭州市', value: '330100' },
    district: { label: '西湖区', value: '330106' },
    detail: '文一路 1 号',
    fullAddress: '浙江省杭州市西湖区文一路 1 号',
  },
  精确定位: {
    source: 'browser',
    longitude: 120.123456,
    latitude: 30.234567,
    accuracy: 5,
    capturedAt: '2026-08-24T02:20:30.000Z',
  },
  JSON: { status: 'ok', nested: { count: 1 } },
  流水号: 'FP-001000',
  子表: [{ item_name: '第一行' }, { item_name: '第二行' }],
};

const auditEntry: DataAuditEntry = {
  id: 'field-protocol-event',
  operation: 'created',
  recordId: 'field-protocol-record',
  revision: 1,
  actor: { principalType: 'user', subjectId: 'user-1' },
  correlation: {
    eventId: 'field-protocol-event',
    requestId: null,
    traceId: null,
    environmentKey: 'preproduction',
    appVersionId: 'field-protocol-version',
    environmentHeadRevision: 1,
    capturePlanRevision: 1,
    cause: { eventId: null, subscriptionCode: null, depth: 0 },
  },
  changes: Object.fromEntries(
    fields.map(item => [item.key, { after: values[item.key] ?? null }])
  ),
  projection: {},
  occurredAt: '2026-08-25T00:00:00.000Z',
};

const renderers: SurfaceFieldRenderers = {
  signer: user,
  upload: async (_field, file) => {
    if (new URLSearchParams(location.search).has('controlledUploads')) {
      const response = await fetch('/__field-upload-fixture', { method: 'POST', body: file, headers: { 'x-file-name': encodeURIComponent(file.name) } });
      if (!response.ok) throw new Error(await response.text());
    }
    return ({
    schemaVersion: 'openxiangda.data-file-ref/v2',
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    contentType: file.type,
  });
  },
  renderSubtable: () => (
    <div className="field-protocol-subtable">2 行子表 · 新增 · 删除 · 排序</div>
  ),
  renderValue: ({ field: item, value }) =>
    item.type === 'subtable'
      ? `${Array.isArray(value) ? value.length : 0} 行子表`
      : undefined,
};

function MobileFacadeAcceptance() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  return <MobileSurface>
    <MobileInput aria-label="平台移动输入" value={value} onChange={setValue} />
    <MobileButton onClick={() => setOpen(true)}>打开移动弹层</MobileButton>
    <Popup visible={open} onMaskClick={() => setOpen(false)}>
      <div data-mobile-popup>
        <p>已输入：{value}</p>
        <MobileButton onClick={() => setOpen(false)}>关闭弹层</MobileButton>
      </div>
    </Popup>
  </MobileSurface>;
}

function AcceptancePage() {
  const mobile = new URLSearchParams(location.search).get('mode') === 'mobile';
  const Control = mobile ? MobileSurfaceFieldControl : SurfaceFieldControl;
  const [form] = Form.useForm();
  const [saved, setSaved] = useState<Record<string, unknown>>();
  return (
    <ConfigProvider><App>
      <main className={`field-protocol-page ${mobile ? 'is-mobile' : 'is-desktop'}`}>
        <header>
          <Typography.Title level={mobile ? 4 : 2}>
            Field Kit 协议验收
          </Typography.Title>
          <Typography.Text type="secondary">
            {mobile ? '移动编辑态' : '桌面编辑态与已存快照只读态'}
          </Typography.Text>
        </header>
        <section aria-label={mobile ? '移动编辑字段' : '桌面编辑字段'} className="field-protocol-edit">
          <Form form={form} initialValues={new URLSearchParams(location.search).has('emptyBoolean') ? { ...values, 布尔: undefined } : values} layout="vertical" onFinish={current => {
            setSaved(Object.fromEntries(fields.map(item => [item.key, fieldValueForData(item, current[item.key])])));
          }}>
            <div className="field-protocol-grid">
              {fields.map(item => (
                <div data-field-code={item.key} key={item.key}>
                  <Control
                    disabled={item.widget === 'readonly'}
                    field={item}
                    operation="create"
                    renderers={renderers}
                    resourceCode="field-records"
                  />
                </div>
              ))}
            </div>
            <Button htmlType="submit">验证表单</Button>
            {saved && <Button onClick={() => form.setFieldsValue(Object.fromEntries(fields.map(item => [item.key, fieldValueForForm(item, saved[item.key])])))}>重新载入已保存值</Button>}
            <output data-saved-values>{saved ? JSON.stringify(saved) : ''}</output>
          </Form>
        </section>
        {!mobile && (
          <section aria-label="已存快照只读字段" className="field-protocol-readonly">
            <Typography.Title level={3}>已存快照</Typography.Title>
            <div className="field-protocol-read-grid">
              {fields.map(item => (
                <div data-read-field={item.key} key={item.key}>
                  <strong>{item.label}</strong>
                  <SurfaceFieldValue
                    field={item}
                    renderers={renderers}
                    resourceCode="field-records"
                    value={values[item.key]}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
        {!mobile && (
          <section aria-label="当前协议字段变更记录" className="field-protocol-readonly">
            <Typography.Title level={3}>当前协议字段变更记录</Typography.Title>
            <div className="field-protocol-read-grid">
              {fields.map(item => (
                <div data-audit-field={item.key} key={item.key}>
                  <strong>{item.label}</strong>
                  <SurfaceAuditFieldValue
                    field={item}
                    resourceCode="field-records"
                    value={auditFieldChange(auditEntry, item.key)?.after}
                  />
                </div>
              ))}
              <div data-audit-digest="rich-text">
                <strong>富文本摘要</strong>
                <SurfaceAuditFieldValue
                  field={fields[4]}
                  value={{
                    kind: 'digest',
                    truncated: true,
                    valueType: 'text.rich',
                    bytes: 65_537,
                    sha256: 'a'.repeat(64),
                  }}
                />
              </div>
            </div>
          </section>
        )}
      </main>
    </App></ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get('mode') === 'mobile-surface' ? <MobileFacadeAcceptance /> : <AcceptancePage />}
  </React.StrictMode>
);
