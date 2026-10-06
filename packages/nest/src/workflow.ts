import {
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type { WorkflowDelegationMutationIntent, WorkflowDelegationListQuery, WorkflowDelegationCandidateQuery } from "openxiangda-contracts";
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

  async delegationCatalog() { return this.platform.workflowDelegationCatalog(this.context().authorization); }
  async delegationManagement(input: WorkflowDelegationListQuery = {}) { return this.platform.workflowDelegationManagement(this.context().authorization,input); }
  async delegationCandidates(input: WorkflowDelegationCandidateQuery) { return this.platform.workflowDelegationCandidates(this.context().authorization,input); }
  async delegationAdministration(id: string) { return this.platform.workflowDelegationAdministration(this.context().authorization,id); }
  async previewDelegationMutation(input: WorkflowDelegationMutationIntent) { return this.platform.previewWorkflowDelegationMutation(this.context().authorization,input); }
  async executeDelegationMutation(input: WorkflowDelegationMutationIntent) { return this.platform.executeWorkflowDelegationMutation(this.context().authorization,input); }
  async delegationMutationReceipt(operationId: string) { return this.platform.workflowDelegationMutationReceipt(this.context().authorization,operationId); }

  async createDelegation(input: {
    workflowCode?: string;
    delegatorRoleSubjectKey: string;
    delegateUserId: string;
    delegateRoleSubjectKey: string;
    validFrom: string;
    validTo: string;
    reason: string;
  }) {
    if (Object.hasOwn(input, 'nodeId')) throw new Error('WORKFLOW_DELEGATION_NODE_SCOPE_REQUIRES_MUTATION');
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

  /** Read the current user's original receipt before business revalidation. */
  async taskCommandReceipt(taskId: string, idempotencyKey: string) {
    return this.platform.workflowTaskCommandReceipt(this.context().authorization, taskId, idempotencyKey);
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

  /** Current Native read/RLS and history policy; this grants no handling authority. */
  async recordHistory(resourceCode: string, recordId: string, options: { instanceId?: string; limit?: number; offset?: number } = {}) {
    return this.platform.workflowRecordHistory(this.context().authorization, resourceCode, recordId, options);
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
