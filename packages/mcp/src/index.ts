import { developerError, developerAuthorizationStatus, sessionWorkspaceRoot, workspaceSessionPath } from 'openxiangda-devkit-core';
import { McpServer, ResourceTemplate, fromJsonSchema } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { resolve } from 'node:path';
import {
  OPENXIANGDA_TOOLCHAIN_VERSION,
  OpenXiangdaApplicationServices,
  checkApplication, deployApplication, developerEnvironment, watchDeployment,
  DEVELOPER_ENVIRONMENTS, documentationIndex, readDocumentation,
  type OperationProgressListener,
} from 'openxiangda-devkit-core';
import {
  assertAiCapabilityCatalog,
  type AiCapability,
  type AiCapabilityCatalog,
} from 'openxiangda-contracts';

export interface ApplicationAiMcpExecutor {
  executeRead(
    capability: AiCapability,
    input: Record<string, unknown>
  ): Promise<unknown>;
  createPreview(
    capability: AiCapability,
    input: Record<string, unknown>
  ): Promise<unknown>;
  confirmPreview(previewId: string): Promise<unknown>;
}

export interface ApplicationAiPlatformApi {
  executeRead(
    capabilityCode: string,
    input: Record<string, unknown>
  ): Promise<unknown>;
  createPreview(
    capabilityCode: string,
    input: Record<string, unknown>
  ): Promise<unknown>;
  confirmPreview(previewId: string): Promise<unknown>;
}

export interface ApplicationAiMcpOptions {
  catalog: AiCapabilityCatalog;
  executor: ApplicationAiMcpExecutor;
  serverName?: string;
  serverVersion?: string;
}

export interface AggregatedApplicationAiMcpEntry {
  catalog: AiCapabilityCatalog;
  executor: ApplicationAiMcpExecutor;
}

export interface AggregatedApplicationAiMcpOptions {
  /** Reload current-user catalogs on every tool invocation. */
  loadApplications(): Promise<AggregatedApplicationAiMcpEntry[]>;
  serverName?: string;
  serverVersion?: string;
}

export const APPLICATION_AI_MCP_CATALOG_URI = 'openxiangda://ai/catalog';
export const APPLICATION_AI_MCP_CONFIRM_TOOL = 'openxiangda.ai.confirm';
export const AGGREGATED_AI_MCP_CATALOG_URI = 'openxiangda://ai/catalog';
export const AGGREGATED_AI_MCP_TOOL_NAMES = [
  'apps.search',
  'resources.describe',
  'records.query',
  'records.get',
  'records.create',
  'records.update',
  'records.delete',
  'actions.invoke',
  'mutations.confirm',
] as const;

/** Bind an application MCP facade to the platform-owned AI execution boundary. */
export function createApplicationAiPlatformExecutor(
  platformApi: ApplicationAiPlatformApi
): ApplicationAiMcpExecutor {
  return {
    async executeRead(capability, input) {
      if (capability.risk !== 'read') {
        throw new Error('AI_READ_CAPABILITY_REQUIRED');
      }
      return await platformApi.executeRead(capability.code, input);
    },
    async createPreview(capability, input) {
      if (capability.risk === 'read') {
        throw new Error('AI_MUTATION_CAPABILITY_REQUIRED');
      }
      return await platformApi.createPreview(capability.code, input);
    },
    async confirmPreview(previewId) {
      return await platformApi.confirmPreview(previewId);
    },
  };
}

/**
 * Build one application-scoped MCP facade from the immutable AI Catalog.
 * Identity, Data API authorization and preview storage remain owned by the
 * host executor; this adapter only maps the catalog to MCP tools.
 */
export function createApplicationAiMcpServer(options: ApplicationAiMcpOptions) {
  assertAiCapabilityCatalog(options.catalog);
  const server = new McpServer(
    {
      name: options.serverName || `${options.catalog.appCode}-ai`,
      version: options.serverVersion || '1.0.0',
    },
    {
      instructions:
        'Use read tools for bounded queries. Mutation tools only create a preview; call openxiangda.ai.confirm with the returned previewId after the user explicitly confirms the summary.',
    }
  );

  server.registerResource(
    'ai-capability-catalog',
    APPLICATION_AI_MCP_CATALOG_URI,
    { title: `${options.catalog.appName} AI Catalog`, mimeType: 'application/json' },
    async resourceUri => ({
      contents: [
        {
          uri: resourceUri.href,
          mimeType: 'application/json',
          text: JSON.stringify(options.catalog, null, 2),
        },
      ],
    })
  );

  let hasMutation = false;
  for (const capability of options.catalog.capabilities) {
    const isRead = capability.risk === 'read';
    const toolName = isRead ? capability.code : `${capability.code}.preview`;
    hasMutation ||= !isRead;
    server.registerTool(
      toolName,
      {
        title: isRead ? capability.name : `${capability.name}预览`,
        description: isRead
          ? capability.description
          : `${capability.description}。此工具只生成预览，不会修改数据。`,
        inputSchema: fromJsonSchema(capability.inputSchema as never),
        annotations: {
          readOnlyHint: true,
          destructiveHint: !isRead && capability.risk === 'destructive',
          idempotentHint: isRead,
        },
      },
      async input => {
        const result = isRead
          ? await options.executor.executeRead(capability, input as Record<string, unknown>)
          : await options.executor.createPreview(
              capability,
              input as Record<string, unknown>
            );
        return aiToolResult(result);
      }
    );
  }

  if (hasMutation) {
    server.registerTool(
      APPLICATION_AI_MCP_CONFIRM_TOOL,
      {
        title: '确认并执行 AI 预览',
        description:
          '仅在用户明确确认预览摘要后调用。previewId 由应用预览工具返回，并由宿主重新校验当前用户、权限、版本和幂等性。',
        inputSchema: z.object({ previewId: z.string().min(1) }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
        },
      },
      async input => aiToolResult(await options.executor.confirmPreview(input.previewId))
    );
  }
  return server;
}

/**
 * Build the platform-level AI facade from the same per-application Catalogs.
 * The aggregator only routes tools to the owning application executor; it
 * never merges permissions or creates a second data/auth boundary.
 */
export function createAggregatedAiMcpServer(
  options: AggregatedApplicationAiMcpOptions
) {
  if (typeof options.loadApplications !== 'function') {
    throw new Error('AI_APPLICATION_LOADER_REQUIRED');
  }
  const loadApplications = async () => {
    const entries = await options.loadApplications();
    if (!Array.isArray(entries) || entries.length > 1000) {
      throw new Error('AI_APPLICATION_SET_INVALID');
    }
    const appCodes = new Set<string>();
    const capabilityCodes = new Set<string>();
    for (const entry of entries) {
      assertAiCapabilityCatalog(entry.catalog);
      if (appCodes.has(entry.catalog.appCode)) {
        throw new Error(`AI_APPLICATION_CODE_CONFLICT:${entry.catalog.appCode}`);
      }
      appCodes.add(entry.catalog.appCode);
      for (const capability of entry.catalog.capabilities) {
        if (capabilityCodes.has(capability.code)) {
          throw new Error(`AI_CAPABILITY_CODE_CONFLICT:${capability.code}`);
        }
        capabilityCodes.add(capability.code);
      }
    }
    return entries;
  };
  const server = new McpServer(
    {
      name: options.serverName || 'openxiangda-ai',
      version: options.serverVersion || '1.0.0',
    },
    {
      instructions:
        'Search applications, describe resources, then use the fixed record or action tools. Mutation tools only create a preview. Ask for explicit user confirmation before mutations.confirm.',
    }
  );
  server.registerResource(
    'ai-capability-catalog',
    AGGREGATED_AI_MCP_CATALOG_URI,
    { title: 'OpenXiangda AI Catalog', mimeType: 'application/json' },
    async resourceUri => {
      const entries = await loadApplications();
      return {
        contents: [
          {
            uri: resourceUri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                schemaVersion: 'openxiangda.ai-capability-set/v1',
                applications: entries.map(entry => entry.catalog),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const recordInput = z.record(z.string(), z.unknown());
  const appResourceInput = {
    appCode: z.string().min(1),
    resourceCode: z.string().min(1),
  };
  const resolveGenerated = async (
    appCode: string,
    resourceCode: string,
    operation: 'query' | 'get' | 'create' | 'update' | 'delete'
  ) => {
    const applications = await loadApplications();
    const application = applications.find(
      entry => entry.catalog.appCode === appCode
    );
    const capability = application?.catalog.capabilities.find(
      item =>
        item.kind === 'generatedCrud' &&
        item.generatedFrom?.resourceCode === resourceCode &&
        item.generatedFrom.operation === operation
    );
    if (!application || !capability) {
      throw new Error('AI_CAPABILITY_NOT_FOUND');
    }
    return { capability, executor: application.executor };
  };
  const preview = async (
    entry: { capability: AiCapability; executor: ApplicationAiMcpExecutor },
    input: Record<string, unknown>
  ) => {
    const result = await entry.executor.createPreview(entry.capability, input);
    const previewId = String((result as any)?.previewId || '').trim();
    if (!previewId) throw new Error('AI_PREVIEW_ID_REQUIRED');
    return result;
  };

  server.registerTool(
    AGGREGATED_AI_MCP_TOOL_NAMES[0],
    {
      title: '搜索应用 AI 能力',
      description: '按应用名称、编码或能力说明搜索当前用户可见的应用。',
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async input => {
      const entries = await loadApplications();
      const query = String(input.query || '').trim().toLowerCase();
      const applications = entries
        .filter(entry => {
          if (!query) return true;
          return [
            entry.catalog.appCode,
            entry.catalog.appName,
            ...entry.catalog.capabilities.flatMap(capability => [
              capability.name,
              capability.description,
            ]),
          ].some(value => value.toLowerCase().includes(query));
        })
        .sort((left, right) => left.catalog.appCode.localeCompare(right.catalog.appCode))
        .slice(0, input.limit || 20)
        .map(entry => ({
          appCode: entry.catalog.appCode,
          appName: entry.catalog.appName,
          capabilityCount: entry.catalog.capabilities.length,
        }));
      return aiToolResult({ applications });
    }
  );

  server.registerTool(
    AGGREGATED_AI_MCP_TOOL_NAMES[1],
    {
      title: '描述应用资源',
      description: '读取一个应用资源对当前用户开放的 CRUD 与自定义动作。',
      inputSchema: z.object(appResourceInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async input => {
      const entries = await loadApplications();
      const entry = entries.find(item => item.catalog.appCode === input.appCode);
      if (!entry) throw new Error('AI_APPLICATION_NOT_FOUND');
      const resourceCapabilities = entry.catalog.capabilities.filter(capability =>
        capability.resources.includes(input.resourceCode)
      );
      if (resourceCapabilities.length === 0) throw new Error('AI_RESOURCE_NOT_FOUND');
      return aiToolResult({
        appCode: input.appCode,
        resourceCode: input.resourceCode,
        capabilities: resourceCapabilities,
      });
    }
  );

  server.registerTool(
    AGGREGATED_AI_MCP_TOOL_NAMES[2],
    {
      title: '查询应用记录',
      description: '按声明字段和当前用户数据权限查询最多 100 条记录。',
      inputSchema: z.object({ ...appResourceInput, input: recordInput }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async input => {
      const entry = await resolveGenerated(
        input.appCode,
        input.resourceCode,
        'query'
      );
      return aiToolResult(await entry.executor.executeRead(entry.capability, input.input));
    }
  );

  server.registerTool(
    AGGREGATED_AI_MCP_TOOL_NAMES[3],
    {
      title: '读取应用记录',
      description: '按记录 ID 读取当前用户可见的详情。',
      inputSchema: z.object({ ...appResourceInput, id: z.string().min(1) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async input => {
      const entry = await resolveGenerated(
        input.appCode,
        input.resourceCode,
        'get'
      );
      return aiToolResult(await entry.executor.executeRead(entry.capability, { id: input.id }));
    }
  );

  for (const [toolIndex, operation] of [
    [4, 'create'],
    [5, 'update'],
    [6, 'delete'],
  ] as const) {
    server.registerTool(
      AGGREGATED_AI_MCP_TOOL_NAMES[toolIndex],
      {
        title: `${operation === 'create' ? '新增' : operation === 'update' ? '更新' : '删除'}应用记录预览`,
        description: '只生成待确认预览，不会在此调用中修改业务数据。',
        inputSchema: z.object({ ...appResourceInput, input: recordInput }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: operation === 'delete',
          idempotentHint: false,
        },
      },
      async input => {
        const entry = await resolveGenerated(
          input.appCode,
          input.resourceCode,
          operation
        );
        return aiToolResult(await preview(entry, input.input));
      }
    );
  }

  server.registerTool(
    AGGREGATED_AI_MCP_TOOL_NAMES[7],
    {
      title: '调用应用业务动作',
      description: '调用显式发布的自定义 AI 动作；写动作只返回预览。',
      inputSchema: z.object({
        appCode: z.string().min(1),
        capabilityCode: z.string().min(1),
        input: recordInput,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async input => {
      const applications = await loadApplications();
      const application = applications.find(
        item => item.catalog.appCode === input.appCode
      );
      const capability = application?.catalog.capabilities.find(
        item => item.code === input.capabilityCode
      );
      if (
        !application ||
        !capability ||
        capability.kind !== 'customAction'
      ) {
        throw new Error('AI_CUSTOM_CAPABILITY_NOT_FOUND');
      }
      const entry = { capability, executor: application.executor };
      const result =
        capability.risk === 'read'
          ? await application.executor.executeRead(capability, input.input)
          : await preview(entry, input.input);
      return aiToolResult(result);
    }
  );

  server.registerTool(
    AGGREGATED_AI_MCP_TOOL_NAMES[8],
    {
      title: '确认并执行 AI 预览',
      description: '仅在用户明确确认预览摘要后调用。',
      inputSchema: z.object({
        appCode: z.string().min(1),
        previewId: z.string().min(1),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async input => {
      const applications = await loadApplications();
      const application = applications.find(
        item => item.catalog.appCode === input.appCode
      );
      if (!application) throw new Error('AI_APPLICATION_NOT_FOUND');
      return aiToolResult(
        await application.executor.confirmPreview(input.previewId)
      );
    }
  );
  return server;
}

function aiToolResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: (result || {}) as Record<string, unknown>,
  };
}

export const MCP_RESOURCE_URIS = [
  'openxiangda://workspace/context',
  'openxiangda://workspace/contracts',
  'openxiangda://workspace/appspec',
  'openxiangda://platform/capabilities',
  'openxiangda://deployments/latest',
  'openxiangda://environments',
  'openxiangda://docs/index',
] as const;

const environment = z.enum(DEVELOPER_ENVIRONMENTS).default('test').describe('目标环境；默认 test，production 必须明确选择');
const deploymentInput = z.object({
  environment,
  from: z.string().min(1).optional().describe('production 必填：成功测试 DeploymentRun ID；test 不接受'),
  deploymentStrategy: z.enum(['rolling', 'maintenance-replace']).optional().describe('仅 TEST；显式 maintenance-replace 允许停机替换并由平台处理失败恢复，默认 rolling'),
  environmentId: z.string().optional().describe('测试环境 ID，通常由平台绑定确定'),
  idempotencyKey: z.string().optional().describe('测试部署幂等键，省略时由包摘要派生'),
  wait: z.boolean().default(true).describe('默认跟踪平台运行至完成，最多 15 分钟；false 只提交，随后必须查询状态'),
}).strict();
const lifecycleInput = z.object({ environment, idempotencyKey: z.string().min(1).optional().describe('相同操作重试时保持不变') }).strict();
const runInput = z.object({ deploymentId: z.string().min(1).describe('平台返回的 DeploymentRun ID') }).strict();
function definition<T extends z.ZodRawShape>(title: string, description: string, inputSchema: z.ZodObject<T>, readOnly = true, destructive = false, idempotent = false) {
  return { title, description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: idempotent } };
}

/** 工具展示、输入验证与生成参考共用此表。 */
export const MCP_TOOL_DEFINITIONS = {
  authorization_status: definition('核验平台授权', '只读核验明确指定站点的当前授权；不依赖工作区，不启动登录、刷新凭据或修改绑定。authorized 不代表应用管理权限。', z.object({ baseUrl: z.string().min(1).describe('明确指定目标平台地址') }).strict()),
  workspace_context: definition('查看工作区', '首先读取当前项目、工具链版本和绑定，不运行构建或创建远端对象。', z.object({})),
  contract_describe: definition('查看应用契约', '默认返回有界索引；用 selector 读取模型、流程、能力，或 navigation/permissions。菜单建议只复制一次，运行时不自动应用。', z.object({ selector: z.string().max(200).optional().describe('index、navigation、permissions、all 或索引给出的选择器'), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(100).optional() }).strict()),
  appspec_context: definition('读取需求与设计', '读取设计索引、稳定 ID 正文与引用闭包、开工和测试发布缺口；设计基线确认后制定实施计划，生产晋级核对原测试版本实际验收。', z.object({ selector: z.string().min(1).optional().describe('能力、变更、ADR 或 DES-* 设计的稳定 ID'), historyOffset: z.number().int().min(0).default(0).describe('历史索引偏移，每页 50 条') })),
  appspec_verify: definition('核对业务验收报告', '读取成功测试运行与 Git 中的真实验收报告，核对版本绑定、场景结果和性能证据；有实际授权的性能延期单列为deferred未通过，不豁免功能AC，不自动编造或执行验收。', z.object({ deploymentId: z.string().min(1), evidencePath: z.string().optional().describe('appspec/verification/*.json；省略时按运行 ID 读取') })),
  docs_read: definition('读取中文使用资料', '不传 topic 返回当前版本的主题和章节目录；传 topic/section 读取对应正文。', z.object({ topic: z.string().min(1).max(80).optional().describe('主题目录中的 ID'), section: z.string().min(1).max(200).optional().describe('主题章节目录中的 ID') }).strict()),
  administration_context: definition('查看应用管理入口', '读取当前用户可用的管理能力和入口；不修改角色或成员。', z.object({ environment })),
  workflow_node_configurations: definition('查看流程有效参数', '修改已部署流程前，读取管理员维护的节点配置。已有任务和后续节点进入使用各自适用版本。', z.object({ environment, workflowCode: z.string().min(1).describe('流程声明中的 code') })),
  check_app: definition('检查完整应用', '先在本地完成完整配置校验，默认核对平台同源规则与只读环境条件，再生成、静态检查、测试和构建。local 仅用于本地或 CI 验证，不证明目标环境可部署；正式 deploy 始终预检平台。会写本地文件，前置失败即停止。', z.object({ environment, local: z.boolean().default(false).describe('仅本地完整检查；结果 validationScope=local，不核对现场条件') }), false, true),
  deployment_plan: definition('预览应用发布', '只读预览测试部署的运行配额，或指定测试版本的生产晋级；返回容量与缺口，不构建、上传或提交运行。', deploymentInput),
  environment_status: definition('查看环境状态', '读取已配置环境、运行状态与当前不可变版本。', z.object({})),
  start_environment: definition('启动应用环境', '在用户已授权范围内，从当前不可变版本恢复运行。', lifecycleInput, false, true, true),
  stop_environment: definition('暂停应用环境', '在用户已授权范围内停止运行，保留数据和配置。', lifecycleInput, false, true, true),
  deploy_app: definition('部署或晋级应用', 'test 包含检查、按需后端镜像构建、密封和提交；production 必须用 from 复用成功测试版本。已有明确授权无需再次确认。默认持续报告进度并等待平台部署完成，真实业务验收另行执行。观察中断后继续查询原运行。', deploymentInput, false, true, true),
  deployment_status: definition('查询部署状态', '查询指定或最近部署，平台状态和恢复决定是权威；watch 跟踪原运行，不重新构建或部署。', z.object({ deploymentId: z.string().min(1).optional().describe('省略时查询最近部署'), watch: z.boolean().default(false).describe('持续跟踪原运行至结束，最多 15 分钟') })),
  deployment_logs: definition('读取部署日志', '读取检查点、首个和最近失败、候选状态与恢复下一步。', runInput),
  cancel_deployment: definition('取消未激活部署', '仅在用户授权且平台 recovery.cancelAllowed 为真时取消；激活后的运行不能取消。', runInput, false, true, true),
  retry_deployment: definition('重试可恢复部署', '在用户授权范围内按平台 recovery.nextCommand 重试原运行；不创建新的候选绕过失败。', runInput, false, true, true),
  rollback_app: definition('回滚应用版本', '在用户授权范围内回滚到指定历史 AppVersion；版本回滚不承诺撤销业务数据写入。', z.object({ environment, appVersionId: z.string().min(1).describe('已知历史 AppVersion ID') }).strict(), false, true, true),
};
export const MCP_TOOL_NAMES = Object.keys(MCP_TOOL_DEFINITIONS) as Array<keyof typeof MCP_TOOL_DEFINITIONS>;

export function mcpToolReference() {
  return MCP_TOOL_NAMES.map(name => {
    const { inputSchema, ...metadata } = MCP_TOOL_DEFINITIONS[name];
    return { name, ...metadata, inputSchema: z.toJSONSchema(inputSchema, { io: 'input' }) };
  });
}

export function createOpenXiangdaMcpServer(options: { services?: OpenXiangdaApplicationServices; root?: string; documentationRoot?: string } = {}) {
  const services = options.services || new OpenXiangdaApplicationServices();
  const root = resolve(options.root || sessionWorkspaceRoot());
  const sessionPath = workspaceSessionPath(root);
  const server = new McpServer({ name: 'openxiangda-v2', version: OPENXIANGDA_TOOLCHAIN_VERSION }, {
    instructions: '先读取 workspace_context，按任务读取 docs_read 和相关契约。默认读取 AppSpec 当前规格、设计索引、阶段缺口和相关变更。新应用先按 product-design 专题引导发现模块，完成产品、旅程、页面、权限与架构设计及实际确认基线，再制定实施计划与业务实现；既有变化按受影响范围处理。测试发布先有设计与计划，生产晋级核对原测试版本的实际验收报告。只验证时调用 check_app；授权部署后直接 deploy_app，它已包含检查。生产必须复用成功测试运行。提交后读取平台状态和日志。登录、创建与长期 dev 使用项目锁定的 CLI。用户已经明确授权的操作无需再次询问。',
  });
  const local = root ? { root } : {};
  register('authorization_status', input => developerAuthorizationStatus({ ...input, sessionPath }));
  const docData = (topic?: string, section?: string) => {
    if (section && !topic) throw new Error('DOCUMENTATION_TOPIC_REQUIRED: 读取章节时必须指定主题');
    return topic ? readDocumentation(topic, section, options.documentationRoot) : documentationIndex(options.documentationRoot);
  };
  const docResult = (topic?: string, section?: string) => ({ ok: true, operation: 'docs', data: docData(topic, section) });
  const resources: Array<[string, string, () => Promise<unknown>]> = [
    ['工作区上下文', MCP_RESOURCE_URIS[0], () => services.workspaceContext(root)],
    ['当前应用契约', MCP_RESOURCE_URIS[1], () => services.contractContext(root)],
    ['需求与开发记录', MCP_RESOURCE_URIS[2], () => services.appSpecContext(root)],
    ['平台可用能力', MCP_RESOURCE_URIS[3], () => services.platformCapabilities(root)],
    ['最近部署', MCP_RESOURCE_URIS[4], () => services.deploymentStatus(root)],
    ['应用环境', MCP_RESOURCE_URIS[5], () => services.environmentStatus(root)],
    ['中文资料目录', MCP_RESOURCE_URIS[6], async () => docData()],
  ];
  for (const [title, uri, read] of resources) registerJsonResource(server, title, uri, read);
  server.registerResource('documentation-topic', new ResourceTemplate('openxiangda://docs/{topic}', { list: undefined }),
    { title: '中文使用专题', description: '从资料目录的 URI 读取当前根包正文', mimeType: 'text/markdown' },
    async (uri, variables) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readDocumentation(String(variables.topic), undefined, options.documentationRoot).content }] })
  );
  register('workspace_context', () => services.workspaceContext(root));
  register('contract_describe', input => services.contractContext(root, { ...(input.selector ? { selector: input.selector } : {}), ...(input.offset !== undefined ? { offset: input.offset } : {}), ...(input.limit !== undefined ? { limit: input.limit } : {}) }));
  register('appspec_context', input => services.appSpecContext(root, input.selector, input.historyOffset));
  register('appspec_verify', input => services.appSpecVerify(root, input.deploymentId, input.evidencePath));
  register('docs_read', async input => docResult(input.topic, input.section));
  register('administration_context', input => services.administrationContext(root, developerEnvironment(input.environment)));
  register('workflow_node_configurations', input => services.workflowNodeConfigurations(root, input.workflowCode, developerEnvironment(input.environment)));
  register('check_app', (input, onProgress) => checkApplication(services, { ...local, environment: input.environment, local: input.local, onProgress }));
  register('deployment_plan', (input, onProgress) => deployApplication(services, { ...local, ...definedDeploymentInput(input), dryRun: true, onProgress }));
  register('environment_status', () => services.environmentStatus(root));
  register('start_environment', input => services.startEnvironment(root, developerEnvironment(input.environment), input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}));
  register('stop_environment', input => services.stopEnvironment(root, developerEnvironment(input.environment), input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}));
  register('deploy_app', (input, onProgress) => deployApplication(services, { ...local, ...definedDeploymentInput(input), onProgress }));
  register('deployment_status', (input, onProgress) => input.watch ? watchDeployment(services, { ...local, ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}), onProgress }) : services.deploymentStatus(root, input.deploymentId));
  register('deployment_logs', input => services.deploymentLogs(root, input.deploymentId));
  register('cancel_deployment', input => services.cancel(root, input.deploymentId));
  register('retry_deployment', input => services.retry(root, input.deploymentId));
  register('rollback_app', input => services.rollback(root, developerEnvironment(input.environment), input.appVersionId));
  return server;

  function register<K extends keyof typeof MCP_TOOL_DEFINITIONS>(name: K, execute: (input: z.output<(typeof MCP_TOOL_DEFINITIONS)[K]['inputSchema']>, onProgress: OperationProgressListener) => Promise<unknown>) {
    const metadata = MCP_TOOL_DEFINITIONS[name];
    server.registerTool(name, {
      ...metadata,
      outputSchema: z.object({ ok: z.boolean(), operation: z.string(), data: z.unknown().optional() }).passthrough(),
    }, async (input, context) => {
      let result: Record<string, unknown>;
      const token = context.mcpReq._meta?.progressToken;
      const onProgress: OperationProgressListener = event => {
        if (token === undefined) return;
        return context.mcpReq.notify({ method: 'notifications/progress', params: {
          progressToken: token, progress: event.sequence,
          message: `${event.label}：${({ running: '进行中', passed: '完成', failed: '失败', skipped: '未执行' })[event.state]}，${(event.durationMs / 1000).toFixed(1)} 秒`,
        } });
      };
      try { result = await execute(input as z.output<(typeof MCP_TOOL_DEFINITIONS)[K]['inputSchema']>, onProgress) as Record<string, unknown>; }
      catch (error) {
        const failure = developerError(error);
        result = { ok: false, operation: name, data: null, error: failure, diagnostics: [{ ...failure, severity: 'error', ...(failure.pointer ? { path: failure.pointer } : {}) }], nextActions: [] };
      }
      return { ...(result.ok === false ? { isError: true } : {}), content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
    });
  }
}

function definedDeploymentInput(input: z.output<typeof deploymentInput>) {
  return { environment: input.environment, wait: input.wait, ...(input.deploymentStrategy ? { deploymentStrategy: input.deploymentStrategy } : {}), ...(input.from ? { from: input.from } : {}), ...(input.environmentId ? { environmentId: input.environmentId } : {}), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) };
}

export async function runStdioServer(options: { root?: string } = {}) {
  const server = createOpenXiangdaMcpServer(options);
  await server.connect(new StdioServerTransport());
  return server;
}

function registerJsonResource(server: McpServer, title: string, uri: string, read: () => Promise<unknown>) {
  server.registerResource(uri, uri, { title, mimeType: 'application/json' }, async resourceUri => ({
    contents: [{ uri: resourceUri.href, mimeType: 'application/json', text: JSON.stringify(await read(), null, 2) }],
  }));
}
