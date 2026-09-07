import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeWorkflowCommand,
  shouldRefreshWorkflowSurface,
} from '../src/react';

const instanceSurface = {
  schemaVersion: 'openxiangda.workflow-surface/v2',
  protocolVersion: 'workflow_surface_v2',
  surfaceRevision: 'instance-surface-revision',
  engineVersion: '2.0',
  commandToken: null,
  commandTokenExpiresAt: null,
  instanceSequence: 4,
  detailNavigation: {
    custom: false,
    desktopPath: '/workflows/instance-1',
    mobilePath: '/m/workflows/instance-1',
  },
  navigationTarget: null,
  instance: { id: 'instance-1' },
  task: null,
  presentation: { businessData: {} },
  fieldPolicy: { default: 'readonly', fields: {} },
  operations: [],
  extensions: {},
} as any;

const advancedTaskResult = {
  taskId: 'task-1',
  instanceId: 'instance-1',
  status: 'running',
  outcome: null,
  nextNodeId: 'review-2',
  advanced: true,
};

test('advanced task commands do not refresh the completed task Surface', async () => {
  assert.equal(shouldRefreshWorkflowSurface('task', advancedTaskResult), false);
  let refreshCalls = 0;
  let callbackResult: unknown;
  let legacyCalls = 0;

  await completeWorkflowCommand('task', advancedTaskResult, {
    refresh: async () => {
      refreshCalls += 1;
      return instanceSurface;
    },
    onCommandCompleted: result => {
      callbackResult = result;
    },
    onCompleted: async () => {
      legacyCalls += 1;
    },
  });

  assert.equal(refreshCalls, 0);
  assert.equal(callbackResult, advancedTaskResult);
  assert.equal(legacyCalls, 0);
});

test('non-advanced task commands refresh the current task Surface', async () => {
  const result = {
    taskId: 'task-1',
    status: 'assigned',
    advanced: false,
  };
  assert.equal(shouldRefreshWorkflowSurface('task', result), true);
  let refreshCalls = 0;
  let callbackResult: unknown;
  let refreshedSurface: unknown;

  await completeWorkflowCommand('task', result, {
    refresh: async () => {
      refreshCalls += 1;
      return instanceSurface;
    },
    onCommandCompleted: commandResult => {
      callbackResult = commandResult;
    },
    onCompleted: (surface, commandResult) => {
      refreshedSurface = surface;
      assert.equal(commandResult, result);
    },
  });

  assert.equal(refreshCalls, 1);
  assert.equal(callbackResult, result);
  assert.equal(refreshedSurface, instanceSurface);
});

test('instance commands refresh the instance Surface regardless of advanced flag', async () => {
  const result = {
    instanceId: 'instance-1',
    status: 'withdrawn',
    outcome: 'withdrawn',
  };
  assert.equal(shouldRefreshWorkflowSurface('instance', result), true);
  let refreshCalls = 0;
  let callbackResult: unknown;

  await completeWorkflowCommand('instance', result, {
    refresh: async () => {
      refreshCalls += 1;
      return instanceSurface;
    },
    onCommandCompleted: commandResult => {
      callbackResult = commandResult;
    },
  });

  assert.equal(refreshCalls, 1);
  assert.equal(callbackResult, result);
});

test('command result remains observable when a refresh returns no Surface', async () => {
  const result = {
    taskId: 'task-1',
    status: 'assigned',
    advanced: false,
  };
  let callbackResult: unknown;
  let legacyCalls = 0;

  const returned = await completeWorkflowCommand('task', result, {
    refresh: async () => null,
    onCommandCompleted: value => {
      callbackResult = value;
    },
    onCompleted: async () => {
      legacyCalls += 1;
    },
  });

  assert.equal(returned, null);
  assert.equal(callbackResult, result);
  assert.equal(legacyCalls, 0);
});

test('command completion forwards the result instanceId without an instance Surface masquerading as a task Surface', async () => {
  let callbackResult: { instanceId?: string | null } | undefined;

  await completeWorkflowCommand('task', advancedTaskResult, {
    refresh: async () => {
      throw new Error('the completed task must not be refreshed');
    },
    onCommandCompleted: result => {
      callbackResult = result;
    },
  });

  assert.equal(callbackResult?.instanceId, 'instance-1');
});
