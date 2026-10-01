import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { OpenXiangdaAppConfig } from './compiler/config.js';

/** Verify references without copying source code into a browser contract. */
export function validateWorkflowSourceReferences(root: string, config: OpenXiangdaAppConfig): void {
  const workspace = realpathSync(root);
  const files = new Map<string, string>();
  let bytes = 0;
  for (const declaration of config.workflows?.definitions || []) {
    for (const logic of declaration.definition.readability?.logic || []) {
      const reference = logic.source;
      if (!reference) continue;
      const fail = (code: string): never => {
        throw Object.assign(new Error(`${code}: ${declaration.definition.code}/${logic.code}`), { code });
      };
      if (!/^(?:apps|packages|platform)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(reference.path) || reference.path.split('/').some(part => !part || part === '.' || part === '..')) {
        fail('WORKFLOW_LOGIC_SOURCE_PATH_INVALID');
      }
      let digest = files.get(reference.path);
      if (!digest) {
        if (files.size >= 32) fail('WORKFLOW_LOGIC_SOURCE_LIMIT_EXCEEDED');
        let current = workspace;
        try {
          for (const part of reference.path.split('/')) {
            current = resolve(current, part);
            if (lstatSync(current).isSymbolicLink()) fail('WORKFLOW_LOGIC_SOURCE_SYMLINK_FORBIDDEN');
          }
          const inside = relative(workspace, realpathSync(current));
          if (!inside || inside.startsWith(`..${sep}`) || inside === '..') fail('WORKFLOW_LOGIC_SOURCE_PATH_INVALID');
          const stat = lstatSync(current);
          if (!stat.isFile() || stat.size > 2 * 1024 * 1024 || bytes + stat.size > 8 * 1024 * 1024) fail('WORKFLOW_LOGIC_SOURCE_LIMIT_EXCEEDED');
          const source = readFileSync(current);
          bytes += source.length;
          digest = `sha256:${createHash('sha256').update(source).digest('hex')}`;
          files.set(reference.path, digest);
        } catch (error) {
          if ((error as { code?: string }).code?.startsWith('WORKFLOW_')) throw error;
          fail('WORKFLOW_LOGIC_SOURCE_UNAVAILABLE');
        }
      }
      if (digest !== reference.digest) fail('WORKFLOW_LOGIC_DESCRIPTION_STALE');
    }
  }
}
