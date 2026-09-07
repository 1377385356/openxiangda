import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'antd';
import {
  WorkflowTaskOperationsPanel,
  type WorkflowPageVariant,
} from '../src/react';

const workflowSurface = {
  schemaVersion: 'openxiangda.workflow-surface/v2',
  protocolVersion: 'workflow_surface_v2',
  surfaceRevision: 'surface-revision',
  engineVersion: '2.0',
  commandToken: 'fresh-command-token',
  commandTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  instanceSequence: 3,
  detailNavigation: {
    custom: false,
    desktopPath: '/tasks/task-1',
    mobilePath: '/m/tasks/task-1',
  },
  navigationTarget: null,
  instance: {
    id: 'instance-1',
    workflowCode: 'approval',
    status: 'running',
  },
  task: {
    id: 'task-1',
    title: '业务审批',
    status: 'assigned',
  },
  presentation: {
    businessData: {
      status: 'none',
      resourceCode: null,
      recordId: null,
      requestedRevision: null,
      sourceRevision: null,
      fields: {},
      projectionDigest: null,
    },
    businessDetail: {
      status: 'unavailable', resourceCode: null, resourceName: null,
      recordId: null, requestedRevision: null, sourceRevision: null,
      surface: null, record: {}, subtables: {}, projectionDigest: null,
    },
    summary: {
      title: '业务审批', initiatorDisplayName: '申请人',
      departmentDisplayName: null, submittedAt: '2026-09-02T00:00:00.000Z',
      businessNumber: null,
    },
  },
  fieldPolicy: { default: {}, fields: {} },
  operations: [
    {
      key: 'approve',
      kind: 'workflow_command',
      label: '通过',
      placement: 'primary',
      group: 'decision',
      audience: 'participant',
      emphasis: 'primary',
      tone: 'primary',
      visible: true,
      enabled: true,
      inputSchema: { type: 'object', properties: {} },
      uiSchema: {},
      execute: { method: 'POST', href: '/approve', idempotencyRequired: true },
      refresh: ['surface', 'timeline'],
    },
    {
      key: 'reject',
      kind: 'workflow_command',
      label: '拒绝',
      placement: 'primary',
      group: 'decision',
      audience: 'participant',
      emphasis: 'danger',
      tone: 'danger',
      visible: false,
      enabled: true,
      inputSchema: { type: 'object', properties: {} },
      uiSchema: {},
      execute: { method: 'POST', href: '/reject', idempotencyRequired: true },
      refresh: ['surface', 'timeline'],
    },
    {
      key: 'transfer',
      kind: 'workflow_command',
      label: '转交',
      placement: 'overflow',
      group: 'task_collaboration',
      audience: 'participant',
      emphasis: 'neutral',
      tone: 'default',
      visible: true,
      enabled: false,
      disabledReason: '当前节点不允许转交',
      inputSchema: { type: 'object', properties: {} },
      uiSchema: {},
      execute: { method: 'POST', href: '/transfer', idempotencyRequired: true },
      refresh: ['surface'],
    },
  ],
  extensions: {},
} as const;

test('exports the embeddable task operation panel and its variant type', () => {
  assert.equal(typeof WorkflowTaskOperationsPanel, 'function');
  const variants: WorkflowPageVariant[] = ['desktop', 'mobile'];
  assert.deepEqual(variants, ['desktop', 'mobile']);
});

test('renders only platform-visible operations from an injected task Surface', () => {
  const markup = renderToStaticMarkup(
    createElement(
      App,
      null,
      createElement(WorkflowTaskOperationsPanel, {
        taskId: 'task-1',
        variant: 'mobile',
        surface: workflowSurface as any,
      }),
    ),
  );
  assert.match(markup, /通\s*过/);
  assert.match(markup, /更多操作/);
  assert.doesNotMatch(markup, /转交/);
  assert.doesNotMatch(markup, /拒绝/);
  assert.match(markup, /oxa-workflow-actions-mobile/);
});

test('ignores an injected Surface for another task before the first frame', () => {
  const markup = renderToStaticMarkup(
    createElement(
      App,
      null,
      createElement(WorkflowTaskOperationsPanel, {
        taskId: 'task-2',
        surface: workflowSurface as any,
      }),
    ),
  );
  assert.match(markup, /正在加载审批操作/);
  assert.doesNotMatch(markup, /通\s*过/);
  assert.doesNotMatch(markup, /转交/);
});

test('disables application-owned actions instead of routing them to workflow commands', () => {
  const appActionSurface = {
    ...workflowSurface,
    operations: [
      {
        ...workflowSurface.operations[0],
        key: 'open-business-action',
        kind: 'app_action',
        label: '打开业务动作',
        enabled: true,
      },
    ],
  };
  const markup = renderToStaticMarkup(
    createElement(
      App,
      null,
      createElement(WorkflowTaskOperationsPanel, {
        taskId: 'task-1',
        surface: appActionSurface as any,
      }),
    ),
  );
  assert.match(markup, /打开业务动作/);
  assert.match(markup, /应用动作由应用页面负责/);
  assert.match(markup, /disabled=""/);
});

test('keeps the standard task page and embedded panel on one operation core', () => {
  const source = readFileSync(
    new URL('../src/browser/components/workflow/StandardWorkflowPages.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /export function WorkflowTaskOperationsPanel/);
  assert.match(source, /loadSurface\(requestIdentifier\)/);
  assert.match(source, /matchesSurface\(nextSurface, requestIdentifier\)/);
  assert.match(source, /executeWorkflowOperation\([\s\S]*surface,[\s\S]*selected/);
  assert.match(source, /selected\.kind !== 'workflow_command'/);
  assert.match(source, /WORKFLOW_APP_ACTION_DISABLED_REASON/);
  assert.match(source, /inputSchema/);
  assert.match(source, /uiSchema/);
  assert.match(source, /secondary\.length > 0 && moreOpen/);
  assert.match(source, />\s*更多操作\s*</);
  assert.match(source, /currentIdentifierRef/);
  assert.match(source, /generationRef/);
  assert.match(source, /const panelGeneration = generationRef\.current/);
  assert.match(source, /const generationAtStart = panelGeneration/);
  assert.match(source, /currentInputSurfaceRef/);
  assert.match(source, /currentInputSurfaceRef\.current !== requestInputSurface/);
  assert.match(source, /onRefresh=\{refreshCurrent\}/);
  assert.match(source, /onCommandSuccess=\{completed\}/);
  assert.match(source, /onRefresh\(\)/);
  assert.match(source, /onCommandSuccess\(result\)/);
  assert.match(source, /onCommandCompleted/);
  assert.match(source, /shouldRefreshWorkflowSurface/);
  assert.match(source, /result\.advanced !== true/);
  assert.match(source, /onSurfaceChangeRef\.current\?\./);
  assert.match(source, /const callback = onCompletedRef\.current/);
  assert.match(source, /setSurface\(null\)/);
  assert.match(source, /action={<Button onClick={\(\) => void refresh\(\)}/);
  assert.match(source, /<WorkflowTaskOperationsPanel[\s\S]*taskId=\{task\.id\}/);
  assert.match(source, /<WorkflowInstanceOperationsPanel[\s\S]*instanceId=\{instance\.id\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => setSelected\(operation\)\}/);
  assert.ok(source.includes("const detailKey = `${identity.identityScope}:${identity.environment.id}:${kind}:${resourceCode || ''}:${id}`"));
  assert.match(source, /const requestSequence = useRef\(0\)/);
  assert.match(source, /export function useWorkflowDetail/);
  assert.match(source, /loadWorkflowTaskDetail\(id\)/);
  assert.match(source, /loadWorkflowInstanceDetail\(id\)/);
  assert.match(source, /const activeRef = useRef\(false\)/);
  assert.match(source, /sequence === requestSequence\.current/);
  assert.match(source, /setState\(\(current\) =>/);
  assert.match(source, /state\.detailKey === detailKey/);
  assert.match(source, /current\.detail\?\.surface \|\| null/);
  assert.match(source, /if \(surface\.detailNavigation\.custom\)/);

  const operationsSource = source.slice(
    source.indexOf('function WorkflowOperations'),
    source.indexOf('interface WorkflowOperationsPanelProps'),
  );
  assert.doesNotMatch(operationsSource, /onCompleted/);
  assert.ok(
    operationsSource.indexOf('await onRefresh()') <
      operationsSource.indexOf('await onCommandSuccess(result)'),
  );
});
