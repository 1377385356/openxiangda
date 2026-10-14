
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDirectoryClassPage } from '../src/multi-organization.js';
const org = '11111111-1111-4111-8111-111111111111';
const item = { directoryClassId: org, organizationName: '合成学校', sourceClassId: 'source', name: '合成班级',
  sourceCampusId: 'campus', sourcePeriodId: 'period', sourceGradeId: 'grade',
  campusName: null, periodName: '小学', gradeName: '一年级', roleCodes: ['teacher','head_teacher'] };
const page = { schemaVersion: 'openxiangda.directory-class-page/v1', organizationId: org, userId: 'actor', items: [item], nextCursor: null };
test('source IDs and directory UUIDs remain distinct in a strict actor-bound projection', () => {
  assert.deepEqual(parseDirectoryClassPage(page, { userId:'actor', organizationId: org, limit:1 }), page);
  for (const value of [
    { ...page, userId:'other' }, { ...page, organizationId:'not-uuid' },
    { ...page, items:[item,item] }, { ...page, nextCursor:'other' },
    { ...page, items:[{ ...item, roleCodes:['administrator'] }] },
    { ...page, items:[{ ...item, unionId:'private' }] },
    { ...page, items:[{ ...item, name:'' }] }, { ...page, items:[{ ...item, directoryClassId:'source' }] },
    { ...page, items:[{ ...item, roleCodes:['teacher','teacher'] }] }, { ...page, raw:{} },
  ]) assert.throws(() => parseDirectoryClassPage(value, { userId:'actor', organizationId:org, limit:1 }), /RESPONSE_INVALID/);
});
