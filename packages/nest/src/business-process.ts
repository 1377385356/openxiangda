import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  SCHEMA_VERSIONS,
  type BusinessProcessAnswer,
  type BusinessProcessCommand,
  type BusinessProcessCommit,
  type BusinessProcessPoll,
  type BusinessProcessReceipt,
  type BusinessProcessRetry,
  type ProcessCommandSurface,
} from 'openxiangda-contracts';
import { assertOpenXiangdaRoleAssertions, requireOpenXiangdaBusinessActionContext } from './business-action-context.js';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import type { OpenXiangdaHttpRequest } from './types.js';

export type OpenXiangdaBusinessProcessCommitInput = Omit<
  BusinessProcessCommit,
  'schemaVersion' | 'environmentKey'
>;

/**
 * Durable business mutation + Workflow command facade for verified Named Actions.
 * The operation proof is derived exclusively from the gateway-verified request.
 */
@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaBusinessProcessService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  async commit(
    input: OpenXiangdaBusinessProcessCommitInput
  ): Promise<BusinessProcessCommand> {
    assertOpenXiangdaRoleAssertions(this.request, input.data.guards);
    const context = this.context(input.workflow.workflowCode);
    return await this.platform.commitBusinessProcess(
      context.authorization,
      {
        ...input,
        schemaVersion: SCHEMA_VERSIONS.businessProcessCommit,
        environmentKey: context.environmentKey,
      },
      context.action
    );
  }

  async status(commandId: string): Promise<BusinessProcessCommand> {
    const context = this.context();
    return this.assertDeclared(
      await this.platform.businessProcessStatus(
        context.authorization,
        commandId,
        context.action
      ),
      context.workflowCodes
    );
  }

  async receipt(commandId: string): Promise<BusinessProcessReceipt> {
    const context = this.context();
    const receipt = await this.platform.businessProcessReceipt(
      context.authorization,
      commandId,
      context.action
    );
    this.assertDeclared(receipt.command, context.workflowCodes);
    return receipt;
  }

  async poll(commandId: string, afterRevision = 0): Promise<BusinessProcessPoll> {
    const context = this.context();
    const poll = await this.platform.businessProcessPoll(
      context.authorization,
      commandId,
      afterRevision,
      context.action
    );
    this.assertDeclared(poll.command, context.workflowCodes);
    return poll;
  }

  async surface(commandId: string): Promise<ProcessCommandSurface> {
    const context = this.context();
    const surface = await this.platform.businessProcessSurface(
      context.authorization,
      commandId,
      context.action
    );
    this.assertDeclared(surface.command, context.workflowCodes);
    return surface;
  }

  async answer(
    commandId: string,
    input: Omit<BusinessProcessAnswer, 'schemaVersion'>
  ): Promise<BusinessProcessCommand> {
    const context = this.context();
    return this.assertDeclared(
      await this.platform.answerBusinessProcess(
        context.authorization,
        commandId,
        { ...input, schemaVersion: SCHEMA_VERSIONS.businessProcessAnswer },
        context.action
      ),
      context.workflowCodes
    );
  }

  async retry(
    commandId: string,
    input: Omit<BusinessProcessRetry, 'schemaVersion'>
  ): Promise<BusinessProcessCommand> {
    const context = this.context();
    return this.assertDeclared(
      await this.platform.retryBusinessProcess(
        context.authorization,
        commandId,
        { ...input, schemaVersion: SCHEMA_VERSIONS.businessProcessRetry },
        context.action
      ),
      context.workflowCodes
    );
  }

  private context(workflowCode?: string) {
    const runtime = requireOpenXiangdaBusinessActionContext(this.request);
    const verified = this.request.openxiangda!;
    const declaration = verified.operation?.platformAccess?.workflow;
    if (
      !declaration ||
      Object.keys(declaration).length !== 1 ||
      !Array.isArray(declaration.codes) ||
      declaration.codes.length === 0 ||
      new Set(declaration.codes).size !== declaration.codes.length
    ) {
      throw new UnauthorizedException(
        'OPENXIANGDA_BUSINESS_PROCESS_WORKFLOW_ACCESS_REQUIRED'
      );
    }
    const workflowCodes = [...declaration.codes];
    if (workflowCode && !workflowCodes.includes(workflowCode)) {
      throw new UnauthorizedException(
        'OPENXIANGDA_BUSINESS_PROCESS_WORKFLOW_NOT_DECLARED'
      );
    }
    const environmentKey = verified.principal.environmentKey;
    if (!['preproduction', 'production'].includes(environmentKey)) {
      throw new UnauthorizedException(
        'OPENXIANGDA_BUSINESS_PROCESS_ENVIRONMENT_INVALID'
      );
    }
    return {
      ...runtime,
      environmentKey: environmentKey as 'preproduction' | 'production',
      workflowCodes,
    };
  }

  private assertDeclared(
    command: BusinessProcessCommand,
    workflowCodes: readonly string[]
  ) {
    if (!workflowCodes.includes(command.workflowCode)) {
      throw new UnauthorizedException(
        'OPENXIANGDA_BUSINESS_PROCESS_COMMAND_WORKFLOW_NOT_DECLARED'
      );
    }
    return command;
  }
}
