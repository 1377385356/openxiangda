import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataResourceSurface } from 'openxiangda-contracts/browser';
import * as XLSX from 'xlsx';
import {
  buildResourceImportTemplate,
  parseResourceImportMatrix,
  resourceImportFieldGuides,
  readResourceImportWorkbook,
} from '../src/browser/components/resource/resource-import';
import { launchWorkflowImportRows } from '../src/browser/components/resource/workflow-resource-import';

const surface = {
  mutationOwner: 'native',
  generated: {
    list: true,
    detail: true,
    create: true,
    update: true,
    delete: true,
  },
  fields: {
    visitorName: { label: '访客姓名', type: 'text.short', widget: 'text', requiredHint: true },
    visitorCount: { label: '来访人数', type: 'number.integer', widget: 'number' },
    approved: { label: '是否通过', type: 'boolean', widget: 'switch' },
    status: {
      label: '状态',
      type: 'option.single',
      widget: 'select',
      options: [
        { label: '待审核', value: 'pending' },
        { label: '已通过', value: 'approved' },
      ],
    },
    visitDate: { label: '来访日期', type: 'date', widget: 'date' },
    attachments: { label: '附件', type: 'file', widget: 'attachment' },
  },
} as unknown as DataResourceSurface;

test('decodes UTF-8 CSV with or without a BOM and retains source text for field parsing', async () => {
  for (const prefix of ['', '\ufeff']) {
    const workbook = await readResourceImportWorkbook(new File([`${prefix}申请标题,编号,日期,说明\r\n历史采购,00123,2026-09-06,"=保留原始说明,含逗号"\r\n`], '中文.csv'));
    assert.deepEqual(workbook.headers, ['申请标题', '编号', '日期', '说明']);
    assert.deepEqual(workbook.matrix[1], ['历史采购', '00123', '2026-09-06', '=保留原始说明,含逗号']);
  }
});

test('rejects an undecodable CSV instead of silently replacing business data characters', async () => {
  await assert.rejects(readResourceImportWorkbook(new File([new Uint8Array([0xff, 0xff, 0x0a])], '旧编码.csv')), /另存为 UTF-8 CSV 或 XLSX/);
});

test('maps exact labels and codes into one canonical create transaction', () => {
  const preview = parseResourceImportMatrix(
    '访客.xlsx',
    [
      ['访客姓名', 'visitorCount', '是否通过', '状态'],
      ['张三', 2, '是', '待审核'],
      ['李四', '3', '否', 'approved'],
    ],
    'visitor-reservations',
    surface,
    ['visitorName', 'visitorCount', 'approved', 'status']
  );

  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.operations, [
    {
      operation: 'create',
      resourceCode: 'visitor-reservations',
      data: {
        visitorName: '张三',
        visitorCount: 2,
        approved: true,
        status: { label: '待审核', value: 'pending' },
      },
    },
    {
      operation: 'create',
      resourceCode: 'visitor-reservations',
      data: {
        visitorName: '李四',
        visitorCount: 3,
        approved: false,
        status: { label: '已通过', value: 'approved' },
      },
    },
  ]);
});

test('preserves exact dates and rejects impossible calendar dates', () => {
  const valid = parseResourceImportMatrix(
    '日期.csv',
    [
      ['访客姓名', '来访日期'],
      ['张三', '2026-08-23'],
    ],
    'visitor-reservations',
    surface,
    ['visitorName', 'visitDate']
  );
  assert.deepEqual(valid.errors, []);
  assert.deepEqual(valid.operations[0], {
    operation: 'create',
    resourceCode: 'visitor-reservations',
    data: { visitorName: '张三', visitDate: '2026-08-23' },
  });

  const invalid = parseResourceImportMatrix(
    '错误日期.csv',
    [
      ['访客姓名', '来访日期'],
      ['张三', '2026-02-30'],
    ],
    'visitor-reservations',
    surface,
    ['visitorName', 'visitDate']
  );
  assert.equal(invalid.operations.length, 0);
  assert.ok(invalid.errors.some((error) => error.includes('日期格式无效')));
});

test('rejects values in a column without a header', () => {
  const preview = parseResourceImportMatrix(
    '空表头.csv',
    [
      ['访客姓名', ''],
      ['张三', '未声明的数据'],
    ],
    'visitor-reservations',
    surface,
    ['visitorName']
  );

  assert.equal(preview.operations.length, 0);
  assert.ok(preview.errors.some((error) => error.includes('缺少表头')));
});

test('rejects unknown, managed-file and invalid cells before submission', () => {
  const preview = parseResourceImportMatrix(
    '错误.csv',
    [
      ['访客姓名', '是否通过', '附件', '任意列'],
      ['', '不确定', 'https://untrusted.example/file', 'value'],
    ],
    'visitor-reservations',
    surface,
    ['visitorName', 'approved', 'attachments']
  );

  assert.equal(preview.operations.length, 0);
  assert.ok(preview.errors.some((error) => error.includes('不是已声明字段')));
  assert.ok(preview.errors.some((error) => error.includes('必须通过平台上传组件')));
  assert.ok(preview.errors.some((error) => error.includes('请填写是或否')));
  assert.ok(preview.errors.some((error) => error.includes('访客姓名为必填项')));
});

test('keeps the atomic import boundary at one hundred rows', () => {
  const preview = parseResourceImportMatrix(
    '过大.csv',
    [['访客姓名'], ...Array.from({ length: 101 }, (_, index) => [`访客 ${index + 1}`])],
    'visitor-reservations',
    surface,
    ['visitorName']
  );

  assert.equal(preview.rows.length, 100);
  assert.equal(preview.operations.length, 0);
  assert.ok(preview.errors.some((error) => error.includes('单次最多导入 100 行')));
});

test('launches every workflow import row independently and retries only failed rows', async () => {
  const active = { count: 0, max: 0 };
  const calls: Array<{ row: string; idempotencyKey: string }> = [];
  let firstFailure = true;
  const commit = async (input: {
    idempotencyKey: string;
    mutation: { data: Record<string, unknown> };
  }) => {
    active.count += 1;
    active.max = Math.max(active.max, active.count);
    calls.push({
      row: String(input.mutation.data.visitorName),
      idempotencyKey: input.idempotencyKey,
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    active.count -= 1;
    if (input.mutation.data.visitorName === '李四' && firstFailure) {
      firstFailure = false;
      throw new Error('temporary failure');
    }
    return { id: `command-${input.mutation.data.visitorName}` };
  };
  const rows = Array.from({ length: 5 }, (_, index) => ({
    rowNumber: index + 2,
    data: { visitorName: ['张三', '李四', '王五', '赵六', '钱七'][index] },
  }));
  const first = await launchWorkflowImportRows({
    rows,
    batchId: 'batch-1',
    workflowCode: 'visitor-approval',
    processOperationCode: 'openxiangda.workflow.visitor-approval.submit',
    commit: commit as any,
  });

  assert.equal(active.max, 3);
  assert.equal(first.filter(result => result.status === 'accepted').length, 4);
  assert.equal(first.filter(result => result.status === 'failed').length, 1);

  const retried = await launchWorkflowImportRows({
    rows,
    previousResults: first,
    batchId: 'batch-1',
    workflowCode: 'visitor-approval',
    processOperationCode: 'openxiangda.workflow.visitor-approval.submit',
    commit: commit as any,
  });
  assert.equal(retried.every(result => result.status === 'accepted'), true);
  assert.equal(calls.length, 6);
  assert.equal(calls.filter(call => call.row === '李四').length, 2);
  assert.equal(
    calls.filter(call => call.row === '李四')[0]?.idempotencyKey,
    calls.filter(call => call.row === '李四')[1]?.idempotencyKey,
  );
});

test('builds a permission-aware workbook with data and field guide sheets', async () => {
  const template = await buildResourceImportTemplate(
    '访客/登记',
    surface,
    ['visitorName', 'visitorCount', 'approved', 'status', 'visitDate', 'attachments']
  );
  assert.equal(template.fileName, '访客-登记导入模板.xlsx');
  assert.deepEqual(
    template.fields.map((field) => [field.code, field.importable]),
    [
      ['visitorName', true],
      ['visitorCount', true],
      ['approved', true],
      ['status', true],
      ['visitDate', true],
      ['attachments', false],
    ]
  );
  const workbook = XLSX.read(template.content, { type: 'array' });
  assert.deepEqual(workbook.SheetNames, ['导入数据', '字段说明']);
  const data = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['导入数据']!, {
    header: 1,
  });
  assert.deepEqual(data[0], ['访客姓名', '来访人数', '是否通过', '状态', '来访日期']);
  const guide = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['字段说明']!);
  assert.equal(guide.find((row) => row['字段代码'] === 'attachments')?.['是否可导入'], '否');
});

test('publishes semantic object formats for directory and resource fields', () => {
  const semanticSurface = {
    fields: {
      member: { label: '会员', type: 'user.single', widget: 'directory-user', requiredHint: true },
      departments: { label: '部门', type: 'department.multiple', widget: 'directory-department' },
      employee: {
        label: '教职工档案',
        type: 'resource-ref.single',
        widget: 'resource',
        source: { resourceCode: 'employee-profiles', labelField: 'name' },
      },
    },
  } as unknown as DataResourceSurface;
  const guides = resourceImportFieldGuides(semanticSurface, ['member', 'departments', 'employee']);
  assert.match(guides.find((field) => field.code === 'member')?.example || '', /平台目录标识/);
  assert.match(guides.find((field) => field.code === 'employee')?.example || '', /employee-profiles/);

  const preview = parseResourceImportMatrix(
    '会员.xlsx',
    [
      ['会员', '部门', '教职工档案'],
      [
        '{"label":"张三","value":"user-1","mobile":"13800000000"}',
        '[{"label":"信息化处","value":"dept-1"}]',
        '{"label":"张三档案","value":"employee-1","resourceCode":"employee-profiles"}',
      ],
    ],
    'member-profiles',
    semanticSurface,
    ['member', 'departments', 'employee']
  );
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.operations[0], {
    operation: 'create',
    resourceCode: 'member-profiles',
    data: {
      member: { label: '张三', value: 'user-1', mobile: '13800000000' },
      departments: [{ label: '信息化处', value: 'dept-1' }],
      employee: { label: '张三档案', value: 'employee-1', resourceCode: 'employee-profiles' },
    },
  });
});

test('rejects scalar directory values and malformed resource snapshots', () => {
  const semanticSurface = {
    fields: {
      member: { label: '会员', type: 'user.single', widget: 'directory-user', requiredHint: true },
      employee: { label: '教职工档案', type: 'resource-ref.single', widget: 'resource' },
    },
  } as unknown as DataResourceSurface;
  const preview = parseResourceImportMatrix(
    '错误会员.xlsx',
    [
      ['会员', '教职工档案'],
      ['张三', '{"label":"张三档案","value":"employee-1"}'],
    ],
    'member-profiles',
    semanticSurface,
    ['member', 'employee']
  );
  assert.equal(preview.operations.length, 0);
  assert.ok(preview.errors.some((error) => error.includes('必须是 JSON 对象')));
  assert.ok(preview.errors.some((error) => error.includes('必须包含 resourceCode')));
});


test('maps administrator columns explicitly, skips unselected data and keeps original row numbers', () => {
  const parsed = parseResourceImportMatrix('供应商.xlsx', [
    ['姓名自定义表头', '无关列', '数量'], [], ['王老师', '不会写入', 4],
  ], 'visits', surface, ['visitorName', 'visitorCount'], { fieldMapping: ['visitorName', null, 'visitorCount'] });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows, [{ rowNumber: 3, data: { visitorName: '王老师', visitorCount: 4 }, errors: [] }]);
  const duplicate = parseResourceImportMatrix('duplicate.csv', [['A', 'B'], ['张三', '李四']], 'visits', surface, ['visitorName'], { fieldMapping: ['visitorName', 'visitorName'] });
  assert.match(duplicate.errors.join(';'), /重复/);
  const unknown = parseResourceImportMatrix('unknown.csv', [['A'], ['张三']], 'visits', surface, ['visitorName'], { fieldMapping: ['not_declared'] });
  assert.match(unknown.errors.join(';'), /未声明|不是已声明/);
});

test('partial updates skip absent required fields and distinguish empty cells from clearing values', () => {
  const matrix = [['visitorCount', 'status'], [3, '']];
  const skip = parseResourceImportMatrix('update.csv', matrix, 'visits', surface, ['visitorCount', 'status'], { requiredFields: 'mapped' });
  assert.deepEqual(skip.errors, []);
  assert.deepEqual(skip.rows[0]?.data, { visitorCount: 3 });
  const clear = parseResourceImportMatrix('update.csv', matrix, 'visits', surface, ['visitorCount', 'status'], { requiredFields: 'none', blankCells: 'null' });
  assert.deepEqual(clear.rows[0]?.data, { visitorCount: 3, status: null });
});

test('larger parsing budgets do not silently increase the default transaction import limit', () => {
  const matrix = [['visitorName'], ...Array.from({ length: 101 }, (_, index) => [`访客 ${index}`])];
  assert.match(parseResourceImportMatrix('batch.csv', matrix, 'visits', surface, ['visitorName']).errors.join(';'), /100/);
  const parsed = parseResourceImportMatrix('batch.csv', matrix, 'visits', surface, ['visitorName'], { maxRows: 5000 });
  assert.equal(parsed.rows.length, 101);
  assert.deepEqual(parsed.errors, []);
  assert.ok(parseResourceImportMatrix('batch.csv', matrix, 'visits', surface, ['visitorName'], { maxRows: 5001 }).errors.length);
});

test('reads a real workbook with a custom header while rejecting out-of-bounds worksheets', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['外部姓名', '数量'], ['张三', 2]]), '数据');
  const file = new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], '外部数据.xlsx');
  const parsed = await readResourceImportWorkbook(file);
  assert.deepEqual(parsed.headers, ['外部姓名', '数量']);
  assert.deepEqual(parsed.matrix[1], ['张三', 2]);
  workbook.Sheets['数据']!['!ref'] = 'A1:IW2';
  await assert.rejects(readResourceImportWorkbook(new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], '宽表.xlsx')), /256/);
});
