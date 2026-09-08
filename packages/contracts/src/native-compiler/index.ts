export * from './data-surface.js';
export * from './data-audit-access.js';
export * from './field-query-plan.js';
export * from './data-field.js';
export * from './field-physical-plan.js';
export * from './scope-source-field-path.js';
export * from './field-query-path.js';
export * from './compiler.js';
export * from './data-policy-expression.js';
export * from './workflow-instance-policy.js';
export type { WorkflowInstanceCommandPolicies } from '../types.js';
export type { RequiredPlatformCapabilityContract, PlatformCapabilityCode } from '../types.js';

/** 构建器按实际共享规则生成；不随应用、环境或凭据改变。 */
export const NATIVE_CONFIGURATION_VALIDATOR_DIGEST: string = "__OPENXIANGDA_NATIVE_VALIDATOR_DIGEST__";
