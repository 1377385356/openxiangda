import assert from 'node:assert/strict';
import test from 'node:test';
import { dependencyInstallDiagnostic } from '../src/dependency-install-diagnostic.js';

test('安装故障分类保留可操作原因，绝不回显原始日志、URL、凭据与路径', () => {
  const cases = [
    [{ status: null, error: { code: 'ETIMEDOUT' } }, /180 秒/],
    [{ status: null, error: { code: 'ENOENT' } }, /找不到 pnpm/],
    [{ status: 1, stderr: 'ERR_PNPM_FETCH_401' }, /认证或访问权限/],
    [{ status: 1, stdout: 'ERR_PNPM_NO_MATCHING_VERSION' }, /版本不可获取/],
    [{ status: 1, stderr: 'ENOSPC' }, /磁盘空间不足/],
    [{ status: 1, stderr: 'EACCES' }, /无写入权限/],
    [{ status: 1, stderr: 'ECONNRESET' }, /连接失败/],
    [{ status: 42 }, /exit=42/],
  ] as const;
  for (const [input, reason] of cases) {
    const out = dependencyInstallDiagnostic({ ...input, stderr: `${'stderr' in input ? input.stderr : ''} https://user:super-secret@registry.example/?token=hidden /Users/private Authorization: secret` });
    assert.match(out, reason);
    for (const forbidden of ['super-secret', 'registry.example', 'hidden', '/Users', 'Authorization']) assert.equal(out.includes(forbidden), false);
  }
});
