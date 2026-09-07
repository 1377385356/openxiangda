/** 纯编译器版本与能力契约；应用不能扩展此表，新增项必须有对应平台实现。 */
export const OPENXIANGDA_COMPILER_CONTRACT_VERSION = "native-4" as const;

export const PLATFORM_CAPABILITY_CONTRACT_VERSIONS = {
  "application-native-2": "1.0.0",
  "authz.native-batch-explain": "1.0.0",
  "authz.native-management": "1.0.0",
  "deployment.durable-runs": "1.0.0",
  "deployment.platform-executor": "1.0.0",
  "environment.on-demand-production": "1.0.0",
  "environment.runtime-lifecycle": "1.0.0",
  "data-api-v2": "1.0.0",
  "data.native-golden-crud": "1.0.0",
  "data.managed-files": "1.1.0",
  "workflow.named-input-sources": "1.0.0",
  "directory-v2": "1.0.0",
  "events-v2": "1.0.0",
  "events.durable-receipts": "1.0.0",
  "workflow-kernel-v2": "1.0.0",
  "business-process.durable-command": "1.0.0",
  "workflow.fresh-command-token": "1.0.0",
  "notification-hub-v2": "1.0.0",
  "authentication.application-login-surface": "1.0.0",
  "public-access.anonymous-owner-records": "1.0.0",
} as const;
