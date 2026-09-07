import assert from 'node:assert/strict';
import test from 'node:test';
import { FIELD_VALUE_SCHEMAS } from 'openxiangda-contracts';
import {
  composeAppOperationSchemas,
  composeJsonSchema,
  resourceRecordSchema,
  schemaRef,
  type AppDataResourceDeclaration,
} from '../src/index.js';

const resource: AppDataResourceDeclaration = {
  code: 'instruments',
  name: 'Instruments',
  fields: [
    {
      code: 'name',
      type: 'text.short',
      label: 'Name',
      required: true,
      maxLength: 120,
    },
    {
      code: 'capacity',
      type: 'number.integer',
      label: 'Capacity',
      min: 0,
      max: 1000,
    },
    {
      code: 'owner',
      type: 'user.single',
      label: 'Owner',
      required: true,
    },
    {
      code: 'college',
      type: 'resource-ref.single',
      label: 'College',
      source: {
        kind: 'resource',
        resourceCode: 'colleges',
        labelField: 'name',
      },
    },
    {
      code: 'attachments',
      type: 'file',
      label: 'Attachments',
      file: { maxCount: 3 },
    },
  ],
};

test('projects one declared resource into canonical bounded record schemas', () => {
  const canonicalOwner = structuredClone(FIELD_VALUE_SCHEMAS['user.single']);
  const schema = resourceRecordSchema(resource) as any;
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), [
    'name',
    'capacity',
    'owner',
    'college',
    'attachments',
  ]);
  assert.deepEqual(schema.required, ['name', 'owner']);
  assert.equal(schema.properties.name.maxLength, 120);
  assert.equal(schema.properties.capacity.minimum, 0);
  assert.equal(schema.properties.capacity.maximum, 1000);
  assert.deepEqual(
    schema.properties.owner.properties,
    FIELD_VALUE_SCHEMAS['user.single'].properties
  );
  assert.deepEqual(schema.properties.college.properties.resourceCode, {
    const: 'colleges',
  });
  assert.equal(schema.properties.attachments.maxItems, 3);

  schema.properties.owner.properties.label.maxLength = 1;
  assert.deepEqual(FIELD_VALUE_SCHEMAS['user.single'], canonicalOwner);
});

test('selects operation fields and rejects unknown, duplicate, or unselected required fields', () => {
  const createSchema = resourceRecordSchema(resource, {
    fields: ['name', 'college'],
    required: ['name'],
  }) as any;
  assert.deepEqual(Object.keys(createSchema.properties), ['name', 'college']);
  assert.deepEqual(createSchema.required, ['name']);
  assert.throws(
    () => resourceRecordSchema(resource, { fields: ['missing'] }),
    /未声明字段 missing/
  );
  assert.throws(
    () => resourceRecordSchema(resource, { fields: ['name', 'name'] }),
    /不能重复/
  );
  assert.throws(
    () =>
      resourceRecordSchema(resource, {
        fields: ['name'],
        required: ['owner'],
      }),
    /未选择字段 owner/
  );
});

test('composes local definitions for both App Operation schemas', () => {
  const record = resourceRecordSchema(resource, {
    fields: ['name', 'owner'],
  });
  const schemas = composeAppOperationSchemas({
    request: {
      type: 'object',
      additionalProperties: false,
      required: ['record'],
      properties: { record: schemaRef('InstrumentRecord') },
    },
    response: schemaRef('InstrumentRecord'),
    definitions: { InstrumentRecord: record },
  });
  assert.deepEqual(
    (schemas.requestSchema as any).properties.record,
    schemaRef('InstrumentRecord')
  );
  assert.deepEqual(
    (schemas.requestSchema as any).$defs.InstrumentRecord,
    record
  );
  assert.deepEqual(
    (schemas.responseSchema as any).$defs.InstrumentRecord,
    record
  );
});

test('fails closed for duplicate, remote, missing, invalid, or oversized definitions', () => {
  assert.throws(() => schemaRef('../remote'), /非法 JSON Schema definition/);
  assert.throws(
    () => composeJsonSchema({ $ref: 'https://example.invalid/schema' }),
    /只允许引用已声明的本地/
  );
  assert.throws(
    () => composeJsonSchema(schemaRef('Missing')),
    /只允许引用已声明的本地/
  );
  assert.throws(
    () =>
      composeJsonSchema(
        { $defs: { Record: { type: 'object' } } },
        { Record: { type: 'object' } }
      ),
    /definition Record 重复/
  );
  assert.throws(
    () =>
      composeJsonSchema(
        {},
        Object.fromEntries(
          Array.from({ length: 65 }, (_, index) => [
            `Schema${index}`,
            { type: 'object' },
          ])
        )
      ),
    /不能超过 64 个/
  );
});
