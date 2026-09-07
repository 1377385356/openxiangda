import { Inject, Injectable, Logger, Optional, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { OpenXiangdaEventContext } from './event-context.js';
import type { OpenXiangdaHttpRequest } from './types.js';

export interface OpenXiangdaLogFields {
  step?: string;
  code?: string;
  durationMs?: number;
}

/** Small structured facade over Nest's configured logger; no independent log service. */
@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaLoggerService {
  private readonly logger = new Logger('OpenXiangdaApplication');

  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Optional() @Inject(OpenXiangdaEventContext) private readonly events?: OpenXiangdaEventContext,
  ) {}

  log(message: string, fields: OpenXiangdaLogFields = {}) { this.logger.log(this.entry(message, fields)); }
  warn(message: string, fields: OpenXiangdaLogFields = {}) { this.logger.warn(this.entry(message, fields)); }
  error(message: string, fields: OpenXiangdaLogFields = {}) { this.logger.error(this.entry(message, fields)); }

  context(): Readonly<Record<string, string>> {
    const verified = this.request?.openxiangda;
    const principal = verified?.principal;
    const event = this.events?.current();
    const rawId = this.request?.headers?.['x-request-id'];
    const requestId = identifier(Array.isArray(rawId) ? rawId[0] : rawId);
    return Object.freeze({
      ...(principal ? { appCode: principal.appCode, environmentKey: principal.environmentKey } : {}),
      ...(verified?.operation ? { actionCode: verified.operation.code } : {}),
      ...(requestId ? { requestId } : {}),
      ...(event ? { eventId: event.eventId, deliveryId: event.deliveryId, traceId: event.traceId, subscriptionCode: event.subscriptionCode } : {}),
    });
  }

  private entry(message: string, fields: OpenXiangdaLogFields) {
    return {
      message: String(message).slice(0, 1024),
      ...this.context(),
      ...(identifier(fields.step) ? { step: identifier(fields.step) } : {}),
      ...(identifier(fields.code) ? { code: identifier(fields.code) } : {}),
      ...(Number.isFinite(fields.durationMs) && Number(fields.durationMs) >= 0 ? { durationMs: fields.durationMs } : {}),
    };
  }
}

function identifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : undefined;
}
