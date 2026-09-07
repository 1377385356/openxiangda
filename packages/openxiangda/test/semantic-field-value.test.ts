import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SurfaceFieldValue,
  type SurfaceField,
} from '../src/browser/components/resource/SurfaceFields';

function field(type: SurfaceField['type'], widget: SurfaceField['widget']): SurfaceField {
  return {
    key: type,
    label: type,
    type,
    widget,
    list: true,
    readCapabilities: [],
    createCapabilities: [],
    updateCapabilities: [],
  } as SurfaceField;
}

function render(
  type: SurfaceField['type'],
  widget: SurfaceField['widget'],
  value: unknown,
  presentation?: 'default' | 'workflow-detail',
) {
  return renderToStaticMarkup(createElement(SurfaceFieldValue, {
    field: field(type, widget),
    value,
    presentation,
  }));
}

test('renders canonical department single and multiple snapshot labels by semantic type', () => {
  const single = render(
    'department.single',
    'select',
    { label: '校工会', value: 'department-union' },
  );
  const multiple = render(
    'department.multiple',
    'multi-select',
    [
      { label: '信息技术部', value: 'department-it' },
      { label: '人文艺术部', value: 'department-humanities' },
    ],
  );
  assert.match(single, /校工会/);
  assert.match(multiple, /信息技术部/);
  assert.match(multiple, /人文艺术部/);
  assert.doesNotMatch(`${single}${multiple}`, /\[object Object\]/);
});

test('renders canonical user multiple and resource reference multiple snapshot labels', () => {
  const users = render(
    'user.multiple',
    'multi-select',
    [
      { label: '周明远', value: 'user-zhou', employeeNo: 'T1001' },
      { label: '沈书雅', value: 'user-shen', employeeNo: 'T1002' },
    ],
  );
  const resources = render(
    'resource-ref.multiple',
    'multi-select',
    [
      { label: '教职工之家', value: 'resource-home', resourceCode: 'facilities' },
      { label: '文体活动室', value: 'resource-activity', resourceCode: 'facilities' },
    ],
  );
  for (const label of ['周明远', '沈书雅', '教职工之家', '文体活动室']) {
    assert.match(`${users}${resources}`, new RegExp(label));
  }
  assert.doesNotMatch(`${users}${resources}`, /\[object Object\]/);
});

test('renders canonical option arrays and preserves false and zero values', () => {
  const options = render(
    'option.multiple',
    'multi-select',
    [
      { label: '启用', value: 'enabled' },
      { label: '重点', value: 'priority' },
    ],
  );
  const boolean = render('boolean', 'switch', false);
  const zero = render('number.integer', 'number', 0);
  assert.match(options, /启用、重点/);
  assert.match(boolean, /否/);
  assert.equal(zero, '0');
  assert.doesNotMatch(`${options}${boolean}${zero}`, /\[object Object\]/);
});

test('renders money and percent semantics in readonly surfaces', () => {
  assert.equal(render('number.decimal', 'money', 28600), '¥28,600');
  assert.equal(render('number.decimal', 'money', '28600.5'), '¥28,600.5');
  assert.equal(render('number.decimal', 'percent', 12.5), '12.5%');
});

test('renders plain Workflow references and keeps default CRUD presentation unchanged', () => {
  const value = {
    label: '明德楼多功能交流室',
    value: 'venue-1',
    snapshot: { location: '明德楼一层东侧' },
  };
  const workflow = render(
    'resource-ref.single',
    'select',
    value,
    'workflow-detail',
  );
  const crud = render('resource-ref.single', 'select', value);
  assert.match(workflow, /oxa-workflow-plain-reference/);
  assert.match(workflow, /明德楼多功能交流室/);
  assert.match(workflow, /明德楼一层东侧/);
  assert.doesNotMatch(workflow, /oxa-resolved-item/);
  assert.match(crud, /oxa-resolved-item/);
  assert.equal(
    render('user.single', 'select', null, 'workflow-detail'),
    '暂无',
  );
  assert.equal(render('user.single', 'select', null), '-');
});
