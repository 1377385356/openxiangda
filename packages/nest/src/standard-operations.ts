import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, Scope } from '@nestjs/common';
import {
  SCHEMA_VERSIONS,
  type DataWhere,
  type DataTransactionGuard,
  type DataTransactionOperation,
  type DataTransactionRecordAssertion,
  type DataTransactionRequest,
} from 'openxiangda-contracts';
import { OpenXiangdaBusinessDataApiService } from './data-api.js';

export interface TimeInterval {
  startAt: string;
  endAt: string;
}

export function assertValidTimeInterval({ startAt, endAt }: TimeInterval) {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new ConflictException('OPENXIANGDA_INTERVAL_INVALID');
  }
}

export function idempotentTransaction(
  idempotencyKey: string,
  operations: DataTransactionOperation[],
  guards: DataTransactionGuard[] = [],
): DataTransactionRequest {
  if (!idempotencyKey.trim()) throw new ConflictException('OPENXIANGDA_IDEMPOTENCY_KEY_REQUIRED');
  return {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey,
    ...(guards.length ? { guards } : {}),
    operations,
  };
}

/**
 * Builds the only supported dynamic time operand. The platform resolves it
 * from PostgreSQL transaction time and persists that instant in the
 * idempotency result; callers never inject Date.now() into a retry.
 */
export function databaseNowAssertion(
  field: string,
  operator: Extract<
    DataTransactionRecordAssertion,
    { kind: 'database-now' }
  >['operator']
): DataTransactionRecordAssertion {
  if (!field.trim()) {
    throw new ConflictException('OPENXIANGDA_DATABASE_NOW_FIELD_REQUIRED');
  }
  return { kind: 'database-now', field, operator };
}

function boundedBusinessLock(prefix: string, value: unknown) {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return `${prefix}:${digest}`;
}

export interface MeetingReservationOperationInput extends TimeInterval {
  reservationResourceCode: string;
  roomField: string;
  startField: string;
  endField: string;
  roomId: string;
  data: Record<string, unknown>;
  idempotencyKey: string;
  statusField?: string;
  activeStatusValues?: string[];
  recordId?: string;
  expectedRevision?: number;
}

export interface CourseSelectionOperationInput {
  selectionResourceCode: string;
  courseResourceCode: string;
  selectionCourseField: string;
  selectionStudentField: string;
  courseCapacityField: string;
  courseEnrolledField: string;
  courseId: string;
  studentId: string;
  data: Record<string, unknown>;
  idempotencyKey: string;
  courseStatusField?: string;
  openCourseStatusValues?: string[];
}

export interface VisitorReservationOperationInput {
  reservationResourceCode: string;
  duplicateMatch: Record<string, unknown>;
  data: Record<string, unknown>;
  idempotencyKey: string;
  activeStatusField?: string;
  activeStatusValues?: string[];
}

@Injectable({ scope: Scope.REQUEST })
export class OpenXiangdaStandardOperations {
  constructor(
    @Inject(OpenXiangdaBusinessDataApiService)
    private readonly data: OpenXiangdaBusinessDataApiService
  ) {}

  /** Atomically rejects an overlapping active reservation and applies the mutation. */
  async createMeetingReservation(input: MeetingReservationOperationInput) {
    assertValidTimeInterval(input);
    if (
      input.recordId &&
      (!Number.isSafeInteger(input.expectedRevision) ||
        Number(input.expectedRevision) < 1)
    ) {
      throw new ConflictException('OPENXIANGDA_EXPECTED_REVISION_REQUIRED');
    }
    const predicates: DataWhere[] = [
      { field: input.roomField, operator: 'eq', value: input.roomId },
      { field: input.startField, operator: 'lt', value: input.endAt },
      { field: input.endField, operator: 'gt', value: input.startAt },
    ];
    if (input.statusField && input.activeStatusValues?.length) {
      predicates.push({ field: input.statusField, operator: 'in', value: input.activeStatusValues });
    }
    if (input.recordId) predicates.push({ field: 'id', operator: 'neq', value: input.recordId });
    const operation: DataTransactionOperation = input.recordId
      ? { operation: 'update', resourceCode: input.reservationResourceCode, id: input.recordId, expectedRevision: input.expectedRevision || 0, data: input.data }
      : { operation: 'create', resourceCode: input.reservationResourceCode, data: input.data };
    return this.data.transaction(idempotentTransaction(input.idempotencyKey, [operation], [
      {
        kind: 'query-empty',
        resourceCode: input.reservationResourceCode,
        lockKey: boundedBusinessLock('meeting-room', input.roomId),
        errorCode: 'OPENXIANGDA_MEETING_TIME_CONFLICT',
        where: { and: predicates },
      },
    ]));
  }

  /** Course enrollment asserts, increments, and creates inside one stable transaction. */
  async createCourseSelection(input: CourseSelectionOperationInput) {
    const courseLock = boundedBusinessLock('course', input.courseId);
    const guards: DataTransactionGuard[] = [
      {
        kind: 'query-empty',
        resourceCode: input.selectionResourceCode,
        lockKey: courseLock,
        errorCode: 'OPENXIANGDA_COURSE_ALREADY_SELECTED',
        where: {
          and: [
            { field: input.selectionCourseField, operator: 'eq', value: input.courseId },
            { field: input.selectionStudentField, operator: 'eq', value: input.studentId },
          ],
        },
      },
      ...(input.courseStatusField && input.openCourseStatusValues?.length
        ? [{
            kind: 'record-assert' as const,
            resourceCode: input.courseResourceCode,
            lockKey: courseLock,
            errorCode: 'OPENXIANGDA_COURSE_NOT_OPEN',
            id: input.courseId,
            assertions: [{
              kind: 'value' as const,
              field: input.courseStatusField,
              operator: 'in' as const,
              value: input.openCourseStatusValues,
            }],
          }]
        : []),
      {
        kind: 'record-assert',
        resourceCode: input.courseResourceCode,
        lockKey: courseLock,
        errorCode: 'OPENXIANGDA_CAPACITY_EXCEEDED',
        id: input.courseId,
        assertions: [{
          kind: 'field',
          leftField: input.courseEnrolledField,
          operator: 'lt',
          rightField: input.courseCapacityField,
        }],
      },
    ];
    return this.data.transaction(idempotentTransaction(input.idempotencyKey, [
      {
        operation: 'increment',
        resourceCode: input.courseResourceCode,
        id: input.courseId,
        field: input.courseEnrolledField,
        amount: 1,
      },
      { operation: 'create', resourceCode: input.selectionResourceCode, data: input.data },
    ], guards));
  }

  /** Visitor duplicate guard for same business key and active status. */
  async createVisitorReservation(input: VisitorReservationOperationInput) {
    if (
      !input.duplicateMatch ||
      typeof input.duplicateMatch !== 'object' ||
      Array.isArray(input.duplicateMatch) ||
      Object.keys(input.duplicateMatch).length < 1
    ) {
      throw new ConflictException(
        'OPENXIANGDA_VISITOR_DUPLICATE_MATCH_REQUIRED'
      );
    }
    const predicates: DataWhere[] = Object.entries(input.duplicateMatch).map(([field, value]) => ({ field, operator: 'eq', value }));
    if (input.activeStatusField && input.activeStatusValues?.length) predicates.push({ field: input.activeStatusField, operator: 'in', value: input.activeStatusValues });
    const duplicateKey = Object.entries(input.duplicateMatch)
      .sort(([left], [right]) => left.localeCompare(right));
    return this.data.transaction(idempotentTransaction(
      input.idempotencyKey,
      [{ operation: 'create', resourceCode: input.reservationResourceCode, data: input.data }],
      [{
        kind: 'query-empty',
        resourceCode: input.reservationResourceCode,
        lockKey: boundedBusinessLock('visitor-reservation', duplicateKey),
        errorCode: 'OPENXIANGDA_VISITOR_DUPLICATE_RESERVATION',
        where: { and: predicates },
      }],
    ));
  }
}
