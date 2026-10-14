import { DATA_RESOURCE_MAX_FIELDS } from './data-capacity.js';
import { WORKFLOW_CONFIGURABLE_OPERATIONS } from './workflow-node-administration.js';
import { WORKFLOW_DEFINITION_SCHEMA_VERSION, WORKFLOW_BINDING_SCHEMA_VERSION, WORKFLOW_SUMMARY_MAX_FIELDS } from './workflow-schema-constants.js';
const nonEmptyString = { type: 'string', minLength: 1 } as const;
const dataFieldCode = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,62}$' } as const;

/** Workflow document shape is pure; protocol and platform consumers share this one owner. */
export { workflowExpressionSchema } from './workflow-expression-schema.js';
import { workflowExpressionSchema } from './workflow-expression-schema.js';
import { workflowStandardBindingEntrySchema } from './workflow-standard-binding-schema.js';
import { workflowConditionalAssignmentSchema } from './workflow-conditional-assignment-schema.js';

// Readability is already part of the canonical definition. Keep shape checks
// closed here; validateWorkflowReadability owns referenced paths and node IDs.
const readabilityText = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const readabilityPaths = { type: 'array', maxItems: 32, uniqueItems: true, items: readabilityText(256) };
const workflowReadabilitySchema = {
  type: 'object', additionalProperties: false, minProperties: 1,
  properties: {
    variables: { type: 'object', maxProperties: 128, propertyNames: readabilityText(256), additionalProperties: {
      type: 'object', additionalProperties: false, required: ['label'],
      properties: { label: readabilityText(160), unit: readabilityText(32), description: readabilityText(2000) },
    } },
    logic: { type: 'array', maxItems: 32, items: {
      type: 'object', additionalProperties: false, required: ['code', 'title', 'description', 'phase', 'inputPaths'],
      properties: {
        code: { type: 'string', pattern: '^[a-z][a-z0-9-]{2,63}$' }, title: readabilityText(160), description: readabilityText(4000),
        phase: { enum: ['submission', 'node_input', 'completion'] }, nodeId: readabilityText(128),
        inputPaths: readabilityPaths, outputPaths: readabilityPaths,
        source: { type: 'object', additionalProperties: false, required: ['path', 'digest'], properties: {
          path: readabilityText(256), symbol: readabilityText(160), digest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
        } },
      },
    } },
  },
};

const workflowCcNodeSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'kind', 'title', 'binding', 'next', 'emptyPolicy'],
  properties: {
    id: nonEmptyString, kind: { const: 'cc' }, title: nonEmptyString,
    binding: nonEmptyString, next: nonEmptyString,
    emptyPolicy: { enum: ['block', 'skip'] }, notify: { type: 'boolean' },
    administration: {
      type: 'object', additionalProperties: false,
      properties: {
        assigneeProviders: { type: 'array', minItems: 1, maxItems: 3, uniqueItems: true, items: { enum: ['fixed_users', 'app_role', 'app_role_in_scope'] } },
      },
    },
  },
} as const;

const workflowReminderSchema = { type: 'object', additionalProperties: false, required: ['afterSeconds','everySeconds','max','to'], properties: { afterSeconds: { type: 'integer', minimum: 1, maximum: 2592000 }, everySeconds: { type: 'integer', minimum: 1, maximum: 2592000 }, max: { type: 'integer', minimum: 1, maximum: 10 }, to: { type: 'array', minItems: 1, maxItems: 1, items: { const: 'handlers' } } } };
export const workflowBusinessStepNodeSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'kind', 'title', 'next', 'handler', 'inputSchema', 'outputSchema', 'inputs'],
  properties: {
    id: nonEmptyString, kind: { const: 'action' }, title: nonEmptyString, next: nonEmptyString,
    handler: {
      type: 'object', additionalProperties: false, required: ['code', 'version', 'mode'],
      properties: { code: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,100}$' }, version: { type: 'integer', minimum: 1, maximum: 1_000_000 }, mode: { enum: ['pure', 'reconciled-effect'] }, dataTransaction: { const: true } },
      allOf: [{ if: { required: ['dataTransaction'] }, then: { properties: { mode: { const: 'reconciled-effect' } } } }],
    },
    notification: { type: 'object', additionalProperties: false, required: ['template','recipients'], properties: {
      template: { const: 'workflow_message' }, recipients: { oneOf: [
        { type: 'object', additionalProperties: false, required: ['provider'], properties: { provider: { const: 'initiator' } } },
        { type: 'object', additionalProperties: false, required: ['provider','users'], properties: { provider: { const: 'fixed_users' }, users: { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 255 } } } },
        { type: 'object', additionalProperties: false, required: ['provider','roleCode'], properties: { provider: { const: 'app_role' }, roleCode: nonEmptyString } },
        { type: 'object', additionalProperties: false, required: ['provider','inputPath'], properties: { provider: { const: 'form_field_users' }, inputPath: nonEmptyString } },
      ] },
    } },
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
    inputs: { type: 'object', maxProperties: 32, additionalProperties: {
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['source', 'path'], properties: { source: { const: 'fact' }, path: { type: 'string', minLength: 1, maxLength: 256 } } },
        { type: 'object', additionalProperties: false, required: ['source', 'value'], properties: { source: { const: 'literal' }, value: {} } },
      ],
    } },
  },
} as const;

const workflowReturnPolicySchema = {
  type: 'object', additionalProperties: false, required: ['targets'], properties: {
    targets: { type: 'array', maxItems: 20, items: {
      type: 'object', additionalProperties: false, required: ['nodeId','routes','defaultRoute'],
      properties: { nodeId: nonEmptyString, routes: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: ['replay','resume'] } }, defaultRoute: { enum: ['replay','resume'] } },
    } },
  },
};
const workflowNodeSchema = {
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      required: ['id', 'kind', 'title', 'binding', 'mode', 'next', 'allowedOperations', 'requiredOperations'],
      properties: {
        id: nonEmptyString, kind: { const: 'handle' }, title: nonEmptyString, reminders: workflowReminderSchema,
        binding: nonEmptyString, mode: { enum: ['single', 'any', 'all', 'sequence'] },
        next: nonEmptyString, emptyPolicy: { const: 'block' },
        taskPageCode: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' },
        allowedOperations: { type: 'array', uniqueItems: true, items: { enum: ['complete', 'save_form', 'return', 'transfer', 'delegate'] } },
        requiredOperations: { type: 'array', uniqueItems: true, items: { enum: ['complete', 'save_form', 'return', 'transfer', 'delegate'] } },
        returnPolicy: workflowReturnPolicySchema,
        returnTargets: { type: 'array', items: nonEmptyString, uniqueItems: true },
        operationPolicy: { type: 'object', additionalProperties: false, properties: Object.fromEntries(['complete','save_form','return','transfer','delegate'].map(operation => [operation, {
          type: 'object', additionalProperties: false, minProperties: 1,
          properties: { label: { type: 'string', minLength: 1, maxLength: 40 },
            ...(operation !== 'save_form' ? { opinion: { enum: ['none','optional','required'] }, minimumOpinion: { enum: ['none','optional','required'] } } : {}),
            ...(operation === 'complete' ? { commentRequired: { type: 'boolean' } } : {}),
            ...(['return','transfer','delegate'].includes(operation) ? { reasonRequired: { type: 'boolean' } } : {}) },
        }])) },
        administration: { type: 'object', additionalProperties: false, properties: {
          modes: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 4, items: { enum: ['single','any','all','sequence'] } },
          assigneeProviders: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 3, items: { enum: ['fixed_users','app_role','app_role_in_scope'] } },
          operations: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 5, items: { enum: ['complete','save_form','return','transfer','delegate'] } },
        } },
        fieldPolicy: { type: 'object', additionalProperties: false, properties: { default: { enum: ['hidden','readonly','edit','edit_required'] }, fields: { type: 'object', additionalProperties: { enum: ['hidden','readonly','edit','edit_required'] } } } },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "title",
        "binding",
        "mode",
        "onApprove",
        "onReject",
      ],
      properties: {
        id: nonEmptyString,
        kind: { const: "approval" },
        reminders: workflowReminderSchema,
        title: nonEmptyString,
        binding: nonEmptyString,
        mode: { enum: ["single", "any", "all", "sequence"] },
        emptyPolicy: { enum: ["block", "skip"] },
        initiatorApprovalPolicy: { enum: ["manual", "auto_approve"] },
        completionDeadline: {
          type: 'object', additionalProperties: false, required: ['afterSeconds', 'action'],
          properties: { afterSeconds: { type: 'integer', minimum: 1, maximum: 2592000 }, action: { const: 'approve' } },
        },
        onApprove: nonEmptyString,
        onReject: nonEmptyString,
        taskPageCode: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' },
        operationPolicy: {
          type: 'object', additionalProperties: false,
          properties: Object.fromEntries(WORKFLOW_CONFIGURABLE_OPERATIONS.map(operation => [operation, {
            type: 'object', additionalProperties: false, minProperties: 1,
            properties: {
              label: { type: 'string', minLength: 1, maxLength: 40, pattern: '^(?!.*[\\u0000-\\u001f\\u007f])(?=.*\\S).*$' },
              ...(operation !== 'save_form' ? { opinion: { enum: ['none', 'optional', 'required'] }, minimumOpinion: { enum: ['none', 'optional', 'required'] } } : {}),
              ...(['complete', 'approve', 'reject'].includes(operation) ? { commentRequired: { type: 'boolean' } } : {}),
              ...(['transfer', 'delegate', 'add_assignee', 'return'].includes(operation) ? { reasonRequired: { type: 'boolean' } } : {}),
            },
          }])),
        },
        administration: {
          type: 'object', additionalProperties: false,
          properties: {
            modes: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: { enum: ['single', 'any', 'all', 'sequence'] } },
            assigneeProviders: { type: 'array', minItems: 1, maxItems: 3, uniqueItems: true, items: { enum: ['fixed_users', 'app_role', 'app_role_in_scope'] } },
            operations: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { enum: [...WORKFLOW_CONFIGURABLE_OPERATIONS] } },
          },
        },
        requiredOperations: { type: 'array', minItems: 1, maxItems: 7, uniqueItems: true, items: { enum: [...WORKFLOW_CONFIGURABLE_OPERATIONS] } },
        allowedOperations: {
          type: "array",
          uniqueItems: true,
          items: {
            enum: [
              "approve",
              "reject",
              "return",
              "transfer",
              "delegate",
              "add_assignee",
              "resubmit",
              "save_form",
              "admin_reassign",
              "admin_override",
            ],
          },
        },
        returnPolicy: workflowReturnPolicySchema,
        returnTargets: {
          type: "array",
          uniqueItems: true,
          items: nonEmptyString,
        },
        fieldPolicy: {
          type: "object",
          additionalProperties: false,
          properties: {
            default: {
              enum: ["hidden", "readonly", "edit", "edit_required"],
            },
            fields: {
              type: "object",
              additionalProperties: {
                enum: ["hidden", "readonly", "edit", "edit_required"],
              },
            },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "branches", "otherwise"],
      properties: {
        id: nonEmptyString,
        kind: { const: "condition" },
        title: { type: "string" },
        branches: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["when", "target"],
            properties: {
              when: workflowExpressionSchema,
              target: nonEmptyString,
              label: { type: "string" },
            },
          },
        },
        otherwise: nonEmptyString,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "title", "outcome"],
      properties: {
        id: nonEmptyString,
        kind: { const: "end" },
        title: nonEmptyString,
        outcome: nonEmptyString,
      },
    },
    workflowCcNodeSchema,
    workflowBusinessStepNodeSchema,
    { type: 'object', additionalProperties: false, required: ['id', 'kind', 'title', 'taskPageCode', 'next'],
      properties: { id: nonEmptyString, kind: { const: 'correction' }, title: nonEmptyString, reminders: workflowReminderSchema,
        taskPageCode: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' }, next: nonEmptyString } },
  ],
} as const;

export const workflowDefinitionSchema = {
  $id: WORKFLOW_DEFINITION_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "code",
    "title",
    "acceptedCommandDeactivationPolicy",
    "subject",
    "startAt",
    "inputSchema",
    "nodes",
  ],
  properties: {
    schemaVersion: { const: WORKFLOW_DEFINITION_SCHEMA_VERSION },
    authoring: {
      type: 'object', additionalProperties: false, properties: {
        businessSteps: { type: 'array', maxItems: 100, items: {
          type: 'object', additionalProperties: false, required: ['title', 'handler', 'inputSchema', 'outputSchema'],
          properties: { title: {type:'string',minLength:1,maxLength:160},
            handler: {type:'object',additionalProperties:false,required:['code','version','mode'],properties:{code:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,127}$'},version:{type:'integer',minimum:1},mode:{enum:['pure','reconciled-effect']},dataTransaction:{const:true}}},
            inputSchema: {type:'object'}, outputSchema: {type:'object'} }
        } }
      }
    },
    code: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,127}$" },
    title: nonEmptyString,
    launchPreflight: {
      type: 'object', additionalProperties: false, required: ['requiredApprovalNodes'],
      properties: { requiredApprovalNodes: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true,
        items: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,127}$' } } },
    },
    approvedDelegation: {
      type: 'object', additionalProperties: false,
      required: ['confirmationNodeId', 'confirmer', 'requestsField', 'maxRequests'],
      properties: {
        confirmationNodeId: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,127}$' },
        confirmer: { enum: ['initiator', 'delegate'] },
        requestsField: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,62}$' },
        maxRequests: { type: 'integer', minimum: 1, maximum: 500 },
      },
    },
    commandHandlers: {
      type: 'object', additionalProperties: false, minProperties: 1,
      properties: Object.fromEntries(['approve', 'reject', 'withdraw', 'resubmit'].map(command => [command, {
        type: 'object', additionalProperties: false, required: ['operationCode'],
        properties: { operationCode: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$' },
          ...(command === 'approve' ? { transitionPolicy: { const: 'workflow' } } : {}),
          ...(command === 'resubmit' ? { derivedSubjectFields: { type: 'array', minItems: 1, maxItems: 32, uniqueItems: true,
            items: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,62}$' } } } : {}) },
      }])),
    },
    taskPages: {
      type: 'object', minProperties: 1, maxProperties: 16,
      propertyNames: { pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' },
      additionalProperties: {
        type: 'object', additionalProperties: false, required: ['title', 'fields'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 160 },
          fields: {
            type: 'array', minItems: 1, maxItems: DATA_RESOURCE_MAX_FIELDS,
            items: {
              type: 'object', additionalProperties: false, required: ['code'],
              properties: {
                code: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,62}$' },
                readonly: { type: 'boolean' }, required: { type: 'boolean' },
                visibleWhen: workflowExpressionSchema, requiredWhen: workflowExpressionSchema,
              },
            },
          },
        },
      },
    },
    acceptedCommandDeactivationPolicy: {
      enum: ["finish-pinned", "cancel-on-deactivate"],
    },
    rejectionNotification: {
      type: 'object', additionalProperties: false,
      required: ['recipient', 'title', 'summary'],
      properties: {
        recipient: { const: 'record_last_modifier' },
        title: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' },
        summary: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
      },
    },
    instanceCommands: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: {
        withdraw: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            beforeFact: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$" },
            reasonRequired: { type: "boolean" },
          },
        },
        terminate: {
          type: "object",
          additionalProperties: false,
          required: ["capability"],
          properties: {
            capability: { type: "string", maxLength: 255, pattern: "^app:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[A-Za-z0-9:._-]+$" },
            beforeFact: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$" },
          },
        },
      },
    },
    subject: {
      type: "object",
      additionalProperties: false,
      required: ["resourceCode", "factProjection", "summaryFields"],
      properties: {
        resourceCode: {
          type: "string",
          pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
        },
        factProjection: {
          type: "object",
          minProperties: 1,
          maxProperties: 64,
          propertyNames: {
            pattern: "^[A-Za-z][A-Za-z0-9_.]{0,127}$",
          },
          additionalProperties: {
            type: "string",
            pattern: "^[A-Za-z][A-Za-z0-9_]{0,62}$",
          },
        },
        summaryFields: {
          type: "array",
          maxItems: WORKFLOW_SUMMARY_MAX_FIELDS,
          uniqueItems: true,
          items: dataFieldCode,
        },
      },
    },
    startAt: nonEmptyString,
    inputSchema: {
      type: "object",
      required: ["type", "additionalProperties"],
      properties: {
        type: { const: "object" },
        additionalProperties: { const: false },
      },
    },
    readability: workflowReadabilitySchema,
    organizationContext: {
      type: "object",
      additionalProperties: false,
      properties: {
        department: {
          type: "object",
          additionalProperties: false,
          required: ["source"],
          properties: {
            source: {
              enum: [
                "none",
                "user_primary_department",
                "choose_if_multiple",
                "always_choose",
                "fixed",
                "from_input",
                "from_role_scope",
              ],
            },
            required: { type: "boolean" },
            value: { type: "string" },
            path: { type: "string" },
            dimension: { type: "string" },
          },
        },
      },
    },
    nodes: {
      type: "object",
      minProperties: 1,
      maxProperties: 200,
      additionalProperties: workflowNodeSchema,
    },
  },
} as const;

export const workflowBindingSchema = {
  $id: WORKFLOW_BINDING_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "workflowCode", "bindings"],
  properties: {
    schemaVersion: { const: WORKFLOW_BINDING_SCHEMA_VERSION },
    workflowCode: nonEmptyString,
    bindings: {
      type: "object",
      maxProperties: 200,
      additionalProperties: {
        oneOf: [workflowStandardBindingEntrySchema, workflowConditionalAssignmentSchema],
      },
    },
  },
} as const;

