import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { isValidElement } from 'react';
import type { DataFieldSurface, DataResourceSurface } from 'openxiangda-contracts/browser';
import { DateTimeField } from '../src/browser/components/platform-fields/DateTimeField';
import {
  fieldValueForData,
  fieldValueForForm,
  rangeValueValidationMessage,
} from '../src/browser/components/platform-fields/field-form-codec';

function field(
  type: DataFieldSurface['type'],
  widget: DataFieldSurface['widget'],
  input: Partial<DataFieldSurface> = {}
): DataFieldSurface {
  return {
    label: type,
    type,
    widget,
    readCapabilities: [],
    createCapabilities: [],
    updateCapabilities: [],
    ...input,
  };
}

test('round-trips date, time and datetime values through form controls', () => {
  const date = field('date', 'date');
  const minute = field('time', 'time', { timePrecision: 'minute' });
  const second = field('time', 'time', { timePrecision: 'second' });
  const datetime = field('datetime', 'datetime');
  assert.equal(fieldValueForData(date, fieldValueForForm(date, '2026-08-24')), '2026-08-24');
  assert.equal(fieldValueForData(minute, fieldValueForForm(minute, '09:30:00')), '09:30');
  assert.equal(fieldValueForData(second, fieldValueForForm(second, '09:30:45')), '09:30:45');
  assert.equal(
    fieldValueForData(datetime, fieldValueForForm(datetime, '2026-08-24T08:30:45.000Z')),
    '2026-08-24T08:30:45.000Z'
  );
});

test('round-trips date and datetime ranges without serializing field boundaries', () => {
  const dateRange = field('date-range', 'date-range', { rangeBoundary: 'closed' });
  const datetimeRange = field('datetime-range', 'datetime-range', {
    rangeBoundary: 'half-open',
  });
  assert.deepEqual(
    fieldValueForData(
      dateRange,
      fieldValueForForm(dateRange, { start: '2026-08-01', end: '2026-08-31' })
    ),
    { start: '2026-08-01', end: '2026-08-31' }
  );
  assert.deepEqual(
    fieldValueForData(
      datetimeRange,
      fieldValueForForm(datetimeRange, {
        start: '2026-08-01T00:00:00.000Z',
        end: '2026-08-31T00:00:00.000Z',
      })
    ),
    {
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-31T00:00:00.000Z',
    }
  );
});

test('preserves explicit empty values for nullable fields', () => {
  const surface = {
    fields: { observedAt: field('datetime', 'datetime') },
  } satisfies DataResourceSurface;
  assert.equal(fieldValueForData(surface.fields.observedAt, null), null);
  assert.equal(fieldValueForForm(surface.fields.observedAt, null), undefined);
});

test('validates closed and half-open range order from the Surface contract', () => {
  const closed = field('date-range', 'date-range', { rangeBoundary: 'closed' });
  const halfOpen = field('date-range', 'date-range', {
    rangeBoundary: 'half-open',
  });
  const equal = { start: '2026-08-01', end: '2026-08-01' };
  assert.equal(rangeValueValidationMessage(closed, equal), undefined);
  assert.equal(
    rangeValueValidationMessage(halfOpen, equal),
    '半开区间的结束值必须晚于开始值'
  );
  assert.equal(
    rangeValueValidationMessage(field('date-range', 'date-range'), equal),
    '范围字段缺少有效的边界协议'
  );
});

test('keeps query-facing date values free of Dayjs transport objects', () => {
  const date = field('date', 'date');
  const range = field('datetime-range', 'datetime-range', {
    rangeBoundary: 'half-open',
  });
  const dateValue = fieldValueForData(date, fieldValueForForm(date, '2026-08-24'));
  const rangeValue = fieldValueForData(
    range,
    fieldValueForForm(range, {
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-31T00:00:00.000Z',
    })
  );
  assert.equal(typeof dateValue, 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(rangeValue)), rangeValue);
});

test('binds stable date values to every controlled picker and emits stable data values', () => {
  const selectedScalar = dayjs('2026-08-31T09:30:45');
  const selectedRange = [
    dayjs('2026-08-01T09:30:45'),
    dayjs('2026-08-31T18:00:00'),
  ];
  const cases: Array<{
    surface: DataFieldSurface;
    value: unknown;
    selected: unknown;
    expected: unknown;
  }> = [
    {
      surface: field('date', 'date'),
      value: '2026-08-31',
      selected: selectedScalar,
      expected: '2026-08-31',
    },
    {
      surface: field('time', 'time', { timePrecision: 'second' }),
      value: '09:30:45',
      selected: selectedScalar,
      expected: '09:30:45',
    },
    {
      surface: field('datetime', 'datetime'),
      value: '2026-08-31T01:30:45.000Z',
      selected: selectedScalar,
      expected: selectedScalar.toISOString(),
    },
    {
      surface: field('date-range', 'date-range', { rangeBoundary: 'closed' }),
      value: { start: '2026-08-01', end: '2026-08-31' },
      selected: selectedRange,
      expected: { start: '2026-08-01', end: '2026-08-31' },
    },
    {
      surface: field('datetime-range', 'datetime-range', { rangeBoundary: 'half-open' }),
      value: {
        start: '2026-08-01T01:30:45.000Z',
        end: '2026-08-31T10:00:00.000Z',
      },
      selected: selectedRange,
      expected: {
        start: selectedRange[0].toISOString(),
        end: selectedRange[1].toISOString(),
      },
    },
  ];
  const render = DateTimeField as unknown as (props: {
    field: DataFieldSurface;
    value: unknown;
    onChange: () => void;
  }) => unknown;

  for (const item of cases) {
    let emitted: unknown;
    const element = render({
      field: item.surface,
      value: item.value,
      onChange: value => {
        emitted = value;
      },
    });
    assert.ok(isValidElement(element), `${item.surface.type} should render a picker`);
    const props = element.props as { value?: unknown; onChange?: (value: unknown) => void };
    if (Array.isArray(props.value)) {
      assert.ok(props.value.every(dayjs.isDayjs), `${item.surface.type} should decode its range`);
    } else {
      assert.ok(dayjs.isDayjs(props.value), `${item.surface.type} should decode its scalar value`);
    }
    props.onChange?.(item.selected);
    assert.deepEqual(emitted, item.expected, `${item.surface.type} should emit stable data`);
  }
});
