import type {
  DepartmentReferenceValue,
  ResourceReferenceValue,
  UserReferenceValue,
} from 'openxiangda-contracts';
import { OpenXiangdaPlatformError } from './platform-client.js';

/**
 * 快照值写入助手。平台的 option/user/department/resource-ref 字段在 Data API
 * 写入时保存 `{ label, value }` 显示快照（`value` 是比较键），事务与普通写入
 * 都必须使用这些形状，直接写裸字符串会被字段校验拒绝。
 */
export function optionSnapshot(label: string, value: string) {
  return { label, value };
}

export function userSnapshot(
  userId: string,
  displayName?: string
): UserReferenceValue {
  return { label: displayName?.trim() || userId, value: userId };
}

export function departmentSnapshot(
  departmentId: string,
  displayName?: string
): DepartmentReferenceValue {
  return { label: displayName?.trim() || departmentId, value: departmentId };
}

export function resourceSnapshot(
  resourceCode: string,
  recordId: string,
  label: string
): ResourceReferenceValue {
  return { label, value: recordId, resourceCode };
}

/**
 * 判定一个错误是否为平台幂等冲突：同一 idempotencyKey 携带了不同内容（典型
 * 场景是重试时乐观锁 revision 已前进）。捕获后应回读当前状态确认"已生效"并按
 * 幂等结果返回，而不是把冲突透传给调用方或生成新键重试。
 */
export function isIdempotencyConflict(error: unknown): boolean {
  return (
    error instanceof OpenXiangdaPlatformError &&
    error.code === 'OPENXIANGDA_NATIVE_DATA_IDEMPOTENCY_CONFLICT'
  );
}
