import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'antd';
import {
  WorkflowInstanceOperationsPanel,
  WorkflowTaskOperationsPanel,
} from '../src/react';

const instanceSurface = {
  schemaVersion: 'openxiangda.workflow-surface/v2',
  protocolVersion: 'workflow_surface_v2',
  surfaceRevision: 'instance-surface-revision',
  engineVersion: '2.0',
  commandToken: 'fresh-instance-command-token',
  commandTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  instanceSequence: 4,
  detailNavigation: {
    custom: false,
    desktopPath: '/admin/instances/instance-1',
    mobilePath: '/m/instances/instance-1',
  },
  navigationTarget: null,
  instance: {
    id: 'instance-1',
    workflowCode: 'approval',
    status: 'running',
  },
  task: null,
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
      key: 'withdraw',
      kind: 'workflow_command',
      label: '撤回申请',
      placement: 'overflow',
      group: 'initiator',
      audience: 'initiator',
      emphasis: 'warning',
      tone: 'default',
      visible: true,
      enabled: true,
      inputSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string', format: 'textarea', title: '撤回原因' },
        },
      },
      uiSchema: {},
      execute: {
        method: 'POST',
        href: '/instances/instance-1/commands/withdraw',
        idempotencyRequired: true,
      },
      refresh: ['surface', 'timeline'],
    },
    {
      key: 'terminate',
      kind: 'workflow_command',
      label: '终止流程',
      placement: 'overflow',
      group: 'administration',
      audience: 'administrator',
      emphasis: 'danger',
      tone: 'danger',
      visible: false,
      enabled: true,
      inputSchema: { type: 'object', properties: {} },
      uiSchema: {},
      execute: {
        method: 'POST',
        href: '/instances/instance-1/commands/terminate',
        idempotencyRequired: true,
      },
      refresh: ['surface', 'timeline'],
    },
  ],
  extensions: {},
} as const;

test('exports and renders the instance operation panel from a matching Surface', () => {
  assert.equal(typeof WorkflowInstanceOperationsPanel, 'function');
  const markup = renderToStaticMarkup(
    createElement(
      App,
      null,
      createElement(WorkflowInstanceOperationsPanel, {
        instanceId: 'instance-1',
        surface: instanceSurface as any,
        variant: 'mobile',
      }),
    ),
  );
  assert.match(markup, /更多操作/);
  assert.doesNotMatch(markup, /撤回申请/);
  assert.match(markup, /oxa-workflow-actions-mobile/);
  assert.doesNotMatch(markup, /终止流程/);
});

test('does not render a mismatched instance Surface in the first frame', () => {
  const markup = renderToStaticMarkup(
    createElement(
      App,
      null,
      createElement(WorkflowInstanceOperationsPanel, {
        instanceId: 'instance-2',
        surface: instanceSurface as any,
      }),
    ),
  );
  assert.match(markup, /正在加载流程操作/);
  assert.doesNotMatch(markup, /撤回申请/);
});

test('reports a stable error when the instance identifier is empty', () => {
  const markup = renderToStaticMarkup(
    createElement(
      App,
      null,
      createElement(WorkflowInstanceOperationsPanel, {
        instanceId: '  ',
        surface: instanceSurface as any,
      }),
    ),
  );
  assert.match(markup, /WORKFLOW_INSTANCE_ID_REQUIRED/);
  assert.doesNotMatch(markup, /撤回申请/);
});

test('keeps task and instance wrappers on the shared lifecycle and operation core', () => {
  const source = readFileSync(
    new URL(
      '../src/browser/components/workflow/StandardWorkflowPages.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /function WorkflowOperationsPanel/);
  assert.match(source, /interface WorkflowOperationsPanelProps/);
  assert.match(source, /loadSurface\(requestIdentifier\)/);
  assert.match(source, /matchesSurface\(nextSurface, requestIdentifier\)/);
  assert.match(source, /export interface WorkflowTaskOperationsPanelProps/);
  assert.match(source, /export interface WorkflowInstanceOperationsPanelProps/);
  assert.match(source, /export function WorkflowTaskOperationsPanel/);
  assert.match(source, /export function WorkflowInstanceOperationsPanel/);
  assert.match(source, /loadWorkflowTaskSurface/);
  assert.match(source, /loadWorkflowInstanceSurface/);
  assert.match(source, /workflowSurfaceMatchesTask/);
  assert.match(source, /workflowSurfaceMatchesInstance/);
  assert.match(
    source,
    /currentInputSurfaceRef\.current = inputSurface;[\s\S]*?generationRef\.current \+= 1/,
  );
  assert.match(source, /WORKFLOW_INSTANCE_SURFACE_INSTANCE_MISMATCH/);
  assert.match(
    source,
    /<WorkflowInstanceOperationsPanel[\s\S]*instanceId=\{instance\.id\}/,
  );
  assert.match(source, /<WorkflowTaskOperationsPanel[\s\S]*taskId=\{task\.id\}/);
  assert.match(source, /const operations = task\s*\? <WorkflowTaskOperationsPanel/);
  assert.match(source, /const task = surface \? surfaceTask\(surface\) : null/);
  assert.match(source, /<WorkflowOperations[\s\S]*surface=\{renderSurface\}/);
  assert.equal(
    source.match(/function WorkflowOperations\(/g)?.length,
    1,
  );
  assert.equal(
    source.match(/function WorkflowOperationsPanel\(/g)?.length,
    1,
  );
  assert.doesNotMatch(
    source,
    /<WorkflowOperations\s+\n?\s*onCommandSuccess=\{load\}/,
  );
  assert.doesNotMatch(
    source,
    /WorkflowInstanceOperationsPanel[\s\S]*executeWorkflowInstanceCommand/,
  );
  assert.match(
    source,
    /WorkflowInstanceOperationsPanel[\s\S]*onCommandCompleted=\{onCommandCompleted\}/,
  );
  assert.match(
    source,
    /WorkflowTaskOperationsPanel[\s\S]*onCommandCompleted=\{onCommandCompleted\}/,
  );
  assert.match(source, /export function useWorkflowDetail/);
  assert.match(source, /loadWorkflowInstanceDetail/);
  assert.match(source, /loadWorkflowTaskDetail/);
  assert.equal(typeof WorkflowTaskOperationsPanel, 'function');
});

test('keeps Surface mirroring and StrictMode effect replay inside one panel generation', () => {
  const source = readFileSync(
    new URL(
      '../src/browser/components/workflow/StandardWorkflowPages.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const panelSource = source.slice(
    source.indexOf('function WorkflowOperationsPanel('),
    source.indexOf('export interface WorkflowTaskOperationsPanelProps'),
  );
  const effectSource = panelSource.slice(
    panelSource.indexOf('  useEffect(() => {'),
    panelSource.indexOf('  const isCurrentGeneration'),
  );

  assert.match(panelSource, /const activeRef = useRef\(false\)/);
  assert.match(
    panelSource,
    /const isCurrentRequest = \(sequence: number\) =>\s+activeRef\.current &&/,
  );
  assert.match(effectSource, /activeRef\.current = true/);
  assert.equal(
    effectSource.match(/activeRef\.current = false/g)?.length,
    3,
  );
  assert.doesNotMatch(effectSource, /generationRef\.current \+= 1/);
  assert.match(
    panelSource,
    /const isCurrentGeneration = useCallback\(\s*\(identifierAtStart: string, generationAtStart: number\) =>\s*activeRef\.current &&/,
  );
});
