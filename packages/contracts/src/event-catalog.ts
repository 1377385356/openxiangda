import {
  DATA_EVENT_TYPES_V2,
  SCHEMA_VERSIONS,
  WORKFLOW_EVENT_TYPES_V2,
  type EventCatalogEntry,
} from './types.js';

export const EVENT_DATA_MAX_BYTES_V2 = 64 * 1024;
export const EVENT_INLINE_FIELD_MAX_BYTES_V2 = 4 * 1024;
export const EVENT_WAKE_MAX_BYTES_V2 = 1024;
export const APPLICATION_EVENT_HANDLER_PATH_PREFIX_V2 =
  '/__platform/events' as const;
export const EVENT_DELIVERY_SIGNATURE_SCHEMA_V2 =
  'openxiangda.event-delivery-signature/v2' as const;

export function applicationEventHandlerPathV2(subscriptionCode: string) {
  return `${APPLICATION_EVENT_HANDLER_PATH_PREFIX_V2}/${subscriptionCode}`;
}

export function eventDeliverySignatureContentV2(input: {
  timestamp: string;
  signingKeyVersion: string;
  deliveryId: string;
  eventId: string;
  subscriptionCode: string;
  handlerManifestDigest: string;
  rawBody: string;
}) {
  return [
    EVENT_DELIVERY_SIGNATURE_SCHEMA_V2,
    input.timestamp,
    input.signingKeyVersion,
    input.deliveryId,
    input.eventId,
    input.subscriptionCode,
    input.handlerManifestDigest,
    input.rawBody,
  ].join('\n');
}

export const DATA_RECORD_EVENT_DATA_SCHEMA_V2 = {
  $id: 'openxiangda://events/openxiangda.data.record/v2',
  type: 'object',
  additionalProperties: false,
  required: [
    'resourceCode',
    'recordId',
    'operation',
    'revision',
    'changedFields',
    'projection',
    'actor',
    'cause',
  ],
  properties: {
    resourceCode: { type: 'string', minLength: 1, maxLength: 128 },
    recordId: { type: 'string', minLength: 1, maxLength: 128 },
    operation: { enum: ['created', 'updated', 'deleted'] },
    revision: { type: 'integer', minimum: 0 },
    changedFields: {
      type: 'array',
      uniqueItems: true,
      maxItems: 100,
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
    changes: { type: 'object', maxProperties: 100 },
    projection: { type: 'object', maxProperties: 64 },
    actor: {
      type: 'object',
      additionalProperties: false,
      required: ['principalType', 'subjectId'],
      properties: {
        principalType: {
          enum: [
            'user',
            'user_union',
            'application',
            'developer',
            'workflow',
            'timer',
            'system',
          ],
        },
        subjectId: { type: 'string', minLength: 1, maxLength: 255 },
      },
    },
    cause: {
      type: 'object',
      additionalProperties: false,
      required: ['eventId', 'subscriptionCode', 'depth'],
      properties: {
        eventId: { type: ['string', 'null'] },
        subscriptionCode: { type: ['string', 'null'] },
        depth: { type: 'integer', minimum: 0, maximum: 16 },
      },
    },
  },
} as const;

export const WORKFLOW_EVENT_DATA_SCHEMA_V2 = {
  $id: 'openxiangda://events/openxiangda.workflow.fact/v2',
  type: 'object',
  maxProperties: 48,
  required: [
    'workflowCode',
    'definitionVersion',
    'bindingVersion',
    'instanceId',
    'generation',
    'businessKey',
    'instanceSequence',
    'revision',
    'dataRef',
    'dataRevision',
    'actor',
    'cause',
  ],
  properties: {
    workflowCode: { type: 'string', minLength: 1, maxLength: 128 },
    definitionVersion: { type: 'integer', minimum: 1 },
    bindingVersion: { type: 'integer', minimum: 1 },
    instanceId: { type: 'string', minLength: 1, maxLength: 128 },
    generation: { type: 'integer', minimum: 1 },
    businessKey: { type: 'string', minLength: 1, maxLength: 255 },
    taskId: { type: ['string', 'null'], maxLength: 128 },
    participantId: { type: ['string', 'null'], maxLength: 128 },
    instanceSequence: { type: 'integer', minimum: 1 },
    revision: { type: 'integer', minimum: 1 },
    dataRef: { type: 'object' },
    dataRevision: { type: 'string', minLength: 1, maxLength: 128 },
    actor: { type: 'object' },
    cause: { type: 'object' },
  },
} as const;

const dataCatalog = DATA_EVENT_TYPES_V2.map<EventCatalogEntry>(eventType => ({
  schemaVersion: SCHEMA_VERSIONS.eventCatalog,
  eventType,
  owner: 'platform',
  dataSchemaVersion: '2.0.0',
  producerKinds: ['data'],
  subjectPattern: '/records/{recordId}',
  orderingKey: 'record',
  replayable: true,
  maxDataBytes: EVENT_DATA_MAX_BYTES_V2,
  sensitiveFields: [],
  status: 'active',
}));

const workflowCatalog = WORKFLOW_EVENT_TYPES_V2.map<EventCatalogEntry>(
  eventType => ({
    schemaVersion: SCHEMA_VERSIONS.eventCatalog,
    eventType,
    owner: 'platform',
    dataSchemaVersion: '2.0.0',
    producerKinds: ['workflow'],
    subjectPattern: eventType.includes('.participant.')
      ? '/workflow-instances/{instanceId}/tasks/{taskId}/participants/{participantId}'
      : eventType.includes('.task.')
      ? '/workflow-instances/{instanceId}/tasks/{taskId}'
      : '/workflow-instances/{instanceId}',
    orderingKey: 'workflow_instance',
    replayable: true,
    maxDataBytes: EVENT_DATA_MAX_BYTES_V2,
    sensitiveFields: [],
    status: 'active',
  })
);

export const PLATFORM_EVENT_CATALOG_V2: readonly EventCatalogEntry[] =
  Object.freeze([...dataCatalog, ...workflowCatalog]);

export const PLATFORM_EVENT_TYPES_V2 = Object.freeze(
  PLATFORM_EVENT_CATALOG_V2.map(entry => entry.eventType)
);
