import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
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
} from 'openxiangda-contracts';
import { SCHEMA_VERSIONS } from 'openxiangda-contracts';
import { OpenXiangdaApplicationCredentials } from './application-credentials.js';
import { assertOpenXiangdaRoleAssertions, requireOpenXiangdaBusinessActionContext } from './business-action-context.js';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import type {
  OpenXiangdaHttpRequest,
} from './types.js';

export interface OpenXiangdaDomainEventEmitInput {
  idempotencyKey: string;
  eventType: string;
  subject?: string;
  data: Record<string, unknown>;
}

export interface OpenXiangdaDomainEventEmitResult {
  eventId: string;
  eventType: string;
  replayed: boolean;
}

function domainEventTransaction(input: OpenXiangdaDomainEventEmitInput) {
  return {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: input.idempotencyKey,
    operations: [
      {
        operation: 'emitEvent' as const,
        eventType: input.eventType,
        ...(input.subject ? { subject: input.subject } : {}),
        data: input.data,
      },
    ],
  } satisfies DataTransactionRequest;
}

function domainEventResult(
  result: DataTransactionResult
): OpenXiangdaDomainEventEmitResult {
  const item = result.items[0];
  if (!item || item.operation !== 'emitEvent') {
    throw new Error('OPENXIANGDA_DOMAIN_EVENT_RESULT_INVALID');
  }
  return {
    eventId: item.eventId,
    eventType: item.eventType,
    replayed: result.replayed,
  };
}

@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaDataApiService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  async query<T extends Record<string, unknown>>(
    resourceCode: string,
    query: DataQuery
  ): Promise<DataPage<T>> {
    const context = this.context();
    return await this.platform.queryData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      query
    );
  }

  async get<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.getData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id
    );
  }

  async aggregate<T extends Record<string, unknown>>(
    resourceCode: string,
    query: DataAggregateQuery
  ): Promise<DataAggregatePage<T>> {
    const context = this.context();
    return await this.platform.aggregateData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      query
    );
  }

  async audit(
    resourceCode: string,
    id: string,
    input: { limit?: number; offset?: number } = {}
  ): Promise<DataAuditPage> {
    const context = this.context();
    return await this.platform.dataAudit(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id,
      input
    );
  }

  async initiateFileUpload(
    resourceCode: string,
    input: {
      fieldCode: string;
      fileName: string;
      fileSize: number;
      contentType?: string;
      recordId?: string;
    }
  ): Promise<DataFileUploadPlan> {
    const context = this.context();
    return await this.platform.initiateDataFileUpload(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      input
    );
  }

  async completeFileUpload(
    resourceCode: string,
    fileId: string
  ): Promise<DataFileRef> {
    const context = this.context();
    return await this.platform.completeDataFileUpload(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      fileId
    );
  }

  async copyManagedFile(input: DataFileCopyRequest): Promise<DataFileCopyReceipt> {
    const context = this.context();
    return await this.platform.copyManagedFile(
      context.authorization,
      context.perspectiveCode,
      input
    );
  }

  async getManagedFileCopyReceipt(receiptId: string): Promise<DataFileCopyReceipt> {
    const context = this.context();
    return await this.platform.getManagedFileCopyReceipt(
      context.authorization,
      context.perspectiveCode,
      receiptId
    );
  }

  async create<T extends Record<string, unknown>>(
    resourceCode: string,
    data: Record<string, unknown>
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.createData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      data
    );
  }

  async update<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string,
    input: { expectedRevision: number; data: Record<string, unknown> }
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.updateData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id,
      input
    );
  }

  async delete<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string,
    expectedRevision: number
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.deleteData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id,
      expectedRevision
    );
  }

  async transaction(
    transaction: DataTransactionRequest
  ): Promise<DataTransactionResult> {
    assertOpenXiangdaRoleAssertions(undefined, transaction.guards);
    const context = this.context();
    return await this.platform.transactData(
      context.authorization,
      context.perspectiveCode,
      transaction
    );
  }

  async emitEvent(
    input: OpenXiangdaDomainEventEmitInput
  ): Promise<OpenXiangdaDomainEventEmitResult> {
    return domainEventResult(await this.transaction(domainEventTransaction(input)));
  }

  private context() {
    if (!this.request.openxiangda) {
      throw new UnauthorizedException('OPENXIANGDA_CONTEXT_NOT_VERIFIED');
    }
    return this.request.openxiangda;
  }
}

/**
 * Data API facade for a declared request-scoped business action.
 *
 * The App Gateway and OpenXiangdaOperation guard authorize the caller once.
 * Native Data executes as this exact app/environment's trusted backend while
 * retaining the initiating principal in its audit records.
 */
@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaBusinessDataApiService {
  constructor(
    @Inject(REQUEST) private readonly request: OpenXiangdaHttpRequest,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  async query<T extends Record<string, unknown>>(
    resourceCode: string,
    query: DataQuery
  ): Promise<DataPage<T>> {
    const context = this.context();
    return await this.platform.queryData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      query,
      context.action
    );
  }

  async get<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.getData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id,
      context.action
    );
  }

  async aggregate<T extends Record<string, unknown>>(
    resourceCode: string,
    query: DataAggregateQuery
  ): Promise<DataAggregatePage<T>> {
    const context = this.context();
    return await this.platform.aggregateData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      query,
      context.action
    );
  }

  async audit(
    resourceCode: string,
    id: string,
    input: { limit?: number; offset?: number } = {}
  ): Promise<DataAuditPage> {
    const context = this.context();
    return await this.platform.dataAudit(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id,
      input,
      context.action
    );
  }

  async initiateFileUpload(
    resourceCode: string,
    input: {
      fieldCode: string;
      fileName: string;
      fileSize: number;
      contentType?: string;
      recordId?: string;
    }
  ): Promise<DataFileUploadPlan> {
    const context = this.context();
    return await this.platform.initiateDataFileUpload(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      input,
      context.action
    );
  }

  async completeFileUpload(
    resourceCode: string,
    fileId: string
  ): Promise<DataFileRef> {
    const context = this.context();
    return await this.platform.completeDataFileUpload(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      fileId,
      context.action
    );
  }

  async copyManagedFile(input: DataFileCopyRequest): Promise<DataFileCopyReceipt> {
    const context = this.context();
    return await this.platform.copyManagedFile(
      context.authorization,
      context.perspectiveCode,
      input,
      context.action
    );
  }

  async getManagedFileCopyReceipt(receiptId: string): Promise<DataFileCopyReceipt> {
    const context = this.context();
    return await this.platform.getManagedFileCopyReceipt(
      context.authorization,
      context.perspectiveCode,
      receiptId,
      context.action
    );
  }

  async create<T extends Record<string, unknown>>(
    resourceCode: string,
    data: Record<string, unknown>
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.createData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      data,
      context.action
    );
  }

  async update<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string,
    input: { expectedRevision: number; data: Record<string, unknown> }
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.updateData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id,
      input,
      context.action
    );
  }

  async delete<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string,
    expectedRevision: number
  ): Promise<DataRecord<T>> {
    const context = this.context();
    return await this.platform.deleteData<T>(
      context.authorization,
      context.perspectiveCode,
      resourceCode,
      id,
      expectedRevision,
      context.action
    );
  }

  async transaction(
    transaction: DataTransactionRequest
  ): Promise<DataTransactionResult> {
    assertOpenXiangdaRoleAssertions(this.request, transaction.guards);
    const context = this.context();
    return await this.platform.transactData(
      context.authorization,
      context.perspectiveCode,
      transaction,
      context.action
    );
  }

  async emitEvent(
    input: OpenXiangdaDomainEventEmitInput
  ): Promise<OpenXiangdaDomainEventEmitResult> {
    return domainEventResult(await this.transaction(domainEventTransaction(input)));
  }

  private context() {
    return requireOpenXiangdaBusinessActionContext(this.request);
  }
}

/** Data API facade for Worker/Scheduler and other work without an HTTP request. */
@Injectable()
export class OpenXiangdaApplicationDataApiService {
  constructor(
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient,
    @Inject(OpenXiangdaApplicationCredentials)
    private readonly credentials: OpenXiangdaApplicationCredentials
  ) {}

  async query<T extends Record<string, unknown>>(
    resourceCode: string,
    query: DataQuery
  ): Promise<DataPage<T>> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.queryData<T>(authorization, null, resourceCode, query)
    );
  }

  async get<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string
  ): Promise<DataRecord<T>> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.getData<T>(authorization, null, resourceCode, id)
    );
  }

  async aggregate<T extends Record<string, unknown>>(
    resourceCode: string,
    query: DataAggregateQuery
  ): Promise<DataAggregatePage<T>> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.aggregateData<T>(authorization, null, resourceCode, query)
    );
  }

  async audit(
    resourceCode: string,
    id: string,
    input: { limit?: number; offset?: number } = {}
  ): Promise<DataAuditPage> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.dataAudit(authorization, null, resourceCode, id, input)
    );
  }

  async initiateFileUpload(
    resourceCode: string,
    input: {
      fieldCode: string;
      fileName: string;
      fileSize: number;
      contentType?: string;
      recordId?: string;
    }
  ): Promise<DataFileUploadPlan> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.initiateDataFileUpload(
        authorization,
        null,
        resourceCode,
        input
      )
    );
  }

  async completeFileUpload(
    resourceCode: string,
    fileId: string
  ): Promise<DataFileRef> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.completeDataFileUpload(
        authorization,
        null,
        resourceCode,
        fileId
      )
    );
  }

  async copyManagedFile(input: DataFileCopyRequest): Promise<DataFileCopyReceipt> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.copyManagedFile(authorization, null, input)
    );
  }

  async getManagedFileCopyReceipt(receiptId: string): Promise<DataFileCopyReceipt> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.getManagedFileCopyReceipt(authorization, null, receiptId)
    );
  }

  async create<T extends Record<string, unknown>>(
    resourceCode: string,
    data: Record<string, unknown>
  ): Promise<DataRecord<T>> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.createData<T>(authorization, null, resourceCode, data)
    );
  }

  async update<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string,
    input: { expectedRevision: number; data: Record<string, unknown> }
  ): Promise<DataRecord<T>> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.updateData<T>(authorization, null, resourceCode, id, input)
    );
  }

  async delete<T extends Record<string, unknown>>(
    resourceCode: string,
    id: string,
    expectedRevision: number
  ): Promise<DataRecord<T>> {
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.deleteData<T>(
        authorization,
        null,
        resourceCode,
        id,
        expectedRevision
      )
    );
  }

  async transaction(
    transaction: DataTransactionRequest
  ): Promise<DataTransactionResult> {
    assertOpenXiangdaRoleAssertions(undefined, transaction.guards);
    return await this.credentials.withAuthorization(async authorization =>
      this.platform.transactData(authorization, null, transaction)
    );
  }

  async emitEvent(
    input: OpenXiangdaDomainEventEmitInput
  ): Promise<OpenXiangdaDomainEventEmitResult> {
    return domainEventResult(await this.transaction(domainEventTransaction(input)));
  }
}
