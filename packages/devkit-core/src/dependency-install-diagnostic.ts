/** Only allowlisted codes leave the child-process boundary; raw output may contain credentials. */
export function dependencyInstallDiagnostic(result: {
  status: number | null;
  signal?: string | null;
  error?: Error | { code?: string } | undefined;
  stdout?: string | null;
  stderr?: string | null;
}): string {
  const errorCode = (result.error as { code?: string } | undefined)?.code;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const known = [
    'ERR_PNPM_FETCH_401', 'ERR_PNPM_FETCH_403', 'ERR_PNPM_FETCH_404',
    'ERR_PNPM_NO_MATCHING_VERSION', 'ERR_PNPM_OUTDATED_LOCKFILE',
    'ERR_PNPM_LOCKFILE_BREAKING_CHANGE', 'ERR_PNPM_PEER_DEP_ISSUES',
    'ERR_PNPM_UNSUPPORTED_ENGINE', 'ERR_PNPM_UNEXPECTED_STORE',
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'ENOSPC', 'EACCES', 'EPERM', 'ENOENT', 'ENOBUFS',
  ];
  const codes = known.filter(code => errorCode === code
    || new RegExp(`(?<![A-Z0-9_])${code}(?![A-Z0-9_])`).test(output));
  let reason = '依赖安装退出异常，请在应用目录运行 pnpm install --no-frozen-lockfile --ignore-scripts 定位';
  if (errorCode === 'ETIMEDOUT') reason = '依赖安装超过 180 秒，请检查 registry 连通性后重试';
  else if (errorCode === 'ENOENT') reason = '找不到 pnpm，请安装工作区声明的包管理器版本';
  else if (codes.some(code => ['ERR_PNPM_FETCH_401', 'ERR_PNPM_FETCH_403'].includes(code))) reason = '依赖仓库认证或访问权限失败，请修复 registry 授权';
  else if (codes.some(code => ['ERR_PNPM_FETCH_404', 'ERR_PNPM_NO_MATCHING_VERSION'].includes(code))) reason = '声明的依赖版本不可获取，请核对正式包版本和 registry 配置';
  else if (codes.includes('ENOSPC')) reason = '磁盘空间不足，请释放空间后重试';
  else if (codes.some(code => ['EACCES', 'EPERM'].includes(code))) reason = '安装目录或缓存无写入权限，请修复权限';
  else if (codes.some(code => ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code))) reason = '依赖仓库连接失败，请检查网络、DNS 或代理后重试';
  const exit = Number.isSafeInteger(result.status) ? `；exit=${result.status}` : '';
  return `${reason}${codes.length ? `；${codes.join(', ')}` : ''}${exit}`;
}
