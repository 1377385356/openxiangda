export * from './browser/application';
export * from './browser/authentication';
export * from './browser/admin-contributions';
export * from './browser/admin-access';
export * from './browser/admin-information-architecture';
export * from './browser/ui-provider';
export * from './browser/data-provider';
export * from './browser/FilePreviewPage';
export * from './browser/OpenXiangdaAdminPage';
export * from './browser/runtime';
export * from './browser/route-manifest';
export * from './browser/standard-user-surfaces';
export * from './browser/Shell';
export * from './browser/resource-definitions';
export * from './browser/workflow-definitions';
export * from './browser/workflow-launch';
export {
  createResourceFormDraftClient,
  type ResourceFormDraft,
  createAnonymousPublicClient,
  type AnonymousPublicDraft,
  type AnonymousPublicRecord,
} from './browser/platform-client';
export type { WorkflowCommandResult } from 'openxiangda-contracts/browser';
export * from './browser/components/resource/GeneratedResourceCrud';
export * from './browser/components/resource/ResourceBatchActions';
export * from './browser/components/resource/StandardResourcePages';
export * from './browser/components/workflow/StandardWorkflowPages';
export * from './browser/components/PlatformAvatar';
export * from './browser/components/todo/ApplicationTodoCenterPage';
export type * from './browser/components/resource/generated-resource-definition';
