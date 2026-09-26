import { SCHEMA_VERSIONS, type BusinessProcessResolution, type BusinessProcessCommand, type BusinessProcessResolutionQuery } from './types.js';

/** Correlation is mandatory: a successful response belonging to another operation is not recovery. */
export function parseBusinessProcessResolution(
  value: unknown,
  expected: BusinessProcessResolutionQuery & { appCode: string },
): BusinessProcessResolution {
  const result = value as BusinessProcessResolution | null;
  const fail = () => { throw new Error('OPENXIANGDA_BUSINESS_PROCESS_RESOLUTION_RESPONSE_INVALID'); };
  if (!result || typeof result !== 'object' || result.schemaVersion !== SCHEMA_VERSIONS.businessProcessResolution) return fail();
  for (const key of ['appCode', 'environmentKey', 'operationCode', 'workflowCode', 'idempotencyKey'] as const) {
    if (result[key] !== expected[key]) return fail();
  }
  if (typeof result.observedAt !== 'string' || !Number.isFinite(Date.parse(result.observedAt))) return fail();
  if (result.outcome === 'not_observed') {
    if (result.receipt !== null) return fail();
    return result;
  }
  if (result.outcome !== 'committed' || !result.receipt) return fail();
  const receipt = result.receipt;
  const command = receipt.command;
  if (receipt.schemaVersion !== SCHEMA_VERSIONS.businessProcessReceipt || !command
    || typeof receipt.receiptId !== 'string' || !receipt.receiptId
    || typeof receipt.requestDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.requestDigest)
    || receipt.idempotencyKey !== expected.idempotencyKey || receipt.operationCode !== expected.operationCode
    || command.schemaVersion !== SCHEMA_VERSIONS.businessProcessCommand
    || typeof command.id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(command.id) || command.id !== receipt.commandId
    || command.appCode !== expected.appCode || command.environmentKey !== expected.environmentKey
    || command.operationCode !== expected.operationCode || command.idempotencyKey !== expected.idempotencyKey
    || command.workflowCode !== expected.workflowCode || !Number.isSafeInteger(command.revision) || command.revision < 1) return fail();
  return result;
}

/** Verify a commit response before allowing the caller to discard its original attempt. */
export function parseBusinessProcessCommitResult(value: unknown, expected: BusinessProcessResolutionQuery & { appCode: string }): BusinessProcessCommand {
  const command = value as BusinessProcessCommand | null;
  if (!command || command.schemaVersion !== SCHEMA_VERSIONS.businessProcessCommand
    || typeof command.id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(command.id)
    || command.appCode !== expected.appCode || command.environmentKey !== expected.environmentKey
    || command.operationCode !== expected.operationCode || command.idempotencyKey !== expected.idempotencyKey
    || command.workflowCode !== expected.workflowCode || !Number.isSafeInteger(command.revision) || command.revision < 1) {
    throw new Error('OPENXIANGDA_BUSINESS_PROCESS_COMMIT_RESPONSE_INVALID');
  }
  return command;
}
