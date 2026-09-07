import { parseReleaseVersion } from "./release-package-state.mjs";

export function releaseDistTagsMatch({ policy, actualTags }) {
  if (actualTags?.latest !== policy.latest) return false;
  if (policy.stable && actualTags?.[policy.stable.tag] !== policy.stable.version) return false;
  if (
    policy.prerelease &&
    actualTags?.[policy.prerelease.tag] !== policy.prerelease.version
  ) {
    return false;
  }
  return true;
}

export function releaseChannelPolicy({ candidateVersion, prereleaseTag, priorTags }) {
  const prerelease = parseReleaseVersion(candidateVersion).pre;
  if (!prerelease.length) {
    return { latest: candidateVersion, prerelease: null, stable: { tag: 'v2', version: candidateVersion } };
  }
  if (!prereleaseTag || prerelease[0] !== prereleaseTag) {
    throw new Error(
      `Release ${candidateVersion} does not belong to the configured ${prereleaseTag || "missing"} prerelease channel`
    );
  }
  const priorLatest = priorTags?.latest;
  const priorLatestPrerelease = priorLatest
    ? parseReleaseVersion(priorLatest).pre
    : [];
  const latest =
    !priorLatest || priorLatestPrerelease[0] === prereleaseTag
      ? candidateVersion
      : priorLatest;
  return {
    latest,
    prerelease: { tag: prereleaseTag, version: candidateVersion },
  };
}

export function releaseDistTagsAreRecoverable({
  candidateVersion,
  prereleaseTag,
  priorTags,
  actualTags,
  candidatePublished,
}) {
  const names = new Set([
    ...Object.keys(priorTags || {}),
    ...Object.keys(actualTags || {}),
  ]);
  for (const name of names) {
    const prior = priorTags?.[name];
    const actual = actualTags?.[name];
    if (!candidatePublished) {
      if (actual !== prior) return false;
      continue;
    }
    if (name === "latest" || name === prereleaseTag || (name === 'v2' && !parseReleaseVersion(candidateVersion).pre.length)) {
      if (actual !== prior && actual !== candidateVersion) return false;
      continue;
    }
    if (actual !== prior) return false;
  }
  return true;
}
