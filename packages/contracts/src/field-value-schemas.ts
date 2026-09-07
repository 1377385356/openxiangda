import type { DataFieldDefinition, DataFieldType } from './types.js';

type JsonSchema = Record<string, unknown>;

const nonEmptyString = { type: 'string', minLength: 1 } as const;
const labeledValue = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'value'],
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 500 },
    value: { type: 'string', minLength: 1, maxLength: 500 },
    description: { type: 'string', maxLength: 2000 },
    color: { type: 'string', maxLength: 64 },
  },
} as const;

export const departmentReferenceValueSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'value'],
  properties: {
    ...labeledValue.properties,
    fullPath: { type: 'string', maxLength: 4000 },
    path: { type: 'array', maxItems: 20, items: labeledValue },
    parent: labeledValue,
  },
} as const;

export const userReferenceValueSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'value'],
  properties: {
    ...labeledValue.properties,
    avatarUrl: { type: 'string', maxLength: 4000 },
    employeeNo: { type: 'string', maxLength: 200 },
    title: { type: 'string', maxLength: 500 },
    mobile: { type: 'string', maxLength: 100 },
    email: { type: 'string', maxLength: 500 },
    departments: {
      type: 'array',
      maxItems: 20,
      items: departmentReferenceValueSchema,
    },
  },
} as const;

export const resourceReferenceValueSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'value', 'resourceCode'],
  properties: {
    ...labeledValue.properties,
    resourceCode: {
      type: 'string',
      pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    },
    snapshot: {
      type: 'object',
      maxProperties: 50,
      additionalProperties: true,
    },
  },
} as const;

const dataFile = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'id', 'name', 'size', 'contentType'],
  properties: {
    schemaVersion: { const: 'openxiangda.data-file-ref/v2' },
    id: nonEmptyString,
    name: { type: 'string', minLength: 1, maxLength: 1000 },
    size: { type: 'integer', minimum: 0 },
    contentType: { type: 'string', minLength: 1, maxLength: 500 },
  },
} as const;

const managedFile = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'size', 'contentType'],
  properties: {
    id: nonEmptyString,
    name: { type: 'string', minLength: 1, maxLength: 1000 },
    size: { type: 'integer', minimum: 0 },
    contentType: { type: 'string', minLength: 1, maxLength: 500 },
  },
} as const;

const dateRange = {
  type: 'object',
  additionalProperties: false,
  required: ['start', 'end'],
  properties: { start: nonEmptyString, end: nonEmptyString },
} as const;

const labeledValues = {
  type: 'array',
  maxItems: 100,
  items: labeledValue,
} as const;

const locationProperties = {
  longitude: { type: 'number', minimum: -180, maximum: 180 },
  latitude: { type: 'number', minimum: -90, maximum: 90 },
  address: { type: 'string', maxLength: 8000 },
  name: { type: 'string', maxLength: 2000 },
  province: { type: 'string', maxLength: 500 },
  city: { type: 'string', maxLength: 500 },
  district: { type: 'string', maxLength: 500 },
  accuracy: { type: 'number', minimum: 0 },
  source: { enum: ['browser', 'dingTalk'] },
  capturedAt: { type: 'string', format: 'date-time' },
} as const;

export const FIELD_VALUE_SCHEMAS = {
  'text.short': { type: 'string', maxLength: 1000000 },
  'text.long': { type: 'string', maxLength: 1000000 },
  'text.rich': { type: 'string', maxLength: 1000000 },
  'number.integer': { type: 'integer' },
  'number.decimal': { type: 'number' },
  boolean: { type: 'boolean' },
  date: {
    type: 'string',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  },
  time: {
    type: 'string',
    pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$',
  },
  datetime: { type: 'string', format: 'date-time' },
  'date-range': dateRange,
  'datetime-range': dateRange,
  'option.single': labeledValue,
  'option.multiple': labeledValues,
  'cascade.single': labeledValues,
  'cascade.multiple': {
    type: 'array',
    maxItems: 100,
    items: labeledValues,
  },
  'user.single': userReferenceValueSchema,
  'user.multiple': {
    type: 'array',
    maxItems: 100,
    items: userReferenceValueSchema,
  },
  'department.single': departmentReferenceValueSchema,
  'department.multiple': {
    type: 'array',
    maxItems: 100,
    items: departmentReferenceValueSchema,
  },
  'resource-ref.single': resourceReferenceValueSchema,
  'resource-ref.multiple': {
    type: 'array',
    maxItems: 100,
    items: resourceReferenceValueSchema,
  },
  image: {
    type: 'array',
    maxItems: 100,
    items: {
      ...dataFile,
      required: [
        ...dataFile.required,
        'width',
        'height',
        'thumbnailUrl',
        'previewUrl',
      ],
      properties: {
        ...dataFile.properties,
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
        thumbnailUrl: { type: 'string', maxLength: 4000 },
        previewUrl: { type: 'string', maxLength: 4000 },
      },
    },
  },
  signature: {
    type: 'object',
    additionalProperties: false,
    required: ['file', 'signedAt', 'hash'],
    properties: {
      file: managedFile,
      signer: userReferenceValueSchema,
      signedAt: { type: 'string', format: 'date-time' },
      points: {
        type: 'array',
        maxItems: 20000,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y', 't'],
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            t: { type: 'number' },
          },
        },
      },
      hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    },
  },
  address: {
    type: 'object',
    additionalProperties: false,
    properties: {
      country: labeledValue,
      province: labeledValue,
      city: labeledValue,
      district: labeledValue,
      street: labeledValue,
      detail: { type: 'string', maxLength: 4000 },
      fullAddress: { type: 'string', maxLength: 8000 },
    },
  },
  location: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'longitude', 'latitude'],
    properties: locationProperties,
  },
  uuid: { type: 'string', format: 'uuid' },
  json: {},
  file: { type: 'array', maxItems: 100, items: dataFile },
  'serial-number': { type: 'string', minLength: 1, maxLength: 255 },
  subtable: {
    type: 'array',
    maxItems: 49,
    items: { type: 'object', additionalProperties: true },
  },
} as const satisfies Record<DataFieldType, JsonSchema>;

export function fieldValueSchemaForDefinition(
  field: Pick<DataFieldDefinition, 'type' | 'rangeBoundary'>
): JsonSchema {
  const schema = structuredClone(FIELD_VALUE_SCHEMAS[field.type]) as JsonSchema;
  if (field.type !== 'date-range' && field.type !== 'datetime-range') {
    return schema;
  }
  if (!['closed', 'half-open'].includes(String(field.rangeBoundary))) {
    throw new Error('DATA_RESOURCE_FIELD_RANGE_BOUNDARY_REQUIRED');
  }
  const boundary = field.rangeBoundary as 'closed' | 'half-open';
  schema['x-openxiangda-range-boundary'] = boundary;
  const endpoint = field.type === 'date-range'
    ? { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
    : { type: 'string', format: 'date-time' };
  schema.properties = { start: endpoint, end: endpoint };
  schema.description = boundary === 'closed'
    ? 'Closed interval: start <= end; both start and end are included.'
    : 'Half-open interval: start < end; start is included and end is excluded.';
  return schema;
}
