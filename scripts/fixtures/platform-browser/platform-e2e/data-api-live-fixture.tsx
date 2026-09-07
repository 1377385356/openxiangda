import { Refine } from '@refinedev/core';
import { App as AntdApp } from 'antd';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  OpenXiangdaUiProvider,
  createApplicationProvider,
  GeneratedResourcePage,
  OpenXiangdaResourceDefinitionsProvider,
  RuntimeBoundary,
  type GeneratedResourceDefinition,
} from 'openxiangda/react';
import 'openxiangda/react/styles.css';

const code = 'field-records';
const capabilityBase = `app:native-projection-app:data:${code}`;
const capabilities = {
  read: `${capabilityBase}:read`,
  create: `${capabilityBase}:create`,
  update: `${capabilityBase}:update`,
  delete: `${capabilityBase}:delete`,
};

function fieldCapabilities() {
  return {
    readCapabilities: [capabilities.read],
    createCapabilities: [capabilities.create],
    updateCapabilities: [capabilities.update],
  };
}

export const liveDefinition: GeneratedResourceDefinition = {
  code,
  name: '字段协议记录',
  capabilities,
  surface: {
    mutationOwner: 'native',
    generated: {
      list: true,
      detail: true,
      create: true,
      update: true,
      delete: true,
    },
    fields: {
      text_short: {
        label: '标题',
        type: 'text.short',
        widget: 'text',
        requiredHint: true,
        maxLength: 120,
        list: true,
        searchable: true,
        sortable: true,
        ...fieldCapabilities(),
      },
      option_single: {
        label: '单选快照',
        type: 'option.single',
        widget: 'radio',
        options: [
          { label: 'Open', value: 'open' },
          { label: 'Closed', value: 'closed' },
        ],
        list: true,
        ...fieldCapabilities(),
      },
      option_multiple: {
        label: '多选快照',
        type: 'option.multiple',
        widget: 'checkbox',
        options: [
          { label: 'Open', value: 'open' },
          { label: 'Urgent', value: 'urgent' },
        ],
        list: true,
        ...fieldCapabilities(),
      },
      location_value: {
        label: '精确定位',
        type: 'location',
        widget: 'location',
        list: true,
        ...fieldCapabilities(),
      },
    },
    list: {
      defaultPageSize: 20,
      searchableFields: ['text_short'],
      filterFields: ['option_single'],
      defaultSort: { field: 'text_short', order: 'asc' },
    },
    form: { layout: 'sections' },
    detail: { layout: 'sections' },
    mobile: { enabled: true },
  },
};

const definitions = { [code]: liveDefinition };
const provider = createApplicationProvider(definitions);
const routeBase = `/admin/resources/${code}`;
const routePaths = {
  fallback: '/admin',
  list: routeBase,
  create: `${routeBase}/new`,
  detail: `${routeBase}/:id`,
  edit: `${routeBase}/:id/edit`,
};
const initialPath =
  new URLSearchParams(window.location.search).get('initial') || routeBase;

function resourcePage(mode: 'list' | 'create' | 'edit' | 'detail') {
  return (
    <GeneratedResourcePage
      definition={liveDefinition}
      mode={mode}
      paths={routePaths}
      resourceCode={code}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OpenXiangdaResourceDefinitionsProvider definitions={definitions}>
      <OpenXiangdaUiProvider>
        <AntdApp>
          <RuntimeBoundary>
            <MemoryRouter initialEntries={[initialPath]}>
            <Refine
              dataProvider={provider}
              resources={[
                {
                  name: code,
                  list: routePaths.list,
                  create: routePaths.create,
                  edit: routePaths.edit,
                  show: routePaths.detail,
                },
              ]}
            >
              <Routes>
                <Route path={routePaths.list} element={resourcePage('list')} />
                <Route path={routePaths.create} element={resourcePage('create')} />
                <Route
                  path={routePaths.detail}
                  element={resourcePage('detail')}
                />
                <Route
                  path={routePaths.edit}
                  element={resourcePage('edit')}
                />
              </Routes>
            </Refine>
            </MemoryRouter>
          </RuntimeBoundary>
        </AntdApp>
      </OpenXiangdaUiProvider>
    </OpenXiangdaResourceDefinitionsProvider>
  </React.StrictMode>
);
