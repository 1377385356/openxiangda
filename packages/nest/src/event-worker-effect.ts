import { createHmac } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { eventWorkerEffectSignatureContent, type DataPage, type DataQuery, type EventWorkerEffectCommand, type EventWorkerEffectReceipt, type EventWorkerMutationPlan } from 'openxiangda-contracts';
import { OpenXiangdaEventContext } from './event-context.js';
import { OPENXIANGDA_MODULE_OPTIONS } from './tokens.js';
import type { OpenXiangdaModuleOptions } from './types.js';

/** Event-only facade. Platform remains the sole owner of identity, grants and intent receipts. */
@Injectable()
export class OpenXiangdaEventWorkerEffectService {
  constructor(@Inject(OPENXIANGDA_MODULE_OPTIONS) private readonly options: OpenXiangdaModuleOptions,
    @Inject(OpenXiangdaEventContext) private readonly context: OpenXiangdaEventContext) {}
  query<T extends Record<string, unknown>>(resourceCode: string, query: DataQuery): Promise<DataPage<T> & { appVersionId: string; headRevision: number }> {
    return this.execute({action:'query',resourceCode,query});
  }
  prepare(intentKey: string, plan: EventWorkerMutationPlan): Promise<EventWorkerEffectReceipt> {
    return this.execute({action:'prepare',intentKey,plan});
  }
  commit(intentKey: string, planDigest: string): Promise<EventWorkerEffectReceipt> {
    return this.execute({action:'commit',intentKey,planDigest});
  }
  resolve(intentKey: string): Promise<EventWorkerEffectReceipt | null> {
    return this.execute({action:'resolve',intentKey});
  }
  private async execute<T>(input: { action:'query';resourceCode:string;query:DataQuery } | {action:'prepare';intentKey:string;plan:EventWorkerMutationPlan} | {action:'commit';intentKey:string;planDigest:string} | {action:'resolve';intentKey:string}): Promise<T> {
    const context = this.context.current();
    if (!context?.receiptClaimToken || context.environmentKey !== this.options.environmentKey) throw new UnauthorizedException('OPENXIANGDA_EVENT_WORKER_RECEIPT_AUTHORITY_REQUIRED');
    const configured = this.options.eventSigningSecrets?.[context.subscriptionCode];
    const secret = (Array.isArray(configured) ? configured[0] : configured) || this.options.eventSigningSecret;
    if (!secret) throw new UnauthorizedException('OPENXIANGDA_EVENT_WORKER_SIGNING_SECRET_REQUIRED');
    const command: EventWorkerEffectCommand = {schemaVersion:'openxiangda.event-worker-effect-command/v1',tenantId:context.tenantId,
      appCode:this.options.appCode,environmentKey:context.environmentKey,subscriptionCode:context.subscriptionCode,eventId:context.eventId,
      deliveryId:context.deliveryId,claimToken:context.receiptClaimToken,...input};
    const timestamp = String(Math.floor(Date.now()/1000));
    const signature = createHmac('sha256',secret).update(eventWorkerEffectSignatureContent(command,timestamp)).digest('hex');
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),Math.max(1000,Math.min(15000,this.options.requestTimeoutMs || 10000)));
    let response: Response;
    try { response = await (this.options.fetch || globalThis.fetch)(`${this.options.platformBaseUrl.replace(/\/$/,'')}/openxiangda-api/v2/event-effects`,
      {method:'POST',headers:{'Content-Type':'application/json','X-OpenXiangda-Timestamp':timestamp,'X-OpenXiangda-Signature':`v1=${signature}`},body:JSON.stringify(command),signal:controller.signal});
    } catch { throw new ServiceUnavailableException('OPENXIANGDA_EVENT_WORKER_RESULT_UNKNOWN'); }
    finally { clearTimeout(timer); }
    let envelope: { code?:number;errorCode?:string;data?:T };
    try { envelope = await response.json() as typeof envelope; } catch { throw new ServiceUnavailableException('OPENXIANGDA_EVENT_WORKER_RESULT_UNKNOWN'); }
    if (!response.ok || Number(envelope.code ?? response.status) >= 400) throw Object.assign(new Error(envelope.errorCode || 'OPENXIANGDA_EVENT_WORKER_REJECTED'),{code:envelope.errorCode,status:response.status});
    return envelope.data as T;
  }
}
