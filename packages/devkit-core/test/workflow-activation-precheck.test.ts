import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareWorkflowActivationsWithHeads,
  fetchWorkflowManagementDefinitionHeads,
  type WorkflowActivationDeclaration,
} from '../src/workflow-activation-precheck.js';
import type { WorkflowManagementDefinitionEntry } from '../src/control-plane-client.js';

const activation = (
  workflowCode: string,
  definitionVersion: number
): WorkflowActivationDeclaration => ({
  workflowCode,
  definitionVersion,
  bindingVersion: 1,
});

const activeHead = (
  workflowCode: string,
  definitionVersion: number
): WorkflowManagementDefinitionEntry => ({
  workflowCode,
  definition: { latestVersion: definitionVersion, versionCount: definitionVersion },
  binding: null,
  head: {
    revision: 1,
    definitionVersion,
    bindingVersion: 1,
    status: 'active',
  },
});

test('flags source activations below the active environment head', () => {
  const diagnostics = compareWorkflowActivationsWithHeads(
    [activation('membership-join-approval', 2)],
    [activeHead('membership-join-approval', 3)]
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]!.code, 'DEPLOY_WORKFLOW_ACTIVATION_VERSION_REGRESSION');
  assert.equal(diagnostics[0]!.severity, 'error');
  assert.equal(diagnostics[0]!.retryable, false);
});

test('accepts equal or newer source activations without diagnostics', () => {
  assert.deepEqual(
    compareWorkflowActivationsWithHeads(
      [activation('membership-join-approval', 3)],
      [activeHead('membership-join-approval', 3)]
    ),
    []
  );
  assert.deepEqual(
    compareWorkflowActivationsWithHeads(
      [activation('membership-join-approval', 4)],
      [activeHead('membership-join-approval', 3)]
    ),
    []
  );
});

test('warns when an active head workflow is absent from the desired set', () => {
  const diagnostics = compareWorkflowActivationsWithHeads(
    [activation('membership-join-approval', 3)],
    [activeHead('membership-join-approval', 3), activeHead('activity-publication-approval', 4)]
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]!.code, 'DEPLOY_WORKFLOW_ACTIVATION_ABSENT');
  assert.equal(diagnostics[0]!.severity, 'warning');
});

test('ignores heads that are not active', () => {
  const deactivated: WorkflowManagementDefinitionEntry = {
    ...activeHead('legacy-approval', 2),
    head: { ...activeHead('legacy-approval', 2).head!, status: 'deactivated' },
  };
  assert.deepEqual(compareWorkflowActivationsWithHeads([], [deactivated]), []);
});

test('fetches every head page until the catalog total is covered', async () => {
  const pages = [
    {
      total: 120,
      limit: 100,
      offset: 0,
      items: Array.from({ length: 100 }, (_, index) => activeHead(`workflow-${index}`, 1)),
    },
    {
      total: 120,
      limit: 100,
      offset: 100,
      items: Array.from({ length: 20 }, (_, index) => activeHead(`workflow-${100 + index}`, 2)),
    },
  ];
  let call = 0;
  const heads = await fetchWorkflowManagementDefinitionHeads({
    workflowManagementDefinitions: async (_appCode, _environmentKey, limit, offset) => {
      assert.equal(limit, 100);
      assert.equal(offset, call === 0 ? 0 : 100);
      return pages[call++]!;
    },
  }, 'reference-app');
  assert.equal(heads.length, 120);
  assert.equal(call, 2);
});
