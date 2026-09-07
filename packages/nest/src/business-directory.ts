import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { CurrentInitiatorDirectorySnapshot } from 'openxiangda-contracts';
import { requireOpenXiangdaBusinessActionContext } from './business-action-context.js';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import type { OpenXiangdaHttpRequest } from './types.js';

/**
 * Request-scoped access to directory facts declared by the active Named Action.
 * The initiator is always derived from the verified gateway invocation.
 */
@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaBusinessDirectoryService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  async currentInitiator(): Promise<CurrentInitiatorDirectorySnapshot> {
    const context = requireOpenXiangdaBusinessActionContext(this.request);
    return await this.platform.resolveCurrentInitiator(
      context.authorization,
      context.action
    );
  }
}
