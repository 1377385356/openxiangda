import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { canonicalJson, contractSchemas, configurationBundleSchema, aiCapabilityCatalogSchema, sha256Digest,
  fieldValueSchemaForDefinition, type ApplicationAgentDeclarationV2 } from 'openxiangda-contracts';
import { compileApplicationAgentsV2, compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { defineOpenXiangdaApp } from '../src/compiler/config.js';
import { compileApplicationSources } from '../src/compiler/bundle.js';
import { compileAiCapabilityCatalog } from '../src/compiler/ai-catalog.js';
import { inlineApplicationAgentInstructionsV2 } from '../src/application-agent-source.js';
import { loadAppConfig } from '../src/workspace-loader.js';

const require = createRequire(import.meta.url);
const Ajv = require('ajv/dist/2020');
const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addFormat('date-time', (value: string) => Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value));
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
ajv.addFormat('time', /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/);
ajv.addFormat('uuid', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
for (const schema of Object.values(contractSchemas)) ajv.addSchema(schema);
const { $id: _configId, ...configSchema } = configurationBundleSchema;
const { $id: _catalogId, ...catalogSchema } = aiCapabilityCatalogSchema;
const validateConfigSchema = ajv.compile(configSchema);
const validateCatalogSchema = ajv.compile(catalogSchema);
function declaration() {
  return { app: { code: 'visitor-agent', name: '访客服务' }, frontend: {}, data: { resources: [
    { code: 'buildings', name: '楼宇', fields: [{ code: 'name', label: '楼宇名称', type: 'text.short' as const, required: true }] },
    { code: 'visits', name: '访客', fields: [
      { code: 'visitorName', label: '访客姓名', type: 'text.short' as const, required: true, searchable: true },
      { code: 'arriveAt', label: '到访时间', type: 'datetime' as const, required: true, filter: true, sortable: true },
      { code: 'amount', label: '精确金额', type: 'number.decimal' as const, exactDecimal: true, precision: 20, scale: 4 },
      { code: 'area', label: '来访楼宇', type: 'resource-ref.single' as const, filter: true,
        source: { kind: 'resource' as const, resourceCode: 'buildings', labelField: 'name' } },
      { code: 'notes', label: '备注', type: 'text.long' as const },
    ], list: { defaultSort: { field: 'arriveAt', order: 'asc' as const } } },
  ] } };
}
function agents(): ApplicationAgentDeclarationV2[] {
  return [{ code: 'assistant', name: '访客助手', purpose: '帮助员工邀请和查询访客', instructions: '使用应用任务查询和邀请访客。',
    starters: ['今天有哪些访客', '邀请一个访客'], tasks: [
      { code: 'visit.today', kind: 'view', resource: 'visits', view: 'default', filters: ['area', 'arriveAt'] },
      { code: 'visit.invite', kind: 'form', action: 'create', resource: 'visits', view: 'default', fields: ['visitorName', 'arriveAt', 'area', 'amount', 'notes'] },
      { code: 'visit.edit', kind: 'form', action: 'update', resource: 'visits', view: 'default', fields: ['area', 'notes'] },
    ] }];
}
function config() { return defineOpenXiangdaApp({ ...declaration(), agents: agents() }); }
function shared(input = config()) { return compileApplicationAgentsV2(input.app.code, input.agents, input.data!.resources, { authz: input.authz }); }

test('source definitions, native bindings, digests, command values and public schemas agree', () => {
  const app = config(), sources = compileApplicationSources(app), pure = shared(app);
  assert.equal(app.backend.enabled, false, "source agents do not require an application Nest backend");
  assert.equal(sources.agentDefinitions?.digest, sha256Digest(sources.agentDefinitions!.value));
  assert.deepEqual(sources.agentDefinitions?.value, pure.definitions);
  assert.deepEqual(sources.aiCatalog.value.capabilities.filter(c => c.kind === 'nativeTask'), pure.capabilities);
  assert.ok(validateConfigSchema(sources.config.value), JSON.stringify(validateConfigSchema.errors));
  assert.ok(validateCatalogSchema(sources.aiCatalog.value), JSON.stringify(validateCatalogSchema.errors));
  const target = compileNativeApplicationConfiguration({ appCode: app.app.code, configBytes: sources.config.content,
    contractBytes: sources.contracts.content, expectedConfigDigest: sources.config.digest, expectedContractDigest: sources.contracts.digest });
  assert.ok(target.requiredPlatformCapabilities.some(c => c.code === 'application.source-agents' && c.contractVersion === '1.0.0'));
  const form = pure.capabilities.find(c => c.operation === 'create')!;
  assert.equal(form.confirmation, 'required'); assert.equal(form.idempotency, 'required');
  assert.equal(form.agent!.nativeTask!.form!.fields.find(f => f.path === 'area')!.fieldType, 'resource-ref.single');
  const data = (form.inputSchema.properties as any).data;
  assert.deepEqual(data.properties.area.anyOf[0], fieldValueSchemaForDefinition(app.data!.resources[1]!.schema.fields.find(f => f.code === 'area')!));
  assert.deepEqual(data.required, ['visitorName', 'arriveAt']);
  assert.equal((form.inputSchema.properties as any).target, undefined);
  const update = pure.capabilities.find(c => c.operation === 'update')!;
  assert.deepEqual((update.inputSchema.properties as any).target.required, ['id', 'expectedRevision']);
  assert.equal((update.inputSchema.properties as any).data.required, undefined, 'update is a partial patch');
});

test('model hints reject identity metadata and numbers for exact decimals, and datetime requires an offset', () => {
  const form = shared().capabilities.find(c => c.operation === 'create')!;
  const validate = ajv.compile(form.agent!.nativeTask!.hintSchema);
  assert.ok(validate({ data: { visitorName: '张伟', arriveAt: '2026-10-12T09:00:00+08:00', area: { label: '3号楼' }, amount: '1.0001' } }));
  for (const data of [ { area: { label: '3号楼', value: 'private-id' } }, { area: { label: '3号楼', resourceCode: 'buildings' } },
    { area: { label: '3号楼', snapshot: {} } }, { amount: 1.0001 }, { arriveAt: '2026-10-12T09:00:00' } ])
    assert.equal(validate({ data }), false, JSON.stringify(data));
  assert.ok(validate({ data: { area: null, notes: null } }), 'ordinary null represents clearing a nullable field');
  const view = shared().capabilities.find(c => c.operation === 'query')!;
  const validateView = ajv.compile(view.agent!.nativeTask!.hintSchema);
  assert.ok(validateView({ filters: { arriveAt: { from: '2026-10-12T00:00:00+08:00' }, area: { label: '3号楼' } }, limit: 20 }));
  for (const input of [{ where: {} }, { select: ['id'] }, { order: [] }, { cursor: 'raw' }, { filters: { notes: 'hidden' } }, { limit: 101 }])
    assert.equal(validateView(input), false, JSON.stringify(input));
});

test('unknown views, widened filters, non-native mutations, required or unsupported fields fail at both boundaries', () => {
  const variants = [
    (a: any) => { a.agents[0].tasks[0].view = 'missing'; },
    (a: any) => { a.agents[0].tasks[0].filters = ['notes']; },
    (a: any) => { a.data.resources[1].mutationOwner = 'action'; },
    (a: any) => { a.data.resources[1].generated = { create: false }; },
    (a: any) => { a.agents[0].tasks[1].fields = ['area']; },
    (a: any) => { a.data.resources[1].fields.push({ code: 'attachments', label: '附件', type: 'file' }); a.agents[0].tasks[1].fields.push('attachments'); },
    (a: any) => { a.agents[0].tasks[1].fields.push('id'); },
    (a: any) => { a.agents[0].tasks[1].fields.push('area'); },
    (a: any) => { a.agents[0].tasks[1].fields = Array.from({ length: 21 }, (_, i) => `field${i}`); },
    (a: any) => { a.agents[0].tasks[0].binding = {}; },
  ];
  const valid = config(), sealed = compileApplicationSources(valid);
  for (const mutate of variants) {
    const input: any = { ...declaration(), agents: agents() }; mutate(input);
    assert.throws(() => defineOpenXiangdaApp(input));
  }
  const forged: any = structuredClone(sealed.config.value);
  forged.agents[0].tasks[0].filters = ['notes'];
  const content = canonicalJson(forged);
  assert.throws(() => compileNativeApplicationConfiguration({ appCode: valid.app.code, configBytes: content,
    contractBytes: sealed.contracts.content, expectedConfigDigest: sha256Digest(forged), expectedContractDigest: sealed.contracts.digest }), /FILTER_WIDENING/);
});

test('create binding closure and update dependent closure reuse the original resource-source graph', () => {
  const input: any = { ...declaration(), agents: agents() };
  input.data.resources[1].fields.find((f: any) => f.code === 'area').source.filters = [
    { field: 'name', operator: 'eq', binding: { kind: 'field', field: 'notes' } },
  ];
  input.agents[0].tasks[1].fields = ['visitorName', 'arriveAt', 'area'];
  assert.throws(() => defineOpenXiangdaApp(input), /CREATE_BINDING_REQUIRED/);
  input.agents[0].tasks[1].fields.push('notes');
  input.agents[0].tasks[2].fields = ['notes'];
  assert.throws(() => defineOpenXiangdaApp(input), /UPDATE_DEPENDENT_REQUIRED/);
  input.agents[0].tasks[2].fields = ['area'];
  assert.doesNotThrow(() => defineOpenXiangdaApp(input), 'an unchanged saved binding can remain private');
});

test('applications without source agents preserve bundle bytes and do not acquire an agent requirement', () => {
  const without = defineOpenXiangdaApp(declaration());
  const empty = defineOpenXiangdaApp({ ...declaration(), agents: [] });
  const a = compileApplicationSources(without), b = compileApplicationSources(empty);
  assert.equal(a.config.content, b.config.content); assert.equal(a.contracts.content, b.contracts.content);
  assert.equal(a.aiCatalog.content, b.aiCatalog.content);
  assert.equal(a.agentDefinitions, undefined);
});

test('instructions are inlined by the real workspace loader and reject escapes, collaboration files and oversized sources', async () => {
  const root = mkdtempSync(join(tmpdir(), 'openxiangda-source-agent-'));
  const outside = mkdtempSync(join(tmpdir(), 'openxiangda-source-outside-'));
  try {
    mkdirSync(join(root, 'agents'));
    writeFileSync(join(root, 'agents/assistant.md'), '应用拥有的任务指令。');
    const source: any = { ...declaration(), agents: agents() };
    source.agents[0].instructions = { file: 'agents/assistant.md' };
    const path = join(root, 'openxiangda.config.ts');
    writeFileSync(path, `export default ${JSON.stringify(source)};`);
    writeFileSync(join(root, 'agents/访客说明.md'), '允许业务指令文件使用中文名称。');
    const localized: any = structuredClone(source); localized.agents[0].instructions.file = 'agents/访客说明.md';
    assert.equal(inlineApplicationAgentInstructionsV2(root, localized).agents![0]!.instructions, '允许业务指令文件使用中文名称。');
    const loaded = await loadAppConfig(path);
    assert.equal(loaded.agents![0]!.instructions, '应用拥有的任务指令。');
    assert.equal(compileApplicationSources(loaded).agentDefinitions!.value.agents[0]!.instructions, '应用拥有的任务指令。');
    assert.throws(() => compileAiCapabilityCatalog(defineOpenXiangdaApp(source)), /INSTRUCTIONS_NOT_INLINED/);
    writeFileSync(join(outside, 'external.md'), 'outside instructions');
    symlinkSync(join(outside, 'external.md'), join(root, 'agents/link.md'));
    writeFileSync(join(root, 'agents/large.md'), 'x'.repeat(64001));
    writeFileSync(join(root, 'agents/long.md'), 'x'.repeat(16001));
    for (const file of ['../external.md', '/absolute.md', 'AGENTS.md', 'CLAUDE.md', 'agents/link.md', 'agents/large.md', 'agents/long.md']) {
      source.agents[0].instructions = { file };
      assert.throws(() => inlineApplicationAgentInstructionsV2(root, source), /NATIVE_APPLICATION_AGENT/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

function routedConfig() {
  const input: any = { ...declaration(), agents: agents(), authz: {
    capabilities: [], roles: [{ code: 'host', name: '接待人', capabilities: [] }],
    scopeDimensions: [{ code: 'site', name: '园区', valueType: 'uuid',
      valueSource: { kind: 'native_resource', resourceCode: 'buildings', labelField: 'name' } }],
    dataPolicies: [{ code: 'site-policy', name: '园区范围', resourceCode: 'visits', matchMode: 'AND', rules: [{ field: 'site', dimensionCode: 'site' }] }],
  } };
  const resource = input.data.resources[1];
  resource.fields.push({ code: 'site', label: '所属园区', type: 'uuid', filter: true },
    { code: 'host', label: '接待人', type: 'user.single', filter: true, userCandidates: { kind: 'app-role', roleCode: 'host' } });
  resource.dataPolicyCode = 'site-policy';
  for (const task of input.agents[0].tasks) {
    if (task.kind === 'view') task.filters = ['site', 'host'];
    else task.fields.push('site', 'host');
  }
  return structuredClone(defineOpenXiangdaApp(input));
}

test('selector routes come from field and policy authority, keeping ordinary command values and label-only scope hints', () => {
  const app = routedConfig(), compiled = shared(app);
  const create = compiled.capabilities.find(capability => capability.operation === 'create')!;
  assert.ok(validateCatalogSchema(compileAiCapabilityCatalog(app)), JSON.stringify(validateCatalogSchema.errors));
  assert.equal(create.agent!.nativeTask!.form!.fields.find(field => field.path === 'host')!.selector!.owner, 'user-candidates');
  assert.deepEqual(create.agent!.nativeTask!.form!.fields.find(field => field.path === 'site')!.selector, { owner: 'scope', dimensionCode: 'site' });
  const validateHints = ajv.compile(create.agent!.nativeTask!.hintSchema);
  assert.ok(validateHints({ data: { site: { label: '东区' }, host: { label: '张伟' } } }));
  assert.equal(validateHints({ data: { site: 'internal-id' } }), false);
  const command = (create.inputSchema.properties as any).data.properties;
  assert.equal(command.site.anyOf[0].type, 'string', 'scope remains an ordinary scalar');
  assert.ok(create.agent!.nativeTask!.coverage!.some(field => field.field === 'site' && field.output === 'label'));
  assert.ok(create.agent!.nativeTask!.coverage!.some(field => field.field === 'host' && field.create));
  const sources = compileApplicationSources(app);
  assert.deepEqual(sources.agentDefinitions!.value, compiled.definitions);
  assert.doesNotThrow(() => compileNativeApplicationConfiguration({ appCode: app.app.code, configBytes: sources.config.content,
    contractBytes: sources.contracts.content, expectedConfigDigest: sources.config.digest, expectedContractDigest: sources.contracts.digest }));
});

test('record-scoped candidates require another create owner and the update dependent closure', () => {
  const app = routedConfig(), host = app.data!.resources[1]!.schema.fields.find(field => field.code === 'host')!;
  host.userCandidates!.scope = { dimensionCode: 'site', operation: 'read', field: 'site' };
  assert.throws(() => shared(app), /CANDIDATE_CREATE_OWNER_REQUIRED.*visit.invite.*host.*user-candidates.*流程发起/);
  const create = app.agents![0]!.tasks.find(task => task.kind === 'form' && task.action === 'create')!;
  if (create.kind === 'form') create.fields = create.fields.filter(field => field !== 'host');
  assert.doesNotThrow(() => shared(app));
  const update = app.agents![0]!.tasks.find(task => task.kind === 'form' && task.action === 'update')!;
  if (update.kind === 'form') update.fields = ['site'];
  assert.throws(() => shared(app), /UPDATE_DEPENDENT_REQUIRED/);
  if (update.kind === 'form') update.fields = ['host'];
  assert.doesNotThrow(() => shared(app), 'unchanged private saved scope remains server-held');
});

test('multi-dimension scope fields remain on the card but are not offered as model hints or raw output', () => {
  const app = routedConfig();
  app.authz!.scopeDimensions!.push({ ...app.authz!.scopeDimensions![0]!, code: 'campus' });
  app.authz!.dataPolicies![0]!.rules.push({ field: 'site', dimensionCode: 'campus' });
  const compiled = shared(app), create = compiled.capabilities.find(capability => capability.operation === 'create')!;
  assert.ok(create.agent!.nativeTask!.form!.fields.some(field => field.path === 'site'));
  assert.equal((create.agent!.nativeTask!.hintSchema.properties as any).data.properties.site, undefined);
  const view = compiled.capabilities.find(capability => capability.operation === 'query')!;
  assert.equal((view.agent!.nativeTask!.hintSchema.properties as any).filters.properties.site, undefined);
  assert.ok(view.agent!.nativeTask!.coverage!.some(field => field.field === 'site' && field.output === 'page' && field.reason === 'multiple-scope-dimensions'));
  app.authz!.dataPolicies![0] = { ...app.authz!.dataPolicies![0]!, rules: [], readExpression: { anyOf: [{ field: 'site', dimensionCode: 'site' }, { field: 'site', dimensionCode: 'campus' }] } } as any;
  assert.equal((shared(app).capabilities.find(capability => capability.operation === 'query')!.agent!.nativeTask!.hintSchema.properties as any).filters.properties.site, undefined);
});

test('native read output schema covers bounded rows and ambiguous human-label choices, never raw identity fields', () => {
  const cap = shared().capabilities.find(capability => capability.operation === 'query')!, validate = ajv.compile(cap.outputSchema);
  assert.ok(validate({ filter_ambiguous: true, field: 'area', labels: [{ label: '东区' }, { label: '东区', description: '校区一' }] }));
  assert.ok(validate({ columns: Array.from({ length: 500 }, (_, i) => ({ code: `f${i}`, label: `字段${i}` })), items: [], more: false }));
  assert.equal(validate({ items: [{ handle: 'receipt:0', recordId: 'private', fields: [] }], more: false }), false);
  assert.equal(validate({ filter_ambiguous: true, field: 'area', labels: [{ label: '东区', value: 'private' }] }), false);
});
