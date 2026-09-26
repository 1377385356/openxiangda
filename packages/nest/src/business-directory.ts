import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AssignmentCandidateQuery, AssignmentCandidatePage, CurrentInitiatorDirectorySnapshot } from 'openxiangda-contracts';
import { requireOpenXiangdaBusinessActionContext } from './business-action-context.js';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import type { OpenXiangdaHttpRequest } from './types.js';

export type { AssignmentCandidateQuery, AssignmentCandidatePage } from 'openxiangda-contracts';

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

  async assignmentCandidates(input: AssignmentCandidateQuery): Promise<AssignmentCandidatePage> {
    const context = requireOpenXiangdaBusinessActionContext(this.request);
    const declared = this.request.openxiangda?.operation?.platformAccess?.roleAssertions?.roleCodes;
    if (!declared?.includes(input?.roleCode)) {
      throw new UnauthorizedException('OPENXIANGDA_DIRECTORY_ROLE_CANDIDATES_NOT_DECLARED');
    }
    return this.platform.assignmentCandidates(context.authorization, context.action, input);
  }

  async currentInitiator(): Promise<CurrentInitiatorDirectorySnapshot> {
    const context = requireOpenXiangdaBusinessActionContext(this.request);
    return await this.platform.resolveCurrentInitiator(
      context.authorization,
      context.action
    );
  }
}
