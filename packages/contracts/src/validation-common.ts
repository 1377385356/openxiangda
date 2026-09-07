import { SCHEMA_VERSIONS, type Diagnostic } from './types.js';

export function diagnostic(
  code: string,
  message: string,
  path: string,
  remediation?: string
): Diagnostic {
  return {
    schemaVersion: SCHEMA_VERSIONS.diagnostic,
    code,
    severity: 'error',
    message,
    path,
    retryable: false,
    ...(remediation ? { remediation } : {}),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requireString(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[]
): value is string {
  if (typeof value === 'string' && value.trim()) return true;
  diagnostics.push(
    diagnostic('CONTRACT_REQUIRED_STRING', `${path} 必须是非空字符串`, path)
  );
  return false;
}

export const DATA_FIELD_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;

export function isDataFieldCode(value: unknown): value is string {
  return typeof value === 'string' && DATA_FIELD_CODE_PATTERN.test(value);
}
