import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App, ConfigProvider, Form } from 'antd';
import {
  RuntimeBoundary,
  OpenXiangdaResourceDefinitionsProvider,
} from 'openxiangda/react';
import {
  MobileSurfaceFieldControl,
  SubtableField,
  buildSubtableOperations,
  fieldValueForData,
  type SurfaceField,
  type SurfaceFieldRenderers,
  type SubtableDraftRow,
} from 'openxiangda/field-kit';
import { Button } from 'openxiangda/mobile';
import type { DataResourceSurface, DataFileRef } from 'openxiangda/core';
import 'openxiangda/react/styles.css';

const options = ['选项一', '选项二', '选项三'].map((label, index) => ({
  label,
  value: String(index + 1),
}));
const field = (
  key: string,
  type: string,
  widget: string,
  extra = {}
): SurfaceField =>
  ({
    key,
    label: key,
    type,
    widget,
    readCapabilities: [],
    createCapabilities: [],
    updateCapabilities: [],
    ...extra,
  } as SurfaceField);
const childFields = {
  choice: field('choice', 'option.single', 'select', {
    label: '下拉单选',
    options,
  }),
  quantity: field('quantity', 'number.integer', 'number', {
    label: '数值',
    requiredHint: true,
    scale: 0,
  }),
  name: field('name', 'text.short', 'text', {
    label: '单行文本',
    requiredHint: true,
  }),
  parent_id: field('parent_id', 'uuid', 'text'),
  row_order: field('row_order', 'number.integer', 'number'),
};
const childSurface: DataResourceSurface = {
  mutationOwner: 'native',
  generated: {
    list: true,
    detail: true,
    create: true,
    update: true,
    delete: true,
  },
  fields: childFields,
};
const definitions = {
  'form-items': {
    code: 'form-items',
    name: '表单明细',
    capabilities: {
      read: 'read',
      create: 'create',
      update: 'update',
      delete: 'delete',
    },
    surface: childSurface,
  },
};
const groups = [
  {
    title: '基础信息',
    fields: [
      field('单行文本', 'text.short', 'text'),
      field('多行文本', 'text.long', 'textarea'),
      field('数值', 'number.integer', 'number', { scale: 0 }),
      field('评分', 'number.integer', 'rating'),
      field('单选', 'option.single', 'radio', { options }),
      field('复选', 'option.multiple', 'checkbox', { options }),
    ],
  },
  {
    title: '选择与时间',
    fields: [
      field('下拉单选', 'option.single', 'select', { options }),
      field('下拉复选', 'option.multiple', 'multi-select', { options }),
      field('日期', 'date', 'date'),
      field('日期时间', 'datetime', 'datetime'),
      field('日期区间', 'date-range', 'date-range', {
        rangeBoundary: 'closed',
      }),
      field('日期时间区间', 'datetime-range', 'datetime-range', {
        rangeBoundary: 'closed',
      }),
    ],
  },
  {
    title: '文件与明细',
    fields: [
      field('图片上传', 'image', 'image', {
        maxCount: 3,
        maxSizeMb: 20,
        accept: ['image/*'],
      }),
      field('附件', 'file', 'attachment', { maxCount: 3, maxSizeMb: 20 }),
      field('流水号', 'serial-number', 'readonly'),
      field('子表单', 'subtable', 'subtable', {
        subtable: {
          resourceCode: 'form-items',
          foreignKey: 'parent_id',
          orderField: 'row_order',
          maxRows: 3,
        },
      }),
    ],
  },
  {
    title: '位置与确认',
    fields: [
      field('地址', 'address', 'address'),
      field('定位', 'location', 'location'),
      field('级联选择', 'cascade.single', 'cascade', {
        options: [
          {
            label: '部门',
            value: 'department',
            children: [
              { label: 'A部门', value: 'a' },
              { label: 'B部门', value: 'b' },
            ],
          },
        ],
      }),
      field('手写签名', 'signature', 'signature'),
      field('富文本', 'text.rich', 'rich-text'),
    ],
  },
];
const file: DataFileRef = {
  schemaVersion: 'openxiangda.data-file-ref/v2',
  id: '11111111-1111-4111-8111-111111111111',
  name: '使用说明.pdf',
  size: 12680,
  contentType: 'application/pdf',
};
const image: DataFileRef = {
  ...file,
  id: '22222222-2222-4222-8222-222222222222',
  name: '活动图片.png',
  contentType: 'image/png',
  width: 640,
  height: 480,
};
const initialRows: SubtableDraftRow[] = [
  {
    key: 'item-1',
    id: 'item-1',
    revision: 4,
    state: 'persisted',
    data: { choice: options[2], quantity: 11, name: '测试记录' },
    originalData: { choice: options[2], quantity: 11, name: '测试记录' },
    originalOrder: 0,
  },
];
const initial = {
  评分: 3,
  单选: options[1],
  复选: options.slice(1),
  图片上传: [image],
  附件: [file],
  子表单: initialRows,
  日期: '2026-09-05',
  日期时间: '2026-09-05T09:45:33.000Z',
  日期区间: { start: '2026-09-05', end: '2026-09-08' },
  日期时间区间: {
    start: '2026-09-05T09:00:00.000Z',
    end: '2026-09-08T10:00:00.000Z',
  },
  富文本: '<p>已有<strong>格式内容</strong></p>',
};
const renderers: SurfaceFieldRenderers = {
  signer: { value: 'acceptance-user', label: '王老师' },
  upload: async (_field, file) => {
    const response = await fetch('/__reference-upload-fixture', { method: 'POST', body: file, headers: { 'x-file-name': encodeURIComponent(file.name) } });
    if (!response.ok) throw new Error('上传失败');
    return response.json();
  },
  renderSubtable: ({ field, disabled, operation, recordId }) => (
    <SubtableField
      mobile
      field={field}
      disabled={disabled}
      operation={operation}
      parentRecordId={recordId}
    />
  ),
};

function MobileReferenceForm() {
  const [form] = Form.useForm();
  const [saved, setSaved] = useState<unknown>();
  const [operations, setOperations] = useState<unknown>();
  const [notice, setNotice] = useState('');
  return (
    <main className="oxa-mobile-entry oxa-mobile-scope reference-form">
      <header className="oxa-mobile-header">
        <h3>未命名表单</h3>
      </header>
      <Form
        className="oxa-mobile-form"
        form={form}
        initialValues={initial}
        onFinish={values => {
          setSaved(
            Object.fromEntries(
              groups
                .flatMap(group => group.fields)
                .map(item => [
                  item.key,
                  fieldValueForData(item, values[item.key]),
                ])
            )
          );
          setOperations(
            buildSubtableOperations({
              rows: values.子表单,
              childResourceCode: 'form-items',
              childSurface,
              foreignKey: 'parent_id',
              orderField: 'row_order',
              maxRows: 3,
              parent: { operation: 'update', id: 'parent-1' },
              canWrite: () => true,
              canDelete: true,
            })
          );
          setNotice('提交成功');
        }}
      >
        <div className="reference-content">
          {groups.map(group => (
            <section key={group.title} aria-label={group.title}>
              <h2 className="reference-group-title">{group.title}</h2>
              <div className="reference-group">
                {group.fields.map(field => (
                  <div data-field-code={field.key} key={field.key}>
                    <MobileSurfaceFieldControl
                      field={field}
                      operation="create"
                      resourceCode="field-records"
                      renderers={renderers}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {notice && (
            <div className="reference-notice" role="status">
              {notice}
            </div>
          )}
        </div>
        <footer className="oxa-actions">
          <Button
            onClick={() => {
              sessionStorage.setItem(
                'mobile-reference-draft',
                JSON.stringify(form.getFieldsValue())
              );
              setNotice('已暂存');
            }}
          >
            暂存
          </Button>
          <Button color="primary" type="submit">
            提交
          </Button>
        </footer>
        <output data-saved-values>{JSON.stringify(saved)}</output>
        <output data-operations>{JSON.stringify(operations)}</output>
      </Form>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <App>
        <BrowserRouter>
          <RuntimeBoundary>
            <OpenXiangdaResourceDefinitionsProvider definitions={definitions}>
              <MobileReferenceForm />
            </OpenXiangdaResourceDefinitionsProvider>
          </RuntimeBoundary>
        </BrowserRouter>
      </App>
    </ConfigProvider>
  </React.StrictMode>
);
