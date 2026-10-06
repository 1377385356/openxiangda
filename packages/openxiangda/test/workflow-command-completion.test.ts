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

test('confirmed completion reaches the host even when its Surface read fails', async () => {
  const result = { taskId: 'task-1', status: 'assigned', advanced: false };
  let received: unknown;
  await assert.rejects(completeWorkflowCommand('task', result, {
    refresh: async () => { throw new Error('read unavailable'); },
    onCommandCompleted: value => { received = value; },
  }), /read unavailable/);
  assert.equal(received, result);
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

test('a confirmed all-mode first vote hands off an unreadable task without changing the platform result', async () => {
  const result = Object.freeze({ taskId: 'task-1', status: 'assigned', advanced: false });
  const calls: string[] = [];
  let context: unknown;
  const returned = await completeWorkflowCommand('task', result, {
    refresh: async () => {
      calls.push('task');
      throw Object.assign(new Error('WORKFLOW_V2_TASK_FORBIDDEN'), { status: 403, code: 'WORKFLOW_V2_TASK_FORBIDDEN' });
    },
    onCommandCompleted: (received, readContext) => {
      assert.equal(received, result);
      assert.equal(received.advanced, false);
      context = readContext;
      calls.push('authorized-instance-host');
    },
    onCompleted: () => { throw new Error('No task Surface was read'); },
  });
  assert.equal(returned, null);
  assert.deepEqual(context, { taskSurfaceUnavailable: true });
  assert.deepEqual(calls, ['task', 'authorized-instance-host']);
  assert.deepEqual(result, { taskId: 'task-1', status: 'assigned', advanced: false });
});

test('a confirmed command can hand off a missing task, but no host means the read failure remains visible', async () => {
  const result = { taskId: 'task-1', status: 'assigned', advanced: false };
  const error = Object.assign(new Error('missing task'), { status: 404, code: 'WORKFLOW_V2_TASK_NOT_FOUND' });
  await assert.rejects(completeWorkflowCommand('task', result, { refresh: async () => { throw error; } }), error);
  let context: unknown;
  await completeWorkflowCommand('task', result, {
    refresh: async () => { throw error; },
    onCommandCompleted: (_, value) => { context = value; },
  });
  assert.deepEqual(context, { taskSurfaceUnavailable: true });
});

test('network errors, identity failures, unrelated denials and instance reads do not become task handoffs', async () => {
  const result = { taskId: 'task-1', status: 'assigned', advanced: false };
  for (const [kind, status, code] of [
    ['task', 502, 'UPSTREAM_UNAVAILABLE'], ['task', 401, 'WORKFLOW_V2_TASK_FORBIDDEN'],
    ['task', 403, 'APP_SCOPE_FORBIDDEN'], ['instance', 403, 'WORKFLOW_V2_TASK_FORBIDDEN'],
  ] as const) {
    const error = Object.assign(new Error(code), { status, code });
    let context: unknown;
    await assert.rejects(completeWorkflowCommand(kind, result, {
      refresh: async () => { throw error; },
      onCommandCompleted: (received, value) => { assert.equal(received, result); context = value; },
    }), error);
    assert.deepEqual(context, { taskSurfaceUnavailable: false });
  }
});

test('failure to read the resulting instance is reported after the write remains confirmed', async () => {
  const result = { taskId: 'task-1', status: 'assigned', advanced: false };
  const instanceError = Object.assign(new Error('instance access denied'), { status: 403, code: 'WORKFLOW_V2_INSTANCE_FORBIDDEN' });
  await assert.rejects(completeWorkflowCommand('task', result, {
    refresh: async () => { throw Object.assign(new Error('old task forbidden'), { status: 403, code: 'WORKFLOW_V2_TASK_FORBIDDEN' }); },
    onCommandCompleted: (received, context) => {
      assert.equal(received, result); assert.equal(context?.taskSurfaceUnavailable, true);
      throw instanceError;
    },
  }), instanceError);
});
