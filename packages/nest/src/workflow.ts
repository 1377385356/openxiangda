import {
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type {
  WorkflowCommand,
  WorkflowCommandInput,
  WorkflowCommandResult,
} from "openxiangda-contracts";
import { OpenXiangdaPlatformClient } from "./platform-client.js";
import type {
  OpenXiangdaHttpRequest,
  OpenXiangdaVerifiedContext,
} from "./types.js";

@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaWorkflowService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  async createDelegation(input: {
    workflowCode?: string;
    delegatorRoleSubjectKey: string;
    delegateUserId: string;
    delegateRoleSubjectKey: string;
    validFrom: string;
    validTo: string;
    reason: string;
  }) {
    const context = this.context();
    return await this.platform.createWorkflowDelegation(
      context.authorization,
      input
    );
  }

  async delegations(input: { all?: boolean } = {}) {
    const context = this.context();
    return await this.platform.workflowDelegations(
      context.authorization,
      input
    );
  }

  async revokeDelegation(delegationId: string) {
    const context = this.context();
    return await this.platform.revokeWorkflowDelegation(
      context.authorization,
      delegationId
    );
  }

  async taskSurface(taskId: string) {
    const context = this.context();
    return await this.platform.workflowTaskSurface(
      context.authorization,
      taskId,
      this.csrfToken()
    );
  }

  async taskDetail(taskId: string) {
    const context = this.context();
    return await this.platform.workflowTaskDetail(
      context.authorization,
      taskId,
      this.csrfToken()
    );
  }

  async taskCommand(
    taskId: string,
    command: WorkflowCommand,
    input: WorkflowCommandInput
  ): Promise<WorkflowCommandResult> {
    const context = this.context();
    return await this.platform.executeWorkflowTaskCommand(
      context.authorization,
      taskId,
      command,
      input,
      this.csrfToken()
    );
  }

  async instanceCommand(
    instanceId: string,
    command: "withdraw" | "terminate",
    input: WorkflowCommandInput
  ): Promise<WorkflowCommandResult> {
    const context = this.context();
    return await this.platform.executeWorkflowInstanceCommand(
      context.authorization,
      instanceId,
      command,
      input,
      this.csrfToken()
    );
  }

  async workCenter(
    input: { status?: "pending" | "completed"; limit?: number } = {}
  ) {
    const context = this.context();
    return await this.platform.workflowWorkCenter(
      context.authorization,
      input
    );
  }

  async instanceSurface(instanceId: string) {
    const context = this.context();
    return await this.platform.workflowInstanceSurface(
      context.authorization,
      instanceId,
      this.csrfToken()
    );
  }

  async instanceDetail(instanceId: string) {
    const context = this.context();
    return await this.platform.workflowInstanceDetail(
      context.authorization,
      instanceId,
      this.csrfToken()
    );
  }

  async timeline(instanceId: string) {
    const context = this.context();
    return await this.platform.workflowTimeline(
      context.authorization,
      instanceId
    );
  }

  async assignmentExplain(taskId: string) {
    const context = this.context();
    return await this.platform.workflowAssignmentExplain(
      context.authorization,
      taskId
    );
  }

  private context(): OpenXiangdaVerifiedContext {
    if (!this.request.openxiangda) {
      throw new UnauthorizedException("OPENXIANGDA_CONTEXT_NOT_VERIFIED");
    }
    if (this.request.openxiangda.principal.principalType !== "user") {
      throw new UnauthorizedException(
        "OPENXIANGDA_WORKFLOW_USER_CONTEXT_REQUIRED"
      );
    }
    return this.request.openxiangda;
  }

  private csrfToken() {
    const raw =
      this.request.headers["x-openxiangda-csrf-token"] ||
      this.request.headers["X-OpenXiangda-CSRF-Token"];
    const value = String(Array.isArray(raw) ? raw[0] || "" : raw || "").trim();
    if (!value) {
      throw new ForbiddenException("OPENXIANGDA_WORKFLOW_CSRF_TOKEN_REQUIRED");
    }
    return value;
  }
}
