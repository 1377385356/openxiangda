import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const distributions = [['../../skills', 'skills']];

// Remove copies left by pre-alpha packages. The public Skill kit deliberately
// does not bundle the documentation site or its design screenshots.
await rm(resolve(packageRoot, 'docs'), { recursive: true, force: true });

for (const [sourcePath, targetPath] of distributions) {
  const source = resolve(packageRoot, sourcePath);
  const target = resolve(packageRoot, targetPath);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}
