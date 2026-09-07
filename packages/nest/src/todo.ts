import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { ApplicationTodoViewV2 } from 'openxiangda-contracts';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import type { OpenXiangdaHttpRequest } from './types.js';

/** Current caller's platform projections; applications never maintain a second todo store. */
@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaTodoService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient) private readonly platform: OpenXiangdaPlatformClient,
  ) {}

  async list(input: {
    view?: ApplicationTodoViewV2; unread?: boolean; keyword?: string; limit?: number; offset?: number;
  } = {}) {
    return this.platform.applicationTodos(this.authorization(), input);
  }

  async markRead(messageId: string) {
    return this.platform.recordApplicationTodoInteraction(this.authorization(), messageId, 'read');
  }

  async recordClick(messageId: string) {
    return this.platform.recordApplicationTodoInteraction(this.authorization(), messageId, 'click');
  }

  private authorization() {
    const context = this.request.openxiangda;
    if (!context || !['user', 'developer'].includes(context.principal.principalType)) {
      throw new UnauthorizedException('OPENXIANGDA_TODO_USER_CONTEXT_REQUIRED');
    }
    return context.authorization;
  }
}
