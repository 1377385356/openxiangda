/** CLI 与 MCP 共用的错误字段投影；调用方仅负责传输外壳。 */
export function developerError(error: unknown, nextCommand = 'pnpm openxiangda docs') {
  const value = error as { code?: unknown; retryable?: unknown; status?: unknown; data?: Record<string, unknown>; remote?: { remediation?: unknown; retryable?: unknown; path?: unknown } };
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  const code = String(value?.code || message.match(/^([A-Z][A-Z0-9_]+)/)?.[1] || 'OPENXIANGDA_COMMAND_FAILED');
  const details = value?.data && typeof value.data === 'object' && !Array.isArray(value.data) ? value.data : undefined;
  const pointer = (typeof details?.pointer === 'string' && details.pointer) || (typeof value?.remote?.path === 'string' && value.remote.path);
  const remediation = value?.remote?.remediation || details?.remediation;
  return {
    code, message: message.replace(/^([A-Z][A-Z0-9_]+):\s*/, ''),
    retryable: Boolean(value?.retryable || value?.remote?.retryable || Number(value?.status || 0) >= 500 || /NETWORK|TIMEOUT|UNAVAILABLE|RATE_LIMIT/.test(code)),
    remediation: typeof remediation === 'string' ? remediation : `运行 ${nextCommand}`,
    nextCommand, ...(pointer ? { pointer } : {}), ...(details ? { details } : {}),
  };
}
