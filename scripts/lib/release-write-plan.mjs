export function orderReleaseCandidates(candidates, manifests) {
  const selected = new Map(candidates.map(value => [value.name, value]));
  const byName = new Map(manifests.map(value => [value.name, value]));
  const done = new Set(), visiting = new Set(), result = [];
  function visit(name) {
    if (done.has(name) || !selected.has(name)) return;
    if (visiting.has(name)) throw new Error(`RELEASE_PACKAGE_DEPENDENCY_CYCLE:${name}`);
    const manifest = byName.get(name);
    if (!manifest) throw new Error(`RELEASE_PACKAGE_MANIFEST_MISSING:${name}`);
    visiting.add(name);
    for (const dependency of Object.keys({...manifest.dependencies, ...manifest.optionalDependencies}).sort()) visit(dependency);
    visiting.delete(name); done.add(name); result.push(selected.get(name));
  }
  const names = [...selected.keys()].filter(name => name !== 'openxiangda').sort();
  for (const name of names) visit(name);
  visit('openxiangda');
  if (selected.has('openxiangda') && result.at(-1)?.name !== 'openxiangda') throw new Error('RELEASE_ROOT_MUST_BE_LAST');
  return result;
}

export function releaseDistTagPlan(candidate) {
  const policy = candidate.channelPolicy;
  const targets = [...(policy.prerelease ? [policy.prerelease] : []), ...(policy.stable ? [policy.stable] : []), {tag:'latest', version:policy.latest}];
  return targets.map(({tag, version}) => ({tag, priorVersion:candidate.priorTags?.[tag] ?? null, targetVersion:version}));
}

export function pendingReleaseDistTags(candidate, actualTags) {
  const plan = releaseDistTagPlan(candidate);
  if (candidate.channelPlan && JSON.stringify(candidate.channelPlan) !== JSON.stringify(plan)) throw new Error(`RELEASE_CHANNEL_PLAN_MISMATCH:${candidate.name}`);
  return plan.filter(entry => {
    const actual = actualTags?.[entry.tag] ?? null;
    if (actual === entry.targetVersion) return false;
    if (actual !== entry.priorVersion) throw new Error(`RELEASE_CHANNEL_DRIFT:${candidate.name}:${entry.tag}`);
    return true;
  });
}
