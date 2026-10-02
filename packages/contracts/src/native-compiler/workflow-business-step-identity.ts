import { sha256Digest } from '../canonical.js';
import type { AppEventHandlerContract, EventHandlerManifest } from '../native.js';
import type { WorkflowBusinessStepResult } from './workflow-business-step.js';

/** Optional result extends the existing receipt signature without changing old calls. */
export function workflowBusinessStepReceiptSignatureSuffix(result?: WorkflowBusinessStepResult): string {
  return result === undefined ? '' : `\n${sha256Digest(result)}`;
}

/** Other event handlers retain their existing whole-manifest identity. */
export function workflowBusinessStepHandlerDigest(manifest: Omit<EventHandlerManifest, 'handlers'> & { readonly handlers: readonly (Omit<AppEventHandlerContract, 'eventTypes' | 'dataSchemaVersions'> & { readonly eventTypes: readonly string[]; readonly dataSchemaVersions: readonly string[] })[] }, code: string): string {
  const handler = manifest.handlers.find(item => item.code === code);
  return sha256Digest(handler?.workflowStep ? handler : manifest);
}
