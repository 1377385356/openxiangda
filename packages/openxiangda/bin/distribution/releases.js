import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fail, readJson } from './workspace.js';

export const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const RELEASE_REPOSITORY = 'https://github.com/1377385356/openxiangda';

export function bundledRelease(packageRoot, version) {
  const file = join(packageRoot, 'releases', `${version}.json`);
  if (existsSync(file)) return readJson(file);
  const manifest = readJson(join(packageRoot, 'package.json'));
  return (manifest.openxiangdaRelease?.version === version ? manifest.openxiangdaRelease : null) || {
    version, available: false, url: `${RELEASE_REPOSITORY}/releases/tag/v${version}`,
    summary: '此历史版本未随包提供结构化更新说明。',
  };
}

export function registryMetadata(selector, registry = 'https://registry.npmjs.org') {
  if (!VERSION.test(selector) && !['v1', 'v2', 'latest', 'alpha'].includes(selector)) fail('DISTRIBUTION_VERSION_INVALID', selector);
  const url = new URL(registry);
  if (url.username || url.password || url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) fail('DISTRIBUTION_REGISTRY_INVALID', 'registry 必须为 HTTPS 地址');
  const result = spawnSync('npm', ['view', `openxiangda@${selector}`, '--json', `--registry=${url.href}`], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, npm_config_fetch_retries: '0', npm_config_fetch_timeout: '20000' },
  });
  if (result.error || result.status !== 0) fail('DISTRIBUTION_REGISTRY_UNAVAILABLE', '无法读取版本资料；本地命令与随包说明仍可使用');
  let manifest;
  try { manifest = JSON.parse(result.stdout); } catch { fail('DISTRIBUTION_REGISTRY_RESPONSE_INVALID', 'npm 未返回有效 JSON'); }
  if (!VERSION.test(manifest.version || '') || manifest.name !== 'openxiangda') fail('DISTRIBUTION_REGISTRY_RESPONSE_INVALID', 'npm 返回了不匹配的包');
  return manifest;
}

export function compareVersions(left, right) {
  const parse = version => { const [base, ...pre] = version.split('-'); return { base: base.split('.').map(Number), pre: pre.join('-') }; };
  const a = parse(left), b = parse(right);
  for (let i = 0; i < 3; i++) if (a.base[i] !== b.base[i]) return Math.sign(a.base[i] - b.base[i]);
  if (a.pre === b.pre) return 0;
  if (!a.pre || !b.pre) return a.pre ? -1 : 1;
  const ap = a.pre.split('.'), bp = b.pre.split('.');
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    if (ap[i] === bp[i]) continue;
    if (ap[i] === undefined || bp[i] === undefined) return ap[i] === undefined ? -1 : 1;
    const an = /^\d+$/.test(ap[i]), bn = /^\d+$/.test(bp[i]);
    if (an && bn) return Math.sign(Number(ap[i]) - Number(bp[i]));
    if (an !== bn) return an ? -1 : 1;
    return ap[i] < bp[i] ? -1 : 1;
  }
  return 0;
}
