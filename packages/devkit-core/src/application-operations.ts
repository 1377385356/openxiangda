import { Ajv } from 'ajv';
import { createHash } from 'node:crypto';
import { developerEnvironment, type DeveloperEnvironment } from './developer-operations.js';

type Page = { limit?: number; offset?: number };
type EventPage = { limit?: number; cursor?: string; from?: string; to?: string };
type Auth = { mode: 'HMAC_SHA256'; keyId: string; secretRef: string }
  | { mode: 'OAUTH2_CLIENT_CREDENTIALS'; tokenUrl: string; clientIdSecretRef: string; clientSecretSecretRef: string; scope?: string; audience?: string }
  | { mode: 'MTLS'; certSecretRef: string; keySecretRef: string; caSecretRef?: string };
export interface ApplicationOperationInputs {
  'events.status': Record<string, never>;
  'events.subscriptions': Record<string, never>;
  'events.deliveries': EventPage;
  'events.journal': EventPage;
  'events.audit': { limit?: number; cursor?: string };
  'events.replay': { deliveryId: string; reason: string; idempotencyKey: string; useCurrentSubscription: boolean };
  'secrets.list': Record<string, never>;
  'secrets.copy': { sourceEnvironment: DeveloperEnvironment; reason: string; idempotencyKey: string; secrets: Array<{ name: string; sourceRevision: number; expectedRevision: number }> };
  'notifications.diagnostics': Record<string, never>;
  'notifications.channels': Record<string, never>;
  'notifications.rules': Record<string, never>;
  'notifications.bootstrap': Record<string, never>;
  'notifications.configure-external-http': { bindingCode: string; expectedRevision: number; status: 'active' | 'paused'; confirmProduction?: boolean; config: {
    schemaVersion: 'openxiangda.notification.external-http-channel/v2'; providerCode: string; baseUrl: string; identityRealm: string; auth: Auth;
    callback: { enabled: boolean; hmacKeyId?: string; hmacSecretRef?: string; maxSkewSeconds: number; actionTokenTtlMinutes: number };
    features: { interactiveActions: boolean; readReceipt: boolean; todoSemantics: boolean }; requestTimeoutMs: number;
  } };
  'notifications.configure-dingtalk-oa': { bindingCode: string; expectedRevision: number; status: 'active' | 'paused'; config: {
    schemaVersion: 'openxiangda.notification.dingtalk-work-notice-oa-channel/v2'; corpId: string; agentId: string;
    clientIdSecretRef: string; clientSecretSecretRef: string; requestTimeoutMs: number; decorationImage: 'NONE' | 'PLATFORM_WORKFLOW';
  } };
  'notifications.test': { bindingCode: string; channel: 'external-http' | 'dingtalk-work-notice-oa' | 'dingtalk-card' };
  'notifications.set-default': { bindingCode: string; expectedRevision: number; expectedBindingRevision: number };
  'notifications.messages': Page & { status?: string; correlationId?: string; recipientUserId?: string };
  'notifications.message': { messageId: string };
  'notifications.dead-letters': Page & { messageId?: string };
  'notifications.replay': { deadLetterId: string };
}
export type ApplicationOperationName = keyof ApplicationOperationInputs;
export type ApplicationOperationRequest = { [K in ApplicationOperationName]: {
  operation: K; environment: DeveloperEnvironment; input: ApplicationOperationInputs[K];
} }[ApplicationOperationName];

const text = (maxLength = 128, description?: string) => ({ type: 'string', minLength: 1, maxLength, ...(description ? { description } : {}) });
const integer = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => ({ type: 'integer', minimum, maximum });
const enumeration = (...values: string[]) => ({ type: 'string', enum: values });
const bool = { type: 'boolean' };
const uuid = { ...text(36), pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' };
const object = (properties: Record<string, unknown> = {}, required: string[] = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const page = { limit: integer(1, 100), offset: integer() };
const eventPage = { limit: integer(1, 100), cursor: text(2048), from: text(40), to: text(40) };
const revision = integer();
const reason = text(500, '操作原因；保留到平台审计');
const idempotencyKey = text(128, '同一次操作及未知结果重试保持原键和完整请求');
const channelFields = { bindingCode: text(), expectedRevision: revision, status: enumeration('active', 'paused') };
const httpConfig = object({
  schemaVersion: { const: 'openxiangda.notification.external-http-channel/v2' }, providerCode: text(), baseUrl: text(2048), identityRealm: text(255),
  auth: { oneOf: [
    object({ mode: { const: 'HMAC_SHA256' }, keyId: text(), secretRef: text() }),
    object({ mode: { const: 'OAUTH2_CLIENT_CREDENTIALS' }, tokenUrl: text(2048), clientIdSecretRef: text(), clientSecretSecretRef: text(), scope: text(500), audience: text(500) }, ['mode', 'tokenUrl', 'clientIdSecretRef', 'clientSecretSecretRef']),
    object({ mode: { const: 'MTLS' }, certSecretRef: text(), keySecretRef: text(), caSecretRef: text() }, ['mode', 'certSecretRef', 'keySecretRef']),
  ] },
  callback: object({ enabled: bool, hmacKeyId: text(), hmacSecretRef: text(), maxSkewSeconds: integer(1), actionTokenTtlMinutes: integer(1) }, ['enabled', 'maxSkewSeconds', 'actionTokenTtlMinutes']),
  features: object({ interactiveActions: bool, readReceipt: bool, todoSemantics: bool }), requestTimeoutMs: integer(1, 60000),
});

interface Definition {
  operation: ApplicationOperationName; summary: string; effect: 'read' | 'configure' | 'recover' | 'health';
  permission: string; recovery: string; inputSchema: ReturnType<typeof object>; path: string; method: 'GET' | 'POST';
}
const operation = (name: ApplicationOperationName, summary: string, effect: Definition['effect'], inputSchema: Definition['inputSchema'], path: string, recovery: string): Definition => ({
  operation: name, summary, effect, inputSchema, path, method: effect === 'read' ? 'GET' : 'POST',
  permission: name.startsWith('events.') ? '现有应用事件管理权限' : name.startsWith('secrets.') ? '两侧环境的现有应用管理权限' : '现有通知管理权限；设置默认同时要求规则和渠道管理权限', recovery,
});
const readRecovery = '以平台返回的当前状态、修订、错误及分页游标为准；未观测到不表示原操作未执行。';
const casRecovery = '修订冲突先读当前基准并核对；结果未知先读原状态，不自动覆盖或重试。';
export const APPLICATION_OPERATIONS: readonly Definition[] = [
  operation('events.status', '读取队列积压、消费者健康、写入保护阈值和恢复条件', 'read', object(), '/events/operations/status', readRecovery),
  operation('events.subscriptions', '读取当前环境订阅及配置修订', 'read', object(), '/events/subscriptions', readRecovery),
  operation('events.deliveries', '分页读取投递、失败重试和死信', 'read', object(eventPage, []), '/events/deliveries', readRecovery),
  operation('events.journal', '分页读取不可变事件日志', 'read', object(eventPage, []), '/events/journal', readRecovery),
  operation('events.audit', '分页读取事件恢复操作审计', 'read', object({ limit: page.limit, cursor: eventPage.cursor }, []), '/events/operations/audit', readRecovery),
  operation('events.replay', '恢复指定原投递；可显式选择已修复的当前订阅', 'recover', object({ deliveryId: uuid, reason, idempotencyKey, useCurrentSubscription: bool }), '/events/deliveries/:deliveryId/replay', '先修复并部署订阅，再恢复指定投递。同键同请求；保持原事实，不重建业务记录。结果未知查投递和审计。'),
  operation('secrets.list', '读取当前环境凭据元信息和修订，不读取明文', 'read', object(), '/environments/:environmentKey/secrets', readRecovery),
  operation('secrets.copy', '从同应用另一个环境原子复制所选加密凭据', 'configure', object({ sourceEnvironment: enumeration('test', 'production'), reason, idempotencyKey, secrets: { type: 'array', minItems: 1, maxItems: 50, items: object({ name: text(), sourceRevision: integer(1), expectedRevision: revision }) } }), '/environments/:environmentKey/secrets/copy-from-environment', '先读两侧 secrets.list；来源必须有效，目标不存在用 revision 0。冲突整批拒绝；未知结果保留原键和请求，允许显式同键重试。复制后重跑晋级预检。'),
  operation('notifications.diagnostics', '诊断默认通道、凭据、收件人绑定及失败投递', 'read', object(), '/notification-hub/management/diagnostics', readRecovery),
  operation('notifications.channels', '读取渠道配置、能力、健康及修订', 'read', object(), '/notification-hub/management/channels', readRecovery),
  operation('notifications.rules', '读取通知规则及修订', 'read', object(), '/notification-hub/management/rules', readRecovery),
  operation('notifications.bootstrap', '初始化缺少的标准通知模板和规则', 'configure', object(), '/notification-hub/bootstrap', '先读取 rules；初始化不发送收件人通知，完成后读取规则及渠道再选择默认。'),
  operation('notifications.configure-external-http', '配置 External HTTP 通道；鉴权仅接受 Secret 引用', 'configure', object({ ...channelFields, confirmProduction: bool, config: httpConfig }, [...Object.keys(channelFields), 'config']), '/notification-hub/management/channels/external-http', casRecovery),
  operation('notifications.configure-dingtalk-oa', '配置钉钉 OA 工作通知通道；仅使用 Secret 引用', 'configure', object({ ...channelFields, config: object({ schemaVersion: { const: 'openxiangda.notification.dingtalk-work-notice-oa-channel/v2' }, corpId: text(255), agentId: text(255), clientIdSecretRef: text(), clientSecretSecretRef: text(), requestTimeoutMs: integer(1, 60000), decorationImage: enumeration('NONE', 'PLATFORM_WORKFLOW') }) }), '/notification-hub/management/channels/dingtalk-work-notice-oa', casRecovery),
  operation('notifications.test', '检查渠道凭据与外部协议健康；不发送实际收件通知', 'health', object({ bindingCode: text(), channel: enumeration('external-http', 'dingtalk-work-notice-oa', 'dingtalk-card') }), '/notification-hub/management/channels/:channel/test', '健康成功只证明协议及凭据有效；实际投递状态需读原消息详情。'),
  operation('notifications.set-default', '为当前环境 workflow.standard 规则选择默认渠道', 'configure', object({ bindingCode: text(), expectedRevision: integer(1), expectedBindingRevision: integer(1) }), '/notification-hub/management/channels/default', casRecovery),
  operation('notifications.messages', '按业务关联或收件人分页查询原通知', 'read', object({ ...page, status: text(50), correlationId: text(255), recipientUserId: text(255) }, []), '/notification-hub/management/messages', readRecovery),
  operation('notifications.message', '读取原消息、收件人、投递尝试和审计', 'read', object({ messageId: uuid }), '/notification-hub/management/messages/:messageId', readRecovery),
  operation('notifications.dead-letters', '分页查询通知死信，可限定原 messageId', 'read', object({ ...page, messageId: uuid }, []), '/notification-hub/management/dead-letters', readRecovery),
  operation('notifications.replay', '修复配置后仅恢复指定原通知死信', 'recover', object({ deadLetterId: uuid }), '/notification-hub/management/dead-letters/:deadLetterId/replay', '先检查原消息及任务仍有效并修复原因；该调用可能实际发送。结果未知查原死信和投递；已恢复后的404不能当作未执行，不自动重试或重建消息。'),
];

/** 目录、CLI 验证和 MCP 输入来自同一组有界 Schema。 */
export const APPLICATION_OPERATION_SCHEMA = {
  type: 'object', oneOf: APPLICATION_OPERATIONS.map(def => object({
    operation: { const: def.operation, description: def.summary }, environment: enumeration('test', 'production'), input: def.inputSchema,
  })),
};
const ajv = new Ajv({ strict: false, allErrors: true });
const validators = new Map(APPLICATION_OPERATIONS.map((def, index) => [def.operation, ajv.compile(APPLICATION_OPERATION_SCHEMA.oneOf[index]!)]));
export function parseApplicationOperation(value: unknown): ApplicationOperationRequest {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > 32768) throw new Error('APPLICATION_OPERATION_INPUT_TOO_LARGE: 输入最多 32 KiB');
  const name = value && typeof value === 'object' ? (value as { operation?: ApplicationOperationName }).operation : undefined;
  const validate = name ? validators.get(name) : undefined;
  if (!validate || !validate(value)) throw Object.assign(new Error('APPLICATION_OPERATION_INPUT_INVALID: 请读取 admin operations 对应输入契约；拒绝未知操作、额外字段和非法环境'), {
    data: { violations: (validate?.errors || []).slice(0, 8).map(error => ({ pointer: error.instancePath, keyword: error.keyword, message: error.message })) },
  });
  const request = value as ApplicationOperationRequest;
  if (request.operation === 'secrets.copy') {
    if (request.environment === request.input.sourceEnvironment) throw new Error('APPLICATION_V2_SECRET_COPY_ENVIRONMENT_INVALID: 来源与目标必须不同');
    if (new Set(request.input.secrets.map(item => item.name)).size !== request.input.secrets.length) throw new Error('APPLICATION_V2_SECRET_COPY_SELECTION_INVALID: 名称不能重复');
  }
  return request;
}

export function applicationOperationCatalog() {
  return {
    schemaVersion: 'openxiangda.application-operations/v1', documentation: 'application-operations',
    inputSchemaDigest: createHash('sha256').update(JSON.stringify(APPLICATION_OPERATION_SCHEMA)).digest('hex'),
    execute: { cli: 'pnpm openxiangda admin execute <operation> --environment <test|production> --input <file|-> --json', mcp: 'application_operation' },
    operations: APPLICATION_OPERATIONS.map(({ path: _path, method: _method, ...def }) => def), inputSchema: APPLICATION_OPERATION_SCHEMA,
  };
}

/** 固定路由来自本目录，调用者无法传任意平台路径。 */
export function applicationOperationTransport(appCode: string, value: unknown) {
  const request = parseApplicationOperation(value);
  const def = APPLICATION_OPERATIONS.find(item => item.operation === request.operation)!;
  const environmentKey = developerEnvironment(request.environment);
  const input: Record<string, unknown> = { ...request.input };
  const path = def.path.replace(/:(\w+)/g, (_match, field: string) => {
    const value = field === 'environmentKey' ? environmentKey : input[field];
    delete input[field];
    return encodeURIComponent(String(value));
  });
  if (request.operation === 'secrets.copy') {
    input.sourceEnvironmentKey = developerEnvironment(request.input.sourceEnvironment);
    delete input.sourceEnvironment;
  }
  const url = `/openxiangda-api/v2/applications/${encodeURIComponent(appCode)}${path}`;
  if (def.method === 'GET') {
    const query = new URLSearchParams({ environmentKey });
    for (const [name, value] of Object.entries(input)) query.set(name, String(value));
    if (['events.deliveries', 'events.journal', 'events.audit', 'notifications.messages', 'notifications.dead-letters'].includes(request.operation) && !query.has('limit')) query.set('limit', '20');
    return { path: `${url}?${query}`, init: {} };
  }
  return { path: url, init: { method: 'POST', body: JSON.stringify(request.operation === 'secrets.copy' ? input : { ...input, environmentKey }) } };
}

/** 凭据输出显式投影，服务端新增字段不会意外泄露到 AI。 */
export function secretOperationMetadata(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const scalarKeys = ['schemaVersion', 'appCode', 'sourceEnvironmentKey', 'environmentKey', 'id', 'name', 'description', 'status', 'revision', 'version', 'activeVersion', 'hasValue', 'expiresAt', 'createdAt', 'updatedAt', 'replayed'];
  return Object.fromEntries([
    ...scalarKeys.filter(key => key in record && (record[key] === null || ['string', 'boolean', 'number'].includes(typeof record[key]))).map(key => [key, record[key]]),
    ...(Array.isArray(record.items) ? [['items', record.items.map(secretOperationMetadata)]] : []),
  ]);
}
