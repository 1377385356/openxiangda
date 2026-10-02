import type { WorkflowBusinessStepNode } from 'openxiangda/config';
import type { WorkflowBusinessStepOutput, OpenXiangdaEventHandlerContext, OpenXiangdaWorkflowEffectConsumer } from 'openxiangda/nest';
const schema = { type: 'object', additionalProperties: false, required: ['amountCents'], properties: { amountCents: { type: 'integer', minimum: 0, maximum: 100_000_000 } } };
export const calculate: WorkflowBusinessStepNode = {
  id: 'calculate', kind: 'action', title: '核算金额', next: 'amount-route',
  handler: { code: 'calculate-v1', version: 1, mode: 'pure' },
  inputSchema: schema, outputSchema: schema, inputs: { amountCents: { source: 'fact', path: 'amountCents' } },
};
export function calculateAmount(context: OpenXiangdaEventHandlerContext): WorkflowBusinessStepOutput {
  const input = context.workflowStep?.input;
  if (!input || typeof input.amountCents !== 'number') throw new Error('validated step input required');
  return { output: { amountCents: input.amountCents } };
}
// The app supplies a real versioned external adapter; it never owns workflow state.
export interface EffectAdapter {
  lookup(executionId: string): ReturnType<OpenXiangdaWorkflowEffectConsumer['reconcile']>;
  execute(executionId: string): Promise<WorkflowBusinessStepOutput>;
}
export function effectConsumer(adapter: EffectAdapter): OpenXiangdaWorkflowEffectConsumer {
  return {
    reconcile: (_event, context) => adapter.lookup(context.idempotencyKey),
    handle: (_event, context) => adapter.execute(context.idempotencyKey),
  };
}
