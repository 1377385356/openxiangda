import { workflowAssignmentRoutingPolicySchema } from './workflow-assignment-routing.js';
import { workflowRoleCodesSchema } from './workflow-role-union.js';
const nonEmptyString = { type: 'string', minLength: 1 } as const;
const dataFieldCode = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,62}$' } as const;
/** Standard, nonconditional leaf shape; never references the enclosing binding document. */
export const workflowStandardBindingEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["provider"],
  allOf: [{
    if: { required: ['roleCodes'] },
    then: { properties: { provider: { enum: ['app_role', 'app_role_in_scope'] } }, not: { anyOf: [{ required: ['roleCode'] }, { required: ['candidateField'] }] } },
  }, {
    if: { required: ['candidateField'] },
    then: {
      required: ['inputPath'],
      properties: { provider: { const: 'form_field_users' } },
      not: { anyOf: [{ required: ['roleCode'] }, { required: ['scope'] }, { required: ['routing'] }] },
    },
  }, {
    if: { required: ['selectedInputPath'] },
    then: { properties: { provider: { enum: ['app_role', 'app_role_in_scope'] } },
      anyOf: [{ required: ['roleCode'] }, { required: ['roleCodes'] }],
      not: { anyOf: [{ required: ['candidateField'] }, { required: ['inputPath'] }, { required: ['routing'] }] } },
  }],
  properties: {
    provider: {
      enum: [
        "fixed_users",
        "initiator",
        "input_users",
        "form_field_users",
        "department_supervisor",
        "supervisor_chain",
        "app_role",
        "app_role_in_scope",
        "business_relation",
        "previous_node_actor",
        "initiator_select",
        "application_provider",
      ],
    },
    users: { type: "array", uniqueItems: true, items: nonEmptyString },
    inputPath: { type: "string" },
    selectedInputPath: { type: "string", maxLength: 255, pattern: "^[A-Za-z][A-Za-z0-9_-]*(?:\\.[A-Za-z][A-Za-z0-9_-]*)*$" },
    candidateField: dataFieldCode,
    from: { oneOf: [{const:'initiator'},{type:'object',additionalProperties:false,required:['field'],properties:{field:{type:'string',maxLength:255}}}] },
    until: { oneOf: [{const:'top'},{type:'object',additionalProperties:false,required:['level'],properties:{level:{type:'integer',minimum:1,maximum:20}}},{type:'object',additionalProperties:false,required:['roleCode'],properties:{roleCode:nonEmptyString}}] },
    continuous: { type:'boolean' }, missing: {enum:['skip_level','block']},
    departmentIdFrom: { type: "string" },
    level: { type: "integer", minimum: 1, maximum: 20 },
    fallbackToAncestorSupervisor: { type: "boolean" },
    roleCode: { type: "string" },
    roleCodes: workflowRoleCodesSchema,
    scope: {
      type: "object",
      additionalProperties: false,
      required: ["dimension"],
      properties: {
        dimension: nonEmptyString,
        valueFrom: { type: "string" },
        value: { type: "string" },
      },
    },
    relationCode: { type: "string" },
    resourceCode: { type: "string" },
    resourceIdFrom: { type: "string" },
    providerCode: { type: "string" },
    min: { type: "integer", minimum: 1, maximum: 200 },
    max: { type: "integer", minimum: 1, maximum: 200 },
    delegatable: { type: "boolean" },
    routing: workflowAssignmentRoutingPolicySchema,
  },
} as const;
