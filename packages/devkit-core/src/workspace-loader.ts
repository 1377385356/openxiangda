import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  defineOpenXiangdaApp,
  type OpenXiangdaAppConfig,
  type OpenXiangdaAppDeclaration,
} from './compiler/config.js';
import { OPENXIANGDA_TOOLCHAIN_VERSION } from './version.js';
import { createWorkspaceContext } from './workspace.js';

const CONFIG_NAMES = ['openxiangda.config.ts', 'openxiangda-app.config.ts'];

export interface LoadedWorkspace {
  root: string;
  configPath: string;
  config: OpenXiangdaAppConfig;
  packageJson: Record<string, unknown>;
  context: ReturnType<typeof createWorkspaceContext>;
}

export async function loadWorkspace(
  start = process.cwd(),
  toolchainVersion = OPENXIANGDA_TOOLCHAIN_VERSION
): Promise<LoadedWorkspace> {
  const { root, configPath } = discoverWorkspace(start);
  const config = await loadAppConfig(configPath);
  const packageJson = readJson(join(root, 'package.json'));
  const revision = git(root, ['rev-parse', 'HEAD']);
  const repository = git(root, ['config', '--get', 'remote.origin.url']);
  const dirty = Boolean(git(root, ['status', '--porcelain']));
  const changedDomains = changedAreas(root);
  const packageManager = String(packageJson.packageManager || 'pnpm');
  return {
    root,
    configPath,
    config,
    packageJson,
    context: createWorkspaceContext(config, {
      root,
      toolchainVersion,
      nodeVersion: process.version,
      packageManager,
      ...(repository ? { repository } : {}),
      ...(revision ? { revision } : {}),
      dirty,
      changedDomains,
    }),
  };
}

export function discoverWorkspace(start = process.cwd()) {
  let current = resolve(start);
  const filesystemRoot = parse(current).root;
  while (true) {
    for (const name of CONFIG_NAMES) {
      const configPath = join(current, name);
      if (existsSync(configPath)) return { root: current, configPath };
    }
    if (current === filesystemRoot) break;
    current = dirname(current);
  }
  throw Object.assign(
    new Error('未找到 openxiangda.config.ts；当前目录不是 2.0 应用工作区'),
    { code: 'OPENXIANGDA_V2_WORKSPACE_NOT_FOUND' }
  );
}

export async function loadAppConfig(configPath: string) {
  const moduleRoot = dirname(fileURLToPath(import.meta.url));
  const schemaCompositionModule = [
    join(moduleRoot, 'compiler', 'schema-composition.js'),
    join(moduleRoot, 'compiler', 'schema-composition.ts'),
  ].find(existsSync);
  if (!schemaCompositionModule) {
    throw new Error('OPENXIANGDA_CONFIG_SCHEMA_HELPERS_MISSING');
  }
  const configHelpersModule = [
    join(moduleRoot, 'compiler', 'config.js'),
    join(moduleRoot, 'compiler', 'config.ts'),
  ].find(existsSync);
  const modelHelpersModule = [
    join(moduleRoot, 'compiler', 'application-model.js'),
    join(moduleRoot, 'compiler', 'application-model.ts'),
  ].find(existsSync);
  if (!configHelpersModule || !modelHelpersModule) {
    throw new Error('OPENXIANGDA_CONFIG_HELPERS_MISSING');
  }
  const result = await build({
    entryPoints: [configPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    // Application workspace packages expose committed JavaScript for normal
    // Node/Vite execution and their current TypeScript sources only to the
    // declaration compiler. This prevents stale dist files from being sealed
    // while keeping production runtimes free of TypeScript loaders.
    conditions: ['openxiangda-source', 'import', 'default'],
    write: false,
    sourcemap: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'openxiangda-config-contract',
        setup(context) {
          context.onResolve(
            { filter: /^openxiangda-config-helpers$/ },
            () => ({ path: configHelpersModule })
          );
          context.onResolve(
            { filter: /^openxiangda-model-helpers$/ },
            () => ({ path: modelHelpersModule })
          );
          context.onResolve(
            { filter: /^openxiangda-schema-composition$/ },
            () => ({ path: schemaCompositionModule })
          );
          context.onResolve(
            { filter: /^openxiangda\/config$/ },
            () => ({ path: 'config', namespace: 'openxiangda-config' })
          );
          context.onLoad(
            { filter: /.*/, namespace: 'openxiangda-config' },
            () => ({
              loader: 'js',
              contents:
                'export const defineOpenXiangdaApp = value => Object.freeze(value); export const defineAdminNavigation = value => Object.freeze(value); export const adminNavigationGroup = (code, label, items, options = {}) => ({ code, label, items, ...options }); export const adminResourcePage = (resourceCode, options = {}) => ({ page: { kind: "resource", resourceCode }, ...options }); export const adminOperationPage = (routeCode, options = {}) => ({ page: { kind: "operation", routeCode }, ...options }); export const adminApplicationTodoCenterPage = (options = {}) => ({ page: { kind: "application-todo-center" }, ...options }); export const resourceCapabilityCodes = (appCode, resourceCode) => { const prefix = `app:${appCode}:data:${resourceCode}`; return { read: `${prefix}:read`, create: `${prefix}:create`, update: `${prefix}:update`, delete: `${prefix}:delete` }; }; export const currentUserDataPolicy = input => ({ code: input.code, name: input.name, resourceCode: input.resourceCode, ...(input.unrestrictedRoleCodes ? { unrestrictedRoleCodes: [...input.unrestrictedRoleCodes] } : {}), matchMode: "AND", rules: [{ subject: "current_user", field: input.field, roleCodes: [...input.roleCodes] }] }); export const dataPolicyExpression = { allOf: (...values) => ({ allOf: values }), anyOf: (...values) => ({ anyOf: values }), constant: input => ({ ...input }), null: input => ({ ...input }), databaseNow: input => ({ ...input, operand: "db_now" }), currentUser: input => ({ ...input, subject: "current_user" }), dimension: input => ({ ...input }), relation: input => ({ ...input }) }; export const resourceReadPolicy = input => ({ code: input.code, name: input.name, resourceCode: input.resourceCode, ...(input.unrestrictedRoleCodes ? { unrestrictedRoleCodes: [...input.unrestrictedRoleCodes] } : {}), matchMode: input.writeBoundary === "capability_only" ? "AND" : input.matchMode, rules: input.writeBoundary === "capability_only" ? [] : input.rules, readExpression: input.expression, ...(input.writeBoundary === "capability_only" ? { writeBoundary: "capability_only" } : {}) });' +
                ' export { composeAppOperationSchemas, composeJsonSchema, resourceRecordSchema, schemaRef } from "openxiangda-schema-composition";' +
                ' export { defineApplicationModule, defineDataModel, defineResourceForm, defineResourceList } from "openxiangda-model-helpers";' +
                ' export { resourceRoleCapabilities } from "openxiangda-config-helpers";',
            })
          );
        },
      },
    ],
  });
  const source = result.outputFiles[0]?.text;
  if (!source) throw new Error('OPENXIANGDA_V2_CONFIG_COMPILE_EMPTY');
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  )) as { default?: OpenXiangdaAppDeclaration };
  if (!module.default) throw new Error('OPENXIANGDA_V2_CONFIG_DEFAULT_REQUIRED');
  return defineOpenXiangdaApp(module.default);
}

export function git(root: string, args: string[]) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function readJson(path: string) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function changedAreas(root: string) {
  const paths = git(root, ['status', '--porcelain'])
    .split('\n')
    .map(line => line.slice(3).trim())
    .filter(Boolean);
  const values = new Set<
    'frontend' | 'backend' | 'data' | 'authz' | 'events' | 'workflow' | 'config'
  >();
  for (const path of paths) {
    if (path.startsWith('apps/web/')) values.add('frontend');
    else if (path.startsWith('apps/server/')) values.add('backend');
    else if (path.startsWith('platform/data/')) values.add('data');
    else if (path.startsWith('platform/authz/')) values.add('authz');
    else if (path.startsWith('platform/events/')) values.add('events');
    else if (path.startsWith('platform/workflows/')) values.add('workflow');
    else values.add('config');
  }
  return [...values];
}
