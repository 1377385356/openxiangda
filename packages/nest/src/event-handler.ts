import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Param,
  Post,
  Req,
  SetMetadata,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import {
  APPLICATION_EVENT_HANDLER_PATH_PREFIX_V2,
  SCHEMA_VERSIONS,
  applicationEventHandlerPathV2,
  sha256Digest,
  type AppEventHandlerContract,
  type CloudEvent,
} from 'openxiangda-contracts';
import type { OpenXiangdaEventHandlerContext } from './event-context.js';
import { OpenXiangdaEventReceiver } from './events.js';
import { OpenXiangdaInfrastructureController } from './infrastructure-controller.js';
import { OPENXIANGDA_MODULE_OPTIONS } from './tokens.js';
import type { OpenXiangdaModuleOptions } from './types.js';

const OPENXIANGDA_EVENT_HANDLER = Symbol('OPENXIANGDA_EVENT_HANDLER');

export type OpenXiangdaEventHandlerDeclaration = Omit<
  AppEventHandlerContract,
  'eventTypes' | 'dataSchemaVersions'
> & {
  readonly eventTypes: readonly string[];
  readonly dataSchemaVersions: readonly string[];
};

export interface OpenXiangdaEventConsumer<TEvent extends CloudEvent = CloudEvent> {
  handle(
    event: TEvent,
    context: OpenXiangdaEventHandlerContext
  ): Promise<unknown> | unknown;
}

export function OpenXiangdaEventHandler(
  declaration: OpenXiangdaEventHandlerDeclaration
): ClassDecorator {
  const normalized = normalizeHandlerDeclaration(declaration);
  return SetMetadata(OPENXIANGDA_EVENT_HANDLER, normalized);
}

@Injectable()
export class OpenXiangdaEventRegistry implements OnModuleInit {
  private readonly handlers = new Map<
    string,
    {
      contract: AppEventHandlerContract;
      consumer: OpenXiangdaEventConsumer;
    }
  >();

  constructor(
    @Inject(DiscoveryService)
    private readonly discovery: DiscoveryService,
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions
  ) {}

  onModuleInit() {
    const declared = this.declaredHandlers();
    for (const wrapper of this.discovery.getProviders()) {
      const contract = wrapper.metatype
        ? this.reflector.get<AppEventHandlerContract>(
            OPENXIANGDA_EVENT_HANDLER,
            wrapper.metatype
          )
        : undefined;
      if (!contract || !wrapper.instance) continue;
      const expected = declared.get(contract.code);
      if (!expected || sha256Digest(expected) !== sha256Digest(contract)) {
        throw new Error(
          `事件 handler 与 generated manifest 不一致: ${contract.code}`
        );
      }
      if (typeof wrapper.instance.handle !== 'function') {
        throw new Error(`事件 handler ${contract.code} 缺少 handle()`);
      }
      if (this.handlers.has(contract.code)) {
        throw new Error(`事件 handler 重复注册: ${contract.code}`);
      }
      this.handlers.set(contract.code, {
        contract: expected,
        consumer: wrapper.instance as OpenXiangdaEventConsumer,
      });
    }
    for (const code of declared.keys()) {
      if (!this.handlers.has(code)) {
        throw new Error(`generated manifest 的事件 handler 未注册: ${code}`);
      }
    }
  }

  resolve(code: string) {
    const registered = this.handlers.get(String(code || '').trim());
    if (!registered) {
      throw new NotFoundException({
        code: 'OPENXIANGDA_EVENT_HANDLER_NOT_FOUND',
      });
    }
    return registered;
  }

  private declaredHandlers() {
    const manifest = this.options.eventHandlerManifest;
    if (!manifest) return new Map<string, AppEventHandlerContract>();
    if (
      manifest.schemaVersion !== SCHEMA_VERSIONS.eventHandlerManifest ||
      manifest.appCode !== this.options.appCode ||
      !Array.isArray(manifest.handlers) ||
      manifest.handlers.length > 100
    ) {
      throw new Error('eventHandlerManifest 与当前应用不一致');
    }
    const entries = manifest.handlers.map(handler => {
      const normalized = normalizeHandlerDeclaration(handler);
      return [normalized.code, normalized] as const;
    });
    const result = new Map(entries);
    if (result.size !== entries.length) {
      throw new Error('eventHandlerManifest 包含重复 code');
    }
    return result;
  }
}

@OpenXiangdaInfrastructureController()
@Controller(APPLICATION_EVENT_HANDLER_PATH_PREFIX_V2)
export class OpenXiangdaEventController {
  constructor(
    @Inject(OpenXiangdaEventReceiver)
    private readonly receiver: OpenXiangdaEventReceiver,
    @Inject(OpenXiangdaEventRegistry)
    private readonly registry: OpenXiangdaEventRegistry
  ) {}

  @Post('/:subscriptionCode')
  async deliver(
    @Param('subscriptionCode') subscriptionCode: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: { rawBody?: Buffer }
  ) {
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new BadRequestException('事件入口必须保留 raw body');
    }
    const registered = this.registry.resolve(subscriptionCode);
    return await this.receiver.accept(
      registered.contract,
      headers,
      request.rawBody,
      async (event, context) =>
        await registered.consumer.handle(event, context)
    );
  }
}

function normalizeHandlerDeclaration(
  input: OpenXiangdaEventHandlerDeclaration
): AppEventHandlerContract {
  const code = String(input?.code || '').trim();
  if (!/^[a-z][a-z0-9-]*$/.test(code)) {
    throw new Error('事件 handler code 必须是 kebab-case');
  }
  const endpointPath = applicationEventHandlerPathV2(code);
  if (input.endpointPath !== endpointPath) {
    throw new Error(`事件 handler endpoint 必须是 ${endpointPath}`);
  }
  const eventTypes = unique(input.eventTypes);
  const dataSchemaVersions = unique(input.dataSchemaVersions);
  if (
    eventTypes.length < 1 ||
    eventTypes.length > 20 ||
    dataSchemaVersions.length < 1 ||
    dataSchemaVersions.length > 20 ||
    input.maxBodyBytes !== 65_536 ||
    input.receiptProtocolVersion !== 2
  ) {
    throw new Error(`事件 handler contract 不合法: ${code}`);
  }
  return {
    code,
    endpointPath,
    eventTypes,
    dataSchemaVersions,
    maxBodyBytes: 65_536,
    receiptProtocolVersion: 2,
  };
}

function unique(values: readonly string[]) {
  const normalized = values.map(value => String(value || '').trim());
  if (normalized.some(value => !value)) {
    throw new Error('事件 handler contract 包含空值');
  }
  const result = [...new Set(normalized)].sort();
  if (result.length !== normalized.length) {
    throw new Error('事件 handler contract 包含重复值');
  }
  return result;
}
