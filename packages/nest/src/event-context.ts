import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { CloudEvent } from 'openxiangda-contracts';

export interface OpenXiangdaEventHandlerContext {
  eventId: string;
  deliveryId: string;
  subscriptionCode: string;
  traceId: string;
  idempotencyKey: string;
  causationDepth: number;
}

@Injectable()
export class OpenXiangdaEventContext {
  private readonly storage =
    new AsyncLocalStorage<OpenXiangdaEventHandlerContext>();

  run<T>(
    event: CloudEvent,
    deliveryId: string,
    subscriptionCode: string,
    operation: (context: OpenXiangdaEventHandlerContext) => Promise<T> | T
  ): Promise<T> | T {
    const inputDepth = Number(
      (event.data as { cause?: { depth?: unknown } })?.cause?.depth ?? 0
    );
    const context: OpenXiangdaEventHandlerContext = Object.freeze({
      eventId: event.id,
      deliveryId,
      subscriptionCode,
      traceId: String(event.traceid || event.id),
      idempotencyKey: event.id,
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
