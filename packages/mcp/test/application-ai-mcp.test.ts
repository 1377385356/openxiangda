import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import {
  APPLICATION_AI_MCP_CATALOG_URI,
  APPLICATION_AI_MCP_CONFIRM_TOOL,
  AGGREGATED_AI_MCP_CATALOG_URI,
  AGGREGATED_AI_MCP_TOOL_NAMES,
  createApplicationAiPlatformExecutor,
  createAggregatedAiMcpServer,
  createApplicationAiMcpServer,
} from '../src/index.js';

const catalog = {
  schemaVersion: 'openxiangda.ai-capability/v1',
  appCode: 'visitor-app',
  appName: '访客预约',
  capabilities: [
    {
      code: 'visitor-app.reservations.query',
      appCode: 'visitor-app',
      name: '访客预约查询',
      description: '查询当前用户可见的访客预约',
      kind: 'generatedCrud',
      operation: 'query',
      resources: ['reservations'],
      inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } },
      outputSchema: { type: 'object' },
      authorization: { capabilities: ['app:visitor-app:data:reservations:read'] },
      risk: 'read',
      confirmation: 'none',
      idempotency: 'none',
      concurrency: 'none',
      limits: { maxRows: 100, timeoutMs: 10000 },
      sideEffects: [],
      generatedFrom: { resourceCode: 'reservations', operation: 'query' },
    },
    {
      code: 'visitor-app.reservations.create',
      appCode: 'visitor-app',
      name: '新增访客预约',
      description: '创建访客预约',
      kind: 'generatedCrud',
      operation: 'create',
      resources: ['reservations'],
      inputSchema: { type: 'object', properties: { visitorName: { type: 'string' } } },
      outputSchema: { type: 'object' },
      authorization: { capabilities: ['app:visitor-app:data:reservations:create'] },
      risk: 'write',
      confirmation: 'required',
      idempotency: 'required',
      concurrency: 'none',
      limits: { timeoutMs: 10000 },
      sideEffects: ['reservations:create'],
      generatedFrom: { resourceCode: 'reservations', operation: 'create' },
    },
  ],
} as const;

test('maps one app catalog to read, preview and confirm MCP tools', async () => {
  const calls: string[] = [];
  const server = createApplicationAiMcpServer({
    catalog,
    executor: {
      async executeRead(capability) {
        calls.push(`read:${capability.code}`);
        return { items: [{ id: 'reservation-1' }] };
      },
      async createPreview(capability, input) {
        calls.push(`preview:${capability.code}:${String(input.visitorName)}`);
        return { decision: 'needs_confirmation', previewId: 'preview-1' };
      },
      async confirmPreview(previewId) {
        calls.push(`confirm:${previewId}`);
        return { status: 'created', id: 'reservation-1' };
      },
    },
  });
  const client = new Client({ name: 'ai-mcp-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(tool => tool.name),
      ['visitor-app.reservations.query', 'visitor-app.reservations.create.preview', APPLICATION_AI_MCP_CONFIRM_TOOL]
    );
    assert.equal(tools.tools.find(tool => tool.name === 'visitor-app.reservations.query')?.annotations?.readOnlyHint, true);
    assert.equal(tools.tools.find(tool => tool.name === 'visitor-app.reservations.create.preview')?.annotations?.readOnlyHint, true);
    const read = await client.callTool({
      name: 'visitor-app.reservations.query',
      arguments: { limit: 10 },
    });
    assert.match(JSON.stringify(read.structuredContent), /reservation-1/);
    const preview = await client.callTool({
      name: 'visitor-app.reservations.create.preview',
      arguments: { visitorName: '张三' },
    });
    assert.match(JSON.stringify(preview.structuredContent), /preview-1/);
    const confirmed = await client.callTool({
      name: APPLICATION_AI_MCP_CONFIRM_TOOL,
      arguments: { previewId: 'preview-1' },
    });
    assert.match(JSON.stringify(confirmed.structuredContent), /created/);
    const catalogResource = await client.readResource({ uri: APPLICATION_AI_MCP_CATALOG_URI });
    assert.match(JSON.stringify(catalogResource.contents), /visitor-app\.reservations\.create/);
    assert.deepEqual(calls, [
      'read:visitor-app.reservations.query',
      'preview:visitor-app.reservations.create:张三',
      'confirm:preview-1',
    ]);
  } finally {
    await client.close();
    await server.close();
  }
});

test('binds application MCP execution to the platform-owned AI boundary', async () => {
  const calls: string[] = [];
  const executor = createApplicationAiPlatformExecutor({
      async executeRead(capabilityCode, input) {
        calls.push(`read:${capabilityCode}:${String(input.limit)}`);
        return { items: [{ id: 'reservation-1' }] };
      },
      async createPreview(capabilityCode, input) {
        calls.push(`preview:${capabilityCode}:${String(input.visitorName)}`);
        return { previewId: 'preview-1', requiresConfirmation: true };
      },
      async confirmPreview(previewId) {
        calls.push(`confirm:${previewId}`);
        return { id: 'reservation-2' };
      },
  });
  const read = await executor.executeRead(catalog.capabilities[0], { limit: 10 });
  assert.match(JSON.stringify(read), /reservation-1/);
  const preview = await executor.createPreview(catalog.capabilities[1], {
    visitorName: '李四',
  });
  assert.deepEqual(preview, { previewId: 'preview-1', requiresConfirmation: true });
  assert.deepEqual(calls, [
    'read:visitor-app.reservations.query:10',
    'preview:visitor-app.reservations.create:李四',
  ]);
  const created = await executor.confirmPreview('preview-1');
  assert.deepEqual(created, { id: 'reservation-2' });
  assert.deepEqual(calls, [
    'read:visitor-app.reservations.query:10',
    'preview:visitor-app.reservations.create:李四',
    'confirm:preview-1',
  ]);
});

test('routes declared custom actions through the same platform preview boundary', async () => {
  const calls: string[] = [];
  const custom = {
    code: 'visitor-app.custom.reservation.enroll',
    appCode: 'visitor-app',
    name: '提交预约',
    description: '提交预约并执行校验',
    kind: 'customAction',
    operation: 'custom',
    resources: ['reservations'],
    inputSchema: { type: 'object', properties: { reservationId: { type: 'string' } } },
    outputSchema: { type: 'object' },
    authorization: { capabilities: ['app:visitor-app:reservation:enroll'] },
    risk: 'write',
    confirmation: 'required',
    idempotency: 'required',
    concurrency: 'none',
    limits: { timeoutMs: 10000 },
    sideEffects: ['reservation.enroll'],
    binding: {
      kind: 'app-api',
      operationCode: 'reservation.enroll',
      method: 'POST',
      path: '/api/reservations/enroll',
    },
  } as const;
  const executor = createApplicationAiPlatformExecutor({
    async executeRead() {
      return {};
    },
    async createPreview(capabilityCode, input) {
      calls.push(`preview:${capabilityCode}:${String(input.reservationId)}`);
      return { previewId: 'custom-preview-1' };
    },
    async confirmPreview(previewId) {
      calls.push(`confirm:${previewId}`);
      return { status: 'enrolled', reservationId: 'r-1' };
    },
  });
  const preview = await executor.createPreview(custom, { reservationId: 'r-1' });
  assert.equal(preview.previewId, 'custom-preview-1');
  assert.deepEqual(calls, [
    'preview:visitor-app.custom.reservation.enroll:r-1',
  ]);
  assert.deepEqual(await executor.confirmPreview('custom-preview-1'), {
    status: 'enrolled',
    reservationId: 'r-1',
  });
  assert.deepEqual(calls, [
    'preview:visitor-app.custom.reservation.enroll:r-1',
    'confirm:custom-preview-1',
  ]);
});

test('aggregates multiple application MCP facades without merging their executors', async () => {
  const calls: string[] = [];
  const secondCatalog = {
    ...catalog,
    appCode: 'meeting-app',
    appName: '会议管理',
    capabilities: catalog.capabilities.map(capability => ({
      ...capability,
      appCode: 'meeting-app',
      code: capability.code.replace('visitor-app', 'meeting-app'),
    })),
  } as any;
  const server = createAggregatedAiMcpServer({
    async loadApplications() {
      return [
      {
        catalog,
        executor: {
          async executeRead() {
            calls.push('visitor-read');
            return { app: 'visitor' };
          },
          async createPreview() {
            calls.push('visitor-preview');
            return { previewId: 'visitor-preview' };
          },
          async confirmPreview() {
            calls.push('visitor-confirm');
            return { app: 'visitor' };
          },
        },
      },
      {
        catalog: secondCatalog,
        executor: {
          async executeRead() {
            calls.push('meeting-read');
            return { app: 'meeting' };
          },
          async createPreview() {
            calls.push('meeting-preview');
            return { previewId: 'meeting-preview' };
          },
          async confirmPreview() {
            calls.push('meeting-confirm');
            return { app: 'meeting' };
          },
        },
      },
      ];
    },
  });
  const client = new Client({ name: 'aggregate-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(tool => tool.name),
      [...AGGREGATED_AI_MCP_TOOL_NAMES]
    );
    await client.callTool({
      name: 'records.query',
      arguments: {
        appCode: 'meeting-app',
        resourceCode: 'reservations',
        input: { limit: 1 },
      },
    });
    await client.callTool({
      name: 'records.create',
      arguments: {
        appCode: 'visitor-app',
        resourceCode: 'reservations',
        input: { visitorName: '张三' },
      },
    });
    await client.callTool({
      name: 'mutations.confirm',
      arguments: { appCode: 'visitor-app', previewId: 'visitor-preview' },
    });
    const resource = await client.readResource({ uri: AGGREGATED_AI_MCP_CATALOG_URI });
    assert.match(JSON.stringify(resource.contents), /meeting-app/);
    assert.deepEqual(calls, ['meeting-read', 'visitor-preview', 'visitor-confirm']);
  } finally {
    await client.close();
    await server.close();
  }
});
