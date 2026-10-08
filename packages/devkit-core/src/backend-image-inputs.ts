import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

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
