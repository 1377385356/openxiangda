import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import {
  DesktopWorkflowDetailRenderer,
  MobileWorkflowDetailRenderer,
  WorkflowStatusIcon,
  WorkflowTimelineSection,
} from '../src/react';

const surface = {
  instanceSequence: 9,
  commandToken: 'x'.repeat(43),
  commandTokenExpiresAt: '2099-09-02T00:00:00.000Z',
  instance: {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'running',
  },
  task: {
    id: 'fixture-task-internal-id',
    status: 'assigned',
  },
  presentation: {
    businessData: {
      status: 'none', resourceCode: null, recordId: null,
      requestedRevision: null, sourceRevision: null, fields: {},
      projectionDigest: null,
    },
    businessDetail: {
      status: 'ready',
      resourceCode: 'applications',
      resourceName: '申请',
      recordId: '33333333-3333-4333-8333-333333333333',
      requestedRevision: 1,
      sourceRevision: 1,
      surface: {
        mutationOwner: 'workflow',
        fields: {
          title: {
            label: '申请标题', type: 'text.short', widget: 'text',
            section: '申请信息', readCapabilities: [],
            createCapabilities: [], updateCapabilities: [],
          },
          internalVenue: {
            label: 'demo fixture internal marker', type: 'reference', widget: 'reference',
            section: '系统信息', system: true, readCapabilities: [],
            createCapabilities: [], updateCapabilities: [],
          },
        },
        detail: { layout: 'sections', fieldOrder: ['title', 'internalVenue'] },
      },
      record: {
        title: '合同用印申请',
        internalVenue: '44444444-4444-4444-8444-444444444444',
      },
      subtables: {},
      projectionDigest: 'a'.repeat(64),
    },
    summary: {
      title: '合同用印申请',
      initiatorDisplayName: '陈予安',
      departmentDisplayName: '商务运营部',
      submittedAt: '2026-09-02T01:36:00.000Z',
      businessNumber: 'WF202609020048',
    },
  },
  operations: [],
} as any;

const timeline = {
  engineVersion: '2.0',
  instanceId: surface.instance.id,
  flow: [
    {
      key: 'submit', nodeId: null, kind: 'start', title: '提交申请',
      status: 'completed', startedAt: '2026-09-02T01:36:00.000Z',
      completedAt: '2026-09-02T01:36:00.000Z',
      assignees: [{ userId: '__ox_ai_test__:demo:fixture', displayName: '陈予安' }],
      operations: [],
    },
    {
      key: 'review', nodeId: 'review', kind: 'approval', title: '部门负责人',
      status: 'completed', startedAt: '2026-09-02T01:40:00.000Z',
      completedAt: '2026-09-02T02:05:00.000Z',
      assignees: [{
        userId: '99999999-9999-4999-8999-999999999999', displayName: '李清', outcome: 'approved',
        comment: '同意申请。', completedAt: '2026-09-02T02:05:00.000Z',
      }],
      operations: [{
        id: 'operation-1', operation: 'approve', operationLabel: '同意',
        actorUserId: '99999999-9999-4999-8999-999999999999', actorDisplayName: '李清', actingForUserId: null,
        reason: '同意申请。', detail: {}, severity: 'normal',
        createdAt: '2026-09-02T02:05:00.000Z',
      }],
    },
  ],
  items: [{
    id: 'operation-1', operation: 'approve', operationLabel: '同意',
    actorUserId: '99999999-9999-4999-8999-999999999999', actorDisplayName: '李清', actingForUserId: null,
    reason: '同意申请。', detail: {}, severity: 'normal',
    createdAt: '2026-09-02T02:05:00.000Z',
  }],
  display: {
    entries: [
      {
        key: 'submit', kind: 'submission', nodeId: null, nodeKind: 'start',
        title: '提交申请', status: 'completed',
        enteredAt: '2026-09-02T01:36:00.000Z',
        leftAt: '2026-09-02T01:36:00.000Z',
        primaryDisplayTime: '2026-09-02T01:36:00.000Z',
        people: [{
          userId: '__ox_ai_test__:demo:fixture', displayName: '陈予安', avatarUrl: null,
          departmentDisplayName: '商务运营部',
        }],
        operations: [], result: {}, terminalReason: null,
      },
      {
        key: 'review', kind: 'node', nodeId: 'review', nodeKind: 'approval',
        title: '部门负责人', status: 'completed',
        enteredAt: '2026-09-02T01:40:00.000Z',
        leftAt: '2026-09-02T02:05:00.000Z',
        primaryDisplayTime: '2026-09-02T02:05:00.000Z',
        people: [{
          userId: '__ox_ai_test__:club-admin-round79',
          displayName: 'OpenXiangda 测试账号 club-admin-round79',
          avatarUrl: null,
          departmentDisplayName: null,
        }],
        operations: [{
          id: 'operation-1', operation: 'approve', operationLabel: '同意',
          actor: {
            userId: '99999999-9999-4999-8999-999999999999', displayName: '李清', avatarUrl: null,
            departmentDisplayName: null,
          },
          actingForUserId: null, reason: '同意申请。', severity: 'normal',
          occurredAt: '2026-09-02T02:05:00.000Z',
        }],
        result: {}, terminalReason: null,
      },
      {
        key: 'final-review', kind: 'node', nodeId: 'final-review', nodeKind: 'approval',
        title: '分管负责人', status: 'active',
        enteredAt: '2026-09-02T02:06:00.000Z', leftAt: null,
        primaryDisplayTime: '2026-09-02T02:10:00.000Z',
        people: [
          {
            userId: 'transferring-reviewer', displayName: '王岚', avatarUrl: null,
            departmentDisplayName: null,
          },
          {
            userId: 'pending-reviewer', displayName: '周宁', avatarUrl: null,
            departmentDisplayName: '综合办公室',
          },
        ],
        operations: [{
          id: 'operation-2', operation: 'transfer', operationLabel: '转交',
          actor: {
            userId: 'transferring-reviewer', displayName: '王岚', avatarUrl: null,
            departmentDisplayName: null,
          },
          actingForUserId: null, reason: '请周宁继续办理。', severity: 'normal',
          occurredAt: '2026-09-02T02:10:00.000Z',
        }],
        result: {}, terminalReason: null,
      },
    ],
  },
} as any;

function render(
  renderer: typeof DesktopWorkflowDetailRenderer,
  renderSurface = surface,
  renderTimeline = timeline,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/'] },
      createElement(
        App,
        null,
        createElement(renderer, {
          surface: renderSurface,
          timeline: renderTimeline,
          warning: '',
          operations: null,
        }),
      ),
    ),
  );
}

test('workflow subtable detail keeps selected business values and hides structural fields on both devices', () => {
  const detailSurface = structuredClone(surface);
  const detail = detailSurface.presentation.businessDetail;
  const field = (label: string, extra = {}) => ({
    label, type: 'text.short', widget: 'text',
    readCapabilities: [], createCapabilities: [], updateCapabilities: [], ...extra,
  });
  detail.surface.fields.lines = field('申请明细', {
    type: 'subtable', widget: 'subtable',
    subtable: { resourceCode: 'application-lines', foreignKey: 'parent', orderField: 'position' },
  });
  detail.surface.detail.fieldOrder.push('lines');
  detail.subtables.lines = {
    resourceCode: 'application-lines',
    total: 1,
    surface: {
      fields: {
        parent: field('内部所属申请'), position: field('内部行序号'),
        name: field('同行人姓名'), phone: field('手填手机号码'),
        hidden: field('隐藏字段', { hidden: true }),
        system: field('系统字段', { system: true }),
        unselected: field('未选字段'),
        nested: field('嵌套子表', { type: 'subtable', widget: 'subtable' }),
      },
      detail: { fieldOrder: ['parent', 'position', 'phone', 'name', 'hidden', 'system', 'nested'] },
    },
    rows: [{
      id: 'line-1', parent: 'internal-parent-uuid', position: 27,
      name: '同行示例', phone: '13900139000', hidden: 'hidden-value',
      system: 'system-value', unselected: 'unselected-value', nested: [],
    }],
  };
  for (const renderer of [DesktopWorkflowDetailRenderer, MobileWorkflowDetailRenderer]) {
    const markup = render(renderer, detailSurface);
    for (const value of ['手填手机号码', '13900139000', '同行人姓名', '同行示例'])
      assert.ok(markup.includes(value), value);
    assert.ok(markup.indexOf('手填手机号码') < markup.indexOf('同行人姓名'));
    assert.doesNotMatch(markup, /内部所属申请|内部行序号|internal-parent-uuid|隐藏字段|hidden-value|系统字段|system-value|未选字段|unselected-value|嵌套子表/);
  }
});

test('desktop and mobile share the detail frame and keep approval history in its own tab', () => {
  const desktop = render(DesktopWorkflowDetailRenderer);
  const mobile = render(MobileWorkflowDetailRenderer);
  assert.match(desktop, /oxa-record-detail-desktop/);
  assert.match(mobile, /oxa-record-detail-mobile/);
  const history = renderToStaticMarkup(createElement(App, null, createElement(WorkflowTimelineSection, { timeline })));
  for (const pattern of [/oxa-workflow-operation-opinion/, />意见</, /ant-avatar/, /default-avatar\.png/]) assert.match(history, pattern);
  for (const pattern of [/同意申请。/g, /王岚/g, />周宁</g, /请周宁继续办理。/g]) assert.equal((history.match(pattern) || []).length, 1);
  const localCompletionTime = new Date('2026-09-02T02:05:00.000Z').toLocaleString('zh-CN');
  assert.equal(history.split(localCompletionTime).length - 1, 1);
  for (const markup of [desktop, mobile]) {
    assert.match(markup, /合同用印申请/);
    assert.match(markup, /商务运营部/);
    assert.match(markup, /申请标题/);
    assert.match(markup, /申请内容/);
    assert.match(markup, /审批历史/);
    assert.match(markup, /变更记录/);
    assert.doesNotMatch(markup, /oxa-workflow-operation-opinion/);
    assert.doesNotMatch(markup, /技术场地引用|系统信息/);
    assert.doesNotMatch(markup, /demo fixture internal marker/);
    assert.doesNotMatch(markup, /44444444-4444-4444-8444-444444444444/);
    assert.doesNotMatch(markup, /fixture-task-internal-id|__ox_ai_test__/);
    assert.doesNotMatch(markup, /OpenXiangda 测试账号 club-admin-round79/);
    assert.doesNotMatch(markup, /99999999-9999-4999-8999-999999999999/);
    assert.doesNotMatch(markup, /业务详情暂时不可用/);
    assert.doesNotMatch(markup, /业务数据已变化/);
    assert.doesNotMatch(markup, /流程信息|操作记录|事件序列|记录版本/);
    assert.doesNotMatch(markup, /11111111-1111-4111-8111-111111111111/);
    assert.doesNotMatch(markup, /请输入拒绝原因/);
    assert.match(markup, /aria-label="返回"/);
  }
});

function waitingTimeline(assignees: Array<{ userId: string; displayName: string; status?: string; outcome?: string }>) {
  const current = timeline.display.entries.at(-1);
  return {
    ...timeline,
    flow: [...timeline.flow, {
      key: current.key, nodeId: current.nodeId, kind: 'approval', title: current.title,
      status: 'active', startedAt: current.enteredAt, completedAt: null, assignees, operations: [],
    }],
    display: { entries: [...timeline.display.entries.slice(0, -1), {
      ...current,
      people: assignees.map(person => ({ ...person, avatarUrl: null, departmentDisplayName: null })),
    }] },
  };
}

for (const [device, renderer] of [['desktop', DesktopWorkflowDetailRenderer], ['mobile', MobileWorkflowDetailRenderer]] as const) {
  test(`${device} all approval waits only for the remaining seat after an initiator automatic vote`, () => {
    const current = waitingTimeline([
      { userId: 'initiator', displayName: '申请人', status: 'approved', outcome: 'approved' },
      { userId: 'remaining', displayName: '周宁', status: 'active' },
    ]);
    const markup = render(renderer, surface, current);
    assert.match(markup, /当前节点：分管负责人/);
    assert.match(markup, /等待周宁处理/);
    assert.doesNotMatch(markup, /等待申请人/);
    const history = renderToStaticMarkup(createElement(App, null, createElement(WorkflowTimelineSection, { timeline: current })));
    assert.match(history, /申请人/);
    assert.match(history, /周宁/);
  });

  test(`${device} sequence approval excludes later pending and completed seats from current waiting`, () => {
    const current = waitingTimeline([
      { userId: 'first', displayName: '王岚', status: 'approved', outcome: 'approved' },
      { userId: 'current', displayName: '周宁', status: 'active' },
      { userId: 'later', displayName: '陈明', status: 'pending' },
    ]);
    const markup = render(renderer, surface, current);
    assert.match(markup, /等待周宁处理/);
    assert.doesNotMatch(markup, /等待王岚|等待[^<]*陈明/);
  });

  test(`${device} transfer and add-sign waiting uses the effective seats`, () => {
    const current = waitingTimeline([
      { userId: 'old', displayName: '王岚', status: 'cancelled', outcome: 'transferred' },
      { userId: 'transferred', displayName: '周宁', status: 'active' },
      { userId: 'add-sign', displayName: '陈明', status: 'active' },
      { userId: 'rejected', displayName: '李清', status: 'rejected', outcome: 'rejected' },
    ]);
    const markup = render(renderer, surface, current);
    assert.match(markup, /等待周宁、陈明处理/);
    assert.doesNotMatch(markup, /等待[^<]*王岚|等待[^<]*李清/);
  });

  test(`${device} repeated node ids do not mix the current visit with its historical seats`, () => {
    const current = waitingTimeline([{ userId: 'current', displayName: '周宁', status: 'active' }]);
    const currentFlow = current.flow.at(-1);
    current.flow.unshift({ ...currentFlow, key: 'old-visit', status: 'completed',
      assignees: [{ userId: 'old', displayName: '王岚', status: 'approved' }] });
    const markup = render(renderer, surface, current);
    assert.match(markup, /等待周宁处理/);
    assert.doesNotMatch(markup, /等待王岚/);
  });

  test(`${device} missing current seat status or visit does not guess a waiting list`, () => {
    const current = waitingTimeline([{ userId: 'unknown', displayName: '王岚' }]);
    for (const value of [current, { ...current, flow: timeline.flow }]) {
      const markup = render(renderer, surface, value);
      assert.match(markup, /当前节点：分管负责人/);
      assert.doesNotMatch(markup, /等待[^<]*处理/);
    }
  });

  test(`${device} terminal details never display current waiting seats`, () => {
    const current = waitingTimeline([{ userId: 'remaining', displayName: '周宁', status: 'active' }]);
    const markup = render(renderer, { ...surface, instance: { ...surface.instance, status: 'approved' } }, current);
    assert.doesNotMatch(markup, /当前节点：|等待[^<]*处理/);
  });
}

test('older workflow details use only the platform-resolved business record target', () => {
  const legacySurface = {
    ...surface,
    navigationTarget: {
      kind: 'resource_record',
      appCode: 'demo',
      environmentKey: 'preproduction',
      resourceCode: 'applications',
      recordId: '33333333-3333-4333-8333-333333333333',
      desktopPath: '/admin/resources/applications/33333333-3333-4333-8333-333333333333',
      mobilePath: '/m/admin/resources/applications/33333333-3333-4333-8333-333333333333',
    },
    presentation: {
      ...surface.presentation,
      businessDetail: {
        status: 'unavailable',
        resourceCode: null,
        resourceName: null,
        recordId: null,
        requestedRevision: null,
        sourceRevision: null,
        surface: null,
        record: {},
        subtables: {},
        projectionDigest: null,
        errorCode: 'WORKFLOW_V2_SUBJECT_DATA_BINDING_REQUIRED',
      },
    },
  } as any;

  const desktop = render(DesktopWorkflowDetailRenderer, legacySurface);
  const mobile = render(MobileWorkflowDetailRenderer, legacySurface);
  for (const markup of [desktop, mobile]) {
    assert.match(markup, /业务详情可在原始记录中查看/);
    assert.match(markup, /查看业务详情/);
    assert.doesNotMatch(markup, /WORKFLOW_V2_SUBJECT_DATA_BINDING_REQUIRED/);
    assert.doesNotMatch(markup, /业务详情暂时不可用/);
  }
  assert.match(desktop, /href="\/admin\/resources\/applications\/33333333-3333-4333-8333-333333333333"/);
  assert.doesNotMatch(desktop, /href="\/m\/admin\/resources/);
  assert.match(mobile, /href="\/m\/admin\/resources\/applications\/33333333-3333-4333-8333-333333333333"/);
  assert.doesNotMatch(mobile, /href="\/admin\/resources/);

  const withoutTarget = {
    ...legacySurface,
    navigationTarget: null,
  } as any;
  const unavailable = render(DesktopWorkflowDetailRenderer, withoutTarget);
  assert.match(unavailable, /业务详情暂时不可用/);
  assert.doesNotMatch(unavailable, /查看业务详情/);

  for (const status of ['missing', 'forbidden']) {
    const deniedSurface = {
      ...legacySurface,
      presentation: {
        ...legacySurface.presentation,
        businessDetail: {
          ...legacySurface.presentation.businessDetail,
          status,
        },
      },
    } as any;
    assert.doesNotMatch(
      render(DesktopWorkflowDetailRenderer, deniedSurface),
      /查看业务详情/,
    );
  }
});

test('standard detail source keeps vertical timeline, deferred opinion and descriptor hierarchy', () => {
  const source = readFileSync(
    new URL('../src/browser/components/workflow/StandardWorkflowPages.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /function WorkflowTimelineSection/);
  assert.match(source, /className="oxa-workflow-timeline"/);
  assert.match(source, /function OperationDialog/);
  assert.match(source, /operation\.emphasis/);
  assert.match(source, /operation\.placement === 'primary'/);
  assert.match(source, /内容已更新，请刷新后重试/);
  assert.match(source, /loadWorkflowTaskDetail/);
  assert.match(source, /executeWorkflowOperation/);
  assert.doesNotMatch(source, /oxa-workflow-desktop-appbar/);
  assert.doesNotMatch(source, /oxa-workflow-mobile-appbar/);
  assert.doesNotMatch(source, /surfaceBusinessDetail\(surface\)\.status === 'stale'/);
  assert.doesNotMatch(source, /WorkflowTechnicalInformation/);
  assert.doesNotMatch(source, /oxa-workflow-operation-history/);
  assert.doesNotMatch(source, /instance\.businessKey[}\s<]/);
  assert.doesNotMatch(source, /序列 \{renderSurface\.instanceSequence\}/);
});

test('workflow status icons preserve the standard per-state visual language', () => {
  const renderStatus = (
    status: Parameters<typeof WorkflowStatusIcon>[0]['status'],
  ) =>
    renderToStaticMarkup(createElement(WorkflowStatusIcon, { status }));
  const icons = Object.fromEntries(
    [
      'completed',
      'active',
      'waiting',
      'rejected',
      'error',
      'withdrawn',
      'returned',
      'terminated',
      'cancelled',
    ].map((status) => [status, renderStatus(status)]),
  );

  assert.match(icons.completed, /is-completed/);
  assert.match(icons.completed, /oxa-workflow-status-icon-contrast/);
  assert.match(icons.completed, /M7\.5 12\.5l3 3 6-7/);

  assert.match(icons.active, /is-active/);
  assert.match(icons.active, /oxa-workflow-status-icon-center/);
  assert.doesNotMatch(icons.active, /<path/);

  assert.match(icons.waiting, /is-waiting/);
  assert.equal((icons.waiting.match(/<circle/g) || []).length, 1);
  assert.doesNotMatch(icons.waiting, /<path|status-icon-center/);

  for (const status of ['rejected', 'error']) {
    assert.match(icons[status], /oxa-workflow-status-icon-contrast/);
    assert.match(icons[status], /M8 8l8 8M16 8l-8 8/);
  }
  for (const status of ['withdrawn', 'returned']) {
    assert.match(icons[status], /M9 7H5V3/);
    assert.match(icons[status], /M5 7a8 8 0 1 1-1 8/);
    assert.doesNotMatch(icons[status], /<circle/);
  }
  for (const status of ['terminated', 'cancelled']) {
    assert.match(icons[status], /oxa-workflow-status-icon-contrast/);
    assert.match(icons[status], /M8 12h8/);
  }

  const styles = readFileSync(
    new URL('../src/browser/styles.css', import.meta.url),
    'utf8',
  );
  assert.match(styles, /\.is-withdrawn \.oxa-workflow-timeline-dot[\s\S]*color: var\(--ant-color-warning\)/);
  assert.match(styles, /\.is-terminated \.oxa-workflow-timeline-dot[\s\S]*color: var\(--ant-color-error-active/);
  assert.doesNotMatch(
    styles,
    /\.is-withdrawn \.oxa-workflow-timeline-dot[\s\S]{0,100}color: var\(--ant-color-error\)/,
  );
});
