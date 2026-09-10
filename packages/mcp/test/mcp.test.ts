import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { DOCUMENTATION_TOPICS, operationStage, saveSession, workspaceSessionPath } from 'openxiangda-devkit-core';
import { MCP_RESOURCE_URIS, MCP_TOOL_NAMES, createOpenXiangdaMcpServer } from '../src/index.js';

test('publishes a library without a second executable', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')
  );
  assert.equal(manifest.bin, undefined);
});

test('authorization_status uses the MCP workspace session rather than the caller cwd', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'ox-mcp-auth-'));
  await saveSession({ baseUrl: 'https://workspace.example', accessToken: 'local-secret', accessTokenExpiresAt: 1 }, workspaceSessionPath(root));
  let observedRoot: string | undefined;
  const server = createOpenXiangdaMcpServer({ root: relative(process.cwd(), root), services: {
    workspaceContext: async (selectedRoot: string) => { observedRoot = selectedRoot; return { ok: true, operation: 'workspace.context', data: {} }; },
  } as any });
  const client = new Client({ name: 'workspace-auth', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const result = await client.callTool({ name: 'authorization_status', arguments: { baseUrl: 'https://workspace.example' } });
    const data = (result.structuredContent as any).data;
    assert.equal(data.state, 'refresh_required');
    assert.equal(data.sessionPath, workspaceSessionPath(root));
    assert.equal(JSON.stringify(result).includes('local-secret'), false);
    await client.callTool({ name: 'workspace_context', arguments: {} });
    assert.equal(observedRoot, root);
  } finally { await client.close(); await server.close(); rmSync(root, { recursive: true, force: true }); }
});

test('管理工具在真实 MCP 参数解析后规范化环境，非法环境不调用服务', async () => {
  const calls: unknown[][] = [];
  const services = {
    administrationContext: async (_root: unknown, environment: unknown) => {
      calls.push(['context', environment]);
      return { ok: true, operation: 'admin.context', data: {} };
    },
    workflowNodeConfigurations: async (_root: unknown, workflowCode: unknown, environment: unknown) => {
      calls.push(['workflow', workflowCode, environment]);
      return { ok: true, operation: 'admin.workflow', data: {} };
    },
  } as any;
  const server = createOpenXiangdaMcpServer({ services });
  const client = new Client({ name: 'admin-environment', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    for (const name of ['administration_context', 'workflow_node_configurations']) {
      const extra = name === 'workflow_node_configurations' ? { workflowCode: 'request-review' } : {};
      for (const environment of [undefined, 'test', 'production']) {
        const result = await client.callTool({ name, arguments: { ...extra, ...(environment ? { environment } : {}) } });
        assert.notEqual(result.isError, true);
        assert.equal(calls.at(-1)?.at(-1), environment === 'production' ? 'production' : 'preproduction');
      }
      const count = calls.length;
      const invalid = await client.callTool({ name, arguments: { ...extra, environment: 'unknown' } });
      assert.equal(invalid.isError, true);
      assert.equal(calls.length, count);
    }
    assert.equal(calls.length, 6);
    assert.deepEqual(calls[3], ['workflow', 'request-review', 'preproduction']);
  } finally { await client.close(); await server.close(); }
});

test('streams progress through the real MCP protocol before the tool result', async t => {
  const root = mkdtempSync(resolve(tmpdir(), 'ox-mcp-progress-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(resolve(root, 'openxiangda.config.ts'), 'export default {};');
  let completed = false;
  const server = createOpenXiangdaMcpServer({ root, services: {
    check: async () => operationStage('test', '应用测试', async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
      completed = true;
      return { ok: true, operation: 'check', data: {} };
    }),
  } as any });
  const client = new Client({ name: 'progress-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const progress: Array<{ message?: string; completed: boolean }> = [];
  try {
    const result = await client.callTool({ name: 'check_app', arguments: {} }, {
      onprogress: event => progress.push({ ...(event.message ? { message: event.message } : {}), completed }),
    });
    assert.equal(result.isError, undefined);
    assert.ok(progress.some(event => !event.completed && /应用测试.*进行中/.test(event.message || '')));
    assert.ok(progress.some(event => /应用测试.*完成/.test(event.message || '')));
    assert.equal((result.structuredContent as any).data.execution.stages[0].state, 'passed');
  } finally { await client.close(); await server.close(); }
});

test('exposes only application-level resources and tools', async () => {
  assert.deepEqual(MCP_RESOURCE_URIS, [
    'openxiangda://workspace/context',
    'openxiangda://workspace/contracts',
    'openxiangda://workspace/appspec',
    'openxiangda://platform/capabilities',
    'openxiangda://deployments/latest',
    'openxiangda://environments',
    'openxiangda://docs/index',
  ]);
  assert.equal(MCP_TOOL_NAMES.includes('deploy_app'), true);
  assert.equal(MCP_TOOL_NAMES.includes('fire_local_timer' as never), false);
  assert.equal(MCP_TOOL_NAMES.includes('environment_status'), true);
  assert.equal(MCP_TOOL_NAMES.includes('start_environment'), true);
  assert.equal(MCP_TOOL_NAMES.includes('stop_environment'), true);
  assert.equal(MCP_TOOL_NAMES.includes('cancel_deployment'), true);
  assert.equal(MCP_TOOL_NAMES.some(name => /resource_publish|function|automation/.test(name)), false);
  const server = createOpenXiangdaMcpServer();
  await server.close();
});

test('serves the same workspace contracts through the MCP protocol', async () => {
  const root = resolve(import.meta.dirname, '../../../templates/application');
  const server = createOpenXiangdaMcpServer({ root });
  const client = new Client({ name: 'openxiangda-mcp-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name), [...MCP_TOOL_NAMES]);
    const tool = (name: string) => tools.tools.find(item => item.name === name)!;
    for (const name of ['deploy_app', 'rollback_app', 'start_environment', 'stop_environment', 'check_app']) {
      const env = tool(name).inputSchema.properties?.environment as any;
      assert.deepEqual(env.enum, ['test', 'production']);
      assert.equal(env.default, 'test');
    }
    for (const name of ['generate_contracts', 'run_tests', 'build_app']) assert.equal(tools.tools.some(item => item.name === name), false);
    assert.equal(tool('check_app').annotations?.readOnlyHint, false);
    assert.equal(tool('deployment_plan').annotations?.readOnlyHint, true);
    for (const name of ['deployment_plan', 'deploy_app']) assert.equal(Object.hasOwn(tool(name).inputSchema.properties || {}, 'backendImage'), false);
    const resources = await client.listResources();
    assert.deepEqual(resources.resources.map(resource => resource.uri), [...MCP_RESOURCE_URIS]);

    const context = await client.callTool({ name: 'workspace_context', arguments: {} });
    assert.equal(context.isError, undefined);
    assert.match(JSON.stringify(context.structuredContent), /openxiangda-application/);
    assert.equal((context.structuredContent as any).data.development.schemaVersion, 'openxiangda.development-lifecycle/v2');
    assert.equal((context.structuredContent as any).data.development.readyForTest, false);
    assert.ok((context.structuredContent as any).data.development.diagnostics.length > 0);
    const studio = (context.structuredContent as any).data.toolchain.studio;
    assert.equal(studio.schemaVersion, 'openxiangda.studio-workspace/v2');
    assert.deepEqual(
      studio.cliEvents.commands.map((command: { id: string }) => command.id),
      ['create', 'dev', 'check', 'deploy', 'logs', 'rollback']
    );
    assert.equal(
      studio.initialization.applicationAuthority,
      'site-project-provisioning-run'
    );
    assert.equal(studio.initialization.repositoryAuthority, 'site-git-broker');

    const contracts = await client.readResource({ uri: MCP_RESOURCE_URIS[1] });
    const resourceDescription = JSON.parse((contracts.contents[0] as { text: string }).text);
    assert.equal(resourceDescription.data.selector, 'index');
    assert.ok(Array.isArray(resourceDescription.data.selection.entries));
    assert.equal(resourceDescription.data.contract, undefined);
    const contractDescription = await client.callTool({
      name: 'contract_describe',
      arguments: { selector: 'all' },
    });
    assert.equal(contractDescription.isError, undefined);
    const permissionReview = (contractDescription.structuredContent as any)
      .data.selection.permissionReview;
    assert.equal(permissionReview.schemaVersion, 'openxiangda.permission-review/v2');
    assert.equal(permissionReview.authority, 'declaration-projection');
    assert.equal(permissionReview.runtimeAuthorizationRequired, true);
    assert.equal(permissionReview.contractDigest, (contractDescription.structuredContent as any).data.contractDigest);
    const navigationAuthoring = (contractDescription.structuredContent as any)
      .data.selection.adminNavigationAuthoring;
    assert.deepEqual(navigationAuthoring, {
      schemaVersion: 'openxiangda.admin-navigation-authoring/v1',
      owner: 'application',
      target: 'frontend.admin.navigation',
      configured: false,
      applyMode: 'copy-once',
      automaticRuntimeDiscovery: false,
      suggestion: {
        module: 'openxiangda/config',
        imports: ['defineAdminNavigation'],
        proposal: [],
        expression: 'defineAdminNavigation([\n])',
        groupCount: 0,
        itemCount: 0,
      },
    });
    assert.equal(
      (contractDescription.structuredContent as any).data.counts
        .anonymousPublicPolicies,
      0
    );

    const appSpec = await client.callTool({
      name: 'appspec_context',
      arguments: {},
    });
    assert.equal(appSpec.isError, undefined);
    assert.equal(
      (appSpec.structuredContent as any).data.releaseGate,
      true
    );
    assert.equal(
      (appSpec.structuredContent as any).data.schemaVersion,
      'openxiangda.appspec/context/v4'
    );
    assert.equal(
      Array.isArray((appSpec.structuredContent as any).data.index.capabilities),
      true
    );
    assert.equal(
      (appSpec.structuredContent as any).data.contextBudget.maximumBytes,
      256 * 1024
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test('starts the real stdio protocol only through the shared openxiangda bin', async () => {
  const root = resolve(import.meta.dirname, '../../../templates/application');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve(import.meta.dirname, '../../cli/bin/run.js'),
      '--mcp-stdio',
      '--cwd',
      root,
    ],
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => {
    stderr += String(chunk);
  });
  const client = new Client({ name: 'openxiangda-cli-stdio-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name), [...MCP_TOOL_NAMES]);
  } finally {
    await client.close();
  }
  assert.equal(stderr, '');
});

test('keeps image coordinates out of AI plan and deploy inputs', async t => {
  const root = mkdtempSync(resolve(tmpdir(), 'ox-mcp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(resolve(root, 'openxiangda.config.ts'), 'export default {};');
  const calls: Array<{ method: string; input: unknown }> = [];
  const services = {
    buildPreview: async (root: string | undefined) => {
      calls.push({ method: 'buildPreview', input: root });
      return { operation: 'build.preview', ok: true, data: { sealed: false } };
    },
    deploymentPlan: async (input: unknown) => {
      calls.push({ method: 'deploymentPlan', input });
      return { operation: 'deployment.plan', ok: true, data: { sealed: false } };
    },
    deploy: async (input: unknown) => {
      calls.push({ method: 'deploy', input });
      return { operation: 'deploy', ok: true, data: { id: 'deployment-1' } };
    },
  } as NonNullable<Parameters<typeof createOpenXiangdaMcpServer>[0]['services']>;
  const server = createOpenXiangdaMcpServer({ services, root });
  const client = new Client({ name: 'openxiangda-mcp-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await client.callTool({
      name: 'deployment_plan',
      arguments: { environment: 'test' },
    });
    await client.callTool({
      name: 'deploy_app',
      arguments: { environment: 'test' },
    });
    assert.deepEqual(calls, [
      {
        method: 'deploymentPlan',
        input: { root, environment: 'preproduction' },
      },
      {
        method: 'deploy',
        input: { root, environment: 'preproduction' },
      },
    ]);
    assert.equal(JSON.stringify(calls).includes('backendImage'), false);
  } finally {
    await client.close();
    await server.close();
  }
});

test('MCP documentation reads bodies and shared operations keep target, promotion and failure semantics', async t => {
  const root = mkdtempSync(resolve(tmpdir(), 'ox-mcp-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(resolve(root, 'openxiangda.config.ts'), 'export default {};');
  const calls: unknown[] = [];
  const services = {
    check: async (_root: unknown, environment: unknown) => {
      calls.push(['check', environment]);
      if (environment === 'production') throw Object.assign(new Error('COMPATIBILITY_FAILED: 平台能力不足'), { data: { pointer: '/capabilities/example', supported: 'v1' } });
      return { ok: true, operation: 'check', data: { stages: [] } };
    },
    productionDeploymentPlan: async (_root: unknown, from: unknown) => { calls.push(['plan', from]); return { ok: true, operation: 'deployment.plan', data: { sourceDeploymentId: from, rebuild: false } }; },
    deployProduction: async (_root: unknown, from: unknown) => { calls.push(['promote', from]); return { ok: true, operation: 'deploy', data: { sourceDeploymentId: from } }; },
  } as unknown as NonNullable<Parameters<typeof createOpenXiangdaMcpServer>[0]['services']>;
  const server = createOpenXiangdaMcpServer({ services, root });
  const client = new Client({ name: 'guidance', version: '1' });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const index = await client.callTool({ name: 'docs_read', arguments: {} });
    const topics = (index.structuredContent as any).data.topics;
    assert.deepEqual(topics.map((topic: any) => topic.id), DOCUMENTATION_TOPICS.map(topic => topic.id));
    for (const id of ['design-workflow', 'opendesign-methods', 'design-craft']) {
      const topic = topics.find((entry: any) => entry.id === id);
      assert.ok(topic, `design topic available: ${id}`);
      const toolBody = await client.callTool({ name: 'docs_read', arguments: { topic: id } });
      const resourceBody = await client.readResource({ uri: topic.uri });
      assert.equal((toolBody.structuredContent as any).data.content, (resourceBody.contents[0] as { text: string }).text);
      assert.match((toolBody.structuredContent as any).data.content, /OpenDesign/);
    }
    const testing = topics.find((topic: any) => topic.id === 'testing');
    const resource = await client.readResource({ uri: testing.uri });
    assert.match((resource.contents[0] as { text: string }).text, /真实|验收/);
    const section = await client.callTool({ name: 'docs_read', arguments: { topic: 'testing', section: testing.sections[0].id } });
    assert.ok((section.structuredContent as any).data.content.startsWith('## '));
    const invalidDoc = await client.callTool({ name: 'docs_read', arguments: { topic: '../../secret' } });
    assert.equal(invalidDoc.isError, true);
    await client.callTool({ name: 'check_app', arguments: {} });
    const localCheck = await client.callTool({ name: 'check_app', arguments: { local: true } });
    assert.equal((localCheck.structuredContent as any).data.validationScope, 'local');
    assert.equal((localCheck.structuredContent as any).data.targetEnvironment, null);
    const failure = await client.callTool({ name: 'check_app', arguments: { environment: 'production' } });
    assert.equal(failure.isError, true);
    assert.equal((failure.structuredContent as any).error.pointer, '/capabilities/example');
    const invalidPromotion = await client.callTool({ name: 'deploy_app', arguments: { environment: 'production' } });
    assert.equal(invalidPromotion.isError, true);
    await client.callTool({ name: 'deployment_plan', arguments: { environment: 'production', from: 'passed-test' } });
    await client.callTool({ name: 'deploy_app', arguments: { environment: 'production', from: 'passed-test' } });
    assert.deepEqual(calls, [['check', 'preproduction'], ['check', undefined], ['check', 'production'], ['plan', 'passed-test'], ['promote', 'passed-test']]);
  } finally { await client.close(); await server.close(); }
});

test('authorization status is discoverable and accepts an explicit site without a workspace', async () => {
  const previous = { base: process.env.OPENXIANGDA_BASE_URL, token: process.env.OPENXIANGDA_TOKEN };
  process.env.OPENXIANGDA_BASE_URL = 'https://one.example';
  process.env.OPENXIANGDA_TOKEN = 'private-test-token';
  const server = createOpenXiangdaMcpServer({ root: '/nonexistent-auth-workspace' });
  const client = new Client({ name: 'auth-status', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const listed = await client.listTools();
    assert.equal(listed.tools.find(tool => tool.name === 'authorization_status')?.annotations?.readOnlyHint, true);
    const result = await client.callTool({ name: 'authorization_status', arguments: { baseUrl: 'https://two.example' } });
    assert.notEqual(result.isError, true);
    assert.equal((result.structuredContent as any).data.state, 'platform_mismatch');
    assert.doesNotMatch(JSON.stringify(result), /private-test-token/);
    const missing = await client.callTool({ name: 'authorization_status', arguments: {} });
    assert.equal(missing.isError, true);
  } finally {
    await client.close(); await server.close();
    if (previous.base === undefined) delete process.env.OPENXIANGDA_BASE_URL;
    else process.env.OPENXIANGDA_BASE_URL = previous.base;
    if (previous.token === undefined) delete process.env.OPENXIANGDA_TOKEN;
    else process.env.OPENXIANGDA_TOKEN = previous.token;
  }
});
