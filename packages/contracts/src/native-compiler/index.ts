export * from './data-surface.js';
export * from './managed-concurrency.js';
export * from './draft-state.js';
export * from './data-audit-access.js';
export * from './field-query-plan.js';
export * from './data-field.js';
export * from './decimal-lifecycle.js';
export * from './field-physical-plan.js';
export * from './scope-source-field-path.js';
export * from './field-query-path.js';
export * from './compiler.js';
export * from './data-policy-expression.js';
export * from './workflow-instance-policy.js';
export * from './workflow-graph.js';
export * from './workflow-node-administration.js';
export * from './workflow-automatic-cc.js';
export * from './workflow-approval-empty.js';
export * from './workflow-initiator-approval.js';
export * from './workflow-rejection-notification.js';
export * from './workflow-business-step.js';
export * from './workflow-business-command.js';
export * from './workflow-assignment-routing.js';
export type { WorkflowAssignmentRoutingPolicy, WorkflowAssignmentRoutingRule } from '../types.js';
export type { WorkflowInstanceCommandPolicies } from '../types.js';
export type { RequiredPlatformCapabilityContract, PlatformCapabilityCode } from '../types.js';

/** 构建器按实际共享规则生成；不随应用、环境或凭据改变。 */
export const NATIVE_CONFIGURATION_VALIDATOR_DIGEST: string = "__OPENXIANGDA_NATIVE_VALIDATOR_DIGEST__";

export * from './event-action.js';

export * from './unique-keys.js';
export * from './role-membership-batch.js';
export { workflowDelegationMutationRequestSchema } from './workflow-delegation-administration.js';

export * from './workflow-business-step-identity.js';
export * from './workflow-task-page.js';
export * from './data-capacity.js';

export * from './user-candidates.js';

/** The same view projection is consumed by the platform's CommonJS runtime. */
export { projectDataResourceView } from './resource-view.js';
