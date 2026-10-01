import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowAssignmentRoutingRule } from 'openxiangda-contracts/browser';
import { routingDraftJson } from '../src/browser/components/workflow/workflow-routing-draft';

const stored: WorkflowAssignmentRoutingRule = {
  ruleCode: 'review', title: '专项审批', enabled: true,
  matches: { department: ['design', 'art'], campus: ['main'] },
  sourceCode: 'extra', effect: 'append', priority: 5, workflowCode: 'application', nodeId: 'review',
  validFrom: '2026-10-01T00:00:00.000Z', validTo: '2026-11-01T00:00:00.000Z',
};

test('stored rule and form round-trip compare equally with different object key order', () => {
  const form = Object.fromEntries(Object.entries(stored).reverse()) as WorkflowAssignmentRoutingRule;
  form.matches = Object.fromEntries(Object.entries(stored.matches).reverse());
  assert.notEqual(JSON.stringify(stored), JSON.stringify(form));
  assert.equal(routingDraftJson(stored), routingDraftJson(form));
  assert.equal(routingDraftJson([stored]), routingDraftJson([form]));
});

test('review still detects every editable rule value', () => {
  const changes: Partial<WorkflowAssignmentRoutingRule>[] = [
    { title: '新名称' }, { enabled: false }, { workflowCode: 'other' }, { nodeId: 'other' },
    { matches: { ...stored.matches, campus: ['other'] } }, { sourceCode: 'replacement' },
    { effect: 'replace' }, { priority: 6 }, { validFrom: '2026-10-02T00:00:00.000Z' },
    { validTo: '2026-11-02T00:00:00.000Z' },
  ];
  for (const change of changes) assert.notEqual(routingDraftJson(stored), routingDraftJson({ ...stored, ...change }));
});

test('comparison preserves arrays and does not mutate the saved payload', () => {
  const copy = structuredClone(stored);
  assert.notEqual(routingDraftJson(stored), routingDraftJson({ ...stored, matches: { ...stored.matches, department: ['art', 'design'] } }));
  assert.notEqual(routingDraftJson([stored, { ...stored, ruleCode: 'other' }]), routingDraftJson([{ ...stored, ruleCode: 'other' }, stored]));
  routingDraftJson(stored);
  assert.deepEqual(stored, copy);
});
