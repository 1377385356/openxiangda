import { readFileSync } from "node:fs";

export function assertReferenceLockArtifactIntegrities(lockPath, artifacts) {
  const source = readFileSync(lockPath, "utf8");
  let checked = 0;
  for (const artifact of artifacts) {
    const actual = packageIntegrity(
      source,
      `${artifact.name}@${artifact.version}`
    );
    if (!actual) continue;
    checked += 1;
    if (actual !== artifact.integrity) {
      throw new Error(
        `REFERENCE_LOCK_ARTIFACT_INTEGRITY_MISMATCH: ${artifact.name}@${artifact.version}`
      );
    }
  }
  return { checked };
}

export function packageIntegrity(source, packageKey) {
  const escaped = packageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^  ['\"]?${escaped}['\"]?:\\s*$`, "m").exec(
    source
  );
  if (!header) return null;
  const entryStart = header.index + header[0].length;
  const nextEntryOffset = /^  \S[^\n]*:\s*$/m.exec(source.slice(entryStart));
  const entryEnd = nextEntryOffset
    ? entryStart + nextEntryOffset.index
    : source.length;
  const entry = source.slice(entryStart, entryEnd);
  const resolution =
    /^    resolution:\s*\{[^}\n]*integrity:\s*([^,}\s]+)[^}\n]*\}\s*$/m.exec(
      entry
    );
  return resolution?.[1]?.replace(/^['\"]|['\"]$/g, "") || null;
}
