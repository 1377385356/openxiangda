import { spawnSync } from 'node:child_process';
import { releasePublicationHasStarted } from './release-receipt-state.mjs';

export function frozenReleaseAllowsMainlineAdvance(receipt, head) {
  return receipt?.schema === 'openxiangda.release-receipt/v2'
    && receipt.head === head
    && /^[0-9a-f]{64}$/.test(receipt.artifactManifestSha256 || '')
    && typeof receipt.artifactManifestPath === 'string'
    && receipt.artifactManifestPath.length > 0
    && Array.isArray(receipt.candidates) && receipt.candidates.length > 0
    && (['planned', 'validated'].includes(receipt.phase) || releasePublicationHasStarted(receipt));
}

export function assertReleaseHeadOnMainline({ cwd, head, upstream, upstreamHead, allowContained = false }) {
  if (!allowContained) {
    if (head !== upstreamHead) throw new Error(`Release HEAD ${head} does not exactly match ${upstream} ${upstreamHead}`);
    return;
  }
  const contained = spawnSync('git', ['merge-base', '--is-ancestor', head, upstreamHead], { cwd });
  if (contained.error) throw contained.error;
  if (contained.status !== 0) throw new Error(`Release HEAD ${head} is not contained in ${upstream} ${upstreamHead}`);
}
