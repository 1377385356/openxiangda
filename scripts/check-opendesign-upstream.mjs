import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateDesignCapabilities } from './design-capabilities.mjs';

const API = 'https://api.github.com/repos/nexu-io/open-design';
export function compareDesignTree(lock, files, tree, revision) {
  if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.length > 100_000) throw new Error('DESIGN_UPSTREAM_TREE_INCOMPLETE');
  const blobs = new Map(tree.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry.sha]));
  const changes = lock.files.filter(file => !file.path.startsWith('attribution/')).flatMap(file => {
    const source = Buffer.from(files.get(file.path));
    const oldBlob = createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
    const next = blobs.get(file.path);
    return next === oldBlob ? [] : [{ path: file.path, status: next ? 'modified' : 'removed', previousBlob: oldBlob, candidateBlob: next || null }];
  });
  const known = new Map(lock.catalog.map(entry => [entry.path, entry.sha]));
  const selected = new Set(lock.files.map(entry => entry.path));
  const candidatePath = path => /^(skills|design-templates)\/[^/]+\/SKILL\.md$|^craft\/[^/]+\.md$|^design-systems\/[^/]+\/manifest\.json$/.test(path);
  const candidates = [...blobs].filter(([path, sha]) => candidatePath(path) && !selected.has(path) && known.get(path) !== sha)
    .map(([path, sha]) => ({ path, status: known.has(path) ? 'modified' : 'added', candidateBlob: sha }));
  return { schema: 'openxiangda.design-update/v1', checkedRevision: revision, installedRevision: lock.revision,
    updateAvailable: changes.length > 0 || candidates.length > 0, changes, candidates,
    comparison: `${lock.repository}/compare/${lock.revision}...${revision}`,
    next: 'Review selected changes and candidate resources, update in a temporary checkout, validate dependencies/licenses and the runnable design sample before a Changeset release. This check never installs resources.' };
}

export async function checkDesignUpstream(root, fetcher = fetch) {
  const { lock, files } = validateDesignCapabilities(root);
  async function json(path) {
    const response = await fetcher(`${API}${path}`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`DESIGN_UPSTREAM_HTTP_${response.status}: ${path}`);
    if (!response.body) throw new Error('DESIGN_UPSTREAM_RESPONSE_EMPTY');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16 * 1024 * 1024) throw new Error('DESIGN_UPSTREAM_RESPONSE_LIMIT');
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    } finally { await reader.cancel(); reader.releaseLock(); }
  }
  const head = await json('/commits/main');
  if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('DESIGN_UPSTREAM_REVISION_INVALID');
  return compareDesignTree(lock, files, await json(`/git/trees/${head.sha}?recursive=1`), head.sha);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await checkDesignUpstream(resolve(import.meta.dirname, '..'));
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const output = process.argv.indexOf('--output');
  if (output >= 0) {
    if (!process.argv[output + 1]) throw new Error('DESIGN_UPDATE_OUTPUT_REQUIRED');
    writeFileSync(resolve(process.argv[output + 1]), text, { flag: 'wx' });
  }
  console.log(text);
}
