import type { ResourceImportPreview } from './resource-import';

export type WorkflowImportResult = {
  rowNumber: number;
  status: 'accepted' | 'failed';
  commandId?: string;
  message?: string;
};

export async function launchWorkflowImportRows(input: {
  rows: ResourceImportPreview['rows'];
  previousResults?: WorkflowImportResult[];
  batchId: string;
  workflowCode: string;
  processOperationCode: string;
  commit: (input: {
    processOperationCode: string;
    workflowCode: string;
    idempotencyKey: string;
    mutation: { kind: 'create'; data: Record<string, unknown> };
  }) => Promise<{ id: string }>;
  concurrency?: number;
}) {
  const results = new Map(
    (input.previousResults || []).map(result => [result.rowNumber, result]),
  );
  const pendingRows = input.rows.filter(
    row => results.get(row.rowNumber)?.status !== 'accepted',
  );
  const concurrency = Math.min(
    Math.max(Math.trunc(input.concurrency || 3), 1),
    3,
    pendingRows.length,
  );
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < pendingRows.length) {
        const row = pendingRows[cursor++];
        if (!row) continue;
        try {
          const command = await input.commit({
            processOperationCode: input.processOperationCode,
            workflowCode: input.workflowCode,
            idempotencyKey: `batch:${input.workflowCode}:${input.batchId}:${row.rowNumber}`,
            mutation: { kind: 'create', data: row.data },
          });
          results.set(row.rowNumber, {
            rowNumber: row.rowNumber,
            status: 'accepted',
            commandId: command.id,
          });
        } catch (error) {
          results.set(row.rowNumber, {
            rowNumber: row.rowNumber,
            status: 'failed',
            message: error instanceof Error ? error.message : '发起失败',
          });
        }
      }
    }),
  );
  return [...results.values()].sort((left, right) => left.rowNumber - right.rowNumber);
}
