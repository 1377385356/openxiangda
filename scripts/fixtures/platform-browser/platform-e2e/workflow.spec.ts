import { expect, test, type Page } from '@playwright/test';
import { appCode } from '../../../packages/contracts/src/generated.js';

const taskId = '11111111-1111-4111-8111-111111111111';
const instanceId = '22222222-2222-4222-8222-222222222222';
const commandId = '55555555-5555-4555-8555-555555555555';
function envelope(data: unknown, code = 200) {
  return { code, message: code === 200 ? 'success' : 'forbidden', data };
}

function detailNavigation(custom = false) {
  return custom
    ? {
        custom: true,
        desktopPath: `/admin/operations/purchases/${instanceId}?taskId=${taskId}`,
        mobilePath: `/m/purchases/${instanceId}?taskId=${taskId}`,
      }
    : {
        custom: false,
        desktopPath: `/tasks/${taskId}`,
        mobilePath: `/m/tasks/${taskId}`,
      };
}

function workflowFixtureUrl(
  initialPath: string,
  options: { base?: string; state?: string; surfaces?: 'custom' | 'error' } = {},
) {
  const params = new URLSearchParams({ initial: initialPath });
  if (options.base) params.set('base', options.base);
  if (options.state) params.set('state', options.state);
  if (options.surfaces) params.set('surfaces', options.surfaces);
  return `/workflow-experience.e2e.html?${params.toString()}`;
}

function task(completed = false, customDetail = false) {
  return {
    schemaVersion: 'openxiangda.workflow-task/v2',
    engineVersion: '2.0',
    id: taskId,
    instanceId,
    workflowCode: 'purchase-approval',
    businessKey: 'PO-2026-0825',
    nodeId: 'manager-review',
    title: '采购申请审批',
    status: completed ? 'completed' : 'assigned',
    approvalMode: 'single',
    taskKind: 'normal',
    assignedRoleSubjectKey: 'membership:manager',
    activeParticipantId: 'participant-1',
    participants: [],
    originTaskId: null,
    returnSessionId: null,
    version: completed ? 2 : 1,
    dataRef: { resourceCode: 'purchase-orders', recordId: 'purchase-1' },
    createdAt: '2026-08-25T01:00:00.000Z',
    updatedAt: '2026-08-25T01:10:00.000Z',
    detailNavigation: detailNavigation(customDetail),
  };
}

function surface(completed = false, customDetail = false) {
  return {
    schemaVersion: 'openxiangda.workflow-surface/v2',
    protocolVersion: 'workflow_surface_v2',
    surfaceRevision: (completed ? 'b' : 'a').repeat(64),
    engineVersion: '2.0',
    commandToken: 'A'.repeat(43),
    commandTokenExpiresAt: '2099-08-29T09:05:00.000Z',
    instanceSequence: completed ? 4 : 3,
    detailNavigation: detailNavigation(customDetail),
    navigationTarget: {
      kind: 'resource_record',
      appCode,
      environmentKey: 'preproduction',
      resourceCode: 'purchase-orders',
      recordId: 'purchase-1',
      desktopPath: '/purchase-orders/purchase-1',
      mobilePath: '/m/purchase-orders/purchase-1',
    },
    instance: {
      schemaVersion: 'openxiangda.workflow-instance/v2',
      engineVersion: '2.0',
      id: instanceId,
      appCode,
      environmentId: 'preproduction-id',
      environmentKey: 'preproduction',
      workflowCode: 'purchase-approval',
      definitionVersion: 1,
      bindingVersion: 1,
      businessKey: 'PO-2026-0825',
      generation: 1,
      status: completed ? 'approved' : 'running',
      initiatorUserId: 'applicant-user',
      initiatorAuthorizationDigest: null,
      dataRef: { resourceCode: 'purchase-orders', recordId: 'purchase-1' },
      dataRevision: '8',
      currentNodeId: completed ? null : 'manager-review',
      outcome: completed ? 'approved' : null,
      version: completed ? 3 : 2,
      eventSequence: completed ? 4 : 3,
      startedAt: '2026-08-25T01:00:00.000Z',
      completedAt: completed ? '2026-08-25T01:12:00.000Z' : null,
    },
    task: completed ? null : task(false, customDetail),
    presentation: {
      status: { label: completed ? '已同意' : '待审批', tone: 'warning' },
      layout: 'approval_detail',
      businessData: {
        status: 'fresh',
        resourceCode: 'purchase-orders',
        recordId: 'purchase-1',
        requestedRevision: 8,
        sourceRevision: 8,
        fields: { amount: 28600 },
        projectionDigest: 'c'.repeat(64),
      },
      businessDetail: {
        status: 'stale',
        resourceCode: 'purchase-orders',
        resourceName: '采购申请',
        recordId: 'purchase-1',
        requestedRevision: 8,
        sourceRevision: 9,
        surface: {
          mutationOwner: 'workflow',
          fields: {
            amount: {
              label: '申请金额',
              type: 'number.decimal',
              widget: 'money',
              section: '申请信息',
              readCapabilities: [],
              createCapabilities: [],
              updateCapabilities: [],
            },
            internalVenue: {
              label: '技术场地引用',
              type: 'reference',
              widget: 'reference',
              section: '系统信息',
              system: true,
              readCapabilities: [],
              createCapabilities: [],
              updateCapabilities: [],
            },
          },
          detail: {
            layout: 'sections',
            fieldOrder: ['amount', 'internalVenue'],
          },
        },
        record: {
          amount: 30000,
          internalVenue: '77777777-7777-4777-8777-777777777777',
        },
        subtables: {},
        projectionDigest: 'd'.repeat(64),
      },
      summary: {
        title: '采购申请审批',
        initiatorDisplayName: '张三',
        departmentDisplayName: '理学院',
        submittedAt: '2026-08-25T01:00:00.000Z',
        businessNumber: 'PO-2026-0825',
      },
    },
    fieldPolicy: { default: 'readonly', fields: {} },
    operations: completed
      ? []
      : [
          {
            key: 'approve',
            kind: 'workflow_command',
            label: '同意',
            group: 'decision',
            audience: 'participant',
            placement: 'primary',
            emphasis: 'primary',
            tone: 'primary',
            visible: true,
            enabled: true,
            inputSchema: {
              type: 'object',
              properties: {
                comment: {
                  type: 'string',
                  title: '审批意见',
                  format: 'textarea',
                  maxLength: 500,
                },
              },
            },
            uiSchema: {
              confirmText: '确认同意',
              confirmation: { description: '提交后流程继续流转。' },
            },
            execute: {
              method: 'POST',
              href: `/openxiangda-api/v2/applications/${appCode}/workflow/tasks/${taskId}/commands/approve`,
              idempotencyRequired: true,
            },
            refresh: ['surface', 'timeline', 'work_center'],
          },
          ...['reject', 'return', 'transfer', 'add_assignee'].map(key => ({
            key,
            kind: 'workflow_command',
            label: {
              reject: '拒绝',
              return: '退回',
              transfer: '转交',
              add_assignee: '加签',
            }[key],
            group: key === 'reject' ? 'decision' : 'task_collaboration',
            audience: 'participant',
            placement: key === 'reject' ? 'primary' : 'overflow',
            emphasis:
              key === 'reject'
                ? 'danger'
                : key === 'return'
                  ? 'warning'
                  : 'neutral',
            tone: key === 'reject' ? 'danger' : 'neutral',
            visible: true,
            enabled: true,
            inputSchema: { type: 'object', properties: {} },
            uiSchema: { confirmText: `确认${key}` },
            execute: {
              method: 'POST',
              href: `/openxiangda-api/v2/applications/${appCode}/workflow/tasks/${taskId}/commands/${key}`,
              idempotencyRequired: true,
            },
            refresh: ['surface', 'timeline', 'work_center'],
          })),
        ],
    extensions: {},
  };
}

function timeline(completed = false) {
  const flow = [
    {
      key: 'start',
      nodeId: null,
      kind: 'start',
      title: '张三',
      status: 'completed',
      startedAt: '2026-08-25T01:00:00.000Z',
      completedAt: '2026-08-25T01:00:00.000Z',
      assignees: [],
      operations: [],
    },
    {
      key: 'manager',
      nodeId: 'manager-review',
      kind: 'approval',
      title: '部门负责人',
      status: completed ? 'completed' : 'active',
      startedAt: '2026-08-25T01:01:00.000Z',
      completedAt: completed ? '2026-08-25T01:12:00.000Z' : null,
      assignees: [{ userId: 'acceptance-user', displayName: '李明' }],
      operations: [{
        id: 'operation-transfer',
        operation: 'transfer',
        operationLabel: '转交',
        actorUserId: 'acceptance-user',
        actorDisplayName: '李明',
        actingForUserId: null,
        reason: '由值班负责人继续处理',
        detail: {},
        severity: 'normal',
        createdAt: '2026-08-25T01:08:00.000Z',
      }],
    },
    {
      key: 'finance',
      nodeId: 'finance-review',
      kind: 'approval',
      title: '财务负责人',
      status: completed ? 'completed' : 'waiting',
      startedAt: null,
      completedAt: null,
      assignees: [{ userId: 'finance-user', displayName: '财务负责人' }],
      operations: [],
    },
  ];
  const items = [{
    id: 'operation-transfer',
    operation: 'transfer',
    operationLabel: '转交',
    actorUserId: 'acceptance-user',
    actorDisplayName: '李明',
    actingForUserId: null,
    reason: '由值班负责人继续处理',
    detail: {},
    severity: 'normal',
    createdAt: '2026-08-25T01:08:00.000Z',
  }];
  const display = {
    entries: [
      {
        key: 'start',
        kind: 'submission',
        nodeId: null,
        nodeKind: 'start',
        title: '提交申请',
        status: 'completed',
        enteredAt: '2026-08-25T01:00:00.000Z',
        leftAt: '2026-08-25T01:00:00.000Z',
        primaryDisplayTime: '2026-08-25T01:00:00.000Z',
        people: [{
          userId: 'applicant-user',
          displayName: '张三',
          avatarUrl: null,
          departmentDisplayName: '理学院',
        }],
        operations: [],
        result: {},
        terminalReason: null,
      },
      {
        key: 'manager',
        kind: 'node',
        nodeId: 'manager-review',
        nodeKind: 'approval',
        title: '部门负责人',
        status: completed ? 'completed' : 'active',
        enteredAt: '2026-08-25T01:01:00.000Z',
        leftAt: completed ? '2026-08-25T01:12:00.000Z' : null,
        primaryDisplayTime: '2026-08-25T01:08:00.000Z',
        people: [],
        operations: [{
          id: 'operation-transfer',
          operation: 'transfer',
          operationLabel: '转交',
          actor: {
            userId: 'acceptance-user',
            displayName: '李明',
            avatarUrl: null,
            departmentDisplayName: null,
          },
          actingForUserId: null,
          reason: '由值班负责人继续处理',
          severity: 'normal',
          occurredAt: '2026-08-25T01:08:00.000Z',
        }],
        result: {},
        terminalReason: null,
      },
      {
        key: 'finance',
        kind: completed ? 'node' : 'planned_node',
        nodeId: 'finance-review',
        nodeKind: 'approval',
        title: '财务负责人',
        status: completed ? 'completed' : 'waiting',
        enteredAt: null,
        leftAt: null,
        primaryDisplayTime: null,
        people: [{
          userId: 'finance-user',
          displayName: '财务负责人',
          avatarUrl: null,
          departmentDisplayName: null,
        }],
        operations: [],
        result: {},
        terminalReason: null,
      },
    ],
  };
  return {
    engineVersion: '2.0',
    instanceId,
    instanceSequence: completed ? 4 : 3,
    timelineRevision: (completed ? 'f' : 'e').repeat(64),
    flow,
    items,
    display,
  };
}

function detail(completed = false, customDetail = false) {
  const currentSurface = surface(completed, customDetail);
  const currentTimeline = timeline(completed);
  return {
    schemaVersion: 'openxiangda.workflow-detail-surface/v2',
    protocolVersion: 'workflow_detail_surface_v2',
    detailRevision: (completed ? '2' : '1').repeat(64),
    instanceSequence: currentSurface.instanceSequence,
    timelineRevision: currentTimeline.timelineRevision,
    surface: currentSurface,
    timeline: currentTimeline,
    currentStatus: {
      code: completed ? 'approved' : 'assigned',
      label: completed ? '已同意' : '待审批',
      tone: completed ? 'success' : 'warning',
    },
    nodes: currentTimeline.display.entries,
    handlingRecords: currentTimeline.display.entries.flatMap(
      entry => entry.operations
    ),
    operations: currentSurface.operations,
    navigationContext: {
      desktopReturnPath: '/admin/work-center',
      mobileReturnPath: '/m/work-center',
    },
  };
}

function launchSurface() {
  return {
    schemaVersion: 'openxiangda.workflow-launch-surface/v3',
    protocolVersion: 'workflow_launch_surface_v3',
    surfaceRevision: 'launch-revision-1',
    engineVersion: '2.0',
    appCode,
    environmentKey: 'preproduction',
    environmentId: 'preproduction-id',
    workflowCode: 'purchase-approval',
    title: '采购审批',
    launchMode: 'standalone',
    processOperationCode: 'openxiangda.workflow.purchase-approval.submit',
    subject: {
      resourceCode: 'purchase-orders',
      factProjection: { amount: 'amount' },
      summaryFields: ['amount'],
    },
    inputSchema: { type: 'object', properties: {} },
    head: {
      workflowRevision: 4,
      definitionVersion: 1,
      bindingVersion: 1,
      nativeRevision: 3,
      contractRevisionId: 'contract-revision-1',
    },
    paths: {
      desktop: '/workflows/purchase-approval/start',
      mobile: '/m/workflows/purchase-approval/start',
    },
    commit: {
      method: 'POST',
      href: `/openxiangda-api/v2/applications/${appCode}/business-process/standard-commands`,
      idempotencyRequired: true,
    },
    submission: {
      kind: 'standard-process',
      processOperationCode: 'openxiangda.workflow.purchase-approval.submit',
      commit: {
        method: 'POST',
        href: `/openxiangda-api/v2/applications/${appCode}/business-process/standard-commands`,
        idempotencyRequired: true,
      },
    },
  };
}

function processCommand(status: 'accepted' | 'started' = 'started') {
  return {
    schemaVersion: 'openxiangda.business-process.command/v2',
    id: commandId,
    appCode,
    environmentKey: 'preproduction',
    operationCode: 'openxiangda.workflow.purchase-approval.submit',
    idempotencyKey: 'process:purchase-approval:test',
    workflowCode: 'purchase-approval',
    status,
    revision: status === 'started' ? 4 : 1,
    subject: {
      resourceCode: 'purchase-orders',
      id: '66666666-6666-4666-8666-666666666666',
      dataRevision: 1,
      factDigest: 'a'.repeat(64),
    },
    definitionVersion: 1,
    bindingVersion: 1,
    requirements: [],
    answers: {},
    preview: {},
    workflowInstanceId: status === 'started' ? instanceId : null,
    attemptCount: 1,
    lastError: null,
    replayed: false,
    createdAt: '2026-08-29T01:00:00.000Z',
    updatedAt: '2026-08-29T01:00:01.000Z',
  };
}

function processCommandSurface() {
  const command = processCommand('started');
  const base = `/openxiangda-api/v2/applications/${appCode}/business-process/commands/${commandId}`;
  return {
    schemaVersion: 'openxiangda.process-command-surface/v2',
    surfaceRevision: 'b'.repeat(64),
    command,
    subject: {
      resourceCode: 'purchase-orders',
      recordId: command.subject.id,
      dataRevision: 1,
      form: {
        kind: 'native-resource-form',
        resourceCode: 'purchase-orders',
        recordId: command.subject.id,
      },
    },
    requirements: [],
    resume: {
      status: { method: 'GET', href: base },
      surface: { method: 'GET', href: `${base}/surface` },
      answer: null,
      retry: null,
      navigationTarget: {
        kind: 'PLATFORM_ROUTE',
        routeCode: 'resource.record',
        appCode,
        pathParams: {
          resourceCode: 'purchase-orders',
          recordId: command.subject.id,
        },
        query: { processCommandId: commandId },
        access: 'AUTHENTICATED',
      },
      desktop: `/purchase-orders/${command.subject.id}?processCommandId=${commandId}`,
      mobile: `/m/purchase-orders/${command.subject.id}?processCommandId=${commandId}`,
    },
  };
}

function todoPage(offset = 0, view = 'all') {
  const first = {
    messageId: '33333333-3333-4333-8333-333333333333',
    recipientId: '44444444-4444-4444-8444-444444444444',
    state: 'action_required',
    interactionState: 'unread',
    title: '设备采购申请待审批',
    summary: '张三提交了一笔办公设备采购申请',
    fields: [
      { code: 'amount', label: '申请金额', value: '¥28,600' },
      { code: 'department', label: '申请部门', value: '理学院' },
    ],
    actions: [{ code: 'open', label: '去处理' }],
    sourceKind: 'PLATFORM_EVENT',
    sourceLabel: '流程中心',
    occurredAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T01:01:00.000Z',
    navigation: {
      desktopPath: `/admin/operations/purchases/${instanceId}?taskId=${taskId}`,
      mobilePath: `/m/purchases/${instanceId}?taskId=${taskId}`,
      external: false,
      navigationUnavailable: false,
    },
  };
  const second = {
    ...first,
    messageId: '77777777-7777-4777-8777-777777777777',
    title: '采购结果通知',
    interactionState: 'read',
  };
  return {
    schemaVersion: 'openxiangda.application-todo-center/v2',
    appCode,
    environmentKey: 'preproduction',
    view,
    counts: { pending: 1, informational: 2, completed: 3, unread: 1 },
    items: [offset > 0 ? second : first],
    total: 2,
    limit: 12,
    offset,
    nextOffset: offset > 0 ? null : 1,
  };
}

async function mockWorkflow(
  page: Page,
  options: {
    commandConflict?: boolean;
    forbidden?: boolean;
    customDetail?: boolean;
  } = {}
) {
  let completed = false;
  await page.route('**/service/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/auth/surface')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ csrfToken: 'workflow-csrf-1' })),
      });
    }
    if (path.endsWith('/native/authz/current')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            schemaVersion: 'openxiangda.runtime-authorization/v2',
            state: 'active',
            environment: {
              id: 'preproduction-id',
              key: 'preproduction',
              activeAppVersionId: 'version-1',
              headRevision: 1,
              authzRevisionId: 'authz-1',
              authzVersion: 1,
              scopeDataVersion: 'scope-1',
            },
            subjectProfile: {
              schemaVersion: 'openxiangda.subject-profile/v2',
              userId: 'acceptance-user',
              displayName: '王老师',
              avatarUrl: null,
              jobNumber: 'T001',
              affiliatedDepartment: { id: 'department-1', name: '理学院' },
            },
            roles: [
              {
                code: 'department_manager',
                name: '部门管理员',
                source: 'package',
              },
            ],
            principal: {
              type: 'user_union',
              userId: 'acceptance-user',
              roleCodes: ['department_manager'],
              capabilityCodes: [],
              isAppSuperAdmin: true,
              identityScope:
                'user-union:preproduction-id:acceptance-user:authz-1',
            },
          })
        ),
      });
    }
    if (path.includes('/directory/')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ items: [], nextCursor: null })),
      });
    }
    if (options.forbidden && path.includes('/workflow/')) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify(envelope(null, 403)),
      });
    }
    if (path.endsWith('/todos') && route.request().method() === 'GET') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope(todoPage(Number(url.searchParams.get('offset') || 0), url.searchParams.get('view') || 'all')),
        ),
      });
    }
    if (path.includes('/todos/') && path.endsWith('/interactions')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            accepted: true,
            duplicate: false,
            interactionState: 'clicked',
          })
        ),
      });
    }
    if (
      path.endsWith(
        '/workflow/definitions/purchase-approval/launch-surface'
      )
    ) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(launchSurface())),
      });
    }
    if (
      path.endsWith('/business-process/standard-commands') &&
      route.request().method() === 'POST'
    ) {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        schemaVersion: 'openxiangda.standard-process.commit/v2',
        environmentKey: 'preproduction',
        workflowCode: 'purchase-approval',
        mutation: { kind: 'create', data: { amount: 28600 } },
      });
      for (const forbidden of [
        'facts',
        'dataRef',
        'preparationToken',
        'processOperationCode',
      ]) {
        expect(body).not.toHaveProperty(forbidden);
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(processCommand('accepted'))),
      });
    }
    if (
      path.endsWith(`/business-process/commands/${commandId}/surface`) &&
      route.request().method() === 'GET'
    ) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(processCommandSurface())),
      });
    }
    if (path.endsWith('/workflow/work-center/items')) {
      const view = url.searchParams.get('view') || 'pending';
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            engineVersion: '2.0',
            authorizationMode: 'current_user_role_union',
            authorizationDigest: 'digest-1',
            view,
            counts: { created: 1, pending: completed ? 0 : 1, handled: completed ? 1 : 0, cc: 1 },
            total: 1,
            limit: 20,
            offset: 0,
            items: [{ ...task(completed, options.customDetail), id: view === 'pending' ? taskId : instanceId, itemKind: view === 'pending' ? 'task' : 'instance', instanceId, taskId: view === 'pending' ? taskId : null, workflowTitle: '采购审批', taskTitle: '负责人审批', instanceStatus: completed ? 'approved' : 'running', resourceCode: 'purchase-orders', recordId: 'purchase-1', occurredAt: '2026-08-25T01:00:00.000Z' }],
          })
        ),
      });
    }
    if (path.endsWith(`/workflow/tasks/${taskId}/surface`)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope(surface(completed, options.customDetail))
        ),
      });
    }
    if (
      path.endsWith(`/workflow/tasks/${taskId}/detail`) ||
      path.endsWith(`/workflow/instances/${instanceId}/detail`)
    ) {
      expect(route.request().headers()['x-openxiangda-csrf-token']).toBe(
        'workflow-csrf-1'
      );
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope(detail(completed, options.customDetail))
        ),
      });
    }
    if (path.endsWith(`/workflow/instances/${instanceId}/surface`)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope(surface(completed, options.customDetail))
        ),
      });
    }
    if (path.endsWith(`/workflow/instances/${instanceId}/timeline`)) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(timeline(completed))),
      });
    }
    if (path.endsWith(`/workflow/tasks/${taskId}/commands/approve`)) {
      expect(route.request().headers()['x-openxiangda-csrf-token']).toBe(
        'workflow-csrf-1'
      );
      expect(route.request().postDataJSON()).toMatchObject({
        commandToken: 'A'.repeat(43),
        input: { comment: '同意采购' },
      });
      expect(route.request().postDataJSON()).not.toHaveProperty(
        'expectedTaskVersion'
      );
      expect(route.request().postDataJSON()).not.toHaveProperty(
        'expectedInstanceVersion'
      );
      if (options.commandConflict) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(
            envelope({ freshSurface: surface(false, options.customDetail) }, 409)
          ),
        });
      }
      completed = true;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ status: 'completed' })),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify(envelope(null, 404)),
    });
  });
}

test('PC 与移动待办和消息页只使用应用提供的用户框架', async ({ page }) => {
  await mockWorkflow(page);
  for (const device of ['desktop', 'mobile']) {
    await page.setViewportSize(device === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    for (const name of ['todos', 'work-center']) {
      const path = `${device === 'mobile' ? '/m' : ''}/${name}`;
      await page.goto(`/workflow-experience.e2e.html?initial=${encodeURIComponent(path)}&surfaces=custom`);
      await expect(page.getByTestId(`standard-frame-${device}`)).toHaveCount(1);
      await expect(page.locator('.oxa-sider')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '返回', exact: true })).toHaveCount(1);
    }
  }
});

test('renders a paged desktop work center from the current-user role union', async ({
  page,
}) => {
  await mockWorkflow(page);
  await page.goto('/workflow-experience.e2e.html?initial=/work-center');
  await expect(page.getByRole('heading', { name: '待办中心' })).toBeVisible();
  await expect(page.getByRole('button', { name: '采购申请审批' })).toBeVisible();
  await expect(page.getByText('采购审批', { exact: true })).toBeVisible();
  for (const [view, label] of [['created', '我创建的'], ['handled', '我已处理'], ['cc', '抄送我的'], ['pending', '待我审批']]) {
    const request = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/workflow/work-center/items') && new URL(request.url()).searchParams.get('view') === view);
    await page.getByRole('tab', { name: new RegExp(label) }).click();
    await request;
    await expect(page.getByRole('button', { name: '采购申请审批' })).toBeVisible();
  }
});

test.describe('application timezone boundary', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('standard workflow business dates, submission and centers inherit application zone', async ({ page }) => {
    await mockWorkflow(page);
    await page.route(`**/workflow/tasks/${taskId}/detail`, route => {
      const response = detail();
      const business = response.surface.presentation.businessDetail;
      Object.assign(business.surface.fields, { startsAt: {
        label: '会议开始时间', type: 'datetime', widget: 'datetime',
        readCapabilities: [], createCapabilities: [], updateCapabilities: [],
      } });
      business.surface.detail.fieldOrder.push('startsAt');
      Object.assign(business.record, { startsAt: '2026-03-07T18:15:00.000Z' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(response)) });
    });
    await page.goto(`/workflow-experience.e2e.html?initial=/tasks/${taskId}&timeZone=Asia%2FShanghai`);
    await expect(page.getByText('会议开始时间', { exact: true })).toBeVisible();
    await expect(page.getByText('2026/3/8 02:15:00', { exact: true })).toBeVisible();
    await expect(page.locator('.oxa-record-detail-metadata')).toContainText('2026/08/25 09:00 创建');
    await page.getByRole('tab', { name: '审批历史' }).click();
    await expect(page.getByText('2026/8/25 09:08:00', { exact: true })).toBeVisible();
    await page.goto('/workflow-experience.e2e.html?initial=/work-center&timeZone=Asia%2FShanghai');
    await expect(page.getByRole('row').filter({ hasText: '采购申请审批' })).toContainText('09:00:00');
    await page.goto('/workflow-experience.e2e.html?initial=/todos&timeZone=Asia%2FShanghai');
    await expect(page.locator('.oxa-todo-table')).toContainText('08/28 09:01');
  });
});

for (const mobile of [false, true]) {
for (const multiple of [false, true]) {
test(`${mobile ? 'mobile' : 'desktop'} ${multiple ? 'CC' : 'transfer'} uses the standard member picker`, async ({ page }) => {
  await page.setViewportSize(mobile ? { width: 320, height: 480 } : { width: 1440, height: 900 });
  await mockWorkflow(page);
  const current = detail();
  const key = multiple ? 'cc' : 'transfer';
  const label = multiple ? '抄送' : '转交';
  const field = multiple ? 'userIds' : 'userId';
  const cc = {
    key, kind: 'workflow_command', label, group: 'instance_control', audience: 'participant',
    placement: 'overflow', emphasis: 'neutral', tone: 'neutral', visible: true, enabled: true,
    inputSchema: { type: 'object', additionalProperties: false, required: [field], properties: {
      [field]: multiple ? { type: 'array', title: '抄送给', minItems: 1, maxItems: 20, uniqueItems: true, items: { type: 'string' } } : { type: 'string', title: '转交给' },
      comment: { type: 'string', title: '留言', maxLength: 4000 },
    } },
    uiSchema: { presentation: 'dialog', confirmText: `确认${label}`, properties: { [field]: { component: 'user_select', mode: multiple ? 'multiple' : 'single' } } },
    execute: { method: 'POST', href: `/openxiangda-api/v2/applications/${appCode}/workflow/${multiple ? `instances/${instanceId}` : `tasks/${taskId}`}/commands/${key}`, idempotencyRequired: true },
    refresh: ['surface', 'timeline', 'work_center'],
  };
  const augmented = { ...current, operations: [...current.operations.filter(item => item.key !== key), cc], surface: { ...current.surface, operations: [...current.surface.operations.filter(item => item.key !== key), cc] } };
  await page.route('**/workflow/tasks/*/detail', route => route.fulfill({ json: envelope(augmented) }));
  await page.route('**/directory/**', route => {
    const tree = new URL(route.request().url()).pathname.endsWith('/tree');
    const items = tree ? [] : ['陈老师', '李老师'].map((label, index) => ({ kind: 'user', id: `cc-user-${index + 1}`, label, selectable: true, snapshot: { value: `cc-user-${index + 1}`, label } }));
    return route.fulfill({ json: envelope({ schemaVersion: 'openxiangda.directory-entry-page/v2', kind: tree ? 'department' : 'user', items, nextCursor: null }) });
  });
  let writes = 0;
  await page.route(`**/commands/${key}`, async route => {
    writes += 1;
    expect(route.request().postDataJSON()).toMatchObject({ commandToken: current.surface.commandToken, input: { [field]: multiple ? ['cc-user-1', 'cc-user-2'] : 'cc-user-1', comment: '请查阅' } });
    expect(route.request().postDataJSON().idempotencyKey).toBeTruthy();
    expect(route.request().headers()['x-openxiangda-csrf-token']).toBe('workflow-csrf-1');
    await route.fulfill({ json: envelope({ status: 'completed', advanced: false, instanceId }) });
  });
  await page.goto(workflowFixtureUrl(`${mobile ? '/m' : ''}/tasks/${taskId}`));
  const footer = page.locator('.oxa-record-detail-footer');
  await expect(footer).toBeVisible();
  await expect(footer.getByRole('button', { name: /关\s*闭|编\s*辑/ })).toHaveCount(0);
  if (mobile) {
    const boxes = await footer.locator('.oxa-workflow-actions > button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y));
    expect(boxes).toHaveLength(3);
    expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2);
  }
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: `确认${label}` }).click();
  expect(writes).toBe(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  if (mobile) {
    const bounds = await page.locator('.oxa-workflow-operation-drawer .ant-drawer-content-wrapper').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(481);
    await expect(page.getByRole('button', { name: `确认${label}` })).toBeInViewport();
  }
  const trigger = page.locator(mobile ? '.oxa-mobile-choice-field button' : '.oxa-directory-trigger').first();
  await trigger.click();
  if (mobile) {
    await expect(page.locator('.oxa-mobile-selection-sheet')).toBeInViewport();
    await expect(page.getByRole('button', { name: '关闭', exact: true }).last()).toBeInViewport();
    await expect(page.getByRole('button', { name: '确定', exact: true })).toBeInViewport();
  }
  await page.getByPlaceholder(mobile ? /搜索/ : '搜索成员姓名或工号').fill('老师');
  await page.getByText('陈老师', { exact: true }).click();
  await page.getByRole('button', { name: mobile ? '关闭' : /取\s*消/, exact: true }).last().click();
  await page.getByRole('button', { name: `确认${label}` }).click();
  expect(writes).toBe(0);
  await trigger.click();
  await page.getByPlaceholder(mobile ? /搜索/ : '搜索成员姓名或工号').fill('老师');
  await page.getByText('陈老师', { exact: true }).click();
  if (multiple) await page.getByText('李老师', { exact: true }).click();
  await page.getByRole('button', { name: mobile ? `确定（${multiple ? 2 : 1}）` : /确\s*定/, exact: true }).last().click();
  await page.getByLabel('留言').fill('请查阅');
  await page.getByRole('button', { name: `确认${label}` }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(page.getByRole('button', { name: /同\s*意/ })).toBeVisible();
});

}

}

test('renders the generic desktop and mobile application todo center without a second router', async ({
  page,
}) => {
  await mockWorkflow(page);
  await page.goto('/workflow-experience.e2e.html?initial=/todos');
  await expect(page.getByRole('heading', { name: '消息中心' })).toBeVisible();
  await expect(page.getByTestId('standard-frame-desktop')).toHaveCount(0);
  await expect(page.locator('.oxa-todo-table')).toBeVisible();
  await expect(page.locator('.oxa-todo-preview-card')).toHaveCount(0);
  await expect(page.getByText('设备采购申请待审批').first()).toBeVisible();
  await expect(page.getByText('¥28,600').first()).toBeVisible();
  await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  const unreadRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname.endsWith('/todos') && url.searchParams.get('unread') === 'true';
  });
  await page.getByRole('switch', { name: '仅看未读' }).click();
  await unreadRequest;
  await page.getByRole('button', { name: /查看详情/ }).first().click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/operations/purchases/${instanceId}\\?taskId=${taskId}`)
  );
  await expect(page.getByTestId('custom-workflow-detail')).toContainText(
    `${instanceId} / ${taskId}`
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workflow-experience.e2e.html?initial=/m/todos');
  await expect(page.locator('.oxa-todo-center-mobile')).toBeVisible();
  await expect(page.locator('.oxa-todo-preview-card')).toHaveCount(0);
  await page.getByRole('button', { name: /查看详情/ }).first().click();
  await expect(page).toHaveURL(
    new RegExp(`/m/purchases/${instanceId}\\?taskId=${taskId}`)
  );
  await expect(page.getByTestId('custom-workflow-detail')).toContainText(
    `${instanceId} / ${taskId}`
  );
});

test('selects paired application todo renderers while the platform owns data, paging and navigation', async ({
  page,
}) => {
  await mockWorkflow(page);
  await page.goto(
    workflowFixtureUrl('/todos', { surfaces: 'custom' }),
  );
  const desktopFrame = page.getByTestId('standard-frame-desktop');
  await expect(desktopFrame).toHaveAttribute(
    'data-page-kind',
    'application-todo-center',
  );
  await expect(desktopFrame).toHaveAttribute(
    'data-route-code',
    'application.todo-center.desktop',
  );
  await expect(page.getByTestId('custom-todo-desktop')).toBeVisible();
  await expect(page.getByText('设备采购申请待审批')).toBeVisible();

  const nextPage = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname.endsWith('/todos') && url.searchParams.get('offset') === '1';
  });
  await page.getByRole('button', { name: '加载更多' }).click();
  await nextPage;
  await expect(page.getByText('采购结果通知')).toBeVisible();

  const unreadRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname.endsWith('/todos') && url.searchParams.get('unread') === 'true';
  });
  await page.getByRole('button', { name: '切换未读' }).click();
  await unreadRequest;
  await expect(page.getByTestId('custom-todo-query')).toContainText(
    'all/true/all',
  );

  await page.getByRole('button', { name: '设备采购申请待审批' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/operations/purchases/${instanceId}\\?taskId=${taskId}`),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    workflowFixtureUrl('/m/todos', { surfaces: 'custom' }),
  );
  await expect(page.getByTestId('custom-todo-mobile')).toBeVisible();
  await expect(page.getByTestId('standard-frame-mobile')).toHaveAttribute(
    'data-route-code',
    'application.todo-center.mobile',
  );
});

test('frames platform-owned workflow launch, task and instance routes with safe metadata', async ({
  page,
}) => {
  await mockWorkflow(page);
  for (const [path, kind, routeCode, params] of [
    [
      '/workflows/purchase-approval/start',
      'workflow-launch',
      'workflow.purchase-approval.launch.desktop',
      'purchase-approval',
    ],
    [
      `/tasks/${taskId}`,
      'workflow-task',
      'workflow.task.desktop',
      taskId,
    ],
    [
      `/workflows/${instanceId}`,
      'workflow-instance',
      'workflow.instance.desktop',
      instanceId,
    ],
  ] as const) {
    await page.goto(workflowFixtureUrl(path, { surfaces: 'custom' }));
    const frame = page.getByTestId('standard-frame-desktop');
    await expect(frame).toHaveAttribute('data-page-kind', kind);
    await expect(frame).toHaveAttribute('data-route-code', routeCode);
    await expect(frame).toHaveAttribute(
      'data-route-params',
      new RegExp(params),
    );
  }
});

test('contains an application standard renderer failure inside the platform boundary', async ({
  page,
}) => {
  await mockWorkflow(page);
  await page.goto(workflowFixtureUrl('/todos', { surfaces: 'error' }));
  await expect(page.getByText('页面显示失败')).toBeVisible();
  await expect(page.getByText(/平台登录态和业务数据未受影响/)).toBeVisible();
  await expect(page.getByRole('button', { name: '重新加载页面' })).toBeVisible();
});

test('launches the same workflow from the canonical mobile Surface and follows custom detail routing', async ({
  page,
}) => {
  await mockWorkflow(page, { customDetail: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    '/workflow-experience.e2e.html?initial=/m/workflows/purchase-approval/start'
  );
  await expect(page.locator('.oxa-workflow-submission-mobile')).toBeVisible();
  await expect(page.getByRole('heading', { name: '采购审批' })).toBeVisible();
  await page.getByRole('textbox', { name: '申请金额', exact: true }).fill('28600');
  await page.getByRole('button', { name: '提交审批' }).click();
  await expect(page.getByTestId('custom-workflow-detail')).toContainText(
    `${instanceId} / ${taskId}`
  );
  await expect(page).toHaveURL(
    new RegExp(`/m/purchases/${instanceId}\\?taskId=${taskId}$`)
  );
});

test('routes desktop and mobile work-center entries to the declared custom detail pages', async ({
  page,
}) => {
  await mockWorkflow(page, { customDetail: true });
  await page.goto('/workflow-experience.e2e.html?initial=/work-center');
  await page.getByRole('button', { name: '采购申请审批' }).click();
  await expect(page.getByTestId('custom-workflow-detail')).toContainText(
    `${instanceId} / ${taskId}`
  );
  await expect(page).toHaveURL(
    new RegExp(`/admin/operations/purchases/${instanceId}\\?taskId=${taskId}$`)
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workflow-experience.e2e.html?initial=/m/work-center');
  await page.getByText('采购申请审批').click();
  await expect(page.getByTestId('custom-workflow-detail')).toContainText(
    `${instanceId} / ${taskId}`
  );
  await expect(page).toHaveURL(
    new RegExp(`/m/purchases/${instanceId}\\?taskId=${taskId}$`)
  );
});

test('redirects a direct standard task URL to the declared custom detail page', async ({
  page,
}) => {
  await mockWorkflow(page, { customDetail: true });
  await page.goto(
    `/workflow-experience.e2e.html?initial=/tasks/${taskId}`
  );
  await expect(page.getByTestId('custom-workflow-detail')).toContainText(
    `${instanceId} / ${taskId}`
  );
});

test('renders a standalone desktop detail on the canonical user URL', async ({
  page,
}) => {
  await mockWorkflow(page);
  await page.goto(
    workflowFixtureUrl(`/tasks/${taskId}?from=todo#approval`),
  );
  await expect(page.locator('.oxa-record-detail-desktop.is-page')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/tasks/${taskId}\\?from=todo#approval$`),
  );
  await expect(page.locator('.oxa-app-layout')).toHaveCount(0);
  await expect(page.locator('.oxa-topbar')).toHaveCount(0);
  await expect(page.getByText('¥30,000')).toBeVisible();
  await expect(page.getByText('技术场地引用')).toHaveCount(0);
  await expect(page.getByText('业务数据已变化')).toHaveCount(0);
  await expect(page.getByText('流程信息')).toHaveCount(0);
  await expect(page.getByText('操作记录')).toHaveCount(0);
  await page.getByRole('tab', { name: '审批历史' }).click();
  await expect(page.getByText('由值班负责人继续处理')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /同\s*意/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /拒\s*绝/ })).toBeVisible();
});

test('shows a friendly refresh prompt only after a real command conflict', async ({
  page,
}) => {
  await mockWorkflow(page, { commandConflict: true });
  await page.goto(workflowFixtureUrl(`/tasks/${taskId}`));
  await expect(page.getByText('业务数据已变化')).toHaveCount(0);
  await page.getByRole('button', { name: /同\s*意/ }).click();
  await page.getByLabel('审批意见').fill('同意采购');
  await page.getByRole('button', { name: '确认同意' }).click();
  await expect(page.getByText('内容已更新，请刷新后重试')).toBeVisible();
});

test('renders the independent mobile task and executes only a Surface operation', async ({
  page,
}) => {
  await mockWorkflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workflow-experience.e2e.html?initial=/m/tasks/${taskId}`);
  await expect(page.locator('.oxa-record-detail-mobile')).toBeVisible();
  await expect(page.getByText('¥30,000')).toBeVisible();
  await page.getByRole('tab', { name: '审批历史' }).click();
  await expect(page.getByText('财务负责人').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /同\s*意/ })).toBeVisible();
  await page.getByRole('button', { name: /同\s*意/ }).click();
  await page.getByLabel('审批意见').fill('同意采购');
  await page.getByRole('button', { name: '确认同意' }).click();
  await expect(page.getByText('同意已提交')).toBeVisible();
  await expect(page.getByRole('button', { name: /同\s*意/ })).toHaveCount(0);
});

test('shows an explicit authorization error instead of an empty work center', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await mockWorkflow(page, { forbidden: true });
  await page.goto('/workflow-experience.e2e.html?initial=/work-center', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('alert')).toContainText('403: forbidden', {
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: '采购申请审批' })).toHaveCount(0);
});

test('negotiates direct standard routes after BrowserRouter listener setup', async ({
  page,
}) => {
  await mockWorkflow(page);
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto(
    workflowFixtureUrl('/todos?view=pending#unread', {
      state: 'deep-link',
    }),
  );

  // The initial desktop URL is replaced by the mobile pair and the rendered
  // surface follows the Router update. The fixture is StrictMode-mounted.
  await expect(page.locator('.oxa-todo-center-mobile')).toBeVisible();
  await expect(page.locator('.oxa-todo-center-desktop')).toHaveCount(0);
  await expect(page).toHaveURL(/\/m\/todos\?view=pending#unread$/);
  const historyLength = await page.evaluate(() => window.history.length);
  const negotiatedUrl = page.url();
  await expect
    .poll(() => page.url(), { timeout: 1_000 })
    .toBe(negotiatedUrl);
  expect(await page.evaluate(() => window.history.state?.usr)).toEqual({
    routeNegotiationState: 'deep-link',
  });

  // 900px remains mobile; crossing to 901px switches the same manifest pair
  // back to desktop without adding a browser-history entry.
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(page.locator('.oxa-todo-center-mobile')).toBeVisible();
  await page.setViewportSize({ width: 901, height: 844 });
  await expect(page.locator('.oxa-todo-center-desktop')).toBeVisible();
  await expect(page).toHaveURL(/\/todos\?view=pending#unread$/);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  expect(await page.evaluate(() => window.history.state?.usr)).toEqual({
    routeNegotiationState: 'deep-link',
  });
  await page.goBack();
  await expect(page).not.toHaveURL(/\/todos\?view=pending#unread$/);

  // Direct task and instance URLs carry their dynamic parameter and deep-link
  // context to the independent mobile renderer at the narrow width.
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto(
    workflowFixtureUrl(`/tasks/${taskId}?from=todo#approval`),
  );
  await expect(page.locator('.oxa-record-detail-mobile')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/m/tasks/${taskId}\\?from=todo#approval$`),
  );

  await page.goto(
    workflowFixtureUrl(`/workflows/${instanceId}?from=todo#timeline`),
  );
  await expect(page.locator('.oxa-record-detail-mobile')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/m/workflows/${instanceId}\\?from=todo#timeline$`),
  );
});

test('negotiates launch pairs in both directions and preserves the mount basename', async ({
  page,
}) => {
  await mockWorkflow(page);
  const base = '/runtime/route-negotiation';
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto(
    workflowFixtureUrl(
      `${base}/workflows/purchase-approval/start?source=todo#launch`,
      { base },
    ),
  );
  await expect(page.locator('.oxa-workflow-submission-mobile')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(
      `${base}/m/workflows/purchase-approval/start\\?source=todo#launch$`,
    ),
  );

  await page.setViewportSize({ width: 1_440, height: 900 });
  await expect(page.locator('.oxa-workflow-entry')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(
      `${base}/workflows/purchase-approval/start\\?source=todo#launch$`,
    ),
  );
});

test('does not negotiate non-standard application contribution routes', async ({
  page,
}) => {
  await mockWorkflow(page);
  const base = '/runtime/route-negotiation';
  await page.setViewportSize({ width: 360, height: 844 });
  const customPath = `${base}/admin/operations/purchases/${instanceId}?taskId=${taskId}`;
  await page.goto(workflowFixtureUrl(customPath, { base }));
  await expect(page.getByTestId('custom-workflow-detail')).toContainText(
    `${instanceId} / ${taskId}`,
  );
  const customUrl = page.url();
  await expect(page).toHaveURL(new RegExp(`${base}/admin/operations/`));
  await expect
    .poll(() => page.url(), { timeout: 1_000 })
    .toBe(customUrl);
});
