import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { NATIVE_CONFIGURATION_VALIDATOR_DIGEST } from 'openxiangda-contracts/native-compiler';

const PACKAGES = ['openxiangda-cli', 'openxiangda-contracts', 'openxiangda-devkit-core', 'openxiangda-mcp', 'openxiangda-nest', 'openxiangda-skill-kit'] as const;

function installedManifest(from: string, name: string) {
  const allowed = new Set<string>();
  for (let path = dirname(from); ; path = dirname(path)) {
    allowed.add(join(path, 'node_modules'));
    if (path === dirname(path)) break;
  }
  for (const directory of createRequire(from).resolve.paths(name) || []) {
    // ESM application imports do not consume NODE_PATH or global helper installations.
    if (!allowed.has(directory)) continue;
    const file = join(directory, name, 'package.json');
    if (!existsSync(file)) continue;
    const path = realpathSync(file);
    if (statSync(path).size > 1_000_000) throw new Error('manifest budget exceeded');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (manifest.name !== name || typeof manifest.version !== 'string') throw new Error('manifest identity invalid');
    return { path, manifest };
  }
  return undefined;
}

/** Installation/lock evidence only; never an assertion of registry publication or target readiness. */
export function installedToolchainFacts(root: string) {
  const base = { observedAt: new Date().toISOString(), validatorDigest: NATIVE_CONFIGURATION_VALIDATOR_DIGEST, owner: 'root-package-bom' };
  try {
    const sdk = installedManifest(join(root, 'package.json'), 'openxiangda');
    if (!sdk) return { ...base, state: 'unavailable', reason: 'root-package-not-installed', packages: [] };
    let lock: { path: string; sha256: string; packages: Record<string, any> } | undefined;
    const lockFile = join(root, 'pnpm-lock.yaml');
    if (existsSync(lockFile) && statSync(lockFile).size <= 8 * 1024 * 1024) {
      const content = readFileSync(lockFile, 'utf8');
      const parsed = parse(content, { maxAliasCount: 0 });
      lock = { path: lockFile, sha256: createHash('sha256').update(content).digest('hex'), packages: parsed?.packages || {} };
    }
    const packages = ['openxiangda', ...PACKAGES].map(name => {
      const expected = name === 'openxiangda' ? sdk.manifest.version : sdk.manifest.dependencies?.[name];
      const found = name === 'openxiangda' ? sdk : installedManifest(sdk.path, name);
      const version = found?.manifest.version;
      const integrity = version ? lock?.packages[`${name}@${version}`]?.resolution?.integrity : undefined;
      return { name, expected: typeof expected === 'string' ? expected : null, actual: version || null,
        path: found?.path || null, state: !found ? 'missing' : version === expected ? 'matched' : 'mismatch',
        integrity: typeof integrity === 'string' ? integrity : null };
    });
    return { ...base, state: 'observed', rootPackageVersion: sdk.manifest.version, packages,
      lock: lock ? { path: lock.path, sha256: lock.sha256 } : null,
      complete: packages.every(pkg => pkg.state === 'matched'),
      deliveryOrder: ['maintainer: publish frozen npm bytes, consume SDK in server, pin platform combination, publish and update platform',
        'application: observe target capabilities, update platform if required, install exact SDK, deploy TEST, accept, promote original version'] };
  } catch { return { ...base, state: 'unavailable', reason: 'installation-or-lock-unreadable', packages: [] }; }
}

/** Explain the existing owner's diagnostic. This function never decides validation or authorization. */
export function preflightIssueOwner(issue: { code?: unknown; pointer?: unknown; path?: unknown; capability?: unknown }) {
  const value = `${issue.code || ''} ${issue.pointer || issue.path || ''} ${JSON.stringify(issue.capability || '')}`.toLowerCase();
  if (/file|managedfiles|attachment/.test(value)) return { owner: 'platform-files', next: '核对文件字段、原记录绑定和具名文件授权；按原 fileId 查询' };
  if (/workflow|assignee|approval/.test(value)) return { owner: 'platform-workflow', next: '核对已声明流程、具名操作和流程激活；结构变化先正式 TEST 部署' };
  if (/authz|capability|authorization|role|grant/.test(value)) return { owner: 'platform-authorization', next: '补齐具名授权与角色并集；由原 compiler 校验，不切换活动角色' };
  if (/event|timer|subscription/.test(value)) return { owner: 'platform-events', next: '核对事件事实、订阅和后台处理；正式 TEST 部署后验收' };
  if (/transaction|mutation|data\.resources|\/data\//.test(value)) return { owner: 'platform-data', next: '核对模型、事务与具名数据授权；结构变化先正式 TEST 部署' };
  if (/catalog|directory|candidate/.test(value)) return { owner: 'platform-directory', next: '核对受支持目录和候选来源，按原平台目录查询' };
  return { owner: 'configuration-compiler', next: '按原 pointer 与校验器摘要修正输入；配套不一致先核对平台和精确 SDK' };
}
