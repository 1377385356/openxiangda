import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { WORKFLOW_BUSINESS_STEP_EVENT, type CloudEvent, type WorkflowBusinessStepRequest } from 'openxiangda-contracts';

export interface OpenXiangdaEventHandlerContext {
  tenantId: string;
  environmentKey: string;
  /** SDK-internal, never selected or renewed by application business code. */
  receiptClaimToken?: string;
  eventId: string;
  deliveryId: string;
  subscriptionCode: string;
  traceId: string;
  idempotencyKey: string;
  causationDepth: number;
  workflowStep?: WorkflowBusinessStepRequest;
}

@Injectable()
export class OpenXiangdaEventContext {
  private readonly storage =
    new AsyncLocalStorage<OpenXiangdaEventHandlerContext>();

  run<T>(
    event: CloudEvent,
    deliveryId: string,
    subscriptionCode: string,
    operation: (context: OpenXiangdaEventHandlerContext) => Promise<T> | T,
    receiptClaimToken?: string
  ): Promise<T> | T {
    const inputDepth = Number(
      (event.data as { cause?: { depth?: unknown } })?.cause?.depth ?? 0
    );
    const step = event.type === WORKFLOW_BUSINESS_STEP_EVENT ? (event.data as { step?: WorkflowBusinessStepRequest }).step : undefined;
    const context: OpenXiangdaEventHandlerContext = Object.freeze({
      tenantId: event.tenantid,
      environmentKey: event.environment,
      ...(receiptClaimToken ? { receiptClaimToken } : {}),
      eventId: event.id,
      deliveryId,
      subscriptionCode,
      traceId: String(event.traceid || event.id),
      idempotencyKey: step?.executionId || event.id,
      ...(step ? { workflowStep: step } : {}),
      causationDepth:
        Number.isSafeInteger(inputDepth) && inputDepth >= 0
          ? inputDepth + 1
          : 1,
    });
    return this.storage.run(context, () => operation(context));
  }

  current() {
    return this.storage.getStore() || null;
  }
}
