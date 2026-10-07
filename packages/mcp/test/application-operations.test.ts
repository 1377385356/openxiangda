import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { applicationOperationCatalog, APPLICATION_OPERATION_SCHEMA } from 'openxiangda-devkit-core';
import { createOpenXiangdaMcpServer, mcpToolReference } from '../src/index.js';

test('real MCP discovers the authoritative operation schemas and rejects invalid calls before execution', async () => {
  const calls: unknown[] = [];
  const server = createOpenXiangdaMcpServer({ root: '/tmp/application', services: {
    applicationOperations: async () => ({ ok: true, operation: 'admin.operations', data: applicationOperationCatalog() }),
    applicationOperation: async (root: string, input: unknown) => { calls.push({ root, input }); return { ok: true, operation: 'admin.events.status', data: { result: { admission: { blocked: false } } } }; },
  } as any });
  const client = new Client({ name: 'ai-selfservice', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const tools = await client.listTools();
    const execute = tools.tools.find(item => item.name === 'application_operation')!;
    assert.deepEqual(execute.inputSchema, APPLICATION_OPERATION_SCHEMA);
    assert.deepEqual(mcpToolReference().find(item => item.name === 'application_operation')!.inputSchema, execute.inputSchema);
    assert.equal(execute.annotations?.readOnlyHint, false);
    const catalog = await client.callTool({ name: 'application_operations', arguments: {} });
    assert.equal((catalog.structuredContent as any).data.operations.length, 20);
    for (const args of [
      { operation: 'events.status', input: {} },
      { operation: 'events.status', environment: 'production', input: { actor: 'forged' } },
      { operation: 'events.status', environment: 'test', input: {}, appCode: 'other' },
      { operation: 'secrets.copy', environment: 'production', input: { sourceEnvironment: 'test', reason: '已验证', idempotencyKey: 'key', secrets: [{ name: 'secret', value: 'never-pass', sourceRevision: 1, expectedRevision: 0 }] } },
    ]) {
      const result = await client.callTool({ name: 'application_operation', arguments: args });
      assert.equal(result.isError, true);
    }
    assert.equal(calls.length, 0);
    const args = { operation: 'events.status', environment: 'production', input: {} };
    const result = await client.callTool({ name: 'application_operation', arguments: args });
    assert.notEqual(result.isError, true);
    assert.deepEqual(calls, [{ root: '/tmp/application', input: args }]);
    assert.equal((result.structuredContent as any).data.result.admission.blocked, false);
  } finally { await client.close(); await server.close(); }
});

test('MCP preserves revision failure and provides the self-service guide without retrying', async () => {
  let calls = 0;
  const server = createOpenXiangdaMcpServer({ services: { applicationOperation: async () => {
    calls++; throw Object.assign(new Error('APPLICATION_V2_SECRET_REVISION_CONFLICT: 版本变化'), { code: 'APPLICATION_V2_SECRET_REVISION_CONFLICT', status: 409, data: { actualRevision: 4 } });
  } } as any });
  const client = new Client({ name: 'ai-recovery', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const result = await client.callTool({ name: 'application_operation', arguments: { operation: 'secrets.copy', environment: 'production', input: { sourceEnvironment: 'test', reason: '已验证', idempotencyKey: 'original-key', secrets: [{ name: 'secret', sourceRevision: 3, expectedRevision: 0 }] } } });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as any).error.code, 'APPLICATION_V2_SECRET_REVISION_CONFLICT');
    assert.equal((result.structuredContent as any).error.details.actualRevision, 4);
    assert.equal((result.structuredContent as any).error.nextCommand, 'pnpm openxiangda docs application-operations');
    assert.equal(calls, 1);
  } finally { await client.close(); await server.close(); }
});
