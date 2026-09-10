import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const releases = 'https://github.com/nexu-io/open-design/releases/latest';
const probeToken = 'open-design-cli:mcp-install:v1';
const help = `OpenDesign 原版入口

  openxiangda design open            打开原版桌面；显式 CLI 安装启动原生服务
  openxiangda design status [--json]  查看安装、原版版本与当前桌面服务
  openxiangda design cli <args...>    原样运行完整原生 CLI（参数和输出归上游）
  openxiangda design cli --help       查看原版命令帮助
  openxiangda design cli mcp          运行原版 stdio MCP

安装：${releases}
macOS 自动发现 /Applications 或 ~/Applications 中的 Open Design.app。
其他安装使用绝对路径 OPENXIANGDA_OPENDESIGN_CLI（或原生 OD_BIN），
JS 入口可使用 OD_NODE_BIN 指定原版 Node 运行时。不会搜索 PATH 中的 od。
原版更新、Agent 登录和设计项目由 OpenDesign 管理。
`;

export interface DesignInstallation {
  kind: 'desktop' | 'cli';
  cli: string;
  command: string;
  prefix: string[];
  version?: string;
  appPath?: string;
  sidecarPath?: string;
  releasePath?: string;
  namespace?: string;
}

function failure(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function absoluteFile(value: string) {
  if (!isAbsolute(value) || !existsSync(value) || !statSync(value).isFile()) {
    failure('OPENDESIGN_ENTRY_INVALID', '需要存在的绝对文件路径');
  }
  return realpathSync(value);
}

function readConfig(file: string): Record<string, unknown> {
  if (statSync(file).size > 64 * 1024) failure('OPENDESIGN_CONFIG_INVALID', '配置超过 64 KiB');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function bundledFile(root: string, value: unknown) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) failure('OPENDESIGN_CONFIG_INVALID', '包内入口必须是相对路径');
  const file = absoluteFile(resolve(root, value));
  const part = relative(realpathSync(root), file);
  if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) failure('OPENDESIGN_CONFIG_INVALID', '入口超出原版安装包');
  return file;
}

export function discoverOpenDesign(options: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  desktopPaths?: string[];
} = {}): DesignInstallation {
  const env = options.env ?? process.env;
  const explicit = env.OPENXIANGDA_OPENDESIGN_CLI || env.OD_BIN;
  if (explicit) {
    const cli = absoluteFile(explicit);
    const script = /\.[cm]?js$/i.test(cli);
    return { kind: 'cli', cli, command: script ? (env.OD_NODE_BIN ? absoluteFile(env.OD_NODE_BIN) : process.execPath) : cli, prefix: script ? [cli] : [] };
  }
  const candidates = options.desktopPaths ?? ((options.platform ?? process.platform) === 'darwin'
    ? ['/Applications/Open Design.app', join(options.home ?? homedir(), 'Applications/Open Design.app')]
    : []);
  for (const appPath of candidates) {
    if (!existsSync(appPath)) continue;
    const resources = join(appPath, 'Contents/Resources');
    const configFile = join(resources, 'open-design-config.json');
    if (!existsSync(configFile)) failure('OPENDESIGN_CONFIG_INVALID', '原版安装缺少 open-design-config.json');
    const config = readConfig(configFile);
    const manifest = readConfig(join(resources, 'app/package.json'));
    if (manifest.name !== 'open-design-packaged-app' || typeof config.namespace !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(config.namespace)) {
      failure('OPENDESIGN_CONFIG_INVALID', '不支持的原版包标识或命名空间');
    }
    const cli = bundledFile(resources, config.daemonCliEntryRelative);
    const version = typeof config.appVersion === 'string' ? config.appVersion : String(manifest.version);
    return {
      kind: 'desktop', appPath: realpathSync(appPath), cli,
      command: process.execPath, prefix: [cli], version,
      sidecarPath: bundledFile(resources, 'app/node_modules/@open-design/sidecar/dist/index.mjs'),
      releasePath: bundledFile(resources, 'app/node_modules/@open-design/release/dist/index.mjs'),
      namespace: config.namespace,
    };
  }
  failure('OPENDESIGN_NOT_INSTALLED', `请安装原版 OpenDesign：${releases}；其他安装指定 OPENXIANGDA_OPENDESIGN_CLI`);
}

export function verifyOpenDesign(installation: DesignInstallation, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(installation.command, [...installation.prefix, 'mcp', 'install', '--open-design-cli-probe'], {
    env, encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true,
  });
  if (result.error || result.status !== 0 || result.stdout.trim() !== probeToken) {
    failure('OPENDESIGN_ENTRY_UNRECOGNIZED', '入口未通过原版 CLI 身份探测；检查安装或显式路径');
  }
}

export async function desktopRuntime(installation: DesignInstallation) {
  if (!installation.sidecarPath) return null;
  const upstream = await import(pathToFileURL(installation.sidecarPath).href);
  const release = installation.releasePath ? await import(pathToFileURL(installation.releasePath).href) : null;
  if (typeof upstream.getSidecarStatus !== 'function' || typeof release?.releaseChannelFromVersion !== 'function') failure('OPENDESIGN_RUNTIME_API_CHANGED', '原版运行发现接口已变化，请更新享搭桥接或指定原生 CLI 环境');
  const channel = release.releaseChannelFromVersion(installation.version);
  if (!channel) failure('OPENDESIGN_CONFIG_INVALID', '原版无法识别安装版本所属通道');
  const stamp = { app: 'daemon', channel, namespace: installation.namespace, source: 'packaged' };
  for (const mode of ['runtime', 'headless']) {
    try {
      const status = await upstream.getSidecarStatus({ ...stamp, mode }, { timeoutMs: 1000 });
      if (status?.state !== 'running' || typeof status.url !== 'string') continue;
      const url = new URL(status.url);
      if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.username || url.password) {
        failure('OPENDESIGN_RUNTIME_INVALID', '原版桌面返回了非本地服务地址');
      }
      return { url: url.origin, mode, pid: status.pid as number };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('OPENDESIGN_')) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (!['ENOENT', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code ?? '')) {
        failure('OPENDESIGN_RUNTIME_UNAVAILABLE', String(error));
      }
    }
  }
  return null;
}

export async function forwardOpenDesign(installation: DesignInstallation, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return await new Promise<number>((resolveExit, reject) => {
    const child = spawn(installation.command, [...installation.prefix, ...args], { env, stdio: 'inherit', shell: false, windowsHide: true });
    const signals = ['SIGINT', 'SIGTERM'] as const;
    const listeners = signals.map(signal => () => { child.kill(signal); });
    signals.forEach((signal, index) => process.on(signal, listeners[index]!));
    const cleanup = () => signals.forEach((signal, index) => process.off(signal, listeners[index]!));
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => { cleanup(); resolveExit(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)); });
  });
}

export async function runDesign(args: string[]) {
  if (args[0] === '--help' || args[0] === '-h') { process.stdout.write(help); return 0; }
  const action = args[0] ?? 'open';
  if (!['open', 'status', 'cli'].includes(action)) failure('OPENDESIGN_ACTION_INVALID', '使用 design open、status 或 cli <原生参数>');
  if (action !== 'cli' && args.slice(1).some(arg => action !== 'status' || arg !== '--json')) failure('OPENDESIGN_ARGUMENT_INVALID', '原版参数应放在 design cli 后面');
  const installation = discoverOpenDesign();
  verifyOpenDesign(installation);
  if (action === 'open') {
    if (installation.appPath) return await forwardOpenDesign({ ...installation, command: '/usr/bin/open', prefix: ['-a', installation.appPath] }, []);
    return await forwardOpenDesign(installation, []);
  }
  const runtime = await desktopRuntime(installation);
  if (action === 'status') {
    const data = { installed: true, kind: installation.kind, version: installation.version ?? null, cli: installation.cli, runtime, daemonUrlOverride: Boolean(process.env.OD_DAEMON_URL), upstream: releases };
    process.stdout.write(args.includes('--json') ? `${JSON.stringify(data)}\n` : `OpenDesign ${data.version ?? '(原生 CLI)'}\n${installation.cli}\n${runtime ? `运行中：${runtime.url}` : '未发现桌面服务；运行 design open，或沿用显式原生环境'}\n`);
    return 0;
  }
  const nativeArgs = args.slice(1);
  if (nativeArgs[0] === '--') nativeArgs.shift();
  if (!nativeArgs.length) failure('OPENDESIGN_ARGUMENT_INVALID', '使用 design open 启动，或 design cli --help 查看原版命令');
  return await forwardOpenDesign(installation, nativeArgs, {
    ...process.env,
    ...(runtime && !process.env.OD_DAEMON_URL ? { OD_DAEMON_URL: runtime.url } : {}),
  });
}
