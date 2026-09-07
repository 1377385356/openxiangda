import type { DataTransactionGuard } from 'openxiangda-contracts';
import { UnauthorizedException } from '@nestjs/common';
import type {
  OpenXiangdaBusinessActionContext,
  OpenXiangdaHttpRequest,
} from './types.js';

export interface OpenXiangdaBusinessActionRuntimeContext {
  authorization: string;
  perspectiveCode: string | null;
  action: OpenXiangdaBusinessActionContext;
}

/**
 * Resolves immutable Named Action metadata from the verified request.
 *
 * The authorization value is the short-lived platform invocation (or bounded
 * Connected Dev Session), never the caller's original login token.
 */
export function requireOpenXiangdaBusinessActionContext(
  request: OpenXiangdaHttpRequest
): OpenXiangdaBusinessActionRuntimeContext {
  const verified = request.openxiangda;
  if (!verified) {
    throw new UnauthorizedException('OPENXIANGDA_CONTEXT_NOT_VERIFIED');
  }
  if (!verified.operation) {
    throw new UnauthorizedException(
      'OPENXIANGDA_BUSINESS_ACTION_OPERATION_REQUIRED'
    );
  }
  if (
    verified.principal.principalType !== 'user' &&
    verified.principal.principalType !== 'developer'
  ) {
    throw new UnauthorizedException(
      'OPENXIANGDA_BUSINESS_ACTION_USER_CONTEXT_REQUIRED'
    );
  }
  return {
    authorization: verified.authorization,
    perspectiveCode: verified.perspectiveCode,
    action: {
      code: verified.operation.code,
      requiredCapability: verified.operation.requiredCapability,
      ...(() => {
        const value = request.headers['x-request-id'];
        const requestId = String(
          Array.isArray(value) ? value[0] || '' : value || ''
        ).trim();
        return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)
          ? { requestId }
          : {};
      })(),
      ...(verified.connectedDevelopmentSessionToken
        ? {
            connectedDevelopmentSessionToken:
              verified.connectedDevelopmentSessionToken,
          }
        : {}),
    },
  };
}

/** 尽早诊断声明缺失；实际成员事实与并发仍由平台事务核对。 */
export function assertOpenXiangdaRoleAssertions(
  request: OpenXiangdaHttpRequest | undefined,
  guards: readonly DataTransactionGuard[] | undefined
): void {
  const members = (guards || []).filter(guard => guard.kind === 'role-member');
  if (!members.length) return;
  if (!request) throw new UnauthorizedException('OPENXIANGDA_ROLE_ASSERTION_ACTION_REQUIRED');
  requireOpenXiangdaBusinessActionContext(request);
  const declared = request.openxiangda!.operation!.platformAccess?.roleAssertions?.roleCodes;
  if (!declared || members.some(member => !declared.includes(member.roleCode))) {
    throw new UnauthorizedException('OPENXIANGDA_ROLE_ASSERTION_NOT_DECLARED');
  }
}
