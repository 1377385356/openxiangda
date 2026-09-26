export const IMAGE_STORAGE_BUDGET_EXCEEDED = 'APPLICATION_IMAGE_STORAGE_BUDGET_EXCEEDED';

const BUDGET_FIELDS = ['appBytes', 'appImages', 'appBudgetBytes', 'appImageLimit', 'requestedBytes'] as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Only public, typed diagnostics may cross the candidate recovery boundary. */
export function backendImageUploadFailure(error: unknown) {
  const failure = record(error);
  const remote = record(failure.remote);
  const rawCode = typeof failure.code === 'string' ? failure.code : '';
  const causeCode = /^[A-Z][A-Z0-9_]{0,127}$/.test(rawCode) ? rawCode : 'UPLOAD_FAILED';
  const retryable = failure.retryable ?? remote.retryable;
  const resume = '处理完成后，在原工作区保持输入、账号、目标和工具版本不变，重试原 pnpm openxiangda deploy 命令；候选未过期时继续原摘要上传。';
  if (causeCode === IMAGE_STORAGE_BUDGET_EXCEEDED) {
    const data = record(failure.data);
    const causeDetails: Record<string, number | string> = {};
    for (const key of BUDGET_FIELDS) {
      const value = data[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) causeDetails[key] = value;
    }
    if (data.recovery === 'inspect-image-retention') causeDetails.recovery = data.recovery;
    return { causeCode, causeDetails, retryable: false,
      message: '平台镜像存储额度不足，原镜像候选已保留；请先由平台核对镜像保留与受管清理状态',
      remediation: `请平台核对镜像计费、现役与回滚引用及受管清理结果，确认可用额度。${resume}` };
  }
  if (failure.status === 401) {
    return { causeCode, retryable: false,
      message: '平台登录态失效，原镜像候选已保留',
      remediation: `恢复同一账号的平台登录态。${resume}` };
  }
  if (failure.status === 403) {
    return { causeCode, retryable: false,
      message: '平台拒绝镜像上传权限，原镜像候选已保留',
      remediation: `核对当前账号的应用部署权限。${resume}` };
  }
  if (/NETWORK|TIMEOUT|TRANSPORT_FAILED|^E(?:PIPE|CONNRESET|TIMEDOUT|HOSTUNREACH|NETUNREACH|NOTFOUND)$/.test(causeCode)) {
    return { causeCode, retryable: retryable !== false,
      message: '镜像上传连接未完成，原镜像候选已保留',
      remediation: `检查目标平台的网络与连接状态。${resume}` };
  }
  return { causeCode, retryable: retryable !== false,
    message: '镜像上传未完成，原镜像候选已保留；请根据 causeCode 核对失败原因',
    remediation: `核对 causeCode 对应的平台响应与上传状态。${resume}` };
}
