import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { workflowDefinitionSchema } from '../src/native-compiler/workflow-schema.js';
import { workflowDefinitionSchema as publicSchema } from '../src/schemas.js';
import { createWorkflowHumanNode, validateWorkflowCanvasHuman, workflowAuthoringCatalog } from '../src/native-compiler/workflow-authoring.js';

const Ajv = createRequire(new URL('../../devkit-core/package.json', import.meta.url))('ajv/dist/2020.js').default;
const validate = new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile(workflowDefinitionSchema);
const fixture = (): any => ({ schemaVersion: 'openxiangda.workflow-definition/v2', code: 'purchase', title: '采购',
  acceptedCommandDeactivationPolicy: 'finish-pinned', subject: { resourceCode: 'purchase', factProjection: { note: 'note' }, summaryFields: ['note'] },
  startAt: 'fresh', inputSchema: { type: 'object', additionalProperties: false, properties: { note: { type: 'string' } } },
  taskPages: { review: { title: '审批页', fields: [{ code: 'note' }] } },
  nodes: { done: { id: 'done', kind: 'end', title: '完成', outcome: 'approved' } } });

test('standard canvas approval, handling and CC share the canonical protocol shape', () => {
  assert.equal(publicSchema, workflowDefinitionSchema);
  for (const kind of ['approval', 'handle', 'cc'] as const) {
    for (const page of [undefined, 'review']) {
      const definition = fixture();
      definition.nodes.fresh = createWorkflowHumanNode('fresh', kind, '新增', 'done', page, definition.taskPages);
      assert.equal(validate(definition), true, JSON.stringify(validate.errors));
    }
  }
});

test('approval administration remains optional, bounded and strict', () => {
  const definition = fixture();
  definition.nodes.fresh = createWorkflowHumanNode('fresh', 'approval', '审批', 'done');
  delete definition.nodes.fresh.administration;
  assert.equal(validate(definition), true);
  for (const administration of [
    { fields: { note: ['edit'] } }, { executeShell: true }, { modes: [] },
    { modes: ['single', 'single'] }, { modes: ['parallel'] }, { assigneeProviders: ['shell'] },
    { operations: ['admin_override'] }, { operations: ['approve', 'approve'] },
  ]) {
    const invalid = structuredClone(definition);
    invalid.nodes.fresh.administration = administration;
    assert.equal(validate(invalid), false, JSON.stringify(administration));
  }
});

test('a valid shape does not widen canvas authority or opinion minima', () => {
  const definition = fixture();
  const binding: any = { schemaVersion: 'openxiangda.workflow-binding/v2', workflowCode: 'purchase', bindings: {} };
  const catalog = workflowAuthoringCatalog(definition, binding);
  definition.nodes.fresh = createWorkflowHumanNode('fresh', 'approval', '审批', 'done');
  for (const patch of [
    { administration: { modes: ['all'] } }, { fieldPolicy: { default: 'edit' } },
    { administration: { operations: ['complete'] } },
    { operationPolicy: { reject: { opinion: 'optional', minimumOpinion: 'none' } } },
  ]) {
    const invalid = structuredClone(definition);
    Object.assign(invalid.nodes.fresh, patch);
    assert.equal(validate(invalid), true, JSON.stringify(validate.errors));
    assert.ok(validateWorkflowCanvasHuman(invalid.nodes.fresh, catalog).length > 0);
  }
});
