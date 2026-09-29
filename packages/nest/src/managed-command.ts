import { BadRequestException, Controller, Inject, Injectable, Param, Post, Req, Scope, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ContextIdFactory, DiscoveryService, ModuleRef, Reflector } from '@nestjs/core';
import { sha256Digest, type CurrentInitiatorDirectorySnapshot, type DataPage, type DataQuery, type DataRecord, type ManagedCommandHandlerManifest, type ManagedCommandPlan } from 'openxiangda-contracts';
import { OpenXiangdaGatewayAssertionVerifier } from './gateway-transport.js';
import { OpenXiangdaInfrastructureController } from './infrastructure-controller.js';
import { ManagedExecutionController, runManagedExecution } from './managed-command-private.js';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import { OPENXIANGDA_MODULE_OPTIONS } from './tokens.js';
import type { OpenXiangdaHttpRequest, OpenXiangdaModuleOptions } from './types.js';
import { validateManagedCommandPlan } from './managed-command-plan.js';
const HANDLER = Symbol('managed-command-handler');
type Declaration = {
    readonly commandCode: string;
    readonly handlerCode: string;
};
type ManifestEntry = ManagedCommandHandlerManifest['handlers'][number];
export interface OpenXiangdaManagedCommandContext {
    readonly commandId: string;
    readonly commandCode: string;
    readonly generation: number;
    readonly actor: Readonly<{
        userId: string;
    }>;
    readonly acceptedAt: string;
    readonly deadlineAt: string;
    readonly data: {
        get<T extends Record<string, unknown>>(resourceCode: string, id: string): Promise<DataRecord<T>>;
        query<T extends Record<string, unknown>>(resourceCode: string, query: DataQuery): Promise<DataPage<T>>;
    };
    readonly directory: {
        currentInitiator(): Promise<CurrentInitiatorDirectorySnapshot>;
    };
}
export interface OpenXiangdaManagedCommandPlanner {
    plan(input: Readonly<Record<string, unknown>>, context: OpenXiangdaManagedCommandContext): Promise<ManagedCommandPlan> | ManagedCommandPlan;
}
/** Request scope ensures constructor/DI effects occur only inside the verified execution context. */
export function OpenXiangdaManagedCommandHandler(declaration: Declaration): ClassDecorator {
    for (const code of [declaration?.commandCode, declaration?.handlerCode])
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(code))
            throw new Error('OPENXIANGDA_MANAGED_HANDLER_INVALID');
    const normalized = Object.freeze({ commandCode: declaration.commandCode, handlerCode: declaration.handlerCode });
    return target => { Injectable({ scope: Scope.REQUEST })(target); SetMetadata(HANDLER, normalized)(target); };
}
@Injectable()
export class OpenXiangdaManagedCommandRegistry implements OnModuleInit {
    private readonly handlers = new Map<string, {
        contract: ManifestEntry;
        resolve: () => Promise<OpenXiangdaManagedCommandPlanner>;
    }>();
    constructor(
    @Inject(DiscoveryService)
    private readonly discovery: DiscoveryService, 
    @Inject(Reflector)
    private readonly reflector: Reflector, 
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions) { }
    onModuleInit() {
        const manifest = this.options.managedCommandHandlerManifest;
        if (manifest && (manifest.schemaVersion !== 'openxiangda.managed-command-handler-manifest/v1' || manifest.appCode !== this.options.appCode || !Array.isArray(manifest.handlers) || manifest.handlers.length > 32))
            throw new Error('OPENXIANGDA_MANAGED_MANIFEST_INVALID');
        const declarations = new Map((manifest?.handlers || []).map(c => [c.handlerCode, c]));
        if (declarations.size !== (manifest?.handlers.length || 0))
            throw new Error('OPENXIANGDA_MANAGED_MANIFEST_DUPLICATE');
        for (const wrapper of this.discovery.getProviders()) {
            const declaration = wrapper.metatype ? this.reflector.get<Declaration>(HANDLER, wrapper.metatype) : undefined;
            if (!declaration)
                continue;
            const contract = declarations.get(declaration.handlerCode);
            if (!contract || contract.commandCode !== declaration.commandCode || contract.endpointPath !== `/__platform/managed-commands/${contract.handlerCode}/plan` || !/^[0-9a-f]{64}$/.test(contract.declarationDigest) || contract.execution.kind !== 'backend-plan' || contract.execution.handlerCode !== contract.handlerCode)
                throw new Error('OPENXIANGDA_MANAGED_MANIFEST_MISMATCH');
            if (wrapper.scope !== Scope.REQUEST || this.handlers.has(contract.handlerCode))
                throw new Error('OPENXIANGDA_MANAGED_HANDLER_SCOPE_INVALID');
            const moduleRef = wrapper.host?.getProviderByKey<ModuleRef>(ModuleRef)?.instance;
            if (!moduleRef)
                throw new Error('OPENXIANGDA_MANAGED_HANDLER_MODULE_REQUIRED');
            this.handlers.set(contract.handlerCode, { contract, resolve: async () => {
                    const contextId = ContextIdFactory.create();
                    moduleRef.registerRequestByContextId(Object.freeze({}), contextId);
                    const consumer = await moduleRef.resolve<OpenXiangdaManagedCommandPlanner>(wrapper.token, contextId, { strict: true });
                    if (!consumer || typeof consumer.plan !== 'function')
                        throw new Error('OPENXIANGDA_MANAGED_HANDLER_PLAN_REQUIRED');
                    return consumer;
                } });
        }
        for (const code of declarations.keys())
            if (!this.handlers.has(code))
                throw new Error(`OPENXIANGDA_MANAGED_HANDLER_MISSING:${code}`);
    }
    resolve(code: string) { const result = this.handlers.get(code); if (!result)
        throw new BadRequestException({ code: 'OPENXIANGDA_MANAGED_HANDLER_NOT_FOUND' }); return result; }
}
@ManagedExecutionController()
@OpenXiangdaInfrastructureController()
@Controller('/__platform/managed-commands')
export class OpenXiangdaManagedCommandController {
    constructor(
    @Inject(OpenXiangdaManagedCommandRegistry)
    private readonly registry: OpenXiangdaManagedCommandRegistry, 
    @Inject(OpenXiangdaGatewayAssertionVerifier)
    private readonly verifier: OpenXiangdaGatewayAssertionVerifier, 
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient, 
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions) { }
    @Post('/:handlerCode/plan')
    async plan(
    @Param('handlerCode')
    handlerCode: string, 
    @Req()
    request: OpenXiangdaHttpRequest) {
        const headers = new Headers(request.headers as Record<string, string>);
        const authorization = headers.get('authorization') || '';
        const proof = authorization.match(/^Bearer\s+(\S+)$/i)?.[1] || '';
        const assertion = headers.get('x-openxiangda-gateway-assertion') || '';
        if (!proof || !assertion)
            throw new UnauthorizedException({ code: 'OPENXIANGDA_MANAGED_EXECUTION_PROOF_REQUIRED' });
        const gateway = await this.verifier.verify({ assertion, invocationToken: proof, request });
        const verified = await this.platform.verifyManagedCommandExecution(authorization, assertion);
        const registered = this.registry.resolve(handlerCode);
        const body = request.body as {
            commandId?: unknown;
            generation?: unknown;
            input?: unknown;
        };
        if (!body || Object.keys(body).some(k => !['commandId', 'generation', 'input'].includes(k)) || verified.commandId !== body.commandId || verified.generation !== body.generation || verified.handlerCode !== handlerCode || verified.commandCode !== registered.contract.commandCode || verified.declarationDigest !== registered.contract.declarationDigest || verified.inputDigest !== sha256Digest(body.input) || verified.inputDigest !== sha256Digest(verified.input) || !Number.isSafeInteger(verified.generation) || verified.generation < 1 || !verified.actorId || !Number.isFinite(Date.parse(verified.acceptedAt)) || !Number.isFinite(Date.parse(verified.deadlineAt)) || Date.parse(verified.acceptedAt) > Date.parse(verified.deadlineAt) || Date.parse(verified.deadlineAt) <= Date.now() || verified.runtime.tenantId !== gateway.tenant_id || verified.runtime.appCode !== this.options.appCode || verified.runtime.environmentKey !== this.options.environmentKey || verified.runtime.environmentId !== this.options.environmentId || verified.runtime.versionId !== this.options.appVersionId || verified.runtime.deploymentId !== this.options.deploymentRunId || verified.runtime.headRevision !== this.options.environmentHeadRevision)
            throw new UnauthorizedException({ code: 'OPENXIANGDA_MANAGED_EXECUTION_CONTEXT_INVALID' });
        const context: OpenXiangdaManagedCommandContext = Object.freeze({ commandId: verified.commandId, commandCode: verified.commandCode, generation: verified.generation, actor: Object.freeze({ userId: verified.actorId }), acceptedAt: verified.acceptedAt, deadlineAt: verified.deadlineAt,
            data: Object.freeze({ get: this.platform.managedCommandGet.bind(this.platform), query: this.platform.managedCommandQuery.bind(this.platform) }), directory: Object.freeze({ currentInitiator: this.platform.managedCommandCurrentInitiator.bind(this.platform) }) });
        const input = Object.freeze({ ...verified.input }); // Declaration permits scalar parameters only.
        return runManagedExecution(authorization, verified, async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                const result = await Promise.race([Promise.resolve().then(async () => { const handler = await registered.resolve(); return handler.plan(input, context); }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('OPENXIANGDA_MANAGED_HANDLER_TIMEOUT')), Math.max(1, Math.min(registered.contract.execution.timeoutMs, Date.parse(verified.deadlineAt) - Date.now()))); })]);
                const plan = validateManagedCommandPlan(result, registered.contract.execution);
                if (JSON.stringify(plan).includes(proof))
                    throw new Error('OPENXIANGDA_MANAGED_PLAN_INVALID');
                return plan;
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        });
    }
}
