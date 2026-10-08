import { namedLaunchIntent, namedLaunchContext } from './named-launch-fixture-data';
import { Refine } from '@refinedev/core';
import { App as AntdApp } from 'antd';
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  createApplicationProvider, GeneratedResourcePage, OpenXiangdaResourceDefinitionsProvider,
  OpenXiangdaUiProvider, OpenXiangdaWorkflowDefinitionsProvider, RuntimeBoundary, WorkflowSubmissionPage,
  type GeneratedResourceDefinition,
} from 'openxiangda/react';
import 'openxiangda/react/styles.css';
import 'openxiangda/mobile/styles.css';

const code = 'purchase-orders';
const capabilityBase = `app:openxiangda-application:data:${code}`;
const capabilities = {
  read: `${capabilityBase}:read`, create: `${capabilityBase}:create`,
  update: `${capabilityBase}:update`, delete: `${capabilityBase}:delete`,
};
const fieldCapabilities = { readCapabilities: [capabilities.read], createCapabilities: [], updateCapabilities: [] };
const definition: GeneratedResourceDefinition = {
  code, name: '采购申请', capabilities,
  surface: {
    mutationOwner: 'workflow',
    generated: { list: true, detail: true, create: false, update: false, delete: false },
    fields: {
      title: { label: '申请名称', type: 'text.short', widget: 'text', requiredHint: true, list: true, ...fieldCapabilities },
      amount: { label: '申请金额', type: 'number.decimal', widget: 'money', requiredHint: true, list: true, ...fieldCapabilities },
      internalNote: { label: '隐藏字段', type: 'text.short', widget: 'text', ...fieldCapabilities },
      systemValue: { label: '系统字段', type: 'text.short', widget: 'text', system: true, ...fieldCapabilities },
      decision: { label: '审批结论', type: 'text.short', widget: 'readonly', ...fieldCapabilities },
      attachments: { label: '审批附件', type: 'file', widget: 'attachment', ...fieldCapabilities },
    },
    list: { defaultPageSize: 20, fieldOrder: ['title', 'amount'] },
    form: { layout: 'flat', fieldOrder: ['title', 'amount', 'systemValue', 'decision'] },
    detail: { layout: 'flat', fieldOrder: ['title', 'amount', 'decision'] },
    mobile: { enabled: true },
  },
};
const childCode = 'purchase-lines';
const childCapability = `app:openxiangda-application:data:${childCode}`;
const childDefinition: GeneratedResourceDefinition = {
  code: childCode, name: '采购明细',
  capabilities: { read: `${childCapability}:read`, create: `${childCapability}:create`, update: `${childCapability}:update`, delete: `${childCapability}:delete` },
  surface: {
    mutationOwner: 'native', generated: { list: false, detail: false, create: false, update: false, delete: false },
    fields: {
      purchaseId: { label: '主记录', type: 'text.short', widget: 'text', ...fieldCapabilities },
      sortOrder: { label: '顺序', type: 'number.integer', widget: 'number', ...fieldCapabilities },
      name: { label: '品名', type: 'text.short', widget: 'text', requiredHint: true, ...fieldCapabilities },
      quantity: { label: '数量', type: 'number.integer', widget: 'number', requiredHint: true, ...fieldCapabilities },
      hiddenNote: { label: '隐藏明细字段', type: 'text.short', widget: 'text', hidden: true, ...fieldCapabilities },
      detailNote: { label: '仅详情说明', type: 'text.short', widget: 'text', ...fieldCapabilities },
    },
    form: { layout: 'flat', fieldOrder: ['name', 'quantity', 'hiddenNote'] },
    detail: { layout: 'flat', fieldOrder: ['name', 'quantity', 'detailNote', 'hiddenNote'] },
  },
};
const definitions = { [code]: definition, [childCode]: childDefinition };
const workflowDefinitions: any[] = [{
  code: 'purchase-approval', title: '采购审批', launch: { mode: 'standalone' },
  subject: { resourceCode: code, factProjection: { amount: 'amount' }, summaryFields: ['amount'] },
  processOperationCode: 'openxiangda.workflow.purchase-approval.submit',
}];
const query = new URLSearchParams(window.location.search);
if (query.get('fields') === 'complex') {
  definition.surface.fields.items = {
    label: '采购明细', type: 'subtable', widget: 'subtable',
    subtable: { resourceCode: childCode, foreignKey: 'purchaseId', orderField: 'sortOrder', maxRows: 20 },
    ...fieldCapabilities,
  };
  definition.surface.detail!.fieldOrder!.push('items');
}
if (query.has('named')) {
  definition.surface.fields.customer = { label: '申请单位', type: 'resource-ref.single', widget: 'resource',
    source: { kind: 'resource', resourceCode: 'customers', labelField: 'name' }, ...fieldCapabilities };
  definition.surface.fields.changeType = { label: '申请类型', type: 'option.single', widget: 'select',
    options: [{ label: '加入', value: 'JOIN' }, { label: '退出', value: 'EXIT' }], ...fieldCapabilities };
  definition.surface.form!.fieldOrder = ['title', 'customer', 'changeType'];
  workflowDefinitions[0].launch.submission = { kind: 'named-operation', create: namedLaunchIntent, context: namedLaunchContext };
  delete workflowDefinitions[0].processOperationCode;
}
const mode = query.get('mode') || 'list';
const base = mode === 'mobile-detail' ? '/m/admin/purchases' : '/admin/purchases';
const paths = { fallback: '/admin', list: base, detail: `${base}/:id` };

function Entry() {
  const [completions, setCompletions] = useState<string[]>([]);
  const [render, setRender] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();
  if (mode === 'list') return <GeneratedResourcePage resourceCode={code} paths={paths} />;
  if (mode === 'mobile-detail' || mode === 'desktop-detail') return <Routes><Route path={paths.detail} element={<GeneratedResourcePage resourceCode={code} mode="detail" variant={mode === 'mobile-detail' ? 'mobile' : 'desktop'} paths={paths} />} /></Routes>;
  return <>
    <button onClick={() => setRender(value => value + 1)}>重新渲染父页面</button>
    <output data-testid="parent-render">{render}</output>
    <output data-testid="completions">{completions.join(',')}</output>
    <output data-testid="route">{location.pathname}{location.search}</output>
    {!dismissed && <WorkflowSubmissionPage workflowCode="purchase-approval" variant={mode === 'mobile' ? 'mobile' : 'desktop'}
      onDismiss={() => setDismissed(true)} onCompleted={id => setCompletions(values => [...values, id])} />}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OpenXiangdaUiProvider><AntdApp><MemoryRouter initialEntries={[(mode === 'mobile-detail' || mode === 'desktop-detail') ? `${paths.list}/record-1` : paths.list + (query.has('named') ? '?changeType=JOIN' : '')]}><RuntimeBoundary>
      <OpenXiangdaResourceDefinitionsProvider definitions={definitions}>
        <OpenXiangdaWorkflowDefinitionsProvider definitions={workflowDefinitions}>
          <Refine dataProvider={createApplicationProvider(definitions)} resources={[{ name: code, list: paths.list, show: paths.detail }]}>
            <Entry />
          </Refine>
        </OpenXiangdaWorkflowDefinitionsProvider>
      </OpenXiangdaResourceDefinitionsProvider>
    </RuntimeBoundary></MemoryRouter></AntdApp></OpenXiangdaUiProvider>
  </React.StrictMode>,
);
