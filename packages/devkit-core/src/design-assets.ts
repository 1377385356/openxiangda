import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface DesignAsset { path: string; bytes: number; sha256: string }
export const DESIGN_ASSET_LIMITS = { files: 128, fileBytes: 2 * 1024 * 1024, totalBytes: 8 * 1024 * 1024, depth: 16 };
export function validDesignAssetPath(path: string) {
  return /^appspec\/design\/(?:system|prototypes|assets)(?:\/[^/\\\u0000-\u001f\u007f]+)*$/u.test(path)
    && !path.split('/').some(part => part === '.' || part === '..');
}

/** Per inspection shared budget; only hashes local bytes and never executes artifacts. */
export function designAssetReader(root: string) {
  const cache = new Map<string, DesignAsset>();
  const directories = new Map<string, DesignAsset[]>();
  let total = 0;
  let entries = 0;
  function visit(path: string, depth: number): DesignAsset[] {
    if (!validDesignAssetPath(path)) throw new Error('APPSPEC_DESIGN_ASSET_PATH_INVALID');
    const cachedDirectory = directories.get(path);
    if (cachedDirectory) return cachedDirectory;
    if (depth > DESIGN_ASSET_LIMITS.depth || ++entries > 512) throw new Error('APPSPEC_DESIGN_ASSET_LIMIT');
    const absolute = join(root, path);
    // Check each ancestor as well as the leaf, including appspec itself.
    let parent = root;
    for (const part of path.split('/')) {
      parent = join(parent, part);
      if (lstatSync(parent).isSymbolicLink()) throw new Error('APPSPEC_DESIGN_ASSET_SYMLINK');
    }
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      const children = readdirSync(absolute).sort();
      if (!children.length) throw new Error('APPSPEC_DESIGN_ASSET_EMPTY');
      const assets = children.flatMap(name => visit(`${path}/${name}`, depth + 1));
      directories.set(path, assets);
      return assets;
    }
    if (!stat.isFile()) throw new Error('APPSPEC_DESIGN_ASSET_INVALID');
    const cached = cache.get(path);
    if (cached) return [cached];
    if (cache.size >= DESIGN_ASSET_LIMITS.files || stat.size > DESIGN_ASSET_LIMITS.fileBytes || total + stat.size > DESIGN_ASSET_LIMITS.totalBytes) throw new Error('APPSPEC_DESIGN_ASSET_LIMIT');
    const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.size !== stat.size || opened.ino !== stat.ino) throw new Error('APPSPEC_DESIGN_ASSET_CHANGED');
      const buffer = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = readSync(fd, buffer, length, buffer.length - length, null);
        if (!read) break;
        length += read;
      }
      if (length !== stat.size || fstatSync(fd).mtimeMs !== opened.mtimeMs) throw new Error('APPSPEC_DESIGN_ASSET_CHANGED');
      const bytes = buffer.subarray(0, length);
      total += bytes.length;
      const asset = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      cache.set(path, asset);
      return [asset];
    } finally { closeSync(fd); }
  }
  return (paths: string[]) => {
    if (paths.length > DESIGN_ASSET_LIMITS.files || paths.some(path => !validDesignAssetPath(path))) throw new Error('APPSPEC_DESIGN_ASSET_PATH_INVALID');
    const assets = paths.flatMap(path => visit(path, 0));
    return [...new Map(assets.map(asset => [asset.path, asset])).values()].sort((a, b) => a.path.localeCompare(b.path));
  };
}
