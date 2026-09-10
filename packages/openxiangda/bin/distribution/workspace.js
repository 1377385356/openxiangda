import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

export function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

export function readJson(file) {
  if (statSync(file).size > 2 * 1024 * 1024) fail('DISTRIBUTION_FILE_TOO_LARGE', file);
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { fail('DISTRIBUTION_JSON_INVALID', file); }
}

export function flagValue(args, name) {
  const values = [];
  for (let i = 0; i < args.length && args[i] !== '--'; i++) {
    if (args[i] === name) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) fail('DISTRIBUTION_ARGUMENT_REQUIRED', name);
      values.push(args[++i]);
    } else if (args[i].startsWith(`${name}=`)) values.push(args[i].slice(name.length + 1));
  }
  if (values.length > 1 || values.some(value => !value)) fail('DISTRIBUTION_ARGUMENT_INVALID', name);
  return values[0];
}

// Discovery reads markers only. Loading either generation's executable config belongs to its engine.
export function discoverWorkspace(cwd, { allowMissing = false, exact = false } = {}) {
  if (allowMissing && !existsSync(resolve(cwd))) return null;
  let root = realpathSync(resolve(cwd));
  const userHome = existsSync(homedir()) ? realpathSync(homedir()) : resolve(homedir());
  if (!statSync(root).isDirectory()) fail('WORKSPACE_DIRECTORY_REQUIRED', root);
  while (true) {
    const v2 = ['openxiangda.config.ts', 'openxiangda-app.config.ts'].filter(file => existsSync(join(root, file)));
    const v1 = ['app-workspace.config.ts'].filter(file => existsSync(join(root, file)));
    const binding = join(root, '.openxiangda/state.json');
    if (existsSync(binding)) {
      const state = readJson(binding);
      if (state.version === 1 && state.profiles && typeof state.profiles === 'object') v1.push('.openxiangda/state.json');
    }
    // Auth-only directories are workspace boundaries. Discover filenames, never credentials.
    if (root !== userHome && !v1.length && !v2.length) {
      if (existsSync(join(root, '.openxiangda/session.json'))) v2.push('.openxiangda/session.json');
      if (existsSync(join(root, '.openxiangda/profiles.json'))) v1.push('.openxiangda/profiles.json');
    }
    if (v1.length && v2.length || v2.length > 1) fail('WORKSPACE_GENERATION_CONFLICT', `${root} 同时存在冲突的工作区标记：${[...v1, ...v2].join(', ')}`);
    if (v1.length || v2.length) return { root, generation: v1.length ? 'v1' : 'v2', markers: [...v1, ...v2] };
    if (exact) return null;
    const parent = dirname(root);
    if (parent === root) return null;
    root = parent;
  }
}

export function packageEngine(packageRoot, generation, source, declaredVersion = null) {
  packageRoot = realpathSync(packageRoot);
  const manifest = readJson(join(packageRoot, 'package.json'));
  const major = generation === 'v1' ? '1' : '2';
  if (manifest.name !== 'openxiangda' || !manifest.version?.startsWith(`${major}.`)) {
    fail('WORKSPACE_ENGINE_GENERATION_MISMATCH', `${packageRoot} 需要 ${generation} openxiangda`);
  }
  if (/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(declaredVersion || '') && manifest.version !== declaredVersion) {
    fail('WORKSPACE_ENGINE_PIN_MISMATCH', `项目声明 ${declaredVersion}，已安装 ${manifest.version}；请先按锁文件安装依赖`);
  }
  let entry;
  if (generation === 'v1') {
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.openxiangda;
    if (!bin) fail('WORKSPACE_ENGINE_BIN_MISSING', packageRoot);
    entry = resolve(packageRoot, bin);
    if (!entry.startsWith(`${realpathSync(packageRoot)}/`) && !entry.startsWith(`${resolve(packageRoot)}/`)) fail('WORKSPACE_ENGINE_BIN_INVALID', entry);
  } else {
    try { entry = createRequire(join(packageRoot, 'package.json')).resolve('openxiangda-cli/run'); }
    catch { fail('WORKSPACE_ENGINE_DEPENDENCY_MISSING', `${packageRoot}: openxiangda-cli`); }
  }
  if (!existsSync(entry)) fail('WORKSPACE_ENGINE_BIN_MISSING', entry);
  return { generation, version: manifest.version, source, packageRoot: realpathSync(packageRoot), entry, declaredVersion };
}

export function resolveEngine(workspace, launcherRoot) {
  const generation = workspace?.generation || 'v2';
  if (workspace) {
    const manifestFile = join(workspace.root, 'package.json');
    const manifest = existsSync(manifestFile) ? readJson(manifestFile) : {};
    const declaredVersion = manifest.dependencies?.openxiangda || manifest.devDependencies?.openxiangda;
    const installed = join(workspace.root, 'node_modules/openxiangda');
    if (existsSync(join(installed, 'package.json'))) return packageEngine(installed, generation, 'workspace', declaredVersion);
    if (declaredVersion) fail('WORKSPACE_ENGINE_NOT_INSTALLED', `${workspace.root} 已声明 openxiangda；请先按项目锁文件安装依赖`);
  }
  if (generation === 'v2') return packageEngine(launcherRoot, 'v2', 'launcher');
  let legacyManifest;
  try { legacyManifest = createRequire(join(launcherRoot, 'package.json')).resolve('openxiangda-legacy/package.json'); }
  catch { fail('DISTRIBUTION_LEGACY_ENGINE_MISSING', '请重新安装完整的统一入口'); }
  return packageEngine(dirname(legacyManifest), 'v1', 'bundled-v1');
}
