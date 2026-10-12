import { workflowStandardBindingEntrySchema } from './workflow-standard-binding-schema.js';
import { workflowExpressionSchema } from './workflow-expression-schema.js';
export const WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES = 20;
export const WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_BYTES = 16_384;
export const WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS = [
  'fixed_users', 'app_role', 'app_role_in_scope', 'supervisor_chain',
  'form_field_users', 'input_users', 'initiator', 'previous_node_actor', 'business_relation',
] as const;
const leafSchema = workflowStandardBindingEntrySchema;
export const workflowConditionalAssignmentSchema = {
  type: 'object', additionalProperties: false, required: ['provider', 'cases', 'otherwise'],
  properties: {
    provider: { const: 'conditional' },
    cases: { type: 'array', minItems: 1, maxItems: WORKFLOW_CONDITIONAL_ASSIGNMENT_MAX_CASES,
      items: { type: 'object', additionalProperties: false, required: ['when', 'assignee'],
        properties: { label: { type: 'string', minLength: 1, maxLength: 160 }, when: workflowExpressionSchema,
          assignee: { ...leafSchema, properties: { ...leafSchema.properties, provider: { enum: WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS } } } } } },
    otherwise: { ...leafSchema, properties: { ...leafSchema.properties, provider: { enum: WORKFLOW_CONDITIONAL_ASSIGNMENT_LEAF_PROVIDERS } } },
  },
} as const;
