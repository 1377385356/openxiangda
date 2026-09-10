import { randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import type {
  DataPage,
  DataAggregatePage,
  DataAggregateQuery,
  DataAuditPage,
  DataFileRef,
  DataFileUploadPlan,
  DataFileCopyRequest,
  DataFileCopyReceipt,
  DataQuery,
  DataRecord,
  DataTransactionRequest,
  DataTransactionResult,
  CurrentInitiatorDirectorySnapshot,
  GatewayAssertionJwks,
  GatewayInvocationPrincipal,
  PlatformCapabilities,
  RuntimeLeaseCommand,
  RuntimeLeaseResult,
  RuntimeSecretValues,
  DingTalkAdvancedCardSendV2,
  ApplicationNotificationSendV2,
  BusinessNotificationSendV2,
  EventBusinessNotificationSendV2,
  DingTalkWorkNoticeSendV2,
  NotificationMessageV2,
  NotificationMessageDetailV2,
  NotificationReadReceiptV2,
  ApplicationTodoCenterPageV2,
  ApplicationTodoInteractionResultV2,
  ApplicationTodoViewV2,
  WorkflowCommand,
  WorkflowCommandInput,
  WorkflowCommandResult,
  WorkflowDelegation,
  WorkflowDetailSurfaceV2,
  WorkflowLaunchSurface,
  WorkflowSurface,
  WorkflowWorkCenterItem,
  WorkflowTimeline,
  BusinessProcessAnswer,
  BusinessProcessCommand,
  BusinessProcessCommandQuery,
  BusinessProcessCommandList,
  BusinessProcessCommit,
  BusinessProcessPoll,
  BusinessProcessReceipt,
  BusinessProcessRetry,
  ProcessCommandSurface,
} from "openxiangda-contracts";
import { normalizeWorkflowSurface } from "openxiangda-contracts";
import { OPENXIANGDA_MODULE_OPTIONS } from "./tokens.js";
import { OpenXiangdaEventContext } from "./event-context.js";
import type {
  OpenXiangdaBusinessActionContext,
  OpenXiangdaConnectedDevelopmentStatus,
  OpenXiangdaModuleOptions,
} from "./types.js";

interface PlatformEnvelope<T> {
  code: number;
  message: string;
  errorCode?: string;
  data: T;
}

export interface OpenXiangdaPlatformRequestDiagnostic {
  requestId: string;
  method: string;
  path: string;
}

export class OpenXiangdaPlatformError extends HttpException {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
    readonly data?: unknown,
    readonly request?: OpenXiangdaPlatformRequestDiagnostic
  ) {
    super(
      {
        statusCode: httpStatus,
        code,
        message,
        ...(data === undefined ? {} : { data }),
        ...(request ? { request } : {}),
      },
      httpStatus
    );
    this.name = "OpenXiangdaPlatformError";
  }
}

@Injectable()
export class OpenXiangdaPlatformClient {
  private readonly baseUrl: string;
  private readonly fetch: NonNullable<OpenXiangdaModuleOptions["fetch"]>;

  constructor(
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions,
    @Optional()
    @Inject(OpenXiangdaEventContext)
    private readonly eventContext?: OpenXiangdaEventContext
  ) {
    this.baseUrl = options.platformBaseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
  }

  async capabilities(): Promise<PlatformCapabilities> {
    return await this.request<PlatformCapabilities>(
      "/openxiangda-api/v2/capabilities"
    );
  }

  async gatewayAssertionKeys(): Promise<GatewayAssertionJwks> {
    return await this.request<GatewayAssertionJwks>(
      "/openxiangda-api/v2/gateway-assertion-keys"
    );
  }

  async resolveCurrentInitiator(
    authorization: string,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<CurrentInitiatorDirectorySnapshot> {
    return await this.request<CurrentInitiatorDirectorySnapshot>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        this.options.appCode
      )}/directory/current-initiator?environmentKey=${encodeURIComponent(
        this.options.environmentKey
      )}`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization, null, businessAction),
        body: JSON.stringify({
          schemaVersion:
            "openxiangda.current-initiator-directory-request/v2",
        }),
      }
    );
  }

  async connectedDevelopmentSession(
    authorization: string,
    sessionToken: string
  ): Promise<OpenXiangdaConnectedDevelopmentStatus> {
    return await this.request<OpenXiangdaConnectedDevelopmentStatus>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        this.options.appCode
      )}/dev-sessions/current`,
      {
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-Dev-Session": sessionToken,
        },
      }
    );
  }

  async commandRuntimeLease(
    authorization: string,
    command: RuntimeLeaseCommand
  ): Promise<RuntimeLeaseResult> {
    return await this.request<RuntimeLeaseResult>(
      `${this.runtimePath()}/lease`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify(command),
      }
    );
  }

  async resolveRuntimeSecrets(
    authorization: string,
    names?: string[]
  ): Promise<RuntimeSecretValues> {
    return await this.request<RuntimeSecretValues>(
      `${this.runtimePath()}/secrets/resolve`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify(names === undefined ? {} : { names }),
      }
    );
  }

  async verifyGatewayInvocation(
    authorization: string,
    assertion: string
  ): Promise<GatewayInvocationPrincipal> {
    return await this.request<GatewayInvocationPrincipal>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        this.options.appCode
      )}/native/invocations/verify`,
      {
        method: "POST",
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-Gateway-Assertion": assertion,
        },
        body: "{}",
      }
    );
  }

  async queryData<T extends Record<string, unknown>>(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    query: DataQuery,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataPage<T>> {
    return await this.request<DataPage<T>>(
      this.dataPath(resourceCode, "query"),
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({
          ...query,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async getData<T extends Record<string, unknown>>(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    id: string,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataRecord<T>> {
    return await this.request<DataRecord<T>>(
      `${this.dataPath(
        resourceCode,
        `records/${encodeURIComponent(id)}`
      )}?environmentKey=${encodeURIComponent(this.options.environmentKey)}`,
      { headers: this.identityHeaders(authorization, perspectiveCode, businessAction) }
    );
  }

  async aggregateData<T extends Record<string, unknown>>(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    query: DataAggregateQuery,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataAggregatePage<T>> {
    return await this.request<DataAggregatePage<T>>(
      this.dataPath(resourceCode, "aggregate"),
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({
          ...query,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async dataAudit(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    id: string,
    input: { limit?: number; offset?: number } = {},
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataAuditPage> {
    const query = new URLSearchParams({
      environmentKey: this.options.environmentKey,
    });
    if (input.limit !== undefined) query.set("limit", String(input.limit));
    if (input.offset !== undefined) query.set("offset", String(input.offset));
    const suffix = query.size ? `?${query}` : "";
    return await this.request<DataAuditPage>(
      `${this.dataPath(resourceCode, `records/${encodeURIComponent(id)}/audit`)}${suffix}`,
      { headers: this.identityHeaders(authorization, perspectiveCode, businessAction) }
    );
  }

  async initiateDataFileUpload(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    input: {
      fieldCode: string;
      fileName: string;
      fileSize: number;
      contentType?: string;
      recordId?: string;
    },
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataFileUploadPlan> {
    return await this.request<DataFileUploadPlan>(
      this.dataPath(resourceCode, "files/uploads/initiate"),
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({
          ...input,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async completeDataFileUpload(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    fileId: string,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataFileRef> {
    return await this.request<DataFileRef>(
      this.dataPath(resourceCode, `files/${encodeURIComponent(fileId)}/complete`),
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({ environmentKey: this.options.environmentKey }),
      }
    );
  }

  async copyManagedFile(
    authorization: string,
    perspectiveCode: string | null,
    input: DataFileCopyRequest,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataFileCopyReceipt> {
    return await this.request<DataFileCopyReceipt>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(this.options.appCode)}/native/files/copies`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({ ...input, environmentKey: this.options.environmentKey }),
      }
    );
  }

  async getManagedFileCopyReceipt(
    authorization: string,
    perspectiveCode: string | null,
    receiptId: string,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataFileCopyReceipt> {
    return await this.request<DataFileCopyReceipt>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(this.options.appCode)}/native/files/copies/${encodeURIComponent(receiptId)}?environmentKey=${encodeURIComponent(this.options.environmentKey)}`,
      { headers: this.identityHeaders(authorization, perspectiveCode, businessAction) }
    );
  }

  async createData<T extends Record<string, unknown>>(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    data: Record<string, unknown>,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataRecord<T>> {
    return await this.request<DataRecord<T>>(
      this.dataPath(resourceCode, "records"),
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({
          data,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async updateData<T extends Record<string, unknown>>(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    id: string,
    input: { expectedRevision: number; data: Record<string, unknown> },
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataRecord<T>> {
    return await this.request<DataRecord<T>>(
      this.dataPath(resourceCode, `records/${encodeURIComponent(id)}/update`),
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({
          ...input,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async deleteData<T extends Record<string, unknown>>(
    authorization: string,
    perspectiveCode: string | null,
    resourceCode: string,
    id: string,
    expectedRevision: number,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataRecord<T>> {
    return await this.request<DataRecord<T>>(
      this.dataPath(resourceCode, `records/${encodeURIComponent(id)}/delete`),
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({
          expectedRevision,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async transactData(
    authorization: string,
    perspectiveCode: string | null,
    transaction: DataTransactionRequest,
    businessAction?: OpenXiangdaBusinessActionContext
  ): Promise<DataTransactionResult> {
    return await this.request<DataTransactionResult>(
      `/openxiangda-api/v2/applications/${encodeURIComponent(
        this.options.appCode
      )}/native/data/transactions`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization, perspectiveCode, businessAction),
        body: JSON.stringify({
          ...transaction,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async commitBusinessProcess(
    authorization: string,
    input: BusinessProcessCommit,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<BusinessProcessCommand> {
    return await this.request<BusinessProcessCommand>(
      `${this.businessProcessPath()}/commands`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization, null, businessAction),
        body: JSON.stringify(input),
      }
    );
  }

  async listBusinessProcessCommands(
    authorization: string,
    input: BusinessProcessCommandQuery,
    businessAction: OpenXiangdaBusinessActionContext,
  ): Promise<BusinessProcessCommandList> {
    const query = new URLSearchParams({
      environmentKey: input.environmentKey,
      resourceCode: input.resourceCode,
      recordId: input.recordId,
    });
    for (const key of ['workflowCode', 'operationCode', 'pageSize', 'beforeCommandId'] as const) {
      if (input[key] !== undefined) query.set(key, String(input[key]));
    }
    return await this.request<BusinessProcessCommandList>(
      `${this.businessProcessPath()}/commands?${query}`,
      { headers: this.identityHeaders(authorization, null, businessAction) },
    );
  }

  async businessProcessStatus(
    authorization: string,
    commandId: string,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<BusinessProcessCommand> {
    return await this.request<BusinessProcessCommand>(
      `${this.businessProcessPath()}/commands/${encodeURIComponent(commandId)}`,
      { headers: this.identityHeaders(authorization, null, businessAction) }
    );
  }

  async businessProcessReceipt(
    authorization: string,
    commandId: string,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<BusinessProcessReceipt> {
    return await this.request<BusinessProcessReceipt>(
      `${this.businessProcessPath()}/commands/${encodeURIComponent(commandId)}/receipt`,
      { headers: this.identityHeaders(authorization, null, businessAction) }
    );
  }

  async businessProcessPoll(
    authorization: string,
    commandId: string,
    afterRevision: number,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<BusinessProcessPoll> {
    if (!Number.isInteger(afterRevision) || afterRevision < 0) {
      throw new Error("OPENXIANGDA_BUSINESS_PROCESS_POLL_CURSOR_INVALID");
    }
    return await this.request<BusinessProcessPoll>(
      `${this.businessProcessPath()}/commands/${encodeURIComponent(commandId)}/poll?afterRevision=${afterRevision}`,
      { headers: this.identityHeaders(authorization, null, businessAction) }
    );
  }

  async businessProcessSurface(
    authorization: string,
    commandId: string,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<ProcessCommandSurface> {
    return await this.request<ProcessCommandSurface>(
      `${this.businessProcessPath()}/commands/${encodeURIComponent(commandId)}/surface`,
      { headers: this.identityHeaders(authorization, null, businessAction) }
    );
  }

  async answerBusinessProcess(
    authorization: string,
    commandId: string,
    input: BusinessProcessAnswer,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<BusinessProcessCommand> {
    return await this.request<BusinessProcessCommand>(
      `${this.businessProcessPath()}/commands/${encodeURIComponent(commandId)}/answers`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization, null, businessAction),
        body: JSON.stringify(input),
      }
    );
  }

  async retryBusinessProcess(
    authorization: string,
    commandId: string,
    input: BusinessProcessRetry,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<BusinessProcessCommand> {
    return await this.request<BusinessProcessCommand>(
      `${this.businessProcessPath()}/commands/${encodeURIComponent(commandId)}/retry`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization, null, businessAction),
        body: JSON.stringify(input),
      }
    );
  }

  async workflowLaunchSurface(
    authorization: string,
    workflowCode: string
  ): Promise<WorkflowLaunchSurface> {
    return await this.request<WorkflowLaunchSurface>(
      `${this.workflowPath()}/definitions/${encodeURIComponent(
        workflowCode
      )}/launch-surface?environmentKey=${encodeURIComponent(
        this.options.environmentKey
      )}`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async createWorkflowDelegation(
    authorization: string,
    input: {
      workflowCode?: string;
      delegatorRoleSubjectKey: string;
      delegateUserId: string;
      delegateRoleSubjectKey: string;
      validFrom: string;
      validTo: string;
      reason: string;
    }
  ): Promise<WorkflowDelegation> {
    return await this.request<WorkflowDelegation>(
      `${this.workflowPath()}/delegations`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify({
          ...input,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async workflowDelegations(
    authorization: string,
    input: { all?: boolean } = {}
  ): Promise<{ items: WorkflowDelegation[]; total: number }> {
    return await this.request<{ items: WorkflowDelegation[]; total: number }>(
      `${this.workflowPath()}/delegations?environmentKey=${encodeURIComponent(
        this.options.environmentKey
      )}&all=${input.all === true}`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async revokeWorkflowDelegation(
    authorization: string,
    delegationId: string
  ): Promise<WorkflowDelegation> {
    return await this.request<WorkflowDelegation>(
      `${this.workflowPath()}/delegations/${encodeURIComponent(
        delegationId
      )}/revoke?environmentKey=${encodeURIComponent(this.options.environmentKey)}`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
      }
    );
  }

  async workflowTaskSurface(
    authorization: string,
    taskId: string,
    csrfToken: string
  ): Promise<WorkflowSurface> {
    const surface = await this.request<WorkflowSurface>(
      `${this.workflowPath()}/tasks/${encodeURIComponent(taskId)}/surface`,
      {
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-CSRF-Token": csrfToken,
        },
      }
    );
    return normalizeWorkflowSurface(surface);
  }

  async workflowTaskDetail(
    authorization: string,
    taskId: string,
    csrfToken: string
  ): Promise<WorkflowDetailSurfaceV2> {
    const detail = await this.request<WorkflowDetailSurfaceV2>(
      `${this.workflowPath()}/tasks/${encodeURIComponent(taskId)}/detail`,
      {
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-CSRF-Token": csrfToken,
        },
      }
    );
    return { ...detail, surface: normalizeWorkflowSurface(detail.surface) };
  }

  async executeWorkflowTaskCommand(
    authorization: string,
    taskId: string,
    command: WorkflowCommand,
    input: WorkflowCommandInput,
    csrfToken: string
  ): Promise<WorkflowCommandResult> {
    return await this.request<WorkflowCommandResult>(
      `${this.workflowPath()}/tasks/${encodeURIComponent(
        taskId
      )}/commands/${encodeURIComponent(command)}`,
      {
        method: "POST",
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(input),
      }
    );
  }

  async executeWorkflowInstanceCommand(
    authorization: string,
    instanceId: string,
    command: "withdraw" | "terminate",
    input: WorkflowCommandInput,
    csrfToken: string
  ): Promise<WorkflowCommandResult> {
    return await this.request<WorkflowCommandResult>(
      `${this.workflowPath()}/instances/${encodeURIComponent(
        instanceId
      )}/commands/${command}`,
      {
        method: "POST",
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(input),
      }
    );
  }

  async workflowWorkCenter(
    authorization: string,
    input: { status?: "pending" | "completed"; limit?: number } = {}
  ): Promise<{ items: WorkflowWorkCenterItem[] }> {
    const query = new URLSearchParams({
      status: input.status || "pending",
      limit: String(Math.min(Math.max(Number(input.limit) || 50, 1), 200)),
      environmentKey: this.options.environmentKey,
    });
    return await this.request<{ items: WorkflowWorkCenterItem[] }>(
      `${this.workflowPath()}/work-center/items?${query}`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async workflowInstanceSurface(
    authorization: string,
    instanceId: string,
    csrfToken: string
  ): Promise<WorkflowSurface> {
    const surface = await this.request<WorkflowSurface>(
      `${this.workflowPath()}/instances/${encodeURIComponent(
        instanceId
      )}/surface`,
      {
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-CSRF-Token": csrfToken,
        },
      }
    );
    return normalizeWorkflowSurface(surface);
  }

  async workflowInstanceDetail(
    authorization: string,
    instanceId: string,
    csrfToken: string
  ): Promise<WorkflowDetailSurfaceV2> {
    const detail = await this.request<WorkflowDetailSurfaceV2>(
      `${this.workflowPath()}/instances/${encodeURIComponent(instanceId)}/detail`,
      {
        headers: {
          ...this.identityHeaders(authorization),
          "X-OpenXiangda-CSRF-Token": csrfToken,
        },
      }
    );
    return { ...detail, surface: normalizeWorkflowSurface(detail.surface) };
  }

  async workflowTimeline(
    authorization: string,
    instanceId: string
  ): Promise<WorkflowTimeline> {
    return await this.request<WorkflowTimeline>(
      `${this.workflowPath()}/instances/${encodeURIComponent(instanceId)}/timeline`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async applicationTodos(
    authorization: string,
    input: {
      view?: ApplicationTodoViewV2;
      unread?: boolean;
      keyword?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ApplicationTodoCenterPageV2> {
    const query = new URLSearchParams({
      environmentKey: this.options.environmentKey,
      view: input.view || "pending",
      limit: String(Math.min(Math.max(Number(input.limit) || 20, 1), 50)),
      offset: String(Math.min(Math.max(Number(input.offset) || 0, 0), 10_000)),
    });
    if (input.unread) query.set("unread", "true");
    if (input.keyword?.trim()) query.set("keyword", input.keyword.trim());
    return await this.request<ApplicationTodoCenterPageV2>(
      `${this.applicationPath()}/todos?${query}`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async recordApplicationTodoInteraction(
    authorization: string,
    messageId: string,
    kind: "read" | "click"
  ): Promise<ApplicationTodoInteractionResultV2> {
    return await this.request<ApplicationTodoInteractionResultV2>(
      `${this.applicationPath()}/todos/${encodeURIComponent(
        messageId
      )}/interactions`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify({
          environmentKey: this.options.environmentKey,
          kind,
        }),
      }
    );
  }

  async workflowAssignmentExplain(authorization: string, taskId: string) {
    return await this.request<Record<string, unknown>>(
      `${this.workflowPath()}/tasks/${encodeURIComponent(taskId)}/assignment-explain`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async sendAdvancedDingTalkCard(
    authorization: string,
    input: Omit<DingTalkAdvancedCardSendV2, "environmentKey">
  ): Promise<NotificationMessageV2> {
    return await this.request<NotificationMessageV2>(
      `${this.notificationPath()}/send/dingtalk-card`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify({
          ...input,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async sendNotification(
    authorization: string,
    input: Omit<ApplicationNotificationSendV2, "environmentKey">
  ): Promise<NotificationMessageV2> {
    return await this.request<NotificationMessageV2>(
      `${this.notificationPath()}/send`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify({
          ...input,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async sendDingTalkWorkNotice(
    authorization: string,
    input: Omit<DingTalkWorkNoticeSendV2, "environmentKey">
  ): Promise<NotificationMessageV2> {
    return await this.request<NotificationMessageV2>(
      `${this.notificationPath()}/send/dingtalk-work-notice`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify({ ...input, environmentKey: this.options.environmentKey }),
      }
    );
  }

  async getDingTalkWorkNoticeResult(authorization: string, messageId: string) {
    return await this.request<Record<string, unknown>>(
      `${this.notificationPath()}/send/dingtalk-work-notice/${encodeURIComponent(messageId)}?environmentKey=${encodeURIComponent(this.options.environmentKey)}`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async getNotificationMessage(authorization: string, messageId: string): Promise<NotificationMessageDetailV2> {
    return this.request<NotificationMessageDetailV2>(
      `${this.notificationPath()}/management/messages/${encodeURIComponent(messageId)}?environmentKey=${encodeURIComponent(this.options.environmentKey)}`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async getDingTalkCardReadReceipt(authorization: string, messageId: string, deliveryId: string): Promise<NotificationReadReceiptV2> {
    return this.request<NotificationReadReceiptV2>(
      `${this.notificationPath()}/management/messages/${encodeURIComponent(messageId)}/deliveries/${encodeURIComponent(deliveryId)}/read-receipt?environmentKey=${encodeURIComponent(this.options.environmentKey)}`,
      { headers: this.identityHeaders(authorization) }
    );
  }

  async refreshDingTalkCardReadReceipt(authorization: string, messageId: string, deliveryId: string): Promise<NotificationReadReceiptV2> {
    return this.request<NotificationReadReceiptV2>(
      `${this.notificationPath()}/management/messages/${encodeURIComponent(messageId)}/deliveries/${encodeURIComponent(deliveryId)}/read-receipt/refresh`,
      {
        method: 'POST', headers: this.identityHeaders(authorization),
        body: JSON.stringify({ environmentKey: this.options.environmentKey }),
      }
    );
  }

  async sendBusinessNotification(
    authorization: string,
    input: Omit<BusinessNotificationSendV2, "environmentKey">,
    businessAction: OpenXiangdaBusinessActionContext
  ): Promise<NotificationMessageV2> {
    return await this.request<NotificationMessageV2>(
      `${this.notificationPath()}/send/business-action`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization, null, businessAction),
        body: JSON.stringify({
          ...input,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  async sendEventNotification(
    authorization: string,
    input: Omit<EventBusinessNotificationSendV2, "environmentKey">
  ): Promise<NotificationMessageV2> {
    return await this.request<NotificationMessageV2>(
      `${this.notificationPath()}/send/event-consumer`,
      {
        method: "POST",
        headers: this.identityHeaders(authorization),
        body: JSON.stringify({
          ...input,
          environmentKey: this.options.environmentKey,
        }),
      }
    );
  }

  private authzPath() {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      this.options.appCode
    )}/native/authz`;
  }

  private runtimePath() {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      this.options.appCode
    )}/native/runtime`;
  }

  private dataPath(resourceCode: string, suffix: string) {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      this.options.appCode
    )}/native/data/${encodeURIComponent(resourceCode)}/${suffix}`;
  }

  private workflowPath() {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      this.options.appCode
    )}/workflow`;
  }

  private applicationPath() {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      this.options.appCode
    )}`;
  }

  private notificationPath() {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      this.options.appCode
    )}/notification-hub`;
  }

  private businessProcessPath() {
    return `/openxiangda-api/v2/applications/${encodeURIComponent(
      this.options.appCode
    )}/business-process`;
  }

  private queryString(query: object) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    return params.size ? `?${params}` : "";
  }

  private identityHeaders(
    authorization: string,
    perspectiveCode?: string | null,
    businessAction?: OpenXiangdaBusinessActionContext
  ) {
    const event = this.eventContext?.current();
    return {
      Authorization: authorization,
      ...(perspectiveCode
        ? { "X-OpenXiangda-Perspective": perspectiveCode }
        : {}),
      ...(businessAction
        ? {
            "X-OpenXiangda-Business-Action-Code": businessAction.code,
            "X-OpenXiangda-Business-Action-Capability":
              businessAction.requiredCapability,
            ...(businessAction.requestId
              ? { "X-Request-ID": businessAction.requestId }
              : {}),
            ...(businessAction.connectedDevelopmentSessionToken
              ? {
                  "X-OpenXiangda-Dev-Session":
                    businessAction.connectedDevelopmentSessionToken,
                }
              : {}),
          }
        : {}),
      ...(event
        ? {
            "X-OpenXiangda-Causation-Event-Id": event.eventId,
            "X-OpenXiangda-Origin-Subscription-Code":
              event.subscriptionCode,
            "X-OpenXiangda-Origin-Delivery-Id": event.deliveryId,
            "X-OpenXiangda-Causation-Depth": String(event.causationDepth),
            "X-OpenXiangda-Trace-Id": event.traceId,
          }
        : {}),
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const suppliedRequestId = headers.get('X-Request-ID');
    const requestId = suppliedRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(suppliedRequestId)
      ? suppliedRequestId : randomUUID();
    headers.set('X-Request-ID', requestId);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    const diagnostic: OpenXiangdaPlatformRequestDiagnostic = {
      requestId, method: init.method || 'GET', path: path.split('?')[0]!,
    };
    const requestHeaders: Record<string, string> = {};
    headers.forEach((value, name) => { requestHeaders[name] = value; });
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.requestTimeoutMs || 5000
    );
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: requestHeaders,
      });
      let envelope: PlatformEnvelope<T>;
      try {
        envelope = (await response.json()) as PlatformEnvelope<T>;
      } catch {
        throw new OpenXiangdaPlatformError(
          response.status,
          "PLATFORM_RESPONSE_INVALID",
          "OpenXiangda 平台返回的不是有效 JSON"
        );
      }
      if (!response.ok || Number(envelope.code) >= 400) {
        throw new OpenXiangdaPlatformError(
          response.status,
          envelope.errorCode || "PLATFORM_REQUEST_FAILED",
          envelope.message || `OpenXiangda 平台请求失败: ${response.status}`,
          envelope.data
        );
      }
      return envelope.data;
    } catch (error) {
      if (error instanceof OpenXiangdaPlatformError) {
        throw new OpenXiangdaPlatformError(error.httpStatus, error.code, error.message, error.data, diagnostic);
      }
      if ((error as Error)?.name === "AbortError") {
        throw new OpenXiangdaPlatformError(
          504,
          "PLATFORM_REQUEST_TIMEOUT",
          "OpenXiangda 平台请求超时", undefined, diagnostic
        );
      }
      throw new OpenXiangdaPlatformError(
        503,
        "PLATFORM_UNAVAILABLE",
        (error as Error)?.message || "OpenXiangda 平台不可用", undefined, diagnostic
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
