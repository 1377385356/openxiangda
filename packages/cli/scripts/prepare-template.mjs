import {
  copyFile,
  cp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const packagesRoot = resolve(packageRoot, '..');
const source = resolve(packageRoot, '../../templates/application');
const target = resolve(packageRoot, 'template');

await rm(target, { recursive: true, force: true });
await cp(source, target, {
  recursive: true,
  filter(path) {
    const relative = path.slice(source.length).replaceAll('\\', '/');
    return !/(?:^|\/)(?:node_modules|dist|coverage|playwright-report|test-results|\.openxiangda|\.turbo|\.turbopack|\.umi|\.umi-production)(?:\/|$)/.test(relative);
  },
});
await sealTemplateDependencyVersions(target, await workspacePackageVersions());
await copyFile(resolve(source, '.gitignore'), resolve(target, '_gitignore'));

async function workspacePackageVersions() {
  const versions = new Map();
  for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(packagesRoot, entry.name, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (isOpenXiangdaPackageName(manifest.name)) {
      versions.set(manifest.name, manifest.version);
    }
  }
  return versions;
}

async function sealTemplateDependencyVersions(root, versions) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      await sealTemplateDependencyVersions(path, versions);
      continue;
    }
    if (!entry.isFile() || entry.name !== 'package.json') continue;
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    let changed = false;
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ]) {
      for (const [name, version] of Object.entries(manifest[section] || {})) {
        if (!isOpenXiangdaPackageName(name) || !version.startsWith('workspace:')) {
          continue;
        }
        const exactVersion = versions.get(name);
        if (!exactVersion) {
          throw new Error(`TEMPLATE_DEPENDENCY_VERSION_UNRESOLVED: ${name}`);
        }
        manifest[section][name] = exactVersion;
        changed = true;
      }
    }
    if (changed) {
      await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  }
}

function isOpenXiangdaPackageName(name) {
  return name === 'openxiangda' || name?.startsWith('openxiangda-');
}
