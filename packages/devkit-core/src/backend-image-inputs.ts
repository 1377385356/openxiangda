import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import type { Ignore } from '@balena/dockerignore';

const dockerignore = createRequire(import.meta.url)('@balena/dockerignore') as (options: { ignorecase: boolean }) => Ignore;

/** Shared by dependency preflight and the sealed OCI input digest. */
export function backendImageInputBoundary(root: string, dockerfile: string) {
  const ignorePath = existsSync(`${dockerfile}.dockerignore`) ? `${dockerfile}.dockerignore` : join(root, '.dockerignore');
  const rules = readFileSync(ignorePath, 'utf8');
  if (Buffer.byteLength(rules) > 256 * 1024) throw new Error('OPENXIANGDA_BACKEND_IMAGE_CONTEXT_LIMIT: Docker ignore 文件超过 256 KiB');
  const matcher = dockerignore({ ignorecase: false }).add(rules);
  const inputs = backendImageInputPaths(root, dockerfile);
  const relevant = (path: string) => !inputs || inputs.some(input =>
    path === input || path.startsWith(`${input}/`) || input.startsWith(`${path}/`));
  const exceptions = rules.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('!')).map(line => line.slice(1).replace(/^\/+|\/+$/g, ''));
  return {
    ignorePath, rules,
    includes: (path: string) => relevant(path) && !matcher.ignores(path),
    mayIncludeDescendants: (path: string) => relevant(path) && exceptions.some(pattern => {
      if (pattern.includes('\\') || pattern.includes('..') || pattern.startsWith('./')) return true;
      const prefix = pattern.split(/[?*\[]/, 1)[0]!;
      return !prefix || prefix.startsWith(`${path}/`) || `${path}/`.startsWith(prefix);
    }),
  };
}

/** Only reviewed, exact template bodies have a narrower input boundary. Shell is never inferred. */
export function backendImageInputPaths(root: string, dockerfile: string): string[] | null {
  const backendRoot = relative(root, dockerfile).replaceAll('\\', '/').replace(/\/Dockerfile$/, '');
  // The historical public reference changes no local read boundary. Actual bytes still enter the digest.
  const source = readFileSync(dockerfile, 'utf8').replaceAll('\r\n', '\n')
    .replaceAll('FROM node:22-alpine AS ', 'FROM docker.xuanyuan.run/node:22-alpine AS ');
  for (const template of ['backend/Dockerfile', 'backend-inputs/legacy.Dockerfile']) {
    const reviewed = readFileSync(new URL(`../templates/${template}`, import.meta.url), 'utf8')
      .replaceAll('apps/server', backendRoot).replaceAll('\r\n', '\n');
    if (source === reviewed) {
      return ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json',
        backendRoot, 'packages/contracts', 'vendor'];
    }
  }
  return null;
}
