import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Injectable,
  OnModuleInit,
  Param,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type {
  WorkflowAssigneeRequest,
  WorkflowAssigneeResponse,
  WorkflowCandidatePrincipal,
} from 'openxiangda-contracts';
import {
  SCHEMA_VERSIONS,
  workflowAssigneeRequestSchema,
} from 'openxiangda-contracts';
import { OpenXiangdaInfrastructureController } from './infrastructure-controller.js';
import { OPENXIANGDA_MODULE_OPTIONS } from './tokens.js';
import type { OpenXiangdaModuleOptions } from './types.js';

const WORKFLOW_ASSIGNEE_PROVIDER = Symbol('OPENXIANGDA_WORKFLOW_ASSIGNEE_PROVIDER');

export function WorkflowAssigneeProvider(code: string): ClassDecorator {
  const normalized = String(code || '').trim();
  if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(normalized)) {
    throw new Error('WorkflowAssigneeProvider code 不合法');
  }
  return SetMetadata(WORKFLOW_ASSIGNEE_PROVIDER, normalized);
}

export interface WorkflowAssigneeProviderHandler {
  resolve(
    request: WorkflowAssigneeRequest
  ):
    | Promise<WorkflowCandidatePrincipal[]>
    | WorkflowCandidatePrincipal[];
}

@Injectable()
export class OpenXiangdaAssigneeProviderRegistry implements OnModuleInit {
  private readonly handlers = new Map<string, WorkflowAssigneeProviderHandler>();

  constructor(
    @Inject(DiscoveryService)
    private readonly discovery: DiscoveryService,
    @Inject(Reflector)
    private readonly reflector: Reflector
  ) {}

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders()) {
      const code = wrapper.metatype
        ? this.reflector.get<string>(WORKFLOW_ASSIGNEE_PROVIDER, wrapper.metatype)
        : undefined;
      if (!code || !wrapper.instance) continue;
      if (typeof wrapper.instance.resolve !== 'function') {
        throw new Error(`Workflow Assignee Provider ${code} 缺少 resolve()`);
      }
      if (this.handlers.has(code)) {
        throw new Error(`Workflow Assignee Provider 重复: ${code}`);
      }
      this.handlers.set(code, wrapper.instance as WorkflowAssigneeProviderHandler);
    }
  }

  async resolve(code: string, request: WorkflowAssigneeRequest) {
    const handler = this.handlers.get(code);
    if (!handler) {
      throw new BadRequestException(`Workflow Assignee Provider 未注册: ${code}`);
    }
    const candidates = await handler.resolve(request);
    return normalizeWorkflowCandidates(candidates);
  }
}

export function normalizeWorkflowCandidates(value: unknown) {
  if (!Array.isArray(value) || value.length > 200) {
    throw new BadRequestException('Workflow Assignee Provider 返回值不合法');
  }
  const unique = new Map<string, WorkflowCandidatePrincipal>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException('Workflow Assignee Provider 候选人不合法');
    }
    const source = item as Partial<WorkflowCandidatePrincipal>;
    const userId = String(source.userId || '').trim();
    const candidateSource = String(source.source || '').trim();
    if (!userId || !candidateSource) {
      throw new BadRequestException('Workflow Assignee Provider 候选人不合法');
    }
    const candidate: WorkflowCandidatePrincipal = {
      userId,
      source: candidateSource,
      ...(source.roleSubjectKey
        ? { roleSubjectKey: String(source.roleSubjectKey).trim() }
        : {}),
      ...(source.roleCode
        ? { roleCode: String(source.roleCode).trim() }
        : {}),
      ...(source.displayName
        ? { displayName: String(source.displayName).trim() }
        : {}),
    };
    unique.set(
      [candidate.userId, candidate.roleSubjectKey || '', candidate.roleCode || ''].join(
        '\u0000'
      ),
      candidate
    );
  }
  return [...unique.values()];
}

@Injectable()
export class OpenXiangdaAssigneeProviderReceiver {
  private readonly validateRequest = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  }).compile(workflowAssigneeRequestSchema);

  constructor(
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions
  ) {}

  accept(
    providerCode: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string
  ): WorkflowAssigneeRequest {
    const body = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : String(rawBody || '');
    if (!body) throw new BadRequestException('Provider raw body 不能为空');
    const headerProvider = this.header(
      headers,
      'x-openxiangda-workflow-provider'
    );
    const timestamp = this.header(headers, 'x-openxiangda-timestamp');
    const signature = this.header(headers, 'x-openxiangda-signature');
    this.header(headers, 'x-openxiangda-request-id');
    if (headerProvider !== providerCode) {
      throw new UnauthorizedException('Provider code 与请求路径不一致');
    }
    this.assertTimestamp(timestamp);
    this.assertSignature(providerCode, timestamp, signature, body);
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw new BadRequestException('Provider body 不是有效 JSON');
    }
    const request = value as Partial<WorkflowAssigneeRequest>;
    if (
      !this.validateRequest(value) ||
      request.providerCode !== providerCode ||
      request.appCode !== this.options.appCode
    ) {
      throw new BadRequestException('Provider 请求不符合 v2.1 协议');
    }
    return request as WorkflowAssigneeRequest;
  }

  private assertTimestamp(value: string) {
    const timestamp = Number(value);
    const maxAgeSeconds = Math.max(
      30,
      this.options.workflowAssigneeProviderMaxAgeSeconds || 300
    );
    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) > maxAgeSeconds
    ) {
      throw new UnauthorizedException('Provider 签名时间戳无效或已过期');
    }
  }

  private assertSignature(
    providerCode: string,
    timestamp: string,
    value: string,
    body: string
  ) {
    const configured =
      this.options.workflowAssigneeProviderSecrets?.[providerCode];
    const secrets = (Array.isArray(configured) ? configured : [configured])
      .map(secret => String(secret || '').trim())
      .filter(Boolean);
    if (!secrets.length) {
      throw new UnauthorizedException('Provider 签名密钥未配置');
    }
    const actual = value.startsWith('v1=') ? value.slice(3) : '';
    const actualBuffer = Buffer.from(actual, 'hex');
    const valid = secrets.some(secret => {
      const expected = createHmac('sha256', secret)
        .update(`${timestamp}.${body}`)
        .digest('hex');
      const expectedBuffer = Buffer.from(expected, 'hex');
      return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
      );
    });
    if (!valid) {
      throw new UnauthorizedException('Provider 签名无效');
    }
  }

  private header(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    const normalized = Array.isArray(value) ? value[0] : value;
    if (!String(normalized || '').trim()) {
      throw new UnauthorizedException(`缺少 Provider 请求头 ${name}`);
    }
    return String(normalized).trim();
  }
}

@OpenXiangdaInfrastructureController()
@Controller('/openxiangda/workflow/assignee-providers')
export class OpenXiangdaAssigneeProviderController {
  constructor(
    @Inject(OpenXiangdaAssigneeProviderReceiver)
    private readonly receiver: OpenXiangdaAssigneeProviderReceiver,
    @Inject(OpenXiangdaAssigneeProviderRegistry)
    private readonly registry: OpenXiangdaAssigneeProviderRegistry
  ) {}

  @Post('/:providerCode')
  async resolve(
    @Param('providerCode') providerCode: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: { rawBody?: Buffer },
    @Body() body: unknown
  ): Promise<WorkflowAssigneeResponse> {
    const rawBody = request.rawBody || Buffer.from(JSON.stringify(body));
    const input = this.receiver.accept(providerCode, headers, rawBody);
    const candidates = await this.registry.resolve(providerCode, input);
    return {
      schemaVersion: SCHEMA_VERSIONS.workflowAssigneeResponse,
      requestId: input.requestId,
      candidates,
    };
  }
}
