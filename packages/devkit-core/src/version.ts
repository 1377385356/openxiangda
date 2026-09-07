import { readFileSync } from 'node:fs';

interface PackageManifest {
  version?: unknown;
}

function readToolchainVersion() {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as PackageManifest;
  const version = String(manifest.version || '').trim();
  if (!version) throw new Error('OPENXIANGDA_TOOLCHAIN_VERSION_MISSING');
  return version;
}

/** Runtime version of this independently published Devkit package. */
export const OPENXIANGDA_TOOLCHAIN_VERSION = readToolchainVersion();
