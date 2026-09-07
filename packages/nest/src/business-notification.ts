import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type {
  BusinessNotificationSendV2,
  EventBusinessNotificationSendV2,
} from 'openxiangda-contracts';
import { OpenXiangdaApplicationCredentials } from './application-credentials.js';
import { requireOpenXiangdaBusinessActionContext } from './business-action-context.js';
import { OpenXiangdaEventContext } from './event-context.js';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import type { OpenXiangdaHttpRequest } from './types.js';

export type OpenXiangdaBusinessNotificationInput = Omit<
  BusinessNotificationSendV2,
  'environmentKey'
>;
export type OpenXiangdaEventBusinessNotificationInput = Omit<
  EventBusinessNotificationSendV2,
  'environmentKey'
>;

/**
 * Channel-neutral Notification Hub facade for an authorized Named Action.
 *
 * The platform revalidates the action proof and promotes the call to the exact
 * app/environment application principal while retaining the initiator audit.
 */
@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaBusinessNotificationService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient,
    @Inject(OpenXiangdaApplicationCredentials)
    private readonly credentials: OpenXiangdaApplicationCredentials,
    @Inject(OpenXiangdaEventContext)
    private readonly eventContext: OpenXiangdaEventContext
  ) {}

  async send(input: OpenXiangdaBusinessNotificationInput) {
    const context = requireOpenXiangdaBusinessActionContext(this.request);
    return await this.platform.sendBusinessNotification(
      context.authorization,
      input,
      context.action
    );
  }

  async sendFromEvent(input: OpenXiangdaEventBusinessNotificationInput) {
    if (!this.eventContext.current()) {
      throw new UnauthorizedException(
        'OPENXIANGDA_BUSINESS_NOTIFICATION_EVENT_CONTEXT_REQUIRED'
      );
    }
    return await this.credentials.withAuthorization(async authorization =>
      await this.platform.sendEventNotification(authorization, input)
    );
  }
}
