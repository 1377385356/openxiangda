import { namedLaunchIntent, namedLaunchContext } from './named-launch-fixture-data';
import { expect, test, type Page } from '@playwright/test';
import { mockPlatform, runtimeAuthorization } from './resource-platform-mock';

const appCode = 'openxiangda-application';
const resourceCode = 'purchase-orders';
const commandId = '55555555-5555-4555-8555-555555555555';
const instanceId = '22222222-2222-4222-8222-222222222222';
const workflowBase = `/openxiangda-api/v2/applications/${appCode}/workflow`;
const processBase = `/openxiangda-api/v2/applications/${appCode}/business-process`;
const capability = `app:${appCode}:data:${resourceCode}:read`;
const fieldCapabilities = { readCapabilities: [capability], createCapabilities: [], updateCapabilities: [] };
const correctionFields = {
  title: { label: '申请名称', type: 'text.short', widget: 'text', requiredHint: true, ...fieldCapabilities },
  amount: { label: '申请金额', type: 'number.decimal', widget: 'money', requiredHint: true, ...fieldCapabilities },
};

async function workflowEntryPlatform(page: Page) {
  await mockPlatform(page, false, undefined, true);
  const state = {
    named: false, sourceFailure: 0, sourceQueries: [] as any[], admin: true, instanceStatus: 'approved',
    record: { id: 'record-1', revision: 8, title: '原业务申请', amount: 28600, decision: '已同意', internalNote: '不得显示', systemValue: '内部标识', attachments: [], richText: '<p>原说明</p>' },
    complexFields: false, uploads: [] as any[], childQueries: [] as any[], auditReads: 0,
    children: [
      { id: 'line-1', revision: 3, purchaseId: 'record-1', sortOrder: 0, name: '原明细甲', quantity: 2, hiddenNote: '不得显示的明细值', detailNote: '保留详情说明' },
      { id: 'line-2', revision: 4, purchaseId: 'record-1', sortOrder: 1, name: '原明细乙', quantity: 3, hiddenNote: '不得显示的明细值', detailNote: '第二项说明' },
    ],
    correctionReads: 0, correctionWrites: [] as any[], correctionEffects: 0,
    correctionReadFailure: false, wrongSurfaceScope: false, forbiddenEditable: false,
    loseCorrectionResponse: false, loseLaunchResponse: false,
    launches: [] as any[], launchEffects: 0, statusReads: 0, failStatusOnce: false, statusFailureCode: 500,
    processStatus: 'started' as 'accepted' | 'started' | 'awaiting_input',
    statusReadGate: null as Promise<void> | null,
    answers: [] as any[], nativeWrites: [] as string[],
    corrections: new Map<string, unknown>(), commands: new Map<string, unknown>(),
  };
  const file = { schemaVersion: 'openxiangda.data-file-ref/v2', id: 'file-1', name: '申请说明.txt', size: 6, contentType: 'text/plain' };
  await page.route('**/fixture-file-upload', route => route.fulfill({ status: 200, body: '' }));
  function command(status = state.processStatus) {
    return {
      schemaVersion: 'openxiangda.business-process.command/v2', id: commandId, appCode,
      environmentKey: 'preproduction', operationCode: 'openxiangda.workflow.purchase-approval.submit',
      idempotencyKey: 'fixture-command-key', workflowCode: 'purchase-approval', status,
      revision: status === 'started' ? 4 : 1,
      subject: { resourceCode, id: state.record.id, dataRevision: state.record.revision, factDigest: 'a'.repeat(64) },
      definitionVersion: 1, bindingVersion: 1, requirements: [], answers: {}, preview: {},
      workflowInstanceId: status === 'started' ? instanceId : null, attemptCount: 1, lastError: null,
      replayed: false, createdAt: '2026-09-06T01:00:00.000Z', updatedAt: '2026-09-06T01:00:01.000Z',
    };
  }
  await page.route('**/service/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { code: 200, data } });
    const fail = (status: number, message: string) => route.fulfill({ status, json: { code: status, message } });
    if (path.endsWith('/native/authz/current')) {
      const authorization = runtimeAuthorization(false, state.admin);
      authorization.principal.capabilityCodes = [capability, ...(state.named ? [namedLaunchIntent.requiredCapability] : [])];
      return ok(authorization);
    }
    if (path.endsWith(`/native/data-resources/${resourceCode}/fields/customer/source/query`)) {
      state.sourceQueries.push(request.postDataJSON());
      if (state.sourceFailure) return fail(state.sourceFailure, 'OPENXIANGDA_INTERNAL_FAILURE: requestId=private');
      return ok({ schemaVersion: 'openxiangda.data-field-source-page/v2', items: [
        { label: '授权单位甲', value: '77777777-7777-4777-8777-777777777777', resourceCode: 'customers' },
      ], nextCursor: null });
    }
    if (path.endsWith('/auth/surface')) return ok({ csrfToken: 'workflow-entry-csrf' });
    if (path.includes('/native/admin-list/preferences/')) return ok(null);
    if (path.endsWith(`/workflow/records/${resourceCode}/${state.record.id}/detail`)) {
      const childFields = { name: { label: '品名', type: 'text.short', widget: 'text', ...fieldCapabilities }, quantity: { label: '数量', type: 'number.integer', widget: 'number', ...fieldCapabilities }, detailNote: { label: '仅详情说明', type: 'text.short', widget: 'text', ...fieldCapabilities } };
      const fields = { ...correctionFields, decision: { label: '审批结论', type: 'text.short', widget: 'readonly', ...fieldCapabilities }, ...(state.complexFields ? { items: { label: '采购明细', type: 'subtable', widget: 'subtable', subtable: { resourceCode: 'purchase-lines', foreignKey: 'purchaseId', orderField: 'sortOrder', maxRows: 20 }, ...fieldCapabilities } } : {}) };
      const instance = { id: instanceId, appCode, environmentKey: 'preproduction', status: state.instanceStatus, outcome: state.instanceStatus === 'approved' ? 'approved' : null, startedAt: '2026-09-06T01:00:00Z', completedAt: state.instanceStatus === 'approved' ? '2026-09-06T02:38:00Z' : null, dataRef: { resourceCode, recordId: state.record.id } };
      const surface = { schemaVersion: 'openxiangda.workflow-surface/v2', protocolVersion: 'workflow_surface_v2', engineVersion: '2.0', surfaceRevision: 'a'.repeat(64), instanceSequence: 4, instance, task: null, operations: [],
        detailNavigation: { desktopPath: `/admin/purchases/${state.record.id}`, mobilePath: `/m/admin/purchases/${state.record.id}`, custom: false },
        presentation: { summary: { title: '采购申请', initiatorDisplayName: '陈晨', departmentDisplayName: '办公室', submittedAt: instance.startedAt }, businessDetail: {
          status: 'ready', resourceCode, resourceName: '采购申请', recordId: state.record.id, requestedRevision: state.record.revision, sourceRevision: state.record.revision,
          surface: { mutationOwner: 'workflow', fields, detail: { layout: 'sections', fieldOrder: Object.keys(fields) } }, record: state.record,
          subtables: state.complexFields ? { items: { resourceCode: 'purchase-lines', surface: { fields: childFields, detail: { fieldOrder: Object.keys(childFields) } }, rows: state.children, total: state.children.length } } : {}, projectionDigest: 'c'.repeat(64),
        } },
      };
      const timeline = { engineVersion: '2.0', instanceId, instanceSequence: 4, timelineRevision: 'b'.repeat(64), flow: { nodes: [], edges: [] }, items: [], display: { entries: [] } };
      return ok({ schemaVersion: 'openxiangda.workflow-detail-surface/v2', protocolVersion: 'workflow_detail_surface_v2', detailRevision: 'd'.repeat(64), instanceSequence: 4, timelineRevision: timeline.timelineRevision, surface, timeline,
        currentStatus: { code: 'approved', label: '已同意', tone: 'success' }, nodes: [], handlingRecords: [], operations: [], navigationContext: { desktopReturnPath: '/admin/purchases', mobileReturnPath: '/m/admin/purchases' } });
    }
    if (path.endsWith(`/workflow/instances/${instanceId}/data-audit`)) {
      if (request.headers()['x-openxiangda-csrf-token'] !== 'workflow-entry-csrf') return fail(403, 'WORKFLOW_V2_CSRF_INVALID');
      state.auditReads += 1;
      return ok({ schemaVersion: 'openxiangda.data-audit-page/v2', items: [], total: 0, offset: 0, limit: 50 });
    }
    if (path.endsWith('/native/data/purchase-lines/query')) {
      state.childQueries.push(request.postDataJSON());
      return ok({ schemaVersion: 'openxiangda.data-page/v2', resourceCode: 'purchase-lines', items: state.children, total: state.children.length, offset: 0, limit: 20 });
    }
    if (path.endsWith(`/native/data/${resourceCode}/query`)) {
      return ok({ schemaVersion: 'openxiangda.data-page/v2', resourceCode, items: [state.record], total: 1, offset: 0, limit: 20 });
    }
    if (path.includes(`/native/data/${resourceCode}/records/`) && request.method() === 'GET') {
      return ok({ schemaVersion: 'openxiangda.data-record/v2', data: state.record });
    }
    if (path.endsWith(`/native/data/${resourceCode}/files/uploads/initiate`)) {
      state.uploads.push(request.postDataJSON());
      return ok({ schemaVersion: 'openxiangda.data-file-upload-plan/v2', resourceCode, fieldCode: 'attachments', file, uploadMethod: 'PUT', uploadUrl: new URL('/fixture-file-upload', request.url()).href, headers: {}, expiresAt: '2099-01-01T00:00:00.000Z' });
    }
    if (path.endsWith(`/native/data/${resourceCode}/files/file-1/complete`)) return ok(file);
    if (path.includes(`/native/data/${resourceCode}/`) && request.method() !== 'GET') {
      state.nativeWrites.push(path);
      return fail(403, '流程记录不允许普通 CRUD 写入');
    }
    if (path.endsWith('/correction-surface')) {
      state.correctionReads += 1;
      if (!state.admin) return fail(403, '当前用户无权编辑数据');
      if (state.correctionReadFailure) return fail(500, '暂时无法读取编辑表单');
      const fields = state.complexFields ? {
        ...correctionFields,
        attachments: { label: '申请附件', type: 'file', widget: 'attachment', maxCount: 3, ...fieldCapabilities },
        richText: { label: '申请说明', type: 'text.rich', widget: 'rich-text', ...fieldCapabilities },
        items: { label: '采购明细', type: 'subtable', widget: 'subtable', subtable: { resourceCode: 'purchase-lines', foreignKey: 'purchaseId', orderField: 'sortOrder', maxRows: 20 }, ...fieldCapabilities },
      } : correctionFields;
      return ok({
        schemaVersion: 'openxiangda.workflow-record-correction-surface/v2', appCode, resourceCode,
        recordId: state.record.id, environmentKey: state.wrongSurfaceScope ? 'production' : 'preproduction',
        record: state.record, expectedRevision: state.record.revision, preservesApprovalResult: true,
        editableFields: state.forbiddenEditable ? ['title', 'amount', 'internalNote'] : Object.keys(fields),
        surface: {
          mutationOwner: 'workflow', fields,
          form: { layout: 'flat', fieldOrder: Object.keys(fields) },
        },
        command: { method: 'POST', href: `${workflowBase}/records/${resourceCode}/${state.record.id}/corrections` },
      });
    }
    if (path.endsWith('/corrections')) {
      const input = request.postDataJSON();
      state.correctionWrites.push(input);
      expect(request.headers()['x-openxiangda-csrf-token']).toBe('workflow-entry-csrf');
      if (!state.admin) return fail(403, '当前用户无权编辑数据');
      const stored = state.corrections.get(input.idempotencyKey);
      if (stored) return ok(stored);
      if (input.operations[0].expectedRevision !== state.record.revision) return fail(409, '数据已发生变化，请关闭后重新核对');
      for (const operation of input.operations.slice(1)) {
        expect(Object.keys(operation.data || {}).every(key => ['name', 'quantity', 'purchaseId', 'sortOrder'].includes(key))).toBe(true);
        const child = state.children.find(row => row.id === operation.id);
        if (operation.operation !== 'create' && (!child || child.revision !== operation.expectedRevision)) return fail(409, '明细已发生变化，请重新核对');
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      Object.assign(state.record, input.operations[0].data, { revision: state.record.revision + 1 });
      for (const operation of input.operations.slice(1)) {
        if (operation.operation === 'create') state.children.push({ id: `line-${state.children.length + 3}`, revision: 1, ...operation.data });
        else if (operation.operation === 'delete') state.children = state.children.filter(row => row.id !== operation.id);
        else {
          const child = state.children.find(row => row.id === operation.id)!;
          Object.assign(child, operation.data, { revision: child.revision + 1 });
        }
      }
      state.correctionEffects += 1;
      const result = {
        schemaVersion: 'openxiangda.workflow-record-correction-result/v2', preservesApprovalResult: true,
        transaction: { replayed: false, items: [{ id: state.record.id, revision: state.record.revision }] },
      };
      state.corrections.set(input.idempotencyKey, result);
      if (state.loseCorrectionResponse) { state.loseCorrectionResponse = false; return fail(500, '响应暂时不可用，请重试'); }
      return ok(result);
    }
    if (path.endsWith('/workflow/definitions/purchase-approval/launch-surface')) {
      const commit = { method: 'POST', href: `${processBase}/standard-commands`, idempotencyRequired: true };
      return ok({
        schemaVersion: 'openxiangda.workflow-launch-surface/v3', protocolVersion: 'workflow_launch_surface_v3',
        surfaceRevision: 'launch-revision', engineVersion: '2.0', appCode, environmentKey: 'preproduction',
        environmentId: 'preproduction-id', workflowCode: 'purchase-approval', title: '采购审批', launchMode: 'standalone',
        subject: { resourceCode, factProjection: { amount: 'amount' }, summaryFields: ['amount'] },
        inputSchema: { type: 'object', properties: {} },
        head: { workflowRevision: 4, definitionVersion: 1, bindingVersion: 1, nativeRevision: 3, contractRevisionId: 'contract-1' },
        paths: { desktop: '/workflows/purchase-approval/start', mobile: '/m/workflows/purchase-approval/start' },
        submission: state.named ? { kind: 'named-operation', create: { ...namedLaunchIntent, href: namedLaunchIntent.path }, context: namedLaunchContext } : { kind: 'standard-process', processOperationCode: 'openxiangda.workflow.purchase-approval.submit', commit },
      });
    }
    if (path.endsWith('/business-process/standard-commands')) {
      const input = request.postDataJSON();
      state.launches.push(input);
      const stored = state.commands.get(input.idempotencyKey);
      if (stored) return ok(stored);
      await new Promise(resolve => setTimeout(resolve, 300));
      Object.assign(state.record, input.mutation.data, { id: 'record-created', revision: 1, decision: '审批中' });
      state.launchEffects += 1;
      const result = command('accepted');
      state.commands.set(input.idempotencyKey, result);
      if (state.loseLaunchResponse) { state.loseLaunchResponse = false; return fail(500, '响应暂时不可用，请重试'); }
      return ok(result);
    }
    if (path.endsWith(`/business-process/commands/${commandId}/surface`)) {
      state.statusReads += 1;
      if (state.failStatusOnce) { state.failStatusOnce = false; return fail(state.statusFailureCode, '状态暂时不可用'); }
      if (state.statusReadGate) await state.statusReadGate;
      return ok({
        schemaVersion: 'openxiangda.process-command-surface/v2', surfaceRevision: 'b'.repeat(64), command: command(),
        subject: { resourceCode, recordId: state.record.id, dataRevision: state.record.revision, form: { kind: 'native-resource-form', resourceCode, recordId: state.record.id } },
        requirements: state.processStatus === 'awaiting_input' ? [{ id: 'department', kind: 'choose_department', title: '申请部门', required: true, candidates: [{ value: 'college', label: '理学院' }] }] : [],
        resume: {
          status: { method: 'GET', href: `${processBase}/commands/${commandId}` },
          surface: { method: 'GET', href: `${processBase}/commands/${commandId}/surface` },
          answer: state.processStatus === 'awaiting_input' ? { method: 'POST', href: `${processBase}/commands/${commandId}/answers`, expectedRevision: 1 } : null,
          retry: null,
        },
      });
    }
    if (path.endsWith(`/business-process/commands/${commandId}/answers`)) {
      state.answers.push(request.postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 300));
      state.processStatus = 'started';
      return ok(command());
    }
    return route.fallback();
  });
  return state;
}

async function openCorrection(page: Page, search = '') {
  await page.goto(`/workflow-entry.e2e.html${search}`);
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  const drawer = page.getByRole('dialog', { name: '编辑数据' });
  await expect(drawer.getByLabel('申请名称', { exact: true })).toHaveValue('原业务申请');
  await expect(drawer.getByLabel('申请金额', { exact: true })).toHaveValue('28600');
  return drawer;
}

test('ordinary workflow editing uses the shared form and opens readonly detail after one guarded save', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  const drawer = await openCorrection(page);
  await expect(drawer.locator('.ant-alert')).toHaveCount(0);
  await expect(drawer.getByText(/更正|审计|重新审批/)).toHaveCount(0);
  for (const label of ['隐藏字段', '系统字段', '审批结论', '审批附件']) await expect(drawer.getByLabel(label, { exact: true })).toHaveCount(0);
  await drawer.getByLabel('申请名称', { exact: true }).fill('已更正的业务申请');
  await drawer.getByRole('button', { name: '保存' }).dblclick();
  await expect(drawer.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
  const detail = page.getByRole('dialog', { name: '申请详情' });
  await expect(detail.getByRole('heading', { name: '已更正的业务申请', exact: true })).toBeVisible();
  await expect(detail.locator('input,textarea')).toHaveCount(0);
  await expect(detail.locator('.oxa-record-detail-hero').getByText('已同意', { exact: true })).toBeVisible();
  expect(state.correctionWrites).toHaveLength(1);
  expect(state.correctionWrites[0].operations[0]).toMatchObject({ expectedRevision: 8, data: { title: '已更正的业务申请', amount: 28600 } });
  expect(Object.keys(state.correctionWrites[0].operations[0].data).sort()).toEqual(['amount', 'title']);
  expect(state.correctionEffects).toBe(1);
  expect(state.nativeWrites).toEqual([]);
  expect(state.launches).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('workflow-correction-readonly-detail.png'), animations: 'disabled' });
});

test('an uncertain workflow edit preserves input and replays the original revision and idempotency key', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  state.loseCorrectionResponse = true;
  const drawer = await openCorrection(page);
  await drawer.getByLabel('申请名称', { exact: true }).fill('网络重试后保留的申请');
  await drawer.getByRole('button', { name: '保存' }).click();
  await expect(drawer.getByText('响应暂时不可用，请重试')).toBeVisible();
  await expect(drawer.getByLabel('申请名称', { exact: true })).toHaveValue('网络重试后保留的申请');
  await drawer.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('dialog', { name: '申请详情' }).getByRole('heading', { name: '网络重试后保留的申请', exact: true })).toBeVisible();
  expect(state.correctionWrites).toHaveLength(2);
  expect(state.correctionWrites[1]).toEqual(state.correctionWrites[0]);
  expect(state.correctionEffects).toBe(1);
  expect(state.launches).toEqual([]);
});

test('CAS conflicts retain the original form and revision without a hidden reload or reapproval', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  const drawer = await openCorrection(page);
  const initialReads = state.correctionReads;
  state.record.revision = 9;
  await drawer.getByLabel('申请名称', { exact: true }).fill('尚未覆盖并发修改');
  await drawer.getByRole('button', { name: '保存' }).click();
  await expect(drawer.getByText('数据已发生变化，请关闭后重新核对')).toBeVisible();
  await drawer.getByRole('button', { name: '保存' }).click();
  await expect.poll(() => state.correctionWrites.length).toBe(2);
  await expect(drawer.getByLabel('申请名称', { exact: true })).toHaveValue('尚未覆盖并发修改');
  expect(state.correctionWrites[1]).toEqual(state.correctionWrites[0]);
  expect(state.correctionWrites[1].operations[0].expectedRevision).toBe(8);
  expect(state.correctionReads).toBe(initialReads);
  expect(state.correctionEffects).toBe(0);
  expect(state.launches).toEqual([]);
});

test('revoked admin authority fails saving and hides editing when identity is reloaded', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  const drawer = await openCorrection(page);
  state.admin = false;
  await drawer.getByLabel('申请名称', { exact: true }).fill('撤权后不能保存');
  await drawer.getByRole('button', { name: '保存' }).click();
  await expect(drawer.getByText('当前用户无权编辑数据')).toBeVisible();
  await expect(drawer.getByLabel('申请名称', { exact: true })).toHaveValue('撤权后不能保存');
  await page.reload();
  await expect(page.getByRole('button', { name: '查看', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
  expect(state.correctionEffects).toBe(0);
});

test('record edit load retries and rejects a Surface for another environment or a hidden editable field', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  state.correctionReadFailure = true;
  await page.goto('/workflow-entry.e2e.html');
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  const drawer = page.getByRole('dialog', { name: '编辑数据' });
  await expect(drawer.getByText('暂时无法读取编辑表单')).toBeVisible();
  state.correctionReadFailure = false;
  state.wrongSurfaceScope = true;
  await drawer.getByRole('button', { name: '重试', exact: true }).click();
  await expect(drawer.getByText('OPENXIANGDA_WORKFLOW_CORRECTION_SURFACE_SCOPE_INVALID')).toBeVisible();
  state.wrongSurfaceScope = false;
  state.forbiddenEditable = true;
  await drawer.getByRole('button', { name: '重试', exact: true }).click();
  await expect(drawer.getByText('OPENXIANGDA_WORKFLOW_CORRECTION_FIELDS_INVALID')).toBeVisible();
  await expect(drawer.locator('input,textarea')).toHaveCount(0);
  state.forbiddenEditable = false;
  await drawer.getByRole('button', { name: '重试', exact: true }).click();
  await expect(drawer.getByLabel('申请名称', { exact: true })).toHaveValue('原业务申请');
  expect(state.correctionWrites).toEqual([]);
});

test('workflow launch retries one command, blocks close while processing and opens readonly record detail', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  state.admin = false;
  state.loseLaunchResponse = true;
  state.processStatus = 'accepted';
  await page.goto('/workflow-entry.e2e.html');
  await page.getByRole('button', { name: '新增流程申请' }).click();
  const drawer = page.getByRole('dialog', { name: '采购审批' });
  await expect(drawer.getByRole('link', { name: '新开页面' })).toHaveAttribute('href', '/workflows/purchase-approval/start');
  await drawer.getByLabel('申请名称', { exact: true }).fill('抽屉新增的申请');
  await drawer.getByLabel('申请金额', { exact: true }).fill('1200');
  for (const label of ['隐藏字段', '系统字段', '审批结论', '审批附件']) await expect(drawer.getByLabel(label, { exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: '提交审批' }).dblclick();
  await expect(drawer.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
  await expect(page.getByText('响应暂时不可用，请重试')).toBeVisible();
  await expect(drawer.getByLabel('申请名称', { exact: true })).toHaveValue('抽屉新增的申请');
  await drawer.getByRole('button', { name: '提交审批' }).click();
  await expect.poll(() => state.statusReads).toBeGreaterThan(0);
  await expect(drawer.getByRole('link', { name: '新开页面' })).toHaveAttribute('href', `/workflows/purchase-approval/start?processCommandId=${commandId}`);
  await expect(drawer.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
  state.processStatus = 'started';
  const detail = page.getByRole('dialog', { name: '申请详情' });
  await expect(detail.getByRole('heading', { name: '抽屉新增的申请', exact: true })).toBeVisible();
  await expect(detail.locator('input,textarea')).toHaveCount(0);
  expect(state.launches).toHaveLength(2);
  expect(state.launches[1]).toEqual(state.launches[0]);
  expect(state.launchEffects).toBe(1);
  expect(state.nativeWrites).toEqual([]);
  expect(state.correctionWrites).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('workflow-launch-readonly-detail.png'), animations: 'disabled' });
});

test('mobile launch completes once across parent renders and does not change the parent route', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workflow-entry.e2e.html?mode=mobile');
  const drawer = page.getByRole('dialog', { name: '采购审批' });
  await drawer.getByRole('textbox', { name: '申请名称', exact: true }).fill('移动流程申请');
  await drawer.getByRole('textbox', { name: '申请金额', exact: true }).fill('320');
  await page.screenshot({ path: testInfo.outputPath('workflow-launch-mobile.png'), animations: 'disabled' });
  await drawer.getByRole('button', { name: '提交审批' }).click();
  await expect(page.getByTestId('completions')).toHaveText('record-created');
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '重新渲染父页面' }).click();
  await expect(page.getByTestId('parent-render')).toHaveText('1');
  await expect(page.getByTestId('completions')).toHaveText('record-created');
  await expect(page.getByTestId('route')).toHaveText('/admin/purchases');
  expect(state.launchEffects).toBe(1);
  expect(state.nativeWrites).toEqual([]);
});

test('a transient command status read recovers automatically without another submission', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  state.failStatusOnce = true;
  let releaseStatus!: () => void;
  state.statusReadGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  await page.goto('/workflow-entry.e2e.html?mode=callback');
  const drawer = page.getByRole('dialog', { name: '采购审批' });
  await drawer.getByLabel('申请名称', { exact: true }).fill('状态重试申请');
  await drawer.getByLabel('申请金额', { exact: true }).fill('200');
  await drawer.getByRole('button', { name: '提交审批' }).click();
  try {
    await expect(drawer.getByText('暂时无法确认申请状态')).toBeVisible();
    await expect.poll(() => state.statusReads).toBeGreaterThanOrEqual(2);
    expect(state.launches).toHaveLength(1);
    await drawer.screenshot({ path: testInfo.outputPath('accepted-command-status-recovery.png') });
  } finally { releaseStatus(); }
  await expect(page.getByTestId('completions')).toHaveText('record-created');
  // A parent state update supplies a new callback while the drawer remains mounted.
  await page.getByRole('button', { name: '重新渲染父页面' }).evaluate(element => element.click());
  await expect(page.getByTestId('parent-render')).toHaveText('1');
  await expect(page.getByTestId('completions')).toHaveText('record-created');
  expect(state.launches).toHaveLength(1);
});

test('supplementary answers are guarded and resume completion without resubmitting approval', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  state.processStatus = 'awaiting_input';
  await page.goto('/workflow-entry.e2e.html?mode=callback');
  const drawer = page.getByRole('dialog', { name: '采购审批' });
  await drawer.getByLabel('申请名称', { exact: true }).fill('需要补充部门');
  await drawer.getByLabel('申请金额', { exact: true }).fill('800');
  await drawer.getByRole('button', { name: '提交审批' }).click();
  await drawer.getByRole('combobox', { name: '申请部门' }).click();
  await page.locator('.ant-select-dropdown').getByText('理学院', { exact: true }).click();
  await drawer.getByRole('button', { name: '提交补充信息' }).dblclick();
  await expect(page.getByTestId('completions')).toHaveText('record-created');
  expect(state.answers).toHaveLength(1);
  expect(state.answers[0]).toMatchObject({ expectedRevision: 1, answers: { department: 'college' } });
  expect(state.launches).toHaveLength(1);
});

test('workflow change history uses the acquired Surface CSRF token', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  await page.goto('/workflow-entry.e2e.html');
  await page.getByRole('button', { name: '查看', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '申请详情' });
  await detail.getByRole('tab', { name: '变更记录' }).click();
  await expect.poll(() => state.auditReads).toBeGreaterThan(0);
  await expect(detail.getByText('暂无变更记录', { exact: true })).toBeVisible();
  await expect(detail.getByText(/变更记录读取失败/)).toHaveCount(0);
});

test('detail switches to the ordinary full-width editor and back with only one dialog', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  await page.goto('/workflow-entry.e2e.html');
  await page.getByRole('button', { name: '查看', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '申请详情' });
  await expect(detail.getByRole('heading', { name: '原业务申请', exact: true })).toBeVisible();
  await expect(detail).toHaveCSS('width', '850px');
  await page.screenshot({ path: testInfo.outputPath('workflow-detail-drawer-850.png'), animations: 'disabled' });
  await detail.getByRole('button', { name: '全屏', exact: true }).click();
  await expect.poll(async () => Math.round((await detail.boundingBox())!.width)).toBe(page.viewportSize()!.width);
  await detail.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑数据' });
  await expect(editor.getByLabel('申请名称', { exact: true })).toHaveValue('原业务申请');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: /编辑申请|更正/ })).toHaveCount(0);
  await expect(editor.getByRole('button', { name: '退出全屏' })).toBeVisible();
  await expect.poll(async () => Math.round((await editor.boundingBox())!.width)).toBe(page.viewportSize()!.width);
  await editor.getByLabel('申请名称', { exact: true }).fill('直接编辑的数据');
  await page.screenshot({ path: testInfo.outputPath('workflow-ordinary-editor-fullscreen.png'), animations: 'disabled' });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(detail.getByRole('heading', { name: '直接编辑的数据', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(detail.getByRole('button', { name: '退出全屏' })).toBeVisible();
  expect(state.correctionWrites[0].operations[0].id).toBe('record-1');
  expect(state.launches).toEqual([]);
});

test('standalone record detail keeps the approved content width and cancels editing in place', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workflow-entry.e2e.html?mode=desktop-detail');
  const heading = page.getByRole('heading', { name: '原业务申请', exact: true });
  await expect(heading).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.oxa-record-detail-body > .oxa-record-detail-width')).toHaveCSS('width', '1056px');
  await expect(page.locator('.oxa-record-detail-hero h1')).toHaveCSS('font-size', '23px');
  await expect(page.getByRole('tab')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('workflow-detail-standalone-1056.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  await page.getByLabel('申请名称', { exact: true }).fill('取消的更改');
  await page.screenshot({ path: testInfo.outputPath('workflow-detail-standalone-inline-edit.png'), animations: 'disabled' });
  await page.getByRole('button', { name: /取\s*消/ }).click();
  await expect(heading).toBeVisible();
  expect(state.correctionWrites).toHaveLength(0);
  expect(state.launches).toHaveLength(0);
});

test('mobile detail edits on the current page and returns to the same readonly record', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workflow-entry.e2e.html?mode=mobile-detail');
  await expect(page.getByRole('heading', { name: '原业务申请', exact: true })).toBeVisible();
  await expect(page.locator('.oxa-record-detail-hero h1')).toHaveCSS('font-size', '20px');
  await page.screenshot({ path: testInfo.outputPath('workflow-detail-mobile-390.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const form = page.locator('.oxa-mobile-form');
  await expect(form.getByRole('textbox', { name: '申请名称', exact: true })).toHaveValue('原业务申请');
  await form.getByRole('textbox', { name: '申请名称', exact: true }).fill('移动页面直接修改');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('workflow-ordinary-editor-mobile.png'), animations: 'disabled' });
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: '移动页面直接修改', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.oxa-readonly-form input')).toHaveCount(0);
  expect(state.record.id).toBe('record-1');
  expect(state.launches).toEqual([]);
});

test('ordinary workflow editing reuses Native uploads, rich text and parent-child transaction plans', async ({ page }, testInfo) => {
  const state = await workflowEntryPlatform(page);
  state.complexFields = true;
  const editor = await openCorrection(page, '?fields=complex');
  const subtable = editor.locator('.oxa-subtable-field');
  await expect(subtable.getByLabel('品名', { exact: true }).first()).toHaveValue('原明细甲');
  await expect(subtable.getByText('仅详情说明', { exact: true })).toHaveCount(0);
  await expect(subtable.getByText('隐藏明细字段', { exact: true })).toHaveCount(0);
  await editor.locator('input[type="file"]').first().setInputFiles({ name: '申请说明.txt', mimeType: 'text/plain', buffer: Buffer.from('说明') });
  await expect(editor.getByText('申请说明.txt', { exact: true })).toBeVisible();
  await editor.getByRole('textbox', { name: '富文本内容' }).fill('直接修改富文本说明');
  await subtable.getByLabel('品名', { exact: true }).first().fill('');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByText('请完善子表单第 1 项')).toBeVisible();
  expect(state.correctionWrites).toHaveLength(0);
  await subtable.getByLabel('品名', { exact: true }).first().fill('修改后的明细甲');
  await subtable.getByRole('row').nth(2).getByRole('button', { name: '删除', exact: true }).click();
  await subtable.getByRole('button', { name: '新增一项' }).click();
  await subtable.getByLabel('品名', { exact: true }).nth(1).fill('新增明细丙');
  await subtable.getByLabel('数量', { exact: true }).nth(1).fill('5');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('workflow-ordinary-editor-attachments-subtable.png'), animations: 'disabled' });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '申请详情' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '申请详情' }).getByText('保留详情说明', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '申请详情' }).getByText('不得显示的明细值', { exact: true })).toHaveCount(0);
  expect(state.uploads).toMatchObject([{ fieldCode: 'attachments', recordId: 'record-1' }]);
  const operations = state.correctionWrites[0].operations;
  expect(operations[0]).toMatchObject({ operation: 'update', id: 'record-1', expectedRevision: 8, data: { attachments: [{ id: 'file-1' }] } });
  expect(operations[0].data.richText).toContain('直接修改富文本说明');
  expect(operations[0].data).not.toHaveProperty('items');
  expect(operations).toEqual(expect.arrayContaining([
    expect.objectContaining({ operation: 'delete', resourceCode: 'purchase-lines', id: 'line-2', expectedRevision: 4 }),
    expect.objectContaining({ operation: 'update', resourceCode: 'purchase-lines', id: 'line-1', expectedRevision: 3, data: { name: '修改后的明细甲' } }),
    expect.objectContaining({ operation: 'create', resourceCode: 'purchase-lines', data: { name: '新增明细丙', quantity: 5, purchaseId: 'record-1', sortOrder: 1 } }),
  ]));
  expect(state.correctionEffects).toBe(1);
  expect(state.record.decision).toBe('已同意');
  expect(state.launches).toEqual([]);
});

test('mobile child editing selects form fields while readonly details retain their own selected fields', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  state.complexFields = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workflow-entry.e2e.html?mode=mobile-detail&fields=complex');
  await expect(page.locator('.oxa-workflow-subtable-mobile')).toContainText('保留详情说明');
  await expect(page.getByLabel('隐藏明细字段', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  const form = page.locator('.oxa-mobile-form');
  const childName = form.getByRole('textbox', { name: '品名', exact: true }).first();
  await expect(childName).toHaveValue('原明细甲');
  await expect(form.getByLabel('仅详情说明', { exact: true })).toHaveCount(0);
  await expect(form.getByLabel('隐藏明细字段', { exact: true })).toHaveCount(0);
  await childName.fill('移动明细修改');
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.oxa-workflow-subtable-mobile')).toContainText('保留详情说明');
  await expect(page.locator('.oxa-workflow-subtable-mobile')).toContainText('移动明细修改');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.correctionWrites[0].operations.slice(1)).toEqual([
    { operation: 'update', resourceCode: 'purchase-lines', id: 'line-1', expectedRevision: 3, data: { name: '移动明细修改' } },
  ]);
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} workflow editing is only offered after completion`, async ({ page }) => {
    const state = await workflowEntryPlatform(page);
    await page.setViewportSize(mobile ? { width: 390, height: 600 } : { width: 1440, height: 900 });
    for (const status of ['running', 'returned', 'approved']) {
      state.instanceStatus = status;
      await page.goto(`/workflow-entry.e2e.html?mode=${mobile ? 'mobile' : 'desktop'}-detail`);
      await expect(page.locator('.oxa-record-detail-header')).toBeVisible();
      await expect(page.locator('.oxa-record-detail-header').getByRole('button', { name: '编辑', exact: true })).toHaveCount(status === 'approved' ? 1 : 0);
      await expect(page.locator('.oxa-record-detail-footer').getByRole('button', { name: /关\s*闭/ })).toHaveCount(0);
      await expect(page.locator('.oxa-workflow-current-node')).toHaveCount(0);
    }
    expect(state.correctionReads).toBe(0);
  });
}

for (const variant of ['desktop', 'mobile']) {
  test(`具名发起 ${variant} 传递选择器授权绑定并显示枚举上下文`, async ({ page }) => {
    if (variant === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    const state = await workflowEntryPlatform(page);
    state.named = true; state.admin = false;
    await page.goto(`/workflow-entry.e2e.html?named=1&mode=${variant === 'mobile' ? 'mobile' : 'callback'}`);
    const drawer = page.getByRole('dialog', { name: '采购审批' });
    await expect(drawer.getByText('加入', { exact: true })).toBeVisible();
    if (variant === 'mobile') await drawer.getByRole('button', { name: /申请单位/ }).click();
    else await drawer.getByLabel('申请单位', { exact: true }).click();
    await expect(page.getByText('授权单位甲', { exact: true }).last()).toBeVisible();
    expect(state.sourceQueries.length).toBeGreaterThan(0);
    for (const query of state.sourceQueries) expect(query.launch).toEqual({ workflowCode: 'purchase-approval', operationCode: 'purchase.create-submit' });
    const count = state.sourceQueries.length;
    await page.getByRole('button', { name: '重新渲染父页面' }).evaluate(element => element.click());
    await page.waitForTimeout(400);
    expect(state.sourceQueries.length).toBe(count);
    expect(state.nativeWrites).toEqual([]);
  });
  test(`具名发起 ${variant} 选择器权限失败显示中文且不暴露内部信息`, async ({ page }) => {
    if (variant === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    const state = await workflowEntryPlatform(page);
    state.named = true; state.admin = false; state.sourceFailure = 403;
    await page.goto(`/workflow-entry.e2e.html?named=1&mode=${variant === 'mobile' ? 'mobile' : 'callback'}`);
    const drawer = page.getByRole('dialog', { name: '采购审批' });
    if (variant === 'mobile') await drawer.getByRole('button', { name: /申请单位/ }).click();
    else await drawer.getByLabel('申请单位', { exact: true }).click();
    await expect(page.getByText('你暂无权限查看这些选项，请联系管理员', { exact: true })).toBeVisible();
    await expect(page.getByText(/OPENXIANGDA_INTERNAL_FAILURE|requestId=private/)).toHaveCount(0);
    expect(state.nativeWrites).toEqual([]);
  });
}

test('已接受命令读取撤权后停止自动轮询，原位手动刷新仍不重复提交', async ({ page }) => {
  const state = await workflowEntryPlatform(page);
  state.failStatusOnce = true; state.statusFailureCode = 403;
  await page.goto('/workflow-entry.e2e.html?mode=callback');
  const drawer = page.getByRole('dialog', { name: '采购审批' });
  await drawer.getByLabel('申请名称', { exact: true }).fill('撤权读取申请');
  await drawer.getByLabel('申请金额', { exact: true }).fill('200');
  await drawer.getByRole('button', { name: '提交审批' }).click();
  await expect(drawer.getByText('暂时无法确认申请状态')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(state.statusReads).toBe(1);
  expect(state.launchEffects).toBe(1);
  await drawer.getByRole('button', { name: '刷新提交状态' }).click();
  await expect(page.getByTestId('completions')).toHaveText('record-created');
  expect(state.launchEffects).toBe(1);
  expect(state.launches).toHaveLength(1);
});
