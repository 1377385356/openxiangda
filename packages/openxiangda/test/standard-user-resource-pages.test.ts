import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  StandardUserRecordsPage,
} from '../src/browser/components/resource/StandardUserResourcePages';
import { OpenXiangdaResourceDefinitionsProvider } from '../src/browser/resource-definitions';
import { buildResourceWhere } from '../src/browser/components/platform-fields/resource-query';

const surface = {
  schemaVersion: 'openxiangda.data-resource-surface/v2',
  mutationOwner: 'native',
  generated: { list: true, detail: true, create: true, update: true, delete: true },
  fields: {
    title: { label: '标题', type: 'text.short', widget: 'text' },
    status: { label: '状态', type: 'option.single', widget: 'select' },
  },
  list: { fieldOrder: ['title', 'status'], defaultPageSize: 20 },
} as never;

test('createdBy 显式映射为 created_by 系统字段过滤', () => {
  const where = buildResourceWhere('requests', surface, {
    page: 1,
    pageSize: 20,
    createdBy: 'user-1',
  });
  assert.deepEqual(where, {
    and: [{ field: 'created_by', operator: 'eq', value: 'user-1' }],
  });
});

test('未声明 createdBy 不产生系统过滤', () => {
  const where = buildResourceWhere('requests', surface, { page: 1, pageSize: 20 });
  assert.equal(where, undefined);
});

test('我的记录页在资源未声明时给出占位而非崩溃', () => {
  const html = renderToStaticMarkup(
    createElement(
      OpenXiangdaResourceDefinitionsProvider,
      { definitions: {} },
      createElement(StandardUserRecordsPage, {
        resourceCode: 'missing',
        variant: 'desktop',
        labels: { list: '我的申请', submit: '新建' },
        submitPath: '/my/missing/submit',
      }),
    ),
  );
  assert.match(html, /missing/);
});
