import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertValidTimeInterval,
  idempotentTransaction,
  OpenXiangdaStandardOperations,
} from '../src/standard-operations.js';

test('standard operation input rejects invalid intervals', () => {
  assert.doesNotThrow(() => assertValidTimeInterval({ startAt: '2026-08-22T09:00:00Z', endAt: '2026-08-22T10:00:00Z' }));
  assert.throws(() => assertValidTimeInterval({ startAt: '2026-08-22T10:00:00Z', endAt: '2026-08-22T09:00:00Z' }), /OPENXIANGDA_INTERVAL_INVALID/);
});

test('standard transactions are bounded and idempotent', () => {
  const transaction = idempotentTransaction('course-1', [{ operation: 'create', resourceCode: 'course-selections', data: { courseId: 'course-1' } }]);
  assert.equal(transaction.schemaVersion, 'openxiangda.data-transaction-request/v2');
  assert.equal(transaction.operations.length, 1);
  assert.throws(() => idempotentTransaction('', []), /OPENXIANGDA_IDEMPOTENCY_KEY_REQUIRED/);
});

test('meeting and visitor guards execute only inside the canonical transaction', async () => {
  const requests: unknown[] = [];
  const data = {
    query: async () => {
      throw new Error('query-before-transaction is forbidden');
    },
    transaction: async (request: unknown) => {
      requests.push(request);
      return request;
    },
  };
  const operations = new OpenXiangdaStandardOperations(data as never);
  await operations.createMeetingReservation({
    reservationResourceCode: 'meeting-reservations',
    roomField: 'room_id',
    startField: 'start_at',
    endField: 'end_at',
    roomId: 'room-1',
    startAt: '2026-08-22T09:00:00Z',
    endAt: '2026-08-22T10:00:00Z',
    data: { room_id: 'room-1' },
    idempotencyKey: 'meeting-1',
  });
  await operations.createVisitorReservation({
    reservationResourceCode: 'visitor-reservations',
    duplicateMatch: { visitor_phone: '13800000000', visit_date: '2026-08-22' },
    data: { visitor_phone: '13800000000' },
    idempotencyKey: 'visitor-1',
  });
  assert.equal(requests.length, 2);
  assert.equal((requests[0] as { guards: unknown[] }).guards.length, 1);
  assert.equal((requests[1] as { guards: unknown[] }).guards.length, 1);
  const meetingGuard = (requests[0] as {
    guards: Array<Record<string, unknown>>;
  }).guards[0];
  const visitorGuard = (requests[1] as {
    guards: Array<Record<string, unknown>>;
  }).guards[0];
  assert.equal('filters' in meetingGuard, false);
  assert.equal('filters' in visitorGuard, false);
  assert.deepEqual(meetingGuard.where, {
    and: [
      { field: 'room_id', operator: 'eq', value: 'room-1' },
      {
        field: 'start_at',
        operator: 'lt',
        value: '2026-08-22T10:00:00Z',
      },
      {
        field: 'end_at',
        operator: 'gt',
        value: '2026-08-22T09:00:00Z',
      },
    ],
  });
  assert.deepEqual(visitorGuard.where, {
    and: [
      { field: 'visitor_phone', operator: 'eq', value: '13800000000' },
      { field: 'visit_date', operator: 'eq', value: '2026-08-22' },
    ],
  });
  assert.doesNotMatch(
    String((requests[1] as { guards: Array<{ lockKey: string }> }).guards[0].lockKey),
    /13800000000/
  );
  await assert.rejects(
    () => operations.createVisitorReservation({
      reservationResourceCode: 'visitor-reservations',
      duplicateMatch: {},
      data: {},
      idempotencyKey: 'visitor-invalid',
    }),
    /OPENXIANGDA_VISITOR_DUPLICATE_MATCH_REQUIRED/
  );
  await assert.rejects(
    () => operations.createVisitorReservation({
      reservationResourceCode: 'visitor-reservations',
      duplicateMatch: [] as never,
      data: {},
      idempotencyKey: 'visitor-array-invalid',
    }),
    /OPENXIANGDA_VISITOR_DUPLICATE_MATCH_REQUIRED/
  );
  await assert.rejects(
    () => operations.createMeetingReservation({
      reservationResourceCode: 'meeting-reservations',
      roomField: 'room_id',
      startField: 'start_at',
      endField: 'end_at',
      roomId: 'room-1',
      startAt: '2026-08-22T09:00:00Z',
      endAt: '2026-08-22T10:00:00Z',
      recordId: 'reservation-1',
      data: {},
      idempotencyKey: 'meeting-invalid',
    }),
    /OPENXIANGDA_EXPECTED_REVISION_REQUIRED/
  );
});

test('course selection submits duplicate and row guards with increment atomically', async () => {
  const requests: unknown[] = [];
  const data = {
    get: async () => {
      throw new Error('read-before-transaction is forbidden');
    },
    query: async () => {
      throw new Error('query-before-transaction is forbidden');
    },
    transaction: async (request: unknown) => {
      requests.push(request);
      return request;
    },
  };
  const operations = new OpenXiangdaStandardOperations(data as never);
  await operations.createCourseSelection({
    selectionResourceCode: 'course-selections',
    courseResourceCode: 'courses',
    selectionCourseField: 'course_id',
    selectionStudentField: 'student_id',
    courseCapacityField: 'capacity',
    courseEnrolledField: 'enrolled',
    courseStatusField: 'status',
    openCourseStatusValues: ['open'],
    courseId: 'course-1',
    studentId: 'student-1',
    data: { course_id: 'course-1', student_id: 'student-1' },
    idempotencyKey: 'selection-1',
  });
  const request = requests[0] as {
    guards: Array<Record<string, unknown>>;
    operations: Array<{ operation: string; field?: string; amount?: number }>;
  };
  assert.equal(request.guards.length, 3);
  assert.equal('filters' in request.guards[0], false);
  assert.deepEqual(request.guards[0].where, {
    and: [
      { field: 'course_id', operator: 'eq', value: 'course-1' },
      { field: 'student_id', operator: 'eq', value: 'student-1' },
    ],
  });
  assert.deepEqual(request.operations.map(item => item.operation), ['increment', 'create']);
  assert.deepEqual(request.operations[0], {
    operation: 'increment',
    resourceCode: 'courses',
    id: 'course-1',
    field: 'enrolled',
    amount: 1,
  });
});
