import { spawnSync } from 'node:child_process';
import {
  closeSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendRuntimeRequired, type OpenXiangdaAppConfig } from './compiler/config.js';

export interface OptionalBackendInitialization {
  required: boolean;
  created: boolean;
  installed: boolean;
  root: string;
}

/** Initialize user-owned source only when the application declares server execution. */
export function initializeOptionalBackend(
  workspaceRoot: string,
  config: OpenXiangdaAppConfig,
  options: {
    sdkVersion?: string;
    /** Package manager boundary, injectable by deterministic toolchain tests. */
    install?: (root: string) => void;
  } = {},
): OptionalBackendInitialization {
  const root = resolve(workspaceRoot);
  const required = backendRuntimeRequired(config);
  const result = { required, created: false, installed: false, root: config.backend.root };
  if (!required) return result;
  const target = resolve(root, config.backend.root);
  assertContainedPath(root, target);
  const receiptRoot = join(root, '.openxiangda');
  assertContainedPath(root, receiptRoot);
  const receipt = join(receiptRoot, 'backend-install-pending.json');
  assertContainedPath(root, receipt);
  // Existing authored backends belong to the app; no regeneration or reinstall.
  if (existsSync(target) && !existsSync(receipt)) return result;
  mkdirSync(receiptRoot, { recursive: true });
  const lock = join(receiptRoot, 'backend-initialization.lock');
  assertContainedPath(root, lock);
  const lockFd = acquireInitializationLock(lock);
  let staging: string | undefined;
  try {
    assertContainedPath(root, target);
    if (!existsSync(target)) {
      const sdkVersion = options.sdkVersion || workspaceSdkVersion(root);
      if (!sdkVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdkVersion)) {
        throw initializationError('OPENXIANGDA_BACKEND_SDK_VERSION_REQUIRED',
          '按需后端需要工作区精确版本的 openxiangda 依赖');
      }
      const source = fileURLToPath(new URL('../templates/backend/', import.meta.url));
      mkdirSync(dirname(target), { recursive: true });
      staging = mkdtempSync(join(dirname(target), '.openxiangda-backend-'));
      cpSync(source, staging, {
        recursive: true,
        filter: path => !/(?:^|\/)(?:node_modules|dist)(?:\/|$)/.test(relative(source, path)),
      });
      const manifestPath = join(staging, 'package.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.dependencies.openxiangda = sdkVersion;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const tsconfigPath = join(staging, 'tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      tsconfig.extends = relative(target, join(root, 'tsconfig.base.json')).split(sep).join('/');
      writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
      const dockerfilePath = join(staging, 'Dockerfile');
      writeFileSync(dockerfilePath, readFileSync(dockerfilePath, 'utf8')
        .replaceAll('apps/server', relative(root, target).split(sep).join('/')));
      // Write the retry receipt before committing source so interrupted setup is resumable.
      if (!existsSync(receipt)) {
        writeFileSync(receipt, `${JSON.stringify({ root: config.backend.root })}\n`, { flag: 'wx' });
      } else if (JSON.parse(readFileSync(receipt, 'utf8')).root !== config.backend.root) {
        throw initializationError('OPENXIANGDA_BACKEND_INITIALIZATION_CONFLICT', '未完成的后端初始化与当前声明不一致');
      }
      if (existsSync(target)) throw initializationError(
        'OPENXIANGDA_BACKEND_SOURCE_CONFLICT', '后端目录已由另一操作创建，未覆盖其内容');
      renameSync(staging, target);
      staging = undefined;
      result.created = true;
    }
    if (existsSync(receipt)) {
      const pending = JSON.parse(readFileSync(receipt, 'utf8'));
      if (pending.root !== config.backend.root || !existsSync(join(target, 'package.json'))) {
        throw initializationError('OPENXIANGDA_BACKEND_INITIALIZATION_CONFLICT',
          '未完成的后端初始化与当前声明不一致；请检查 .openxiangda/backend-install-pending.json');
      }
      (options.install || installBackendDependencies)(root);
      rmSync(receipt);
      result.installed = true;
    }
    return result;
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    closeSync(lockFd);
    rmSync(lock, { force: true });
  }
}

function acquireInitializationLock(path: string): number {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, 'wx');
      writeFileSync(fd, String(process.pid));
      return fd;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = readFileSync(path, 'utf8');
      const pid = Number(owner);
      if (Number.isSafeInteger(pid) && pid > 0 && pid <= 2147483647) {
        try { process.kill(pid, 0); }
        catch (probe) {
          if ((probe as NodeJS.ErrnoException).code === 'ESRCH' && readFileSync(path, 'utf8') === owner) {
            rmSync(path);
            continue;
          }
        }
      }
      break;
    }
  }
  throw initializationError('OPENXIANGDA_BACKEND_INITIALIZATION_BUSY',
    '另一进程正在初始化后端；待其完成后重试', true);
}

function workspaceSdkVersion(root: string): string | undefined {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return manifest.devDependencies?.openxiangda || manifest.dependencies?.openxiangda;
}

function installBackendDependencies(root: string) {
  const installed = spawnSync('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], {
    cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (installed.status !== 0 || installed.error) {
    throw initializationError('OPENXIANGDA_BACKEND_INSTALL_FAILED',
      '后端源码已保留，依赖安装未完成；检查包管理器/网络后重新运行 openxiangda check 或 dev', true);
  }
}

function assertContainedPath(root: string, target: string) {
  const name = relative(root, target);
  if (!name || name.startsWith(`..${sep}`) || name === '..' || isAbsolute(name)) {
    throw initializationError('OPENXIANGDA_BACKEND_PATH_INVALID', '后端目录必须位于当前工作区内');
  }
  let current = root;
  for (const part of name.split(sep)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw initializationError('OPENXIANGDA_BACKEND_PATH_INVALID', '后端目录不能穿过符号链接');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function initializationError(code: string, message: string, retryable = false) {
  return Object.assign(new Error(`${code}: ${message}`), { code, retryable });
}
