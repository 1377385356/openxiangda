import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import {
  DATA_EVENT_TYPES_V2,
  DATA_RECORD_EVENT_DATA_SCHEMA_V2,
  EVENT_DATA_MAX_BYTES_V2,
  SCHEMA_VERSIONS,
  WORKFLOW_EVENT_DATA_SCHEMA_V2,
  WORKFLOW_EVENT_TYPES_V2,
  eventDeliverySignatureContentV2,
  sha256Digest,
  type AppEventHandlerContract,
  type CloudEvent,
  type EventDeliveryAck,
  type EventSchemaDefinition,
  type EventReceiptCommand,
  type EventReceiptResult,
} from 'openxiangda-contracts';
import {
  OPENXIANGDA_EVENT_RECEIPT_STORE,
  OPENXIANGDA_MODULE_OPTIONS
} from './tokens.js';
import {
  OpenXiangdaEventContext,
  type OpenXiangdaEventHandlerContext,
} from './event-context.js';
import type {
  OpenXiangdaEventReceiptContext,
  OpenXiangdaEventReceiptStore,
  OpenXiangdaModuleOptions
} from './types.js';

export type OpenXiangdaEventAcceptResult = EventDeliveryAck;

class OpenXiangdaEventReceiptBusyError extends Error {}

export class OpenXiangdaEventRetryableError extends HttpException {
  constructor(
    code: string,
    message = '事件处理暂时不可用',
    status = 503
  ) {
    if (![408, 409, 425, 429].includes(status) && status < 500) {
      throw new Error('retryable event status 必须是 408/409/425/429/5xx');
    }
    super({ code, message, retryable: true }, status);
  }
}

export class OpenXiangdaEventDeterministicError extends HttpException {
  constructor(code: string, message = '事件业务请求不可处理', status = 422) {
    if (status < 400 || status >= 500 || [408, 409, 425, 429].includes(status)) {
      throw new Error('deterministic event status 必须是非重试 4xx');
    }
    super({ code, message, retryable: false }, status);
  }
}

/**
 * Resolves only declared event subscription credentials from the standard
 * platform environment contract. A staged next secret is first so a rolling
 * deployment can acknowledge deliveries with the credential being activated.
 */
export function eventSigningSecretsFromEnvironment(
  subscriptionCodes: readonly string[],
  environment: Record<string, string | undefined> = process.env
) {
  return Object.fromEntries(
    [...new Set(subscriptionCodes.map(String))].sort().flatMap(code => {
      const envCode = code.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      const active = String(
        environment[`OPENXIANGDA_EVENT_SECRET_${envCode}`] || ''
      ).trim();
      const next = String(
        environment[`OPENXIANGDA_EVENT_SECRET_${envCode}_NEXT`] || ''
      ).trim();
      const values = [next, active].filter(Boolean);
      return values.length ? [[code, values]] : [];
    })
  );
}

@Injectable()
export class InMemoryOpenXiangdaEventReceiptStore implements OpenXiangdaEventReceiptStore {
  private readonly receipts = new Map<string, 'processing' | 'succeeded'>();

  async claim(
    receipt: OpenXiangdaEventReceiptContext
  ): Promise<'claimed' | 'duplicate' | 'busy'> {
    const key = this.key(receipt);
    const current = this.receipts.get(key);
    if (current === 'processing') return 'busy';
    if (current === 'succeeded') return 'duplicate';
    this.receipts.set(key, 'processing');
    return 'claimed';
  }

  async complete(receipt: OpenXiangdaEventReceiptContext): Promise<void> {
    this.receipts.set(this.key(receipt), 'succeeded');
  }

  async release(receipt: OpenXiangdaEventReceiptContext): Promise<void> {
    const key = this.key(receipt);
    if (this.receipts.get(key) === 'processing') this.receipts.delete(key);
  }

  private key(receipt: OpenXiangdaEventReceiptContext) {
    return `${receipt.tenantId}:${receipt.appCode}:${receipt.environmentKey}:${receipt.subscriptionCode}:${receipt.eventId}`;
  }
}

/**
 * Production receipt store backed by the OpenXiangda platform database.
 * The event subscription secret authenticates every command; no app OAuth
 * credential or local database is required.
 */
@Injectable()
export class PlatformOpenXiangdaEventReceiptStore
  implements OpenXiangdaEventReceiptStore
{
  private readonly claimTokens = new Map<string, string>();

  constructor(
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions
  ) {}

  async claim(
    receipt: OpenXiangdaEventReceiptContext
  ): Promise<'claimed' | 'duplicate' | 'busy'> {
    let result: EventReceiptResult;
    try {
      result = await this.execute(receipt, 'claim');
    } catch (error) {
      if (error instanceof OpenXiangdaEventReceiptBusyError) return 'busy';
      throw error;
    }
    if (result.outcome === 'claimed' && result.claimToken) {
      this.claimTokens.set(this.key(receipt), result.claimToken);
      return 'claimed';
    }
    if (result.outcome === 'duplicate' && result.status === 'succeeded') {
      return 'duplicate';
    }
    if (result.outcome === 'duplicate' && result.status === 'processing') {
      return 'busy';
    }
    throw new ServiceUnavailableException(
      '平台返回了不一致的事件回执领取状态'
    );
  }

  async complete(receipt: OpenXiangdaEventReceiptContext): Promise<void> {
    await this.finish(receipt, 'complete');
    this.claimTokens.delete(this.key(receipt));
  }

  async release(receipt: OpenXiangdaEventReceiptContext): Promise<void> {
    try {
      await this.finish(receipt, 'release');
    } finally {
      this.claimTokens.delete(this.key(receipt));
    }
  }

  private async finish(
    receipt: OpenXiangdaEventReceiptContext,
    action: 'complete' | 'release'
  ) {
    const key = this.key(receipt);
    const claimToken = this.claimTokens.get(key);
    if (!claimToken) {
      throw new ServiceUnavailableException('当前事件缺少平台回执 claimToken');
    }
    const maxAttempts = Math.max(
      1,
      Math.min(5, Math.floor(this.options.eventReceiptMaxAttempts || 3))
    );
    const baseDelay = Math.max(
      0,
      Math.min(2_000, Math.floor(this.options.eventReceiptRetryDelayMs ?? 150))
    );
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.execute(receipt, action, claimToken);
        const expectedOutcome =
          action === 'complete' ? 'completed' : 'released';
        if (
          result.outcome !== expectedOutcome &&
          !(action === 'release' && result.outcome === 'completed')
        ) {
          throw new ServiceUnavailableException(
            `平台事件回执 ${action} 返回状态不一致`
          );
        }
        return;
      } catch (error) {
        if (
          !(error instanceof ServiceUnavailableException) ||
          attempt >= maxAttempts
        ) {
          throw error;
        }
        await this.delay(baseDelay * 2 ** (attempt - 1));
      }
    }
  }

  private async delay(milliseconds: number) {
    if (milliseconds <= 0) return;
    await new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  private async execute(
    receipt: OpenXiangdaEventReceiptContext,
    action: EventReceiptCommand['action'],
    claimToken?: string
  ): Promise<EventReceiptResult> {
    const secret = this.signingSecrets(receipt.subscriptionCode)[0];
    if (!secret) {
      throw new UnauthorizedException('事件订阅签名密钥未配置');
    }
    const command: EventReceiptCommand = {
      schemaVersion: SCHEMA_VERSIONS.eventReceiptCommand,
      action,
      ...receipt,
      ...(claimToken ? { claimToken } : {}),
    };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret)
      .update(this.signatureContent(command, timestamp))
      .digest('hex');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1_000, this.options.requestTimeoutMs || 10_000)
    );
    let response: Response;
    try {
      const fetcher = this.options.fetch || globalThis.fetch;
      response = await fetcher(this.receiptUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenXiangda-Timestamp': timestamp,
          'X-OpenXiangda-Signature': `v1=${signature}`,
        },
        body: JSON.stringify(command),
        signal: controller.signal,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error && error.name === 'AbortError'
          ? '平台事件回执请求超时'
          : '平台事件回执请求失败'
      );
    } finally {
      clearTimeout(timeout);
    }
    let envelope: {
      code?: number | string;
      message?: string;
      errorCode?: string;
      data?: unknown;
    };
    try {
      envelope = (await response.json()) as typeof envelope;
    } catch {
      throw new ServiceUnavailableException('平台事件回执返回的不是有效 JSON');
    }
    const code = Number(envelope.code ?? response.status);
    if (!response.ok || code >= 400) {
      if (
        action === 'claim' &&
        response.status === 409 &&
        envelope.errorCode === 'EVENT_V2_RECEIPT_IN_PROGRESS'
      ) {
        throw new OpenXiangdaEventReceiptBusyError();
      }
      const message =
        String(envelope.errorCode || envelope.message || '').trim() ||
        `平台事件回执请求失败 (${response.status})`;
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(message);
      }
      throw new ServiceUnavailableException(message);
    }
    const result = envelope.data as Partial<EventReceiptResult> | undefined;
    if (
      !result ||
      result.schemaVersion !== SCHEMA_VERSIONS.eventReceiptResult ||
      result.eventId !== receipt.eventId ||
      result.deliveryId !== receipt.deliveryId ||
      !Number.isInteger(result.attempts)
    ) {
      throw new ServiceUnavailableException('平台事件回执响应不符合 v2 协议');
    }
    return result as EventReceiptResult;
  }

  private signatureContent(command: EventReceiptCommand, timestamp: string) {
    return [
      SCHEMA_VERSIONS.eventReceiptCommand,
      timestamp,
      command.action,
      command.tenantId,
      command.appCode,
      command.environmentKey,
      command.subscriptionCode,
      command.eventId,
      command.deliveryId,
      command.claimToken || '',
    ].join('\n');
  }

  private receiptUrl() {
    return new URL(
      'openxiangda-api/v2/event-receipts',
      this.options.platformBaseUrl.endsWith('/')
        ? this.options.platformBaseUrl
        : `${this.options.platformBaseUrl}/`
    ).toString();
  }

  private signingSecrets(subscriptionCode: string) {
    const configured =
      this.options.eventSigningSecrets?.[subscriptionCode] ||
      this.options.eventSigningSecret;
    return (Array.isArray(configured) ? configured : [configured])
      .map(secret => String(secret || '').trim())
      .filter(Boolean);
  }

  private key(receipt: OpenXiangdaEventReceiptContext) {
    return `${receipt.tenantId}:${receipt.appCode}:${receipt.environmentKey}:${receipt.subscriptionCode}:${receipt.eventId}`;
  }
}

@Injectable()
export class OpenXiangdaEventReceiver {
  private readonly validators = new Map<string, ValidateFunction>();

  constructor(
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions,
    @Inject(OPENXIANGDA_EVENT_RECEIPT_STORE)
    private readonly receipts: OpenXiangdaEventReceiptStore,
    @Inject(OpenXiangdaEventContext)
    private readonly eventContext: OpenXiangdaEventContext
  ) {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
    });
    const register = (
      eventType: string,
      dataSchemaVersion: string,
      jsonSchema: Record<string, unknown>
    ) => {
      const key = this.schemaKey(eventType, dataSchemaVersion);
      if (this.validators.has(key)) {
        throw new Error(`事件 Schema 重复: ${eventType}@${dataSchemaVersion}`);
      }
      this.validators.set(key, ajv.compile(jsonSchema));
    };
    for (const eventType of DATA_EVENT_TYPES_V2) {
      register(eventType, '2.0.0', DATA_RECORD_EVENT_DATA_SCHEMA_V2);
    }
    for (const eventType of WORKFLOW_EVENT_TYPES_V2) {
      register(eventType, '2.0.0', WORKFLOW_EVENT_DATA_SCHEMA_V2);
    }
    for (const schema of this.options.eventSchemas || []) {
      registerSchema(register, schema);
    }
  }

  async accept(
    contract: AppEventHandlerContract,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
    handler: (
      event: CloudEvent,
      context: OpenXiangdaEventHandlerContext
    ) => Promise<unknown> | unknown
  ): Promise<OpenXiangdaEventAcceptResult> {
    const bytes = Buffer.isBuffer(rawBody)
      ? rawBody.byteLength
      : Buffer.byteLength(String(rawBody || ''), 'utf8');
    if (bytes > Math.min(contract.maxBodyBytes, EVENT_DATA_MAX_BYTES_V2)) {
      throw new BadRequestException('事件 raw body 超过 handler 上限');
    }
    const body = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : String(rawBody || '');
    if (!body) throw new BadRequestException('事件 raw body 不能为空');
    const event = this.parseEvent(body);
    const subscriptionCode = this.header(
      headers,
      'x-openxiangda-subscription-code'
    );
    const timestamp = this.header(headers, 'x-openxiangda-timestamp');
    const signature = this.header(headers, 'x-openxiangda-signature');
    const deliveryId = this.header(headers, 'x-openxiangda-delivery-id');
    const eventId = this.header(headers, 'x-openxiangda-event-id');
    const signingKeyVersion = this.header(
      headers,
      'x-openxiangda-signing-key-version'
    );
    const handlerManifestDigest = this.header(
      headers,
      'x-openxiangda-handler-manifest-digest'
    );
    this.assertContentType(headers);
    if (subscriptionCode !== contract.code) {
      throw new UnauthorizedException('事件订阅与 handler 不一致');
    }
    if (eventId !== event.id) {
      throw new UnauthorizedException('事件 ID header 与 body 不一致');
    }
    if (!/^[1-9]\d*$/.test(signingKeyVersion)) {
      throw new UnauthorizedException('事件签名 key version 无效');
    }
    if (handlerManifestDigest !== this.manifestDigest()) {
      throw new UnauthorizedException('事件 handler manifest 与运行版本不一致');
    }
    this.assertTimestamp(timestamp);
    this.assertSignature(
      subscriptionCode,
      timestamp,
      signature,
      signingKeyVersion,
      deliveryId,
      eventId,
      handlerManifestDigest,
      body
    );
    if (event.appcode !== this.options.appCode) {
      throw new UnauthorizedException('事件 appCode 与当前应用不一致');
    }
    if (event.environment !== this.options.environmentKey) {
      throw new UnauthorizedException('事件 environment 与当前环境不一致');
    }
    this.assertEventSchema(contract, event);
    const receipt: OpenXiangdaEventReceiptContext = {
      tenantId: event.tenantid,
      appCode: event.appcode,
      environmentKey: event.environment,
      subscriptionCode,
      eventId: event.id,
      deliveryId,
    };
    const claim = await this.receipts.claim(receipt);
    if (claim === 'duplicate') {
      return this.ack(event.id, deliveryId, true);
    }
    if (claim === 'busy') {
      throw new OpenXiangdaEventRetryableError(
        'OPENXIANGDA_EVENT_RECEIPT_BUSY',
        '事件已由另一个实例处理中，请稍后重试',
        425
      );
    }
    try {
      await this.eventContext.run(
        event,
        deliveryId,
        subscriptionCode,
        async context => await handler(event, context)
      );
    } catch (handlerError) {
      try {
        await this.receipts.release(receipt);
      } catch (receiptError) {
        const combined = new ServiceUnavailableException({
          status: 'event_receipt_release_failed',
          message: '业务处理失败，且平台事件回执释放失败',
          handlerError:
            handlerError instanceof Error
              ? handlerError.message
              : String(handlerError),
          receiptError:
            receiptError instanceof Error
              ? receiptError.message
              : String(receiptError),
        }) as ServiceUnavailableException & { cause?: unknown };
        combined.cause = handlerError;
        throw combined;
      }
      throw handlerError;
    }
    // The handler has already committed its side effects. Completion is
    // idempotent and retried by the receipt store; never release here, or a
    // transient acknowledgement failure would invite immediate re-execution.
    await this.receipts.complete(receipt);
    return this.ack(event.id, deliveryId, false);
  }

  private parseEvent(body: string): CloudEvent {
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw new BadRequestException('事件 body 不是有效 JSON');
    }
    const event = value as Partial<CloudEvent>;
    if (
      !event ||
      event.specversion !== '1.0' ||
      !String(event.id || '').trim() ||
      !String(event.type || '').trim() ||
      !String(event.source || '').trim() ||
      !String(event.time || '').trim() ||
      !String(event.tenantid || '').trim() ||
      !String(event.appcode || '').trim() ||
      !String(event.environment || '').trim() ||
      event.datacontenttype !== 'application/json' ||
      !String(event.schemaversion || '').trim() ||
      !event.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data)
    ) {
      throw new BadRequestException('事件不符合 CloudEvents 1.0 协议');
    }
    return event as CloudEvent;
  }

  private assertTimestamp(value: string) {
    const timestamp = Number(value);
    const maxAgeSeconds = Math.max(30, this.options.eventMaxAgeSeconds || 300);
    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) > maxAgeSeconds
    ) {
      throw new UnauthorizedException('事件签名时间戳无效或已过期');
    }
  }

  private assertSignature(
    subscriptionCode: string,
    timestamp: string,
    value: string,
    signingKeyVersion: string,
    deliveryId: string,
    eventId: string,
    handlerManifestDigest: string,
    body: string
  ) {
    const configured =
      this.options.eventSigningSecrets?.[subscriptionCode] ||
      this.options.eventSigningSecret;
    const secrets = (Array.isArray(configured) ? configured : [configured])
      .map(secret => String(secret || '').trim())
      .filter(Boolean);
    if (!secrets.length) {
      throw new UnauthorizedException('事件订阅签名密钥未配置');
    }
    const actual = value.startsWith('v2=') ? value.slice(3) : '';
    if (!/^[0-9a-f]{64}$/i.test(actual)) {
      throw new UnauthorizedException('事件签名无效');
    }
    const actualBuffer = Buffer.from(actual, 'hex');
    const valid = secrets.some(secret => {
      const expectedBuffer = Buffer.from(
        createHmac('sha256', secret)
          .update(
            eventDeliverySignatureContentV2({
              timestamp,
              signingKeyVersion,
              deliveryId,
              eventId,
              subscriptionCode,
              handlerManifestDigest,
              rawBody: body,
            })
          )
          .digest('hex'),
        'hex'
      );
      return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
      );
    });
    if (!valid) {
      throw new UnauthorizedException('事件签名无效');
    }
  }

  private assertContentType(
    headers: Record<string, string | string[] | undefined>
  ) {
    const value = this.header(headers, 'content-type').toLowerCase();
    if (!value.startsWith('application/cloudevents+json')) {
      throw new BadRequestException('事件 Content-Type 必须是 structured CloudEvents JSON');
    }
  }

  private assertEventSchema(
    contract: AppEventHandlerContract,
    event: CloudEvent
  ) {
    if (!contract.eventTypes.includes(event.type)) {
      throw new BadRequestException('事件类型不在 handler manifest 中');
    }
    if (!contract.dataSchemaVersions.includes(event.schemaversion)) {
      throw new BadRequestException('事件 data schema version 不受 handler 支持');
    }
    const validate = this.validators.get(
      this.schemaKey(event.type, event.schemaversion)
    );
    if (!validate) {
      throw new BadRequestException('事件 data schema 未随应用版本声明');
    }
    if (!validate(event.data)) {
      throw new BadRequestException('事件 data 不符合声明的 JSON Schema');
    }
  }

  private manifestDigest() {
    const manifest = this.options.eventHandlerManifest;
    if (
      !manifest ||
      manifest.schemaVersion !== SCHEMA_VERSIONS.eventHandlerManifest ||
      manifest.appCode !== this.options.appCode
    ) {
      throw new ServiceUnavailableException('运行版本缺少事件 handler manifest');
    }
    return sha256Digest(manifest);
  }

  private schemaKey(eventType: string, dataSchemaVersion: string) {
    return `${eventType}\u0000${dataSchemaVersion}`;
  }

  private ack(
    eventId: string,
    deliveryId: string,
    duplicate: boolean
  ): EventDeliveryAck {
    return {
      schemaVersion: SCHEMA_VERSIONS.eventDeliveryAck,
      accepted: true,
      duplicate,
      eventId,
      deliveryId,
      receiptStatus: 'succeeded',
    };
  }

  private header(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    const normalized = Array.isArray(value) ? value[0] : value;
    if (!String(normalized || '').trim()) {
      throw new UnauthorizedException(`缺少事件头 ${name}`);
    }
    return String(normalized).trim();
  }
}

function registerSchema(
  register: (
    eventType: string,
    dataSchemaVersion: string,
    jsonSchema: Record<string, unknown>
  ) => void,
  schema: EventSchemaDefinition
) {
  if (schema.owner !== 'application') {
    throw new Error(`应用 eventSchemas 不能覆盖平台 Schema: ${schema.eventType}`);
  }
  register(schema.eventType, schema.dataSchemaVersion, schema.jsonSchema);
}
