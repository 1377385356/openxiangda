import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowOperationSurface } from 'openxiangda-contracts/browser';
import { workflowOperationGroups } from '../src/browser/components/workflow/workflow-operation-layout';

const op = (key: string, prominence: number | null | undefined, extra = {}) => ({
  key, kind: 'workflow_command', visible: true, enabled: true, prominence,
  placement: 'overflow', emphasis: 'neutral', ...extra,
} as WorkflowOperationSurface);

test('uses server prominence even for unfamiliar commands and preserves original command envelopes', () => {
  const a = op('custom-accept', 1), b = op('custom-revise', 2), c = op('custom-reject', 3), d = op('save', null);
  for (const order of [[d, c, a, b], [a, d, b, c]]) {
    assert.deepEqual(workflowOperationGroups(order, 'mobile'), { primary: [b, a], secondary: [c, d] });
    assert.deepEqual(workflowOperationGroups(order, 'desktop'), { primary: [c, b, a], secondary: [d] });
    assert.equal(workflowOperationGroups(order, 'mobile').primary[1], a);
  }
});
test('hidden return falls back to rejection; disabled commands retain their server state', () => {
  const a = op('approve', 1), b = op('return', 2, { visible: false }), c = op('reject', 3, { enabled: false });
  const mobile = workflowOperationGroups([a, b, c], 'mobile');
  assert.deepEqual(mobile.primary, [c, a]);
  assert.equal(mobile.primary[0].enabled, false);
});
test('explicit overflow, including save, is never promoted by legacy placement', () => {
  const save = op('save_form', null, { placement: 'primary' });
  assert.deepEqual(workflowOperationGroups([save], 'mobile'), { primary: [], secondary: [save] });
  assert.deepEqual(workflowOperationGroups([], 'desktop'), { primary: [], secondary: [] });
});
test('older servers use placement and emphasis without inferring permissions from command names', () => {
  const a = op('new-decision', undefined, { placement: 'primary', emphasis: 'primary' });
  const b = op('new-secondary', undefined, { placement: 'primary', emphasis: 'danger' });
  const c = op('approve', undefined, { placement: 'overflow' });
  assert.deepEqual(workflowOperationGroups([a, b, c], 'mobile'), { primary: [b, a], secondary: [c] });
});
