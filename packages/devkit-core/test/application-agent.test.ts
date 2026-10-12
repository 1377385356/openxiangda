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
function shared(input = config()) { return compileApplicationAgentsV2(input.app.code, input.agents, input.data!.resources); }

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
