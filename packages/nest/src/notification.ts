import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type {
  ApplicationNotificationSendV2,
  DingTalkAdvancedCardSendV2,
} from "openxiangda-contracts";
import { OpenXiangdaPlatformClient } from "./platform-client.js";
import type {
  OpenXiangdaHttpRequest,
  OpenXiangdaVerifiedContext,
} from "./types.js";

export type OpenXiangdaAdvancedDingTalkCardInput = Omit<
  DingTalkAdvancedCardSendV2,
  "environmentKey"
>;
export type OpenXiangdaNotificationInput = Omit<
  ApplicationNotificationSendV2,
  "environmentKey"
>;

/**
 * Request-scoped Notification Hub facade. The platform remains the owner of
 * channel credentials, recipient address resolution, idempotency and delivery.
 */
@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaNotificationService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  async sendDingTalkCard(input: OpenXiangdaAdvancedDingTalkCardInput) {
    const context = this.context();
    return await this.platform.sendAdvancedDingTalkCard(
      context.authorization,
      input
    );
  }

  async send(input: OpenXiangdaNotificationInput) {
    const context = this.context();
    return await this.platform.sendNotification(context.authorization, input);
  }

  private context(): OpenXiangdaVerifiedContext {
    if (!this.request.openxiangda) {
      throw new UnauthorizedException("OPENXIANGDA_CONTEXT_NOT_VERIFIED");
    }
    if (this.request.openxiangda.principal.principalType !== "user") {
      throw new UnauthorizedException(
        "OPENXIANGDA_NOTIFICATION_USER_CONTEXT_REQUIRED"
      );
    }
    return this.request.openxiangda;
  }
}
